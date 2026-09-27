import { describe, expect, it } from 'vitest'

import { svgSur } from './silhouettes'

describe('silhouettes', () => {
  it('garde la teinte et les évidements du profil', () => {
    const svg = svgSur(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><path d="M0 0H10V10Z" fill="currentColor"/><circle cx="5" cy="5" r="2" style="fill:var(--art-bg)"/></svg>',
    )
    expect(svg?.querySelector('path')?.getAttribute('fill')).toBe('currentColor')
    expect(svg?.querySelector('circle')?.getAttribute('style')).toBe('fill:var(--art-bg)')
  })

  it('écarte scripts, liens, gestionnaires et styles dangereux', () => {
    const svg = svgSur(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)"><path d="M0 0"/></a>' +
        '<path d="M0 0" onclick="x()" style="fill:url(https://mal.test/x)"/><foreignObject/><text>géo</text></svg>',
    )
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('onload')).toBeNull()
    expect(svg?.querySelectorAll('script, a, foreignObject, text')).toHaveLength(0)
    const path = svg?.querySelector('path')
    expect(path?.getAttribute('onclick')).toBeNull()
    expect(path?.getAttribute('style')).toBeNull()
  })

  it('refuse ce qui n’est pas un SVG', () => {
    expect(svgSur('<html><body>x</body></html>')).toBeNull()
    expect(svgSur('pas du xml')).toBeNull()
  })
})
