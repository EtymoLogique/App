import type { FasciculeParu } from '../App'
import type { LecteurCatalogue } from '../services/catalogue'

const dates = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' })

/** « 1er octobre 2026 » : Intl ne met pas l’ordinal du premier jour. */
function date(iso: string): string {
  const texte = dates.format(new Date(iso))
  return texte.replace(/^1 /, '1er\u00a0')
}

function nombreDeMots(compteurs: unknown): number | undefined {
  if (typeof compteurs !== 'object' || compteurs === null) return undefined
  const mots = (compteurs as Record<string, unknown>).mots
  return typeof mots === 'number' ? mots : undefined
}

interface Props {
  parus: FasciculeParu[]
  catalogue: LecteurCatalogue
}

export function Fascicules({ parus, catalogue }: Props) {
  if (parus.length === 0) return <p>Aucun fascicule n’est encore paru.</p>

  return (
    <ul className="fascicules">
      {parus.map(({ entree, manifeste }) => {
        const mots = nombreDeMots(manifeste.compteurs)
        return (
          <li key={entree.numero} className="fascicule">
            {manifeste.jaquette ? (
              <img
                className="jaquette"
                src={catalogue.url(manifeste.jaquette)}
                alt=""
                width={182}
                height={254}
                decoding="async"
              />
            ) : (
              <div className="jaquette jaquette-absente" aria-hidden="true" />
            )}
            <h2>Fascicule n°&nbsp;{entree.numero}</h2>
            <p className="meta">
              Paru le <time dateTime={entree.parution}>{date(entree.parution)}</time>
              {mots !== undefined && <> · {mots} mots</>}
            </p>
            {manifeste.test && <span className="pastille essai">Essai</span>}
          </li>
        )
      })}
    </ul>
  )
}
