import { useMemo, useState } from 'react'

import { Codex } from './composants/Codex'
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
import { construireCodex } from './services/codex'
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
  const statut = prete ? 'Hypothèse prête' : partie.table.length === 1 ? 'Une brique posée' : partie.table.length > 1 ? `${partie.table.length} briques posées` : 'En attente'
  const entrees = useMemo(
    () => (catalogueJeu ? construireCodex(catalogueJeu, etat, (chemin) => catalogue.url(chemin)) : []),
    [catalogueJeu, etat, catalogue],
  )
  const numero = partie.fiche && etat?.decouvertes.find((d) => d.mot_id === partie.fiche?.motId)?.numero
  const bloque =
    catalogueJeu && etat && partie.table.length === 0
      ? !decouvertePossible(catalogueJeu, etat.reserve, new Set(etat.decouvertes.map((d) => d.mot_id)))
      : false
  const allerAuCodex = () => {
    partie.fermerFiche()
    setOnglet('codex')
  }
  const allerAuxPlis = () => {
    partie.fermerFiche()
    setOnglet('plis')
  }

  const ecran = (id: Onglet) => ({ hidden: onglet !== id, className: 'ecran' })

  return (
    <div className="coque">
      <Navigation
        actif={onglet}
        compteurs={{ codex: partie.nouvelles.size }}
        onChoisir={setOnglet}
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
                <h1 className="sr-only">Table de fusion</h1>
                <div className="fond-jeu">
                  <div className="jeu">
                    <section
                      className={['panel', 'table-panel', prete ? 'ready' : '', partie.fiche ? 'showing' : ''].filter(Boolean).join(' ')}
                      aria-label="Table de fusion"
                    >
                      <div className="panel-head">
                        <span>Table de fusion</span>
                        <span className="status">{statut}</span>
                      </div>
                      {partie.fiche ? (
                        <Fiche
                          motId={partie.fiche.motId}
                          consommees={partie.fiche.consommees}
                          numero={numero ?? undefined}
                          total={total}
                          jeu={catalogueJeu}
                          reserve={etat?.reserve ?? []}
                          onFermer={partie.fermerFiche}
                          onPlis={allerAuxPlis}
                          onCodex={() => allerAuCodex()}
                        />
                      ) : bloque ? (
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
                        <>
                          <Table
                            table={partie.table}
                            briques={catalogueJeu.briques}
                            enAttente={partie.enAttente}
                            bloquee={bloquee}
                            secousse={partie.secousse}
                            maximum={partie.maximum}
                            onPoser={partie.poser}
                            onDeplacer={partie.deplacer}
                            onRetirer={partie.retirer}
                            onVider={partie.vider}
                            onFusionner={() => void partie.fusionner()}
                          />
                          <Resultat retour={bloquee && partie.table.length > 0 ? { etat: 'message', texte: bloquee } : partie.retour} jeu={catalogueJeu} onOuvrirFiche={partie.ouvrirFiche} />
                        </>
                      )}
                    </section>

                    <section className="panel reserve-panel" aria-labelledby="titre-reserve">
                      <div className="panel-head">
                        <h2 id="titre-reserve">Réserve · exemplaires</h2>
                        <span className="count" aria-label="Exemplaires disponibles">
                          {exemplaires}
                        </span>
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
                      <p className="panel-tip">Glissez une brique sur la table, ou touchez-la pour la poser. Le chiffre indique les exemplaires disponibles.</p>
                      <button type="button" className="panel-link" onClick={allerAuxPlis}>
                        Plus d’exemplaires ? Ouvrir un pli →
                      </button>
                    </section>
                  </div>
                  <Decouvertes mots={entrees.filter((e) => e.resultat)} onOuvrirFiche={partie.ouvrirFiche} onCodex={() => allerAuCodex()} />
                </div>
              </section>

              <section {...ecran('codex')} aria-labelledby="titre-codex">
                <h1 id="titre-codex" className="sr-only">
                  Codex
                </h1>
                <Codex entrees={entrees} jeu={catalogueJeu} nouvelles={partie.nouvelles} onVue={partie.carteVue} />
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

        </main>
      </div>
    </div>
  )
}
