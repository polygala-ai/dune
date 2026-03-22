import { LitElement, html, nothing } from 'lit'
import { customElement, property, state as litState, query } from 'lit/decorators.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { nanoid } from 'nanoid'
import type { Agent, AgentLogEntry, SelectedModelProvider } from '@dune/shared'
import * as api from '../../services/rpc.js'
import { highlightCodeBlocks } from '../../utils/shiki-highlighter.js'
import { renderMathBlocks } from '../../utils/katex-renderer.js'
import { renderMermaidBlocks } from '../../utils/mermaid-renderer.js'
import { uiPreferences } from '../../state/ui-preferences.js'
import '../messages/codex-composer.js'
import type {
  CodexComposer,
  CodexComposerAddAction,
  CodexComposerAddActionDetail,
  CodexComposerKeydownDetail,
} from '../messages/codex-composer.js'
import './mounts-panel.js'
import './memory-editor.js'
import './host-settings.js'
import './stash-strip.js'
import { chatViewStyles } from './chat-view.css.js'
import type { AgentMemoryEditor, MemoryEditorSnapshot } from './memory-editor.js'
import type { StashItem } from './stash-strip.js'

const STATUS_LABELS: Record<string, string> = {
  idle: 'Online',
  starting: 'Starting...',
  thinking: 'Thinking...',
  responding: 'Responding...',
  error: 'Error',
  stopping: 'Saving memories...',
  stopped: 'Offline',
}

const STATUS_COLORS: Record<string, string> = {
  idle: 'var(--success)',
  starting: 'var(--accent)',
  thinking: 'var(--warning)',
  responding: 'var(--warning)',
  error: 'var(--error)',
  stopping: 'var(--accent)',
  stopped: 'var(--text-muted)',
}

const AGENT_COMPOSER_ADD_ACTIONS: CodexComposerAddAction[] = [
  { id: 'mount-local-dir', label: 'Mount local dir' },
]

type SendDmRequest = (
  agentId: string,
  content: string,
  options?: { clientRequestId?: string; optimisticStatus?: boolean },
) => Promise<void>

const newClientRequestId = () => nanoid(12)

type AgentViewSnapshot = {
  memoryOpen: boolean
  memorySnapshot: MemoryEditorSnapshot | null
  stashItems: StashItem[]
}
const agentViewById = new Map<string, AgentViewSnapshot>()

@customElement('agent-chat-view')
export class AgentChatView extends LitElement {
  @property({ type: Object }) agent!: Agent
  @property({ type: Array }) entries: AgentLogEntry[] = []
  @property({ attribute: false }) selectedModelProvider: SelectedModelProvider | null = null
  @property({ attribute: false }) sendDmRequest: SendDmRequest | null = null
  @property({ type: Boolean, reflect: true }) paneIntegrated = false
  @litState() private expandedIds = new Set<string>()
  @litState() private sending = false
  @litState() private showModelSelectionPrompt = false
  @litState() private memoryOpen = false
  @litState() private mountPopoverOpen = false
  @litState() private hostSettingsOpen = false
  @litState() private stashItems: StashItem[] = []

  @query('.conversation') private scrollContainer!: HTMLElement
  @query('codex-composer') private composerEl!: CodexComposer
  @query('agent-memory-editor') private memoryEditorEl!: AgentMemoryEditor
  private userScrolledUp = false
  private previousAgentId: string | null = null

  static styles = chatViewStyles

  private createDefaultViewSnapshot(): AgentViewSnapshot {
    return {
      memoryOpen: false,
      memorySnapshot: null,
      stashItems: [],
    }
  }

  private captureViewSnapshot(): AgentViewSnapshot {
    return {
      memoryOpen: this.memoryOpen,
      memorySnapshot: this.memoryEditorEl?.captureSnapshot() ?? null,
      stashItems: this.stashItems.map((item) => ({ ...item })),
    }
  }

  private applyViewSnapshot(snapshot: AgentViewSnapshot) {
    this.memoryOpen = snapshot.memoryOpen
    this.stashItems = snapshot.stashItems.map((item) => ({ ...item }))
    // Memory editor snapshot is applied after render when the element exists
    if (snapshot.memorySnapshot && this.memoryOpen) {
      requestAnimationFrame(() => {
        if (this.memoryEditorEl && snapshot.memorySnapshot) {
          this.memoryEditorEl.applySnapshot(snapshot.memorySnapshot)
        }
      })
    }
  }

  private persistAgentView(agentId: string) {
    agentViewById.set(agentId, this.captureViewSnapshot())
  }

  private restoreAgentView(agentId: string) {
    const existing = agentViewById.get(agentId)
    if (existing) {
      this.applyViewSnapshot(existing)
      return
    }
    this.applyViewSnapshot(this.createDefaultViewSnapshot())
    // Apply default memory pane width from preferences
    requestAnimationFrame(() => {
      if (this.memoryEditorEl) {
        this.memoryEditorEl.applyDefaultSnapshot()
      }
    })
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('pointerdown', this.handleWindowPointerDown, { capture: true })
  }

  protected override updated(): void {
    if (this.shadowRoot) {
      highlightCodeBlocks(this.shadowRoot)
      renderMathBlocks(this.shadowRoot)
      renderMermaidBlocks(this.shadowRoot)
    }
  }

  disconnectedCallback() {
    if (this.memoryEditorEl) this.memoryEditorEl.finishResize()
    window.removeEventListener('pointerdown', this.handleWindowPointerDown, { capture: true })
    super.disconnectedCallback()
  }

  private readonly handleWindowPointerDown = (event: PointerEvent) => {
    if (!this.mountPopoverOpen) return
    const mountPopover = this.shadowRoot?.querySelector('.mount-popover')
    if (!mountPopover) {
      this.mountPopoverOpen = false
      return
    }
    const path = event.composedPath()
    if (!path.includes(mountPopover as EventTarget)) this.mountPopoverOpen = false
  }

  protected willUpdate(changed: Map<string, unknown>) {
    super.willUpdate(changed)
    if (!changed.has('agent')) return

    const previousAgent = changed.get('agent') as Agent | undefined

    if (this.memoryEditorEl && (
      previousAgent?.id !== this.agent?.id
      || previousAgent?.hostOperatorApprovalMode !== this.agent?.hostOperatorApprovalMode
      || JSON.stringify(previousAgent?.hostOperatorApps || []) !== JSON.stringify(this.agent?.hostOperatorApps || [])
      || JSON.stringify(previousAgent?.hostOperatorPaths || []) !== JSON.stringify(this.agent?.hostOperatorPaths || [])
    )) {
      this.hostSettingsOpen = false
    }

    const nextAgentId = this.agent?.id || null
    const previousAgentId = previousAgent?.id || this.previousAgentId
    this.mountPopoverOpen = false

    if (previousAgentId === nextAgentId) {
      this.previousAgentId = nextAgentId
      return
    }

    if (previousAgentId) this.persistAgentView(previousAgentId)

    if (nextAgentId) {
      this.restoreAgentView(nextAgentId)
      if (this.memoryOpen) {
        requestAnimationFrame(() => {
          if (this.memoryEditorEl) this.memoryEditorEl.refreshIfStale(nextAgentId)
        })
      }
    }
    else this.applyViewSnapshot(this.createDefaultViewSnapshot())

    this.previousAgentId = nextAgentId
  }

  private toggleExpand(id: string) {
    const next = new Set(this.expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    this.expandedIds = next
  }

  private handleScroll() {
    if (!this.scrollContainer) return
    const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer
    this.userScrolledUp = scrollHeight - scrollTop - clientHeight > 50
  }

  updated(changed: Map<string, unknown>) {
    super.updated(changed)
    if (changed.has('entries') && !this.userScrolledUp && this.scrollContainer) {
      requestAnimationFrame(() => {
        if (this.scrollContainer) {
          this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight
        }
      })
    }
    if (changed.has('selectedModelProvider') && this.selectedModelProvider) {
      this.showModelSelectionPrompt = false
    }
    if (changed.has('entries')) {
      this.syncStashItemsWithDeliveredMessages()
    }
    if (changed.has('agent')) {
      this.maybeAutoFlushStash(changed.get('agent') as Agent | undefined)
    }
  }

  // ── Stash logic ──

  private syncStashItemsWithDeliveredMessages() {
    if (this.stashItems.length === 0) return
    const deliveredIds = new Set<string>()
    for (const entry of this.entries) {
      if (entry.type !== 'user_message') continue
      const clientRequestId = (entry.data as Record<string, unknown>).clientRequestId
      if (typeof clientRequestId === 'string' && clientRequestId.trim()) {
        deliveredIds.add(clientRequestId.trim())
      }
    }
    if (deliveredIds.size === 0) return

    const nextItems = this.stashItems.filter((item) => !deliveredIds.has(item.clientRequestId))
    if (nextItems.length !== this.stashItems.length) {
      this.stashItems = nextItems
      if (this.agent?.id) this.persistAgentView(this.agent.id)
    }
  }

  private maybeAutoFlushStash(previousAgent?: Agent) {
    if (!this.agent || !this.sendDmRequest || this.agent.status !== 'idle') return
    const statusChangedToIdle = previousAgent?.status !== 'idle'
    const switchedAgents = previousAgent?.id !== this.agent.id
    if (!statusChangedToIdle && !switchedAgents) return
    if (this.stashItems.some((item) => item.state === 'queued')) return
    const nextItem = this.stashItems[0]
    if (!nextItem || nextItem.state !== 'stashed') return
    void this.sendStashItem(nextItem.clientRequestId)
  }

  private createStashItem(content: string): StashItem {
    return {
      clientRequestId: newClientRequestId(),
      content,
      state: 'stashed',
      createdAt: Date.now(),
      queuedAt: null,
      errorMessage: null,
    }
  }

  private addStashItem(content: string) {
    this.stashItems = [...this.stashItems, this.createStashItem(content)]
    if (this.agent?.id) this.persistAgentView(this.agent.id)
  }

  private updateStashItem(
    agentId: string,
    clientRequestId: string,
    buildNext: (item: StashItem) => StashItem,
  ): StashItem | null {
    const isCurrentAgent = this.agent?.id === agentId
    const snapshot = agentViewById.get(agentId)
    const baseItems = isCurrentAgent ? this.stashItems : (snapshot?.stashItems || [])
    let nextItem: StashItem | null = null
    const nextItems = baseItems.map((item) => {
      if (item.clientRequestId !== clientRequestId) return item
      nextItem = buildNext(item)
      return nextItem
    })
    if (!nextItem) return null

    if (isCurrentAgent) {
      this.stashItems = nextItems
      this.persistAgentView(agentId)
      return nextItem
    }
    if (snapshot) {
      agentViewById.set(agentId, {
        ...snapshot,
        stashItems: nextItems.map((item) => ({ ...item })),
      })
    }
    return nextItem
  }

  private async sendStashItem(clientRequestId: string): Promise<void> {
    const agentId = this.agent.id
    const item = this.stashItems.find((candidate) => candidate.clientRequestId === clientRequestId)
    if (!item || !this.sendDmRequest) return

    const optimisticStatus = this.agent.status === 'idle'
    const queuedItem = this.updateStashItem(agentId, clientRequestId, (current) => ({
      ...current,
      state: 'queued',
      queuedAt: Date.now(),
      errorMessage: null,
    }))
    if (!queuedItem) return

    try {
      await this.sendDmRequest(agentId, queuedItem.content, {
        clientRequestId: queuedItem.clientRequestId,
        optimisticStatus,
      })
    } catch (err) {
      const errorMessage = err instanceof Error && err.message.trim()
        ? err.message.trim()
        : 'Failed to send'
      const targetItems = this.agent?.id === agentId
        ? this.stashItems
        : (agentViewById.get(agentId)?.stashItems || [])
      const updated = targetItems.find((candidate) => candidate.clientRequestId === clientRequestId)
      if (!updated) return
      this.updateStashItem(agentId, clientRequestId, (current) => ({
        ...current,
        state: 'error',
        queuedAt: null,
        errorMessage,
      }))
    }
  }

  private handleStashSendNow(e: CustomEvent<{ clientRequestId: string }>) {
    void this.sendStashItem(e.detail.clientRequestId)
  }

  // ── Event handlers ──

  private renderMarkdown(text: string) {
    const raw = marked.parse(text, { async: false }) as string
    let sanitized = DOMPurify.sanitize(raw, {
      ADD_TAGS: ['button', 'img'],
      ADD_ATTR: ['data-app-slug', 'src', 'alt', 'width', 'height', 'loading'],
    })
    // Replace [app:slug] with clickable buttons
    sanitized = sanitized.replace(
      /\[app:([a-z0-9_-]+)\]/gi,
      '<button class="chat-app-btn" data-app-slug="$1">\u25B6 $1</button>',
    )
    return unsafeHTML(sanitized)
  }

  private handleToggleAgent() {
    this.dispatchEvent(new CustomEvent('toggle-agent', {
      detail: this.agent.id,
      bubbles: true, composed: true,
    }))
  }

  private handleCancelStart() {
    this.dispatchEvent(new CustomEvent('cancel-start', {
      detail: this.agent.id,
      bubbles: true, composed: true,
    }))
  }

  private handleOpenProfile() {
    this.dispatchEvent(new CustomEvent('open-agent-profile', {
      detail: this.agent.id,
      bubbles: true, composed: true,
    }))
  }

  private handleConversationClick(e: Event) {
    const target = e.target as HTMLElement
    if (!target.classList?.contains('chat-app-btn')) return
    const slug = target.dataset.appSlug
    if (!slug) return
    this.dispatchEvent(new CustomEvent('open-miniapp', {
      detail: { slug, agentId: this.agent.id },
      bubbles: true,
      composed: true,
    }))
  }

  private handleComposerKeydown(e: CustomEvent<CodexComposerKeydownDetail>) {
    const keyboardEvent = e.detail.event
    if (keyboardEvent.key === 'Escape' && this.mountPopoverOpen) {
      keyboardEvent.preventDefault()
      this.mountPopoverOpen = false
      return
    }
    const wantsSend = keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey
    if (wantsSend) {
      keyboardEvent.preventDefault()
      if (this.isWorkflowRunning) {
        this.handleComposerInterrupt()
        return
      }
      this.handleSend()
    }
  }

  private get isWorkflowRunning() {
    return this.agent.status === 'thinking' || this.agent.status === 'responding'
  }

  private handleComposerInterrupt() {
    if (!this.isWorkflowRunning) return
    this.dispatchEvent(new CustomEvent('interrupt-agent', {
      detail: this.agent.id,
      bubbles: true,
      composed: true,
    }))
  }

  private handleComposerAddAction(e: CustomEvent<CodexComposerAddActionDetail>) {
    if (e.detail.id === 'mount-local-dir') {
      this.mountPopoverOpen = true
    }
  }

  private handleMountPopoverKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    this.mountPopoverOpen = false
  }

  private async handleOpenMemory() {
    this.memoryOpen = true
    await this.updateComplete
    if (this.memoryEditorEl) {
      void this.memoryEditorEl.open()
    }
  }

  private handleMemoryClose() {
    this.memoryOpen = false
  }

  private async handleOpenHostSettings() {
    this.hostSettingsOpen = true
    await this.updateComplete
    const hostPanel = this.shadowRoot?.querySelector<any>('agent-host-settings-panel')
    if (hostPanel) void hostPanel.openPanel()
  }

  private handleHostSettingsClose() {
    this.hostSettingsOpen = false
  }

  private async handleSend() {
    const content = this.composerEl?.value?.trim()
    if (!content || this.sending) return
    if (!this.selectedModelProvider) {
      this.showModelSelectionPrompt = true
      this.composerEl.focusInput()
      return
    }
    this.mountPopoverOpen = false
    this.sending = true
    this.composerEl.value = ''
    this.composerEl.focusInput()
    try {
      if (this.agent.status === 'thinking' || this.agent.status === 'responding') {
        this.addStashItem(content)
        return
      }
      if (!this.sendDmRequest) return
      const clientRequestId = newClientRequestId()
      void this.sendDmRequest(this.agent.id, content, {
        clientRequestId,
        optimisticStatus: true,
      }).catch((err) => {
        console.error('Failed to send DM:', err)
      })
    } finally {
      this.sending = false
    }
  }

  private handleOpenModelSettings() {
    this.dispatchEvent(new CustomEvent<{ section: 'model' }>('open-settings', {
      detail: { section: 'model' },
      bubbles: true,
      composed: true,
    }))
  }

  // ── Render ──

  private renderEntry(entry: AgentLogEntry, isLast = false) {
    const d = entry.data as Record<string, any>
    const isOpen = this.expandedIds.has(entry.id)

    switch (entry.type) {
      case 'thinking':
        // Only show if this is the last entry AND agent is actively thinking/responding
        if (!isLast) return nothing
        if (this.agent.status !== 'thinking' && this.agent.status !== 'responding') return nothing
        return html`
          <div class="entry-thinking">
            <div class="entry-avatar" style="background: ${this.agent.avatarColor}">${this.agent.name.charAt(0).toUpperCase()}</div>
            <div class="thinking-dots">
              <span></span><span></span><span></span>
            </div>
          </div>
        `

      case 'system':
        return html`
          <div class="entry-system">
            <div class="system-pill" title=${d.message || ''}>${d.message || ''}</div>
          </div>
        `

      case 'text':
        return html`
          <div class="entry-text">
            <div class="entry-avatar" style="background: ${this.agent.avatarColor}">${this.agent.name.charAt(0).toUpperCase()}</div>
            <div class="entry-text-body">
              <div class="entry-text-name">${this.agent.name}</div>
              <div class="entry-text-content">${this.renderMarkdown(d.text || '')}</div>
            </div>
          </div>
        `

      case 'tool_use':
        return html`
          <div class="entry-tool">
            <div class="tool-card tool-use">
              <div class="tool-header" @click=${() => this.toggleExpand(entry.id)}>
                <span class="tool-chevron ${isOpen ? 'open' : ''}">▶</span>
                <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14.5 6.5a4.3 4.3 0 1 0 3 3l-3.3 3.3a1 1 0 0 1-1.4 0l-1.4-1.4a1 1 0 0 1 0-1.4l3.3-3.3a4.3 4.3 0 0 0-.2-.2Z" stroke-linecap="round" stroke-linejoin="round"></path>
                  <path d="M5 19l4-4" stroke-linecap="round"></path>
                </svg>
                <span class="tool-label">${d.toolName || 'unknown'}</span>
                <span class="tool-label-type" style="background: var(--warning)">Tool Call</span>
              </div>
              <div class="tool-body ${isOpen ? 'open' : ''}">
                <div class="tool-code">${JSON.stringify(d.input, null, 2)}</div>
              </div>
            </div>
          </div>
        `

      case 'tool_result':
        return html`
          <div class="entry-tool">
            <div class="tool-card ${d.isError ? 'tool-error' : 'tool-result'}">
              <div class="tool-header" @click=${() => this.toggleExpand(entry.id)}>
                <span class="tool-chevron ${isOpen ? 'open' : ''}">▶</span>
                ${d.isError
                  ? html`
                    <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="8"></circle>
                      <path d="M9.5 9.5l5 5m0-5-5 5" stroke-linecap="round"></path>
                    </svg>
                  `
                  : html`
                    <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 4h6l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke-linejoin="round"></path>
                      <path d="M14 4v4h4" stroke-linejoin="round"></path>
                    </svg>
                  `}
                <span class="tool-label">${d.isError ? 'Error Result' : 'Result'}</span>
                <span class="tool-label-type" style="background: ${d.isError ? 'var(--error)' : 'var(--accent)'}">${d.isError ? 'Error' : 'Output'}</span>
              </div>
              <div class="tool-body ${isOpen ? 'open' : ''}">
                <div class="tool-code ${d.isError ? 'error' : ''}">${d.content || ''}</div>
              </div>
            </div>
          </div>
        `

      case 'result':
        return html`
          <div class="entry-result">
            <div class="result-bar">
              ${d.durationMs != null ? html`
                <div class="result-stat">
                  <span class="result-label">Duration</span>
                  <span class="result-value">${(d.durationMs / 1000).toFixed(1)}s</span>
                </div>
              ` : nothing}
              ${d.numTurns != null ? html`
                <div class="result-stat">
                  <span class="result-label">Turns</span>
                  <span class="result-value">${d.numTurns}</span>
                </div>
              ` : nothing}
              ${d.totalCostUsd != null ? html`
                <div class="result-stat">
                  <span class="result-label">Cost</span>
                  <span class="result-value">$${d.totalCostUsd.toFixed(4)}</span>
                </div>
              ` : nothing}
            </div>
          </div>
        `

      case 'user_message': {
        const time = new Date(entry.timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        return html`
          <div class="entry-user">
            <div class="user-avatar">Y</div>
            <div class="entry-user-body">
              <div class="entry-user-header">
                <span class="entry-user-name">You</span>
                <span class="entry-user-time">${time}</span>
              </div>
              <div class="entry-user-content">${d.content || ''}</div>
            </div>
          </div>
        `
      }

      case 'mailbox_notice': {
        const unreadCount = Number(d.unreadCount || 0)
        const label = unreadCount === 1 ? 'message' : 'messages'
        return html`
          <div class="entry-mailbox">
            <div class="mailbox-card">
              <div class="mailbox-copy">
                <div class="mailbox-title">Mailbox notice</div>
                <div class="mailbox-meta">Fetch unread mail from the proxy, then acknowledge the batch when finished.</div>
              </div>
              <div class="mailbox-count">${unreadCount} unread ${label}</div>
            </div>
          </div>
        `
      }

      case 'channel_input': {
        const channels = (d.channels || []) as Array<{ name: string; messages: Array<{ author: string; content: string }> }>
        return html`
          ${channels.map(ch => {
            const cardId = `${entry.id}-${ch.name}`
            const cardOpen = this.expandedIds.has(cardId) || ch.messages.length <= 3
            return html`
              <div class="entry-channel-input">
                <div class="channel-card">
                  <div class="channel-card-header" @click=${() => this.toggleExpand(cardId)}>
                    <span class="tool-chevron ${cardOpen ? 'open' : ''}">▶</span>
                    <span class="channel-card-icon">#</span>
                    <span class="channel-card-name">${ch.name}</span>
                    <span class="channel-card-count">${ch.messages.length} message${ch.messages.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div class="channel-card-body ${cardOpen ? 'open' : ''}">
                    ${ch.messages.map(msg => html`
                      <div class="channel-msg">
                        <span class="channel-msg-author">${msg.author}:</span>
                        <span class="channel-msg-content"> ${msg.content}</span>
                      </div>
                    `)}
                  </div>
                </div>
              </div>
            `
          })}
        `
      }

      case 'error':
        return html`
          <div class="entry-error">
            <div class="error-pill">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 8v5m0 3h.01M10.3 4.9 3.7 16.4a2 2 0 0 0 1.7 3h13.2a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0Z" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
              <span>${d.message || 'Unknown error'}</span>
            </div>
          </div>
        `

      default:
        return html`
          <div class="entry-unknown">
            <div class="unknown-code">${JSON.stringify(d, null, 2)}</div>
          </div>
        `
    }
  }

  render() {
    if (!this.agent) return nothing

    const initial = this.agent.name.charAt(0).toUpperCase()
    const statusColor = STATUS_COLORS[this.agent.status] || 'var(--text-muted)'
    const statusLabel = STATUS_LABELS[this.agent.status] || this.agent.status
    const isStopped = this.agent.status === 'stopped'
    const isStarting = this.agent.status === 'starting'
    const isStopping = this.agent.status === 'stopping'
    const isWorkflowRunning = this.isWorkflowRunning
    const isAnimated = this.agent.status === 'thinking' || this.agent.status === 'responding' || isStarting
    const inputDisabled = isStopped || isStarting || isStopping || this.sending

    return html`
      ${this.paneIntegrated ? nothing : html`
        <div class="header" data-testid="agent-profile-header">
          <div class="header-main">
            <div
              class="header-avatar"
              style="background: ${this.agent.avatarColor}"
              @click=${this.handleOpenProfile}
              title="View profile"
              data-testid="agent-profile-trigger-avatar"
            >
              ${initial}
            </div>
            <div class="header-info">
              <div class="header-kicker">Agent Workspace</div>
              <div
                class="header-name profile-trigger"
                @click=${this.handleOpenProfile}
                title="View profile"
                data-testid="agent-profile-trigger-name"
              >
                ${this.agent.name}
              </div>
              <div class="header-status">
                <span class="status-dot ${isAnimated ? 'thinking' : ''}" style="background: ${statusColor}"></span>
                ${statusLabel}
              </div>
            </div>
          </div>
        </div>
      `}

      <div class="conversation" @scroll=${this.handleScroll} @click=${this.handleConversationClick}>
        <div class="conversation-lane">
          ${this.entries.length === 0
            ? html`
              <div class="empty-state">
                <div class="empty-avatar" style="background: ${this.agent.avatarColor}">${initial}</div>
                <div class="empty-title">${this.agent.name}</div>
                <div class="empty-subtitle">
                  ${isStopped
                    ? 'This agent is offline. Start it to begin a conversation.'
                    : isStarting
                      ? 'Agent is starting up...'
                      : 'No activity yet. Send a message or wait for channel activity.'}
                </div>
              </div>
            `
            : this.entries.map((e, i) => this.renderEntry(e, i === this.entries.length - 1))
          }
        </div>
      </div>

      <div class="input-area" data-testid="composer-dock">
        ${this.showModelSelectionPrompt
          ? html`
              <div class="input-guard" role="status" aria-live="polite">
                <div class="input-guard-copy">Set a model in Settings &gt; Model first.</div>
                <button class="input-guard-btn" type="button" @click=${this.handleOpenModelSettings}>
                  Open Settings
                </button>
              </div>
            `
          : nothing}
        <agent-stash-strip
          .items=${this.stashItems}
          .canSend=${!!this.sendDmRequest}
          @stash-send-now=${this.handleStashSendNow}
        ></agent-stash-strip>
        <div class="composer-shell">
          ${this.mountPopoverOpen ? html`
            <div class="mount-popover" @keydown=${this.handleMountPopoverKeydown}>
              <agent-mounts-panel
                .agentId=${this.agent.id}
                .agentRunning=${this.agent.status !== 'stopped'}
              ></agent-mounts-panel>
            </div>
          ` : nothing}
          ${this.hostSettingsOpen ? html`
            <agent-host-settings-panel
              .agent=${this.agent}
              @agent-updated=${(e: CustomEvent) => {
                this.dispatchEvent(new CustomEvent('agent-updated', {
                  detail: e.detail,
                  bubbles: true,
                  composed: true,
                }))
              }}
              @host-settings-close=${this.handleHostSettingsClose}
            ></agent-host-settings-panel>
          ` : nothing}
          <codex-composer
            .placeholder=${isStarting ? 'Agent is starting...' : `Message ${this.agent.name}...`}
            ?disabled=${inputDisabled}
            .sending=${this.sending}
            .submitMode=${isWorkflowRunning ? 'interrupt' : 'send'}
            .addActions=${AGENT_COMPOSER_ADD_ACTIONS}
            @composer-keydown=${this.handleComposerKeydown}
            @composer-add-action=${this.handleComposerAddAction}
            @composer-send=${this.handleSend}
            @composer-interrupt=${this.handleComposerInterrupt}
          >
            ${isStopped
              ? html`<button slot="footer-controls" class="composer-aux-btn success" type="button" @click=${this.handleToggleAgent}>Start</button>`
              : isStarting
                ? html`<button slot="footer-controls" class="composer-aux-btn danger" type="button" @click=${this.handleCancelStart}>Cancel</button>`
                : isWorkflowRunning || isStopping
                  ? nothing
                  : html`<button slot="footer-controls" class="composer-aux-btn danger" type="button" @click=${this.handleToggleAgent}>Stop</button>`
            }
            <button slot="footer-controls" class="composer-aux-btn" type="button" @click=${this.handleOpenMemory} title="View agent memory">
              Memory
            </button>
            <button slot="footer-controls" class="composer-aux-btn" type="button" @click=${this.handleOpenHostSettings} title="Configure host operator access">
              Host
            </button>
          </codex-composer>
        </div>
      </div>

      ${this.memoryOpen ? html`
        <agent-memory-editor
          .agentId=${this.agent.id}
          .agent=${this.agent}
          @memory-close=${this.handleMemoryClose}
          @memory-state-changed=${() => { if (this.agent?.id) this.persistAgentView(this.agent.id) }}
        ></agent-memory-editor>
      ` : nothing}
    `
  }
}
