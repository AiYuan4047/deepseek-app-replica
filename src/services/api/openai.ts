import { ApiError, request } from './client.js'
import { readServerSentEvents } from './sse.js'
import type { CreateMessageRequest, MessageStreamEvent } from './types.js'

/**
 * OpenAI 兼容接口（/v1/chat/completions）的请求转换与流解析。
 * 仅覆盖本应用可表达的能力：文本对话；DeepSeek 专有的联网搜索、Files 图片、
 * 深度思考开关等字段在 OpenAI 模式下不发送，reasoning_content 仍映射为思考块展示。
 */

type OpenAIChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string }

type OpenAIChatBody = {
  model: string
  messages: OpenAIChatMessage[]
  stream: true
}

/** 把 Anthropic 兼容的请求体转成 OpenAI 请求体；latest_reminder 与文件块在 OpenAI 模式下无对应，忽略。 */
export const toOpenAIBody = (body: CreateMessageRequest, model: string): OpenAIChatBody => {
  const messages: OpenAIChatMessage[] = []
  if (body.system) {
    messages.push({ role: 'system', content: body.system })
  }
  for (const message of body.messages) {
    if (message.role === 'latest_reminder') {
      continue
    }
    if (message.role === 'user') {
      const text =
        typeof message.content === 'string'
          ? message.content
          : message.content
              .filter((block) => block.type === 'text')
              .map((block) => block.text)
              .join('')
      messages.push({ role: 'user', content: text })
    } else {
      const text = message.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n\n')
      messages.push({ role: 'assistant', content: text })
    }
  }
  return { model, messages, stream: true }
}

type OpenAIDelta = {
  role?: string
  content?: string | null
  reasoning_content?: string | null
}

type OpenAIChunk = {
  id?: string
  model?: string
  choices?: {
    delta?: OpenAIDelta
    finish_reason?: string | null
  }[]
  usage?: {
    input_tokens?: number
    output_tokens?: number
  } | null
}

const toStopReason = (finish: string | null | undefined): MessageStreamEvent | null => {
  switch (finish) {
    case 'stop':
    case 'end_turn':
      return {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
      }
    case 'length':
    case 'max_tokens':
      return {
        type: 'message_delta',
        delta: { stop_reason: 'max_tokens', stop_sequence: null },
      }
    case 'tool_calls':
      return {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use', stop_sequence: null },
      }
    case 'content_filter':
    case 'refusal':
      return {
        type: 'message_delta',
        delta: { stop_reason: 'refusal', stop_sequence: null },
      }
    default:
      return null
  }
}

/** 逐块消费 OpenAI 流的 deltas，映射为 Anthropic 格式的事件序列（供 applyEvent 复用）。 */
const toEvents = (
  chunks: AsyncIterable<OpenAIChunk>,
  id: string,
  model: string
): AsyncGenerator<MessageStreamEvent> => {
  const events: MessageStreamEvent[] = []
  let started = false
  let blockIndex = 0
  let current: 'text' | 'thinking' | null = null
  // 逐块消费，把 deltas 攒成事件序列后一次性吐出
  return (async function* () {
    for await (const chunk of chunks) {
      if (!started) {
        started = true
        events.push({
          type: 'message_start',
          message: { id, model, usage: undefined },
        })
      }
      const choice = chunk.choices?.[0]
      const delta = choice?.delta
      if (!delta) {
        if (choice?.finish_reason) {
          const stop = toStopReason(choice.finish_reason)
          if (stop) {
            events.push(stop)
          }
        }
        continue
      }
      // 思考块：先于正文出现（DeepSeek 官方返回 reasoning_content）
      if (delta.reasoning_content) {
        if (current !== 'thinking') {
          if (current !== null) {
            events.push({ type: 'content_block_stop', index: blockIndex })
          }
          blockIndex += current === null ? 0 : 1
          current = 'thinking'
          events.push({
            type: 'content_block_start',
            index: blockIndex,
            content_block: { type: 'thinking', thinking: '', signature: '' },
          })
        }
        events.push({
          type: 'content_block_delta',
          index: blockIndex,
          delta: { type: 'thinking_delta', thinking: delta.reasoning_content },
        })
      } else if (delta.content) {
        if (current !== 'text') {
          if (current !== null) {
            events.push({ type: 'content_block_stop', index: blockIndex })
          }
          blockIndex += current === null ? 0 : 1
          current = 'text'
          events.push({
            type: 'content_block_start',
            index: blockIndex,
            content_block: { type: 'text', text: '' },
          })
        }
        events.push({
          type: 'content_block_delta',
          index: blockIndex,
          delta: { type: 'text_delta', text: delta.content },
        })
      }
      if (choice?.finish_reason) {
        if (current !== null) {
          events.push({ type: 'content_block_stop', index: blockIndex })
          current = null
        }
        const stop = toStopReason(choice.finish_reason)
        if (stop) {
          events.push(stop)
        }
      }
      while (events.length > 0) {
        yield events.shift() as MessageStreamEvent
      }
    }
    if (!started) {
      started = true
      events.push({
        type: 'message_start',
        message: { id, model, usage: undefined },
      })
    }
    if (current !== null) {
      events.push({ type: 'content_block_stop', index: blockIndex })
    }
    events.push({ type: 'message_stop' })
    while (events.length > 0) {
      yield events.shift() as MessageStreamEvent
    }
  })()
}

/** POST /v1/chat/completions（stream: true），产出 Anthropic 格式事件；[DONE] 后结束。 */
export async function* streamOpenAIMessage(
  origin: string,
  apiKey: string,
  body: CreateMessageRequest,
  model: string,
  signal: AbortSignal
): AsyncGenerator<MessageStreamEvent> {
  const response = await request(`${origin}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(toOpenAIBody(body, model)),
    signal,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw await readError(response)
  }
  const id = response.headers.get('x-request-id') ?? ''
  const chunks = (async function* () {
    for await (const { data } of readServerSentEvents(
      response.body as ReadableStream<Uint8Array>,
      signal
    )) {
      if (data.trim() === '[DONE]') {
        return
      }
      try {
        const parsed: unknown = JSON.parse(data)
        if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
          const error = (parsed as { error?: { message?: string } }).error
          throw new ApiError('stream', error?.message ?? data)
        }
        yield parsed as OpenAIChunk
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
      }
    }
  })()
  yield* toEvents(chunks, id, model)
}

/** OpenAI 接口的错误响应体：{ error: { message, type } }，非 JSON 时展示原文 */
const readError = async (response: Response): Promise<ApiError> => {
  const text = await response.text().catch(() => '')
  try {
    const body: unknown = JSON.parse(text)
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error?: { message?: unknown } }).error?.message === 'string'
    ) {
      return new ApiError('http', (body as { error: { message: string } }).error.message)
    }
  } catch {
    // 非 JSON 响应体直接展示原文
  }
  return new ApiError('http', text || response.statusText, response.status)
}

