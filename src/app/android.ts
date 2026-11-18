type AndroidBridge = {
  statusInset: () => number
  systemFontScale: () => number
  openAppPermissions: () => void
  openSourcePage: (url: string, dark: boolean, closeLabel: string, browserLabel: string) => void
  readApiKey: () => string | null
  writeApiKey: (value: string | null) => boolean
  readApiConfig: () => string | null
  writeApiConfig: (json: string) => boolean
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
