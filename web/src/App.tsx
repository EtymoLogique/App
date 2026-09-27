import { useState } from 'react'

import { Decouvertes } from './composants/Decouvertes'
import { Fascicules } from './composants/Fascicules'
import { Fiche } from './composants/Fiche'
import { Icone } from './composants/Icone'
import { Navigation, type Onglet } from './composants/Navigation'
import { Reglages } from './composants/Reglages'
import { Reserve } from './composants/Reserve'
import { Resultat } from './composants/Resultat'
import { Table } from './composants/Table'
import type { ClientApi } from './services/api'
import type { LecteurCatalogue } from './services/catalogue'
import { TABLE_MIN, decouvertePossible, totalMots } from './services/jeu'
import { usePartie } from './services/partie'
import { useReglages } from './services/reglages'
import { useEnLigne } from './services/reseau'

interface Props {
  api: ClientApi
  catalogue: LecteurCatalogue
}

export function App({ api, catalogue }: Props) {
  const partie = usePartie(api, catalogue)
  const enLigne = useEnLigne()
  const { reglages, changer } = useReglages()
  const [onglet, setOnglet] = useState<Onglet>('table')
  const { jeu, etat } = partie
  const catalogueJeu = jeu.etat === 'pret' ? jeu.valeur : null
  const total = catalogueJeu ? totalMots(catalogueJeu) : 0
  const exemplaires = etat?.reserve.reduce((n, e) => n + e.exemplaires, 0) ?? 0

  const bloquee = !enLigne
    ? 'Hors ligne : la fusion attendra le retour du réseau.'
    : !etat
      ? 'Votre réserve n’est pas encore chargée.'
      : null
  const prete = bloquee === null && partie.table.length >= TABLE_MIN
  const numero = partie.fiche && etat?.decouvertes.find((d) => d.mot_id === partie.fiche?.motId)?.numero
  const bloque =
    catalogueJeu && etat && partie.table.length === 0
      ? !decouvertePossible(catalogueJeu, etat.reserve, new Set(etat.decouvertes.map((d) => d.mot_id)))
      : false
  const allerAuxPlis = () => {
    partie.fermerFiche()
    setOnglet('plis')
  }

  const ecran = (id: Onglet) => ({ hidden: onglet !== id, className: 'ecran' })

  return (
    <div className="coque">
      <Navigation
        actif={onglet}
        compteurs={{ codex: onglet === 'codex' ? 0 : partie.nouvelles }}
        onChoisir={(o) => {
          if (o === 'codex' || onglet === 'codex') partie.codexVu()
          setOnglet(o)
        }}
      />

      <div className="contenu">
        <header className="entete">
          <a className="wordmark" href="/" aria-label="ÉtymoLogique, accueil">
            <span className="seal" aria-hidden="true">
              ÉL
            </span>
            ÉtymoLogique
          </a>
          {etat && <span className="chip">Profil invité</span>}
        </header>

        <main className="page">
          {!enLigne && (
            <p className="banniere" role="status">
              <Icone nom="horsLigne" />
              <span>Hors ligne. Votre codex, votre réserve et la table restent disponibles ; la fusion attendra le retour du réseau.</span>
            </p>
          )}
          {partie.erreurEtat && (
            <p className="banniere" role="alert">
              <Icone nom="info" />
              <span>{partie.erreurEtat} Votre progression confirmée n’est pas perdue.</span>
            </p>
          )}
          {jeu.etat === 'erreur' && (
            <p className="banniere" role="alert">
              <Icone nom="info" />
              <span>{jeu.message}</span>
            </p>
          )}

          {jeu.etat === 'attente' && (
            <div className="lancement" aria-live="polite">
              <span className="seal" aria-hidden="true">
                ÉL
              </span>
              <p>Chargement du catalogue…</p>
            </div>
          )}
          {jeu.etat === 'pret' && !catalogueJeu && (
            <div className="empty">
              <p>Aucun fascicule n’est encore paru.</p>
            </div>
          )}

          {catalogueJeu && (
            <>
              <section {...ecran('table')}>
                <h1 id="titre-table" className="sr-only">
                  Table de fusion
                </h1>
                <div className="jeu">
                  <section className={prete ? 'panel table-panel ready' : 'panel table-panel'} aria-label="Table de fusion">
                    <div className="panel-head">
                      <h2>Table de fusion</h2>
                      <span className="status">{prete ? 'Prête' : `${partie.table.length} / ${TABLE_MIN} au moins`}</span>
                    </div>
                    {bloque ? (
                      <div className="empty">
                        <span className="ill" aria-hidden="true">
                          ?
                        </span>
                        <h3>Plus de découverte possible</h3>
                        <p>Votre réserve ne permet plus de nouveau mot pour l’instant. Les plis apportent de nouveaux exemplaires.</p>
                        <button type="button" className="btn btn-secondary" onClick={allerAuxPlis}>
                          Aller aux plis
                        </button>
                      </div>
                    ) : (
                      <Table
                        table={partie.table}
                        briques={catalogueJeu.briques}
                        enAttente={partie.enAttente}
                        bloquee={bloquee}
                        secousse={partie.secousse}
                        onAjouter={partie.ajouter}
                        onDeplacer={partie.deplacer}
                        onRetirer={partie.retirer}
                        onVider={partie.vider}
                        onFusionner={() => void partie.fusionner()}
                      />
                    )}
                    <Resultat retour={partie.retour} jeu={catalogueJeu} onOuvrirFiche={partie.ouvrirFiche} />
                  </section>

                  <section className="panel reserve-panel" aria-labelledby="titre-reserve">
                    <div className="panel-head">
                      <h2 id="titre-reserve">Réserve</h2>
                      <span className="count">{exemplaires} ex.</span>
                    </div>
                    {etat ? (
                      <Reserve
                        reserve={etat.reserve}
                        briques={catalogueJeu.briques}
                        table={partie.table}
                        consommees={partie.consommees}
                        onAjouter={partie.ajouter}
                        onIndisponible={partie.signaler}
                      />
                    ) : (
                      <p className="panel-tip" aria-live="polite">
                        Chargement de votre réserve…
                      </p>
                    )}
                    <p className="panel-tip">Se tromper ne coûte rien : seule une découverte consomme un exemplaire de chaque brique.</p>
                  </section>
                </div>
              </section>

              <section {...ecran('codex')} aria-labelledby="titre-codex">
                <h1 id="titre-codex">Codex</h1>
                <Decouvertes decouvertes={etat?.decouvertes ?? []} jeu={catalogueJeu} total={total} onOuvrirFiche={partie.ouvrirFiche} />
              </section>

              <section {...ecran('plis')} aria-labelledby="titre-plis">
                <h1 id="titre-plis">Plis</h1>
                <p className="banniere">
                  <Icone nom="info" />
                  <span>L’ouverture des plis arrive bientôt. Vos briques restent toutes jouables sur la table.</span>
                </p>
                <h2>Fascicules parus</h2>
                <Fascicules parus={catalogueJeu.fascicules} catalogue={catalogue} />
              </section>
            </>
          )}

          <section {...ecran('reglages')} aria-labelledby="titre-reglages">
            <h1 id="titre-reglages">Réglages</h1>
            <Reglages reglages={reglages} onChanger={changer} />
          </section>

          {catalogueJeu && partie.fiche && (
            <Fiche
              motId={partie.fiche.motId}
              consommees={partie.fiche.consommees}
              numero={numero ?? undefined}
              total={total}
              jeu={catalogueJeu}
              reserve={etat?.reserve ?? []}
              onFermer={partie.fermerFiche}
              onPlis={allerAuxPlis}
            />
          )}
        </main>
      </div>
    </div>
  )
}
