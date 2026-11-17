import { useEffect, useRef, useState } from 'react'
import { android } from '../../app/android.js'
import { useTranslate } from '../../i18n/index.js'
import { ACCEPT } from '../../services/attachments.js'
import { AndroidAttachment } from '../base/AndroidIcons.js'
import { IconPaperclipOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import styles from './AndroidAttachments.module.css'

type Photo = { id: string; name: string; type: string }
type Source = 'camera' | 'gallery' | 'files'

export const AndroidAttachments = ({
  open,
  onFiles,
}: {
  open: boolean
  onFiles: (files: File[]) => void
}) => {
  const t = useTranslate()
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const documents = useRef<HTMLInputElement>(null)
  const panel = useRef<HTMLElement>(null)
  const loadingPhoto = useRef(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  useEffect(() => {
    if (panel.current) {
      panel.current.inert = !open
    }
  }, [open])

  useEffect(() => {
    const device = android
    if (!open || !device) {
      return
    }
    const update = () => setPhotos(JSON.parse(device.readRecentPhotos()) as Photo[])
    window.addEventListener('android-photos', update)
    device.requestRecentPhotos()
    return () => window.removeEventListener('android-photos', update)
  }, [open])

  const chooseRecent = async (photo: Photo) => {
    if (loadingPhoto.current) {
      return
    }
    loadingPhoto.current = true
    try {
      const response = await fetch(`/recent/${photo.id}`, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Photo unavailable')
      }
      onFiles([new File([await response.blob()], photo.name, { type: photo.type })])
    } catch {
      showToast({ key: 'uploadParseFailed' })
    } finally {
      loadingPhoto.current = false
    }
  }

  const actions = [
    { kind: 'camera', label: t('androidCamera'), ref: camera, accept: 'image/*' },
    { kind: 'gallery', label: t('androidGallery'), ref: gallery, accept: 'image/*' },
    { kind: 'files', label: t('androidFiles'), ref: documents, accept: ACCEPT },
  ] satisfies { kind: Source; label: string; ref: typeof camera; accept: string }[]

  return (
    <section ref={panel} className={styles.panel} data-open={open} aria-label={t('uploadFile')}>
      <div className={styles.content}>
        {photos.length > 0 ? (
          <div className={styles.recent}>
            {photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                aria-label={photo.name}
                onClick={() => void chooseRecent(photo)}
              >
                <img src={`/thumbnail/${photo.id}`} alt="" loading="lazy" />
                <span aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : null}
        <div className={styles.actions}>
          {actions.map(({ kind, label, ref, accept }) => (
            <div key={kind}>
              <button type="button" onClick={() => ref.current?.click()}>
                {kind === 'files' ? <IconPaperclipOutline16 /> : <AndroidAttachment kind={kind} />}
                {label}
              </button>
              <input
                ref={ref}
                type="file"
                hidden
                accept={accept}
                capture={kind === 'camera' ? 'environment' : undefined}
                multiple={kind !== 'camera'}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? [])
                  event.target.value = ''
                  if (files.length) {
                    onFiles(files)
                  }
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
