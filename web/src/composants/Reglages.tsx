import { useState } from 'react'

import type { Mouvement, Reglages as R, Retours, Theme } from '../services/reglages'
import { Icone } from './Icone'

interface Props {
  reglages: R
  onChanger: (modif: Partial<R>) => void
  /** Défini hors production seulement : le bouton n'apparaît pas sans lui. */
  onReinitialiser?: () => Promise<string | null>
  /** Groupe « Compte », en tête (I-33). */
  compte?: React.ReactNode
  /** Carte « Soutenir » (ADR 0078), tout en haut. */
  soutien?: React.ReactNode
}

function Choix<T extends string>({ nom, legende, valeur, options, onChoisir }: {
  nom: string
  legende: string
  valeur: T
  options: [T, string][]
  onChoisir: (v: T) => void
}) {
  return (
    <section className="reglage" role="group" aria-label={legende}>
      <h2>{legende}</h2>
      <div className="segments">
        {options.map(([v, libelle]) => (
          <label key={v} className={v === valeur ? 'on' : undefined}>
            <input type="radio" name={nom} value={v} checked={v === valeur} onChange={() => onChoisir(v)} />
            {libelle}
          </label>
        ))}
      </div>
    </section>
  )
}

/** Hors production : remet le joueur à zéro, après confirmation (irréversible). */
function Reinitialisation({ onReinitialiser }: { onReinitialiser: () => Promise<string | null> }) {
  const [confirmer, setConfirmer] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [retour, setRetour] = useState<string | null>(null)
  const valider = async () => {
    setEnvoi(true)
    const erreur = await onReinitialiser()
    setEnvoi(false)
    setConfirmer(false)
    setRetour(erreur ?? 'Partie réinitialisée : codex vide, 10 000 gouttes.')
  }
  return (
    <section className="reglage">
      <h2>Hors production</h2>
      <p className="panel-tip">Efface le codex, la réserve et la progression, et rend 10 000 gouttes. Irréversible.</p>
      {confirmer ? (
        <div className="segments">
          <button type="button" className="btn btn-primary" disabled={envoi} onClick={() => void valider()}>
            Confirmer la réinitialisation
          </button>
          <button type="button" className="btn btn-secondary" disabled={envoi} onClick={() => setConfirmer(false)}>
            Annuler
          </button>
        </div>
      ) : (
        <div className="segments">
          <button type="button" className="btn btn-secondary" onClick={() => { setRetour(null); setConfirmer(true) }}>
            Réinitialiser
          </button>
        </div>
      )}
      {retour && <p className="panel-tip" role="status">{retour}</p>}
    </section>
  )
}

/** Réglages (I-24), contenu du MVP en cours : compte, apparence, mouvement, sons et vibrations, réseaux sociaux, licences et contact. */
export function Reglages({ reglages, onChanger, onReinitialiser, compte, soutien }: Props) {
  return (
    <div className="reglages">
      {soutien}
      {compte}
      <Choix<Theme>
        nom="theme"
        legende="Apparence"
        valeur={reglages.theme}
        options={[
          ['systeme', 'Système'],
          ['atelier', 'Atelier'],
          ['nocturne', 'Nocturne'],
        ]}
        onChoisir={(theme) => onChanger({ theme })}
      />
      <Choix<Mouvement>
        nom="mouvement"
        legende="Animations"
        valeur={reglages.mouvement}
        options={[
          ['systeme', 'Selon le système'],
          ['reduit', 'Réduites'],
        ]}
        onChoisir={(mouvement) => onChanger({ mouvement })}
      />
      <Choix<Retours>
        nom="retours"
        legende="Sons et vibrations"
        valeur={reglages.retours}
        options={[
          ['actifs', 'Activés'],
          ['coupes', 'Coupés'],
        ]}
        onChoisir={(retours) => onChanger({ retours })}
      />
      {onReinitialiser && <Reinitialisation onReinitialiser={onReinitialiser} />}
      <section className="reglage">
        <h2>Suivre le projet</h2>
        <p className="panel-tip">Suivez-nous pour soutenir le jeu et ne rien manquer de son actualité.</p>
        <div className="segments">
          <a className="btn btn-secondary" href="https://www.instagram.com/etymologique_fr/" rel="noreferrer" aria-label="Instagram" title="Instagram"><Icone nom="instagram" /></a>
          <a className="btn btn-secondary" href="https://x.com/etymologique_fr" rel="noreferrer" aria-label="X" title="X"><Icone nom="x" /></a>
        </div>
      </section>
      <section className="reglage">
        <h2>Licences et contact</h2>
        <p className="panel-tip">
          Code sous licence AGPL 3.0 ou ultérieure, contenu sous CC BY-SA 4.0. Le nom et le logo ÉtymoLogique sont réservés.
        </p>
        <p className="panel-tip">
          <a href="https://github.com/EtymoLogique/App" rel="noreferrer">Code source</a> · <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noreferrer">Texte de l’AGPL 3.0</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr" rel="noreferrer">Texte de la CC BY-SA 4.0</a> · <a href="/licences-dependances.txt">Licences des dépendances</a>
        </p>
        <p className="panel-tip">
          Les données lexicales viennent de <a href="https://www.wikidata.org/" rel="noreferrer">Wikidata</a> (CC0).
        </p>
        <p className="panel-tip">
          Une question, ou une demande sur vos données (accès, copie, effacement) : <a href="mailto:contact@etymologique.fr">contact@etymologique.fr</a>. Réponse sous un mois.
        </p>
        <p className="panel-tip">
          <a href="/mentions-legales.html">Mentions légales</a> · <a href="/donnees-personnelles.html">Données personnelles</a> · <a href="/conditions-utilisation.html">Conditions d’utilisation</a>
        </p>
      </section>
    </div>
  )
}
