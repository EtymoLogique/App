import { useCallback, useMemo, useState } from 'react'

import { Codex } from './composants/Codex'
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
import { completude, construireCodex } from './services/codex'
import { TABLE_MIN, decouvertePossible } from './services/jeu'
import { usePartie } from './services/partie'
import { useReglages } from './services/reglages'
import { useEnLigne } from './services/reseau'

interface Props {
  api: ClientApi
  catalogue: LecteurCatalogue
}

/** En-tête d'un écran (maquettes) : son titre en serif et ses outils. */
function EnTete({ titre, id, children }: { titre: string; id: string; children?: React.ReactNode }) {
  return (
    <header className="ecran-tete">
      <h1 id={id}>{titre}</h1>
      {children && <div className="ecran-outils">{children}</div>}
    </header>
  )
}

export function App({ api, catalogue }: Props) {
  const partie = usePartie(api, catalogue)
  const enLigne = useEnLigne()
  const { reglages, changer } = useReglages()
  const [onglet, setOnglet] = useState<Onglet>('table')
  const [carteAOuvrir, setCarteAOuvrir] = useState<string | null>(null)
  const { jeu, etat } = partie
  const catalogueJeu = jeu.etat === 'pret' ? jeu.valeur : null
  const entrees = useMemo(
    () => (catalogueJeu ? construireCodex(catalogueJeu, etat, (chemin) => catalogue.url(chemin)) : []),
    [catalogueJeu, etat, catalogue],
  )
  const mots = entrees.filter((e) => e.resultat)
  const motsTrouves = completude(mots).trouvees
  // Exemplaires disponibles : ceux posés sur la table sont réservés.
  const exemplaires = (etat?.reserve.reduce((n, e) => n + e.exemplaires, 0) ?? 0) - partie.table.length

  const bloquee = !enLigne
    ? 'Hors ligne : la fusion attendra le retour du réseau.'
    : !etat
      ? 'Votre réserve n’est pas encore chargée.'
      : null
  const prete = bloquee === null && partie.table.length >= TABLE_MIN
  const statut = prete ? 'Hypothèse prête' : partie.table.length === 1 ? 'Une brique posée' : 'En attente'
  const raisonFusion = bloquee ?? (partie.table.length < TABLE_MIN ? 'Posez deux briques pour fusionner.' : null)
  const bloque =
    catalogueJeu && etat && partie.table.length === 0
      ? !decouvertePossible(catalogueJeu, etat.reserve, new Set(etat.decouvertes.map((d) => d.mot_id)))
      : false

  const allerAuCodex = useCallback(
    (motId?: string) => {
      partie.fermerFiche()
      setCarteAOuvrir(motId ?? null)
      setOnglet('codex')
    },
    [partie],
  )
  const allerAuxPlis = () => {
    partie.fermerFiche()
    setOnglet('plis')
  }
  const fiche = partie.fiche
  const ecran = (id: Onglet) => ({ hidden: onglet !== id, className: `ecran ecran-${id}`, 'aria-labelledby': `titre-${id}` })

  return (
    <div className="coque">
      <Navigation actif={onglet} compteurs={{ codex: partie.nouvelles.size }} onChoisir={setOnglet} />

      <div className="contenu">
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
                <EnTete titre="Table" id="titre-table">
                  <span className="mono">
                    {motsTrouves} / {mots.length} mots
                  </span>
                  <button type="button" className="btn-icone" aria-label="Ouvrir le codex" onClick={() => allerAuCodex()}>
                    <Icone nom="codex" />
                  </button>
                </EnTete>

                <div className="jeu">
                  <section className={prete ? 'panel table-panel ready' : 'panel table-panel'} aria-label="Table de fusion">
                    <div className="panel-head">
                      <span>Table de fusion</span>
                      <span className="status">{statut}</span>
                    </div>
                    {bloque ? (
                      <div className="empty">
                        <span className="ill" aria-hidden="true">
                          ?
                        </span>
                        <h3>Aucun mot possible pour l’instant</h3>
                        <p>Vos briques ne forment plus de nouveau mot. Vous pouvez toujours essayer : se tromper ne coûte rien.</p>
                        <div className="rangee rangee-centree rangee-une-ligne">
                          <button type="button" className="btn btn-primary" onClick={allerAuxPlis}>
                            Aller aux plis
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => allerAuCodex()}>
                            Voir le codex
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Table
                          table={partie.table}
                          briques={catalogueJeu.briques}
                          enAttente={partie.enAttente}
                          secousse={partie.secousse}
                          fusion={partie.fusion}
                          onPoser={partie.poser}
                          onDeplacer={partie.deplacer}
                          onRetirer={partie.retirer}
                        />
                        <div className="actions">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void partie.fusionner()}
                            disabled={raisonFusion !== null || partie.enAttente}
                            title={raisonFusion ?? undefined}
                          >
                            {partie.enAttente ? 'Fusion…' : 'Fusionner'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={partie.vider} disabled={partie.table.length === 0 || partie.enAttente}>
                            Vider
                          </button>
                        </div>
                        <Resultat
                          retour={partie.retour}
                          jeu={catalogueJeu}
                          entrees={entrees}
                          posees={partie.table.length}
                          bloquee={bloquee}
                          onInverser={partie.inverser}
                          onVoirCarte={(id) => allerAuCodex(id)}
                          onVider={partie.vider}
                        />
                      </>
                    )}
                  </section>

                  <section className="panel reserve-panel" aria-labelledby="titre-reserve">
                    <div className="rangee rangee-ecartee">
                      <h2 id="titre-reserve" className="panel-k">
                        Réserve · {exemplaires} exemplaire{exemplaires > 1 ? 's' : ''}
                      </h2>
                      <span className="mono">Tri : récentes</span>
                    </div>
                    {etat ? (
                      <Reserve
                        reserve={etat.reserve}
                        briques={catalogueJeu.briques}
                        table={partie.table}
                        consommees={partie.consommees}
                        onAjouter={partie.ajouter}
                        onIndisponible={(texte) => partie.signaler(texte, 'hint')}
                      />
                    ) : (
                      <p className="panel-tip" aria-live="polite">
                        Chargement de votre réserve…
                      </p>
                    )}
                    <p className="panel-tip">Glissez une brique sur la table, ou touchez-la pour la poser. Le chiffre indique les exemplaires disponibles.</p>
                  </section>
                </div>


              </section>

              <section {...ecran('codex')}>
                <EnTete titre="Codex" id="titre-codex" />
                <Codex
                  entrees={entrees}
                  jeu={catalogueJeu}
                  nouvelles={partie.nouvelles}
                  onVue={partie.carteVue}
                  aOuvrir={onglet === 'codex' ? carteAOuvrir : null}
                  onOuverte={() => setCarteAOuvrir(null)}
                />
              </section>

              <section {...ecran('plis')}>
                <EnTete titre="Plis" id="titre-plis" />
                <p className="banniere">
                  <Icone nom="info" />
                  <span>L’ouverture des plis arrive bientôt. Vos briques restent toutes jouables sur la table.</span>
                </p>
                <h2>Fascicules parus</h2>
                <Fascicules parus={catalogueJeu.fascicules} catalogue={catalogue} />
              </section>

              {fiche && (
                <Fiche
                  motId={fiche.motId}
                  consommees={fiche.consommees}
                  entree={entrees.find((e) => e.id === fiche.motId)}
                  jeu={catalogueJeu}
                  reserve={etat?.reserve ?? []}
                  onFermer={partie.fermerFiche}
                  onCodex={() => allerAuCodex(fiche.motId)}
                />
              )}
            </>
          )}

          <section {...ecran('reglages')}>
            <EnTete titre="Réglages" id="titre-reglages" />
            <Reglages reglages={reglages} onChanger={changer} />
          </section>
        </main>
      </div>
    </div>
  )
}
