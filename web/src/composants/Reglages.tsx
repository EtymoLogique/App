import type { Mouvement, Reglages as R, Theme } from '../services/reglages'

interface Props {
  reglages: R
  onChanger: (modif: Partial<R>) => void
}

function Choix<T extends string>({ nom, legende, valeur, options, onChoisir }: {
  nom: string
  legende: string
  valeur: T
  options: [T, string][]
  onChoisir: (v: T) => void
}) {
  return (
    <fieldset className="reglage">
      <legend>{legende}</legend>
      <div className="segments">
        {options.map(([v, libelle]) => (
          <label key={v} className={v === valeur ? 'on' : undefined}>
            <input type="radio" name={nom} value={v} checked={v === valeur} onChange={() => onChoisir(v)} />
            {libelle}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Réglages (I-24), contenu du MVP en cours : apparence, mouvement, profil, licences. */
export function Reglages({ reglages, onChanger }: Props) {
  return (
    <div className="reglages">
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
      <section className="reglage">
        <h3>Profil invité</h3>
        <p className="panel-tip">
          Votre progression est liée à cet appareil. Aucun nom ni adresse électronique n’est demandé.
        </p>
      </section>
      <section className="reglage">
        <h3>Licences</h3>
        <p className="panel-tip">
          Code sous licence AGPL 3.0 ou ultérieure, contenu sous CC BY-SA 4.0. Le nom et le logo ÉtymoLogique sont réservés.
        </p>
      </section>
    </div>
  )
}
