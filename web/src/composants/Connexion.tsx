import { useCallback, useEffect, useRef, useState } from 'react'

import type { AvertissementRemplacement, Etat, ReponseConfirmation } from '../contrat'
import type { ClientApi } from '../services/api'
import { confirmer, demander, lienDeConnexion, oublierLien } from '../services/compte'
import { useMaintenant } from '../services/horloge'
import { useDialogue } from './useDialogue'

type Preuve = { jeton: string } | { code: string }

/** Expéditeur affiché dans l'aide : celui de l'environnement servi. */
const EXPEDITEUR = `noreply@${window.location.hostname.startsWith('horsprod.') ? 'horsprod.' : ''}etymologique.fr`

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`

interface Props {
  api: ClientApi
  etat: Etat | null
  enLigne: boolean
  /** Défi confirmé : la partie de l'appareil a pu changer. */
  onConfirme: (reponse: ReponseConfirmation) => Promise<void>
}

/** Avertissement avant de remplacer une partie invitée par celle du compte : « Annuler » par défaut. */
function Remplacement({ avertissement, onAnnuler, onConfirmer }: { avertissement: AvertissementRemplacement; onAnnuler: () => void; onConfirmer: () => void }) {
  const [boite, fermer] = useDialogue<HTMLElement>(onAnnuler)
  const mots = `${pluriel(avertissement.decouvertes, 'mot')} trouvé${avertissement.decouvertes > 1 ? 's' : ''}`
  return (
    <div className="scrim" onClick={fermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section ref={boite} className="dialogue feuille" role="alertdialog" aria-modal="true" aria-labelledby="remplacement-titre" aria-describedby="remplacement-texte" onClick={(e) => e.stopPropagation()}>
        <h2 id="remplacement-titre">Remplacer la partie de cet appareil ?</h2>
        <p id="remplacement-texte">
          Cet appareil porte une partie invitée : {mots}, {pluriel(avertissement.gouttes, 'goutte')}. Elle sera remplacée par celle de votre compte, et ne pourra pas être retrouvée.
        </p>
        <div className="rangee rangee-fin">
          <button data-focus-initial type="button" className="btn btn-secondary" onClick={fermer}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirmer}>
            Ouvrir mon compte
          </button>
        </div>
      </section>
    </div>
  )
}

/**
 * Connexion par e-mail (I-31, ADR 0070) : une adresse, puis un code à 6 chiffres
 * ou le lien du même e-mail, qui ouvre cet écran et confirme seul. Le même écran
 * crée un compte depuis la partie invitée et ouvre un compte existant ; il ne dit
 * jamais si l'adresse est connue.
 */
export function Connexion({ api, etat, enLigne, onConfirme }: Props) {
  const lien = lienDeConnexion()
  const [courriel, setCourriel] = useState('')
  const [defi, setDefi] = useState<string | null>(lien?.defi ?? null)
  const [renvoyerA, setRenvoyerA] = useState(0)
  const [code, setCode] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [remplacement, setRemplacement] = useState<{ defi: string; preuve: Preuve; avertissement: AvertissementRemplacement } | null>(null)
  const maintenant = useMaintenant()
  // Le lien ne se confirme qu'une fois, même si l'effet est rejoué (StrictMode).
  const lienEnvoye = useRef(false)

  const valider = useCallback(
    async (d: string, preuve: Preuve, remplacer_invite = false) => {
      setEnvoi(true)
      setErreur(null)
      setRemplacement(null)
      const reponse = await confirmer(api, { defi: d, ...preuve, remplacer_invite })
      if ('avertissement' in reponse) setRemplacement({ defi: d, preuve, avertissement: reponse.avertissement })
      else if ('erreur' in reponse) {
        setErreur(reponse.erreur)
        setCode('')
      } else await onConfirme(reponse)
      setEnvoi(false)
    },
    [api, onConfirme],
  )

  useEffect(() => {
    if (!lien || lienEnvoye.current || !enLigne) return
    lienEnvoye.current = true
    oublierLien()
    // oxlint-disable-next-line react/set-state-in-effect -- la confirmation part une fois, à l'arrivée par le lien.
    void valider(lien.defi, { jeton: lien.jeton })
  }, [lien, enLigne, valider])

  const envoyer = async () => {
    setEnvoi(true)
    setErreur(null)
    const reponse = await demander(api, courriel)
    setEnvoi(false)
    if ('erreur' in reponse) return setErreur(reponse.erreur)
    setDefi(reponse.defi)
    setCode('')
    // Sur l'horloge affichée : le compte à rebours part de « 1:00 », pas de « 1:01 ».
    setRenvoyerA(maintenant + reponse.renvoyer_dans_s * 1000)
  }

  const saisir = (valeur: string) => {
    // Un bloc collé (« 482 913 ») ou le code proposé par le système : seuls les chiffres comptent.
    const chiffres = valeur.replace(/\D/g, '').slice(0, 6)
    setCode(chiffres)
    if (chiffres.length === 6 && defi && !envoi) void valider(defi, { code: chiffres })
  }

  const reste = Math.max(0, Math.ceil((renvoyerA - maintenant) / 1000))
  const mots = etat?.decouvertes.length ?? 0

  return (
    <div className="connexion">
      {!enLigne && (
        <p className="banniere" role="status">
          Hors ligne : la connexion attend le réseau.
        </p>
      )}
      <fieldset className="panel connexion-panneau" disabled={!enLigne}>
        {defi === null ? (
          <form
            className="connexion-etape"
            onSubmit={(e) => {
              e.preventDefault()
              void envoyer()
            }}
          >
            <p className="panel-k">Étape 1 sur 2</p>
            <h2>Gardez votre partie avec une adresse électronique</h2>
            <p>Pas de mot de passe : nous vous envoyons un code à chaque connexion.</p>
            <label className="saisie">
              <span>Adresse électronique</span>
              <input type="email" name="email" autoComplete="email" inputMode="email" required maxLength={254} value={courriel} onChange={(e) => setCourriel(e.target.value)} />
            </label>
            {erreur && <p role="alert" className="connexion-erreur">{erreur}</p>}
            <button type="submit" className="btn btn-primary" disabled={envoi || courriel.trim() === ''}>
              {envoi ? 'Envoi…' : 'Recevoir un code'}
            </button>
          </form>
        ) : (
          <form
            className="connexion-etape"
            onSubmit={(e) => {
              e.preventDefault()
              if (code.length === 6) void valider(defi, { code })
            }}
          >
            <p className="panel-k">Étape 2 sur 2</p>
            <h2>Vérifiez votre boîte de réception</h2>
            {courriel ? (
              <p>
                Si cette adresse peut ouvrir un compte, un e-mail vient de partir vers <b>{courriel}</b>. Saisissez son code, ou ouvrez son lien.
              </p>
            ) : (
              <p aria-live="polite">{envoi ? 'Vérification du lien…' : 'Saisissez le code de l’e-mail, ou ouvrez son lien.'}</p>
            )}
            <label className="saisie">
              <span>Code à 6 chiffres</span>
              <span className="code-cases">
                <input
                  className="code-saisie"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  value={code}
                  onChange={(e) => saisir(e.target.value)}
                  disabled={envoi}
                />
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} className={i === code.length ? 'code-case active' : 'code-case'} aria-hidden="true">
                    {code[i] ?? ''}
                  </span>
                ))}
              </span>
            </label>
            <p className="panel-tip">Valable 15 minutes.</p>
            {erreur && <p role="alert" className="connexion-erreur">{erreur}</p>}
            <button type="submit" className="btn btn-primary" disabled={envoi || code.length < 6}>
              Valider
            </button>
            <div className="rangee">
              {courriel && (
                <button type="button" className="btn btn-secondary" disabled={envoi || reste > 0} onClick={() => void envoyer()}>
                  {reste > 0 ? `Renvoyer dans ${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, '0')}` : 'Renvoyer'}
                </button>
              )}
              <button
                type="button"
                className="btn-texte"
                onClick={() => {
                  setDefi(null)
                  setErreur(null)
                }}
              >
                Changer d’adresse
              </button>
            </div>
            <p className="panel-tip">
              Rien reçu ? Regardez dans les indésirables. L’e-mail vient de {EXPEDITEUR}, son objet commence par « Votre code ÉtymoLogique ». Le lien et le code ne servent qu’une fois.
            </p>
          </form>
        )}
      </fieldset>
      <ul className="connexion-atouts">
        <li>
          <b>Retrouvez votre partie</b>
          <span>Sur un autre téléphone ou un ordinateur</span>
        </li>
        <li>
          <b>Rien n’est perdu</b>
          <span>{mots > 0 ? `Vos ${pluriel(mots, 'mot')}, votre réserve et votre encre restent` : 'Votre réserve et votre encre restent'}</span>
        </li>
        <li>
          <b>Votre adresse reste secrète</b>
          <span>Nous n’en gardons qu’une empreinte</span>
        </li>
      </ul>
      {remplacement && (
        <Remplacement
          avertissement={remplacement.avertissement}
          onAnnuler={() => setRemplacement(null)}
          onConfirmer={() => void valider(remplacement.defi, remplacement.preuve, true)}
        />
      )}
    </div>
  )
}
