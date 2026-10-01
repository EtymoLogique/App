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
  // Goutte d'encre au trait : elle prend la couleur du texte, jamais le jaune du pli sur une couleur vive.
  goutte: <path d="M12 3.5c3.6 4.3 6 7.6 6 10.6a6 6 0 0 1-12 0c0-3 2.4-6.3 6-10.6z" />,
  // Ampoule : un indice éclaire une recette.
  indice: (
    <>
      <path d="M9 17.5h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2v1.5h5V16c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" />
    </>
  ),
  // Plateau de briques : la réserve.
  reserve: (
    <>
      <rect x="3" y="4" width="7.5" height="7" rx="2" />
      <rect x="13.5" y="4" width="7.5" height="7" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7" rx="2" />
    </>
  ),
  boutique: (
    <>
      <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
      <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
    </>
  ),
  // Fanion planté : un jalon, une quête à mener.
  quete: (
    <>
      <path d="M6 21V3.5" />
      <path d="M6 4.5h11.5l-2.8 4.25 2.8 4.25H6" />
    </>
  ),
  // Trois traits séparés : ouverts, ils pivotent en croix (styles.css, .navigation-burger).
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
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
