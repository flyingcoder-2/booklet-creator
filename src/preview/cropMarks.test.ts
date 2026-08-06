import { describe, expect, it } from 'vitest'
import { pageRects } from '../imposition/geometry'
import { cropMarkLines } from './cropMarks'

describe('cropMarkLines', () => {
  it('produces 10 segments: 2 per corner (4 corners) plus 2 fold ticks', () => {
    const lines = cropMarkLines(pageRects('letter', 20))
    expect(lines).toHaveLength(10)
  })

  it('every mark sits outside the trim rect', () => {
    const rects = pageRects('letter', 20)
    const trimLeft = rects.left.x
    const trimRight = rects.right.x + rects.right.width
    const trimBottom = rects.left.y
    const trimTop = rects.left.y + rects.left.height

    for (const line of cropMarkLines(rects)) {
      for (const [x, y] of [
        [line.x1, line.y1],
        [line.x2, line.y2],
      ]) {
        const inside =
          x > trimLeft && x < trimRight && y > trimBottom && y < trimTop
        expect(inside).toBe(false)
      }
    }
  })

  it('the fold ticks sit exactly on the fold x-coordinate', () => {
    const rects = pageRects('letter', 20)
    const foldX = rects.left.x + rects.left.width
    const foldTicks = cropMarkLines(rects).slice(-2)
    for (const tick of foldTicks) {
      expect(tick.x1).toBe(foldX)
      expect(tick.x2).toBe(foldX)
    }
  })
})
