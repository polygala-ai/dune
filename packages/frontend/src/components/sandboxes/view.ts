import { LitElement, html } from 'lit'
import { customElement, property, state as litState } from 'lit/decorators.js'
import type { Agent, BoxResource } from '@dune/shared'
import * as api from '../../services/rpc.js'
import { parentStyles } from './view.css.js'
import './overview-tab.js'
import './execs-tab.js'
import './files-tab.js'
import './terminal-tab.js'
import './create-dialog.js'
import type { SandboxExecsTab } from './execs-tab.js'
import type { SandboxFilesTab } from './files-tab.js'
import type { SandboxTerminalTab } from './terminal-tab.js'
import type { SandboxCreateDialog } from './create-dialog.js'

type SandboxTab = 'overview' | 'execs' | 'files' | 'terminal'

@customElement('sandboxes-view')
export class SandboxesView extends LitElement {
  @property({ type: Array }) agents: Agent[] = []

  @litState() private query = ''
  @litState() private boxes: BoxResource[] = []
  @litState() private loading = false
  @litState() private errorMessage = ''
  @litState() private selectedBoxId: string | null = null

  @litState() private createOpen = false
  @litState() private detailTab: SandboxTab = 'overview'

  private pollTimer?: ReturnType<typeof setInterval>
  private refreshInFlight = false

  static styles = parentStyles

  connectedCallback() {
    super.connectedCallback()
    this.startPolling()
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    this.stopPolling()
  }

  private startPolling() {
    this.stopPolling()
    void this.refreshAll()
    this.pollTimer = setInterval(() => {
      void this.refreshAll()
    }, 2000)
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
  }

  private get selectedBox(): BoxResource | null {
    if (!this.selectedBoxId) return null
    return this.boxes.find((box) => box.boxId === this.selectedBoxId) || null
  }

  private get filteredBoxes(): BoxResource[] {
    const needle = this.query.trim().toLowerCase()
    if (!needle) return this.boxes
    return this.boxes.filter((box) => {
      const text = [box.name || '', box.boxId, box.status, box.image, box.durability].join(' ').toLowerCase()
      return text.includes(needle)
    })
  }

  private isReadOnly(box: BoxResource): boolean {
    const actor = api.getSandboxActorIdentity()
    if (actor.actorType === 'system' || actor.actorType === 'human') return false
    return box._dune.readOnly || box._dune.managedByAgent
  }

  private canMutate(box: BoxResource): boolean {
    return !this.isReadOnly(box)
  }

  private formatUpdated(ts: number | null): string {
    if (!ts) return 'Unknown'
    const delta = Date.now() - ts
    if (delta < 60_000) return 'just now'
    if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
    if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
    return `${Math.floor(delta / 86_400_000)}d ago`
  }

  private closeDetails = () => {
    this.selectedBoxId = null
    this.detailTab = 'overview'
    // Teardown terminal child if present
    const termTab = this.shadowRoot?.querySelector('sandbox-terminal-tab') as SandboxTerminalTab | null
    termTab?.teardownTerminal()
  }

  private selectBox(boxId: string) {
    this.selectedBoxId = boxId
    this.detailTab = 'overview'
    // Teardown terminal from previous box
    const termTab = this.shadowRoot?.querySelector('sandbox-terminal-tab') as SandboxTerminalTab | null
    termTab?.teardownTerminal()
  }

  private async refreshAll() {
    if (this.refreshInFlight) return
    this.refreshInFlight = true
    this.loading = this.boxes.length === 0

    try {
      const response = await api.listBoxes()
      this.boxes = response.boxes
      this.errorMessage = ''

      if (this.selectedBoxId && !this.boxes.find((box) => box.boxId === this.selectedBoxId)) {
        this.closeDetails()
      }

      if (this.selectedBoxId && this.detailTab === 'execs') {
        const execsTab = this.shadowRoot?.querySelector('sandbox-execs-tab') as SandboxExecsTab | null
        await execsTab?.refreshData()
      }
    } catch (err: any) {
      this.errorMessage = err?.message || 'Failed to load sandboxes'
    } finally {
      this.loading = false
      this.refreshInFlight = false
    }
  }

  private openCreate() {
    this.createOpen = true
    const dialog = this.shadowRoot?.querySelector('sandbox-create-dialog') as SandboxCreateDialog | null
    dialog?.reset()
  }

  private async handleStartBox() {
    const box = this.selectedBox
    if (!box || !this.canMutate(box)) return
    try {
      await api.startBox(box.boxId)
      await this.refreshAll()
    } catch {}
  }

  private async handleStopBox() {
    const box = this.selectedBox
    if (!box || !this.canMutate(box)) return
    try {
      await api.stopBox(box.boxId)
      await this.refreshAll()
    } catch {}
  }

  private async handleDeleteBox() {
    const box = this.selectedBox
    if (!box || !this.canMutate(box)) return
    if (!confirm(`Delete sandbox "${box.name || box.boxId}"?`)) return
    try {
      await api.deleteBox(box.boxId, true)
      this.closeDetails()
      await this.refreshAll()
    } catch {}
  }

  private renderCard(box: BoxResource) {
    const readOnly = this.isReadOnly(box)
    const title = box.name || box.boxId.slice(0, 8)

    return html`
      <article
        class="card"
        data-testid="sandbox-card"
        data-box-id=${box.boxId}
        tabindex="0"
        role="button"
        aria-label=${`Open sandbox ${title}`}
        @click=${() => this.selectBox(box.boxId)}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            this.selectBox(box.boxId)
          }
        }}
      >
        <span class="card-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5l9 5v9l-9 5-9-5v-9l9-5z" stroke-linejoin="round"></path>
            <path d="M12 21.5v-9M3 7.5l9 5 9-5" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </span>
        <div class="card-main">
          <div class="card-title">${title}</div>
          <div class="card-sub">${box.image}</div>
          <div class="meta">
            <span class="chip ${box.status}">${box.status}</span>
            <span class="chip">${box.durability}</span>
            ${readOnly ? html`<span class="chip readonly">read only</span>` : ''}
            <span>Updated ${this.formatUpdated(box.updatedAt)}</span>
          </div>
        </div>
        <button class="action" type="button" title="Open sandbox" @click=${(e: Event) => {
          e.stopPropagation()
          this.selectBox(box.boxId)
        }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 12h16M12 4v16" stroke-linecap="round"></path>
          </svg>
        </button>
      </article>
    `
  }

  render() {
    const selected = this.selectedBox
    const filtered = this.filteredBoxes

    return html`
      <div class="shell">
        <div class="page">
          <div class="toolbar">
            <button class="refresh-btn" type="button" @click=${this.refreshAll} ?disabled=${this.loading}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
              <span>Refresh</span>
            </button>
            <label class="search-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m21 21-4.35-4.35M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" stroke-linecap="round"></path>
              </svg>
              <input class="search" type="search" .value=${this.query} @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value }} placeholder="Search sandboxes" />
            </label>
            <button class="new-btn" type="button" @click=${this.openCreate}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke-linecap="round"></path>
              </svg>
              <span>New sandbox</span>
            </button>
          </div>

          <header class="heading">
            <h1 class="title">Sandboxes</h1>
            <p class="subtitle">Manage sandbox runtimes. <a href="https://docs.boxlite.ai/boxrun" target="_blank" rel="noopener noreferrer">Learn more</a></p>
          </header>

          ${this.errorMessage ? html`<div class="error">${this.errorMessage}</div>` : ''}

          ${filtered.length === 0
            ? html`<div class="empty">${this.loading ? 'Loading sandboxes...' : 'No sandboxes yet.'}</div>`
            : html`<div class="grid">${filtered.map((box) => this.renderCard(box))}</div>`}
        </div>
      </div>

      ${this.createOpen ? html`
        <sandbox-create-dialog
          .agents=${this.agents}
          @sandbox-created=${async (e: CustomEvent) => {
            this.createOpen = false
            await this.refreshAll()
            this.selectBox(e.detail.boxId)
          }}
          @sandbox-create-close=${() => { this.createOpen = false }}
        ></sandbox-create-dialog>
      ` : ''}

      ${selected ? html`
        <div class="overlay" data-testid="sandbox-detail-overlay" @click=${this.closeDetails}>
          <div class="detail" data-testid="sandbox-detail-modal" @click=${(e: Event) => e.stopPropagation()}>
            <div class="detail-head">
              <div>
                <div class="detail-title">${selected.name || selected.boxId.slice(0, 8)}</div>
                <div class="detail-sub">${selected.boxId} · ${selected.image}</div>
              </div>

              <div class="detail-actions">
                <span class="chip ${selected.status}">${selected.status}</span>
                <span class="chip">${selected.durability}</span>
                ${this.isReadOnly(selected) ? html`<span class="chip readonly">read only</span>` : ''}
                <button class="btn muted" type="button" @click=${this.handleStartBox} ?disabled=${!this.canMutate(selected) || selected.status === 'running'}>Start</button>
                <button class="btn muted" type="button" @click=${this.handleStopBox} ?disabled=${!this.canMutate(selected) || selected.status !== 'running'}>Stop</button>
                <button class="btn warn" type="button" @click=${this.handleDeleteBox} ?disabled=${!this.canMutate(selected)}>Delete</button>
                <button class="btn muted" type="button" @click=${this.closeDetails}>Close</button>
              </div>
            </div>

            <div class="tabs">
              <button class="tab ${this.detailTab === 'overview' ? 'active' : ''}" type="button" @click=${() => { this.detailTab = 'overview' }}>Overview</button>
              <button class="tab ${this.detailTab === 'execs' ? 'active' : ''}" type="button" @click=${() => {
                this.detailTab = 'execs'
                requestAnimationFrame(() => {
                  const tab = this.shadowRoot?.querySelector('sandbox-execs-tab') as SandboxExecsTab | null
                  void tab?.refreshData(true)
                })
              }}>Execs</button>
              <button class="tab ${this.detailTab === 'files' ? 'active' : ''}" data-testid="sandbox-tab-files" type="button" @click=${() => {
                this.detailTab = 'files'
                requestAnimationFrame(() => {
                  const tab = this.shadowRoot?.querySelector('sandbox-files-tab') as SandboxFilesTab | null
                  void tab?.ensureFsInitialized()
                })
              }}>Files</button>
              <button class="tab ${this.detailTab === 'terminal' ? 'active' : ''}" type="button" @click=${() => { this.detailTab = 'terminal' }}>Terminal</button>
            </div>

            <div class="detail-body">
              ${this.detailTab === 'overview' ? html`
                <sandbox-overview-tab
                  .box=${selected}
                  .readOnly=${this.isReadOnly(selected)}
                  @sandbox-refresh=${() => { void this.refreshAll() }}
                ></sandbox-overview-tab>
              ` : ''}
              ${this.detailTab === 'execs' ? html`
                <sandbox-execs-tab
                  .box=${selected}
                  .readOnly=${this.isReadOnly(selected)}
                ></sandbox-execs-tab>
              ` : ''}
              ${this.detailTab === 'files' ? html`
                <sandbox-files-tab
                  .box=${selected}
                  .readOnly=${this.isReadOnly(selected)}
                ></sandbox-files-tab>
              ` : ''}
              ${this.detailTab === 'terminal' ? html`
                <sandbox-terminal-tab
                  .box=${selected}
                ></sandbox-terminal-tab>
              ` : ''}
            </div>
          </div>
        </div>
      ` : ''}
    `
  }
}
