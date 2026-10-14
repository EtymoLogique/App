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
import { lienDeConnexion } from './services/compte'

// Le jeton d'un lien de connexion quitte l'adresse avant tout rendu (ADR 0070).
lienDeConnexion()

const racine = document.getElementById('root')
if (!racine) throw new Error('Élément #root introuvable')

createRoot(racine).render(
  <StrictMode>
    <App api={new ClientApi(config.urlApi)} catalogue={new LecteurCatalogue(config.urlCatalogue)} />
    <MiseAJour />
  </StrictMode>,
)
