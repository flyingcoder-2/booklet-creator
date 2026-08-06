import { encodePng, type RGB } from './tiny-png'

/**
 * A test image shaped like a flag "F": asymmetric under every flip and every
 * 90-degree rotation, so an orientation, flip, or rotation bug in placement
 * math is visible at a glance rather than hidden by symmetry. Red border marks
 * the image's own edge (distinct from the black glyph) so cropping/clipping is
 * also visible.
 */
export function makeOrientationTestPng(width: number, height: number): Buffer {
  const white: RGB = [255, 255, 255]
  const black: RGB = [10, 10, 10]
  const red: RGB = [220, 30, 30]

  const vBarRight = width * 0.4
  const topBarBottom = height * 0.22
  const midBarTop = height * 0.42
  const midBarBottom = height * 0.58
  const midBarRight = width * 0.75
  const border = Math.max(2, Math.round(Math.min(width, height) * 0.03))

  return encodePng(width, height, (x, y) => {
    const onBorder =
      x < border || y < border || x >= width - border || y >= height - border
    if (onBorder) return red

    const inVBar = x < vBarRight
    const inTopBar = y < topBarBottom && x < width * 0.9
    const inMidBar = y >= midBarTop && y < midBarBottom && x < midBarRight

    if (inVBar || inTopBar || inMidBar) return black
    return white
  })
}
