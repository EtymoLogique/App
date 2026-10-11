import { type CSSProperties, type MutableRefObject, memo, useEffect, useRef, useState } from 'react'

import type { Rarete, ReponsePli } from '../contrat'
import { accordLegendaire, mouvementReduit, vibrer } from '../services/animation'
import { type Ligne, ecrireRituel } from '../services/ecriture'
import type { CatalogueJeu } from '../services/jeu'
import { departCanon, rareteMax, tailleGroupe } from '../services/plis'
import { PetiteBrique } from './Brique'
import { Ecrit, Plume } from './Plume'
import { FormeRarete } from './Rarete'

/** Mots des rayons, comme ceux d'un pli ouvert seul (Plis.tsx). */
const MOTS_RAYONS = ['ἔτυμος · etymos', 'αβγδε', 'λόγος · logos', 'ζηθικλ', 'ῥίζα · rhiza', 'μνξοπ', 'γράμμα · gramma', 'ρστυφ', 'ὄνομα · onoma', 'χψω']

const ANNONCES: Partial<Record<Rarete, string>> = { rare: 'Rare !', legendaire: 'Légendaire !' }

interface CelluleEtat {
  /** Classes d'état du rituel, celles d'un pli seul : pk-charging, pk-writing, pk-anticipe, pk-flip, pk-burst, pk-revealed. */
  classe: string
  lignes: Ligne[]
  revele: boolean
}

interface Props {
  jeu: CatalogueJeu
  /** Nombre de plis ouverts : les plis s'affichent, secoués, avant même la réponse du serveur. */
  nombre: number
  /** Réponses du serveur, dans l'ordre des tirages ; `null` tant qu'elles n'arrivent pas. */
  reponses: ReponsePli[] | null
  raretes: ReadonlyMap<string, Rarete>
  jaquette: string | null | undefined
  nom: string
  urlMedia: (chemin: string) => string
  /** Toucher l'écran ou Échap : les pauses et la plume s'arrêtent. */
  passer: MutableRefObject<boolean>
  onEssayer: (brique: string) => void
  /** Tous les plis sont révélés. */
  onFin: () => void
}

/**
 * Ouverture groupée, variante « Canon » : les plis sont en grille et chacun joue le rituel entier d'un pli seul
 * (charge, plume, retournement, révélation), les départs décalés de 0,11 s ; la brique prend la place de son pli.
 * Une rare ou une légendaire a sa plume et ses rayons violets dès l'écriture, et une écriture plus longue.
 */
export function PlisGroupes({ jeu, nombre, reponses, raretes, jaquette, nom, urlMedia, passer, onEssayer, onFin }: Props) {
  const [cellules, setCellules] = useState<CelluleEtat[]>(() => Array.from({ length: nombre }, () => ({ classe: 'pk-charging', lignes: [], revele: false })))
  const [fini, setFini] = useState(false)
  // Valeurs lues par la séquence sans la relancer : seule l'arrivée des réponses la déclenche.
  const courant = useRef({ jeu, raretes, onFin })
  useEffect(() => {
    courant.current = { jeu, raretes, onFin }
  })

  useEffect(() => {
    if (!reponses) return
    let vivant = true
    const pause = (ms: number) => (passer.current || mouvementReduit() || !vivant ? Promise.resolve() : new Promise<void>((fin) => setTimeout(fin, ms)))
    const interrompu = () => passer.current || mouvementReduit()
    const maj = (i: number, f: (c: CelluleEtat) => CelluleEtat) => {
      if (vivant) setCellules((cs) => cs.map((c, k) => (k === i ? f(c) : c)))
    }
    let restants = reponses.length
    const jouer = async (i: number, reponse: ReponsePli) => {
      const id = reponse.ouverture.brique_id
      const { jeu, raretes, onFin } = courant.current
      const rarete = raretes.get(id)
      const haute = rarete === 'rare' || rarete === 'legendaire'
      const anticipe = haute ? ' pk-anticipe' : ''
      // Le pli se secoue déjà depuis l'envoi ; son départ suit celui du pli d'avant, 0,11 s plus tard.
      await pause(departCanon(i) + 250)
      if (!vivant) return
      maj(i, (c) => ({ ...c, classe: `pk-writing${anticipe}` }))
      await ecrireRituel({ jeu, briqueId: id, majLignes: (f) => maj(i, (c) => ({ ...c, lignes: typeof f === 'function' ? f(c.lignes) : f })), pause, interrompu, court: !haute })
      // Une rare s'écrit plus longtemps : la plume vire au violet et laisse le temps de l'attendre.
      if (haute) await pause(600)
      maj(i, (c) => ({ ...c, classe: `pk-flip${anticipe}` }))
      await pause(420)
      maj(i, () => ({ classe: 'pk-burst pk-revealed', lignes: [], revele: true }))
      if (!vivant) return
      if (rarete === 'legendaire') accordLegendaire()
      restants -= 1
      if (restants === 0) {
        setFini(true)
        vibrer(20)
        onFin()
      }
    }
    void Promise.all(reponses.map((r, i) => jouer(i, r)))
    return () => {
      vivant = false
    }
  }, [reponses, passer])

  const meilleure = reponses ? rareteMax(reponses.map((r) => raretes.get(r.ouverture.brique_id) ?? 'commune')) : 'commune'
  const annonce = fini ? ANNONCES[meilleure] : undefined
  const ecriture = cellules.some((c) => c.classe.includes('pk-writing'))
  const anticipe = cellules.some((c) => c.classe.includes('pk-anticipe'))

  return (
    <div className="pkg" data-taille={tailleGroupe(nombre)} data-ecriture={ecriture} data-anticipe={anticipe} data-revele={fini} data-rarity={meilleure}>
      <div className="pkg-rays" aria-hidden="true">
        {MOTS_RAYONS.map((mot, i) => (
          <span key={mot} style={{ '--a': `${i * 36 + 21.5}deg` } as CSSProperties}>
            {mot}
          </span>
        ))}
      </div>
      <p className={`pk-kicker pkg-kicker${meilleure === 'commune' || meilleure === 'peu_commune' ? '' : ' is-haute'}`} aria-hidden={annonce ? undefined : true}>
        {annonce && <Ecrit texte={annonce} debut={0} />}
      </p>
      <ul className="pkg-grille" aria-label={`${nombre} plis du fascicule ${nom}`}>
        {/* Moins de plis que prévu (série interrompue) : seuls ceux qui sont ouverts restent. */}
        {(reponses ? cellules.slice(0, reponses.length) : cellules).map((c, i) => {
          const o = reponses?.[i]?.ouverture
          return (
            <Cellule
              key={i}
              cellule={c}
              jeu={jeu}
              ouverture={o}
              exemplaires={reponses?.[i]?.exemplaires}
              rarete={o ? raretes.get(o.brique_id) : undefined}
              jaquette={jaquette}
              urlMedia={urlMedia}
              nom={nom}
              onEssayer={onEssayer}
            />
          )
        })}
      </ul>
    </div>
  )
}

interface CelluleProps {
  cellule: CelluleEtat
  jeu: CatalogueJeu
  ouverture: ReponsePli['ouverture'] | undefined
  exemplaires: number | undefined
  rarete: Rarete | undefined
  jaquette: string | null | undefined
  urlMedia: (chemin: string) => string
  nom: string
  onEssayer: (brique: string) => void
}

const Cellule = memo(function Cellule({ cellule, jeu, ouverture, exemplaires, rarete, jaquette, urlMedia, nom, onEssayer }: CelluleProps) {
  const brique = ouverture ? jeu.briques.get(ouverture.brique_id) : undefined
  const pastille = !ouverture ? '' : ouverture.resultat === 'nouvelle' ? 'nouvelle' : ouverture.resultat === 'doublon' ? `+1 · ×${exemplaires ?? ''}` : 'pleine'
  const decrit = !ouverture || !brique ? '' : ouverture.resultat === 'nouvelle' ? 'nouvelle brique' : ouverture.resultat === 'doublon' ? `+1 exemplaire, ×${exemplaires}` : 'réserve pleine'
  return (
    <li className={['pk-stage', 'pkg-cell', cellule.classe].filter(Boolean).join(' ')}>
      <div className="pk-flash" aria-hidden="true" />
      {!cellule.revele && (
        <div className="pk-pack" aria-hidden="true">
          {(['top', 'bottom'] as const).map((moitie) => (
            <span key={moitie} className={`pk-half ${moitie}`}>
              <span className="pk-face">
                <span className="pk-art">{jaquette && <img src={urlMedia(jaquette)} alt="" decoding="async" />}</span>
                <span className="pk-top">
                  <span className="pk-brand">ÉL</span>
                  ÉtymoLogique · <b>{nom}</b>
                </span>
                <span className="pk-bottom">Une racine inédite</span>
              </span>
            </span>
          ))}
          <span className="pk-seal">ÉL</span>
          <Plume lignes={cellule.lignes} />
        </div>
      )}
      {cellule.revele && ouverture && brique && (
        <button type="button" className={`pkg-carte${rarete === 'rare' || rarete === 'legendaire' ? ' is-haute' : ''}`} aria-label={`${brique.libelle} : ${decrit}. Essayer sur la table`} onClick={() => onEssayer(ouverture.brique_id)}>
          <PetiteBrique brique={brique} />
          <span className="pkg-tag">
            {rarete && <FormeRarete rarete={rarete} />}
            <small className={ouverture.resultat === 'nouvelle' ? 'is-nouvelle' : undefined}>{pastille}</small>
          </span>
        </button>
      )}
    </li>
  )
})
