import { useEffect, useRef, useState } from 'react'
import PageEditor from '../editor/PageEditor'
import {
  InvalidBookletFileError,
  loadBookletFile,
  NewerBookletFormatError,
  saveBookletFile,
} from '../persistence/bookletFile'
import { flushAutosave, startAutosave } from '../persistence/autosave'
import {
  CorruptSnapshotError,
  loadProjectSnapshot,
  saveProjectSnapshot,
} from '../persistence/projectSnapshotStore'
import { useStorageStatusStore } from '../persistence/storageStatusStore'
import PrintPreview from '../preview/PrintPreview'
import PageSidebar from '../sidebar/PageSidebar'
import { resetProjectStore, useProjectStore } from '../store/projectStore'
import RightPanel from './RightPanel'
import { matchShortcut } from './shortcuts'

const NARROW_VIEWPORT_QUERY = '(max-width: 767px)'

export default function AppShell() {
  const [showPreview, setShowPreview] = useState(false)
  // Below the `md` breakpoint, the sidebar and right panel would otherwise
  // squeeze the canvas out entirely, so they default to hidden there and
  // stay fully visible (ignoring this state) at `md` and above via the
  // `md:` classes below.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(NARROW_VIEWPORT_QUERY).matches,
  )
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(NARROW_VIEWPORT_QUERY).matches,
  )
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)
  const project = useProjectStore((s) => s.project)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const duplicatePage = useProjectStore((s) => s.duplicatePage)
  const setActivePage = useProjectStore((s) => s.setActivePage)
  const storageStatus = useStorageStatusStore()
  const openInputRef = useRef<HTMLInputElement>(null)

  // Restore the most recent autosaved project on mount, then start autosave.
  useEffect(() => {
    let cancelled = false
    async function restore() {
      try {
        const snapshot = await loadProjectSnapshot()
        if (cancelled) return
        if (snapshot) resetProjectStore(snapshot)
      } catch (err) {
        if (cancelled) return
        setRestoreNotice(
          err instanceof CorruptSnapshotError
            ? 'Your saved project could not be read, so a new project was started.'
            : 'Local storage is unavailable; changes will not be saved this session.',
        )
      }
      startAutosave()
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleBeforeUnload() {
      void flushAutosave()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // App-level keyboard shortcuts (undo/redo/duplicate page/page navigation).
  // Object deletion is handled inside PageEditor, where the selection lives.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const active = document.activeElement
      const isFormControl =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement
      if (isFormControl) return

      const action = matchShortcut(e)
      if (!action) return

      const { pageOrder, activePageId } = useProjectStore.getState().project
      const index = pageOrder.indexOf(activePageId)

      switch (action) {
        case 'undo':
          e.preventDefault()
          undo()
          break
        case 'redo':
          e.preventDefault()
          redo()
          break
        case 'duplicatePage':
          e.preventDefault()
          duplicatePage(activePageId)
          break
        case 'nextPage':
          if (index < pageOrder.length - 1) setActivePage(pageOrder[index + 1])
          break
        case 'prevPage':
          if (index > 0) setActivePage(pageOrder[index - 1])
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, duplicatePage, setActivePage])

  async function handleSaveProject() {
    const blob = await saveBookletFile(project)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'project.booklet'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleOpenProjectClick() {
    const hasContent =
      project.pageOrder.length > 1 || Object.keys(project.objects).length > 0
    if (hasContent) {
      const proceed = window.confirm(
        'Opening a project replaces your current one. Continue?',
      )
      if (!proceed) return
    }
    openInputRef.current?.click()
  }

  async function handleOpenProjectFile(file: File) {
    try {
      const loaded = await loadBookletFile(file)
      resetProjectStore(loaded)
      await saveProjectSnapshot(loaded)
    } catch (err) {
      if (
        err instanceof NewerBookletFormatError ||
        err instanceof InvalidBookletFileError
      ) {
        window.alert(err.message)
      } else {
        window.alert('Could not open this project file.')
      }
    }
  }

  return (
    <div className="flex h-full flex-col bg-neutral-50 text-neutral-900">
      <header className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-0 px-3 py-1.5">
        <button
          className="rounded-md px-1.5 py-1 text-neutral-500 hover:bg-neutral-100 md:hidden"
          onClick={() => setSidebarCollapsed((c) => !c)}
          aria-label="Toggle page sidebar"
        >
          ☰
        </button>
        <span className="text-sm font-semibold">Booklet Creator</span>
        <span className="flex-1" />
        <button
          className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          onClick={handleOpenProjectClick}
        >
          Open Project
        </button>
        <button
          className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          onClick={handleSaveProject}
        >
          Save Project
        </button>
        <input
          ref={openInputRef}
          type="file"
          accept=".booklet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleOpenProjectFile(file)
            e.target.value = ''
          }}
        />
        <button
          className="rounded-md px-1.5 py-1 text-neutral-500 hover:bg-neutral-100 md:hidden"
          onClick={() => setRightPanelCollapsed((c) => !c)}
          aria-label="Toggle export and settings panel"
        >
          ⚙
        </button>
      </header>

      {restoreNotice && (
        <div className="border-b border-warning-500/40 bg-warning-50 px-3 py-1 text-xs text-warning-700">
          {restoreNotice}
        </div>
      )}
      {(storageStatus.quotaExceeded || storageStatus.storageUnavailable) && (
        <div className="border-b border-danger-500/40 bg-danger-50 px-3 py-1 text-xs text-danger-700">
          {storageStatus.quotaExceeded
            ? 'Local storage is full -- new changes may not be saved. You can still export.'
            : 'Local storage is unavailable -- changes will not be saved this session. You can still export.'}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div
          className={`min-w-0 shrink-0 overflow-hidden transition-all duration-200 ${
            sidebarCollapsed ? 'w-0' : 'w-[var(--spacing-sidebar-w)]'
          } md:w-[var(--spacing-sidebar-w)]`}
        >
          <PageSidebar />
        </div>

        <div className="min-w-0 flex-1 transition-opacity duration-150">
          {showPreview ? (
            <PrintPreview onClose={() => setShowPreview(false)} />
          ) : (
            <PageEditor />
          )}
        </div>

        <div
          className={`min-w-0 shrink-0 overflow-hidden transition-all duration-200 ${
            rightPanelCollapsed ? 'w-0' : 'w-[var(--spacing-panel-w)]'
          } md:w-[var(--spacing-panel-w)]`}
        >
          <RightPanel onOpenPreview={() => setShowPreview(true)} />
        </div>
      </div>
    </div>
  )
}
