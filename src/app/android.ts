type AndroidBridge = {
  statusInset: () => number
  systemFontScale: () => number
  openAppPermissions: () => void
  openSourcePage: (url: string, dark: boolean, closeLabel: string, browserLabel: string) => void
  readApiKey: () => string | null
  writeApiKey: (value: string | null) => boolean
  setDarkBars: (dark: boolean) => void
  requestRecentPhotos: () => void
  readRecentPhotos: () => string
  requestHistoryExport: (name: string) => void
  writeHistoryExport: (bytes: string) => boolean
  finishHistoryExport: () => boolean
  requestRecording: () => void
  finishRecording: (keep: boolean) => boolean
  recordingLevel: () => number
}

export const android = (window as Window & { DeepSeekAndroid?: AndroidBridge }).DeepSeekAndroid

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
  const reader = blob.stream().getReader()
  const chunkSize = 32768
  let closed = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      for (let offset = 0; offset < value.length; offset += chunkSize) {
        const base64 = btoa(String.fromCharCode(...value.subarray(offset, offset + chunkSize)))
        if (!device.writeHistoryExport(base64)) {
          throw new Error('Unable to write the export document')
        }
      }
    }
    closed = device.finishHistoryExport()
    if (!closed) {
      throw new Error('Unable to close the export document')
    }
  } finally {
    reader.releaseLock()
    if (!closed) {
      device.finishHistoryExport()
    }
  }
}
