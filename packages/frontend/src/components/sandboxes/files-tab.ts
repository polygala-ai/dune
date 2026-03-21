import { LitElement, css, html } from 'lit'
import { customElement, property, state as litState } from 'lit/decorators.js'
import { virtualize } from '@lit-labs/virtualizer/virtualize.js'
import type { BoxResource, SandboxFsEntry, SandboxFsReadResponse } from '@dune/shared'
import * as api from '../../services/rpc.js'
import { panelStyles } from './view.css.js'

type FsDialogMode = 'upload' | 'new-file' | 'new-folder' | 'rename' | 'import-host' | null

type FsTreeNode = {
  path: string
  name: string
  loaded: boolean
  loading: boolean
  expanded: boolean
  error: string
  children: string[]
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): string {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

@customElement('sandbox-files-tab')
export class SandboxFilesTab extends LitElement {
  @property({ type: Object }) box!: BoxResource
  @property({ type: Boolean }) readOnly = false

  @litState() private fsCurrentPath = '/workspace'
  @litState() private fsEntries: SandboxFsEntry[] = []
  @litState() private fsSelectedPath: string | null = null
  @litState() private fsIncludeHidden = false
  @litState() private fsSearch = ''
  @litState() private fsLoading = false
  @litState() private fsInitializedBoxId: string | null = null
  @litState() private fsPreview: SandboxFsReadResponse | null = null
  @litState() private fsPreviewText = ''
  @litState() private fsPreviewError = ''
  @litState() private fsNodes = new Map<string, FsTreeNode>()
  @litState() private fsActionError = ''
  @litState() private fsActionInfo = ''
  @litState() private fsDialogMode: FsDialogMode = null
  @litState() private fsDialogPrimaryPath = ''
  @litState() private fsDialogSecondaryPath = ''
  @litState() private fsDialogContent = ''
  @litState() private fsActionBusy = false

  static styles = [
    panelStyles,
    css`
      :host { display: block; }

      .fs-layout {
        display: grid;
        grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
        gap: 10px;
        min-height: 480px;
      }

      .fs-pane {
        border: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
        border-radius: 10px;
        background: color-mix(in srgb, var(--bg-surface) 85%, transparent);
        min-height: 0;
        display: flex;
        flex-direction: column;
      }

      .fs-pane-head {
        border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
        padding: 8px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .fs-tree-scroll,
      .fs-main-scroll {
        flex: 1;
        min-height: 0;
        overflow: auto;
        padding: 8px;
      }

      .fs-tree-row {
        border: none;
        width: 100%;
        min-height: 30px;
        border-radius: 8px;
        background: transparent;
        color: var(--text-secondary);
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 6px;
        text-align: left;
        padding: 0 8px;
      }

      .fs-tree-row:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }

      .fs-tree-row.active {
        background: color-mix(in srgb, var(--accent) 14%, transparent);
        color: var(--text-primary);
      }

      .fs-tree-toggle {
        width: 16px;
        text-align: center;
        color: var(--text-muted);
        font-size: 10px;
        flex-shrink: 0;
      }

      .fs-tree-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .fs-toolbar {
        display: grid;
        grid-template-columns: auto auto auto minmax(160px, 1fr) auto auto auto auto;
        gap: 8px;
        align-items: center;
        margin-bottom: 10px;
      }

      .fs-breadcrumb {
        border: 1px solid color-mix(in srgb, var(--text-muted) 20%, transparent);
        border-radius: 8px;
        min-height: 32px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0 8px;
        overflow: auto;
        white-space: nowrap;
        background: var(--bg-primary);
        color: var(--text-secondary);
        font-size: 12px;
      }

      .fs-crumb {
        border: none;
        background: transparent;
        color: inherit;
        font-size: 12px;
        border-radius: 6px;
        padding: 2px 6px;
      }

      .fs-crumb:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }

      .fs-header-row {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) 100px 100px 160px;
        gap: 10px;
        color: var(--text-muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 700;
        padding: 0 8px 8px;
        border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 14%, transparent);
        margin-bottom: 8px;
      }

      .fs-row {
        border: none;
        width: 100%;
        min-height: 36px;
        border-radius: 8px;
        background: transparent;
        color: var(--text-secondary);
        font-size: 12px;
        display: grid;
        grid-template-columns: minmax(220px, 1fr) 100px 100px 160px;
        gap: 10px;
        align-items: center;
        text-align: left;
        padding: 0 8px;
        margin-bottom: 2px;
      }

      .fs-row:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }

      .fs-row.active {
        background: color-mix(in srgb, var(--accent) 13%, transparent);
        color: var(--text-primary);
      }

      .fs-cell-name {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .fs-icon {
        width: 16px;
        height: 16px;
        color: var(--text-muted);
        flex-shrink: 0;
        text-align: center;
      }

      .fs-preview {
        border-top: 1px solid color-mix(in srgb, var(--text-muted) 14%, transparent);
        padding: 8px;
        display: grid;
        gap: 8px;
        min-height: 180px;
      }

      .fs-preview-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: var(--text-muted);
      }

      .fs-preview-body {
        border: 1px solid color-mix(in srgb, var(--text-muted) 16%, transparent);
        border-radius: 8px;
        background: color-mix(in srgb, var(--bg-primary) 95%, transparent);
        min-height: 120px;
        max-height: 260px;
        overflow: auto;
        padding: 8px;
        font-size: 12px;
        color: var(--text-secondary);
        font-family: var(--font-mono);
        white-space: pre-wrap;
        word-break: break-word;
      }

      .fs-empty {
        color: var(--text-muted);
        font-size: 12px;
        padding: 14px 8px;
        text-align: center;
      }

      @media (max-width: 1020px) {
        .fs-layout { grid-template-columns: 1fr; }
        .fs-toolbar { grid-template-columns: 1fr 1fr; }
        .fs-header-row, .fs-row { grid-template-columns: minmax(0, 1fr) 80px 80px 120px; }
      }
    `,
  ]

  /* ── path helpers ── */

  private normalizeFsPath(path: string): string {
    const trimmed = path.trim() || '/'
    if (!trimmed.startsWith('/')) return `/${trimmed}`
    return trimmed === '/' ? '/' : trimmed.replace(/\/+$/, '')
  }

  private fsName(path: string): string {
    const normalized = this.normalizeFsPath(path)
    if (normalized === '/') return '/'
    return normalized.split('/').pop() || normalized
  }

  private fsParent(path: string): string | null {
    const normalized = this.normalizeFsPath(path)
    if (normalized === '/') return null
    const segments = normalized.split('/').filter(Boolean)
    if (segments.length <= 1) return '/'
    return `/${segments.slice(0, -1).join('/')}`
  }

  private fsPathChain(path: string): string[] {
    const normalized = this.normalizeFsPath(path)
    if (normalized === '/') return ['/']
    const out = ['/']
    const parts = normalized.split('/').filter(Boolean)
    let cursor = ''
    for (const part of parts) {
      cursor = `${cursor}/${part}`
      out.push(cursor)
    }
    return out
  }

  /* ── tree node management ── */

  private withFsNodes(mutator: (next: Map<string, FsTreeNode>) => void) {
    const next = new Map(this.fsNodes)
    mutator(next)
    this.fsNodes = next
  }

  private ensureFsNode(path: string) {
    const normalized = this.normalizeFsPath(path)
    if (this.fsNodes.has(normalized)) return
    this.withFsNodes((next) => {
      next.set(normalized, {
        path: normalized,
        name: this.fsName(normalized),
        loaded: false,
        loading: false,
        expanded: normalized === '/',
        error: '',
        children: [],
      })
    })
  }

  private resetFsExplorerState() {
    this.fsCurrentPath = '/workspace'
    this.fsEntries = []
    this.fsSelectedPath = null
    this.fsIncludeHidden = false
    this.fsSearch = ''
    this.fsLoading = false
    this.fsPreview = null
    this.fsPreviewText = ''
    this.fsPreviewError = ''
    this.fsActionError = ''
    this.fsActionInfo = ''
    this.fsDialogMode = null
    this.fsDialogPrimaryPath = ''
    this.fsDialogSecondaryPath = ''
    this.fsDialogContent = ''
    this.fsActionBusy = false
    this.fsNodes = new Map()
    this.ensureFsNode('/')
  }

  /* ── data loading ── */

  private async loadFsNode(path: string): Promise<void> {
    if (!this.box) return
    const normalized = this.normalizeFsPath(path)
    this.ensureFsNode(normalized)
    this.withFsNodes((next) => {
      const node = next.get(normalized)
      if (!node) return
      node.loading = true
      node.error = ''
    })
    try {
      const result = await api.listSandboxFs(this.box.boxId, normalized, {
        includeHidden: this.fsIncludeHidden,
        limit: 2000,
      })
      const childDirs = result.entries
        .filter((entry) => entry.type === 'directory')
        .map((entry) => this.normalizeFsPath(entry.path))
        .sort((a, b) => a.localeCompare(b))

      this.withFsNodes((next) => {
        const node = next.get(normalized)
        if (!node) return
        node.loading = false
        node.loaded = true
        node.children = childDirs
        for (const childPath of childDirs) {
          if (!next.has(childPath)) {
            next.set(childPath, {
              path: childPath,
              name: this.fsName(childPath),
              loaded: false,
              loading: false,
              expanded: false,
              error: '',
              children: [],
            })
          }
        }
      })
    } catch (err: any) {
      this.withFsNodes((next) => {
        const node = next.get(normalized)
        if (!node) return
        node.loading = false
        node.error = err?.message || 'Failed to load folder tree'
      })
    }
  }

  private async ensureFsTreePath(path: string) {
    const chain = this.fsPathChain(path)
    for (let i = 0; i < chain.length; i += 1) {
      const current = chain[i]
      this.ensureFsNode(current)
      this.withFsNodes((next) => {
        const node = next.get(current)
        if (!node) return
        node.expanded = true
      })
      if (i < chain.length - 1) {
        const node = this.fsNodes.get(current)
        if (!node?.loaded && !node?.loading) {
          // eslint-disable-next-line no-await-in-loop
          await this.loadFsNode(current)
        }
      }
    }
  }

  private async loadFsPath(path: string): Promise<void> {
    if (!this.box) return
    const normalized = this.normalizeFsPath(path)
    this.fsLoading = true
    this.fsActionError = ''
    try {
      const result = await api.listSandboxFs(this.box.boxId, normalized, {
        includeHidden: this.fsIncludeHidden,
        limit: 2000,
      })
      this.fsCurrentPath = result.path
      this.fsEntries = result.entries
      this.fsSelectedPath = null
      this.fsPreview = null
      this.fsPreviewText = ''
      this.fsPreviewError = ''
      await this.ensureFsTreePath(result.path)
      await this.loadFsNode(result.path)
    } finally {
      this.fsLoading = false
    }
  }

  async ensureFsInitialized(force = false) {
    if (!this.box) return
    if (!force && this.fsInitializedBoxId === this.box.boxId) return
    this.fsInitializedBoxId = this.box.boxId
    this.resetFsExplorerState()
    try {
      await this.loadFsPath('/workspace')
    } catch (err: any) {
      if (err?.message === 'path_not_found' || err?.message === 'not_directory') {
        await this.loadFsPath('/')
      } else {
        this.fsActionError = err?.message || 'Failed to initialize file browser'
      }
    }
  }

  private get filteredFsEntries(): SandboxFsEntry[] {
    const needle = this.fsSearch.trim().toLowerCase()
    if (!needle) return this.fsEntries
    return this.fsEntries.filter((entry) => `${entry.name} ${entry.path}`.toLowerCase().includes(needle))
  }

  private get selectedFsEntry(): SandboxFsEntry | null {
    if (!this.fsSelectedPath) return null
    return this.fsEntries.find((entry) => entry.path === this.fsSelectedPath) || null
  }

  private isTextPreview(path: string, mimeType: string | null): boolean {
    if (mimeType?.startsWith('text/')) return true
    if (mimeType && [
      'application/json',
      'application/xml',
      'application/javascript',
      'application/x-sh',
      'application/x-yaml',
      'application/yaml',
    ].includes(mimeType)) return true
    return /\.(txt|md|json|yaml|yml|toml|ini|cfg|conf|ts|tsx|js|jsx|css|html|sh|py|go|rs|java|sql|xml)$/i.test(path)
  }

  private async loadFsPreview(path: string) {
    if (!this.box) return
    this.fsPreviewError = ''
    try {
      const preview = await api.readSandboxFsFile(this.box.boxId, path, 1024 * 1024)
      this.fsPreview = preview
      if (this.isTextPreview(path, preview.mimeType)) {
        try {
          this.fsPreviewText = fromBase64(preview.contentBase64)
        } catch {
          this.fsPreviewText = '[binary file]'
        }
      } else {
        this.fsPreviewText = `[binary file] ${preview.size} bytes`
      }
    } catch (err: any) {
      this.fsPreview = null
      this.fsPreviewText = ''
      this.fsPreviewError = err?.message || 'Failed to load file preview'
    }
  }

  /* ── user actions ── */

  private async handleFsSelectEntry(entry: SandboxFsEntry) {
    this.fsSelectedPath = entry.path
    if (entry.type === 'file') {
      await this.loadFsPreview(entry.path)
    } else {
      this.fsPreview = null
      this.fsPreviewText = ''
      this.fsPreviewError = ''
    }
  }

  private async handleFsOpenEntry(entry: SandboxFsEntry) {
    if (entry.type === 'directory') {
      await this.loadFsPath(entry.path)
      return
    }
    await this.handleFsSelectEntry(entry)
  }

  private async handleFsTreeNavigate(path: string) {
    await this.loadFsPath(path)
  }

  private async handleFsToggleNode(path: string) {
    this.ensureFsNode(path)
    const node = this.fsNodes.get(path)
    const nextExpanded = !node?.expanded
    this.withFsNodes((next) => {
      const target = next.get(path)
      if (!target) return
      target.expanded = nextExpanded
    })
    if (nextExpanded) {
      const refreshed = this.fsNodes.get(path)
      if (!refreshed?.loaded && !refreshed?.loading) {
        await this.loadFsNode(path)
      }
    }
  }

  private async handleFsGoUp() {
    const parent = this.fsParent(this.fsCurrentPath)
    if (!parent) return
    await this.loadFsPath(parent)
  }

  private async handleFsRefresh() {
    await this.loadFsPath(this.fsCurrentPath)
  }

  private async handleFsToggleHidden(event: Event) {
    this.fsIncludeHidden = (event.target as HTMLInputElement).checked
    this.fsNodes = new Map()
    this.ensureFsNode('/')
    await this.loadFsPath(this.fsCurrentPath)
  }

  private fsPathToBreadcrumb(path: string): Array<{ label: string; path: string }> {
    const chain = this.fsPathChain(path)
    return chain.map((entry) => ({
      label: entry === '/' ? '/' : this.fsName(entry),
      path: entry,
    }))
  }

  private base64ToBytes(value: string): Uint8Array {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  private async handleFsDownloadSelected() {
    const selected = this.selectedFsEntry
    if (!this.box || !selected || selected.type !== 'file') return
    try {
      const file = await api.downloadFile(this.box.boxId, selected.path)
      const blob = new Blob([this.base64ToBytes(file.contentBase64)], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = selected.name
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      this.fsActionInfo = `Downloaded ${selected.path}`
      this.fsActionError = ''
    } catch (err: any) {
      this.fsActionError = err?.message || 'Failed to download file'
      this.fsActionInfo = ''
    }
  }

  private openFsDialog(mode: FsDialogMode) {
    const selected = this.selectedFsEntry
    this.fsDialogMode = mode
    this.fsActionError = ''
    this.fsActionInfo = ''
    this.fsDialogContent = ''
    if (mode === 'upload' || mode === 'new-file') {
      this.fsDialogPrimaryPath = selected?.type === 'directory'
        ? `${selected.path}/new-file.txt`
        : `${this.fsCurrentPath}/new-file.txt`
      this.fsDialogContent = ''
    } else if (mode === 'new-folder') {
      this.fsDialogPrimaryPath = selected?.type === 'directory'
        ? `${selected.path}/new-folder`
        : `${this.fsCurrentPath}/new-folder`
    } else if (mode === 'rename') {
      this.fsDialogPrimaryPath = selected?.path || ''
      this.fsDialogSecondaryPath = selected?.path
        ? `${this.fsParent(selected.path) || '/'}${this.fsParent(selected.path) === '/' ? '' : '/'}renamed-${selected.name}`
        : ''
    } else if (mode === 'import-host') {
      this.fsDialogPrimaryPath = ''
      this.fsDialogSecondaryPath = this.fsCurrentPath
    }
  }

  private closeFsDialog() {
    if (this.fsActionBusy) return
    this.fsDialogMode = null
  }

  private async submitFsDialog() {
    if (!this.box || !this.fsDialogMode) return
    this.fsActionBusy = true
    this.fsActionError = ''
    this.fsActionInfo = ''
    try {
      if (this.fsDialogMode === 'upload' || this.fsDialogMode === 'new-file') {
        await api.uploadFiles(this.box.boxId, {
          path: this.normalizeFsPath(this.fsDialogPrimaryPath),
          contentBase64: toBase64(this.fsDialogContent),
          overwrite: true,
        })
        this.fsActionInfo = `Saved ${this.normalizeFsPath(this.fsDialogPrimaryPath)}`
      } else if (this.fsDialogMode === 'new-folder') {
        await api.mkdirSandboxFsPath(this.box.boxId, {
          path: this.normalizeFsPath(this.fsDialogPrimaryPath),
          recursive: true,
        })
        this.fsActionInfo = `Created folder ${this.normalizeFsPath(this.fsDialogPrimaryPath)}`
      } else if (this.fsDialogMode === 'rename') {
        await api.moveSandboxFsPath(this.box.boxId, {
          fromPath: this.normalizeFsPath(this.fsDialogPrimaryPath),
          toPath: this.normalizeFsPath(this.fsDialogSecondaryPath),
          overwrite: false,
        })
        this.fsActionInfo = `Renamed ${this.normalizeFsPath(this.fsDialogPrimaryPath)}`
      } else if (this.fsDialogMode === 'import-host') {
        await api.importHostPathToBox(this.box.boxId, {
          hostPath: this.fsDialogPrimaryPath.trim(),
          destPath: this.normalizeFsPath(this.fsDialogSecondaryPath || this.fsCurrentPath),
        })
        this.fsActionInfo = `Imported host path into ${this.normalizeFsPath(this.fsDialogSecondaryPath || this.fsCurrentPath)}`
      }
      this.fsDialogMode = null
      await this.loadFsPath(this.fsCurrentPath)
    } catch (err: any) {
      this.fsActionError = err?.message || 'Filesystem action failed'
    } finally {
      this.fsActionBusy = false
    }
  }

  private async handleFsDeleteSelected() {
    const selected = this.selectedFsEntry
    if (!this.box || !selected) return
    if (!confirm(`Delete "${selected.path}"?`)) return
    this.fsActionError = ''
    this.fsActionInfo = ''
    try {
      await api.deleteSandboxFsPath(this.box.boxId, selected.path, false)
      this.fsActionInfo = `Deleted ${selected.path}`
      await this.loadFsPath(this.fsCurrentPath)
      return
    } catch (err: any) {
      if (err?.message === 'dir_not_empty') {
        if (!confirm(`"${selected.path}" is not empty. Delete recursively?`)) return
        try {
          await api.deleteSandboxFsPath(this.box.boxId, selected.path, true)
          this.fsActionInfo = `Deleted ${selected.path} recursively`
          await this.loadFsPath(this.fsCurrentPath)
          return
        } catch (errRecursive: any) {
          this.fsActionError = errRecursive?.message || 'Failed to delete recursively'
          return
        }
      }
      this.fsActionError = err?.message || 'Failed to delete path'
    }
  }

  /* ── render helpers ── */

  private renderFsEntryRow(entry: SandboxFsEntry) {
    return html`
      <button
        class="fs-row ${this.fsSelectedPath === entry.path ? 'active' : ''}"
        data-testid="fs-row"
        data-path=${entry.path}
        type="button"
        @click=${() => { void this.handleFsSelectEntry(entry) }}
        @dblclick=${() => { void this.handleFsOpenEntry(entry) }}
      >
        <span class="fs-cell-name" title=${entry.path}>
          <span class="fs-icon">${entry.type === 'directory' ? 'D' : entry.type === 'file' ? 'F' : '•'}</span>
          <span>${entry.name}</span>
        </span>
        <span>${entry.type}</span>
        <span>${entry.size == null ? '-' : `${entry.size}`}</span>
        <span>${entry.modifiedAt ? new Date(entry.modifiedAt).toLocaleString() : '-'}</span>
      </button>
    `
  }

  private renderFsTreeNode(path: string, depth = 0): unknown {
    const node = this.fsNodes.get(path)
    if (!node) return ''
    const isActive = this.fsCurrentPath === path
    const hasChildren = node.children.length > 0
    const showToggle = node.loading || hasChildren || !node.loaded

    return html`
      <div>
        <button
          class="fs-tree-row ${isActive ? 'active' : ''}"
          data-testid="fs-tree-row"
          data-path=${path}
          type="button"
          style=${`padding-left:${6 + depth * 14}px;`}
          @click=${() => { void this.handleFsTreeNavigate(path) }}
          @dblclick=${() => { void this.handleFsToggleNode(path) }}
          title=${path}
        >
          <span class="fs-tree-toggle">
            ${showToggle ? (node.loading ? '...' : node.expanded ? '\u25BE' : '\u25B8') : ''}
          </span>
          <span class="fs-tree-name">${node.name}</span>
        </button>
        ${node.error ? html`<div class="meta-text" style=${`padding-left:${20 + depth * 14}px;`}>${node.error}</div>` : ''}
        ${node.expanded
          ? node.children.map((childPath) => this.renderFsTreeNode(childPath, depth + 1))
          : ''}
      </div>
    `
  }

  private renderFsDialog(): unknown {
    if (!this.fsDialogMode) return ''
    const title = this.fsDialogMode === 'upload'
      ? 'Upload File'
      : this.fsDialogMode === 'new-file'
        ? 'Create File'
        : this.fsDialogMode === 'new-folder'
          ? 'Create Folder'
          : this.fsDialogMode === 'rename'
            ? 'Rename Path'
            : 'Import Host Path'

    const submitLabel = this.fsDialogMode === 'rename'
      ? 'Rename'
      : this.fsDialogMode === 'new-folder'
        ? 'Create'
        : this.fsDialogMode === 'import-host'
          ? 'Import'
          : 'Save'

    const primaryLabel = this.fsDialogMode === 'import-host' ? 'Host Path' : 'Path'
    const secondaryLabel = this.fsDialogMode === 'rename' ? 'New Path' : 'Destination Path'
    const needsSecondary = this.fsDialogMode === 'rename' || this.fsDialogMode === 'import-host'
    const needsContent = this.fsDialogMode === 'upload' || this.fsDialogMode === 'new-file'
    const disableSubmit = this.readOnly || this.fsActionBusy || !this.fsDialogPrimaryPath.trim()
      || (needsSecondary && !this.fsDialogSecondaryPath.trim())

    return html`
      <div class="overlay" data-testid="fs-dialog-overlay" @click=${this.closeFsDialog}>
        <div class="modal" data-testid="fs-dialog" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-title">${title}</div>
          ${this.fsActionError ? html`<div class="error" data-testid="fs-action-error">${this.fsActionError}</div>` : ''}
          <label class="field">
            <span class="label">${primaryLabel}</span>
            <input
              class="input"
              data-testid="fs-dialog-primary"
              .value=${this.fsDialogPrimaryPath}
              @input=${(e: Event) => { this.fsDialogPrimaryPath = (e.target as HTMLInputElement).value }}
              ?disabled=${this.readOnly || this.fsActionBusy}
            />
          </label>
          ${needsSecondary ? html`
            <label class="field">
              <span class="label">${secondaryLabel}</span>
              <input
                class="input"
                data-testid="fs-dialog-secondary"
                .value=${this.fsDialogSecondaryPath}
                @input=${(e: Event) => { this.fsDialogSecondaryPath = (e.target as HTMLInputElement).value }}
                ?disabled=${this.readOnly || this.fsActionBusy}
              />
            </label>
          ` : ''}
          ${needsContent ? html`
            <label class="field">
              <span class="label">Content</span>
              <textarea
                class="textarea"
                data-testid="fs-dialog-content"
                .value=${this.fsDialogContent}
                @input=${(e: Event) => { this.fsDialogContent = (e.target as HTMLTextAreaElement).value }}
                ?disabled=${this.readOnly || this.fsActionBusy}
              ></textarea>
            </label>
          ` : ''}
          <div class="modal-actions">
            <button class="btn muted" data-testid="fs-dialog-cancel" type="button" @click=${this.closeFsDialog} ?disabled=${this.fsActionBusy}>Cancel</button>
            <button class="btn primary" data-testid="fs-dialog-submit" type="button" @click=${this.submitFsDialog} ?disabled=${disableSubmit}>${submitLabel}</button>
          </div>
        </div>
      </div>
    `
  }

  render() {
    if (!this.box) return html``

    const selected = this.selectedFsEntry
    const breadcrumbs = this.fsPathToBreadcrumb(this.fsCurrentPath)
    const entries = this.filteredFsEntries
    const previewHeadline = this.fsPreview
      ? `${this.fsPreview.path} (${this.fsPreview.size} bytes${this.fsPreview.truncated ? ', preview truncated' : ''})`
      : selected
        ? `${selected.path}${selected.type !== 'file' ? ' (directory)' : ''}`
        : 'No file selected'

    return html`
      <section class="panel" data-testid="sandbox-files-explorer">
        <div class="panel-title">Files Explorer</div>
        ${this.fsActionError ? html`<div class="error" data-testid="fs-action-error">${this.fsActionError}</div>` : ''}
        ${this.fsActionInfo ? html`<div class="meta-text" data-testid="fs-action-info">${this.fsActionInfo}</div>` : ''}

        <div class="fs-toolbar">
          <button class="btn muted" data-testid="fs-up-btn" type="button" @click=${this.handleFsGoUp} ?disabled=${this.fsLoading || this.fsCurrentPath === '/'}>Up</button>
          <button class="btn muted" data-testid="fs-refresh-btn" type="button" @click=${this.handleFsRefresh} ?disabled=${this.fsLoading}>Refresh</button>
          <button class="btn muted" data-testid="fs-download-btn" type="button" @click=${this.handleFsDownloadSelected} ?disabled=${!selected || selected.type !== 'file'}>Download</button>
          <label class="field" style="margin:0;">
            <input class="input" data-testid="fs-search-input" .value=${this.fsSearch} @input=${(e: Event) => { this.fsSearch = (e.target as HTMLInputElement).value }} placeholder="Search current folder" />
          </label>
          <label class="check-item">
            <input data-testid="fs-hidden-toggle" type="checkbox" .checked=${this.fsIncludeHidden} @change=${this.handleFsToggleHidden} />
            <span>Hidden</span>
          </label>
          <select class="select" data-testid="fs-actions-select" @change=${(e: Event) => {
            const value = (e.target as HTMLSelectElement).value
            ;(e.target as HTMLSelectElement).value = ''
            if (value === 'upload') this.openFsDialog('upload')
            if (value === 'new-file') this.openFsDialog('new-file')
            if (value === 'new-folder') this.openFsDialog('new-folder')
            if (value === 'rename') this.openFsDialog('rename')
            if (value === 'import-host') this.openFsDialog('import-host')
          }} ?disabled=${this.readOnly}>
            <option value="">Actions</option>
            <option value="upload">Upload file</option>
            <option value="new-file">Create file</option>
            <option value="new-folder">Create folder</option>
            <option value="rename">Rename selected</option>
            <option value="import-host">Import host path</option>
          </select>
          <button class="btn warn" data-testid="fs-delete-btn" type="button" @click=${this.handleFsDeleteSelected} ?disabled=${this.readOnly || !selected}>Delete</button>
          <div class="fs-breadcrumb" data-testid="fs-breadcrumb">
            ${breadcrumbs.map((crumb) => html`
              <button
                class="fs-crumb"
                data-testid="fs-breadcrumb-crumb"
                data-path=${crumb.path}
                type="button"
                @click=${() => { void this.loadFsPath(crumb.path) }}
              >${crumb.label}</button>
            `)}
          </div>
        </div>

        <div class="fs-layout">
          <div class="fs-pane">
            <div class="fs-pane-head">
              <span class="meta-text">Folders</span>
              <button class="btn muted" type="button" @click=${() => { void this.loadFsNode(this.fsCurrentPath) }} ?disabled=${this.fsLoading}>Expand</button>
            </div>
            <div class="fs-tree-scroll">
              ${this.renderFsTreeNode('/')}
            </div>
          </div>

          <div class="fs-pane">
            <div class="fs-pane-head">
              <span class="meta-text">${this.fsCurrentPath}</span>
              <span class="meta-text">${entries.length} item${entries.length === 1 ? '' : 's'}</span>
            </div>
            <div class="fs-main-scroll">
              <div class="fs-header-row">
                <span>Name</span>
                <span>Type</span>
                <span>Size</span>
                <span>Modified</span>
              </div>
              ${entries.length === 0
                ? html`<div class="fs-empty">${this.fsLoading ? 'Loading files...' : 'This folder is empty.'}</div>`
                : entries.length > 120
                  ? virtualize({
                      items: entries,
                      renderItem: (entry: SandboxFsEntry) => this.renderFsEntryRow(entry),
                    })
                  : entries.map((entry) => this.renderFsEntryRow(entry))}
            </div>
            <div class="fs-preview">
              <div class="fs-preview-head" data-testid="fs-preview-head">
                <span>${previewHeadline}</span>
                ${selected?.type === 'file'
                  ? html`<button class="btn muted" type="button" @click=${() => { void this.loadFsPreview(selected.path) }}>Reload preview</button>`
                  : ''}
              </div>
              ${this.fsPreviewError
                ? html`<div class="error">${this.fsPreviewError}</div>`
                : html`<div class="fs-preview-body" data-testid="fs-preview-body">${this.fsPreviewText || 'Select a file to preview its content.'}</div>`}
            </div>
          </div>
        </div>
      </section>
      ${this.renderFsDialog()}
    `
  }
}
