import { type CSSProperties, Fragment, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { Etat, OuverturePli, Rarete, ReponseAchatSablier, ReponsePli, ReponseSablier } from '../contrat'
import { accordLegendaire, basculer, mouvementReduit, useEnergieAnimee, vibrer } from '../services/animation'
import { useMaintenant } from '../services/horloge'
import { useEnLigne } from '../services/reseau'
import { type CatalogueJeu, type FasciculeParu, NATURES, decouvertePossible, libelleFascicule, prochainFascicule } from '../services/jeu'
import {
  LIBELLES_RARETES,
  ORDRE_RARETES,
  briquesDuPli,
  chanceFixe,
  chances,
  compteur,
  duree,
  energieA,
  pliOuvrable,
  pourcentage,
  reserveDuFascicule,
} from '../services/plis'
import { Brique, PetiteBrique } from './Brique'
import { FormeRarete } from './Rarete'
import { Anneau } from './Anneau'
import { RaccourciSabliers } from './Sabliers'

/** Glyphes inventés que la plume essaie avant d'écrire la brique (plis.html). */
const INVENT = Array.from('ꜳꝏƺȣǂꞷʘƨƾȹꭥꝭꜧƕξψϡϟϠѦ')
const au_hasard = <T,>(liste: T[]): T => liste[Math.floor(Math.random() * liste.length)] as T
const bruit = (n: number) => Array.from({ length: n }, () => au_hasard(INVENT)).join('')
const gouttes = (n: number) => `${n} goutte${n > 1 ? 's' : ''}`
const PLAFOND = 5
/** Un rayon sur deux est une ligne écrite : étymons du vocabulaire de la langue, et l'alphabet grec. */
const MOTS_RAYONS = ['ἔτυμος · etymos', 'αβγδε', 'λόγος · logos', 'ζηθικλ', 'ῥίζα · rhiza', 'μνξοπ', 'γράμμα · gramma', 'ρστυφ', 'ὄνομα · onoma', 'χψω']
const VOYELLES = /[aeiouyàâäéèêëîïôöùûüœæαεηιουωάέήίόύώ]/i
/** Coupe syllabique naïve : avant une consonne entre deux voyelles, la plume marque une pause. */
const coupe = (lettres: string[], i: number) =>
  i > 1 && i < lettres.length - 1 && VOYELLES.test(lettres[i - 1] ?? '') && !VOYELLES.test(lettres[i] ?? '') && VOYELLES.test(lettres[i + 1] ?? '')

/** Plis dessinés dans la pile ; au-delà, un chiffre sur fond noir donne le compte. */
const PILE_MAX = 3

/** « 1 / 10 » et le temps restant ; arrêté à 10 / 10 (ADR 0020, 0062). */
function useEnergie(etat: Etat | null) {
  const maintenant = useMaintenant()
  // Des sabliers utilisés font défiler le temps restant au lieu de le faire sauter.
  const { energie: energieEtat, avance } = useEnergieAnimee(etat?.energie, maintenant)
  if (!energieEtat) return { charges: 0, capacite: 10, texte: 'Plis en attente du serveur', progression: 0, restant: undefined, avance: false }
  const { capacite, recharge_s } = energieEtat
  const { charges, prochaine } = energieA(energieEtat, maintenant)
  const reste = prochaine === null ? 0 : prochaine - maintenant
  return {
    charges,
    capacite,
    texte: prochaine === null ? 'Dix plis prêts à être ouverts' : `+1 dans ${duree(reste)}`,
    progression: prochaine === null ? 1 : 1 - reste / (recharge_s * 1000),
    restant: prochaine === null ? undefined : duree(reste),
    avance,
  }
}

/**
 * Plis en attente, en petit : une jaquette par charge prête, un pli en
 * pointillés pour chaque charge en recharge (plis.html, « en recharge »).
 */
function PlisEnAttente({
  charges,
  capacite,
  jaquette,
  urlMedia,
  progression,
  grand = false,
  restant,
  avance = false,
}: {
  charges: number
  capacite: number
  jaquette: string | null | undefined
  urlMedia: (c: string) => string
  /** Avancée de la recharge en cours, de 0 à 1 : dessinée dans le premier pli en pointillés. */
  progression: number
  grand?: boolean
  /** Temps restant avant le prochain pli, écrit sous l'anneau (grand format seulement). */
  restant?: string
  /** Des sabliers font avancer la recharge : la jauge s'entoure d'un halo. */
  avance?: boolean
}) {
  if (grand) {
    // Grand format : les plis prêts s'empilent, suivis d'un pli en pointillés qui porte l'anneau de recharge.
    return (
      <span className="pk-waiting is-grand is-pile" role="img" aria-label={`${charges} pli${charges > 1 ? 's' : ''} prêt${charges > 1 ? 's' : ''} sur ${capacite}`}>
        {Array.from({ length: Math.min(charges, PILE_MAX) }, (_, i) => (
          <span key={i} className="jk-mini is-xs">
            {jaquette && (
              <span className="jk-art">
                <img src={urlMedia(jaquette)} alt="" decoding="async" />
              </span>
            )}
            {charges > PILE_MAX && i === PILE_MAX - 1 && <span className="pk-pile-nb" aria-hidden="true">{charges}</span>}
          </span>
        ))}
        <span className="jk-mini is-xs is-empty">
          <span className="pk-recharge">
            <Anneau progression={progression} avance={avance} />
            {restant && <span className="pk-restant">{restant}</span>}
          </span>
        </span>
      </span>
    )
  }
  return (
    <span className="pk-waiting" role="img" aria-label={`${charges} pli${charges > 1 ? 's' : ''} prêt${charges > 1 ? 's' : ''} sur ${capacite}`}>
      {Array.from({ length: capacite }, (_, i) =>
        i < charges ? (
          <span key={i} className="jk-mini is-xs">
            {jaquette && (
              <span className="jk-art">
                <img src={urlMedia(jaquette)} alt="" decoding="async" />
              </span>
            )}
          </span>
        ) : (
          <span key={i} className="jk-mini is-xs is-empty">
            {i === charges && (
              <span className="pk-recharge">
                <Anneau progression={progression} avance={avance} />
                {grand && restant && <span className="pk-restant">{restant}</span>}
              </span>
            )}
          </span>
        ),
      )}
    </span>
  )
}

/** Carte « Plis en chargement » (I-20), dans l'atelier du pli. */
function CartePlisEnAttente({
  energie,
  jaquette,
  urlMedia,
  children,
}: {
  energie: ReturnType<typeof useEnergie>
  jaquette: string | null | undefined
  urlMedia: (c: string) => string
  /** Raccourci des sabliers, quand le temps manque. */
  children?: ReactNode
}) {
  // Dix plis prêts : rien ne charge, la carte disparaît.
  if (energie.charges >= energie.capacite) return null
  return (
    <div className="pk-card pk-energie">
      <p className="pk-label">Plis en chargement</p>
      <div className="pk-attente" role="status">
        <PlisEnAttente
          charges={energie.charges}
          capacite={energie.capacite}
          jaquette={jaquette}
          urlMedia={urlMedia}
          progression={energie.progression}
          restant={energie.restant}
          avance={energie.avance}
          grand
        />
        <small>{energie.charges} / {energie.capacite} plis prêts</small>
      </div>
      <p className="pk-note">Un pli revient toutes les 12&nbsp;h, et le temps s’arrête quand dix plis vous attendent. Les plis ne limitent jamais les fusions.</p>
      {children}
    </div>
  )
}

function Jaquette({ chemin, urlMedia }: { chemin: string | null | undefined; urlMedia: (c: string) => string }) {
  return (
    <span className={chemin ? 'jk-mini' : 'jk-mini is-empty'} aria-hidden="true">
      {chemin && (
        <span className="jk-art">
          <img src={urlMedia(chemin)} alt="" decoding="async" />
        </span>
      )}
    </span>
  )
}

interface Props {
  jeu: CatalogueJeu
  etat: Etat | null
  /** Fascicule dont l'atelier est ouvert, tenu dans l'adresse. */
  fascicule: string | null
  onChoisir: (fascicule: string | null) => void
  ouvrirPli: (fascicule: string) => Promise<ReponsePli | { erreur: string }>
  utiliserSabliers: (nombre: number) => Promise<ReponseSablier | { erreur: string }>
  acheterEtAvancer: (nombre: number) => Promise<ReponseSablier | ReponseAchatSablier | { erreur: string }>
  /** Brique découverte à poser sur la table. */
  onEssayer: (brique: string) => void
  urlMedia: (chemin: string) => string
  /** Gèle l'encre et les nouveautés affichées pendant le rituel d'ouverture : elles n'arrivent qu'à la révélation. */
  onGeler: (gel: boolean) => void
}

/** Écran des plis (I-19 à I-21) : choisir un fascicule, puis ouvrir son pli. */
export function Plis({ jeu, etat, fascicule, onChoisir, ouvrirPli, utiliserSabliers, acheterEtAvancer, onEssayer, urlMedia, onGeler }: Props) {
  const choisi = jeu.fascicules.find((f) => f.manifeste.id === fascicule)
  const raccourci = <RaccourciSabliers etat={etat} utiliser={utiliserSabliers} acheter={acheterEtAvancer} />
  if (!choisi) return <Choix jeu={jeu} etat={etat} onChoisir={onChoisir} urlMedia={urlMedia} />
  return (
    <Atelier
      key={choisi.manifeste.id}
      jeu={jeu}
      etat={etat}
      fascicule={choisi}
      onRetour={() => onChoisir(null)}
      ouvrirPli={ouvrirPli}
      raccourci={raccourci}
      onEssayer={onEssayer}
      onGeler={onGeler}
      urlMedia={urlMedia}
    />
  )
}

/** Choix du fascicule (I-19) : jaquette, briques connues et exemplaires, pour choisir en connaissance de cause. */
function Choix({
  jeu,
  etat,
  onChoisir,
  urlMedia,
}: {
  jeu: CatalogueJeu
  etat: Etat | null
  onChoisir: (f: string) => void
  urlMedia: (c: string) => string
}) {
  if (jeu.fascicules.length === 0) return <p className="pk-empty">Aucun fascicule n’est encore paru.</p>
  const parus = [...jeu.fascicules].sort((a, b) => b.numero - a.numero)
  const prochain = prochainFascicule(jeu)
  return (
    <div className="pk-chooser">
      <div className="pk-chooser-head">
        <div>
          <h2 className="jk-title">
            Choisir <em>un fascicule</em>
          </h2>
        </div>
        <p className="pk-note">Chaque pli tire une brique parmi celles de son fascicule. Vous pourrez revenir à ce choix à tout moment.</p>
        {prochain && <p className="pk-note prochain-fascicule">{prochain}</p>}
      </div>
      <div className="pk-fasc-list">
        {parus.map((f) => {
          const { connues, exemplaires } = reserveDuFascicule(jeu, etat, f)
          const ouvrable = pliOuvrable(f)
          const total = briquesDuPli(f).length
          const contenu = (
            <>
              <Jaquette chemin={f.manifeste.jaquette} urlMedia={urlMedia} />
              <span className="pk-fasc-info">
                <span className="pk-fasc-k">N°&nbsp;{f.numero}</span>
                <b>{f.manifeste.nom ?? `Fascicule ${f.numero}`}</b>
                <span>
                  {connues === 0 ? 'Aucune brique connue' : `${connues} brique${connues > 1 ? 's' : ''} connue${connues > 1 ? 's' : ''}`} · {exemplaires} exemplaire{exemplaires > 1 ? 's' : ''}
                </span>
                {total > 0 && (
                  <>
                    <span className="pk-fasc-bar" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, (connues / total) * 100)}%` }} />
                    </span>
                    <span className="pk-fasc-count" aria-hidden="true">
                      <b>
                        {connues} / {total}
                      </b>{' '}
                      briques
                    </span>
                  </>
                )}
                <span className="pk-fasc-go">{ouvrable ? 'Ouvrir son pli →' : 'Pli bientôt disponible'}</span>
              </span>
            </>
          )
          return ouvrable ? (
            <button key={f.numero} type="button" className="pk-fasc" aria-label={`${libelleFascicule(f)} : ${connues} brique${connues > 1 ? 's' : ''} connue${connues > 1 ? 's' : ''}${total > 0 ? ` sur ${total}` : ''}, ${exemplaires} exemplaire${exemplaires > 1 ? 's' : ''}. Ouvrir son pli`} onClick={() => onChoisir(f.manifeste.id)}>
              {contenu}
            </button>
          ) : (
            <div key={f.numero} className="pk-fasc is-next">
              {contenu}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type Etape = 'ready' | 'recharging' | 'opening' | 'revealed'

interface Ligne {
  cle: number
  texte: string
  finale: boolean
  nature?: string
  barree?: boolean
  ancienne?: boolean
  encree?: boolean
  saisie: boolean
}

/** Rythme de la plume : lent pour la brique finale, rapide pour un brouillon ou le rituel court. */
interface Rythme {
  lettre: number
  syllabe: number
}

interface AtelierProps {
  jeu: CatalogueJeu
  etat: Etat | null
  fascicule: FasciculeParu
  onRetour: () => void
  ouvrirPli: Props['ouvrirPli']
  raccourci: ReactNode
  /** Brique découverte à poser sur la table. */
  onEssayer: (brique: string) => void
  urlMedia: (c: string) => string
  onGeler: Props['onGeler']
}

/** Atelier du pli (I-20) et rituel d'ouverture (I-21). */
function Atelier({ jeu, etat, fascicule, onRetour, ouvrirPli, raccourci, onEssayer, urlMedia, onGeler }: AtelierProps) {
  const enLigne = useEnLigne()
  const energie = useEnergie(etat)
  const briques = briquesDuPli(fascicule)
  const equilibrage = fascicule.manifeste.pli?.equilibrage
  const ouvrable = pliOuvrable(fascicule) && equilibrage
  const [etape, setEtape] = useState<Etape>('ready')
  /** Pendant le rituel : tête de l'historique au départ (`null` : vide), pour ne rien montrer du nouveau tirage avant la révélation. */
  const [teteGelee, setTeteGelee] = useState<string | null | undefined>(undefined)
  const teteReelle = useRef<string | null>(null)
  /** Pendant le rituel : état d'avant le tirage, pour que garantie, réserve et chances ne trahissent rien avant la révélation. */
  const [etatGele, setEtatGele] = useState<typeof etat | undefined>(undefined)
  /** Temps du rituel : pk-charging, pk-writing, pk-flip, pk-burst (+ pk-revealed) ; pk-anticipe pour une rare ou une légendaire. */
  const [classe, setClasse] = useState('')
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [reponse, setReponse] = useState<ReponsePli | null>(null)
  const [statut, setStatut] = useState('')
  const passer = useRef(false)
  const occupe = useRef(false)
  const scene = useRef<HTMLDivElement>(null)

  const pret = energie.charges > 0 && ouvrable
  const etapeAffichee: Etape = etape === 'ready' && !pret ? 'recharging' : etape

  const pause = useCallback((ms: number) => (passer.current || mouvementReduit() ? Promise.resolve() : new Promise<void>((fin) => setTimeout(fin, ms))), [])

  /**
   * Écriture à un rythme humain : chaque lettre essaie d'abord un glyphe inventé, la plume marque une pause aux
   * syllabes et accélère sur les lettres déjà écrites dans un brouillon (`connues`).
   */
  const ecrire = useCallback(
    async (texte: string, finale: boolean, rythme: Rythme, connues: ReadonlySet<string>, nature?: string) => {
      const cle = Math.random()
      setLignes((ls) => [...ls.map((l) => ({ ...l, ancienne: true })).slice(-2), { cle, texte: '', finale, nature, saisie: true }])
      const lettres = Array.from(texte)
      for (let i = 0; i < lettres.length; i++) {
        if (passer.current || mouvementReduit()) break
        if (coupe(lettres, i)) await pause(rythme.syllabe)
        const vu = lettres.slice(0, i).join('')
        const connue = connues.has((lettres[i] ?? '').toLowerCase())
        if (!connue) {
          setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, texte: vu + au_hasard(INVENT) } : l)))
          await pause(18)
        }
        setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, texte: vu + lettres[i] } : l)))
        await pause(connue ? rythme.lettre / 2 : rythme.lettre)
      }
      setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, texte, saisie: false } : l)))
      return cle
    },
    [pause],
  )

  const ouvrir = useCallback(async () => {
    if (occupe.current || !pret) return
    occupe.current = true
    passer.current = false
    setReponse(null)
    setLignes([])
    setEtape('opening')
    setStatut('Touchez pour passer')
    onGeler(true)
    setTeteGelee(teteReelle.current)
    setEtatGele(etat)
    // La requête part tout de suite ; rien n'est annoncé avant sa réponse.
    const demande = ouvrirPli(fascicule.manifeste.id)
    setClasse('pk-charging')
    const [resultat] = await Promise.all([demande, pause(260)])
    if ('erreur' in resultat) {
      onGeler(false)
      setTeteGelee(undefined)
    setEtatGele(undefined)
      setClasse('')
      setEtape('ready')
      setStatut(resultat.erreur)
      occupe.current = false
      return
    }
    const brique = jeu.briques.get(resultat.ouverture.brique_id)
    const carte = brique ? jeu.cartes.get(brique.uniteId) : undefined
    const etymon = carte?.relations?.find((r) => r.etymon)?.etymon
    const rarete = briques.find((b) => b.id === resultat.ouverture.brique_id)?.rarete
    // Anticipation : une rare ou une légendaire teinte les rayons et la plume dès l'écriture.
    const anticipe = rarete === 'rare' || rarete === 'legendaire' ? ' pk-anticipe' : ''
    setClasse(`pk-writing${anticipe}`)
    const connues = new Set<string>()
    {
      // Glyphes inventés, puis la forme d'origine et sa translittération ; sans étymon, deux essais inventés.
      const origine = [etymon?.forme.texte, etymon?.forme.translitterations?.[0]?.texte].filter((t): t is string => Boolean(t))
      const brouillons = [bruit(4), ...(origine.length > 0 ? origine : [bruit(5)])]
      for (const brouillon of brouillons) {
        const cle = await ecrire(brouillon, false, { lettre: 26, syllabe: 50 }, connues)
        Array.from(brouillon.toLowerCase()).forEach((c) => connues.add(c))
        await pause(60)
        // Rature tracée à la main (.sc-rature, 200 ms).
        setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, barree: true } : l)))
        await pause(170)
      }
    }
    // Seuls préfixes et suffixes s'écrivent dans un cadre de brique coloré ; un mot reste en serif.
    const finale = await ecrire(brique?.libelle ?? '…', true, { lettre: 48, syllabe: 90 }, connues, brique && brique.nature !== 'mot' ? NATURES[brique.nature] : undefined)
    setLignes((ls) => ls.map((l) => (l.cle === finale ? { ...l, encree: true } : l)))
    await pause(130)
    // Le paquet se retourne : il passe sur la tranche, puis la révélation prend sa place en se retournant.
    setClasse(`pk-flip${anticipe}`)
    await pause(420)
    setClasse('pk-burst pk-revealed')
    if (rarete === 'legendaire') accordLegendaire()
    setReponse(resultat)
    setEtape('revealed')
    // Les gouttes, la nouveauté et la ligne d'historique arrivent avec la révélation, pas avant.
    onGeler(false)
    setTeteGelee(undefined)
    const o = resultat.ouverture
    setStatut(
      o.resultat === 'nouvelle'
        ? `Ajoutée à votre réserve et à votre codex · +${gouttes(o.encre)} d’encre`
        : o.resultat === 'reserve_pleine'
          ? `Réserve pleine : +${gouttes(o.encre)} d’encre`
          : `+1 exemplaire : ×${resultat.exemplaires} dans votre réserve · +${gouttes(o.encre)} d’encre`,
    )
    occupe.current = false
  }, [pret, ouvrirPli, fascicule, jeu, etat, briques, pause, ecrire, onGeler])
  // Quitter l'atelier pendant le rituel ne laisse rien de gelé.
  useEffect(() => () => onGeler(false), [onGeler])

  // Entrée du paquet : il se pose, puis le sceau s'imprime (plis.css, à 350 ms) avec une vibration.
  const paquetPose = etape !== 'revealed' && pret
  useEffect(() => {
    if (!paquetPose || mouvementReduit()) return
    const minuteur = setTimeout(() => vibrer(10), 350)
    return () => clearTimeout(minuteur)
  }, [paquetPose])

  // La garantie et la réserve suivent une fois la brique posée (plis.css, atterrissage en 500 ms) : pas avant qu'on la voie.
  useEffect(() => {
    if (etape !== 'revealed') return
    const minuteur = setTimeout(() => setEtatGele(undefined), mouvementReduit() ? 0 : 700)
    return () => clearTimeout(minuteur)
  }, [etape])

  const continuer = () => {
    setEtatGele(undefined)
    if (scene.current) scene.current.scrollTop = 0
    setReponse(null)
    setLignes([])
    setClasse('')
    setEtape('ready')
    setStatut('')
  }

  // Toucher la scène, Échap ou Espace passent le rituel ; la réponse du serveur reste attendue.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (etape === 'opening' && (e.key === 'Escape' || e.key === ' ')) {
        passer.current = true
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [etape])

  const etatVu = etatGele ?? etat
  const decouverts = new Set(etatVu?.decouvertes.map((d) => d.mot_id) ?? [])
  const reserve = new Map(etatVu?.reserve.map((e) => [e.brique_id, e.exemplaires]) ?? [])
  const bloque = etatVu ? !decouvertePossible(jeu, etatVu.reserve, decouverts) : false
  const compteurs = compteur(etatVu, fascicule.manifeste.id)
  const lesChances = equilibrage ? chances(briques, equilibrage) : null
  const inconnues = briques.filter((b) => !reserve.has(b.id))
  const garantie = equilibrage?.garantie_nouveaute ?? 6
  const filet = equilibrage?.filet_utilite ?? 5
  const restantAvantGarantie = Math.max(1, garantie - compteurs.plis_sans_nouveaute)
  const historiqueReel = (etat?.historique_plis ?? []).filter((h) => h.fascicule_id === fascicule.manifeste.id).slice(0, 6)
  const cleTirage = (h: (typeof historiqueReel)[number]) => `${h.ouvert_le}-${h.brique_id}`
  teteReelle.current = historiqueReel[0] ? cleTirage(historiqueReel[0]) : null
  const historique =
    teteGelee === undefined ? historiqueReel : teteGelee === null ? [] : historiqueReel.slice(Math.max(0, historiqueReel.findIndex((h) => cleTirage(h) === teteGelee)))
  // Historique : seule la nouvelle ligne entre, les autres descendent d'un rang. Rien ne bouge à l'arrivée sur l'écran.
  const tete = historique[0] ? cleTirage(historique[0]) : null
  const teteVue = useRef(tete)
  const [arrivee, setArrivee] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (tete === teteVue.current) return
    teteVue.current = tete
    setArrivee(tete)
  }, [tete])
  const nouvelle = arrivee !== null && arrivee === tete
  const nom = fascicule.manifeste.nom ?? `Fascicule ${fascicule.numero}`
  const rareteTiree = reponse ? briques.find((b) => b.id === reponse.ouverture.brique_id)?.rarete : undefined

  const fixe = equilibrage ? chanceFixe(equilibrage) : false
  // Chance fixe : les chances par type se calculent hors légendaires (ADR 0043).
  const parType = (nature: 'prefixe' | 'suffixe' | 'mot') => lesChances?.briques.filter((c) => (c.brique.nature ?? 'mot') === nature && !(fixe && c.brique.rarete === 'legendaire')).reduce((n, c) => n + c.chance, 0) ?? 0
  const visibles = briques.filter((b) => b.rarete !== 'legendaire' || reserve.has(b.id)).length
  const visiblesConnues = briques.filter((b) => reserve.has(b.id)).length
  const legendairesInconnues = lesChances?.briques.filter((c) => c.brique.rarete === 'legendaire' && !reserve.has(c.brique.id)) ?? []

  return (
    <div className="pk-ecran">
      <div className="pk-current">
        <p>
          <span className="pk-label">Pli du fascicule</span> <b>{nom}</b>
        </p>
        <button type="button" className="btn btn-secondary" onClick={onRetour} disabled={etape === 'opening'}>
          ← Changer de fascicule
        </button>
      </div>
      <div className="pk-layout">
        <aside className="pk-side">
          <CartePlisEnAttente energie={energie} jaquette={fascicule.manifeste.jaquette} urlMedia={urlMedia}>
            {raccourci}
          </CartePlisEnAttente>
          <details className="pk-card" open>
            <summary className="pk-label" onClick={basculer}>Derniers tirages</summary>
            <div className="pk-history">
              {historique.length === 0 ? (
                <span className="pk-empty">Aucun pli ouvert pour l’instant.</span>
              ) : (
                <Fragment key={nouvelle ? arrivee : 'repos'}>
                  {historique.map((h, i) => (
                    <Tirage key={`${h.ouvert_le}-${i}`} jeu={jeu} ouverture={h} rarete={briques.find((b) => b.id === h.brique_id)?.rarete} entree={nouvelle ? (i === 0 ? 'nouveau' : 'descend') : undefined} />
                  ))}
                </Fragment>
              )}
            </div>
          </details>
        </aside>

        <div className="pk-centre">
          <div
            ref={scene}
            className={['pk-stage', classe].filter(Boolean).join(' ')}
            data-state={etapeAffichee}
            data-rarity={rareteTiree}
            onClick={() => {
              if (etape === 'opening') passer.current = true
            }}
          >
            <div className="pk-rays" aria-hidden="true">
              {MOTS_RAYONS.map((mot, i) => (
                <span key={mot} style={{ '--a': `${i * 36 + 21.5}deg` } as CSSProperties}>
                  {mot}
                </span>
              ))}
            </div>
            <div className="pk-flash" aria-hidden="true" />
            {etape !== 'revealed' && (
              <button type="button" className="pk-pack" aria-label={`Ouvrir le pli du fascicule ${nom}`} disabled={!enLigne || !pret || etape !== 'ready'} onClick={() => void ouvrir()}>
                {(['top', 'bottom'] as const).map((moitie) => (
                  <span key={moitie} className={`pk-half ${moitie}`}>
                    <span className="pk-face">
                      <span className="pk-art" aria-hidden="true">
                        {fascicule.manifeste.jaquette && <img src={urlMedia(fascicule.manifeste.jaquette)} alt="" decoding="async" />}
                      </span>
                      <span className="pk-top">
                        <span className="pk-brand" aria-hidden="true">
                          ÉL
                        </span>
                        ÉtymoLogique · <b>{nom}</b>
                      </span>
                      <span className="pk-bottom">Une racine inédite</span>
                    </span>
                  </span>
                ))}
                <span className="pk-seal" aria-hidden="true">
                  ÉL
                </span>
                <span className="pk-scribe" aria-hidden="true">
                  {lignes.map((l) => (
                    <span
                      key={l.cle}
                      className={['sc-line', l.finale ? 'final' : '', l.nature ? 'sc-brick' : '', l.ancienne ? 'old' : '', l.encree ? 'inked' : ''].filter(Boolean).join(' ')}
                      data-kind={l.nature}
                    >
                      {l.texte}
                      {l.saisie && <span className="sc-caret" />}
                      {l.barree && (
                        <svg className="sc-rature" viewBox="0 0 100 20" preserveAspectRatio="none">
                          <path pathLength={100} d="M0 14 L100 5 M4 7 L96 15" />
                        </svg>
                      )}
                    </span>
                  ))}
                </span>
              </button>
            )}
            {reponse && <Revelation jeu={jeu} reponse={reponse} onEssayer={onEssayer} onContinuer={continuer} />}
            <p className="pk-tagline" aria-hidden="true">
              {etapeAffichee === 'recharging' ? 'l’encre sèche' : 'une racine attend d’être écrite'}
              {/* Les points s'écrivent l'un après l'autre, en boucle lente. */}
              {[0, 1, 2].map((i) => (
                <span key={i} className="dt" style={{ '--i': i } as CSSProperties}>
                  .
                </span>
              ))}
            </p>
            <p className="pk-status" role="status" aria-live="polite">
              {statut || (etapeAffichee === 'recharging' ? (ouvrable ? `Pli en recharge · ${energie.texte}` : 'Ce pli n’est pas encore disponible') : 'Touchez le pli pour l’ouvrir')}
            </p>
            {etape !== 'revealed' && (
              <div className="pk-actions">
                <button type="button" className="btn btn-primary" disabled={!enLigne || !pret || etape !== 'ready'} onClick={() => void ouvrir()}>
                  {etape === 'opening' ? 'Ouverture…' : pret ? 'Ouvrir le pli' : 'Recharge en cours…'}
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="pk-side">
          <div className="pk-card">
            <p className="pk-label">Garantie</p>
            {/* Un cran par pli sans nouveauté. */}
            <div className="pk-pity" aria-hidden="true">
              {Array.from({ length: garantie }, (_, i) => {
                const pleins = inconnues.length === 0 ? garantie : compteurs.plis_sans_nouveaute
                const plein = i < pleins
                return <i key={`${i}-${plein}`} className={plein ? 'plein' : undefined} style={{ '--i': i } as CSSProperties} />
              })}
            </div>
            <p className="pk-note">
              {inconnues.length === 0
                ? 'Toutes les briques de ce fascicule sont connues : chaque pli donne un exemplaire ou de l’encre.'
                : restantAvantGarantie === 1
                  ? 'Brique nouvelle garantie au prochain pli.'
                  : `Brique nouvelle garantie dans ${restantAvantGarantie} plis au plus.`}
            </p>
            {bloque && (
              <p className="pk-note">
                Aucun mot possible avec votre réserve : filet d’utilité {Math.min(compteurs.plis_sans_utilite, filet)}&nbsp;/&nbsp;{filet}. Une brique utile arrive au plus tard au {filet}ᵉ pli.
              </p>
            )}
          </div>
          {lesChances && (
            <div className="pk-card">
              <p className="pk-label">Chances par rareté</p>
              <div className="pk-odds">
                {ORDRE_RARETES.map((r) => (
                  <span key={r} className="pk-odd">
                    <FormeRarete rarete={r} />
                    <span>{fixe && r === 'legendaire' ? 'Légendaires' : LIBELLES_RARETES[r]}</span>
                    <b>{pourcentage(lesChances.parRarete[r])}</b>
                  </span>
                ))}
              </div>
              <p className="pk-label" style={{ marginTop: 16 }}>
                Chances par type
              </p>
              <div className="pk-odds">
                {(['prefixe', 'suffixe'] as const)
                  .filter((t) => parType(t) > 0)
                  .map((t) => (
                    <span key={t} className="pk-odd">
                      <i className="pk-type" style={{ '--c': t === 'prefixe' ? 'var(--c-prefix)' : 'var(--c-suffix)' } as React.CSSProperties} aria-hidden="true" />
                      <span>{t === 'prefixe' ? 'Préfixes' : 'Suffixes'}</span>
                      <b>{pourcentage(parType(t))}</b>
                    </span>
                  ))}
              </div>
            </div>
          )}
          {lesChances && (
            <details className="pk-card">
              <summary className="pk-label" onClick={basculer}>
                <span>Toutes les briques du fascicule</span>
                {/* Les légendaires inconnues ne comptent jamais (ADR 0015). */}
                <span className="pk-count">
                  {visiblesConnues}&nbsp;/&nbsp;{visibles}
                </span>
              </summary>
              <div className="pk-pool" style={{ '--n': inconnues.length } as CSSProperties}>
                {lesChances.briques
                  .filter((c) => !(c.brique.rarete === 'legendaire' && (fixe || !reserve.has(c.brique.id))))
                  .sort((a, b) => b.chance - a.chance)
                  .map(({ brique, chance }) => {
                    const connue = jeu.briques.get(brique.id)
                    const n = reserve.get(brique.id)
                    // Une seule silhouette scintille à la fois, chacune à son tour.
                    const rang = inconnues.findIndex((b) => b.id === brique.id)
                    return (
                      <span key={brique.id} className="pk-brickodd">
                        {n !== undefined && connue ? (
                          <PetiteBrique brique={connue} />
                        ) : (
                          <span className="pk-unknown" aria-label="Brique inconnue" style={{ '--i': rang } as CSSProperties}>
                            ? ? ?
                          </span>
                        )}
                        <FormeRarete rarete={brique.rarete} />
                        <small>{n === undefined ? 'inconnue' : n === 0 ? 'épuisée' : `×${n} / ${PLAFOND}`}</small>
                        <b>{pourcentage(chance)}</b>
                      </span>
                    )
                  })}
                {(fixe ? (lesChances?.parRarete.legendaire ?? 0) > 0 : legendairesInconnues.length > 0) && (
                  <span className="pk-brickodd">
                    <span className="pk-unknown" aria-hidden="true">
                      ◆
                    </span>
                    <FormeRarete rarete="legendaire" />
                    <small>{fixe ? 'Légendaires' : 'Légendaires inconnues'}</small>
                    <b>{pourcentage(fixe ? (lesChances?.parRarete.legendaire ?? 0) : legendairesInconnues.reduce((s, c) => s + c.chance, 0))}</b>
                  </span>
                )}
              </div>
            </details>
          )}
        </aside>
      </div>
      <details className="pk-card">
        <summary className="pk-label" onClick={basculer}>Règles du pli</summary>
        <ul className="pk-rules">
          <li>Gratuit, et seule source d’exemplaires après les briques de départ.</li>
          <li>Doublons possibles : chacun ajoute un exemplaire, 5 au plus par brique. Chaque pli rapporte de l’encre, davantage pour un doublon.</li>
          <li>Chances affichées pour chaque rareté, chaque type et chaque brique. {fixe ? 'Les légendaires ont une seule ligne, à chance fixe : leur nombre reste secret.' : 'Les légendaires inconnues forment une seule ligne : leur nombre reste secret.'}</li>
          <li>Une brique nouvelle garantie au moins tous les {garantie} plis{fixe ? ', jamais une légendaire' : ''}.</li>
          <li>Réserve bloquée : une brique utile garantie au plus tard au {filet}ᵉ pli{fixe ? ', jamais une légendaire' : ''}.</li>
          <li>Dix plis au plus en attente, un toutes les 12&nbsp;h.</li>
          <li>Un sablier avance la recharge d’une heure. L’encre en achète sans limite, à la boutique.</li>
          <li>La garantie de nouveauté et le filet se comptent par fascicule.</li>
        </ul>
      </details>
    </div>
  )
}

function Tirage({ jeu, ouverture, rarete, entree }: { jeu: CatalogueJeu; ouverture: OuverturePli; rarete: Rarete | undefined; entree?: 'nouveau' | 'descend' }) {
  const brique = jeu.briques.get(ouverture.brique_id)
  const pastille = ouverture.resultat === 'nouvelle' ? 'new' : ouverture.resultat === 'doublon' ? '+1' : null
  return (
    <div className={['pk-hist-item', ouverture.resultat === 'nouvelle' ? '' : 'dup', entree ?? ''].filter(Boolean).join(' ')}>
      <span className="pk-hist-brique">
        {brique ? <PetiteBrique brique={brique} /> : <span className="pk-unknown">…</span>}
        {pastille && <sup className="pk-hist-plus">{pastille}</sup>}
      </span>
      {rarete ? <FormeRarete rarete={rarete} /> : <span />}
      <small>{(ouverture.resultat === 'reserve_pleine' ? 'Pleine · ' : '') + `+${gouttes(ouverture.encre)}`}</small>
    </div>
  )
}

/**
 * Texte qui s'écrit lettre à lettre (plis.css, `.l`) ; `debut` : rang de sa première lettre dans la révélation.
 * Les lecteurs d'écran lisent le texte entier.
 */
function Ecrit({ texte, debut }: { texte: string; debut: number }) {
  return (
    <>
      <span className="sr-only">{texte}</span>
      <span aria-hidden="true">
        {Array.from(texte).map((c, i) => (
          <span key={i} className="l" style={{ '--i': debut + i } as CSSProperties}>
            {c}
          </span>
        ))}
      </span>
    </>
  )
}

/** Révélation (I-21) : la brique atterrit, son titre s'écrit, puis deux boutons. */
function Revelation({ jeu, reponse, onEssayer, onContinuer }: { jeu: CatalogueJeu; reponse: ReponsePli; onEssayer: (brique: string) => void; onContinuer: () => void }) {
  const continuer = useRef<HTMLButtonElement>(null)
  // Sans défilement : la scène masque son débordement, un défilement la laisserait décalée.
  useEffect(() => continuer.current?.focus({ preventScroll: true }), [])
  // La brique s'imprime à 55 % de son atterrissage (plis.css, `imprime`, 500 ms) : la main le sent.
  useEffect(() => {
    if (mouvementReduit()) return
    const minuteur = setTimeout(() => vibrer(20), 275)
    return () => clearTimeout(minuteur)
  }, [])
  const o = reponse.ouverture
  const brique = jeu.briques.get(o.brique_id)
  const nouvelle = o.resultat === 'nouvelle'
  const pleine = o.resultat === 'reserve_pleine'
  const kicker = nouvelle
    ? brique?.rarete === 'legendaire'
      ? 'Légendaire !'
      : brique?.rarete === 'rare'
        ? 'Rare !'
        : 'Nouvelle brique !'
    : pleine
      ? `Réserve pleine · ×${PLAFOND}`
      : reponse.etait_epuisee
        ? 'De retour !'
        : '+1 exemplaire'
  return (
    <div className="pk-reveal">
      <p className="pk-kicker">
        <Ecrit texte={kicker} debut={0} />
      </p>
      {brique && <Brique brique={brique} className="pk-brick" />}
      <div className="pk-actions">
        <button type="button" className="btn btn-secondary" onClick={() => onEssayer(o.brique_id)}>
          Essayer sur la table →
        </button>
        <button ref={continuer} type="button" className="btn btn-secondary" onClick={onContinuer}>
          Continuer
        </button>
      </div>
    </div>
  )
}
