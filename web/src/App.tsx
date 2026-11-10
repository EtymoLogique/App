import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Boutique } from './composants/Boutique'
import { CarteSeule, Codex } from './composants/Codex'
import { Indices } from './composants/Indices'
import { Icone } from './composants/Icone'
import { Navigation, type Onglet } from './composants/Navigation'
import { Plis } from './composants/Plis'
import { Quetes } from './composants/Quetes'
import { Reglages } from './composants/Reglages'
import { Ricochets } from './composants/Ricochets'
import { ReserveModale } from './composants/ReserveModale'
import { Resultat } from './composants/Resultat'
import { Table } from './composants/Table'
import type { ClientApi } from './services/api'
import type { LecteurCatalogue } from './services/catalogue'
import { construireCodex } from './services/codex'
import { indiceCourant } from './services/indices'
import { TABLE_MIN, decouvertePossible } from './services/jeu'
import { usePartie } from './services/partie'
import { useReglages } from './services/reglages'
import { useRoute } from './services/route'
import { useEnergieAnimee } from './services/animation'
import { useMaintenant } from './services/horloge'
import { energieA } from './services/plis'
import { quetesDeFascicule, recompensesARecuperer } from './services/quetes'
import { useReseau } from './services/reseau'
import { useAttente } from './services/attente'
import { prechargerAuRepos } from './services/prechargement'
import { PastilleReseau } from './composants/PastilleReseau'

interface Props {
  api: ClientApi
  catalogue: LecteurCatalogue
}

/** En-tête d'un écran (maquettes) : son titre en serif et ses outils. */
function EnTete({ titre, id, pastille, children }: { titre: string; id: string; pastille?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="ecran-tete">
      <h1 id={id}>{titre}</h1>
      {(children || pastille) && (
        <div className="ecran-outils">
          {pastille}
          {children}
        </div>
      )}
    </header>
  )
}

/** Hors ligne, la table se prépare ; la fusion attend le réseau (ADR 0085). */
const HORS_LIGNE_TABLE = 'Hors ligne : préparez votre table, la fusion attend le réseau.'
const HORS_LIGNE_ACTION = 'Hors ligne : cette action attend le réseau.'

export function App({ api, catalogue }: Props) {
  const { niveau } = useReseau()
  const enLigne = niveau !== 'hors_ligne'
  const partie = usePartie(api, catalogue, enLigne)
  const attente = useAttente(partie.enAttente)
  const { reglages, changer } = useReglages()
  // L'écran vit dans l'URL : un rechargement ramène exactement au même endroit.
  const [route, naviguer] = useRoute()
  const onglet = route.onglet
  // Le menu « Plis » ramène toujours au choix du fascicule.
  const setOnglet = useCallback((o: Onglet) => naviguer({ onglet: o, carte: null, pli: null, quete: null, plus: false }), [naviguer])
  const { jeu, etat } = partie
  // Plis prêts : compteur de l'onglet, rafraîchi quand une charge revient.
  const maintenant = useMaintenant()
  const { energie: energieAnimee, avance } = useEnergieAnimee(etat?.energie, maintenant)
  // Pendant le rituel d'ouverture d'un pli, l'encre et les nouveautés du codex restent celles d'avant.
  const [gel, setGel] = useState<{ encre: number | undefined; nouvelles: number } | null>(null)
  const encreAffichee = gel ? gel.encre : etat?.encre
  // Valeurs courantes lues au moment du gel ; `geler` reste stable pendant tout le rituel.
  const courantes = useRef({ encre: etat?.encre, nouvelles: partie.nouvelles.size })
  useEffect(() => {
    courantes.current = { encre: etat?.encre, nouvelles: partie.nouvelles.size }
  }, [etat?.encre, partie.nouvelles.size])
  const geler = useCallback((actif: boolean) => setGel(actif ? { ...courantes.current } : null), [])
  const energieNav = energieAnimee ? energieA(energieAnimee, maintenant) : null
  const plisPrets = energieNav?.charges ?? 0
  // Avancée de la recharge en cours, de 0 à 1 ; null quand l'énergie est pleine.
  const recharge = etat && energieNav?.prochaine != null ? 1 - (energieNav.prochaine - maintenant) / (etat.energie.recharge_s * 1000) : null
  const catalogueJeu = jeu.etat === 'pret' ? jeu.valeur : null
  const entrees = useMemo(
    () => (catalogueJeu ? construireCodex(catalogueJeu, etat) : []),
    [catalogueJeu, etat],
  )
  // Exemplaires disponibles : ceux posés sur la table sont réservés.
  const jalonsARecuperer = useMemo(
    () => new Set(catalogueJeu ? quetesDeFascicule(catalogueJeu, etat).filter((q) => q.etat === 'a_recuperer').map((q) => q.jalon.id) : []),
    [catalogueJeu, etat],
  )
  const exemplaires = (etat?.reserve.reduce((n, e) => n + e.exemplaires, 0) ?? 0) - partie.table.length

  // Hors ligne, la table reste à portée : seule la fusion attend le réseau.
  const bloquee = !etat ? 'Votre réserve n’est pas encore chargée.' : null
  const raisonFusion = bloquee ?? (partie.table.length < TABLE_MIN ? 'Posez deux briques pour fusionner.' : !enLigne ? HORS_LIGNE_TABLE : null)
  const prete = raisonFusion === null
  const statut = prete ? 'Hypothèse prête' : partie.table.length === 1 ? 'Une brique posée' : partie.table.length >= TABLE_MIN && !enLigne ? 'En attente du réseau' : 'En attente'
  // Sans silhouette à indicer, l'indice n'afficherait rien : le bouton disparaît.
  const indiceDisponible = catalogueJeu ? indiceCourant(catalogueJeu, entrees, etat) !== null : false
  const bloque =
    catalogueJeu && etat && partie.table.length === 0
      ? !decouvertePossible(catalogueJeu, etat.reserve, new Set(etat.decouvertes.map((d) => d.mot_id)))
      : false

  const allerAuCodex = useCallback(
    (motId?: string) => {
      partie.fermerFiche()
      // La carte demandée s'ouvre filtres levés, pour être sûre d'y être.
      naviguer(
        motId
          ? { onglet: 'codex', carte: motId, plus: false, vue: 'tout', filtre: 'tout', tri: 'n', inverse: false, fascicule: null }
          : { onglet: 'codex', carte: null, plus: false },
      )
    },
    [partie, naviguer],
  )
  const allerAuxPlis = () => {
    partie.fermerFiche()
    setOnglet('plis')
  }
  const ficheEntree = partie.fiche ? entrees.find((e) => e.id === partie.fiche?.motId) : undefined
  const lireMedia = useCallback(async (chemin: string) => new TextDecoder().decode(await catalogue.fichierHache(chemin)), [catalogue])
  const [indices, setIndices] = useState(false)
  const fermerIndices = useCallback(() => setIndices(false), [])
  // Réserve en modale : `rang` est la case touchée, `null` pour la case vide la plus à gauche.
  const [reserveOuverte, setReserveOuverte] = useState<{ rang: number | null; recherche?: string } | null>(null)
  const fermerReserve = useCallback(() => setReserveOuverte(null), [])
  // Table complétée depuis la réserve : à sa fermeture, le focus va à « Fusionner », la seule suite.
  const boutonFusion = useRef<HTMLButtonElement>(null)
  const focusFusion = useRef(false)
  const versFusion = useCallback(() => {
    focusFusion.current = true
  }, [])
  useEffect(() => {
    if (reserveOuverte || !focusFusion.current) return
    focusFusion.current = false
    boutonFusion.current?.focus({ preventScroll: true })
  }, [reserveOuverte])
  // Pendant que le réseau est bon, les médias des fascicules parus se gardent pour le tunnel suivant.
  const prechargeable = catalogueJeu !== null && niveau === 'en_ligne'
  useEffect(() => (prechargeable && catalogueJeu ? prechargerAuRepos(catalogueJeu, catalogue) : undefined), [prechargeable, catalogueJeu, catalogue])
  const pastille = <PastilleReseau synchroniseLe={partie.synchroniseLe} />
  const ecran = (id: Onglet) => ({ hidden: onglet !== id, className: `ecran ecran-${id}`, 'aria-labelledby': `titre-${id}` })

  return (
    <div className="coque">
      <Navigation
        actif={onglet}
        compteurs={{ codex: gel ? gel.nouvelles : partie.nouvelles.size, quetes: recompensesARecuperer(catalogueJeu, etat) }}
        onChoisir={setOnglet}
        ressources={etat ? { plis: plisPrets, capacite: etat.energie.capacite, gouttes: encreAffichee ?? 0, sabliers: etat.sabliers?.detenus ?? 0, recharge, avance } : undefined}
      />

      <div className="contenu">
        <main className="page">
          {partie.erreurEtat && (
            <p className="banniere" role="alert">
              <Icone nom="info" />
              <span>
                {partie.erreurEtat} Votre progression confirmée n’est pas perdue{enLigne ? '.' : ' : elle se mettra à jour au retour du réseau.'}
              </span>
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
                <EnTete titre="Table" id="titre-table" pastille={pastille} />
                {reserveOuverte && etat && (
                  <ReserveModale
                    reserve={etat.reserve}
                    briques={catalogueJeu.briques}
                    cases={partie.cases}
                    consommees={partie.consommees}
                    exemplaires={exemplaires}
                    rang={reserveOuverte.rang}
                    recherche={reserveOuverte.recherche}
                    onPoser={partie.poser}
                    onRetirer={partie.retirer}
                    onComplete={versFusion}
                    onFermer={fermerReserve}
                  />
                )}
                {indices && <Indices jeu={catalogueJeu} etat={etat} entrees={entrees} acheter={partie.acheterIndice} lireMedia={lireMedia} onFermer={fermerIndices} />}

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
                        <div className="rangee rangee-centree">
                          <button type="button" className="btn btn-primary" onClick={allerAuxPlis}>
                            Aller aux plis
                          </button>
                          {indiceDisponible && (
                            <button type="button" className="btn btn-indice" onClick={() => setIndices(true)} disabled={!etat}>
                              <Icone nom="indice" />
                              Indice
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        <Table
                          table={partie.cases}
                          briques={catalogueJeu.briques}
                          enAttente={partie.enAttente}
                          attente={attente}
                          secousse={partie.secousse}
                          fusion={partie.fusion}
                          onPoser={partie.poser}
                          onDeplacer={partie.deplacer}
                          onRetirer={partie.retirer}
                          onCaseVide={(rang) => bloquee === null && setReserveOuverte({ rang })}
                        />
                        <div className="actions">
                          <button
                            ref={boutonFusion}
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void partie.fusionner()}
                            disabled={raisonFusion !== null || partie.enAttente}
                            title={raisonFusion ?? undefined}
                          >
                            {partie.enAttente ? 'Fusion…' : 'Fusionner'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => setReserveOuverte({ rang: null })} disabled={bloquee !== null}>
                            <Icone nom="reserve" />
                            Réserve · {exemplaires}
                          </button>
                          {indiceDisponible && (
                            <button type="button" className="btn btn-indice" onClick={() => setIndices(true)} disabled={!etat}>
                              <Icone nom="indice" />
                              Indice
                            </button>
                          )}
                        </div>
                        <Resultat
                          retour={partie.retour}
                          jeu={catalogueJeu}
                          posees={partie.table.length}
                          bloquee={bloquee ?? (enLigne ? null : HORS_LIGNE_TABLE)}
                          attente={attente}
                          onReessayer={() => void partie.fusionner()}
                          onInverser={partie.inverser}
                          aRecuperer={jalonsARecuperer}
                          onQuetes={() => naviguer({ onglet: 'quetes', quete: 'fascicules', carte: null, pli: null, plus: false })}
                          briquesPosees={partie.table}
                          decouverts={new Set((etat?.decouvertes ?? []).map((d) => d.mot_id))}
                          onCarte={allerAuCodex}
                          onRemplacer={(rang, forme) => {
                            partie.retirer(rang)
                            setReserveOuverte({ rang, recherche: forme })
                          }}
                        />
                      </>
                    )}
                  </section>
                </div>


              </section>

              <section {...ecran('codex')}>
                <EnTete titre="Codex" id="titre-codex" pastille={pastille} />
                <Codex
                  entrees={entrees}
                  jeu={catalogueJeu}
                  joursDeJeu={etat?.jours_de_jeu}
                  nouvelles={partie.nouvelles}
                  onVue={partie.carteVue}
                  vue={route}
                  onChangerVue={naviguer}
                  urlMedia={(chemin) => catalogue.url(chemin)}
                  lireMedia={lireMedia}
                />
              </section>

              <section {...ecran('plis')}>
                <EnTete titre="Plis" id="titre-plis" pastille={pastille} />
                <Plis
                  jeu={catalogueJeu}
                  etat={etat}
                  fascicule={route.pli}
                  onChoisir={(f) => naviguer({ onglet: 'plis', pli: f })}
                  ouvrirPli={partie.ouvrirPli}
                  utiliserSabliers={partie.utiliserSabliers}
                  acheterEtAvancer={partie.acheterEtAvancer}
                  onEssayer={(brique) => {
                    // Pose la brique découverte à sa place : un préfixe en tête, un suffixe en queue, un mot dans la première case libre.
                    const nature = catalogueJeu.briques.get(brique)?.nature
                    const rang = nature === 'prefixe' ? 0 : nature === 'suffixe' ? partie.cases.length - 1 : partie.cases.indexOf(null)
                    const libres = (etat?.reserve.find((e) => e.brique_id === brique)?.exemplaires ?? 0) - partie.cases.filter((b) => b === brique).length
                    if (rang >= 0 && libres > 0) partie.poser(brique, rang)
                    setOnglet('table')
                  }}
                  onGeler={geler}
                  urlMedia={(chemin) => catalogue.url(chemin)}
                />
              </section>

              <section {...ecran('quetes')}>
                <EnTete titre="Quêtes" id="titre-quetes" pastille={pastille} />
                <Quetes
                  jeu={catalogueJeu}
                  etat={etat}
                  entrees={entrees}
                  vue={route}
                  onChangerVue={naviguer}
                  urlMedia={(chemin) => catalogue.url(chemin)}
                  recuperer={partie.recupererJalon}
                  recupererPalier={partie.recupererPalier}
                  inactif={enLigne ? null : HORS_LIGNE_ACTION}
                />
              </section>

              <section {...ecran('boutique')}>
                <EnTete titre="Boutique" id="titre-boutique" pastille={pastille} />
                <Boutique etat={etat} acheter={partie.acheterSabliers} />
              </section>

              {/* Fusion réussie, nouvelle ou déjà connue : la carte s'ouvre, la même qu'au codex. */}
              {ficheEntree && (
                <CarteSeule
                  key={ficheEntree.id}
                  entree={ficheEntree}
                  entrees={entrees}
                  jeu={catalogueJeu}
                  lireMedia={lireMedia}
                  onFermer={partie.fermerFiche}
                  onSuivreLien={allerAuCodex}
                />
              )}
            </>
          )}

          <section {...ecran('ricochets')}>
            <EnTete titre="Ricochets" id="titre-ricochets" pastille={pastille} />
            <Ricochets jeu={catalogueJeu} etat={etat} enLigne={enLigne} seance={partie.seanceRicochets} repondre={partie.repondreRicochet} entrees={entrees} lireMedia={lireMedia} onSuivreLien={allerAuCodex} />
          </section>

          <section {...ecran('reglages')}>
            <EnTete titre="Réglages" id="titre-reglages" pastille={pastille} />
            <Reglages reglages={reglages} onChanger={changer} onReinitialiser={partie.reinitialisable ? partie.reinitialiser : undefined} />
          </section>
        </main>
      </div>
    </div>
  )
}
