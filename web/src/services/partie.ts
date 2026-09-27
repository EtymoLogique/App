import { useCallback, useEffect, useRef, useState } from 'react'

import type { Etat } from '../contrat'
import type { Retour } from '../composants/Resultat'
import { type ClientApi, ErreurApi } from './api'
import type { LecteurCatalogue } from './catalogue'
import { type CatalogueJeu, TABLE_MAX, chargerJeu, prevoir } from './jeu'
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
  const actif = useRef(true)
  const restauree = useRef(false)

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

  const ajouter = useCallback((brique: string, rang?: number) => {
    setTable((t) => {
      if (t.length >= TABLE_MAX) return t
      const suite = [...t]
      suite.splice(rang ?? t.length, 0, brique)
      return suite
    })
    setRetour(null)
  }, [])

  const deplacer = useCallback((depuis: number, vers: number) => {
    setTable((t) => {
      if (vers < 0 || vers >= t.length) return t
      const suite = [...t]
      const [brique] = suite.splice(depuis, 1)
      if (brique !== undefined) suite.splice(vers, 0, brique)
      return suite
    })
    setRetour(null)
  }, [])

  const retirer = useCallback((rang: number) => {
    setTable((t) => t.filter((_, i) => i !== rang))
    setRetour(null)
  }, [])

  const vider = useCallback(() => {
    setTable([])
    setRetour(null)
  }, [])

  const fusionner = useCallback(async () => {
    if (jeu.etat !== 'pret' || !jeu.valeur || !etat) return
    const catalogue = jeu.valeur
    const proposition = [...table]
    const decouverts = new Set(etat.decouvertes.map((d) => d.mot_id))
    setRetour({ etat: 'prevision', prevision: prevoir(proposition, catalogue, decouverts) })
    setEnAttente(true)
    try {
      const reponse = await api.fusion({
        commande: crypto.randomUUID(),
        version_etat: etat.version_etat,
        version_catalogue: catalogue.version,
        briques: proposition,
      })
      confirmer(reponse.etat)
      setRetour({ etat: 'confirme', issue: reponse.issue })
      if (reponse.issue.type === 'decouverte') {
        setTable([])
        setFiche({ motId: reponse.issue.mot_id, consommees: proposition })
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
    enAttente,
    fiche,
    ajouter,
    deplacer,
    retirer,
    vider,
    fusionner,
    ouvrirFiche: useCallback((motId: string) => setFiche({ motId }), []),
    fermerFiche: useCallback(() => setFiche(null), []),
  }
}
