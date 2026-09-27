import { useEffect, useState } from 'react'

import type { EntreeFascicule, Etat, Manifeste } from './contrat'
import { EnLigne } from './composants/EnLigne'
import { Fascicules } from './composants/Fascicules'
import { type ClientApi, ErreurApi } from './services/api'
import type { LecteurCatalogue } from './services/catalogue'

export interface FasciculeParu {
  entree: EntreeFascicule
  manifeste: Manifeste
}

type Chargement<T> = { etat: 'attente' } | { etat: 'pret'; valeur: T } | { etat: 'erreur'; message: string }

interface Props {
  api: ClientApi
  catalogue: LecteurCatalogue
}

function message(e: unknown): string {
  if (e instanceof ErreurApi && e.code === 'reseau') return 'Le serveur est injoignable pour le moment.'
  if (e instanceof ErreurApi && e.code === 'trop_de_requetes') return 'Trop de tentatives : réessayez dans une minute.'
  return 'Une erreur est survenue. Réessayez plus tard.'
}

export function App({ api, catalogue }: Props) {
  const [profil, setProfil] = useState<Chargement<Etat>>({ etat: 'attente' })
  const [parus, setParus] = useState<Chargement<FasciculeParu[]>>({ etat: 'attente' })

  useEffect(() => {
    let actif = true
    api
      .etat()
      .then((valeur) => actif && setProfil({ etat: 'pret', valeur }))
      .catch((e: unknown) => actif && setProfil({ etat: 'erreur', message: message(e) }))

    catalogue
      .index()
      .then(async (index) => {
        const entrees = index?.fascicules ?? []
        return Promise.all(
          entrees.map(async (entree): Promise<FasciculeParu> => ({ entree, manifeste: await catalogue.manifeste(entree.manifeste) })),
        )
      })
      .then((valeur) => actif && setParus({ etat: 'pret', valeur }))
      .catch(() => actif && setParus({ etat: 'erreur', message: 'Le catalogue est illisible pour le moment.' }))

    return () => {
      actif = false
    }
  }, [api, catalogue])

  return (
    <>
      <header className="entete">
        <a className="marque" href="/" aria-label="ÉtymoLogique, accueil">
          <span className="sceau" aria-hidden="true">
            ÉL
          </span>
          ÉtymoLogique
        </a>
        <div className="statuts">
          <EnLigne />
          {profil.etat === 'pret' && <span className="pastille">Profil invité</span>}
        </div>
      </header>

      <main className="page">
        {profil.etat === 'erreur' && (
          <p className="alerte" role="alert">
            {profil.message}
          </p>
        )}

        <h1>Fascicules parus</h1>
        {parus.etat === 'attente' && <p aria-live="polite">Chargement du catalogue…</p>}
        {parus.etat === 'erreur' && (
          <p className="alerte" role="alert">
            {parus.message}
          </p>
        )}
        {parus.etat === 'pret' && <Fascicules parus={parus.valeur} catalogue={catalogue} />}
      </main>
    </>
  )
}
