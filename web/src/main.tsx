import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './styles.css'
import './codex.css'
import './plis.css'
import { App } from './App'
import { config } from './config'
import { ClientApi } from './services/api'
import { LecteurCatalogue } from './services/catalogue'

const racine = document.getElementById('root')
if (!racine) throw new Error('Élément #root introuvable')

createRoot(racine).render(
  <StrictMode>
    <App api={new ClientApi(config.urlApi)} catalogue={new LecteurCatalogue(config.urlCatalogue)} />
  </StrictMode>,
)
