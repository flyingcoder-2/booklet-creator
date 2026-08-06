import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef } from 'react'
import { bookletPageSize } from '../imposition/geometry'
import { padCount } from '../imposition/impose'
import type { Page, PageId, Project } from '../model/types'
import { useProjectStore } from '../store/projectStore'
import { useThumbnail } from './useThumbnail'

const ROW_HEIGHT = 96
const THUMBNAIL_WIDTH = 56

export default function PageSidebar() {
  const project = useProjectStore((s) => s.project)
  const addPage = useProjectStore((s) => s.addPage)
  const deletePage = useProjectStore((s) => s.deletePage)
  const duplicatePage = useProjectStore((s) => s.duplicatePage)
  const reorderPages = useProjectStore((s) => s.reorderPages)
  const setActivePage = useProjectStore((s) => s.setActivePage)

  const pageSizePt = useMemo(
    () => bookletPageSize(project.settings.paperSize),
    [project.settings.paperSize],
  )
  const thumbnailSize = useMemo(
    () => ({
      width: THUMBNAIL_WIDTH,
      height: Math.round(
        (THUMBNAIL_WIDTH * pageSizePt.height) / pageSizePt.width,
      ),
    }),
    [pageSizePt],
  )

  const realCount = project.pageOrder.length
  const padded = padCount(realCount)
  const blankCount = padded - realCount

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: realCount + blankCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = project.pageOrder.indexOf(active.id as PageId)
    const newIndex = project.pageOrder.indexOf(over.id as PageId)
    if (oldIndex === -1 || newIndex === -1) return
    reorderPages(arrayMove(project.pageOrder, oldIndex, newIndex))
  }

  return (
    <div className="flex h-full w-[var(--spacing-sidebar-w)] flex-col border-r border-neutral-200 bg-neutral-0">
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={project.pageOrder}
            strategy={verticalListSortingStrategy}
          >
            <div
              style={{
                height: virtualizer.getTotalSize(),
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const isBlank = virtualRow.index >= realCount
                const pageNumber = virtualRow.index + 1

                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {isBlank ? (
                      <BlankPageRow
                        pageNumber={pageNumber}
                        thumbnailSize={thumbnailSize}
                      />
                    ) : (
                      <PageRow
                        pageId={project.pageOrder[virtualRow.index]}
                        page={
                          project.pages[project.pageOrder[virtualRow.index]]
                        }
                        pageNumber={pageNumber}
                        isActive={
                          project.pageOrder[virtualRow.index] ===
                          project.activePageId
                        }
                        canDelete={realCount > 1}
                        objects={project.objects}
                        assets={project.assets}
                        thumbnailSize={thumbnailSize}
                        onSelect={() =>
                          setActivePage(project.pageOrder[virtualRow.index])
                        }
                        onDuplicate={() =>
                          duplicatePage(project.pageOrder[virtualRow.index])
                        }
                        onDelete={() =>
                          deletePage(project.pageOrder[virtualRow.index])
                        }
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <button
        className="border-t border-neutral-200 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-neutral-100"
        onClick={() => addPage()}
      >
        + Add Page
      </button>
    </div>
  )
}

interface PageRowProps {
  pageId: PageId
  page: Page
  pageNumber: number
  isActive: boolean
  canDelete: boolean
  objects: Project['objects']
  assets: Project['assets']
  thumbnailSize: { width: number; height: number }
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}

function PageRow({
  pageId,
  page,
  pageNumber,
  isActive,
  canDelete,
  objects,
  assets,
  thumbnailSize,
  onSelect,
  onDuplicate,
  onDelete,
}: PageRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: pageId,
  })
  const thumbnailUrl = useThumbnail(page, objects, assets, thumbnailSize)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={`flex h-full items-center gap-2 border-b border-neutral-100 px-2 ${
        isActive ? 'bg-accent-500/15' : 'hover:bg-neutral-50'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab px-1 text-neutral-400 hover:text-neutral-600"
        aria-label={`Drag to reorder page ${pageNumber}`}
      >
        ::
      </button>

      <button
        className="flex shrink-0 items-center justify-center border border-neutral-200 bg-white"
        style={{ width: thumbnailSize.width, height: thumbnailSize.height }}
        onClick={onSelect}
        aria-label={`Open page ${pageNumber}`}
      >
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt=""
            width={thumbnailSize.width}
            height={thumbnailSize.height}
            className="pointer-events-none"
          />
        )}
      </button>

      <button className="flex-1 truncate text-left text-sm" onClick={onSelect}>
        Page {pageNumber}
      </button>

      <button
        className="rounded px-1 text-xs text-neutral-500 hover:bg-neutral-100"
        onClick={onDuplicate}
        aria-label={`Duplicate page ${pageNumber}`}
        title="Duplicate"
      >
        ⧉
      </button>
      <button
        className="rounded px-1 text-xs text-neutral-500 hover:bg-danger-50 hover:text-danger-700 disabled:pointer-events-none disabled:opacity-30"
        onClick={onDelete}
        disabled={!canDelete}
        aria-label={`Delete page ${pageNumber}`}
        title={canDelete ? 'Delete' : 'The last page cannot be deleted'}
      >
        ✕
      </button>
    </div>
  )
}

function BlankPageRow({
  pageNumber,
  thumbnailSize,
}: {
  pageNumber: number
  thumbnailSize: { width: number; height: number }
}) {
  return (
    <div className="flex h-full items-center gap-2 border-b border-neutral-100 px-2 opacity-50">
      <span className="w-5" />
      <div
        className="flex shrink-0 items-center justify-center border border-dashed border-neutral-300 bg-neutral-50"
        style={{ width: thumbnailSize.width, height: thumbnailSize.height }}
      />
      <span className="flex-1 truncate text-left text-sm text-neutral-400">
        Page {pageNumber} (blank)
      </span>
    </div>
  )
}
