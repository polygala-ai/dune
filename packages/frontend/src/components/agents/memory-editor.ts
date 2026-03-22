import { LitElement, html, css, nothing } from 'lit'
import { customElement, property, state as litState } from 'lit/decorators.js'
import type { Agent, MemoryFile } from '@dune/shared'
import * as api from '../../services/rpc.js'
import { uiPreferences } from '../../state/ui-preferences.js'
import { iconX } from '../../utils/icons.js'

type MemorySort = 'name' | 'updated' | 'size'
type MemoryPane = 'files' | 'editor'

const DEFAULT_MEMORY_FILES_WIDTH_PX = 280
const MEMORY_FILES_MIN_WIDTH_PX = 220
const MEMORY_FILES_MAX_WIDTH_PX = 460
const MEMORY_EDITOR_MIN_WIDTH_PX = 320
const MEMORY_SPLITTER_TRACK_PX = 6
const MEMORY_RESIZE_STEP_PX = 16
const MEMORY_RESIZE_STEP_FAST_PX = 32
const MEMORY_MOBILE_BREAKPOINT_PX = 980

export type MemoryEditorSnapshot = {
  memoryPane: MemoryPane
  memoryFilesPaneWidthPx: number
  memoryQuery: string
  memorySort: MemorySort
  memorySelectedPath: string | null
  memoryFileContent: string
  memoryFileOriginal: string
  memoryFiles: MemoryFile[]
  memoryCreating: boolean
  memoryNewFileName: string
  memoryDeleteConfirm: string | null
}

@customElement('agent-memory-editor')
export class AgentMemoryEditor extends LitElement {
  @property({ type: String }) agentId = ''
  @property({ type: Object }) agent!: Agent

  @litState() private memoryFiles: MemoryFile[] = []
  @litState() private memoryLoading = false
  @litState() private memorySelectedPath: string | null = null
  @litState() private memoryFileContent = ''
  @litState() private memoryFileOriginal = ''
  @litState() private memoryFileLoading = false
  @litState() private memorySaving = false
  @litState() private memoryCreating = false
  @litState() private memoryNewFileName = ''
  @litState() private memoryDeleteConfirm: string | null = null
  @litState() private memoryQuery = ''
  @litState() private memorySort: MemorySort = 'updated'
  @litState() private memoryPane: MemoryPane = 'files'
  @litState() private memoryFilesPaneWidthPx = DEFAULT_MEMORY_FILES_WIDTH_PX
  @litState() private memoryResizeActive = false

  private memoryResizePointerId: number | null = null
  private memoryResizeStartX = 0
  private memoryResizeStartWidth = DEFAULT_MEMORY_FILES_WIDTH_PX
  private memoryResizeListenersBound = false

  static styles = css`
    :host {
      display: block;
      position: absolute;
      inset: 0;
      z-index: 100;
      background: var(--bg-primary);
    }

    .memory-shell {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      gap: var(--space-sm);
      padding: 10px 12px;
    }

    .memory-toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      flex-wrap: wrap;
    }

    .memory-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary);
      margin-right: 4px;
    }

    .memory-toolbar-spacer {
      flex: 1;
      min-width: 0;
    }

    .memory-search {
      flex: 1;
      min-width: 220px;
      border: none;
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      color: var(--text-primary);
      padding: 8px 10px;
      font-size: var(--text-secondary-size);
    }

    .memory-sort {
      border: none;
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      color: var(--text-primary);
      padding: 8px 10px;
      font-size: var(--text-secondary-size);
    }

    .memory-btn {
      border: none;
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      color: var(--text-secondary);
      font-size: var(--text-secondary-size);
      padding: 8px 11px;
      font-weight: 600;
      cursor: pointer;
    }

    .memory-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .memory-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .memory-btn.primary {
      background: var(--accent);
      color: #fff;
    }

    .memory-btn.primary:hover {
      background: var(--accent-hover);
      color: #fff;
    }

    .memory-pane-toggle {
      display: none;
      align-items: center;
      gap: 2px;
      padding: 2px;
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
    }

    .memory-pane-btn {
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      padding: 5px 9px;
      cursor: pointer;
    }

    .memory-pane-btn.active {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .memory-content {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(220px, var(--memory-files-width, 280px)) 6px minmax(320px, 1fr);
      gap: 0;
    }

    .memory-files-pane,
    .memory-editor-pane {
      background: var(--bg-surface);
      border-radius: var(--radius);
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .memory-pane-head {
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-shrink: 0;
    }

    .memory-files-head {
      align-items: flex-start;
      justify-content: flex-start;
      flex-direction: column;
      gap: 2px;
    }

    .memory-resizer {
      width: 6px;
      min-height: 0;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      cursor: col-resize;
      touch-action: none;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .memory-resizer::before {
      content: '';
      width: 2px;
      height: 38px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--border-primary) 72%, transparent);
      transition: background var(--transition-fast), height var(--transition-fast);
    }

    .memory-resizer:hover::before,
    .memory-resizer.active::before {
      background: color-mix(in srgb, var(--accent) 55%, var(--border-primary));
      height: 48px;
    }

    .memory-resizer:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 1px;
    }

    .memory-pane-label {
      font-size: var(--text-meta-size);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
    }

    .memory-pane-meta {
      font-size: var(--text-meta-size);
      color: var(--text-muted);
    }

    .memory-new-file {
      padding: 0 12px 10px;
    }

    .memory-new-input {
      width: 100%;
      border: none;
      border-radius: var(--radius-sm);
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 8px 10px;
      font-size: 12px;
      font-family: var(--font-mono);
      outline: none;
      box-sizing: border-box;
    }

    .memory-new-input:focus {
      box-shadow: 0 0 0 2px var(--focus-ring);
    }

    .memory-file-table {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding: 0 12px 12px;
    }

    .memory-file-table-head,
    .memory-file-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(130px, 0.54fr) minmax(72px, 0.26fr) 28px;
      column-gap: 10px;
      align-items: center;
    }

    .memory-file-table.hide-date .memory-file-table-head,
    .memory-file-table.hide-date .memory-file-row {
      grid-template-columns: minmax(0, 1fr) minmax(60px, 0.24fr) 28px;
    }

    .memory-file-table-head {
      border-top: 1px solid color-mix(in srgb, var(--border-primary) 70%, transparent);
      padding: 9px 8px 7px;
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-muted);
      font-weight: 600;
      flex-shrink: 0;
    }

    .memory-file-list {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 2px 0 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .memory-file-entry {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .memory-file-row {
      border-radius: var(--radius-sm);
      background: transparent;
      padding: 8px;
      min-height: 34px;
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .memory-file-row:hover {
      background: var(--bg-hover);
    }

    .memory-file-row.active {
      background: var(--bg-hover);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
    }

    .memory-file-row:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 1px;
    }

    .memory-col-name {
      min-width: 0;
      text-align: left;
    }

    .memory-col-date,
    .memory-col-size {
      text-align: right;
      white-space: nowrap;
      color: var(--text-muted);
      font-size: 11px;
    }

    .memory-col-action {
      justify-self: end;
    }

    .memory-file-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .memory-file-date,
    .memory-file-size {
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .memory-file-delete {
      width: 24px;
      height: 24px;
      border: none;
      border-radius: var(--radius-xs);
      background: transparent;
      color: var(--text-muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    }

    .memory-file-delete:hover {
      color: var(--error);
      background: color-mix(in srgb, var(--error) 10%, transparent);
    }

    .memory-file-delete:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 1px;
    }

    .memory-file-delete svg {
      width: 12px;
      height: 12px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    .memory-delete-confirm {
      margin: 0 8px 4px;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--error) 10%, transparent);
      font-size: 11px;
      color: var(--error);
    }

    .memory-delete-confirm span {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .memory-delete-btn {
      border: none;
      border-radius: 6px;
      background: transparent;
      padding: 3px 8px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
    }

    .memory-delete-yes {
      color: var(--error);
    }

    .memory-delete-yes:hover {
      color: #fff;
      background: var(--error);
    }

    .memory-delete-no {
      color: var(--text-secondary);
    }

    .memory-delete-no:hover {
      background: var(--bg-hover);
    }

    .memory-editor-head {
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .memory-editor-title-wrap {
      min-width: 0;
      flex: 1;
    }

    .memory-editor-filename {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      font-family: var(--font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .memory-editor-path {
      margin-top: 2px;
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .memory-dirty-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      flex-shrink: 0;
    }

    .memory-editor-meta {
      font-size: 11px;
      color: var(--text-muted);
      text-align: right;
      white-space: nowrap;
    }

    .memory-editor-body {
      flex: 1;
      min-height: 0;
      padding: 0 12px 12px;
      display: flex;
    }

    .memory-textarea {
      flex: 1;
      width: 100%;
      min-height: 0;
      resize: none;
      outline: none;
      border: none;
      border-radius: var(--radius-sm);
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.6;
      font-family: var(--font-mono);
      box-sizing: border-box;
    }

    .memory-textarea:focus {
      box-shadow: 0 0 0 2px var(--focus-ring);
    }

    .memory-search:focus,
    .memory-sort:focus,
    .memory-pane-btn:focus-visible,
    .memory-btn:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 1px;
    }

    .memory-empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: var(--text-muted);
      font-size: 13px;
      padding: 20px;
      text-align: center;
    }

    .memory-empty-icon {
      font-size: 32px;
      opacity: 0.4;
    }

    @media (max-width: 980px) {
      .memory-pane-toggle {
        display: inline-flex;
      }

      .memory-file-table-head,
      .memory-file-row {
        grid-template-columns: minmax(0, 1fr) minmax(118px, 0.52fr) minmax(64px, 0.24fr) 26px;
        column-gap: 8px;
      }

      .memory-content {
        grid-template-columns: minmax(0, 1fr);
      }

      .memory-resizer {
        display: none;
      }

      .memory-files-pane,
      .memory-editor-pane {
        display: none;
      }

      .memory-content.show-files .memory-files-pane {
        display: flex;
      }

      .memory-content.show-editor .memory-editor-pane {
        display: flex;
      }
    }

    @media (max-width: 760px) {
      .memory-shell {
        padding: 8px 10px;
      }

      .memory-search {
        min-width: 100%;
      }
    }
  `

  async open() {
    this.memoryLoading = true
    this.memoryPane = 'files'
    this.memorySelectedPath = null
    this.memoryFileContent = ''
    this.memoryFileOriginal = ''
    this.memoryCreating = false
    this.memoryDeleteConfirm = null
    this.memoryQuery = ''
    await this.refreshMemoryFiles(this.agentId)
    if (this.agentId === this.agent?.id) this.memoryLoading = false
  }

  captureSnapshot(): MemoryEditorSnapshot {
    return {
      memoryPane: this.memoryPane,
      memoryFilesPaneWidthPx: this.memoryFilesPaneWidthPx,
      memoryQuery: this.memoryQuery,
      memorySort: this.memorySort,
      memorySelectedPath: this.memorySelectedPath,
      memoryFileContent: this.memoryFileContent,
      memoryFileOriginal: this.memoryFileOriginal,
      memoryFiles: [...this.memoryFiles],
      memoryCreating: this.memoryCreating,
      memoryNewFileName: this.memoryNewFileName,
      memoryDeleteConfirm: this.memoryDeleteConfirm,
    }
  }

  applySnapshot(snapshot: MemoryEditorSnapshot) {
    const normalizedDeleteConfirm = snapshot.memoryDeleteConfirm && snapshot.memoryFiles.some((file) => file.path === snapshot.memoryDeleteConfirm)
      ? snapshot.memoryDeleteConfirm
      : null

    this.memoryPane = snapshot.memoryPane
    this.memoryFilesPaneWidthPx = this.clampMemoryFilesPaneWidth(snapshot.memoryFilesPaneWidthPx)
    this.memoryQuery = snapshot.memoryQuery
    this.memorySort = snapshot.memorySort
    this.memorySelectedPath = snapshot.memorySelectedPath
    this.memoryFileContent = snapshot.memoryFileContent
    this.memoryFileOriginal = snapshot.memoryFileOriginal
    this.memoryFiles = [...snapshot.memoryFiles]
    this.memoryCreating = snapshot.memoryCreating
    this.memoryNewFileName = snapshot.memoryNewFileName
    this.memoryDeleteConfirm = normalizedDeleteConfirm
    this.memoryLoading = false
    this.memoryFileLoading = false
    this.memorySaving = false
  }

  applyDefaultSnapshot() {
    const persistedWidth = uiPreferences.getAgentMemoryPaneWidth(this.agentId)
    this.memoryPane = 'files'
    this.memoryFilesPaneWidthPx = this.clampMemoryFilesPaneWidth(persistedWidth ?? DEFAULT_MEMORY_FILES_WIDTH_PX)
    this.memoryQuery = ''
    this.memorySort = 'updated'
    this.memorySelectedPath = null
    this.memoryFileContent = ''
    this.memoryFileOriginal = ''
    this.memoryFiles = []
    this.memoryCreating = false
    this.memoryNewFileName = ''
    this.memoryDeleteConfirm = null
    this.memoryLoading = false
    this.memoryFileLoading = false
    this.memorySaving = false
  }

  get dirty(): boolean {
    return this.memoryFileContent !== this.memoryFileOriginal
  }

  refreshIfStale(agentId: string) {
    const showLoadingState = this.memoryFiles.length === 0
    if (showLoadingState) this.memoryLoading = true
    void this.refreshMemoryFiles(agentId).finally(() => {
      if (!showLoadingState) return
      if (this.agent?.id === agentId) this.memoryLoading = false
    })
  }

  finishResize() {
    const wasActive = this.memoryResizeActive
    this.memoryResizeActive = false
    this.memoryResizePointerId = null
    this.unbindMemoryResizeListeners()
    if (wasActive) this.persistMemoryFilesPaneWidth()
  }

  disconnectedCallback() {
    this.finishResize()
    super.disconnectedCallback()
  }

  // ── Private helpers ──

  private get memoryDirty(): boolean {
    return this.memoryFileContent !== this.memoryFileOriginal
  }

  private get selectedMemoryFile(): MemoryFile | null {
    if (!this.memorySelectedPath) return null
    return this.memoryFiles.find(file => file.path === this.memorySelectedPath) || null
  }

  private get filesOnlyMemoryFiles(): MemoryFile[] {
    return this.memoryFiles.filter((file) => this.isListableMemoryFile(file.path))
  }

  private get filteredMemoryFiles(): MemoryFile[] {
    const needle = this.memoryQuery.trim().toLowerCase()
    const filtered = this.filesOnlyMemoryFiles.filter((file) => {
      if (!needle) return true
      const path = this.normalizeMemoryPath(file.path)
      const name = this.getMemoryFileName(path)
      return `${path} ${name}`.toLowerCase().includes(needle)
    })

    filtered.sort((a, b) => {
      if (this.memorySort === 'updated') {
        const delta = b.modifiedAt - a.modifiedAt
        if (delta !== 0) return delta
      } else if (this.memorySort === 'size') {
        const delta = b.size - a.size
        if (delta !== 0) return delta
      } else {
        const nameDelta = this.getMemoryFileName(a.path).localeCompare(this.getMemoryFileName(b.path))
        if (nameDelta !== 0) return nameDelta
      }
      return this.normalizeMemoryPath(a.path).localeCompare(this.normalizeMemoryPath(b.path))
    })

    return filtered
  }

  private normalizeMemoryPath(path: string): string {
    return path.replace(/\\/g, '/').trim()
  }

  private getMemoryFileName(path: string): string {
    const normalized = this.normalizeMemoryPath(path)
    const name = normalized.split('/').pop()
    return name && name.length > 0 ? name : normalized
  }

  private isListableMemoryFile(path: string): boolean {
    const normalized = this.normalizeMemoryPath(path)
    if (!normalized || normalized.endsWith('/')) return false
    const name = this.getMemoryFileName(normalized)
    return Boolean(name && name !== '.' && name !== '..')
  }

  private formatMemorySize(size: number): string {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  private formatMemoryDate(ts: number): string {
    return new Date(ts).toLocaleString()
  }

  private async refreshMemoryFiles(agentId = this.agentId) {
    try {
      const files = await api.listMemoryFiles(agentId)
      if (this.agent?.id !== agentId) return
      this.memoryFiles = files
    } catch {
      if (this.agent?.id !== agentId) return
      this.memoryFiles = []
    }
  }

  private isMemoryDesktopLayout(): boolean {
    return window.matchMedia(`(min-width: ${MEMORY_MOBILE_BREAKPOINT_PX + 1}px)`).matches
  }

  private getMemoryContentWidth(): number | null {
    const content = this.shadowRoot?.querySelector<HTMLElement>('.memory-content')
    if (!content) return null
    return content.getBoundingClientRect().width
  }

  private getMemoryFilesPaneEffectiveMax(containerWidth = this.getMemoryContentWidth()): number {
    if (containerWidth == null || !Number.isFinite(containerWidth)) return MEMORY_FILES_MAX_WIDTH_PX
    const editorBound = Math.floor(containerWidth - MEMORY_EDITOR_MIN_WIDTH_PX - MEMORY_SPLITTER_TRACK_PX)
    return Math.max(MEMORY_FILES_MIN_WIDTH_PX, Math.min(MEMORY_FILES_MAX_WIDTH_PX, editorBound))
  }

  private clampMemoryFilesPaneWidth(width: number, containerWidth = this.getMemoryContentWidth()): number {
    if (!Number.isFinite(width)) return DEFAULT_MEMORY_FILES_WIDTH_PX
    const min = MEMORY_FILES_MIN_WIDTH_PX
    const max = this.getMemoryFilesPaneEffectiveMax(containerWidth)
    if (width < min) return min
    if (width > max) return max
    return Math.round(width)
  }

  private persistMemoryFilesPaneWidth() {
    const nextWidth = this.clampMemoryFilesPaneWidth(this.memoryFilesPaneWidthPx)
    this.memoryFilesPaneWidthPx = nextWidth
    if (!this.agentId) return
    uiPreferences.setAgentMemoryPaneWidth(this.agentId, nextWidth)
    this.dispatchEvent(new CustomEvent('memory-state-changed', { bubbles: true, composed: true }))
  }

  private bindMemoryResizeListeners() {
    if (this.memoryResizeListenersBound) return
    this.memoryResizeListenersBound = true
    window.addEventListener('pointermove', this.handleMemoryResizePointerMove)
    window.addEventListener('pointerup', this.handleMemoryResizePointerEnd)
    window.addEventListener('pointercancel', this.handleMemoryResizePointerEnd)
  }

  private unbindMemoryResizeListeners() {
    if (!this.memoryResizeListenersBound) return
    this.memoryResizeListenersBound = false
    window.removeEventListener('pointermove', this.handleMemoryResizePointerMove)
    window.removeEventListener('pointerup', this.handleMemoryResizePointerEnd)
    window.removeEventListener('pointercancel', this.handleMemoryResizePointerEnd)
  }

  private readonly handleMemoryResizePointerMove = (event: PointerEvent) => {
    if (!this.memoryResizeActive) return
    if (this.memoryResizePointerId !== null && event.pointerId !== this.memoryResizePointerId) return
    const deltaX = event.clientX - this.memoryResizeStartX
    const width = this.memoryResizeStartWidth + deltaX
    this.memoryFilesPaneWidthPx = this.clampMemoryFilesPaneWidth(width)
  }

  private readonly handleMemoryResizePointerEnd = (event: PointerEvent) => {
    if (!this.memoryResizeActive) return
    if (this.memoryResizePointerId !== null && event.pointerId !== this.memoryResizePointerId) return
    this.finishResize()
  }

  private handleMemoryResizePointerDown(event: PointerEvent) {
    if (!this.isMemoryDesktopLayout()) return
    event.preventDefault()
    const handle = event.currentTarget as HTMLElement | null
    if (handle?.setPointerCapture) {
      try {
        handle.setPointerCapture(event.pointerId)
      } catch {
        // Continue using window listeners if pointer capture is unavailable.
      }
    }
    this.memoryResizeActive = true
    this.memoryResizePointerId = event.pointerId
    this.memoryResizeStartX = event.clientX
    this.memoryResizeStartWidth = this.clampMemoryFilesPaneWidth(this.memoryFilesPaneWidthPx)
    this.bindMemoryResizeListeners()
  }

  private handleMemoryResizeKeydown(event: KeyboardEvent) {
    if (!this.isMemoryDesktopLayout()) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.shiftKey ? MEMORY_RESIZE_STEP_FAST_PX : MEMORY_RESIZE_STEP_PX
    const delta = event.key === 'ArrowLeft' ? -step : step
    this.memoryFilesPaneWidthPx = this.clampMemoryFilesPaneWidth(this.memoryFilesPaneWidthPx + delta)
    this.persistMemoryFilesPaneWidth()
  }

  private handleClose() {
    if (this.memoryDirty) {
      if (!confirm('You have unsaved changes. Close anyway?')) return
    }
    this.finishResize()
    this.dispatchEvent(new CustomEvent('memory-close', { bubbles: true, composed: true }))
  }

  private async handleSelectFile(path: string) {
    if (this.memorySelectedPath === path) return
    if (this.memoryDirty) {
      if (!confirm('You have unsaved changes. Switch files?')) return
    }
    const agentId = this.agentId
    this.memorySelectedPath = path
    this.memoryPane = 'editor'
    this.memoryFileLoading = true
    try {
      const { content } = await api.readMemoryFile(agentId, path)
      if (this.agent?.id !== agentId || this.memorySelectedPath !== path) return
      this.memoryFileContent = content
      this.memoryFileOriginal = content
    } catch {
      if (this.agent?.id !== agentId || this.memorySelectedPath !== path) return
      this.memoryFileContent = ''
      this.memoryFileOriginal = ''
    } finally {
      if (this.agent?.id === agentId && this.memorySelectedPath === path) {
        this.memoryFileLoading = false
      }
    }
  }

  private async handleSaveMemory() {
    if (!this.memorySelectedPath) return
    const agentId = this.agentId
    const path = this.memorySelectedPath
    const content = this.memoryFileContent
    this.memorySaving = true
    try {
      await api.writeMemoryFile(agentId, path, content)
      if (this.agent?.id !== agentId || this.memorySelectedPath !== path) return
      this.memoryFileOriginal = content
      await this.refreshMemoryFiles(agentId)
    } catch { /* ignore */ }
    finally {
      if (this.agent?.id === agentId) this.memorySaving = false
    }
  }

  private handleMemoryKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      this.handleSaveMemory()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      this.handleClose()
    }
  }

  private handleMemoryPaneSwitch(pane: 'files' | 'editor') {
    this.memoryPane = pane
  }

  private handleMemorySearchInput(e: Event) {
    this.memoryQuery = (e.target as HTMLInputElement).value
  }

  private handleMemorySortChange(e: Event) {
    this.memorySort = (e.target as HTMLSelectElement).value as typeof this.memorySort
  }

  private handleMemoryRefresh() {
    this.refreshMemoryFiles(this.agentId)
  }

  private handleMemoryFileCardKeydown(e: KeyboardEvent, path: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this.handleSelectFile(path)
    }
  }

  private handleStartCreate() {
    this.memoryCreating = true
    this.memoryPane = 'files'
    this.memoryNewFileName = ''
    requestAnimationFrame(() => {
      this.shadowRoot?.querySelector<HTMLInputElement>('.memory-new-input')?.focus()
    })
  }

  private async handleCreateFile() {
    const agentId = this.agentId
    let name = this.memoryNewFileName.trim()
    if (!name) { this.memoryCreating = false; return }
    if (!name.endsWith('.md')) name += '.md'
    try {
      await api.createMemoryFile(agentId, name)
      if (this.agent?.id !== agentId) return
      await this.refreshMemoryFiles(agentId)
      if (this.agent?.id !== agentId) return
      this.memoryCreating = false
      await this.handleSelectFile(name)
    } catch (err: any) {
      if (this.agent?.id !== agentId) return
      if (err.message?.includes('409')) alert('File already exists')
    }
  }

  private handleNewFileKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); this.handleCreateFile() }
    if (e.key === 'Escape') { e.preventDefault(); this.memoryCreating = false }
  }

  private async handleDeleteFile(path: string) {
    const agentId = this.agentId
    try {
      await api.deleteMemoryFile(agentId, path)
      if (this.agent?.id !== agentId) return
      await this.refreshMemoryFiles(agentId)
      if (this.agent?.id !== agentId) return
      if (this.memorySelectedPath === path) {
        this.memorySelectedPath = null
        this.memoryFileContent = ''
        this.memoryFileOriginal = ''
        this.memoryPane = 'files'
      }
    } catch { /* ignore */ }
    if (this.agent?.id === agentId) this.memoryDeleteConfirm = null
  }

  render() {
    const memoryContentWidth = this.getMemoryContentWidth()
    const memoryFilesWidth = this.clampMemoryFilesPaneWidth(this.memoryFilesPaneWidthPx, memoryContentWidth)
    const memoryFilesMax = this.getMemoryFilesPaneEffectiveMax(memoryContentWidth)
    const showMemoryDateColumn = memoryFilesWidth >= 320

    return html`
      <div class="memory-shell" @keydown=${(e: KeyboardEvent) => this.handleMemoryKeydown(e)}>
        <div class="memory-toolbar">
          <span class="memory-title">Agent Memory</span>
          <div class="memory-pane-toggle">
            <button
              class="memory-pane-btn ${this.memoryPane === 'files' ? 'active' : ''}"
              type="button"
              @click=${() => this.handleMemoryPaneSwitch('files')}
            >Files</button>
            <button
              class="memory-pane-btn ${this.memoryPane === 'editor' ? 'active' : ''}"
              type="button"
              @click=${() => this.handleMemoryPaneSwitch('editor')}
            >Editor</button>
          </div>
          <span class="memory-toolbar-spacer"></span>
          <input
            class="memory-search"
            type="search"
            .value=${this.memoryQuery}
            @input=${this.handleMemorySearchInput}
            placeholder="Search memory files..."
          />
          <select class="memory-sort" .value=${this.memorySort} @change=${this.handleMemorySortChange}>
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
          </select>
          <button class="memory-btn" type="button" @click=${this.handleMemoryRefresh}>Refresh</button>
          <button class="memory-btn" type="button" @click=${this.handleStartCreate}>+ New</button>
          <button class="memory-btn" type="button" @click=${this.handleClose}>Close</button>
        </div>

        ${this.memoryLoading ? html`
          <div class="memory-empty-state">Loading memory files...</div>
        ` : html`
          <div
            class="memory-content ${this.memoryPane === 'files' ? 'show-files' : 'show-editor'}"
            style=${`--memory-files-width: ${memoryFilesWidth}px;`}
          >
            <section class="memory-files-pane">
              <div class="memory-pane-head memory-files-head">
                <span class="memory-pane-label">Files</span>
                <span class="memory-pane-meta">${this.filteredMemoryFiles.length} shown</span>
              </div>

              ${this.memoryCreating ? html`
                <div class="memory-new-file">
                  <input
                    class="memory-new-input"
                    placeholder="filename.md"
                    .value=${this.memoryNewFileName}
                    @input=${(e: Event) => { this.memoryNewFileName = (e.target as HTMLInputElement).value }}
                    @keydown=${(e: KeyboardEvent) => this.handleNewFileKeydown(e)}
                    @blur=${() => { if (!this.memoryNewFileName.trim()) this.memoryCreating = false }}
                  />
                </div>
              ` : nothing}

              <div class="memory-file-table ${showMemoryDateColumn ? '' : 'hide-date'}">
                <div class="memory-file-table-head">
                  <span class="memory-col-name">Name</span>
                  ${showMemoryDateColumn ? html`<span class="memory-col-date">Date Modified</span>` : nothing}
                  <span class="memory-col-size">Size</span>
                  <span class="memory-col-action" aria-hidden="true"></span>
                </div>
                <div class="memory-file-list">
                  ${this.filteredMemoryFiles.length === 0
                    ? html`
                      <div class="memory-empty-state">
                        ${this.filesOnlyMemoryFiles.length === 0
                          ? 'No memory files yet. Create one to get started.'
                          : 'No files match your search.'}
                      </div>
                    `
                    : this.filteredMemoryFiles.map(f => html`
                      <div class="memory-file-entry">
                        <div
                          class="memory-file-row ${this.memorySelectedPath === f.path ? 'active' : ''}"
                          tabindex="0"
                          role="button"
                          title=${f.path}
                          @click=${() => this.handleSelectFile(f.path)}
                          @keydown=${(e: KeyboardEvent) => this.handleMemoryFileCardKeydown(e, f.path)}
                        >
                          <span class="memory-col-name memory-file-name" title=${f.path}>${this.getMemoryFileName(f.path)}</span>
                          ${showMemoryDateColumn ? html`
                            <span class="memory-col-date memory-file-date">${this.formatMemoryDate(f.modifiedAt)}</span>
                          ` : nothing}
                          <span class="memory-col-size memory-file-size">${this.formatMemorySize(f.size)}</span>
                          <button
                            class="memory-file-delete"
                            type="button"
                            aria-label=${`Delete ${this.getMemoryFileName(f.path)}`}
                            title=${`Delete ${this.getMemoryFileName(f.path)}`}
                            @click=${(e: Event) => { e.stopPropagation(); this.memoryDeleteConfirm = f.path }}
                          >
                            ${iconX()}
                          </button>
                        </div>
                        ${this.memoryDeleteConfirm === f.path ? html`
                          <div class="memory-delete-confirm">
                            <span>Delete this file?</span>
                            <button class="memory-delete-btn memory-delete-yes" type="button" @click=${() => this.handleDeleteFile(f.path)}>Yes</button>
                            <button class="memory-delete-btn memory-delete-no" type="button" @click=${() => { this.memoryDeleteConfirm = null }}>No</button>
                          </div>
                        ` : nothing}
                      </div>
                    `)}
                </div>
              </div>
            </section>

            <button
              class="memory-resizer ${this.memoryResizeActive ? 'active' : ''}"
              type="button"
              role="separator"
              aria-label="Resize files pane"
              aria-orientation="vertical"
              aria-valuemin=${String(MEMORY_FILES_MIN_WIDTH_PX)}
              aria-valuemax=${String(memoryFilesMax)}
              aria-valuenow=${String(memoryFilesWidth)}
              tabindex="0"
              @pointerdown=${this.handleMemoryResizePointerDown}
              @keydown=${this.handleMemoryResizeKeydown}
            ></button>

            <section class="memory-editor-pane">
              ${this.memorySelectedPath ? html`
                <div class="memory-editor-head">
                  <div class="memory-editor-title-wrap">
                    <div class="memory-editor-filename">${this.memorySelectedPath.split('/').pop() || this.memorySelectedPath}</div>
                    <div class="memory-editor-path">${this.memorySelectedPath}</div>
                  </div>
                  ${this.memoryDirty ? html`<div class="memory-dirty-dot" title="Unsaved changes"></div>` : nothing}
                  <span class="memory-editor-meta">
                    ${this.selectedMemoryFile?.modifiedAt ? this.formatMemoryDate(this.selectedMemoryFile.modifiedAt) : ''}
                  </span>
                  <button
                    class="memory-btn primary"
                    type="button"
                    ?disabled=${!this.memoryDirty || this.memorySaving}
                    @click=${this.handleSaveMemory}
                  >${this.memorySaving ? 'Saving...' : 'Save'}</button>
                </div>
                <div class="memory-editor-body">
                  ${this.memoryFileLoading ? html`
                    <div class="memory-empty-state">Loading file...</div>
                  ` : html`
                    <textarea
                      class="memory-textarea"
                      .value=${this.memoryFileContent}
                      @input=${(e: Event) => { this.memoryFileContent = (e.target as HTMLTextAreaElement).value }}
                      placeholder="Empty file"
                    ></textarea>
                  `}
                </div>
              ` : html`
                <div class="memory-empty-state">
                  <div class="memory-empty-icon">
                    <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
                      <path d="M3.5 1A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9a1.5 1.5 0 001.5-1.5v-8A1.5 1.5 0 0012.5 4H10V2.5A1.5 1.5 0 008.5 1h-5zM10 4V2.5A.5.5 0 008.5 2h-5a.5.5 0 00-.5.5v11a.5.5 0 00.5.5h9a.5.5 0 00.5-.5v-8a.5.5 0 00-.5-.5H10z"/>
                    </svg>
                  </div>
                  ${this.filesOnlyMemoryFiles.length === 0
                    ? 'No memory files yet. The agent will create files as it learns, or you can create one.'
                    : 'Select a file to view and edit its contents.'}
                  <button class="memory-btn" type="button" @click=${() => this.handleMemoryPaneSwitch('files')}>Browse Files</button>
                </div>
              `}
            </section>
          </div>
        `}
      </div>
    `
  }
}
