import { translate, type TranslationMessage } from '../../i18n/index.js'
import { streamOpenAIMessage } from './openai.js'
import { readMessageEvent } from './parseEvent.js'
import { readServerSentEvents } from './sse.js'
import type {
  ApiErrorBody,
  CreateMessageRequest,
  FileObject,
  FilePurpose,
  MessageStreamEvent,
} from './types.js'

/** 运行时 API 配置，由设置界面提供，覆盖 DeepSeek 官方默认值。 */
export type ApiConfig = {
  origin: string
  apiKey: string
  model: string
  protocol: 'anthropic' | 'openai'
}

/** Anthropic 兼容接口的前缀 */
const anthropicBaseUrl = (origin: string) => `${origin}/anthropic/v1`
/** 引用 Files API 上传的图片、调用 Anthropic 兼容 Files API 时必须携带 */
const FILES_BETA = 'files-api-2025-04-14'

export type ApiErrorKind =
  /** 非 2xx 响应 */
  | 'http'
  /** 流中返回的错误帧（如等待生成超时），随后连接关闭 */
  | 'stream'
  /** 请求没有到达服务端（断网、跨域被拦截等） */
  | 'network'
  /** 流在 message_stop 之前结束 */
  | 'interrupted'
  /** 响应不符合协议（如非 SSE 响应） */
  | 'protocol'

export class ApiError extends Error {
  readonly localMessage?: TranslationMessage

  constructor(
    readonly kind: ApiErrorKind,
    message: string | TranslationMessage,
    readonly status?: number
  ) {
    super(typeof message === 'string' ? message : translate(message.key, message.params))
    this.name = 'ApiError'
    this.localMessage = typeof message === 'string' ? undefined : message
  }
}

const isErrorBody = (value: unknown): value is ApiErrorBody =>
  typeof value === 'object' &&
  value !== null &&
  'error' in value &&
  typeof (value as ApiErrorBody).error?.message === 'string'

const readErrorResponse = async (
  response: Response,
  kind: 'http' | 'protocol' = 'http',
  fallback = response.statusText
): Promise<ApiError> => {
  const text = await response.text().catch(() => '')
  let message = text || fallback
  try {
    const body: unknown = JSON.parse(text)
    if (isErrorBody(body)) {
      message = body.error.message
    }
  } catch {
    // 非 JSON 响应体直接展示原文
  }
  return new ApiError(kind, message, response.status)
}

export const request = async (url: string, init: RequestInit): Promise<Response> => {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (init.signal?.aborted) {
      throw error
    }
    throw new ApiError('network', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    throw await readErrorResponse(response)
  }
  return response
}

const anthropicHeaders = (apiKey: string, beta: boolean): Record<string, string> => ({
  // DeepSeek 兼容接口的鉴权方式，也可使用 Authorization: Bearer。
  'x-api-key': apiKey,
  // Files API 和通过 file_id 引用图片时必传；纯文本聊天无需携带。
  ...(beta ? { 'anthropic-beta': FILES_BETA } : {}),
})

/** 用 GET /models（Anthropic 模式）或 GET /v1/models（OpenAI 模式，回退 /models）校验配置（不产生费用） */
export const verifyApiKey = async (
  config: Pick<ApiConfig, 'origin' | 'apiKey' | 'protocol'>,
  signal?: AbortSignal
): Promise<void> => {
  if (config.protocol === 'openai') {
    try {
      await request(`${config.origin}/v1/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal,
      })
    } catch (error) {
      // 部分兼容站把模型列表放在 /models，404 时回退一次
      if (error instanceof ApiError && error.status === 404) {
        await request(`${config.origin}/models`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${config.apiKey}` },
          signal,
        })
        return
      }
      throw error
    }
    return
  }
  await request(`${config.origin}/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal,
  })
}

/**
 * POST /anthropic/v1/files 上传附件（不设过期时间，会话里的历史附件一直可用）。
 * 仅 Anthropic 协议使用；OpenAI 模式下图片经 base64 内联，不调用 Files API。
 * purpose 为 null 时不传该字段（图片）；purpose 必须排在 file 之前。
 */
export const uploadFile = async (
  config: Pick<ApiConfig, 'origin' | 'apiKey'>,
  file: File,
  purpose: FilePurpose | null,
  signal?: AbortSignal
): Promise<FileObject> => {
  const form = new FormData()
  if (purpose) {
    form.append('purpose', purpose)
  }
  form.append('file', file)
  const response = await request(`${anthropicBaseUrl(config.origin)}/files`, {
    method: 'POST',
    headers: anthropicHeaders(config.apiKey, true),
    body: form,
    signal,
  })
  return (await response.json()) as FileObject
}

/** DELETE /anthropic/v1/files/{file_id} */
export const deleteFile = async (
  config: Pick<ApiConfig, 'origin' | 'apiKey'>,
  fileId: string
): Promise<void> => {
  await request(`${anthropicBaseUrl(config.origin)}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: anthropicHeaders(config.apiKey, true),
  })
}

const hasFile = (body: CreateMessageRequest) =>
  body.messages.some(
    (message) =>
      typeof message.content !== 'string' &&
      message.content.some((block) => block.type === 'image' || block.type === 'document')
  )

/**
 * POST 消息接口（stream: true），按协议分发：Anthropic 走 /anthropic/v1/messages，OpenAI 走 /v1/chat/completions。
 * 逐个产出流式事件，收到 message_stop / [DONE] 时结束。
 * ping、保活注释与无法解析的内容不产出；中止请求时抛出 signal 的 AbortError。
 */
export async function* streamMessage(
  config: ApiConfig,
  body: CreateMessageRequest,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  if (config.protocol === 'openai') {
    yield* streamOpenAIMessage(config.origin, config.apiKey, body, config.model, signal)
    return
  }
  const response = await request(`${anthropicBaseUrl(config.origin)}/messages`, {
    method: 'POST',
    headers: {
      ...anthropicHeaders(config.apiKey, hasFile(body)),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readErrorResponse(response, 'protocol', '')
  }
  for await (const { event: eventName, data } of readServerSentEvents(response.body, signal)) {
    let payload: unknown
    try {
      payload = JSON.parse(data)
    } catch {
      if (eventName !== 'error') {
        continue
      }
    }
    if (isErrorBody(payload)) {
      throw new ApiError('stream', payload.error.message)
    }
    if (eventName === 'error') {
      throw new ApiError('stream', data)
    }
    const event = readMessageEvent(payload)
    if (!event) {
      continue
    }
    yield event
    if (event.type === 'message_stop') {
      return
    }
  }
  // 服务端没有提供错误内容时保持为空，不推测断流原因。
  throw new ApiError('interrupted', '')
}
