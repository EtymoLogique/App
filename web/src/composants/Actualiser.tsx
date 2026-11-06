import { useEffect, useState } from 'react'

/** Distance (après amorti) à tirer pour déclencher l'actualisation. */
const SEUIL_PX = 72
/** Le doigt va deux fois plus loin que l'indicateur. */
const AMORTI = 2

/** Zones où le doigt glisse déjà pour autre chose : dialogues, briques, défilements horizontaux, coupe des ricochets. */
const EXCLUES = '[role="dialog"], [role="alertdialog"], .scrim, [draggable="true"], [role="slider"], .cb-fasc, .cst-cadre, input, textarea, select'

/**
 * Tirer pour actualiser, dans la PWA installée seulement : elle n'a ni barre
 * d'adresse ni bouton de rechargement. Le navigateur, lui, a déjà son geste.
 */
export function Actualiser({ onActualiser }: { onActualiser: () => Promise<unknown> }) {
  const [tire, setTire] = useState(0)
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    if (!window.matchMedia?.('(display-mode: standalone)').matches) return
    let depart: { x: number; y: number } | null = null
    let distance = 0
    const annuler = () => {
      depart = null
      distance = 0
      setTire(0)
    }
    const debut = (e: TouchEvent) => {
      const doigt = e.touches[0]
      const cible = e.target instanceof Element ? e.target : null
      depart = e.touches.length === 1 && doigt && document.documentElement.scrollTop <= 0 && !cible?.closest(EXCLUES) ? { x: doigt.clientX, y: doigt.clientY } : null
      distance = 0
    }
    const mouvement = (e: TouchEvent) => {
      const doigt = e.touches[0]
      if (!depart || !doigt) return
      const dy = doigt.clientY - depart.y
      // Défilement horizontal ou page qui défile : ce n'est pas le geste.
      if (Math.abs(doigt.clientX - depart.x) > Math.abs(dy) || document.documentElement.scrollTop > 0) return annuler()
      distance = Math.max(0, dy) / AMORTI
      setTire(Math.min(distance, SEUIL_PX * 1.25))
    }
    const fin = () => {
      const pret = depart !== null && distance >= SEUIL_PX
      annuler()
      if (!pret) return
      setEnCours(true)
      void onActualiser().finally(() => setEnCours(false))
    }
    const options = { passive: true }
    document.addEventListener('touchstart', debut, options)
    document.addEventListener('touchmove', mouvement, options)
    document.addEventListener('touchend', fin, options)
    document.addEventListener('touchcancel', annuler, options)
    return () => {
      document.removeEventListener('touchstart', debut)
      document.removeEventListener('touchmove', mouvement)
      document.removeEventListener('touchend', fin)
      document.removeEventListener('touchcancel', annuler)
    }
  }, [onActualiser])

  const visible = enCours || tire > 0
  return (
    <div className="actualiser" role="status">
      {visible && (
        <span
          className={`actualiser-sceau seal${enCours ? ' en-cours' : ''}${tire >= SEUIL_PX ? ' pret' : ''}`}
          style={enCours ? undefined : { translate: `0 ${tire}px`, rotate: `${-6 + (tire / SEUIL_PX) * 180}deg` }}
        >
          <span aria-hidden="true">ÉL</span>
          <span className="sr-only">{enCours ? 'Actualisation…' : tire >= SEUIL_PX ? 'Relâchez pour actualiser' : ''}</span>
        </span>
      )}
    </div>
  )
}
