import { describe, expect, it } from 'vitest'
import {
  bookletPageSize,
  pageRects,
  sheetSizeWithBleed,
  slotRects,
  uniformMargins,
  type Margins,
} from './geometry'

describe('sheet sizes (export spec examples)', () => {
  it('A4 landscape sheet measures 297mm x 210mm', () => {
    // 297mm and 210mm in points, allowing floating point slack.
    const mmToPt = (mm: number) => (mm / 25.4) * 72
    const sheet = bookletPageSizeSheet('a4')
    expect(sheet.width).toBeCloseTo(mmToPt(297), 3)
    expect(sheet.height).toBeCloseTo(mmToPt(210), 3)
  })

  it('Legal landscape sheet measures 14in x 8.5in', () => {
    const sheet = bookletPageSizeSheet('legal')
    expect(sheet.width).toBe(14 * 72)
    expect(sheet.height).toBe(8.5 * 72)
  })

  it('A4 with 3mm bleed produces a 303mm x 216mm sheet', () => {
    const mmToPt = (mm: number) => (mm / 25.4) * 72
    const bleedPt = mmToPt(3)
    const sheet = sheetSizeWithBleed('a4', bleedPt)
    expect(sheet.width).toBeCloseTo(mmToPt(303), 3)
    expect(sheet.height).toBeCloseTo(mmToPt(216), 3)
  })
})

function bookletPageSizeSheet(
  paperSize: Parameters<typeof bookletPageSize>[0],
) {
  const page = bookletPageSize(paperSize)
  return { width: page.width * 2, height: page.height }
}

describe('pageRects', () => {
  it('with no bleed, each slot equals the nominal booklet page size, touching at the fold', () => {
    const page = bookletPageSize('letter')
    const { left, right } = pageRects('letter', 0)

    expect(left).toEqual({ x: 0, y: 0, width: page.width, height: page.height })
    expect(right).toEqual({
      x: page.width,
      y: 0,
      width: page.width,
      height: page.height,
    })
  })

  it('with bleed, slots are inset from the outer edges by bleed but still meet exactly at the fold', () => {
    const page = bookletPageSize('letter')
    const bleed = 10
    const { left, right } = pageRects('letter', bleed)

    expect(left.x).toBe(bleed)
    expect(left.y).toBe(bleed)
    expect(right.x).toBe(left.x + left.width) // meet exactly at the fold
    expect(left.width).toBe(page.width)
    expect(right.width).toBe(page.width)

    const sheet = sheetSizeWithBleed('letter', bleed)
    // Right slot's outer edge sits `bleed` inside the bleed-enlarged sheet's right edge.
    expect(right.x + right.width).toBe(sheet.width - bleed)
  })
})

describe('slotRects', () => {
  it('with uniform margins, both slots are inset symmetrically and are equal in size', () => {
    const margins = uniformMargins(20)
    const { left, right } = slotRects('letter', margins, 0)
    expect(left.width).toBe(right.width)
    expect(left.height).toBe(right.height)
    expect(left.x).toBe(20)
    expect(left.height).toBe(bookletPageSize('letter').height - 40)
  })

  it('each slot uses its own left/right margin for the fold-side inset (not the same field for both)', () => {
    // Asymmetric margins: left=5, right=25. For the LEFT slot, its own right
    // margin (25) insets the fold-side edge. For the RIGHT slot, its own
    // left margin (5) insets its fold-side edge -- not the same value.
    const margins: Margins = { top: 10, right: 25, bottom: 10, left: 5 }
    const page = bookletPageSize('letter')
    const { left, right } = slotRects('letter', margins, 0)

    expect(left.x).toBe(5) // outer inset = margins.left
    expect(left.x + left.width).toBe(page.width - 25) // fold inset = margins.right

    expect(right.x).toBe(page.width + 5) // fold inset = margins.left
    expect(right.x + right.width).toBe(2 * page.width - 25) // outer inset = margins.right
  })

  it('bleed shifts both slots outward by bleed but the fold-relative math is unchanged', () => {
    const margins = uniformMargins(15)
    const bleed = 8
    const noBleed = slotRects('letter', margins, 0)
    const withBleed = slotRects('letter', margins, bleed)

    expect(withBleed.left.x).toBe(noBleed.left.x + bleed)
    expect(withBleed.left.y).toBe(noBleed.left.y + bleed)
    expect(withBleed.left.width).toBe(noBleed.left.width)
    expect(withBleed.right.width).toBe(noBleed.right.width)
  })
})
