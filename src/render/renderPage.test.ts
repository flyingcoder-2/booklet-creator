import { describe, expect, it } from 'vitest'
import type { ImageObject } from '../model/types'
import {
  renderPage,
  type Canvas2DLike,
  type RenderableObject,
} from './renderPage'

type Call = { method: string; args: unknown[] }

function createRecordingContext(): Canvas2DLike & { calls: Call[] } {
  const calls: Call[] = []
  const record =
    (method: string) =>
    (...args: unknown[]) =>
      calls.push({ method, args })

  return {
    calls,
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    rotate: record('rotate'),
    scale: record('scale'),
    drawImage: record('drawImage'),
    globalAlpha: 1,
  }
}

function makeObject(overrides: Partial<ImageObject> = {}): ImageObject {
  return {
    id: 'obj-1',
    assetId: 'asset-1',
    x: 0.5,
    y: 0.5,
    width: 0.4,
    height: 0.3,
    rotationDegrees: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    ...overrides,
  }
}

const FAKE_IMAGE = {} as CanvasImageSource

describe('renderPage', () => {
  it('draws exactly one drawImage call per object, nothing else besides save/transform/restore', () => {
    const ctx = createRecordingContext()
    const objects: RenderableObject[] = [
      {
        object: makeObject({ id: 'a' }),
        image: FAKE_IMAGE,
        sourceSize: { width: 100, height: 100 },
      },
      {
        object: makeObject({ id: 'b' }),
        image: FAKE_IMAGE,
        sourceSize: { width: 100, height: 100 },
      },
    ]

    renderPage(ctx, objects, { width: 400, height: 600 })

    const drawImageCalls = ctx.calls.filter((c) => c.method === 'drawImage')
    expect(drawImageCalls).toHaveLength(2)

    // No overlay-shaped calls exist at all: this renderer's Canvas2DLike
    // interface has no rect/stroke/fillRect method, so there is no code path
    // by which margins, guides, or a grid could be drawn here.
    const methodsUsed = new Set(ctx.calls.map((c) => c.method))
    expect(methodsUsed).toEqual(
      new Set(['save', 'translate', 'rotate', 'scale', 'drawImage', 'restore']),
    )
  })

  it('renders objects in the given bottom-to-top order (draw call order matches array order)', () => {
    const ctx = createRecordingContext()
    const bottom = makeObject({ id: 'bottom', x: 0.2 })
    const top = makeObject({ id: 'top', x: 0.8 })

    renderPage(
      ctx,
      [
        {
          object: bottom,
          image: FAKE_IMAGE,
          sourceSize: { width: 10, height: 10 },
        },
        {
          object: top,
          image: FAKE_IMAGE,
          sourceSize: { width: 10, height: 10 },
        },
      ],
      { width: 100, height: 100 },
    )

    const translateCalls = ctx.calls.filter((c) => c.method === 'translate')
    expect(translateCalls).toHaveLength(2)
    // Bottom (x=0.2) is drawn first, top (x=0.8) second -- array order.
    expect(translateCalls[0].args[0]).toBeCloseTo(20, 10)
    expect(translateCalls[1].args[0]).toBeCloseTo(80, 10)
  })

  it('applies opacity via globalAlpha before drawing', () => {
    const ctx = createRecordingContext()
    renderPage(
      ctx,
      [
        {
          object: makeObject({ opacity: 0.5 }),
          image: FAKE_IMAGE,
          sourceSize: { width: 10, height: 10 },
        },
      ],
      { width: 100, height: 100 },
    )
    expect(ctx.globalAlpha).toBe(0.5)
  })

  it('passes the full source rect when there is no crop', () => {
    const ctx = createRecordingContext()
    renderPage(
      ctx,
      [
        {
          object: makeObject(),
          image: FAKE_IMAGE,
          sourceSize: { width: 200, height: 100 },
        },
      ],
      { width: 400, height: 600 },
    )
    const [, sx, sy, sw, sh] = ctx.calls.find(
      (c) => c.method === 'drawImage',
    )!.args
    expect([sx, sy, sw, sh]).toEqual([0, 0, 200, 100])
  })

  it('passes the cropped source rect when a crop is set', () => {
    const ctx = createRecordingContext()
    renderPage(
      ctx,
      [
        {
          object: makeObject({
            crop: { x: 0.25, y: 0.5, width: 0.5, height: 0.25 },
          }),
          image: FAKE_IMAGE,
          sourceSize: { width: 200, height: 100 },
        },
      ],
      { width: 400, height: 600 },
    )
    const [, sx, sy, sw, sh] = ctx.calls.find(
      (c) => c.method === 'drawImage',
    )!.args
    expect([sx, sy, sw, sh]).toEqual([50, 50, 100, 25])
  })

  it('rotates by the object angle in radians, clockwise-positive (no sign flip in canvas space)', () => {
    const ctx = createRecordingContext()
    renderPage(
      ctx,
      [
        {
          object: makeObject({ rotationDegrees: 90 }),
          image: FAKE_IMAGE,
          sourceSize: { width: 10, height: 10 },
        },
      ],
      { width: 100, height: 100 },
    )
    const [angle] = ctx.calls.find((c) => c.method === 'rotate')!.args as [
      number,
    ]
    expect(angle).toBeCloseTo(Math.PI / 2, 10)
  })

  it('applies flip as scale(-1, 1) / scale(1, -1)', () => {
    const ctx = createRecordingContext()
    renderPage(
      ctx,
      [
        {
          object: makeObject({ flipX: true, flipY: false }),
          image: FAKE_IMAGE,
          sourceSize: { width: 10, height: 10 },
        },
      ],
      { width: 100, height: 100 },
    )
    const scaleArgs = ctx.calls.find((c) => c.method === 'scale')!.args
    expect(scaleArgs).toEqual([-1, 1])
  })
})
