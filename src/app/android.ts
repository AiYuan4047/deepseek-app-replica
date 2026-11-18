type AndroidBridge = {
  statusInset: () => number
  systemFontScale: () => number
  openAppPermissions: () => void
  openSourcePage: (url: string, dark: boolean, closeLabel: string, browserLabel: string) => void
  readApiKey: () => string | null
  writeApiKey: (value: string | null) => boolean
  readApiConfig: () => string | null
  writeApiConfig: (json: string) => boolean
  /** 当前 API 地址；/dsproxy 请求由原生层转发到它 */
  setApiTarget: (origin: string) => void
  /** 发起原生转发；结果经 __dsApiData / __dsApiEnd 回传 */
  apiBegin: (id: string, method: string, path: string, headersJson: string, body: string) => void
  /** 取消已发起的原生转发 */
  apiCancel: (id: string) => void
  setDarkBars: (dark: boolean) => void
  requestRecentPhotos: () => void
  prefetchRecentPhotos: () => void
  requestHistoryExport: (name: string) => void
  writeHistoryExport: (bytes: string) => boolean
  finishHistoryExport: () => boolean
  beginImageSave: (name: string, mime: string) => boolean
  writeImageSave: (bytes: string) => boolean
  finishImageSave: (keep: boolean) => boolean
  requestRecording: () => void
  finishRecording: (keep: boolean) => boolean
  recordingLevel: () => number
}

export const android = (window as Window & { DeepSeekAndroid?: AndroidBridge }).DeepSeekAndroid

/** 安卓端持久化的 API 配置（除 Key 外，地址/模型/协议） */
export type ApiConfigValue = {
  origin: string
  model: string
  protocol: 'anthropic' | 'openai'
}

export const readApiConfigValue = (): ApiConfigValue | null => {
  const raw = android?.readApiConfig()
  if (!raw) {
    return null
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as ApiConfigValue).origin === 'string' &&
      typeof (value as ApiConfigValue).model === 'string' &&
      ((value as ApiConfigValue).protocol === 'anthropic' ||
        (value as ApiConfigValue).protocol === 'openai')
    ) {
      return value as ApiConfigValue
    }
  } catch {
    // 无法解析时回退默认值
  }
  return null
}

export const writeApiConfigValue = (config: ApiConfigValue): boolean =>
  android ? android.writeApiConfig(JSON.stringify(config)) : false

/**
 * 安卓上 WebView 直连第三方 API 站会先走 OPTIONS 预检，而多数兼容站的预检不返回 2xx，
 * 浏览器直接拒绝带 Authorization 的请求（表现为「网络异常」）。
 * 因此改由原生层异步转发，增量回传后拼成标准 Response 流。
 */
type ProxyState = {
  done: boolean
  stream: ReadableStream<Uint8Array> | null
  settle: (response: Response) => void
  enqueue: (chunk: Uint8Array) => void
  close: () => void
}

const proxyStates = new Map<string, ProxyState>()
let proxySequence = 0

const base64ToBytes = (data: string): Uint8Array => {
  const text = atob(data)
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index++) {
    bytes[index] = text.charCodeAt(index)
  }
  return bytes
}

const nativeCallbacks = {
  __dsApiData: (id: string, data: string) => {
    proxyStates.get(id)?.enqueue(base64ToBytes(data))
  },
  __dsApiEnd: (id: string, status: number, headersJson: string) => {
    const state = proxyStates.get(id)
    if (!state) {
      return
    }
    proxyStates.delete(id)
    state.close()
    let headers = new Headers()
    try {
      headers = new Headers(JSON.parse(headersJson || '{}') as Record<string, string>)
    } catch {
      // 无响应头时仅凭状态码返回
    }
    if (status < 200) {
      state.settle(new Response('The API is unreachable', { status: 502, headers }))
      return
    }
    state.settle(new Response(status === 204 ? null : (state.stream ?? null), {
      status,
      headers,
    }))
  },
}

Object.assign(window, nativeCallbacks)

export const androidApiRequest = async (url: string, init: RequestInit): Promise<Response> => {
  const bridge = android
  const target = /^https?:\/\/[^/]+/.exec(url)?.[0]
  // multipart（Files API 上传）无法转为文本体，保持直连；官方接口预检正常
  if (!bridge || !target || init.body instanceof FormData) {
    return fetch(url, init)
  }
  bridge.setApiTarget(target)
  const id = String(++proxySequence)
  const state: ProxyState = {
    done: false,
    stream: null,
    settle: () => {},
    enqueue: () => {},
    close: () => {},
  }
  proxyStates.set(id, state)
  state.stream = new ReadableStream<Uint8Array>({
    start(controller) {
      state.enqueue = (chunk) => {
        if (!state.done) {
          controller.enqueue(chunk)
        }
      }
      state.close = () => {
        if (!state.done) {
          state.done = true
          controller.close()
        }
      }
    },
  })
  const headers = new Headers(init.headers)
  const headerMap: Record<string, string> = {}
  headers.forEach((value, key) => {
    headerMap[key] = value
  })
  const request = new Promise<Response>((resolve, reject) => {
    state.settle = resolve
    init.signal?.addEventListener(
      'abort',
      () => {
        proxyStates.delete(id)
        bridge.apiCancel(id)
        reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'))
      },
      { once: true }
    )
  })
  bridge.apiBegin(
    id,
    init.method ?? 'GET',
    url.slice(target.length),
    JSON.stringify(headerMap),
    typeof init.body === 'string' ? init.body : ''
  )
  return request
}

const writeAndroidBlob = async (blob: Blob, append: (base64: string) => boolean) => {
  const reader = blob.stream().getReader()
  const chunkSize = 32768
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) {
        return
      }
      for (let offset = 0; offset < value.length; offset += chunkSize) {
        const base64 = btoa(String.fromCharCode(...value.subarray(offset, offset + chunkSize)))
        if (!append(base64)) {
          throw new Error('Unable to write the file')
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export const saveAndroidHistory = async (name: string, blob: Blob) => {
  const device = android
  if (!device) {
    return
  }
  const status = await new Promise<string>((resolve) => {
    window.addEventListener(
      'android-export',
      (event) => resolve((event as CustomEvent<string>).detail),
      { once: true }
    )
    device.requestHistoryExport(name)
  })
  if (status === 'cancelled') {
    return
  }
  if (status !== 'ready') {
    throw new Error('Unable to open the export document')
  }
  let closed = false
  try {
    await writeAndroidBlob(blob, (base64) => device.writeHistoryExport(base64))
    closed = device.finishHistoryExport()
    if (!closed) {
      throw new Error('Unable to close the export document')
    }
  } finally {
    if (!closed) {
      device.finishHistoryExport()
    }
  }
}

export const saveAndroidImage = async (name: string, blob: Blob) => {
  const device = android
  if (!device?.beginImageSave(name, blob.type)) {
    throw new Error('Unable to create the image')
  }
  try {
    await writeAndroidBlob(blob, (base64) => device.writeImageSave(base64))
  } catch (error) {
    device.finishImageSave(false)
    throw error
  }
  if (!device.finishImageSave(true)) {
    throw new Error('Unable to save the image')
  }
}
