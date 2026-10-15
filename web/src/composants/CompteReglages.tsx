import { useState } from 'react'

import type { CompteEtat } from '../contrat'
import { REGLE_PSEUDO } from '../services/compte'
import { useDialogue } from './useDialogue'

type Retour = { erreur: string; proposition?: string } | null

interface Props {
  /** Absent : partie invitée. */
  compte: CompteEtat | null | undefined
  enLigne: boolean
  onSauvegarder: () => void
  onSeConnecter: () => void
  changerPseudo: (pseudo: string) => Promise<Retour>
  deconnecter: () => Promise<string | null>
  supprimer: () => Promise<string | null>
}

/** Confirmer ou modifier le pseudo : feuille sur mobile, boîte centrée sur ordinateur. */
function Pseudo({ actuel, changer, onFermer }: { actuel: string; changer: Props['changerPseudo']; onFermer: () => void }) {
  const [valeur, setValeur] = useState(actuel)
  const [retour, setRetour] = useState<Retour>(null)
  const [envoi, setEnvoi] = useState(false)
  const [boite, fermer] = useDialogue<HTMLElement>(onFermer)
  const valider = async () => {
    setEnvoi(true)
    const r = await changer(valeur)
    setEnvoi(false)
    if (r) setRetour(r)
    else fermer()
  }
  return (
    <div className="scrim" onClick={fermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section ref={boite} className="dialogue feuille" role="dialog" aria-modal="true" aria-labelledby="pseudo-titre" onClick={(e) => e.stopPropagation()}>
        <form
          className="connexion-etape"
          onSubmit={(e) => {
            e.preventDefault()
            void valider()
          }}
        >
          <h2 id="pseudo-titre">Votre pseudo</h2>
          <label className="saisie">
            <span>Pseudo</span>
            <input
              data-focus-initial
              value={valeur}
              maxLength={24}
              autoComplete="nickname"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setValeur(e.target.value.toLowerCase())
                setRetour(null)
              }}
            />
          </label>
          <p className="panel-tip">{REGLE_PSEUDO}</p>
          {retour && (
            <p role="alert" className="connexion-erreur">
              {retour.erreur}{' '}
              {retour.proposition && (
                <button type="button" className="btn-texte" onClick={() => setValeur(retour.proposition ?? valeur)}>
                  Le prendre
                </button>
              )}
            </p>
          )}
          <div className="rangee rangee-fin">
            <button type="button" className="btn btn-secondary" onClick={fermer}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={envoi}>
              {valeur === actuel ? 'Confirmer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

/** Supprimer le compte : « Supprimer » reste inactif tant que le mot n'est pas tapé, « Annuler » par défaut. */
function Suppression({ invite, supprimer, onFermer }: { invite: boolean; supprimer: Props['supprimer']; onFermer: () => void }) {
  const [mot, setMot] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [boite, fermer] = useDialogue<HTMLElement>(onFermer)
  const valider = async () => {
    setEnvoi(true)
    const e = await supprimer()
    setEnvoi(false)
    if (e) setErreur(e)
    else onFermer()
  }
  return (
    <div className="scrim" onClick={fermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section ref={boite} className="dialogue feuille" role="alertdialog" aria-modal="true" aria-labelledby="suppression-titre" aria-describedby="suppression-texte" onClick={(e) => e.stopPropagation()}>
        <h2 id="suppression-titre">{invite ? 'Effacer votre partie ?' : 'Supprimer votre compte ?'}</h2>
        <p id="suppression-texte">
          {invite
            ? 'Votre codex, votre réserve, votre encre et vos sabliers seront effacés de nos serveurs et de cet appareil. Cette action est définitive.'
            : 'Votre codex, votre réserve, votre encre et vos sabliers seront effacés sur tous vos appareils. Cette action est définitive.'}
        </p>
        <label className="saisie">
          <span>Tapez SUPPRIMER pour confirmer</span>
          <input value={mot} autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={(e) => setMot(e.target.value)} />
        </label>
        {erreur && <p role="alert" className="connexion-erreur">{erreur}</p>}
        <div className="rangee rangee-fin">
          <button data-focus-initial type="button" className="btn btn-secondary" onClick={fermer}>
            Annuler
          </button>
          <button type="button" className="btn btn-danger" disabled={mot !== 'SUPPRIMER' || envoi} onClick={() => void valider()}>
            Supprimer
          </button>
        </div>
      </section>
    </div>
  )
}

/** Le compte dans les Réglages (I-33). L'adresse n'y figure jamais : le serveur ne la garde pas. */
export function CompteReglages({ compte, enLigne, onSauvegarder, onSeConnecter, changerPseudo, deconnecter, supprimer }: Props) {
  const [ouvert, setOuvert] = useState<'pseudo' | 'suppression' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const fermer = () => setOuvert(null)

  if (!compte)
    return (
      <section className="reglage compte">
        <h2>Compte</h2>
        <button type="button" className="compte-ligne" onClick={onSauvegarder}>
          <span>
            <b>Sauvegarder ma progression</b>
            <small>Retrouvez votre partie sur un autre appareil</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        <button type="button" className="compte-ligne" onClick={onSeConnecter}>
          <span>
            <b>J’ai déjà un compte</b>
            <small>Se connecter avec son adresse électronique</small>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        <div>
          <button type="button" className="btn btn-danger" disabled={!enLigne} onClick={() => setOuvert('suppression')}>
            Effacer ma partie
          </button>
        </div>
        {ouvert === 'suppression' && <Suppression invite supprimer={supprimer} onFermer={fermer} />}
      </section>
    )

  return (
    <section className="reglage compte">
      <h2>Compte</h2>
      <div className="compte-pseudo">
        <span>
          <b>{compte.pseudo}</b>
          <small>{compte.pseudo_confirme ? 'Votre pseudo' : 'Votre pseudo, tiré de votre adresse'}</small>
        </span>
        {!compte.pseudo_confirme && <span className="etiquette-privee">Privé</span>}
      </div>
      <button type="button" className="compte-ligne" disabled={!enLigne} onClick={() => setOuvert('pseudo')}>
        <span>
          <b>{compte.pseudo_confirme ? 'Modifier le pseudo' : 'Confirmer ou modifier le pseudo'}</b>
          {!compte.pseudo_confirme && <small>Il restera privé tant que vous ne l’avez pas confirmé</small>}
        </span>
        <span aria-hidden="true">›</span>
      </button>
      <button
        type="button"
        className="compte-ligne"
        disabled={!enLigne || envoi}
        onClick={() => {
          setEnvoi(true)
          setErreur(null)
          void deconnecter().then((e) => {
            setEnvoi(false)
            setErreur(e)
          })
        }}
      >
        <span>
          <b>Se déconnecter</b>
          <small>Cet appareil repartira d’une partie invitée. Reconnectez-vous à tout moment avec votre adresse.</small>
        </span>
        <span aria-hidden="true">›</span>
      </button>
      {erreur && <p role="alert" className="connexion-erreur">{erreur}</p>}
      <div>
        <button type="button" className="btn btn-danger" disabled={!enLigne} onClick={() => setOuvert('suppression')}>
          Supprimer mon compte
        </button>
      </div>
      {ouvert === 'pseudo' && <Pseudo actuel={compte.pseudo} changer={changerPseudo} onFermer={fermer} />}
      {ouvert === 'suppression' && <Suppression invite={false} supprimer={supprimer} onFermer={fermer} />}
    </section>
  )
}
