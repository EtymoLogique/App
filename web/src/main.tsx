import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles.css'
import './codex.css'
import './plis.css'
import './quetes.css'
import './ricochets.css'
import { App } from './App'
import { MiseAJour } from './composants/MiseAJour'
import { config } from './config'
import { ClientApi } from './services/api'
import { LecteurCatalogue } from './services/catalogue'
import { demanderStockagePersistant } from './services/prechargement'
import { reseau } from './services/reseau'

const racine = document.getElementById('root')
if (!racine) throw new Error('Élément #root introuvable')

const api = new ClientApi(config.urlApi)
// La sonde du retour du réseau : un seul essai sur `/sante` (ADR 0085).
reseau.configurerSonde(() => api.sonder())
demanderStockagePersistant()

createRoot(racine).render(
  <StrictMode>
    <App api={api} catalogue={new LecteurCatalogue(config.urlCatalogue)} />
    <MiseAJour />
  </StrictMode>,
)
