import { URL_KOFI } from '../services/soutien'
import { Icone } from './Icone'
import { useDialogue } from './useDialogue'

/** Ko-fi s'ouvre hors de la PWA : un simple lien, aucun script tiers (ADR 0024). */
const lien = { href: URL_KOFI, target: '_blank', rel: 'noopener noreferrer' } as const

/**
 * Soutien (ADR 0078), en tête des Réglages. Les dons ne changent rien au jeu ;
 * un abonné reçoit un remerciement à la place de l'invitation. Le joueur peut
 * la masquer : elle revient après 30 jours.
 */
export function CarteSoutien({ abonne, onMasquer }: { abonne: boolean; onMasquer: () => void }) {
  return (
    <section className="reglage soutien-carte" aria-labelledby="soutien-titre">
      <h2 id="soutien-titre">{abonne ? 'Merci de votre soutien' : 'Soutenir ÉtymoLogique'}</h2>
      <p>
        {abonne
          ? 'Votre abonnement aide à garder le jeu gratuit et sans publicité. Il ne change rien à votre partie.'
          : 'Le jeu est gratuit et sans publicité. Si vous l’aimez, un café sur Ko-fi aide à le faire grandir, sans rien changer à votre partie. Avec un soutien mensuel, ce rappel ne s’affiche plus.'}
      </p>
      <a className="btn btn-primary" {...lien}>
        <Icone nom="cafe" />
        {abonne ? 'Voir ma page Ko-fi' : 'Offrir un café'}
      </a>
      <button type="button" className="btn-texte" onClick={onMasquer}>
        Masquer pendant 30 jours
      </button>
    </section>
  )
}

/** Entrée discrète du rail de navigation (écrans larges). */
export function LienSoutien() {
  return (
    <a className="navigation-soutien" {...lien} title="Soutenir ÉtymoLogique sur Ko-fi">
      <Icone nom="cafe" />
      Soutenir
    </a>
  )
}

/**
 * Rappel de temps en temps (ADR 0078) : une fois la table calme, jamais pendant
 * un rituel, jamais à un abonné. « Plus tard » le repousse de 30 jours de jeu.
 */
export function ModaleSoutien({ onFermer }: { onFermer: () => void }) {
  const [boite, fermer] = useDialogue<HTMLElement>(onFermer)
  return (
    <div className="scrim" onClick={fermer}>
      <div className="scrim-fond" aria-hidden="true" />
      <section ref={boite} className="dialogue soutien-modale" role="dialog" aria-modal="true" aria-labelledby="soutien-modale-titre" onClick={(e) => e.stopPropagation()}>
        <h2 id="soutien-modale-titre" className="jk-title">
          Un café pour ÉtymoLogique ?
        </h2>
        <p>ÉtymoLogique est gratuit, sans publicité, et fait par une seule personne. Si le jeu vous plaît, un café sur Ko-fi aide à le faire grandir, sans rien changer à votre partie. Avec un soutien mensuel, ce message ne s’affiche plus.</p>
        <div className="rangee">
          <a className="btn btn-primary" {...lien} onClick={fermer}>
            <Icone nom="cafe" />
            Offrir un café
          </a>
          <button type="button" data-focus-initial className="btn-texte" onClick={fermer}>
            Plus tard
          </button>
        </div>
      </section>
    </div>
  )
}
