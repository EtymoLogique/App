// Déblocage progressif des fascicules (ADR 0068) : le serveur fait foi. Le
// premier fascicule paru est débloqué d'emblée ; le 2ᵉ jalon d'un fascicule
// débloque le fascicule paru suivant. Un fascicule verrouillé reste visible,
// avec sa condition, mais son pli ne s'ouvre pas et ses silhouettes restent cachées.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import type { Etat } from '../contrat'
import type { CatalogueJeu, FasciculeParu } from './jeu'
import { fasciculesConnus, memoriserFasciculesConnus } from './local'

/** Rang, dans les jalons d'un fascicule, de celui qui débloque le suivant. */
export const RANG_JALON = 1

/**
 * Identifiants des fascicules débloqués. Sans état, ou avec un état antérieur
 * au déblocage (liste vide), tous les fascicules parus le sont : la PWA ne
 * verrouille jamais ce que le serveur n'a pas dit verrouillé.
 */
export function fasciculesDebloques(jeu: Pick<CatalogueJeu, 'fascicules'>, etat: Pick<Etat, 'fascicules_debloques'> | null): Set<string> {
  const liste = etat?.fascicules_debloques ?? []
  if (liste.length === 0) return new Set(jeu.fascicules.map((f) => f.manifeste.id))
  return new Set(liste.map((f) => f.fascicule_id))
}

/** Fascicule paru qui précède celui-ci : son 2ᵉ jalon le débloque. */
export function precedent(jeu: Pick<CatalogueJeu, 'fascicules'>, fascicule: FasciculeParu): FasciculeParu | undefined {
  return jeu.fascicules.filter((f) => f.numero < fascicule.numero).sort((a, b) => b.numero - a.numero)[0]
}

/** « Atteignez le 2ᵉ jalon de Lettrine » : ce qui débloque un fascicule verrouillé. */
export function conditionDeblocage(jeu: Pick<CatalogueJeu, 'fascicules'>, fascicule: FasciculeParu): string {
  const avant = precedent(jeu, fascicule)
  if (!avant) return 'Bientôt disponible'
  const nom = avant.manifeste.nom ?? `Fascicule ${avant.numero}`
  // Élision devant une voyelle ou un h : « d’Argile », « de Rosette ».
  return `Atteignez le 2ᵉ jalon ${/^[aeiouyhàâäéèêëîïôöûüù]/i.test(nom) ? `d’${nom}` : `de ${nom}`}`
}

/** Vrai si ce jalon est celui qui débloque le fascicule suivant. */
export function jalonDeblocant(fascicule: FasciculeParu, jalonId: string): boolean {
  return fascicule.manifeste.jalons?.[RANG_JALON]?.id === jalonId
}

/**
 * Fascicules débloqués que le joueur n'a pas encore ouverts : pastille Corail
 * « nouveau ». `connus` vaut `null` tant que rien n'est mémorisé : rien n'est
 * nouveau, la première liste devient la référence.
 */
export function nouveauxFascicules(debloques: ReadonlySet<string>, connus: ReadonlySet<string> | null): Set<string> {
  if (!connus) return new Set()
  return new Set([...debloques].filter((id) => !connus.has(id)))
}

interface Deblocage {
  /** Fascicules débloqués ; sans information, tous les parus. */
  debloques: ReadonlySet<string>
  /** Fascicules débloqués que le joueur n'a pas encore ouverts : pastille Corail. */
  nouveaux: ReadonlySet<string>
  /** Le joueur a ouvert ce fascicule : il n'est plus nouveau. */
  marquerVu: (fascicule: string) => void
}

const Contexte = createContext<Deblocage | null>(null)

/** Fournit le déblocage au choix du pli, au codex et aux quêtes. */
export const FournisseurDeblocage = Contexte.Provider

/** Sans fournisseur (tests, écrans isolés), `null` : tout est débloqué, rien n'est nouveau. */
export function useDeblocage(): Deblocage | null {
  return useContext(Contexte)
}

/** État du déblocage, tenu par l'application. */
export function useDeblocageEtat(jeu: CatalogueJeu | null, etat: Etat | null): Deblocage {
  const debloques = useMemo(() => (jeu ? fasciculesDebloques(jeu, etat) : new Set<string>()), [jeu, etat])
  // `undefined` : pas encore lu ; `null` : rien de mémorisé.
  const [connus, setConnus] = useState<Set<string> | null | undefined>(undefined)
  useEffect(() => {
    void fasciculesConnus().then((c) => setConnus((avant) => (avant === undefined ? c : avant)))
  }, [])
  // Première fois : ce qui est déjà débloqué devient la référence, rien n'est nouveau.
  const informe = (etat?.fascicules_debloques ?? []).length > 0
  useEffect(() => {
    if (connus !== null || !informe) return
    const reference = new Set(debloques)
    void memoriserFasciculesConnus(reference).then(() => setConnus((avant) => avant ?? reference))
  }, [connus, informe, debloques])
  const marquerVu = useCallback((fascicule: string) => {
    setConnus((avant) => {
      if (!avant || avant.has(fascicule)) return avant
      const suite = new Set(avant).add(fascicule)
      void memoriserFasciculesConnus(suite)
      return suite
    })
  }, [])
  const nouveaux = useMemo(() => nouveauxFascicules(debloques, connus ?? null), [debloques, connus])
  return useMemo(() => ({ debloques, nouveaux, marquerVu }), [debloques, nouveaux, marquerVu])
}
