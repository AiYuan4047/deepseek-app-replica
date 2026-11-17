export const AndroidSound = ({ muted }: { muted: boolean }) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinejoin="round"
  >
    <path
      d={muted ? 'M5 7H2.2v10H6l6.8 4.5v-7M8.4 5.6l4.4-3v7.6' : 'M2.2 7v10H6l6.8 4.5v-19L6 7z'}
    />
    <path d="M16 7.7a6.1 6.1 0 0 1 .7 7.9m2.4-10.9a10.3 10.3 0 0 1 1.3 12.6" />
    {muted ? <path d="m1.5 3.2 18.6 18.6" /> : null}
  </svg>
)

export const AndroidCircle = ({ icon }: { icon: 'add' | 'close' | 'voice' | 'keys' }) => (
  <svg
    width="25"
    height="25"
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.9"
  >
    <circle cx="14" cy="14" r="12.9" />
    {icon === 'add' ? <path d="M14 8v12M8 14h12" /> : null}
    {icon === 'close' ? <path d="m10 10 8 8m0-8-8 8" /> : null}
    {icon === 'voice' ? (
      <>
        <circle cx="8.7" cy="14" r="1.5" fill="currentColor" stroke="none" />
        <path d="M12.1 9.6a6.7 6.7 0 0 1 0 8.8m3.8-12a11.6 11.6 0 0 1 0 15.2" />
      </>
    ) : null}
    {icon === 'keys' ? <path d="M8 9h2m3 0h2m3 0h2M8 14h2m3 0h2m3 0h2m-10 5h8" /> : null}
  </svg>
)

export const AndroidAttachment = ({ kind }: { kind: 'camera' | 'gallery' }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    {kind === 'camera' ? (
      <>
        <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
        <circle cx="12" cy="13" r="3.2" />
      </>
    ) : (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="15.8" cy="9" r="1.5" />
        <path d="m4 15 4-4 7 8" />
      </>
    )}
  </svg>
)
