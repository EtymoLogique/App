// Icônes du design système (docs/design-system.html) : trait 1,75, bouts ronds.

const TRACES = {
  table: (
    <>
      <rect x="2.5" y="8" width="7.5" height="8" rx="2" />
      <rect x="14" y="8" width="7.5" height="8" rx="2" />
      <path d="M12 10.8v2.4M10.8 12h2.4" />
    </>
  ),
  codex: (
    <>
      <rect x="7" y="3.5" width="12" height="16" rx="2" />
      <path d="M7 7.5h12" />
      <path d="M4 7v11.5a2 2 0 0 0 2 2h9" />
    </>
  ),
  pli: (
    <>
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  reglages: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  horsLigne: (
    <>
      <path d="M7 18.5h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.2-1.3A4.6 4.6 0 0 0 7 18.5z" />
      <path d="M4 4l16 16" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5h.01" />
    </>
  ),
  verrou: (
    <>
      <rect x="5" y="11" width="14" height="9.5" rx="2" />
      <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
    </>
  ),
} as const

export type NomIcone = keyof typeof TRACES

export function Icone({ nom }: { nom: NomIcone }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {TRACES[nom]}
    </svg>
  )
}
