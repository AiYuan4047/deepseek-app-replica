import whale from '../../assets/deepseek-whale.svg'
import { useTranslate } from '../../i18n/index.js'
import { useApiKeyForm } from './useApiKeyForm.js'
import styles from './ApiKeyScreen.module.css'

export const ApiKeyScreen = () => {
  const t = useTranslate()
  const form = useApiKeyForm()

  return (
    <main className={styles.page}>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          void form.submit()
        }}
      >
        <img className={styles.whale} src={whale} alt="" />
        <h1>{t('apiKeyStart')}</h1>
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
        <input
          aria-label={t('apiOriginLabel')}
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={t('apiOriginPlaceholder')}
          value={form.origin}
          onChange={(event) => form.setOrigin(event.target.value)}
        />
        <input
          aria-label="DeepSeek API Key"
          aria-invalid={Boolean(form.error)}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder={t('apiKeyPlaceholder')}
          value={form.value}
          onChange={(event) => form.setValue(event.target.value)}
        />
        <input
          aria-label={t('modelLabel')}
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder={t('modelPlaceholder')}
          value={form.model}
          onChange={(event) => form.setModelValue(event.target.value)}
        />
        {form.error ? <div role="alert" className={styles.error}>{form.error}</div> : null}
        <button
          type="submit"
          disabled={form.verifying || !form.origin.trim() || !form.value.trim() || !form.model.trim()}
        >
          {t(form.verifying ? 'apiKeyVerifying' : 'confirm')}
        </button>
        <a href="https://platform.deepseek.com/api_keys">{t('apiKeyGet')}</a>
      </form>
    </main>
  )
}
