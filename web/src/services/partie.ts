import { useCallback, useEffect, useRef, useState } from 'react'

import type { Etat } from '../contrat'
import type { Retour } from '../composants/Resultat'
import { type ClientApi, ErreurApi } from './api'
import type { LecteurCatalogue } from './catalogue'
import { type CatalogueJeu, TABLE_MAX, TABLE_MIN, chargerJeu, prevoir } from './jeu'
import { etatConfirme, memoriserEtat, memoriserTable, tableEnCours } from './local'

type Chargement<T> = { etat: 'attente' } | { etat: 'pret'; valeur: T } | { etat: 'erreur'; message: string }

export interface FicheOuverte {
  motId: string
  consommees?: string[]
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

/** Garde de la table les seules briques encore disponibles dans la réserve. */
function tableValide(table: string[], etat: Etat): string[] {
  const restants = new Map(etat.reserve.map((e) => [e.brique_id, e.exemplaires]))
  return table.filter((b) => {
    const n = restants.get(b) ?? 0
    restants.set(b, n - 1)
    return n > 0
  })
}

/** État d'une partie : catalogue, état confirmé, table et retours de fusion. */
export function usePartie(api: ClientApi, lecteur: LecteurCatalogue) {
  const [jeu, setJeu] = useState<Chargement<CatalogueJeu | null>>({ etat: 'attente' })
  const [etat, setEtat] = useState<Etat | null>(null)
  const [erreurEtat, setErreurEtat] = useState<string | null>(null)
  const [table, setTable] = useState<string[]>([])
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
  const actif = useRef(true)
  const restauree = useRef(false)

  /** La table n'a pas plus d'emplacements que la plus longue recette publiée. */
  const maximum =
    jeu.etat === 'pret' && jeu.valeur && jeu.valeur.recettes.length > 0
      ? Math.min(TABLE_MAX, Math.max(TABLE_MIN, ...jeu.valeur.recettes.map((r) => r.emplacements.length)))
      : TABLE_MAX

  const confirmer = useCallback((nouvel: Etat) => {
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
        setTable((actuelle) => (actuelle.length > 0 ? actuelle : tableValide(t, local)))
      }
    })
    // oxlint-disable-next-line react/set-state-in-effect -- l'état change à la réponse du réseau, pas pendant l'effet.
    void synchroniser()
    return () => {
      actif.current = false
    }
  }, [synchroniser])

  useEffect(() => {
    if (restauree.current) void memoriserTable(table)
  }, [table])

  /** Pose une brique dans le premier emplacement libre ; table pleine, rien ne change. */
  const ajouter = useCallback(
    (brique: string) => {
      // Table pleine : rien ne se passe, aucune brique n'est remplacée.
      setTable((t) => (t.length < maximum ? [...t, brique] : t))
      setRetour(null)
      setFiche(null)
    },
    [maximum],
  )

  /** Pose une brique sur l'emplacement `rang` : elle remplace celle qui s'y trouvait. */
  const poser = useCallback(
    (brique: string, rang: number) => {
      setTable((t) => {
        const suite = [...t]
        if (rang < suite.length) suite[rang] = brique
        else if (suite.length < maximum) suite.push(brique)
        return suite
      })
      setRetour(null)
      setFiche(null)
    },
    [maximum],
  )

  /** Échange deux briques posées. */
  const deplacer = useCallback((depuis: number, vers: number) => {
    setTable((t) => {
      if (vers < 0 || vers >= t.length || depuis === vers) return t
      const suite = [...t]
      const a = suite[depuis]
      const b = suite[vers]
      if (a === undefined || b === undefined) return t
      suite[depuis] = b
      suite[vers] = a
      return suite
    })
    setRetour(null)
  }, [])

  const retirer = useCallback((rang: number) => {
    setTable((t) => t.filter((_, i) => i !== rang))
    setRetour(null)
  }, [])

  const vider = useCallback(() => {
    setSecousse(null)
    setTable([])
    setRetour(null)
  }, [])

  const fusionner = useCallback(async () => {
    if (jeu.etat !== 'pret' || !jeu.valeur || !etat) return
    const catalogue = jeu.valeur
    const proposition = [...table]
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
        setTable([])
        setConsommees(proposition)
        // Le « −1 » ne s'envole qu'une fois (1,3 s) : il ne doit pas rejouer quand l'écran réapparaît.
        setTimeout(() => setConsommees((c) => (c === proposition ? [] : c)), mouvementReduit() ? 0 : DUREE_MOINS_UN_MS)
        setNouvelles((n) => new Set(n).add(issue.mot_id))
        setFiche({ motId: issue.mot_id, consommees: proposition })
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
  }, [api, jeu, etat, table, confirmer, synchroniser])

  return {
    jeu,
    etat,
    erreurEtat,
    table,
    retour,
    maximum,
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
