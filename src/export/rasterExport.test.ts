import { describe, expect, it } from 'vitest'
import { pageFileName } from './rasterExport'

describe('pageFileName', () => {
  it('uses the .png extension for png format', () => {
    expect(pageFileName(1, 10, 'png')).toBe('page-01.png')
  })

  it('uses the .jpg extension for jpeg format', () => {
    expect(pageFileName(1, 10, 'jpeg')).toBe('page-01.jpg')
  })

  it('zero-pads so lexicographic sort matches numeric page order', () => {
    const names = Array.from({ length: 12 }, (_, i) =>
      pageFileName(i + 1, 12, 'png'),
    )
    const sorted = [...names].sort()
    expect(sorted).toEqual(names)
  })

  it('uses no more digits than the total page count requires', () => {
    expect(pageFileName(3, 9, 'png')).toBe('page-3.png')
    expect(pageFileName(3, 10, 'png')).toBe('page-03.png')
    expect(pageFileName(3, 100, 'png')).toBe('page-003.png')
  })
})
