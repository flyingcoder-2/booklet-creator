import { describe, expect, it } from 'vitest'
import { impose, padCount, sidesInOutputOrder } from './impose'

describe('padCount', () => {
  it.each([
    [8, 8],
    [10, 12],
    [11, 12],
    [13, 16],
  ])('pads %i real pages to %i', (realPages, expected) => {
    expect(padCount(realPages)).toBe(expected)
  })
})

describe('impose', () => {
  it('produces the four-page example from the spec', () => {
    const sheets = impose(4)
    expect(sheets).toEqual([
      { front: { left: 4, right: 1 }, back: { left: 2, right: 3 } },
    ])
  })

  it('produces the eight-page example from the spec', () => {
    const sheets = impose(8)
    expect(sheets).toEqual([
      { front: { left: 8, right: 1 }, back: { left: 2, right: 7 } },
      { front: { left: 6, right: 3 }, back: { left: 4, right: 5 } },
    ])
  })

  it('produces the twelve-page example from the spec', () => {
    const sheets = impose(12)
    const sides = sidesInOutputOrder(sheets)
    expect(sides.map((side) => [side.slots.left, side.slots.right])).toEqual([
      [12, 1],
      [2, 11],
      [10, 3],
      [4, 9],
      [8, 5],
      [6, 7],
    ])
  })

  it('defaults to vertical-axis flip mode', () => {
    const [sheet1] = impose(8)
    expect(sheet1.back).toEqual({ left: 2, right: 7 })
  })

  it('alternate flip mode swaps back slots only, fronts unchanged', () => {
    const sheets = impose(8, 'horizontal-axis')
    expect(sheets[0].back).toEqual({ left: 7, right: 2 })
    expect(sheets[1].back).toEqual({ left: 5, right: 4 })
    expect(sheets[0].front).toEqual({ left: 8, right: 1 })
    expect(sheets[1].front).toEqual({ left: 6, right: 3 })
  })

  it('throws for a page count that is not a positive multiple of four', () => {
    expect(() => impose(0)).toThrow()
    expect(() => impose(10)).toThrow()
  })

  describe.each<import('./geometry').FlipMode>([
    'vertical-axis',
    'horizontal-axis',
  ])('invariants (flip mode: %s)', (flipMode) => {
    for (let N = 4; N <= 400; N += 4) {
      it(`N=${N}: every page 1..N appears exactly once, no slot empty, fronts sum to N+1`, () => {
        const sheets = impose(N, flipMode)
        const placed: number[] = []

        for (const sheet of sheets) {
          for (const side of [sheet.front, sheet.back]) {
            expect(side.left).toBeGreaterThanOrEqual(1)
            expect(side.left).toBeLessThanOrEqual(N)
            expect(side.right).toBeGreaterThanOrEqual(1)
            expect(side.right).toBeLessThanOrEqual(N)
            placed.push(side.left, side.right)
          }
          expect(sheet.front.left + sheet.front.right).toBe(N + 1)
        }

        placed.sort((a, b) => a - b)
        expect(placed).toEqual(Array.from({ length: N }, (_, i) => i + 1))
      })
    }
  })
})

describe('sidesInOutputOrder', () => {
  it('orders sides sheet by sheet, front before back', () => {
    const sheets = impose(12)
    const sides = sidesInOutputOrder(sheets)
    expect(sides.map((s) => `${s.sheetIndex}-${s.side}`)).toEqual([
      '0-front',
      '0-back',
      '1-front',
      '1-back',
      '2-front',
      '2-back',
    ])
  })
})
