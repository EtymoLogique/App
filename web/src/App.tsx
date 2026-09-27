import { EnLigne } from './composants/EnLigne'
import { Decouvertes } from './composants/Decouvertes'
import { Fascicules } from './composants/Fascicules'
import { Fiche } from './composants/Fiche'
import { Reserve } from './composants/Reserve'
import { Resultat } from './composants/Resultat'
import { Table } from './composants/Table'
import type { ClientApi } from './services/api'
import type { LecteurCatalogue } from './services/catalogue'
import { usePartie } from './services/partie'
import { useEnLigne } from './services/reseau'

interface Props {
  api: ClientApi
  catalogue: LecteurCatalogue
}

export function App({ api, catalogue }: Props) {
  const partie = usePartie(api, catalogue)
  const enLigne = useEnLigne()
  const { jeu, etat } = partie
  const catalogueJeu = jeu.etat === 'pret' ? jeu.valeur : null

  const bloquee = !enLigne
    ? 'Hors connexion : la fusion attend le réseau.'
    : !etat
      ? 'Votre réserve n’est pas encore chargée.'
      : null

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
          {etat && <span className="pastille">Profil invité</span>}
        </div>
      </header>

      <main className="page">
        {partie.erreurEtat && (
          <p className="alerte" role="alert">
            {partie.erreurEtat}
          </p>
        )}
        {jeu.etat === 'attente' && <p aria-live="polite">Chargement du catalogue…</p>}
        {jeu.etat === 'erreur' && (
          <p className="alerte" role="alert">
            {jeu.message}
          </p>
        )}
        {jeu.etat === 'pret' && !catalogueJeu && <p>Aucun fascicule n’est encore paru.</p>}

        {catalogueJeu && (
          <>
            <section className="zone zone-table" aria-labelledby="titre-table">
              <h1 id="titre-table">Table de fusion</h1>
              <Table
                table={partie.table}
                briques={catalogueJeu.briques}
                enAttente={partie.enAttente}
                bloquee={bloquee}
                onAjouter={partie.ajouter}
                onDeplacer={partie.deplacer}
                onRetirer={partie.retirer}
                onVider={partie.vider}
                onFusionner={() => void partie.fusionner()}
              />
              <Resultat retour={partie.retour} jeu={catalogueJeu} onOuvrirFiche={partie.ouvrirFiche} />
            </section>

            <section className="zone" aria-labelledby="titre-reserve">
              <h2 id="titre-reserve">Réserve</h2>
              {etat ? (
                <Reserve
                  reserve={etat.reserve}
                  briques={catalogueJeu.briques}
                  table={partie.table}
                  onAjouter={partie.ajouter}
                />
              ) : (
                <p aria-live="polite">Chargement de votre réserve…</p>
              )}
            </section>

            <section className="zone" aria-labelledby="titre-decouvertes">
              <h2 id="titre-decouvertes">Découvertes</h2>
              <Decouvertes decouvertes={etat?.decouvertes ?? []} jeu={catalogueJeu} onOuvrirFiche={partie.ouvrirFiche} />
            </section>

            <section className="zone" aria-labelledby="titre-fascicules">
              <h2 id="titre-fascicules">Fascicules parus</h2>
              <Fascicules parus={catalogueJeu.fascicules} catalogue={catalogue} />
            </section>

            {partie.fiche && (
              <Fiche
                motId={partie.fiche.motId}
                consommees={partie.fiche.consommees}
                jeu={catalogueJeu}
                reserve={etat?.reserve ?? []}
                onFermer={partie.fermerFiche}
              />
            )}
          </>
        )}
      </main>
    </>
  )
}
