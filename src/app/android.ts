type AndroidBridge = {
  readApiKey: () => string | null
  writeApiKey: (value: string | null) => boolean
  setDarkBars: (dark: boolean) => void
}

export const android = (window as Window & { DeepSeekAndroid?: AndroidBridge }).DeepSeekAndroid
