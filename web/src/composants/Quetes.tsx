import { useState } from 'react'

import type { Etat, ReponseJalon, ReponsePalier } from '../contrat'
import type { EntreeCodex } from '../services/codex'
import type { CatalogueJeu } from '../services/jeu'
import { type PalierSuivi, type QueteJalon, type QueteLongue, SORTES, quetesAuLongCours, quetesDeFascicule } from '../services/quetes'
import type { OngletQuetes, Route } from '../services/route'
import { PetiteBrique } from './Brique'
import { SelecteurFascicules, TitreFascicule } from './Fascicules'
import { Icone } from './Icone'
import { Sablier } from './Sabliers'

const ONGLETS: [OngletQuetes, string][] = [
  ['journalieres', 'Journalières'],
  ['fascicules', 'Fascicules'],
  ['au-long-cours', 'Au long cours'],
]

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
}

/** Un jalon : seuil, progression, récompense et, une fois atteint, le bouton pour la récupérer. */
function CarteJalon({ quete, jeu, inactif, recuperer }: CarteProps) {
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
}

/** Un palier : seuil, progression, récompense annoncée d'avance et, une fois atteint, le bouton pour la récupérer. */
function CartePalier({ suivi, inactif, recuperer }: PalierProps) {
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
function CarteQuete({ longue, inactif, recuperer }: { longue: QueteLongue; inactif: string | null; recuperer: PalierProps['recuperer'] }) {
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
          <CartePalier key={suivi.palier.id} suivi={suivi} inactif={inactif} recuperer={recuperer} />
        ))}
      </ol>
    </li>
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
  /** Raison pour laquelle une récompense ne peut pas être récupérée maintenant (hors ligne), sinon `null`. */
  inactif: string | null
}

/**
 * Quêtes (ADR 0042) : quêtes journalières, bientôt ouvertes, et récompenses
 * de fascicule. Un jalon atteint attend que le joueur vienne chercher sa
 * récompense : rien n'arrive dans la réserve sans qu'il sache d'où cela vient.
 */
export function Quetes({ jeu, etat, entrees, vue, onChangerVue, urlMedia, recuperer, recupererPalier, inactif }: Props) {
  const quetes = quetesDeFascicule(jeu, etat)
  const aRecuperer = quetes.filter((q) => q.etat === 'a_recuperer')
  const longues = quetesAuLongCours(jeu, etat)
  const paliersARecuperer = longues.flatMap((q) => q.paliers).filter((p) => p.etat === 'a_recuperer').length
  // Sans onglet choisi, les récompenses qui attendent passent devant.
  const onglet = vue.quete ?? (aRecuperer.length > 0 ? 'fascicules' : paliersARecuperer > 0 ? 'au-long-cours' : 'journalieres')
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
  const inactifIci = inactif ?? (etat ? null : 'Votre partie n’est pas encore chargée.')

  return (
    <div className="quetes">
      <div className="cb-views" role="group" aria-label="Types de quêtes">
        {ONGLETS.map(([o, libelle]) => (
          <button key={o} type="button" aria-pressed={onglet === o} onClick={() => onChangerVue({ quete: o }, { remplacer: true })}>
            {libelle}
            {(o === 'fascicules' ? aRecuperer.length : o === 'au-long-cours' ? paliersARecuperer : 0) > 0 && (
              <span className="pastille" aria-label={`${pluriel(o === 'fascicules' ? aRecuperer.length : paliersARecuperer, 'récompense')} à récupérer`}>
                {o === 'fascicules' ? aRecuperer.length : paliersARecuperer}
              </span>
            )}
          </button>
        ))}
      </div>

      {onglet === 'journalieres' ? (
        <div className="cb-empty quetes-bientot">
          <span className="quetes-ill" aria-hidden="true">
            <Icone nom="quete" />
          </span>
          <p className="cb-empty-k">Bientôt disponibles</p>
          <p>Les quêtes journalières arrivent bientôt&nbsp;: chaque jour, de petits défis à relever avec les briques de votre réserve.</p>
          {aRecuperer.length > 0 && (
            <button type="button" className="btn btn-primary" onClick={() => onChangerVue({ quete: 'fascicules' }, { remplacer: true })}>
              {aRecuperer.length > 1 ? `Récupérer vos ${aRecuperer.length} récompenses de fascicule` : 'Récupérer votre récompense de fascicule'}
            </button>
          )}
        </div>
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
                      <CarteQuete key={q.quete.id} longue={q} inactif={inactifIci} recuperer={recupererPalierIci} />
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
                      <CarteJalon key={q.jalon.id} quete={q} jeu={jeu} inactif={inactifIci} recuperer={recupererIci} />
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
