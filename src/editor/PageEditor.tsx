import * as fabric from 'fabric'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { importImage, isSupportedImageType } from '../assets/importImage'
import { bookletPageSize, type Margins } from '../imposition/geometry'
import type { ImageObject, ObjectId } from '../model/types'
import {
  computeObjectDestRect,
  fitToPageFraction,
  type PixelRect,
  type PixelSize,
} from '../render/placement'
import { useProjectStore } from '../store/projectStore'
import {
  clampCropRect,
  cropRectToPatch,
  fullImageDisplayRect,
} from './cropGeometry'
import { useEditorViewStore } from './editorViewStore'
import { fromFabricTransform, toFabricImageProps } from './fabricAdapter'
import { loadImageElement } from './imageCache'
import {
  collectSnapCandidatesX,
  collectSnapCandidatesY,
  snapRect,
} from './snapping'

const RENDER_SCALE = 2
const SNAP_THRESHOLD_PX = 8 * RENDER_SCALE
const GRID_SPACING_PT = 20

type FabricImageObject = fabric.FabricImage & { data?: { objectId: ObjectId } }

function pxMargins(margins: Margins): Margins {
  return {
    top: margins.top * RENDER_SCALE,
    right: margins.right * RENDER_SCALE,
    bottom: margins.bottom * RENDER_SCALE,
    left: margins.left * RENDER_SCALE,
  }
}

export default function PageEditor() {
  const project = useProjectStore((s) => s.project)
  const updateObject = useProjectStore((s) => s.updateObject)
  const addObject = useProjectStore((s) => s.addObject)
  const removeObject = useProjectStore((s) => s.removeObject)
  const reorderObjects = useProjectStore((s) => s.reorderObjects)
  const duplicatePage = useProjectStore((s) => s.duplicatePage)
  const deletePage = useProjectStore((s) => s.deletePage)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const canUndo = useProjectStore((s) => s.canUndo)
  const canRedo = useProjectStore((s) => s.canRedo)

  const view = useEditorViewStore()

  const activePageId = project.activePageId
  const activePage = project.pages[activePageId]
  const paperSize = project.settings.paperSize
  const margins = project.settings.margins

  const pageSizePt = useMemo(() => bookletPageSize(paperSize), [paperSize])
  const pageSizePx = useMemo<PixelSize>(
    () => ({
      width: pageSizePt.width * RENDER_SCALE,
      height: pageSizePt.height * RENDER_SCALE,
    }),
    [pageSizePt],
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null)
  const objectMapRef = useRef<Map<ObjectId, FabricImageObject>>(new Map())
  const overlayObjectsRef = useRef<fabric.FabricObject[]>([])
  const hydrationRef = useRef(0)
  const cropSnapshotRef = useRef<{
    objectId: ObjectId
    object: ImageObject
  } | null>(null)
  const cropRectFabricRef = useRef<fabric.Rect | null>(null)
  const cropFullImageRef = useRef<FabricImageObject | null>(null)

  const [selectedObjectId, setSelectedObjectId] = useState<ObjectId | null>(
    null,
  )
  const [rejectedFileMessage, setRejectedFileMessage] = useState<string | null>(
    null,
  )
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  const cropModeObjectId = view.cropModeObjectId

  const commitFabricObject = useCallback(
    (fabricImg: FabricImageObject) => {
      const objectId = fabricImg.data?.objectId
      if (!objectId) return
      const patch = fromFabricTransform(
        {
          left: fabricImg.left ?? 0,
          top: fabricImg.top ?? 0,
          angle: fabricImg.angle ?? 0,
          flipX: !!fabricImg.flipX,
          flipY: !!fabricImg.flipY,
          opacity: fabricImg.opacity ?? 1,
          width: fabricImg.width ?? 0,
          height: fabricImg.height ?? 0,
          scaleX: fabricImg.scaleX ?? 1,
          scaleY: fabricImg.scaleY ?? 1,
        },
        pageSizePx,
      )
      updateObject(objectId, patch)
    },
    [pageSizePx, updateObject],
  )

  const otherObjectRectsPx = useCallback(
    (excludeObjectId?: ObjectId): PixelRect[] => {
      if (!activePage) return []
      return activePage.objectOrder
        .filter((id) => id !== excludeObjectId)
        .map((id) => project.objects[id])
        .filter((o): o is ImageObject => !!o)
        .map((o) => computeObjectDestRect(o, pageSizePx))
    },
    [activePage, project.objects, pageSizePx],
  )

  // --- Canvas lifecycle -----------------------------------------------

  useEffect(() => {
    const el = canvasElRef.current
    if (!el) return

    const canvas = new fabric.Canvas(el, {
      width: pageSizePx.width,
      height: pageSizePx.height,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    })
    fabricCanvasRef.current = canvas

    canvas.setDimensions({ width: '100%', height: 'auto' }, { cssOnly: true })
    if (canvas.wrapperEl) canvas.wrapperEl.style.maxWidth = '100%'

    const handleModified = (e: { target?: fabric.FabricObject }) => {
      const target = e.target as FabricImageObject | undefined
      if (target?.data?.objectId) commitFabricObject(target)
    }
    const handleSelection = () => {
      const active = canvas.getActiveObject() as FabricImageObject | null
      setSelectedObjectId(active?.data?.objectId ?? null)
    }
    const handleMoving = (e: {
      target?: fabric.FabricObject
      e?: { altKey?: boolean }
    }) => {
      if (!view.snapEnabled || e.e?.altKey) return // Alt suppresses snapping while dragging
      const target = e.target as FabricImageObject | undefined
      if (!target?.data?.objectId) return
      const rect: PixelRect = {
        x: (target.left ?? 0) - target.getScaledWidth() / 2,
        y: (target.top ?? 0) - target.getScaledHeight() / 2,
        width: target.getScaledWidth(),
        height: target.getScaledHeight(),
      }
      const others = otherObjectRectsPx(target.data.objectId)
      const candidatesX = collectSnapCandidatesX(
        pageSizePx,
        pxMargins(margins),
        others,
      )
      const candidatesY = collectSnapCandidatesY(
        pageSizePx,
        pxMargins(margins),
        others,
      )
      const snapped = snapRect(
        rect,
        candidatesX,
        candidatesY,
        SNAP_THRESHOLD_PX,
      )
      target.set({
        left: snapped.rect.x + snapped.rect.width / 2,
        top: snapped.rect.y + snapped.rect.height / 2,
      })
    }

    canvas.on('object:modified', handleModified)
    canvas.on('selection:created', handleSelection)
    canvas.on('selection:updated', handleSelection)
    canvas.on('selection:cleared', handleSelection)
    canvas.on('object:moving', handleMoving)

    return () => {
      canvas.off('object:modified', handleModified)
      canvas.off('selection:created', handleSelection)
      canvas.off('selection:updated', handleSelection)
      canvas.off('selection:cleared', handleSelection)
      canvas.off('object:moving', handleMoving)
      canvas.dispose()
      fabricCanvasRef.current = null
    }
    // Canvas is created once; page size changes are handled by a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resize the live canvas buffer when paper size changes, preserving relative layout.
  // `backstoreOnly` leaves the responsive CSS sizing (set once on creation) untouched.
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    canvas.setDimensions(
      { width: pageSizePx.width, height: pageSizePx.height },
      { backstoreOnly: true },
    )
  }, [pageSizePx])

  // Aspect lock: corner-drag resizes proportionally when locked (Fabric's
  // default), freely on both axes when unlocked. Side handles always resize
  // one axis only, regardless of this setting -- that's Fabric's default too.
  useEffect(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas) return
    canvas.uniformScaling = view.aspectLocked
  }, [view.aspectLocked])

  // --- Hydration --------------------------------------------------------

  const { showMargins, showSafeArea, showCenterGuides, showGrid } = view

  useEffect(() => {
    const maybeCanvas = fabricCanvasRef.current
    if (!maybeCanvas || !activePage) return
    const canvas: fabric.Canvas = maybeCanvas

    const generation = ++hydrationRef.current

    async function hydrate() {
      const images = await Promise.all(
        activePage!.objectOrder.map(async (objectId) => {
          const object = project.objects[objectId]
          const assetMeta = project.assets[object.assetId]
          if (!object || !assetMeta) return null
          const element = await loadImageElement(object.assetId)
          return { objectId, object, assetMeta, element }
        }),
      )

      if (generation !== hydrationRef.current) return // a newer hydrate superseded this one

      canvas.clear()
      canvas.backgroundColor = '#ffffff' // `clear()` also resets background color
      objectMapRef.current.clear()
      overlayObjectsRef.current = []

      for (const entry of images) {
        if (!entry) continue
        const { objectId, object, assetMeta, element } = entry
        const sourceSize = { width: assetMeta.width, height: assetMeta.height }
        const props = toFabricImageProps(object, pageSizePx, sourceSize)
        const fabricImg = new fabric.FabricImage(
          element,
          props,
        ) as FabricImageObject
        fabricImg.data = { objectId }
        canvas.add(fabricImg)
        objectMapRef.current.set(objectId, fabricImg)
      }

      addOverlays(
        canvas,
        pageSizePx,
        margins,
        { showMargins, showSafeArea, showCenterGuides, showGrid },
        overlayObjectsRef.current,
      )
      canvas.requestRenderAll()
    }

    void hydrate()
  }, [
    activePage,
    project.objects,
    project.assets,
    pageSizePx,
    margins,
    showMargins,
    showSafeArea,
    showCenterGuides,
    showGrid,
  ])

  // Non-blocking margin-overflow warning: purely derived from current content.
  const overflowWarning = useMemo(() => {
    if (!activePage) return false
    const marginsPx = pxMargins(margins)
    return activePage.objectOrder.some((id) => {
      const object = project.objects[id]
      if (!object) return false
      const rect = computeObjectDestRect(object, pageSizePx)
      return (
        rect.x < marginsPx.left ||
        rect.y < marginsPx.top ||
        rect.x + rect.width > pageSizePx.width - marginsPx.right ||
        rect.y + rect.height > pageSizePx.height - marginsPx.bottom
      )
    })
  }, [activePage, project.objects, pageSizePx, margins])

  // --- Image import -------------------------------------------------------

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!activePageId) return
      for (const file of Array.from(files)) {
        if (!isSupportedImageType(file.type)) {
          setRejectedFileMessage(
            `"${file.name}" is not a supported image type (PNG, JPEG, WebP).`,
          )
          continue
        }
        const { assetId, meta } = await importImage(file, paperSize)
        const fitSize = fitToPageFraction(
          { width: meta.width, height: meta.height },
          pageSizePt,
        )
        addObject(activePageId, assetId, meta, {
          x: 0.5,
          y: 0.5,
          width: fitSize.width,
          height: fitSize.height,
          rotationDegrees: 0,
          flipX: false,
          flipY: false,
          opacity: 1,
        })
      }
    },
    [activePageId, addObject, paperSize, pageSizePt],
  )

  const replaceSelected = useCallback(
    async (file: File) => {
      if (!selectedObjectId) return
      if (!isSupportedImageType(file.type)) {
        setRejectedFileMessage(
          `"${file.name}" is not a supported image type (PNG, JPEG, WebP).`,
        )
        return
      }
      const existing = project.objects[selectedObjectId]
      if (!existing) return
      const { assetId, meta } = await importImage(file, paperSize)
      removeObject(activePageId, selectedObjectId)
      addObject(activePageId, assetId, meta, {
        x: existing.x,
        y: existing.y,
        width: existing.width,
        height: existing.height,
        rotationDegrees: existing.rotationDegrees,
        flipX: existing.flipX,
        flipY: existing.flipY,
        opacity: existing.opacity,
        // crop intentionally omitted -- replacing clears any prior crop.
      })
    },
    [
      selectedObjectId,
      project.objects,
      activePageId,
      paperSize,
      addObject,
      removeObject,
    ],
  )

  const uploadInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  // --- Toolbar actions -----------------------------------------------------

  const withSelected = useCallback(
    (fn: (fabricImg: FabricImageObject) => void) => {
      const fabricImg = selectedObjectId
        ? objectMapRef.current.get(selectedObjectId)
        : undefined
      if (!fabricImg) return
      fn(fabricImg)
      fabricCanvasRef.current?.requestRenderAll()
      commitFabricObject(fabricImg)
    },
    [selectedObjectId, commitFabricObject],
  )

  const rotateLeft = useCallback(
    () =>
      withSelected((img) =>
        img.set('angle', ((img.angle ?? 0) - 90 + 360) % 360),
      ),
    [withSelected],
  )
  const rotateRight = useCallback(
    () =>
      withSelected((img) => img.set('angle', ((img.angle ?? 0) + 90) % 360)),
    [withSelected],
  )
  const flipHorizontal = useCallback(
    () => withSelected((img) => img.set('flipX', !img.flipX)),
    [withSelected],
  )
  const flipVertical = useCallback(
    () => withSelected((img) => img.set('flipY', !img.flipY)),
    [withSelected],
  )
  const setOpacity = useCallback(
    (value: number) => withSelected((img) => img.set('opacity', value)),
    [withSelected],
  )

  const deleteSelected = useCallback(() => {
    if (!selectedObjectId || !activePageId) return
    const fabricImg = objectMapRef.current.get(selectedObjectId)
    if (fabricImg) fabricCanvasRef.current?.remove(fabricImg)
    removeObject(activePageId, selectedObjectId)
    setSelectedObjectId(null)
  }, [selectedObjectId, activePageId, removeObject])

  // Delete key deletes the selected object, matching the toolbar button,
  // except while typing into a form control (e.g. the opacity slider).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (cropModeObjectId) return
      const active = document.activeElement
      const isFormControl =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      if (isFormControl) return
      if (!selectedObjectId) return
      e.preventDefault()
      deleteSelected()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedObjectId, cropModeObjectId, deleteSelected])

  const bringForward = useCallback(() => {
    const canvas = fabricCanvasRef.current
    const fabricImg = selectedObjectId
      ? objectMapRef.current.get(selectedObjectId)
      : undefined
    if (!canvas || !fabricImg || !activePage) return
    canvas.bringObjectForward(fabricImg)
    reorderObjects(
      activePageId,
      canvas
        .getObjects()
        .map((o) => (o as FabricImageObject).data?.objectId)
        .filter((id): id is ObjectId => !!id),
    )
  }, [selectedObjectId, activePage, activePageId, reorderObjects])

  const sendBackward = useCallback(() => {
    const canvas = fabricCanvasRef.current
    const fabricImg = selectedObjectId
      ? objectMapRef.current.get(selectedObjectId)
      : undefined
    if (!canvas || !fabricImg || !activePage) return
    canvas.sendObjectBackwards(fabricImg)
    reorderObjects(
      activePageId,
      canvas
        .getObjects()
        .map((o) => (o as FabricImageObject).data?.objectId)
        .filter((id): id is ObjectId => !!id),
    )
  }, [selectedObjectId, activePage, activePageId, reorderObjects])

  const zoomIn = useCallback(() => view.setZoom(view.zoom * 1.25), [view])
  const zoomOut = useCallback(() => view.setZoom(view.zoom / 1.25), [view])

  const fitSelected = useCallback(() => {
    if (!selectedObjectId) return
    const object = project.objects[selectedObjectId]
    if (!object) return
    const assetMeta = project.assets[object.assetId]
    if (!assetMeta) return
    const fitSize = fitToPageFraction(
      { width: assetMeta.width, height: assetMeta.height },
      pageSizePt,
    )
    updateObject(selectedObjectId, {
      x: 0.5,
      y: 0.5,
      width: fitSize.width,
      height: fitSize.height,
    })
  }, [
    selectedObjectId,
    project.objects,
    project.assets,
    pageSizePt,
    updateObject,
  ])

  const centerSelected = useCallback(() => {
    if (!selectedObjectId) return
    updateObject(selectedObjectId, { x: 0.5, y: 0.5 })
  }, [selectedObjectId, updateObject])

  // --- Crop mode -------------------------------------------------------

  const enterCropMode = useCallback(() => {
    const canvas = fabricCanvasRef.current
    if (!canvas || !selectedObjectId) return
    const object = project.objects[selectedObjectId]
    const assetMeta = object && project.assets[object.assetId]
    const fabricImg = objectMapRef.current.get(selectedObjectId)
    if (!object || !assetMeta || !fabricImg) return

    cropSnapshotRef.current = { objectId: selectedObjectId, object }

    const destRect = computeObjectDestRect(object, pageSizePx)
    const sourceSize = { width: assetMeta.width, height: assetMeta.height }
    const fullRect = fullImageDisplayRect(destRect, object.crop, sourceSize)

    // Show the full, uncropped image in place of the current (possibly cropped) one.
    fabricImg.set({
      cropX: 0,
      cropY: 0,
      width: sourceSize.width,
      height: sourceSize.height,
      left: fullRect.x + fullRect.width / 2,
      top: fullRect.y + fullRect.height / 2,
      angle: 0,
      selectable: false,
      evented: false,
    })
    cropFullImageRef.current = fabricImg

    const cropRect = new fabric.Rect({
      left: destRect.x + destRect.width / 2,
      top: destRect.y + destRect.height / 2,
      width: destRect.width,
      height: destRect.height,
      originX: 'center',
      originY: 'center',
      fill: 'rgba(99,102,241,0.15)',
      stroke: '#6366f1',
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      cornerColor: '#6366f1',
      transparentCorners: false,
      lockRotation: true,
    })
    cropRectFabricRef.current = cropRect
    canvas.add(cropRect)
    canvas.setActiveObject(cropRect)
    canvas.requestRenderAll()

    view.setCropModeObjectId(selectedObjectId)
  }, [selectedObjectId, project.objects, project.assets, pageSizePx, view])

  const cancelCropMode = useCallback(() => {
    const canvas = fabricCanvasRef.current
    const snapshot = cropSnapshotRef.current
    if (!canvas || !snapshot) return

    if (cropRectFabricRef.current) canvas.remove(cropRectFabricRef.current)
    cropRectFabricRef.current = null

    const fabricImg = cropFullImageRef.current
    if (fabricImg) {
      const assetMeta = project.assets[snapshot.object.assetId]
      if (assetMeta) {
        const props = toFabricImageProps(snapshot.object, pageSizePx, {
          width: assetMeta.width,
          height: assetMeta.height,
        })
        fabricImg.set({ ...props, selectable: true, evented: true })
      }
    }
    cropFullImageRef.current = null
    cropSnapshotRef.current = null
    canvas.requestRenderAll()
    view.setCropModeObjectId(null)
  }, [project.assets, pageSizePx, view])

  const confirmCropMode = useCallback(() => {
    const canvas = fabricCanvasRef.current
    const snapshot = cropSnapshotRef.current
    const cropRectFabric = cropRectFabricRef.current
    const fullImg = cropFullImageRef.current
    if (!canvas || !snapshot || !cropRectFabric || !fullImg) return

    const fullRect: PixelRect = {
      x: (fullImg.left ?? 0) - fullImg.getScaledWidth() / 2,
      y: (fullImg.top ?? 0) - fullImg.getScaledHeight() / 2,
      width: fullImg.getScaledWidth(),
      height: fullImg.getScaledHeight(),
    }
    const rawCropRectPx: PixelRect = {
      x: (cropRectFabric.left ?? 0) - cropRectFabric.getScaledWidth() / 2,
      y: (cropRectFabric.top ?? 0) - cropRectFabric.getScaledHeight() / 2,
      width: cropRectFabric.getScaledWidth(),
      height: cropRectFabric.getScaledHeight(),
    }
    const clamped = clampCropRect(rawCropRectPx, fullRect)
    const patch = cropRectToPatch(clamped, fullRect, pageSizePx)

    canvas.remove(cropRectFabric)
    cropRectFabricRef.current = null
    cropFullImageRef.current = null
    cropSnapshotRef.current = null

    updateObject(snapshot.objectId, patch)
    view.setCropModeObjectId(null)
  }, [pageSizePx, updateObject, view])

  // --- Drag and drop --------------------------------------------------

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDraggingOver(false)
      if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files)
    },
    [importFiles],
  )

  const isCropping = cropModeObjectId !== null

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-200 bg-neutral-0 px-2 py-1.5">
        <button
          className="rounded-md px-2 py-1 text-sm hover:bg-neutral-100"
          onClick={() => uploadInputRef.current?.click()}
          disabled={isCropping}
        >
          Upload
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void replaceSelected(file)
            e.target.value = ''
          }}
        />

        {!isCropping ? (
          <>
            <ToolbarButton
              onClick={rotateLeft}
              disabled={!selectedObjectId}
              label="Rotate Left"
            />
            <ToolbarButton
              onClick={rotateRight}
              disabled={!selectedObjectId}
              label="Rotate Right"
            />
            <ToolbarButton
              onClick={flipHorizontal}
              disabled={!selectedObjectId}
              label="Flip H"
            />
            <ToolbarButton
              onClick={flipVertical}
              disabled={!selectedObjectId}
              label="Flip V"
            />
            <ToolbarButton
              onClick={enterCropMode}
              disabled={!selectedObjectId}
              label="Crop"
            />
            <ToolbarButton
              onClick={fitSelected}
              disabled={!selectedObjectId}
              label="Fit Image"
            />
            <ToolbarButton
              onClick={centerSelected}
              disabled={!selectedObjectId}
              label="Center"
            />
            <ToolbarButton
              onClick={() => replaceInputRef.current?.click()}
              disabled={!selectedObjectId}
              label="Replace"
            />
            <ToolbarButton
              onClick={bringForward}
              disabled={!selectedObjectId}
              label="Bring Forward"
            />
            <ToolbarButton
              onClick={sendBackward}
              disabled={!selectedObjectId}
              label="Send Backward"
            />
            <ToolbarButton
              onClick={deleteSelected}
              disabled={!selectedObjectId}
              label="Delete"
            />

            <span className="mx-1 h-5 w-px bg-neutral-200" />
            <ToolbarButton onClick={zoomOut} label="Zoom Out" />
            <span className="w-12 text-center text-xs text-neutral-500">
              {Math.round(view.zoom * 100)}%
            </span>
            <ToolbarButton onClick={zoomIn} label="Zoom In" />

            <span className="mx-1 h-5 w-px bg-neutral-200" />
            <ToolbarButton onClick={undo} disabled={!canUndo} label="Undo" />
            <ToolbarButton onClick={redo} disabled={!canRedo} label="Redo" />

            <span className="mx-1 h-5 w-px bg-neutral-200" />
            <ToolbarButton
              onClick={() => activePageId && duplicatePage(activePageId)}
              label="Duplicate Page"
            />
            <ToolbarButton
              onClick={() => activePageId && deletePage(activePageId)}
              label="Delete Page"
            />

            <span className="mx-1 h-5 w-px bg-neutral-200" />
            <ToggleButton
              active={view.aspectLocked}
              onClick={() => view.setAspectLocked(!view.aspectLocked)}
              label="Aspect Lock"
            />
            <ToggleButton
              active={view.snapEnabled}
              onClick={() => view.setSnapEnabled(!view.snapEnabled)}
              label="Snap"
            />
            <ToggleButton
              active={view.showMargins}
              onClick={view.toggleMargins}
              label="Margins"
            />
            <ToggleButton
              active={view.showSafeArea}
              onClick={view.toggleSafeArea}
              label="Safe Area"
            />
            <ToggleButton
              active={view.showCenterGuides}
              onClick={view.toggleCenterGuides}
              label="Guides"
            />
            <ToggleButton
              active={view.showGrid}
              onClick={view.toggleGrid}
              label="Grid"
            />

            {selectedObjectId && project.objects[selectedObjectId] && (
              <label className="ml-2 flex items-center gap-1 text-xs text-neutral-600">
                Opacity
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={project.objects[selectedObjectId].opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                />
              </label>
            )}
          </>
        ) : (
          <>
            <span className="text-sm text-neutral-600">
              Adjust the crop, then confirm or cancel.
            </span>
            <span className="flex-1" />
            <ToolbarButton onClick={cancelCropMode} label="Cancel" />
            <button
              className="rounded-md bg-accent-600 px-3 py-1 text-sm text-white hover:bg-accent-700"
              onClick={confirmCropMode}
            >
              Confirm Crop
            </button>
          </>
        )}
      </div>

      {overflowWarning && !isCropping && (
        <div className="border-b border-warning-500/40 bg-warning-50 px-3 py-1 text-xs text-warning-700">
          Some content extends beyond the print-safe margin and may be trimmed
          when printed.
        </div>
      )}
      {rejectedFileMessage && (
        <div className="flex items-center justify-between border-b border-danger-500/40 bg-danger-50 px-3 py-1 text-xs text-danger-700">
          <span>{rejectedFileMessage}</span>
          <button
            onClick={() => setRejectedFileMessage(null)}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-1 items-center justify-center overflow-auto bg-neutral-100 p-6">
        <div
          ref={containerRef}
          className="relative"
          style={{
            width: `${pageSizePt.width * view.zoom}pt`,
            aspectRatio: `${pageSizePt.width} / ${pageSizePt.height}`,
            maxWidth: '100%',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDraggingOver(true)
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={onDrop}
        >
          <canvas ref={canvasElRef} />
          {isDraggingOver && (
            <div className="pointer-events-none absolute inset-0 border-4 border-dashed border-accent-500 bg-accent-50/40" />
          )}
          {activePage?.objectOrder.length === 0 &&
            !isDraggingOver &&
            !isCropping && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm text-neutral-400">Drag an image here</p>
                <p className="text-xs text-neutral-400">or</p>
                <button
                  className="pointer-events-auto rounded-md bg-accent-600 px-3 py-1.5 text-sm text-white hover:bg-accent-700"
                  onClick={() => uploadInputRef.current?.click()}
                >
                  Upload Image
                </button>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      className="rounded-md px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      className={`rounded-md px-2 py-1 text-sm ${active ? 'bg-accent-100 text-accent-700' : 'text-neutral-500 hover:bg-neutral-100'}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

function addOverlays(
  canvas: fabric.Canvas,
  pageSizePx: PixelSize,
  margins: Margins,
  view: {
    showMargins: boolean
    showSafeArea: boolean
    showCenterGuides: boolean
    showGrid: boolean
  },
  outOverlayObjects: fabric.FabricObject[],
) {
  const marginsPx = pxMargins(margins)
  const common = {
    selectable: false,
    evented: false,
    excludeFromExport: true,
  } as const

  const boundary = new fabric.Rect({
    left: 0,
    top: 0,
    width: pageSizePx.width,
    height: pageSizePx.height,
    fill: 'transparent',
    stroke: '#cbd5e1',
    strokeWidth: 1,
    ...common,
  })
  canvas.add(boundary)
  outOverlayObjects.push(boundary)

  if (view.showMargins) {
    const rect = new fabric.Rect({
      left: marginsPx.left,
      top: marginsPx.top,
      width: pageSizePx.width - marginsPx.left - marginsPx.right,
      height: pageSizePx.height - marginsPx.top - marginsPx.bottom,
      fill: 'transparent',
      stroke: '#94a3b8',
      strokeDashArray: [6, 4],
      strokeWidth: 1,
      ...common,
    })
    canvas.add(rect)
    outOverlayObjects.push(rect)
  }

  if (view.showSafeArea) {
    const rect = new fabric.Rect({
      left: marginsPx.left,
      top: marginsPx.top,
      width: pageSizePx.width - marginsPx.left - marginsPx.right,
      height: pageSizePx.height - marginsPx.top - marginsPx.bottom,
      fill: 'transparent',
      stroke: '#f59e0b',
      strokeDashArray: [2, 3],
      strokeWidth: 1,
      ...common,
    })
    canvas.add(rect)
    outOverlayObjects.push(rect)
  }

  if (view.showCenterGuides) {
    const vLine = new fabric.Line(
      [pageSizePx.width / 2, 0, pageSizePx.width / 2, pageSizePx.height],
      {
        stroke: '#a5b4fc',
        strokeDashArray: [4, 4],
        ...common,
      },
    )
    const hLine = new fabric.Line(
      [0, pageSizePx.height / 2, pageSizePx.width, pageSizePx.height / 2],
      {
        stroke: '#a5b4fc',
        strokeDashArray: [4, 4],
        ...common,
      },
    )
    canvas.add(vLine, hLine)
    outOverlayObjects.push(vLine, hLine)
  }

  if (view.showGrid) {
    const spacing = GRID_SPACING_PT * RENDER_SCALE
    for (let x = spacing; x < pageSizePx.width; x += spacing) {
      const line = new fabric.Line([x, 0, x, pageSizePx.height], {
        stroke: '#e2e8f0',
        ...common,
      })
      canvas.add(line)
      outOverlayObjects.push(line)
    }
    for (let y = spacing; y < pageSizePx.height; y += spacing) {
      const line = new fabric.Line([0, y, pageSizePx.width, y], {
        stroke: '#e2e8f0',
        ...common,
      })
      canvas.add(line)
      outOverlayObjects.push(line)
    }
  }
}
