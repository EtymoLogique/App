import { useState } from 'react'

import type { CadeauEtat, CodeQueteInitiale, QueteInitialeEtat, ReponseQueteInitiale, CarteDeLecteurEtat, Etat, QueteDuJour, RecompenseQuete, ReponseCadeau, ReponseCarteDeLecteur, ReponseJalon, ReponsePalier, ReponseQueteDuJour } from '../contrat'
import type { EntreeCodex } from '../services/codex'
import { type CatalogueJeu, libelleFascicule } from '../services/jeu'
import { briquesDuPli, chances, LIBELLES_RARETES, pourcentage } from '../services/plis'
import { sensLitteral } from '../services/ricochets'
import { type PalierSuivi, type QueteJalon, type QueteLongue, SORTES, quetesAuLongCours, quetesDeFascicule } from '../services/quetes'
import type { OngletQuetes, Route } from '../services/route'
import { PetiteBrique } from './Brique'
import { SelecteurFascicules, TitreFascicule } from './Fascicules'
import { Icone } from './Icone'
import { Sablier } from './Sabliers'

const ONGLETS: [OngletQuetes, string][] = [
  ['journalieres', 'Journalières'],
  ['ponctuelles', 'Ponctuelles'],
  ['fascicules', 'Fascicules'],
  ['au-long-cours', 'Au long cours'],
]

type Destination = 'table' | 'ricochets' | 'journalieres'
const LIBELLES_DESTINATION: Record<Destination, string> = { table: 'Aller à la table', ricochets: 'Faire des ricochets', journalieres: 'Voir les quêtes du jour' }

/** Mène à l'endroit où la quête progresse. */
function BoutonAller({ vers, onAller }: { vers: Destination; onAller: (d: Destination) => void }) {
  return (
    <button type="button" className="btn btn-secondary btn-s" onClick={() => onAller(vers)}>
      {LIBELLES_DESTINATION[vers]}
    </button>
  )
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

/** Récompense d'un jalon, annoncée d'avance : briques du pli de jalon et sabliers. */
function Recompense({ quete, jeu }: { quete: QueteJalon; jeu: CatalogueJeu }) {
  const sabliers = quete.jalon.sabliers ?? 0
  return (
    <span className="quete-recompense">
      {(quete.jalon.pli ?? []).map((id) => {
        const b = jeu.briques.get(id)
        return b ? <PetiteBrique key={id} brique={b} /> : null
      })}
      {sabliers > 0 && (
        <span className="quete-sabliers">
          <Sablier />
          {pluriel(sabliers, 'sablier')}
        </span>
      )}
    </span>
  )
}

/** Libellé d'une récompense pour un message : « philo-, -iste et 2 sabliers ». */
function texteRecompense(quete: QueteJalon, jeu: CatalogueJeu): string {
  const parts = (quete.jalon.pli ?? []).flatMap((id) => jeu.briques.get(id)?.libelle ?? [])
  if ((quete.jalon.sabliers ?? 0) > 0) parts.push(pluriel(quete.jalon.sabliers ?? 0, 'sablier'))
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}` : (parts[0] ?? '')
}

interface CarteProps {
  quete: QueteJalon
  jeu: CatalogueJeu
  inactif: string | null
  recuperer: (jalon: string) => Promise<ReponseJalon | { erreur: string }>
  onAller?: (d: Destination) => void
}

/** Un jalon : seuil, progression, récompense et, une fois atteint, le bouton pour la récupérer. */
function CarteJalon({ quete, jeu, inactif, recuperer, onAller }: CarteProps) {
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<{ texte: string; ton: 'win' | 'fail' } | null>(null)
  const { jalon, etat, avancee } = quete
  const seuil = `${pluriel(jalon.decouvertes, 'découverte')}`
  const agir = async () => {
    setEnCours(true)
    const reponse = await recuperer(jalon.id)
    setEnCours(false)
    setMessage('erreur' in reponse ? { texte: reponse.erreur, ton: 'fail' } : { texte: `Récompense ajoutée\u00a0: ${texteRecompense(quete, jeu)}.`, ton: 'win' })
  }
  return (
    <li className="quete" data-etat={etat}>
      <div className="quete-tete">
        <b className="quete-seuil">{seuil}</b>
        <span className="quete-avancee">
          {etat === 'recupere' ? '✓ Récupérée' : etat === 'a_recuperer' ? '✓ Atteint' : `${avancee} / ${jalon.decouvertes}`}
        </span>
      </div>
      <span
        className="fam-bar is-jalon"
        role="progressbar"
        aria-label="Mots du fascicule découverts pour ce jalon"
        aria-valuemin={0}
        aria-valuemax={jalon.decouvertes}
        aria-valuenow={avancee}
      >
        <i style={{ width: `${(avancee / jalon.decouvertes) * 100}%` }} />
      </span>
      <div className="quete-pied">
        <span className="quete-k">Récompense</span>
        <Recompense quete={quete} jeu={jeu} />
        {etat === 'a_recuperer' && (
          <button type="button" className="btn btn-primary btn-s" onClick={() => void agir()} disabled={enCours || inactif !== null} title={inactif ?? undefined}>
            {enCours ? 'Récupération…' : 'Récupérer'}
          </button>
        )}
        {etat === 'en_cours' && onAller && <BoutonAller vers="table" onAller={onAller} />}
      </div>
      {message && (
        <p className="feedback" data-tone={message.ton} role="status">
          {message.texte}
        </p>
      )}
    </li>
  )
}

/** Libellé d'une récompense de palier : « 20 gouttes d’encre et 1 sablier ». */
function texteRecompensePalier({ palier }: PalierSuivi): string {
  const parts = []
  if ((palier.encre ?? 0) > 0) parts.push(`${palier.encre} goutte${(palier.encre ?? 0) > 1 ? 's' : ''} d’encre`)
  if ((palier.sabliers ?? 0) > 0) parts.push(pluriel(palier.sabliers ?? 0, 'sablier'))
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} et ${parts.at(-1)}` : (parts[0] ?? '')
}

interface PalierProps {
  suivi: PalierSuivi
  inactif: string | null
  recuperer: (palier: string) => Promise<ReponsePalier | { erreur: string }>
  onAller?: (d: Destination) => void
}

/** Un palier : seuil, progression, récompense annoncée d'avance et, une fois atteint, le bouton pour la récupérer. */
function CartePalier({ suivi, inactif, recuperer, onAller }: PalierProps) {
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<{ texte: string; ton: 'win' | 'fail' } | null>(null)
  const { palier, etat, avancee } = suivi
  const agir = async () => {
    setEnCours(true)
    const reponse = await recuperer(palier.id)
    setEnCours(false)
    setMessage('erreur' in reponse ? { texte: reponse.erreur, ton: 'fail' } : { texte: `Récompense ajoutée\u00a0: ${texteRecompensePalier(suivi)}.`, ton: 'win' })
  }
  return (
    <li className="quete" data-etat={etat}>
      <div className="quete-tete">
        <b className="quete-seuil">{palier.seuil}</b>
        <span className="quete-avancee">{etat === 'recupere' ? '✓ Récupérée' : etat === 'a_recuperer' ? '✓ Atteint' : `${avancee} / ${palier.seuil}`}</span>
      </div>
      <span className="fam-bar is-jalon" role="progressbar" aria-label="Progression vers ce palier" aria-valuemin={0} aria-valuemax={palier.seuil} aria-valuenow={avancee}>
        <i style={{ width: `${(avancee / palier.seuil) * 100}%` }} />
      </span>
      <div className="quete-pied">
        <span className="quete-k">Récompense</span>
        <span className="quete-recompense">
          {(palier.encre ?? 0) > 0 && <span className="quete-sabliers">{palier.encre} goutte{(palier.encre ?? 0) > 1 ? 's' : ''} d’encre</span>}
          {(palier.sabliers ?? 0) > 0 && (
            <span className="quete-sabliers">
              <Sablier />
              {pluriel(palier.sabliers ?? 0, 'sablier')}
            </span>
          )}
        </span>
        {etat === 'a_recuperer' && (
          <button type="button" className="btn btn-primary btn-s" onClick={() => void agir()} disabled={enCours || inactif !== null} title={inactif ?? undefined}>
            {enCours ? 'Récupération…' : 'Récupérer'}
          </button>
        )}
        {etat === 'en_cours' && onAller && <BoutonAller vers="table" onAller={onAller} />}
      </div>
      {message && (
        <p className="feedback" data-tone={message.ton} role="status">
          {message.texte}
        </p>
      )}
    </li>
  )
}

/** Une quête au long cours : sa consigne, ce qu'elle a déjà compté et ses paliers. */
function CarteQuete({ longue, inactif, recuperer, onAller }: { longue: QueteLongue; inactif: string | null; recuperer: PalierProps['recuperer']; onAller?: PalierProps['onAller'] }) {
  return (
    <li className="quete-longue">
      <div className="quete-longue-tete">
        <h3 className="quete-longue-titre">{longue.titre}</h3>
        {longue.ouverte && <b className="quete-avancee">{longue.progression}</b>}
      </div>
      {longue.consigne && <p className="cb-note">{longue.consigne}</p>}
      {!longue.ouverte && <p className="cb-note">Cette quête s’ouvrira avec sa mécanique&nbsp;: elle ne compte rien pour l’instant.</p>}
      <ol className="quetes-liste">
        {longue.paliers.map((suivi) => (
          <CartePalier key={suivi.palier.id} suivi={suivi} inactif={inactif} recuperer={recuperer} onAller={longue.ouverte ? onAller : undefined} />
        ))}
      </ol>
    </li>
  )
}

/** Consigne d'une quête du jour (ADR 0045) : le serveur ne donne que le code, le texte vient d'ici. */
function consigne(q: QueteDuJour, jeu: CatalogueJeu): string {
  switch (q.code) {
    case 'table_sens': {
      const sens = q.mot_id ? sensLitteral(jeu, q.mot_id) : null
      return sens ? `Trouvez le mot qui veut dire «\u00a0${sens}\u00a0».` : 'Trouvez le mot que votre réserve permet de former.'
    }
    case 'memoire_sans_faute':
      return 'Cinq ricochets sans faute.'
    case 'memoire_litteral':
      return 'Retrouvez trois mots par leur sens littéral.'
    case 'memoire_maitrise':
      return 'Maîtrisez une carte.'
    case 'adresse_decouper':
      return 'Découpez trois mots sans erreur.'
    case 'adresse_paires':
      return 'Reliez quatre paires sans faute.'
    default:
      return 'Quête du jour.'
  }
}

/** « 5 gouttes d’encre », « un sablier », « un pli de lecteur » : la récompense d'une quête du jour. */
function texteRecompenseQuete(r: RecompenseQuete): string {
  const parts = []
  if (r.gouttes > 0) parts.push(`${pluriel(r.gouttes, 'goutte')} d’encre`)
  if (r.sabliers > 0) parts.push(pluriel(r.sabliers, 'sablier'))
  if (r.plis > 0) parts.push(r.plis > 1 ? `${r.plis} plis à ouvrir` : 'un pli à ouvrir')
  return parts.join(' · ')
}

type RecupererQueteDuJour = (jour: string, rang: number) => Promise<ReponseQueteDuJour | { erreur: string }>

/**
 * Les trois quêtes du jour : un défi de réflexion de chaque sorte, renouvelé à
 * minuit GMT, sans pénalité. Chaque quête faite a sa récompense, annoncée
 * d'avance et à récupérer (ADR 0063) ; une quête faite attend, même au lendemain.
 */
function QuetesDuJourListe({ quetes, jeu, energiePleine, inactif, recuperer, onAller }: { quetes: QueteDuJour[]; jeu: CatalogueJeu; energiePleine: boolean; inactif: string | null; recuperer: RecupererQueteDuJour; onAller: (d: Destination) => void }) {
  const [enCours, setEnCours] = useState<string | null>(null)
  const [message, setMessage] = useState<{ texte: string; ton: 'win' | 'fail' } | null>(null)
  const clef = (q: QueteDuJour) => `${q.jour ?? ''}-${q.rang}`
  // Un pli de plus ne se gagne pas quand l'énergie est pleine : la récompense attend.
  const bloquee = (q: QueteDuJour) => energiePleine && (q.recompense?.plis ?? 0) > 0
  const agir = async (q: QueteDuJour) => {
    if (!q.jour) return
    setEnCours(clef(q))
    const reponse = await recuperer(q.jour, q.rang)
    setEnCours(null)
    setMessage('erreur' in reponse ? { texte: reponse.erreur, ton: 'fail' } : { texte: `Récompense ajoutée\u00a0: ${q.recompense ? texteRecompenseQuete(q.recompense) : ''}.`, ton: 'win' })
  }
  return (
    <>
      <p className="cb-note quetes-intro">
        Chaque jour, un défi de chaque sorte&nbsp;: à la table, de mémoire, d’adresse. Elles se renouvellent à minuit GMT&nbsp;; une quête non faite disparaît sans rien coûter, une quête faite garde sa récompense, et une erreur se recommence aussitôt.
      </p>
      <ol className="quetes-liste">
        {quetes.map((q) => (
          <li key={clef(q)} className="quete" data-etat={q.recuperee ? 'recupere' : q.faite ? 'a_recuperer' : 'en_cours'}>
            <div className="quete-tete">
              <b className="quete-seuil">{consigne(q, jeu)}</b>
              <span className="quete-avancee">{q.recuperee ? '✓ Récupérée' : q.faite ? '✓ Faite' : `${q.progres} / ${q.cible}`}</span>
            </div>
            <div className="quete-pied">
              {q.recompense && (
                <>
                  <span className="quete-k">Récompense</span>
                  <span className="quete-recompense">{texteRecompenseQuete(q.recompense)}</span>
                </>
              )}
              {q.recompense && q.faite && !q.recuperee && (
                <button type="button" className="btn btn-primary btn-s" onClick={() => void agir(q)} disabled={enCours !== null || inactif !== null || bloquee(q)} title={inactif ?? undefined}>
                  {enCours === clef(q) ? 'Récupération…' : 'Récupérer'}
                </button>
              )}
              {!q.faite && <BoutonAller vers={q.sorte === 'table' ? 'table' : 'ricochets'} onAller={onAller} />}
              {q.faite && !q.recuperee && bloquee(q) && <p className="cb-note">Vos plis en attente sont au complet&nbsp;: ouvrez-en un, la récompense vous attend.</p>}
            </div>
          </li>
        ))}
      </ol>
      {message && (
        <p className="feedback" data-tone={message.ton} role="status">
          {message.texte}
        </p>
      )}
    </>
  )
}

/** « 24 sept. » : le jour du tampon, espace insécable. */
const jourCourt = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(' ', '\u00a0')

/** Chances du pli de lecteur d'un fascicule : peu communes et rares seulement, la légendaire à sa chance fixe. */
function chancesLecteur(jeu: CatalogueJeu, fascicule: string): string {
  const f = jeu.fascicules.find((x) => x.manifeste.id === fascicule)
  const equilibrage = f?.manifeste.pli?.equilibrage
  if (!f || !equilibrage) return ''
  const briques = briquesDuPli(f).filter((b) => b.rarete !== 'commune')
  const { parRarete } = chances(briques, equilibrage)
  return (['peu_commune', 'rare', 'legendaire'] as const)
    .filter((r) => parRarete[r] > 0)
    .map((r) => `${LIBELLES_RARETES[r]}\u00a0${pourcentage(parRarete[r])}`)
    .join(' · ')
}

/**
 * Carte de lecteur (ADR 0045) : un tampon par jour où les trois quêtes sont
 * faites, sans série ni rappel. Pleine, elle offre un pli de lecteur dont le
 * joueur choisit le fascicule, chances affichées.
 */
function CarteDeLecteur({ carte, jeu, inactif, recuperer }: { carte: CarteDeLecteurEtat; jeu: CatalogueJeu; inactif: string | null; recuperer: (fascicule: string) => Promise<ReponseCarteDeLecteur | { erreur: string }> }) {
  const [fascicule, setFascicule] = useState(jeu.fascicules[0]?.manifeste.id ?? '')
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<{ texte: string; ton: 'win' | 'fail' } | null>(null)
  const { recompense } = carte
  const agir = async () => {
    setEnCours(true)
    const reponse = await recuperer(fascicule)
    setEnCours(false)
    setMessage('erreur' in reponse ? { texte: reponse.erreur, ton: 'fail' } : { texte: `Carte récupérée\u00a0: ${pluriel(recompense.gouttes, 'goutte')} d’encre, ${pluriel(recompense.sabliers, 'sablier')} et un pli de lecteur.`, ton: 'win' })
  }
  return (
    <section className="carte-lecteur" aria-label="Carte de lecteur" data-etat={carte.a_recuperer > 0 ? 'a_recuperer' : 'en_cours'}>
      <div className="quete-tete">
        <h3 className="quete-longue-titre">Carte de lecteur</h3>
        <b className="quete-avancee">{`${carte.tampons.length} / ${carte.taille}`}</b>
      </div>
      <ol className="carte-lecteur-cases">
        {Array.from({ length: carte.taille }, (_, i) => {
          const jour = carte.tampons[i]
          return (
            <li key={i} className={jour ? 'tampon' : 'tampon is-vide'}>
              {jour ? (
                <>
                  <span className="tampon-sceau" aria-hidden="true">ÉL</span>
                  <span className="tampon-jour">{jourCourt(jour)}</span>
                  <span className="sr-only">Tampon du {jourCourt(jour)}</span>
                </>
              ) : (
                <span className="tampon-numero" aria-label={`Case ${i + 1}, vide`}>{i + 1}</span>
              )}
            </li>
          )
        })}
      </ol>
      <p className="cb-note">Un tampon par jour où vos trois quêtes sont faites, sans ordre ni série.</p>
      <div className="quete-pied">
        <span className="quete-k">Récompense</span>
        <span className="quete-recompense">
          {`${pluriel(recompense.gouttes, 'goutte')} d’encre · ${pluriel(recompense.sabliers, 'sablier')} · ${recompense.plis_de_lecteur > 1 ? `${recompense.plis_de_lecteur} plis` : 'un pli'} de lecteur`}
        </span>
      </div>
      {carte.a_recuperer > 0 && (
        <div className="quete-pied">
          {jeu.fascicules.length > 1 && (
            <>
              <label className="quete-k" htmlFor="pli-lecteur-fascicule">Fascicule du pli</label>
              <select id="pli-lecteur-fascicule" value={fascicule} onChange={(e) => setFascicule(e.target.value)}>
                {jeu.fascicules.map((f) => (
                  <option key={f.manifeste.id} value={f.manifeste.id}>
                    {libelleFascicule(f)}
                  </option>
                ))}
              </select>
            </>
          )}
          <p className="cb-note">Chances&nbsp;: {chancesLecteur(jeu, fascicule)}. Sans énergie, hors garanties.</p>
          <button type="button" className="btn btn-primary btn-s" onClick={() => void agir()} disabled={enCours || inactif !== null || !fascicule} title={inactif ?? undefined}>
            {enCours ? 'Récupération…' : 'Récupérer'}
          </button>
        </div>
      )}
      {message && (
        <p className="feedback" data-tone={message.ton} role="status">
          {message.texte}
        </p>
      )}
    </section>
  )
}

/** Cadeau de bienvenue (ADR 0046) : plis au contenu fixé, sabliers et encre, une seule fois. */
function CadeauDeBienvenue({ cadeau, jeu, inactif, recuperer }: { cadeau: CadeauEtat; jeu: CatalogueJeu; inactif: string | null; recuperer: () => Promise<ReponseCadeau | { erreur: string }> }) {
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<{ texte: string; ton: 'win' | 'fail' } | null>(null)
  const agir = async () => {
    setEnCours(true)
    const reponse = await recuperer()
    setEnCours(false)
    setMessage('erreur' in reponse ? { texte: reponse.erreur, ton: 'fail' } : { texte: 'Cadeau de bienvenue récupéré.', ton: 'win' })
  }
  if (cadeau.recupere && !message) return null
  return (
    <section className="quete cadeau" data-etat={cadeau.recupere ? 'recupere' : 'a_recuperer'} aria-label="Cadeau de bienvenue">
      <div className="quete-tete">
        <h2 className="quete-longue-titre">Cadeau de bienvenue</h2>
        <span className="quete-avancee">{cadeau.recupere ? '✓ Récupéré' : '✓ À récupérer'}</span>
      </div>
      <div className="quete-pied">
        <span className="quete-k">Contenu</span>
        <span className="quete-recompense">
          {cadeau.plis.map((id, i) => {
            const b = jeu.briques.get(id)
            return b ? <PetiteBrique key={`${id}-${i}`} brique={b} /> : null
          })}
          {cadeau.sabliers > 0 && (
            <span className="quete-sabliers">
              <Sablier />
              {pluriel(cadeau.sabliers, 'sablier')}
            </span>
          )}
          {cadeau.encre > 0 && <span className="quete-sabliers">{pluriel(cadeau.encre, 'goutte')} d’encre</span>}
        </span>
        {!cadeau.recupere && (
          <button type="button" className="btn btn-primary btn-s" onClick={() => void agir()} disabled={enCours || inactif !== null} title={inactif ?? undefined}>
            {enCours ? 'Récupération…' : 'Récupérer'}
          </button>
        )}
      </div>
      {message && (
        <p className="feedback" data-tone={message.ton} role="status">
          {message.texte}
        </p>
      )}
    </section>
  )
}

const CONSIGNES_INITIALES: Record<CodeQueteInitiale, string> = {
  trois_mots: 'Découvrez trois mots.',
  transformation: 'Découvrez un mot qui porte une transformation.',
  premiers_ricochets: 'Réussissez cinq ricochets sans faute.',
  premiere_carte: 'Remplissez votre première carte de lecteur.',
}

const DESTINATIONS_INITIALES: Record<CodeQueteInitiale, Destination> = {
  trois_mots: 'table',
  transformation: 'table',
  premiers_ricochets: 'ricochets',
  premiere_carte: 'journalieres',
}

function texteRecompenseInitiale({ recompense: r }: QueteInitialeEtat): string {
  const parts = []
  if (r.plis_offerts > 0) parts.push(pluriel(r.plis_offerts, 'pli') + ' offert' + (r.plis_offerts > 1 ? 's' : ''))
  if (r.plis_de_lecteur > 0) parts.push(`${r.plis_de_lecteur > 1 ? `${r.plis_de_lecteur} plis` : 'un pli'} de lecteur`)
  if (r.sabliers > 0) parts.push(pluriel(r.sabliers, 'sablier'))
  if (r.gouttes > 0) parts.push(`${pluriel(r.gouttes, 'goutte')} d’encre`)
  return parts.join(' · ')
}

/**
 * Quêtes initiales de la première semaine (ADR 0046) : faites une seule fois,
 * un acte de réflexion chacune, jamais comptées pour le tampon du jour.
 * Une récompense avec des plis se récupère dans le fascicule choisi.
 */
function QuetesInitiales({ quetes, jeu, inactif, recuperer, onAller }: { quetes: QueteInitialeEtat[]; jeu: CatalogueJeu; inactif: string | null; onAller: (d: Destination) => void; recuperer: (code: CodeQueteInitiale, fascicule: string | null) => Promise<ReponseQueteInitiale | { erreur: string }> }) {
  const [fascicule, setFascicule] = useState(jeu.fascicules[0]?.manifeste.id ?? '')
  const [enCours, setEnCours] = useState<CodeQueteInitiale | null>(null)
  const [message, setMessage] = useState<{ texte: string; ton: 'win' | 'fail' } | null>(null)
  if (quetes.length === 0 || (quetes.every((q) => q.recuperee) && !message)) return null
  const agir = async (q: QueteInitialeEtat) => {
    setEnCours(q.code)
    const avecPlis = q.recompense.plis_offerts + q.recompense.plis_de_lecteur > 0
    const reponse = await recuperer(q.code, avecPlis ? fascicule : null)
    setEnCours(null)
    setMessage('erreur' in reponse ? { texte: reponse.erreur, ton: 'fail' } : { texte: `Récompense ajoutée\u00a0: ${texteRecompenseInitiale(q)}.`, ton: 'win' })
  }
  const attend = quetes.some((q) => q.faite && !q.recuperee && q.recompense.plis_offerts + q.recompense.plis_de_lecteur > 0)
  return (
    <section className="quetes-fascicule" aria-label="Quêtes de la première semaine">
      <h2 className="quetes-titre">Première semaine</h2>
      <p className="cb-note quetes-intro">Quatre défis à faire une seule fois, avec leur récompense annoncée d’avance. Ils ne comptent pas pour le tampon du jour.</p>
      <ol className="quetes-liste">
        {quetes.map((q) => (
          <li key={q.code} className="quete" data-etat={q.recuperee ? 'recupere' : q.faite ? 'a_recuperer' : 'en_cours'}>
            <div className="quete-tete">
              <b className="quete-seuil">{CONSIGNES_INITIALES[q.code]}</b>
              <span className="quete-avancee">{q.recuperee ? '✓ Récupérée' : q.faite ? '✓ Faite' : `${q.progres} / ${q.cible}`}</span>
            </div>
            <div className="quete-pied">
              <span className="quete-k">Récompense</span>
              <span className="quete-recompense">{texteRecompenseInitiale(q)}</span>
              {q.faite && !q.recuperee && (
                <button type="button" className="btn btn-primary btn-s" onClick={() => void agir(q)} disabled={enCours !== null || inactif !== null || (q.recompense.plis_offerts + q.recompense.plis_de_lecteur > 0 && !fascicule)} title={inactif ?? undefined}>
                  {enCours === q.code ? 'Récupération…' : 'Récupérer'}
                </button>
              )}
              {!q.faite && <BoutonAller vers={DESTINATIONS_INITIALES[q.code]} onAller={onAller} />}
            </div>
          </li>
        ))}
      </ol>
      {attend && (
        <div className="quete-pied">
          <label className="quete-k" htmlFor="pli-initial-fascicule">Fascicule des plis</label>
          <select id="pli-initial-fascicule" value={fascicule} onChange={(e) => setFascicule(e.target.value)}>
            {jeu.fascicules.map((f) => (
              <option key={f.manifeste.id} value={f.manifeste.id}>
                {libelleFascicule(f)}
              </option>
            ))}
          </select>
          <p className="cb-note">Chances d’un pli de lecteur&nbsp;: {chancesLecteur(jeu, fascicule)}. Sans énergie, hors garanties.</p>
        </div>
      )}
      {message && (
        <p className="feedback" data-tone={message.ton} role="status">
          {message.texte}
        </p>
      )}
    </section>
  )
}

interface Props {
  jeu: CatalogueJeu
  etat: Etat | null
  entrees: EntreeCodex[]
  vue: Pick<Route, 'quete' | 'fascicule'>
  onChangerVue: (modif: Partial<Route>, options?: { remplacer?: boolean }) => void
  urlMedia: (chemin: string) => string
  recuperer: (jalon: string) => Promise<ReponseJalon | { erreur: string }>
  recupererPalier: (palier: string) => Promise<ReponsePalier | { erreur: string }>
  recupererCarte: (fascicule: string) => Promise<ReponseCarteDeLecteur | { erreur: string }>
  recupererCadeau: () => Promise<ReponseCadeau | { erreur: string }>
  recupererQueteInitiale: (code: CodeQueteInitiale, fascicule: string | null) => Promise<ReponseQueteInitiale | { erreur: string }>
  recupererQueteDuJour: RecupererQueteDuJour
  /** Raison pour laquelle une récompense ne peut pas être récupérée maintenant (hors ligne), sinon `null`. */
  inactif: string | null
}

/**
 * Quêtes (ADR 0042) : quêtes journalières, bientôt ouvertes, et récompenses
 * de fascicule. Un jalon atteint attend que le joueur vienne chercher sa
 * récompense : rien n'arrive dans la réserve sans qu'il sache d'où cela vient.
 */
export function Quetes({ jeu, etat, entrees, vue, onChangerVue, urlMedia, recuperer, recupererPalier, recupererCarte, recupererCadeau, recupererQueteInitiale, recupererQueteDuJour, inactif }: Props) {
  const quetes = quetesDeFascicule(jeu, etat)
  const aRecuperer = quetes.filter((q) => q.etat === 'a_recuperer')
  const longues = quetesAuLongCours(jeu, etat)
  const paliersARecuperer = longues.flatMap((q) => q.paliers).filter((p) => p.etat === 'a_recuperer').length
  const attente: Record<OngletQuetes, number> = {
    journalieres: (etat?.quetes_du_jour ?? []).filter((q) => q.recompense && q.faite && !q.recuperee).length + (etat?.carte_de_lecteur?.a_recuperer ?? 0) + (etat?.cadeau_de_bienvenue && !etat.cadeau_de_bienvenue.recupere ? 1 : 0),
    ponctuelles: (etat?.quetes_initiales ?? []).filter((q) => q.faite && !q.recuperee).length,
    fascicules: aRecuperer.length,
    'au-long-cours': paliersARecuperer,
  }
  // Sans onglet choisi, le premier onglet où une récompense attend passe devant.
  const onglet = vue.quete ?? ONGLETS.find(([o]) => attente[o] > 0)?.[0] ?? 'journalieres'
  const fascicule = vue.fascicule ?? 'tous'
  const affichees = jeu.fascicules.filter((f) => fascicule === 'tous' || f.numero === fascicule)
  // L'onglet choisi d'office s'inscrit dans l'adresse : récupérer la dernière récompense ne le change pas.
  const fixerOnglet = () => {
    if (vue.quete === null) onChangerVue({ quete: onglet }, { remplacer: true })
  }
  const recupererIci = (jalon: string) => {
    fixerOnglet()
    return recuperer(jalon)
  }
  const recupererPalierIci = (palier: string) => {
    fixerOnglet()
    return recupererPalier(palier)
  }
  const recupererInitialeIci = (code: CodeQueteInitiale, fascicule: string | null) => {
    fixerOnglet()
    return recupererQueteInitiale(code, fascicule)
  }
  const recupererQueteDuJourIci: RecupererQueteDuJour = (jour, rang) => {
    fixerOnglet()
    return recupererQueteDuJour(jour, rang)
  }
  const recupererCadeauIci = () => {
    fixerOnglet()
    return recupererCadeau()
  }
  const recupererCarteIci = (fascicule: string) => {
    fixerOnglet()
    return recupererCarte(fascicule)
  }
  const aller = (d: Destination) => onChangerVue(d === 'journalieres' ? { quete: 'journalieres' } : { onglet: d })
  const inactifIci = inactif ?? (etat ? null : 'Votre partie n’est pas encore chargée.')

  return (
    <div className="quetes">
      <div className="cb-views" role="group" aria-label="Types de quêtes">
        {ONGLETS.map(([o, libelle]) => (
          <button key={o} type="button" aria-pressed={onglet === o} onClick={() => onChangerVue({ quete: o }, { remplacer: true })}>
            {libelle}
            {attente[o] > 0 && (
              <span className="pastille" aria-label={`${pluriel(attente[o], 'récompense')} à récupérer`}>
                {attente[o]}
              </span>
            )}
          </button>
        ))}
      </div>

      {onglet === 'ponctuelles' && (etat?.quetes_initiales ?? []).length > 0 && (
        <QuetesInitiales quetes={etat?.quetes_initiales ?? []} jeu={jeu} inactif={inactifIci} recuperer={recupererInitialeIci} onAller={aller} />
      )}
      {onglet === 'journalieres' && etat?.cadeau_de_bienvenue && (
        <CadeauDeBienvenue cadeau={etat.cadeau_de_bienvenue} jeu={jeu} inactif={inactifIci} recuperer={recupererCadeauIci} />
      )}
      {onglet === 'ponctuelles' ? null : onglet === 'journalieres' ? (
        (etat?.quetes_du_jour ?? []).length > 0 ? (
          <>
            {etat?.carte_de_lecteur && <CarteDeLecteur carte={etat.carte_de_lecteur} jeu={jeu} inactif={inactifIci} recuperer={recupererCarteIci} />}
            <QuetesDuJourListe quetes={etat?.quetes_du_jour ?? []} jeu={jeu} energiePleine={etat ? etat.energie.charges >= etat.energie.capacite : false} inactif={inactifIci} recuperer={recupererQueteDuJourIci} onAller={aller} />
          </>
        ) : (
          <div className="cb-empty quetes-bientot">
            <span className="quetes-ill" aria-hidden="true">
              <Icone nom="quete" />
            </span>
            <p className="cb-empty-k">Pas de quête aujourd’hui</p>
            <p>Les quêtes du jour se tirent à la première visite après minuit GMT, dès que votre partie est chargée.</p>
            {aRecuperer.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={() => onChangerVue({ quete: 'fascicules' }, { remplacer: true })}>
                {aRecuperer.length > 1 ? `Récupérer vos ${aRecuperer.length} récompenses de fascicule` : 'Récupérer votre récompense de fascicule'}
              </button>
            )}
          </div>
        )
      ) : onglet === 'au-long-cours' ? (
        <>
          <p className="cb-note quetes-intro">
            Ces quêtes traversent les fascicules&nbsp;: elles n’expirent jamais et ne repartent jamais à zéro. Chaque récompense est annoncée d’avance, et un mot légendaire n’entre dans aucun décompte.
          </p>
          {longues.length === 0 ? (
            <p className="cb-note">Aucune quête au long cours pour l’instant.</p>
          ) : (
            SORTES.map(({ sorte, titre }) => {
              const siennes = longues.filter((q) => q.quete.sorte === sorte)
              if (siennes.length === 0) return null
              return (
                <section key={sorte} className="quetes-fascicule" aria-label={titre}>
                  <h2 className="quetes-titre">{titre}</h2>
                  <ul className="quetes-longues">
                    {siennes.map((q) => (
                      <CarteQuete key={q.quete.id} longue={q} inactif={inactifIci} recuperer={recupererPalierIci} onAller={aller} />
                    ))}
                  </ul>
                </section>
              )
            })
          )}
        </>
      ) : (
        <>
          <p className="cb-note quetes-intro">
            Découvrez des mots d’un fascicule pour atteindre ses jalons, puis récupérez ici leur récompense. Chaque récompense est annoncée d’avance, jamais tirée au hasard.
          </p>
          <SelecteurFascicules
            jeu={jeu}
            entrees={entrees}
            actif={fascicule}
            onChoisir={(f) => onChangerVue({ fascicule: f === 'tous' ? null : f }, { remplacer: true })}
            urlMedia={urlMedia}
            aRecuperer={(f) => aRecuperer.filter((q) => q.fascicule.numero === f.numero).length}
          />
          {affichees.map((f) => {
            const siennes = quetes.filter((q) => q.fascicule.numero === f.numero)
            return (
              <section key={f.numero} className="quetes-fascicule" aria-label={`Jalons du fascicule ${f.manifeste.nom ?? f.numero}`}>
                <h2 className="quetes-titre">
                  <TitreFascicule fascicule={f} />
                </h2>
                {siennes.length === 0 ? (
                  <p className="cb-note">Aucun jalon pour ce fascicule.</p>
                ) : (
                  <ol className="quetes-liste">
                    {siennes.map((q) => (
                      <CarteJalon key={q.jalon.id} quete={q} jeu={jeu} inactif={inactifIci} recuperer={recupererIci} onAller={aller} />
                    ))}
                  </ol>
                )}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
