import { LitElement, html } from 'lit'
import { customElement, property, state as litState } from 'lit/decorators.js'
import type { Agent, Channel, AgentLogEntry } from '@dune/shared'
import * as api from '../../services/rpc.js'
import { uiPreferences } from '../../state/ui-preferences.js'
import { profilePanelStyles } from './profile-panel.css.js'
import './todo-panel.js'
import './log-viewer.js'
import './profile-tab.js'
import './skills-tab.js'
import './logs-tab.js'
import './system-prompt-overlay.js'
import { iconMinimize, iconMaximize, iconX, iconPlay, iconPause, iconTrash } from '../../utils/icons.js'

const STATUS_LABELS: Record<string, string> = {
  idle: 'Active',
  starting: 'Starting...',
  thinking: 'Thinking...',
  responding: 'Responding...',
  error: 'Error',
  stopping: 'Saving memories...',
  stopped: 'Stopped',
}

const DEFAULT_INSPECTOR_WIDTH_PX = 520
const INSPECTOR_MIN_WIDTH_PX = 360
const INSPECTOR_MAX_WIDTH_PX = 760
const INSPECTOR_VIEWPORT_GUTTER_PX = 24
const INSPECTOR_RESIZE_STEP_PX = 16
const INSPECTOR_RESIZE_STEP_FAST_PX = 32
const INSPECTOR_RESIZE_DESKTOP_QUERY = '(min-width: 761px)'

@customElement('agent-profile-panel')
export class AgentProfilePanel extends LitElement {
  @property({ type: Object }) agent: Agent | null = null
  @property({ type: Array }) channels: Channel[] = []
  @property({ type: Object }) screen: { guiHttpPort: number; guiHttpsPort: number } | null = null
  @property({ type: Array }) logs: AgentLogEntry[] = []
  @property({ type: Boolean }) logsLoading = false
  @property({ type: Boolean }) logsLoadingOlder = false
  @property({ type: Boolean }) logsHasMore = false
  @litState() private activeTab: 'profile' | 'todos' | 'skills' | 'logs' | 'computer' = 'profile'
  @litState() private expanded = false
  @litState() private inspectorWidthPx = DEFAULT_INSPECTOR_WIDTH_PX
  @litState() private inspectorResizeActive = false

  // Name editing
  @litState() private editingName = false
  @litState() private editName = ''
  @litState() private saving = false

  // System prompt
  @litState() private showSystemPrompt = false

  private inspectorResizePointerId: number | null = null
  private inspectorResizeStartX = 0
  private inspectorResizeStartWidth = DEFAULT_INSPECTOR_WIDTH_PX
  private inspectorResizeListenersBound = false
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null
  private readonly uiPreferenceChangeHandler = () => this.syncInspectorWidthFromPreferences()
  private readonly windowResizeHandler = () => {
    if (this.inspectorResizeActive && !this.isResizableInspectorLayout()) {
      this.finishInspectorResize()
      return
    }
    if (!this.isResizableInspectorLayout()) {
      this.requestUpdate()
      return
    }
    const nextWidth = this.clampInspectorWidth(this.inspectorWidthPx)
    if (nextWidth !== this.inspectorWidthPx) {
      this.inspectorWidthPx = nextWidth
      uiPreferences.setInspectorWidth(nextWidth)
      return
    }
    this.requestUpdate()
  }

  static styles = profilePanelStyles

  connectedCallback() {
    super.connectedCallback()
    this._keyHandler = this.handleKeydown.bind(this)
    document.addEventListener('keydown', this._keyHandler)
    this.inspectorWidthPx = this.clampInspectorWidth(uiPreferences.getInspectorWidth() ?? DEFAULT_INSPECTOR_WIDTH_PX)
    uiPreferences.addEventListener('change', this.uiPreferenceChangeHandler)
    window.addEventListener('resize', this.windowResizeHandler)
  }

  disconnectedCallback() {
    this.finishInspectorResize()
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler)
    }
    uiPreferences.removeEventListener('change', this.uiPreferenceChangeHandler)
    window.removeEventListener('resize', this.windowResizeHandler)
    super.disconnectedCallback()
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('agent') && this.agent) {
      this.activeTab = 'profile'
      this.expanded = false
      this.editingName = false
      this.showSystemPrompt = false
    }

    if ((changed.has('activeTab') || changed.has('showSystemPrompt')) && this.inspectorResizeActive && !this.isResizableInspectorLayout()) {
      this.finishInspectorResize()
    }
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (this.showSystemPrompt) {
        this.showSystemPrompt = false
      } else if (this.expanded) {
        this.expanded = false
      } else {
        this.handleClose()
      }
    }
  }

  // ── Inspector resize ───────────────────────────────────────────────

  private syncInspectorWidthFromPreferences() {
    const persisted = uiPreferences.getInspectorWidth()
    if (persisted == null) return
    const nextWidth = this.clampInspectorWidth(persisted)
    if (nextWidth !== this.inspectorWidthPx) {
      this.inspectorWidthPx = nextWidth
    }
  }

  private isResizableInspectorLayout(): boolean {
    return window.matchMedia(INSPECTOR_RESIZE_DESKTOP_QUERY).matches && !this.showSystemPrompt && this.activeTab !== 'computer'
  }

  private getInspectorWidthEffectiveMax(viewportWidth = window.innerWidth): number {
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return INSPECTOR_MAX_WIDTH_PX
    const viewportBound = Math.floor(viewportWidth - INSPECTOR_VIEWPORT_GUTTER_PX)
    return Math.max(INSPECTOR_MIN_WIDTH_PX, Math.min(INSPECTOR_MAX_WIDTH_PX, viewportBound))
  }

  private clampInspectorWidth(width: number, viewportWidth = window.innerWidth): number {
    if (!Number.isFinite(width)) return DEFAULT_INSPECTOR_WIDTH_PX
    const min = INSPECTOR_MIN_WIDTH_PX
    const max = this.getInspectorWidthEffectiveMax(viewportWidth)
    if (width < min) return min
    if (width > max) return max
    return Math.round(width)
  }

  private persistInspectorWidth() {
    const nextWidth = this.clampInspectorWidth(this.inspectorWidthPx)
    this.inspectorWidthPx = nextWidth
    uiPreferences.setInspectorWidth(nextWidth)
  }

  private bindInspectorResizeListeners() {
    if (this.inspectorResizeListenersBound) return
    this.inspectorResizeListenersBound = true
    window.addEventListener('pointermove', this.handleInspectorResizePointerMove)
    window.addEventListener('pointerup', this.handleInspectorResizePointerEnd)
    window.addEventListener('pointercancel', this.handleInspectorResizePointerEnd)
  }

  private unbindInspectorResizeListeners() {
    if (!this.inspectorResizeListenersBound) return
    this.inspectorResizeListenersBound = false
    window.removeEventListener('pointermove', this.handleInspectorResizePointerMove)
    window.removeEventListener('pointerup', this.handleInspectorResizePointerEnd)
    window.removeEventListener('pointercancel', this.handleInspectorResizePointerEnd)
  }

  private finishInspectorResize() {
    const wasActive = this.inspectorResizeActive
    this.inspectorResizeActive = false
    this.inspectorResizePointerId = null
    this.unbindInspectorResizeListeners()
    if (wasActive) this.persistInspectorWidth()
  }

  private readonly handleInspectorResizePointerMove = (event: PointerEvent) => {
    if (!this.inspectorResizeActive) return
    if (this.inspectorResizePointerId !== null && event.pointerId !== this.inspectorResizePointerId) return
    const deltaX = event.clientX - this.inspectorResizeStartX
    const width = this.inspectorResizeStartWidth - deltaX
    this.inspectorWidthPx = this.clampInspectorWidth(width)
  }

  private readonly handleInspectorResizePointerEnd = (event: PointerEvent) => {
    if (!this.inspectorResizeActive) return
    if (this.inspectorResizePointerId !== null && event.pointerId !== this.inspectorResizePointerId) return
    this.finishInspectorResize()
  }

  private handleInspectorResizePointerDown(event: PointerEvent) {
    if (!this.isResizableInspectorLayout()) return
    event.preventDefault()
    const handle = event.currentTarget as HTMLElement | null
    if (handle?.setPointerCapture) {
      try {
        handle.setPointerCapture(event.pointerId)
      } catch {
        // Continue using window listeners if pointer capture is unavailable.
      }
    }
    this.inspectorResizeActive = true
    this.inspectorResizePointerId = event.pointerId
    this.inspectorResizeStartX = event.clientX
    this.inspectorResizeStartWidth = this.clampInspectorWidth(this.inspectorWidthPx)
    this.bindInspectorResizeListeners()
  }

  private handleInspectorResizeKeydown(event: KeyboardEvent) {
    if (!this.isResizableInspectorLayout()) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.shiftKey ? INSPECTOR_RESIZE_STEP_FAST_PX : INSPECTOR_RESIZE_STEP_PX
    const delta = event.key === 'ArrowLeft' ? step : -step
    this.inspectorWidthPx = this.clampInspectorWidth(this.inspectorWidthPx + delta)
    this.persistInspectorWidth()
  }

  // ── Actions ────────────────────────────────────────────────────────

  private toggleExpand() {
    this.expanded = !this.expanded
  }

  private handleToggle() {
    if (!this.agent) return
    this.dispatchEvent(new CustomEvent('toggle-agent', {
      detail: this.agent.id, bubbles: true, composed: true,
    }))
  }

  private handleDelete() {
    if (!this.agent) return
    if (!confirm(`Delete agent "${this.agent.name}"? This cannot be undone.`)) return
    this.dispatchEvent(new CustomEvent('delete-agent', {
      detail: this.agent.id, bubbles: true, composed: true,
    }))
  }

  private handleTabSwitch(tab: 'profile' | 'todos' | 'skills' | 'logs' | 'computer') {
    if (tab !== 'computer') {
      this.expanded = false
    }
    this.activeTab = tab
    if (tab === 'computer' && this.agent) {
      this.dispatchEvent(new CustomEvent('load-agent-screen', {
        detail: this.agent.id, bubbles: true, composed: true,
      }))
    }
  }

  private handleClose() {
    this.expanded = false
    this.showSystemPrompt = false
    this.dispatchEvent(new CustomEvent('close-profile', {
      bubbles: true, composed: true,
    }))
  }

  private handleBackdropClick(e: Event) {
    if ((e.target as HTMLElement).classList.contains('backdrop')) {
      this.handleClose()
    }
  }

  // ── Name editing ───────────────────────────────────────────────────

  private startEditName() {
    if (!this.agent) return
    this.editName = this.agent.name
    this.editingName = true
    this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector('.name-input') as HTMLInputElement
      input?.focus()
      input?.select()
    })
  }

  private async saveName() {
    if (!this.agent || !this.editName.trim()) return
    this.editingName = false
    if (this.editName.trim() !== this.agent.name) {
      this.saving = true
      try {
        const updated = await api.updateAgent(this.agent.id, { name: this.editName.trim() })
        this.dispatchEvent(new CustomEvent('agent-updated', {
          detail: updated, bubbles: true, composed: true,
        }))
      } catch (err) {
        console.error('Failed to update agent name:', err)
      } finally {
        this.saving = false
      }
    }
  }

  private handleNameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      this.saveName()
    } else if (e.key === 'Escape') {
      e.stopPropagation()
      this.editingName = false
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private getModalClass(): string {
    const classes = ['modal']
    if (this.showSystemPrompt) {
      classes.push('prompt-view')
    } else if (this.activeTab === 'computer') {
      classes.push('computer')
      if (this.expanded) classes.push('fullscreen')
    }
    return classes.join(' ')
  }

  // ── Render ─────────────────────────────────────────────────────────

  private renderTabContent() {
    const a = this.agent!
    switch (this.activeTab) {
      case 'profile':
        return html`
          <agent-profile-tab
            .agent=${a}
            .channels=${this.channels}
            @agent-updated=${(e: CustomEvent) => {
              this.dispatchEvent(new CustomEvent('agent-updated', { detail: e.detail, bubbles: true, composed: true }))
            }}
            @view-system-prompt=${() => { this.showSystemPrompt = true }}
          ></agent-profile-tab>
        `
      case 'todos':
        return html`<div class="section-card"><agent-todo-panel .agentId=${a.id}></agent-todo-panel></div>`
      case 'skills':
        return html`<agent-skills-tab .agent=${a}></agent-skills-tab>`
      case 'logs':
        return html`
          <agent-logs-tab
            .agentId=${a.id}
            .logs=${this.logs}
            .logsLoading=${this.logsLoading}
            .logsLoadingOlder=${this.logsLoadingOlder}
            .logsHasMore=${this.logsHasMore}
            @load-agent-logs-older=${(e: CustomEvent) => {
              this.dispatchEvent(new CustomEvent('load-agent-logs-older', { detail: e.detail, bubbles: true, composed: true }))
            }}
          ></agent-logs-tab>
        `
      case 'computer':
        return html`
          <agent-computer-tab
            .agentId=${a.id}
            .guiHttpPort=${this.screen?.guiHttpPort || 0}
          ></agent-computer-tab>
        `
    }
  }

  render() {
    const a = this.agent
    if (!a) return html``

    const initial = a.name.charAt(0).toUpperCase()
    const statusLabel = STATUS_LABELS[a.status] || a.status
    const isStopped = a.status === 'stopped'
    const displayColor = a.avatarColor
    const inspectorResizable = this.isResizableInspectorLayout()
    const inspectorWidth = this.clampInspectorWidth(this.inspectorWidthPx)
    const inspectorWidthMax = this.getInspectorWidthEffectiveMax()
    const modalClass = [this.getModalClass(), this.inspectorResizeActive ? 'resize-active' : ''].filter(Boolean).join(' ')
    const modalStyle = inspectorResizable ? `width:${inspectorWidth}px;` : ''
    const modalContent = this.showSystemPrompt
      ? html`<agent-system-prompt-overlay .agentId=${a.id} @close-prompt=${() => { this.showSystemPrompt = false }}></agent-system-prompt-overlay>`
      : html`
      <div class="modal-header">
        <div class="avatar" style="background: ${displayColor}">${initial}</div>
        <div class="header-info">
          ${this.editingName ? html`
            <input
              class="name-input"
              .value=${this.editName}
              @input=${(e: Event) => { this.editName = (e.target as HTMLInputElement).value }}
              @keydown=${this.handleNameKeydown}
              @blur=${this.saveName}
            />
          ` : html`
            <div class="agent-name" @click=${this.startEditName} title="Click to edit name">${a.name}</div>
          `}
          <div class="agent-status">
            <span class="status-dot status-${a.status}"></span>
            <span>${statusLabel}</span>
          </div>
        </div>
        <div class="header-buttons">
          ${this.activeTab === 'computer' ? html`
            <button class="expand-btn" @click=${this.toggleExpand} title=${this.expanded ? 'Exit fullscreen' : 'Fullscreen'}>
              ${this.expanded ? iconMinimize() : iconMaximize()}
            </button>
          ` : ''}
          <button class="close-btn" @click=${this.handleClose} aria-label="Close agent profile">
            ${iconX()}
          </button>
        </div>
      </div>

      <div class="actions-row">
        <button class="action-btn" @click=${this.handleToggle}>
          ${isStopped ? iconPlay() : iconPause()}
          <span>${isStopped ? 'Start' : 'Stop'}</span>
        </button>
        <button class="action-btn danger" @click=${this.handleDelete}>
          ${iconTrash()}
          <span>Delete</span>
        </button>
      </div>

      <div class="tab-bar">
        <button class="tab ${this.activeTab === 'profile' ? 'active' : ''}" @click=${() => this.handleTabSwitch('profile')}>Profile</button>
        <button class="tab ${this.activeTab === 'todos' ? 'active' : ''}" @click=${() => this.handleTabSwitch('todos')}>Todos</button>
        <button class="tab ${this.activeTab === 'skills' ? 'active' : ''}" @click=${() => this.handleTabSwitch('skills')}>Skills</button>
        <button class="tab ${this.activeTab === 'logs' ? 'active' : ''}" @click=${() => this.handleTabSwitch('logs')}>Logs</button>
        <button class="tab ${this.activeTab === 'computer' ? 'active' : ''}" @click=${() => this.handleTabSwitch('computer')}>Computer</button>
      </div>

      <div class="tab-content">
        ${this.renderTabContent()}
      </div>
    `
    const modal = html`
      <div class=${modalClass} style=${modalStyle} data-testid="agent-profile-modal">
        ${modalContent}
      </div>
    `

    return html`
      <div class="backdrop" @click=${this.handleBackdropClick}>
        ${inspectorResizable ? html`
          <div class="sheet-shell">
            <button
              class="inspector-resizer ${this.inspectorResizeActive ? 'active' : ''}"
              type="button"
              role="separator"
              aria-label="Resize inspector"
              aria-orientation="vertical"
              aria-valuemin=${String(INSPECTOR_MIN_WIDTH_PX)}
              aria-valuemax=${String(inspectorWidthMax)}
              aria-valuenow=${String(inspectorWidth)}
              data-testid="agent-profile-resizer"
              @pointerdown=${this.handleInspectorResizePointerDown}
              @keydown=${this.handleInspectorResizeKeydown}
            ></button>
            ${modal}
          </div>
        ` : modal}
      </div>
    `
  }
}
