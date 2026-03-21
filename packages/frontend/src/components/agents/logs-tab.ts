import { LitElement, html, nothing } from 'lit'
import { customElement, property, state, query as queryEl } from 'lit/decorators.js'
import type { AgentLogEntry } from '@dune/shared'
import { profilePanelStyles } from './profile-panel.css.js'
import './log-viewer.js'

const LOG_WRAP_MODE_STORAGE_KEY = 'dune.ui.agentLogs.wrapMode'

@customElement('agent-logs-tab')
export class AgentLogsTab extends LitElement {
  @property({ type: String }) agentId = ''
  @property({ type: Array }) logs: AgentLogEntry[] = []
  @property({ type: Boolean }) logsLoading = false
  @property({ type: Boolean }) logsLoadingOlder = false
  @property({ type: Boolean }) logsHasMore = false

  @state() private logsAutoFollow = true
  @state() private logsWrapMode: 'nowrap' | 'wrap' = 'nowrap'
  @queryEl('.logs-scroll') private scrollEl?: HTMLElement

  private pendingLogsPrependAnchor: { scrollTop: number; scrollHeight: number; firstEntryId: string | null } | null = null

  static styles = profilePanelStyles

  override connectedCallback() {
    super.connectedCallback()
    this.logsWrapMode = this.readLogsWrapMode()
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has('agentId')) {
      this.logsAutoFollow = true
    }

    if (changed.has('logsLoadingOlder') && !this.logsLoadingOlder && !changed.has('logs')) {
      this.pendingLogsPrependAnchor = null
    }

    if (changed.has('logs') || changed.has('agentId')) {
      this.updateComplete.then(() => {
        const container = this.scrollEl
        if (!container) return

        if (changed.has('agentId')) {
          container.scrollTop = container.scrollHeight
          this.logsAutoFollow = true
          return
        }

        if (changed.has('logs') && this.pendingLogsPrependAnchor) {
          const firstEntryId = this.logs[0]?.id ?? null
          const didPrepend = firstEntryId !== this.pendingLogsPrependAnchor.firstEntryId
          if (didPrepend) {
            const delta = container.scrollHeight - this.pendingLogsPrependAnchor.scrollHeight
            container.scrollTop = this.pendingLogsPrependAnchor.scrollTop + Math.max(0, delta)
            this.pendingLogsPrependAnchor = null
            this.handleScroll()
            return
          }
        }

        if (this.logsAutoFollow) {
          container.scrollTop = container.scrollHeight
        }
      })
    }
  }

  private readLogsWrapMode(): 'nowrap' | 'wrap' {
    if (typeof window === 'undefined') return 'nowrap'
    try {
      const value = window.localStorage.getItem(LOG_WRAP_MODE_STORAGE_KEY)
      return value === 'wrap' ? 'wrap' : 'nowrap'
    } catch {
      return 'nowrap'
    }
  }

  private writeLogsWrapMode(mode: 'nowrap' | 'wrap') {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(LOG_WRAP_MODE_STORAGE_KEY, mode)
    } catch {
      // Ignore storage failures.
    }
  }

  private setLogsWrapMode(mode: 'nowrap' | 'wrap') {
    if (this.logsWrapMode === mode) return
    this.logsWrapMode = mode
    this.writeLogsWrapMode(mode)
  }

  private handleScroll() {
    const container = this.scrollEl
    if (!container) return
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    this.logsAutoFollow = distanceToBottom <= 48
  }

  private handleLoadOlderLogs() {
    if (this.logsLoadingOlder || !this.logsHasMore) return
    const container = this.scrollEl
    if (container) {
      this.pendingLogsPrependAnchor = {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
        firstEntryId: this.logs[0]?.id ?? null,
      }
    }
    this.dispatchEvent(new CustomEvent('load-agent-logs-older', {
      detail: this.agentId,
      bubbles: true,
      composed: true,
    }))
  }

  private handleJumpToLatest() {
    const container = this.scrollEl
    if (!container) return
    container.scrollTop = container.scrollHeight
    this.logsAutoFollow = true
  }

  render() {
    if (this.logsLoading && this.logs.length === 0) {
      return html`<div class="section-card"><p class="empty">Loading logs...</p></div>`
    }

    return html`
      <div class="section-card logs-actions">
        <div class="logs-actions-left">
          <button class="action-btn" @click=${this.handleLoadOlderLogs} ?disabled=${!this.logsHasMore || this.logsLoadingOlder}>
            ${this.logsLoadingOlder ? 'Loading older logs...' : this.logsHasMore ? 'Load older logs' : 'All logs loaded'}
          </button>
          <div class="logs-wrap-toggle" role="group" aria-label="Log wrapping mode">
            <button
              class="logs-wrap-btn ${this.logsWrapMode === 'nowrap' ? 'active' : ''}"
              @click=${() => this.setLogsWrapMode('nowrap')}
            >No-wrap</button>
            <button
              class="logs-wrap-btn ${this.logsWrapMode === 'wrap' ? 'active' : ''}"
              @click=${() => this.setLogsWrapMode('wrap')}
            >Wrap</button>
          </div>
        </div>
        <span class="logs-meta">${this.logs.length} entries</span>
      </div>
      <div class="logs-scroll" @scroll=${this.handleScroll} style="flex:1;overflow-y:auto;min-height:0;">
        <agent-log-viewer .entries=${this.logs} .wrapLines=${this.logsWrapMode === 'wrap'}></agent-log-viewer>
        ${!this.logsAutoFollow && this.logs.length > 0 ? html`
          <div class="jump-latest-wrap">
            <button class="jump-latest-btn" @click=${this.handleJumpToLatest}>
              Jump to latest
            </button>
          </div>
        ` : nothing}
      </div>
    `
  }
}
