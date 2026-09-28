import { useCallback, useEffect, useRef, useState } from 'react'

import type { Etat, OuverturePli, Rarete, ReponsePli, ReponseSablier } from '../contrat'
import { useMaintenant } from '../services/horloge'
import { type CatalogueJeu, type FasciculeParu, NATURES, decouvertePossible, libelleFascicule } from '../services/jeu'
import {
  LIBELLES_RARETES,
  ORDRE_RARETES,
  briquesDuPli,
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
import { CarteSabliers } from './Sabliers'

/** Glyphes inventés que la plume essaie avant d'écrire la brique (plis.html). */
const INVENT = Array.from('ꜳꝏƺȣǂꞷʘƨƾȹꭥꝭꜧƕξψϡϟϠѦ')
const au_hasard = <T,>(liste: T[]): T => liste[Math.floor(Math.random() * liste.length)] as T
const bruit = (n: number) => Array.from({ length: n }, () => au_hasard(INVENT)).join('')
const gouttes = (n: number) => `${n} goutte${n > 1 ? 's' : ''}`
const PLAFOND = 5

function mouvementReduit(): boolean {
  return document.documentElement.dataset.mouvement === 'reduit' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** « 1 / 2 » et le temps restant ; arrêté à 2 / 2 (ADR 0020). */
function useEnergie(etat: Etat | null) {
  const maintenant = useMaintenant()
  if (!etat) return { charges: 0, capacite: 2, texte: 'Plis en attente du serveur', progression: 0, restant: undefined }
  const { capacite, recharge_s } = etat.energie
  const { charges, prochaine } = energieA(etat.energie, maintenant)
  const reste = prochaine === null ? 0 : prochaine - maintenant
  return {
    charges,
    capacite,
    texte: prochaine === null ? 'Deux plis prêts à être ouverts' : `+1 dans ${duree(reste)}`,
    progression: prochaine === null ? 1 : 1 - reste / (recharge_s * 1000),
    restant: prochaine === null ? undefined : duree(reste),
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
}) {
  return (
    <span className={grand ? 'pk-waiting is-grand' : 'pk-waiting'} role="img" aria-label={`${charges} pli${charges > 1 ? 's' : ''} prêt${charges > 1 ? 's' : ''} sur ${capacite}`}>
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
                <svg viewBox="0 0 60 60">
                  <circle className="ring-track" cx="30" cy="30" r="24" />
                  <circle className="ring-fill" cx="30" cy="30" r="24" style={{ strokeDasharray: 150.8, strokeDashoffset: 150.8 * (1 - progression) }} />
                </svg>
                {grand && restant && <span className="pk-restant">{restant}</span>}
              </span>
            )}
          </span>
        ),
      )}
    </span>
  )
}

/** Carte « Plis en attente » (I-20), identique sur le choix du fascicule et dans l'atelier. */
function CartePlisEnAttente({ energie, jaquette, urlMedia }: { energie: ReturnType<typeof useEnergie>; jaquette: string | null | undefined; urlMedia: (c: string) => string }) {
  return (
    <div className="pk-card pk-energie">
      <p className="pk-label">Plis en attente</p>
      <div className="pk-attente" role="status">
        <PlisEnAttente
          charges={energie.charges}
          capacite={energie.capacite}
          jaquette={jaquette}
          urlMedia={urlMedia}
          progression={energie.progression}
          restant={energie.restant}
          grand
        />
        {/* Le compte à rebours vit dans le pli en pointillés ; plein, le temps s'arrête. */}
        <small className={energie.charges < energie.capacite ? 'sr-only' : undefined}>{energie.texte}</small>
      </div>
      <p className="pk-note">Un pli revient toutes les 12&nbsp;h, et le temps s’arrête quand deux plis vous attendent. Les plis ne limitent jamais les fusions.</p>
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
  onEssayer: () => void
  urlMedia: (chemin: string) => string
}

/** Écran des plis (I-19 à I-21) : choisir un fascicule, puis ouvrir son pli. */
export function Plis({ jeu, etat, fascicule, onChoisir, ouvrirPli, utiliserSabliers, onEssayer, urlMedia }: Props) {
  const choisi = jeu.fascicules.find((f) => f.manifeste.id === fascicule)
  if (!choisi) return <Choix jeu={jeu} etat={etat} onChoisir={onChoisir} utiliserSabliers={utiliserSabliers} urlMedia={urlMedia} />
  return (
    <Atelier
      key={choisi.manifeste.id}
      jeu={jeu}
      etat={etat}
      fascicule={choisi}
      onRetour={() => onChoisir(null)}
      ouvrirPli={ouvrirPli}
      utiliserSabliers={utiliserSabliers}
      onEssayer={onEssayer}
      urlMedia={urlMedia}
    />
  )
}

/** Choix du fascicule (I-19) : jaquette, briques connues et exemplaires, pour choisir en connaissance de cause. */
function Choix({
  jeu,
  etat,
  onChoisir,
  utiliserSabliers,
  urlMedia,
}: {
  jeu: CatalogueJeu
  etat: Etat | null
  onChoisir: (f: string) => void
  utiliserSabliers: Props['utiliserSabliers']
  urlMedia: (c: string) => string
}) {
  const energie = useEnergie(etat)
  if (jeu.fascicules.length === 0) return <p className="pk-empty">Aucun fascicule n’est encore paru.</p>
  const parus = [...jeu.fascicules].sort((a, b) => b.numero - a.numero)
  return (
    <div className="pk-chooser">
      <CartePlisEnAttente energie={energie} jaquette={parus[0]?.manifeste.jaquette} urlMedia={urlMedia} />
      <CarteSabliers etat={etat} utiliser={utiliserSabliers} />
      <div className="pk-chooser-head">
        <div>
          <h2 className="jk-title">
            Choisir <em>un fascicule</em>
          </h2>
        </div>
        <p className="pk-note">Chaque pli tire une brique parmi celles de son fascicule. Vous pourrez revenir à ce choix à tout moment.</p>
      </div>
      <div className="pk-fasc-list">
        {parus.map((f) => {
          const { connues, exemplaires } = reserveDuFascicule(jeu, etat, f)
          const ouvrable = pliOuvrable(f)
          const contenu = (
            <>
              <Jaquette chemin={f.manifeste.jaquette} urlMedia={urlMedia} />
              <span className="pk-fasc-info">
                <span className="pk-fasc-k">N°&nbsp;{f.numero}</span>
                <b>{f.manifeste.nom ?? `Fascicule ${f.numero}`}</b>
                <span>
                  {connues === 0 ? 'Aucune brique connue' : `${connues} brique${connues > 1 ? 's' : ''} connue${connues > 1 ? 's' : ''}`} · {exemplaires} exemplaire{exemplaires > 1 ? 's' : ''}
                </span>
                <span className="pk-fasc-go">{ouvrable ? 'Ouvrir son pli →' : 'Pli bientôt disponible'}</span>
              </span>
            </>
          )
          return ouvrable ? (
            <button key={f.numero} type="button" className="pk-fasc" aria-label={`${libelleFascicule(f)} : ${connues} brique${connues > 1 ? 's' : ''} connue${connues > 1 ? 's' : ''}, ${exemplaires} exemplaire${exemplaires > 1 ? 's' : ''}. Ouvrir son pli`} onClick={() => onChoisir(f.manifeste.id)}>
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

interface Eclat {
  cle: number
  glyphe: string
  style: React.CSSProperties
}

interface AtelierProps {
  jeu: CatalogueJeu
  etat: Etat | null
  fascicule: FasciculeParu
  onRetour: () => void
  ouvrirPli: Props['ouvrirPli']
  utiliserSabliers: Props['utiliserSabliers']
  onEssayer: () => void
  urlMedia: (c: string) => string
}

/** Atelier du pli (I-20) et rituel d'ouverture (I-21). */
function Atelier({ jeu, etat, fascicule, onRetour, ouvrirPli, utiliserSabliers, onEssayer, urlMedia }: AtelierProps) {
  const energie = useEnergie(etat)
  const briques = briquesDuPli(fascicule)
  const equilibrage = fascicule.manifeste.pli?.equilibrage
  const ouvrable = pliOuvrable(fascicule) && equilibrage
  const [etape, setEtape] = useState<Etape>('ready')
  const [classe, setClasse] = useState<'' | 'pk-charging' | 'pk-writing' | 'pk-burst' | 'pk-revealed'>('')
  const [lignes, setLignes] = useState<Ligne[]>([])
  const [eclats, setEclats] = useState<Eclat[]>([])
  const [reponse, setReponse] = useState<ReponsePli | null>(null)
  const [statut, setStatut] = useState('')
  const passer = useRef(false)
  const occupe = useRef(false)
  const scene = useRef<HTMLDivElement>(null)

  const pret = energie.charges > 0 && ouvrable
  const etapeAffichee: Etape = etape === 'ready' && !pret ? 'recharging' : etape

  const pause = useCallback((ms: number) => (passer.current || mouvementReduit() ? Promise.resolve() : new Promise<void>((fin) => setTimeout(fin, ms))), [])

  const ecrire = useCallback(
    async (texte: string, finale: boolean, nature?: string) => {
      const cle = Math.random()
      setLignes((ls) => [...ls.map((l) => ({ ...l, ancienne: true })).slice(-2), { cle, texte: '', finale, nature, saisie: true }])
      const lettres = Array.from(texte)
      for (let i = 0; i < lettres.length; i++) {
        if (passer.current || mouvementReduit()) break
        const vu = lettres.slice(0, i).join('')
        setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, texte: vu + au_hasard(INVENT) } : l)))
        await pause(20)
        setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, texte: vu + lettres[i] } : l)))
        await pause(finale ? 22 : 4)
      }
      setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, texte, saisie: false } : l)))
      return cle
    },
    [pause],
  )

  const eclater = useCallback(() => {
    if (mouvementReduit()) return
    const couleurs = ['var(--c-pli)', 'var(--c-pli-deep)', 'var(--c-action)', 'var(--ink)']
    const lettres = [...INVENT, ...Array.from('αβγδλμπσωΩΛ')]
    const nouveaux = Array.from({ length: 26 }, (_, i) => {
      const angle = Math.random() * Math.PI * 2
      const distance = 140 + Math.random() * 220
      return {
        cle: Math.random(),
        glyphe: au_hasard(lettres),
        style: {
          '--c': couleurs[i % couleurs.length],
          '--s': `${16 + Math.random() * 22}px`,
          '--dx': `${Math.cos(angle) * distance}px`,
          '--dy': `${Math.sin(angle) * distance}px`,
          '--r': `${Math.random() * 540 - 270}deg`,
        } as React.CSSProperties,
      }
    })
    setEclats(nouveaux)
    setTimeout(() => setEclats([]), 1300)
  }, [])

  const ouvrir = useCallback(async () => {
    if (occupe.current || !pret) return
    occupe.current = true
    passer.current = false
    setReponse(null)
    setLignes([])
    setEtape('opening')
    setStatut('Touchez pour passer')
    // La requête part tout de suite ; rien n'est annoncé avant sa réponse.
    const demande = ouvrirPli(fascicule.manifeste.id)
    setClasse('pk-charging')
    const [resultat] = await Promise.all([demande, pause(260)])
    if ('erreur' in resultat) {
      setClasse('')
      setEtape('ready')
      setStatut(resultat.erreur)
      occupe.current = false
      return
    }
    const brique = jeu.briques.get(resultat.ouverture.brique_id)
    const carte = brique ? jeu.cartes.get(brique.uniteId) : undefined
    const etymon = carte?.relations?.find((r) => r.etymon)?.etymon
    // Glyphes inventés, puis la forme d'origine et sa translittération ; sans étymon, deux essais inventés.
    const origine = [etymon?.forme.texte, etymon?.forme.translitterations?.[0]?.texte].filter((t): t is string => Boolean(t))
    const brouillons = [bruit(4), ...(origine.length > 0 ? origine : [bruit(5)])]
    setClasse('pk-writing')
    for (const brouillon of brouillons) {
      const cle = await ecrire(brouillon, false)
      await pause(60)
      setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, barree: true } : l)))
      await pause(110)
    }
    // Seuls préfixes et suffixes s'écrivent dans un cadre de brique coloré ; un mot reste en serif.
    const finale = await ecrire(brique?.libelle ?? '…', true, brique && brique.nature !== 'mot' ? NATURES[brique.nature] : undefined)
    setLignes((ls) => ls.map((l) => (l.cle === finale ? { ...l, encree: true } : l)))
    await pause(130)
    setClasse('pk-burst')
    eclater()
    await pause(260)
    setReponse(resultat)
    setClasse('pk-revealed')
    setEtape('revealed')
    const o = resultat.ouverture
    setStatut(
      o.resultat === 'nouvelle'
        ? `Ajoutée à votre réserve et à votre codex · +${gouttes(o.encre)} d’encre`
        : o.resultat === 'reserve_pleine'
          ? `Réserve pleine : +${gouttes(o.encre)} d’encre`
          : `+1 exemplaire : ×${resultat.exemplaires} dans votre réserve · +${gouttes(o.encre)} d’encre`,
    )
    occupe.current = false
  }, [pret, ouvrirPli, fascicule, jeu, pause, ecrire, eclater])

  const continuer = () => {
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

  const decouverts = new Set(etat?.decouvertes.map((d) => d.mot_id) ?? [])
  const reserve = new Map(etat?.reserve.map((e) => [e.brique_id, e.exemplaires]) ?? [])
  const bloque = etat ? !decouvertePossible(jeu, etat.reserve, decouverts) : false
  const compteurs = compteur(etat, fascicule.manifeste.id)
  const lesChances = equilibrage ? chances(briques, equilibrage) : null
  const inconnues = briques.filter((b) => !reserve.has(b.id))
  const garantie = equilibrage?.garantie_nouveaute ?? 6
  const filet = equilibrage?.filet_utilite ?? 5
  const restantAvantGarantie = Math.max(1, garantie - compteurs.plis_sans_nouveaute)
  const historique = (etat?.historique_plis ?? []).filter((h) => h.fascicule_id === fascicule.manifeste.id).slice(0, 6)
  const nom = fascicule.manifeste.nom ?? `Fascicule ${fascicule.numero}`
  const rareteTiree = reponse ? briques.find((b) => b.id === reponse.ouverture.brique_id)?.rarete : undefined

  const parType = (nature: 'prefixe' | 'suffixe' | 'mot') => lesChances?.briques.filter((c) => (c.brique.nature ?? 'mot') === nature).reduce((n, c) => n + c.chance, 0) ?? 0
  const visibles = briques.filter((b) => b.rarete !== 'legendaire' || reserve.has(b.id)).length
  const visiblesConnues = briques.filter((b) => reserve.has(b.id)).length
  const legendairesInconnues = lesChances?.briques.filter((c) => c.brique.rarete === 'legendaire' && !reserve.has(c.brique.id)) ?? []

  return (
    <div className="pk-ecran">
      <CartePlisEnAttente energie={energie} jaquette={fascicule.manifeste.jaquette} urlMedia={urlMedia} />
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
          {lesChances && (
            <div className="pk-card">
              <p className="pk-label">Chances par rareté</p>
              <div className="pk-odds">
                {ORDRE_RARETES.map((r) => (
                  <span key={r} className="pk-odd">
                    <FormeRarete rarete={r} />
                    <span>{LIBELLES_RARETES[r]}</span>
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
          <div className="pk-card">
            <p className="pk-label">Garantie</p>
            <div className="pk-pity">
              <i style={{ width: `${inconnues.length === 0 ? 100 : (compteurs.plis_sans_nouveaute / garantie) * 100}%` }} />
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
          <details className="pk-card">
            <summary className="pk-label">Règles du pli</summary>
            <ul className="pk-rules">
              <li>Gratuit, et seule source d’exemplaires après les briques de départ.</li>
              <li>Doublons possibles : chacun ajoute un exemplaire, 5 au plus par brique. Chaque pli rapporte de l’encre, davantage pour un doublon.</li>
              <li>Chances affichées pour chaque rareté, chaque type et chaque brique. Les légendaires inconnues forment une seule ligne : leur nombre reste secret.</li>
              <li>Une brique nouvelle garantie au moins tous les {garantie} plis.</li>
              <li>Réserve bloquée : une brique utile garantie au plus tard au {filet}ᵉ pli.</li>
              <li>Deux plis au plus en attente, un toutes les 12&nbsp;h.</li>
              <li>Un sablier avance la recharge d’une heure&nbsp;: 12 par jour au plus.</li>
              <li>La garantie de nouveauté et le filet se comptent par fascicule.</li>
            </ul>
          </details>
        </aside>

        <div
          ref={scene}
          className={['pk-stage', classe].filter(Boolean).join(' ')}
          data-state={etapeAffichee}
          data-rarity={rareteTiree}
          onClick={() => {
            if (etape === 'opening') passer.current = true
          }}
        >
          <div className="pk-rays" aria-hidden="true" />
          <div className="pk-flash" aria-hidden="true" />
          {etape !== 'revealed' && (
            <button type="button" className="pk-pack" aria-label={`Ouvrir le pli du fascicule ${nom}`} disabled={!pret || etape !== 'ready'} onClick={() => void ouvrir()}>
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
                    className={['sc-line', l.finale ? 'final' : '', l.nature ? 'sc-brick' : '', l.barree ? 'struck' : '', l.ancienne ? 'old' : '', l.encree ? 'inked' : ''].filter(Boolean).join(' ')}
                    data-kind={l.nature}
                  >
                    {l.texte}
                    {l.saisie && <span className="sc-caret" />}
                  </span>
                ))}
              </span>
            </button>
          )}
          {eclats.map((e) => (
            <span key={e.cle} className="pk-glyph" style={e.style} aria-hidden="true">
              {e.glyphe}
            </span>
          ))}
          {reponse && <Revelation jeu={jeu} reponse={reponse} onEssayer={onEssayer} onContinuer={continuer} />}
          <p className="pk-tagline" aria-hidden="true">
            {etapeAffichee === 'recharging' ? 'l’encre sèche…' : 'une racine attend d’être écrite…'}
          </p>
          <p className="pk-status" role="status" aria-live="polite">
            {statut || (etapeAffichee === 'recharging' ? (ouvrable ? `Pli en recharge · ${energie.texte}` : 'Ce pli n’est pas encore disponible') : 'Touchez le pli pour l’ouvrir')}
          </p>
          {etape !== 'revealed' && (
            <div className="pk-actions">
              <button type="button" className="btn btn-primary" disabled={!pret || etape !== 'ready'} onClick={() => void ouvrir()}>
                {etape === 'opening' ? 'Ouverture…' : pret ? 'Ouvrir le pli' : 'Recharge en cours…'}
              </button>
            </div>
          )}
        </div>

        <aside className="pk-side">
          <div className="pk-card">
            <p className="pk-label">Encre</p>
            <div className="pk-inkbox">
              <span className="pk-drop" aria-hidden="true" />
              <strong>{etat?.encre ?? 0}</strong>
              <small>gouttes</small>
            </div>
            <p className="pk-note">
              Chaque pli rapporte {gouttes(equilibrage?.base_encre ?? 2)}. Un doublon en ajoute selon sa rareté, le double si la réserve est pleine. Échangez-les contre des sabliers (1&nbsp;goutte) ou des indices, depuis la table.
            </p>
          </div>
          <CarteSabliers etat={etat} utiliser={utiliserSabliers} />
          {lesChances && (
            <details className="pk-card" open>
              <summary className="pk-label">
                <span>Toutes les briques du fascicule</span>
                {/* Les légendaires inconnues ne comptent jamais (ADR 0015). */}
                <span className="pk-count">
                  {visiblesConnues}&nbsp;/&nbsp;{visibles}
                </span>
              </summary>
              <div className="pk-pool">
                {lesChances.briques
                  .filter((c) => !(c.brique.rarete === 'legendaire' && !reserve.has(c.brique.id)))
                  .sort((a, b) => b.chance - a.chance)
                  .map(({ brique, chance }) => {
                    const connue = jeu.briques.get(brique.id)
                    const n = reserve.get(brique.id)
                    return (
                      <span key={brique.id} className="pk-brickodd">
                        {n !== undefined && connue ? <PetiteBrique brique={connue} /> : <span className="pk-unknown" aria-label="Brique inconnue">? ? ?</span>}
                        <FormeRarete rarete={brique.rarete} />
                        <small>{n === undefined ? 'inconnue' : n === 0 ? 'épuisée' : `×${n} / ${PLAFOND}`}</small>
                        <b>{pourcentage(chance)}</b>
                      </span>
                    )
                  })}
                {legendairesInconnues.length > 0 && (
                  <span className="pk-brickodd">
                    <span className="pk-unknown" aria-hidden="true">
                      ◆
                    </span>
                    <FormeRarete rarete="legendaire" />
                    <small>Légendaires inconnues</small>
                    <b>{pourcentage(legendairesInconnues.reduce((s, c) => s + c.chance, 0))}</b>
                  </span>
                )}
              </div>
            </details>
          )}
          <details className="pk-card" open>
            <summary className="pk-label">Derniers tirages</summary>
            <div className="pk-history">
              {historique.length === 0 ? <span className="pk-empty">Aucun pli ouvert pour l’instant.</span> : historique.map((h, i) => <Tirage key={`${h.ouvert_le}-${i}`} jeu={jeu} ouverture={h} rarete={briques.find((b) => b.id === h.brique_id)?.rarete} />)}
            </div>
          </details>
        </aside>
      </div>
    </div>
  )
}

function Tirage({ jeu, ouverture, rarete }: { jeu: CatalogueJeu; ouverture: OuverturePli; rarete: Rarete | undefined }) {
  const brique = jeu.briques.get(ouverture.brique_id)
  const plus = ` · +${gouttes(ouverture.encre)}`
  return (
    <div className={ouverture.resultat === 'nouvelle' ? 'pk-hist-item' : 'pk-hist-item dup'}>
      {brique ? <PetiteBrique brique={brique} /> : <span className="pk-unknown">…</span>}
      {rarete ? <FormeRarete rarete={rarete} /> : <span />}
      <small>{(ouverture.resultat === 'nouvelle' ? 'Nouvelle' : ouverture.resultat === 'reserve_pleine' ? 'Pleine' : '+1') + plus}</small>
    </div>
  )
}

/** Révélation (I-21) : la brique atterrit, avec son origine et ce qu'elle apporte. */
function Revelation({ jeu, reponse, onEssayer, onContinuer }: { jeu: CatalogueJeu; reponse: ReponsePli; onEssayer: () => void; onContinuer: () => void }) {
  const continuer = useRef<HTMLButtonElement>(null)
  // Sans défilement : la scène masque son débordement, un défilement la laisserait décalée.
  useEffect(() => continuer.current?.focus({ preventScroll: true }), [])
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
        : `+1 exemplaire · ×${reponse.exemplaires}`
  return (
    <div className="pk-reveal">
      <p className="pk-kicker">{kicker}</p>
      {brique && <Brique brique={brique} className={nouvelle ? 'pk-brick' : 'pk-brick is-dup'} />}
      {brique && (
        <p className="pk-rarity">
          <FormeRarete rarete={brique.rarete} />
          {LIBELLES_RARETES[brique.rarete]}
        </p>
      )}
      {nouvelle && brique?.origine && <p className="pk-origin">{brique.origine}</p>}
      <p className="pk-ink">{nouvelle || pleine ? `+${gouttes(o.encre)} d’encre` : `Réserve : ×${reponse.exemplaires} / ${PLAFOND} · +${gouttes(o.encre)}`}</p>
      <div className="pk-actions">
        <button type="button" className="btn btn-secondary" onClick={onEssayer}>
          Essayer sur la table →
        </button>
        <button ref={continuer} type="button" className="btn btn-secondary" onClick={onContinuer}>
          Continuer
        </button>
      </div>
    </div>
  )
}
