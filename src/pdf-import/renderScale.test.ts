import { describe, expect, it } from 'vitest'
import { printCeilingPx } from '../assets/downscale'
import { renderScaleForPaper } from './renderScale'

// Letter's booklet page is 396x612pt, so its 300 DPI ceiling is 1650x2550px.
const LETTER_CEILING = printCeilingPx('letter')

describe('renderScaleForPaper', () => {
  it('scales a portrait page up to at least the print ceiling', () => {
    const viewport = { width: 396, height: 612 } // exactly a Letter booklet page
    const scale = renderScaleForPaper(viewport, 'letter')

    expect(viewport.width * scale).toBeGreaterThanOrEqual(LETTER_CEILING.width)
    expect(viewport.height * scale).toBeGreaterThanOrEqual(
      LETTER_CEILING.height,
    )
  })

  it('scales a landscape page so its shorter axis still meets the ceiling', () => {
    const viewport = { width: 612, height: 396 }
    const scale = renderScaleForPaper(viewport, 'letter')

    // Both axes must clear the ceiling -- the binding constraint here is height,
    // the page's short axis.
    expect(viewport.width * scale).toBeGreaterThanOrEqual(LETTER_CEILING.width)
    expect(viewport.height * scale).toBeGreaterThanOrEqual(
      LETTER_CEILING.height,
    )
  })

  it('never renders below the source page size, even when the page is already huge', () => {
    // A page far larger than any ceiling: scaling down would discard detail the
    // source had, and importImage's downscale handles the excess instead.
    const viewport = { width: 10000, height: 10000 }
    expect(renderScaleForPaper(viewport, 'letter')).toBe(1)
  })

  it('accounts for paper size: a larger page needs a larger raster', () => {
    const viewport = { width: 396, height: 612 }
    const letterScale = renderScaleForPaper(viewport, 'letter')
    const legalScale = renderScaleForPaper(viewport, 'legal')

    // Legal's booklet page is wider (504pt vs 396pt), so the same PDF page must
    // rasterize larger to stay print-adequate.
    expect(legalScale).toBeGreaterThan(letterScale)
  })

  it('handles a degenerate viewport without dividing by zero', () => {
    expect(renderScaleForPaper({ width: 0, height: 0 }, 'letter')).toBe(1)
    expect(
      Number.isFinite(renderScaleForPaper({ width: 0, height: 612 }, 'a4')),
    ).toBe(true)
  })
})
