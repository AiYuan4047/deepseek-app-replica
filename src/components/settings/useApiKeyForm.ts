import { useState } from 'react'
import { ApiError, verifyApiKey } from '../../services/api/client.js'
import { classifyApiError } from '../../services/api/errors.js'
import { setApiKey, setApiOrigin, setApiProtocol, setModel, useSettings } from '../../services/settings.js'
import { useTranslate } from '../../i18n/index.js'

/** 输入 API 地址 + Key + 模型后先用 GET /models（或 /v1/models）校验，通过才保存 */
export const useApiKeyForm = (onSaved?: () => void) => {
  const t = useTranslate()
  const [origin, setOrigin] = useState(useSettings.getState().apiOrigin)
  const [value, setValue] = useState('')
  const [model, setModelValue] = useState(useSettings.getState().model)
  const [protocol, setProtocol] = useState(useSettings.getState().apiProtocol)
  const [verifying, setVerifying] = useState(false)
  const [failure, setFailure] = useState<{ cause: unknown } | null>(null)
  const cause = failure?.cause
  const error =
    failure === null
      ? null
      : classifyApiError(cause) === 'unauthorized'
        ? t('apiKeyInvalid')
        : classifyApiError(cause) === 'network'
          ? t('commonNetworkErrorToast')
          : t('apiKeyVerificationFailed', {
              message:
                cause instanceof ApiError && cause.localMessage
                  ? t(cause.localMessage.key, cause.localMessage.params)
                  : cause instanceof Error
                    ? cause.message
                    : String(cause),
            })

  const submit = async () => {
    const apiOrigin = origin.trim().replace(/\/+$/, '')
    const apiKey = value.trim() || (useSettings.getState().apiKey ?? '')
    const apiModel = model.trim()
    if (!apiOrigin || !apiKey || !apiModel || verifying) {
      return
    }
    setVerifying(true)
    setFailure(null)
    try {
      await verifyApiKey({ origin: apiOrigin, apiKey, protocol })
      if (!setApiKey(apiKey)) {
        throw new Error(t('apiKeyStorageFailed'))
      }
      setApiOrigin(apiOrigin)
      setApiProtocol(protocol)
      setModel(apiModel)
      setValue('')
      onSaved?.()
    } catch (e) {
      setFailure({ cause: e })
    } finally {
      setVerifying(false)
    }
  }

  return {
    origin,
    setOrigin,
    value,
    setValue,
    model,
    setModelValue,
    protocol,
    setProtocol,
    verifying,
    error,
    submit,
  }
}
