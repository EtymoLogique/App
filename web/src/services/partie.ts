import { useCallback, useEffect, useRef, useState } from 'react'

import type { Etat, ReponseAchatSablier, ReponseIndice, ReponsePli, ReponseSablier } from '../contrat'
import type { Retour } from '../composants/Resultat'
import { type ClientApi, ErreurApi } from './api'
import type { LecteurCatalogue } from './catalogue'
import { type CatalogueJeu, TABLE_MAX, chargerJeu, prevoir } from './jeu'
import { completerEtat, etatConfirme, memoriserEtat, memoriserTable, tableEnCours } from './local'

type Chargement<T> = { etat: 'attente' } | { etat: 'pret'; valeur: T } | { etat: 'erreur'; message: string }

export interface FicheOuverte {
  motId: string
  consommees?: string[]
  /** Jalons atteints par cette découverte, à annoncer (ADR 0038). */
  jalons?: string[]
  /** Gouttes d'encre gagnées par cette découverte (ADR 0040). */
  gouttes?: number
}

function message(e: unknown): string {
  if (e instanceof ErreurApi && e.code === 'reseau') return 'Le serveur est injoignable pour le moment.'
  if (e instanceof ErreurApi && e.code === 'trop_de_requetes') return 'Trop de tentatives : réessayez dans une minute.'
  return 'Une erreur est survenue. Réessayez plus tard.'
}

/** Durée de la fusion avant la révélation, comme la démo jeu.html. */
const DUREE_FUSION_MS = 700
/** Durée du « −1 » qui s'envole d'une brique utilisée (mouvement.html). */
const DUREE_MOINS_UN_MS = 1400

function mouvementReduit(): boolean {
  return document.documentElement.dataset.mouvement === 'reduit' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Cases de la table : chaque brique garde sa place, une case vide vaut `null`. */
export type Cases = (string | null)[]

const casesVides = (): Cases => Array.from({ length: TABLE_MAX }, () => null)

/** Vide les cases dont la brique n'a plus d'exemplaire disponible dans la réserve. */
function tableValide(cases: Cases, etat: Etat): Cases {
  const restants = new Map(etat.reserve.map((e) => [e.brique_id, e.exemplaires]))
  return casesVides().map((_, i) => {
    const b = cases[i] ?? null
    if (b === null) return null
    const n = restants.get(b) ?? 0
    restants.set(b, n - 1)
    return n > 0 ? b : null
  })
}

const HORS_LIGNE = 'Hors ligne : consultation seulement. Reconnectez-vous pour jouer.'

/** État d'une partie : catalogue, état confirmé, table et retours de fusion. */
export function usePartie(api: ClientApi, lecteur: LecteurCatalogue, enLigne = true) {
  const [jeu, setJeu] = useState<Chargement<CatalogueJeu | null>>({ etat: 'attente' })
  const [etat, setEtat] = useState<Etat | null>(null)
  const [erreurEtat, setErreurEtat] = useState<string | null>(null)
  const [cases, setTable] = useState<Cases>(casesVides)
  /** Briques posées, dans l'ordre des cases. */
  const table = cases.filter((b): b is string => b !== null)
  const [retour, setRetour] = useState<Retour | null>(null)
  const [enAttente, setEnAttente] = useState(false)
  const [fiche, setFiche] = useState<FicheOuverte | null>(null)
  /** Secousse de la table après une tentative (design système 4.3), relancée à chaque essai. */
  const [secousse, setSecousse] = useState<{ force: 'legere' | 'forte'; cle: number } | null>(null)
  /** Fusion réussie en cours d'animation (mouvement.html, « Pop de découverte ») : les briques se rejoignent. */
  const [fusion, setFusion] = useState<number | null>(null)
  /** Briques qui viennent d'être consommées : leur « −1 » s'envole dans la réserve. */
  const [consommees, setConsommees] = useState<string[]>([])
  /** Découvertes de la session pas encore vues dans le codex : compteur Corail de la navigation. */
  const [nouvelles, setNouvelles] = useState<Set<string>>(new Set())
  /** Vrai hors production seulement : le serveur ouvre alors la réinitialisation. */
  const [reinitialisable, setReinitialisable] = useState(false)
  const actif = useRef(true)
  const restauree = useRef(false)

  const confirmer = useCallback((recu: Etat) => {
    const nouvel = completerEtat(recu)
    setEtat(nouvel)
    setTable((t) => tableValide(t, nouvel))
    void memoriserEtat(nouvel)
  }, [])

  const synchroniser = useCallback(async () => {
    const [catalogue, confirme] = await Promise.allSettled([chargerJeu(lecteur), api.etat()])
    if (!actif.current) return
    if (catalogue.status === 'fulfilled') setJeu({ etat: 'pret', valeur: catalogue.value })
    else setJeu({ etat: 'erreur', message: 'Le catalogue est illisible pour le moment.' })
    if (confirme.status === 'fulfilled') {
      setErreurEtat(null)
      confirmer(confirme.value)
    } else setErreurEtat(message(confirme.reason))
  }, [api, lecteur, confirmer])

  useEffect(() => {
    actif.current = true
    // La dernière projection confirmée s'affiche tout de suite, puis le serveur la remplace.
    void Promise.all([etatConfirme(), tableEnCours()]).then(([local, t]) => {
      restauree.current = true
      if (!actif.current) return
      if (local) {
        setEtat((e) => e ?? local)
        setTable((actuelle) => (actuelle.some(Boolean) ? actuelle : tableValide(t, local)))
      }
    })
    // oxlint-disable-next-line react/set-state-in-effect -- l'état change à la réponse du réseau, pas pendant l'effet.
    void synchroniser()
    return () => {
      actif.current = false
    }
  }, [synchroniser])

  useEffect(() => {
    api.sante().then(
      (s) => actif.current && setReinitialisable(s.reinitialisation),
      () => undefined,
    )
  }, [api])

  useEffect(() => {
    if (restauree.current) void memoriserTable(cases)
  }, [cases])

  /** Pose une brique dans la première case libre ; table pleine, rien ne change. */
  const ajouter = useCallback((brique: string) => {
    if (!enLigne) return
    setTable((t) => {
      const libre = t.indexOf(null)
      if (libre < 0) return t
      const suite = [...t]
      suite[libre] = brique
      return suite
    })
    setRetour(null)
    setFiche(null)
  }, [enLigne])

  /** Pose une brique dans la case `rang` : elle remplace celle qui s'y trouvait. */
  const poser = useCallback((brique: string, rang: number) => {
    if (!enLigne) return
    setTable((t) => {
      if (rang < 0 || rang >= t.length) return t
      const suite = [...t]
      suite[rang] = brique
      return suite
    })
    setRetour(null)
    setFiche(null)
  }, [enLigne])

  /** Échange deux cases, pleines ou vides. */
  const deplacer = useCallback((depuis: number, vers: number) => {
    if (!enLigne) return
    setTable((t) => {
      if (vers < 0 || vers >= t.length || depuis === vers) return t
      const suite = [...t]
      suite[depuis] = t[vers] ?? null
      suite[vers] = t[depuis] ?? null
      return suite
    })
    setRetour(null)
  }, [enLigne])

  /** Vide une case : l'autre brique garde sa place. */
  const retirer = useCallback((rang: number) => {
    if (!enLigne) return
    setTable((t) => t.map((b, i) => (i === rang ? null : b)))
    setRetour(null)
  }, [enLigne])

  const vider = useCallback(() => {
    setSecousse(null)
    setTable(casesVides())
    setRetour(null)
  }, [])

  const fusionner = useCallback(async () => {
    if (!enLigne || jeu.etat !== 'pret' || !jeu.valeur || !etat) return
    // On ne fusionne que deux cases pleines.
    if (cases.some((b) => b === null)) return
    const catalogue = jeu.valeur
    const proposition = cases as string[]
    const decouverts = new Set(etat.decouvertes.map((d) => d.mot_id))
    setRetour({ etat: 'prevision', prevision: prevoir(proposition, catalogue, decouverts) })
    setConsommees([])
    setSecousse(null)
    setEnAttente(true)
    try {
      const reponse = await api.fusion({
        commande: crypto.randomUUID(),
        version_etat: etat.version_etat,
        version_catalogue: catalogue.version,
        briques: proposition,
      })
      const issue = reponse.issue
      if (issue.type === 'decouverte') {
        // Les briques se rejoignent, puis le mot se révèle et les « −1 » s'envolent (jeu.html, 700 ms).
        setFusion((f) => (f ?? 0) + 1)
        await new Promise((fin) => setTimeout(fin, mouvementReduit() ? 0 : DUREE_FUSION_MS))
        setFusion(null)
        confirmer(reponse.etat)
        setRetour({ etat: 'confirme', issue })
        setTable(casesVides())
        // Une brique-mot ne se consomme jamais : pas de « −1 ».
        const usees = proposition.filter((id) => catalogue.briques.get(id)?.nature !== 'mot')
        setConsommees(usees)
        // Le « −1 » ne s'envole qu'une fois (1,3 s) : il ne doit pas rejouer quand l'écran réapparaît.
        setTimeout(() => setConsommees((c) => (c === usees ? [] : c)), mouvementReduit() ? 0 : DUREE_MOINS_UN_MS)
        setNouvelles((n) => new Set(n).add(issue.mot_id))
        setFiche({ motId: issue.mot_id, consommees: usees, jalons: reponse.jalons ?? [], gouttes: issue.gouttes ?? 0 })
      } else {
        confirmer(reponse.etat)
        setRetour({ etat: 'confirme', issue })
        // Refus doux : une secousse brève, aucune perte (mouvement.html). Un mot déjà connu n'est pas refusé.
        if (issue.type !== 'connue') setSecousse((s) => ({ force: 'forte', cle: (s?.cle ?? 0) + 1 }))
      }
    } catch (e) {
      if (e instanceof ErreurApi && e.statut === 409) {
        await synchroniser()
        setRetour({ etat: 'message', texte: 'Votre partie a changé entre-temps. Elle est à jour : réessayez.' })
      } else {
        setRetour({ etat: 'message', texte: message(e) })
      }
    } finally {
      setEnAttente(false)
    }
  }, [api, enLigne, jeu, etat, cases, confirmer, synchroniser])

  /**
   * Ouvre le pli d'un fascicule (ADR 0011) : le serveur tire la brique. Rien
   * n'est annoncé avant sa réponse ; une erreur n'est jamais un succès local.
   */
  const ouvrirPli = useCallback(
    async (fascicule: string): Promise<ReponsePli | { erreur: string }> => {
      if (!enLigne) return { erreur: HORS_LIGNE }
      if (jeu.etat !== 'pret' || !jeu.valeur || !etat) return { erreur: 'Votre partie n’est pas encore chargée.' }
      try {
        const reponse = await api.pli({
          commande: crypto.randomUUID(),
          version_etat: etat.version_etat,
          version_catalogue: jeu.valeur.version,
          fascicule_id: fascicule,
        })
        confirmer(reponse.etat)
        // Une brique nouvelle entre au codex : sa carte se signale en Corail jusqu'à ce qu'on l'ouvre.
        const unite = jeu.valeur.briques.get(reponse.ouverture.brique_id)?.uniteId
        if (reponse.ouverture.resultat === 'nouvelle' && unite) setNouvelles((n) => new Set(n).add(unite))
        return reponse
      } catch (e) {
        if (e instanceof ErreurApi && e.statut === 409) {
          await synchroniser()
          return { erreur: 'Votre partie a changé entre-temps. Elle est à jour : réessayez.' }
        }
        if (e instanceof ErreurApi && e.statut === 403) {
          await synchroniser()
          return { erreur: 'Aucun pli n’est prêt pour le moment.' }
        }
        return { erreur: message(e) }
      }
    },
    [api, enLigne, jeu, etat, confirmer, synchroniser],
  )

  /**
   * Commande d'économie idempotente (sabliers, indices) : un `409` ou un `403`
   * resynchronise, et l'erreur n'est jamais un succès local.
   */
  const commander = useCallback(
    async <T extends { etat: Etat }>(envoyer: (e: Etat, version: string) => Promise<T>, refus: string): Promise<T | { erreur: string }> => {
      if (!enLigne) return { erreur: HORS_LIGNE }
      if (jeu.etat !== 'pret' || !jeu.valeur || !etat) return { erreur: 'Votre partie n’est pas encore chargée.' }
      try {
        const reponse = await envoyer(etat, jeu.valeur.version)
        confirmer(reponse.etat)
        return reponse
      } catch (e) {
        if (e instanceof ErreurApi && (e.statut === 409 || e.statut === 403)) {
          await synchroniser()
          return { erreur: e.statut === 409 ? 'Votre partie a changé entre-temps. Elle est à jour : réessayez.' : refus }
        }
        return { erreur: message(e) }
      }
    },
    [enLigne, jeu, etat, confirmer, synchroniser],
  )

  const utiliserSabliers = useCallback(
    (nombre: number): Promise<ReponseSablier | { erreur: string }> =>
      commander(
        (e, version) => api.sablier({ commande: crypto.randomUUID(), version_etat: e.version_etat, version_catalogue: version, nombre }),
        'Ces sabliers ne peuvent pas servir maintenant.',
      ),
    [api, commander],
  )

  const acheterSabliers = useCallback(
    (nombre: number): Promise<ReponseAchatSablier | { erreur: string }> =>
      commander(
        (e, version) => api.achatSablier({ commande: crypto.randomUUID(), version_etat: e.version_etat, version_catalogue: version, nombre }),
        'Pas assez d’encre pour cet échange.',
      ),
    [api, commander],
  )

  const acheterIndice = useCallback(
    (recette: string, niveau: number): Promise<ReponseIndice | { erreur: string }> =>
      commander(
        (e, version) => api.indice({ commande: crypto.randomUUID(), version_etat: e.version_etat, version_catalogue: version, recette_id: recette, niveau }),
        'Pas assez d’encre pour cet indice.',
      ),
    [api, commander],
  )

  /** Hors production : repart d'un joueur neuf. Le serveur fait foi, l'état renvoyé remplace tout. */
  const reinitialiser = useCallback(async (): Promise<string | null> => {
    try {
      confirmer(await api.reinitialiser())
      setNouvelles(new Set())
      setFiche(null)
      setRetour(null)
      return null
    } catch (e) {
      return message(e)
    }
  }, [api, confirmer])

  return {
    jeu,
    etat,
    reinitialisable,
    reinitialiser,
    ouvrirPli,
    utiliserSabliers,
    acheterSabliers,
    acheterIndice,
    erreurEtat,
    table,
    cases,
    retour,
    enAttente,
    fiche,
    secousse,
    fusion,
    consommees,
    nouvelles,
    carteVue: useCallback(
      (id: string) =>
        setNouvelles((n) => {
          if (!n.has(id)) return n
          const suite = new Set(n)
          suite.delete(id)
          return suite
        }),
      [],
    ),
    ajouter,
    poser,
    deplacer,
    retirer,
    vider,
    fusionner,
    signaler: useCallback((texte: string, ton?: 'hint' | 'fail') => setRetour({ etat: 'message', texte, ton }), []),
    /** Inverse l'ordre des briques posées : le geste proposé par un « presque ». */
    inverser: useCallback(() => {
      setTable((t) => [...t].reverse())
      setRetour(null)
    }, []),
    ouvrirFiche: useCallback((motId: string) => setFiche({ motId }), []),
    fermerFiche: useCallback(() => setFiche(null), []),
  }
}
