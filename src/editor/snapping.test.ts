import { describe, expect, it } from 'vitest'
import {
  collectSnapCandidatesX,
  collectSnapCandidatesY,
  snapRect,
} from './snapping'

const PAGE_SIZE = { width: 400, height: 600 }
const MARGINS = { top: 20, right: 20, bottom: 20, left: 20 }

describe('snapRect', () => {
  it('snaps center to page center when within threshold', () => {
    const rect = { x: 190, y: 100, width: 20, height: 20 } // center x = 200 = page center
    const candidatesX = collectSnapCandidatesX(PAGE_SIZE, MARGINS, [])
    const candidatesY = collectSnapCandidatesY(PAGE_SIZE, MARGINS, [])
    const result = snapRect(rect, candidatesX, candidatesY, 5)
    expect(result.rect.x + result.rect.width / 2).toBe(200)
    expect(result.activeLineX).toBe(200)
  })

  it('does not snap when outside threshold', () => {
    const rect = { x: 100, y: 100, width: 20, height: 20 } // center x = 110, far from 200
    const candidatesX = collectSnapCandidatesX(PAGE_SIZE, MARGINS, [])
    const candidatesY = collectSnapCandidatesY(PAGE_SIZE, MARGINS, [])
    const result = snapRect(rect, candidatesX, candidatesY, 5)
    expect(result.rect.x).toBe(100)
    expect(result.activeLineX).toBeUndefined()
  })

  it('snaps left edge to the left margin line', () => {
    const rect = { x: 22, y: 100, width: 50, height: 50 }
    const candidatesX = collectSnapCandidatesX(PAGE_SIZE, MARGINS, [])
    const candidatesY = collectSnapCandidatesY(PAGE_SIZE, MARGINS, [])
    const result = snapRect(rect, candidatesX, candidatesY, 5)
    expect(result.rect.x).toBe(20) // margins.left
  })

  it('snaps to another object edge/center', () => {
    const other = { x: 100, y: 100, width: 100, height: 100 } // right edge at 200, center at 150
    const rect = { x: 198, y: 300, width: 40, height: 40 }
    const candidatesX = collectSnapCandidatesX(PAGE_SIZE, MARGINS, [other])
    const candidatesY = collectSnapCandidatesY(PAGE_SIZE, MARGINS, [other])
    const result = snapRect(rect, candidatesX, candidatesY, 5)
    expect(result.rect.x).toBe(200)
  })

  it('picks the closest candidate when multiple are within threshold', () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 } // left edge at 0, exactly page edge
    const candidatesX = collectSnapCandidatesX(PAGE_SIZE, MARGINS, [])
    const candidatesY = collectSnapCandidatesY(PAGE_SIZE, MARGINS, [])
    const result = snapRect(rect, candidatesX, candidatesY, 30)
    // Page edge (0) is closer than the left margin (20) to this rect's left edge (0).
    expect(result.rect.x).toBe(0)
  })
})
