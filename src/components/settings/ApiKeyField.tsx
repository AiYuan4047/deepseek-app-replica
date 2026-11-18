import { useState } from 'react'
import { IconEditOutline16 } from '../base/icons.js'
import { useSettings } from '../../services/settings.js'
import { useIsMobile } from '../../app/viewport.js'
import { IconButton } from '../base/IconButton.js'
import { useApiKeyForm } from './useApiKeyForm.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './Settings.module.css'

/** API 配置的编辑状态：输入框与移动端底部的「确定」按钮共用 */
export const useApiKeyEditor = () => {
  const apiKey = useSettings((state) => state.apiKey)
  const [editing, setEditing] = useState(false)
  const form = useApiKeyForm(() => setEditing(false))
  return { apiKey, editing, setEditing, form, showInput: !apiKey || editing }
}

type ApiKeyEditor = ReturnType<typeof useApiKeyEditor>

/** API 配置：保存后只显示掩码，点编辑按钮才能重新输入地址、Key、模型与协议 */
export const ApiKeyField = ({ editor }: { editor: ApiKeyEditor }) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const { apiKey, editing, setEditing, form, showInput } = editor

  return (
    <div className={styles.cell}>
      <div className={styles.apiKey}>
        <div className={styles.label}>{t('apiKeyStart')}</div>
        {apiKey && !editing ? (
          <div className={styles.apiKeySaved}>
            <span className={styles.apiKeyMask}>{'*'.repeat(apiKey.length)}</span>
            <IconButton
              tone="primary"
              icon={<IconEditOutline16 />}
              tooltip={t('apiKeyEdit')}
              onClick={() => setEditing(true)}
            />
          </div>
        ) : (
          <>
            <div className={styles.protocols} role="radiogroup" aria-label={t('apiProtocolLabel')}>
              <button
                type="button"
                role="radio"
                aria-checked={form.protocol === 'anthropic'}
                aria-pressed={form.protocol === 'anthropic'}
                onClick={() => form.setProtocol('anthropic')}
              >
                {t('apiProtocolAnthropic')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={form.protocol === 'openai'}
                aria-pressed={form.protocol === 'openai'}
                onClick={() => form.setProtocol('openai')}
              >
                {t('apiProtocolOpenAI')}
              </button>
            </div>
            <div className={styles.apiKeyInput}>
              <input
                aria-label={t('apiOriginLabel')}
                type="text"
                placeholder={t('apiOriginPlaceholder')}
                autoComplete="off"
                spellCheck={false}
                value={form.origin}
                onChange={(event) => form.setOrigin(event.target.value)}
              />
            </div>
            <div className={styles.apiKeyInput}>
              <input
                type="password"
                placeholder={t('apiKeyPlaceholder')}
                autoComplete="off"
                spellCheck={false}
                value={form.value}
                onChange={(event) => form.setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    void form.submit()
                  }
                }}
                onBlur={() => {
                  // 修改时没输入就离开，回到已保存的状态
                  if (apiKey && !form.value.trim()) {
                    setEditing(false)
                  }
                }}
              />
            </div>
            <div className={styles.apiKeyInput}>
              <input
                aria-label={t('modelLabel')}
                type="text"
                placeholder={t('modelPlaceholder')}
                autoComplete="off"
                spellCheck={false}
                value={form.model}
                onChange={(event) => form.setModelValue(event.target.value)}
              />
            </div>
            {!isMobile ? (
              <button
                type="button"
                className={styles.confirm}
                disabled={form.verifying}
                // 保持输入框焦点
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void form.submit()}
              >
                {form.verifying ? t('apiKeyVerifying') : t('confirm')}
              </button>
            ) : null}
          </>
        )}
        {showInput && form.error ? <div className={styles.error}>{form.error}</div> : null}
      </div>
    </div>
  )
}

/** 移动端：输入 API 配置时在选项下方显示整行「确定」 */
export const ApiKeyConfirm = ({ editor: { apiKey, showInput, form } }: { editor: ApiKeyEditor }) => {
  const t = useTranslate()
  const ready = form.origin.trim() && form.model.trim() && (form.value.trim() || Boolean(apiKey))
  return showInput && ready ? (
    <button
      type="button"
      className={styles.mobileConfirm}
      disabled={form.verifying}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => void form.submit()}
    >
      {form.verifying ? t('apiKeyVerifying') : t('confirm')}
    </button>
  ) : null
}
