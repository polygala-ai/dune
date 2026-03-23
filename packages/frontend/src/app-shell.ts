import { LitElement, html } from 'lit'
import { customElement, query as queryEl, state as litState } from 'lit/decorators.js'
import { state } from './state/app-state.js'
import { uiPreferences, type ThemeMode } from './state/ui-preferences.js'
import { desktopShell, type WindowControlAction } from './state/desktop-shell.js'
import * as api from './services/rpc.js'
import { WsClient } from './services/rpc.js'
import { initWorkspaceSync } from './services/workspace-sync.js'
import { appShellStyles } from './app-shell.css.js'
import { iconMinus, iconSquare, iconX, iconPanelLeft } from './utils/icons.js'
import type { ClaudeSettings, HostOperatorRequest, SelectedModelProvider } from '@dune/shared'
import type { CreateAgentDialog } from './components/agents/create-dialog.js'
import type { CreateChannelDialog } from './components/channels/create-dialog.js'
import type { ChannelMembersDialog } from './components/channels/members-dialog.js'
import type { ChannelDetailsPanel } from './components/channels/details-panel.js'
import './components/apps/apps-view.js'

const ADMIN_USER_ID = 'admin'
const DESKTOP_FULL_HIDE_SIDEBAR_QUERY = '(min-width: 981px)'
const DEFAULT_SIDEBAR_WIDTH_PX = 320
const SIDEBAR_MIN_WIDTH_PX = 240
const SIDEBAR_MAX_WIDTH_PX = 520
const SIDEBAR_CONTENT_MIN_WIDTH_PX = 480
const SIDEBAR_SPLITTER_TRACK_PX = 6
const SIDEBAR_RESIZE_STEP_PX = 16
const SIDEBAR_RESIZE_STEP_FAST_PX = 32
type SettingsSection = 'general' | 'model'
type SendDmRequestOptions = {
  clientRequestId?: string
  optimisticStatus?: boolean
}

@customElement('app-shell')
export class AppShell extends LitElement {
  private ws!: WsClient

  @queryEl('.workspace') private workspaceEl?: HTMLElement
  @queryEl('create-agent-dialog') agentDialog!: CreateAgentDialog
  @queryEl('create-channel-dialog') channelDialog!: CreateChannelDialog
  @queryEl('channel-members-dialog') membersDialog!: ChannelMembersDialog
  @queryEl('channel-details-panel') detailsPanel!: ChannelDetailsPanel
  @litState() private sidebarWidthPx = DEFAULT_SIDEBAR_WIDTH_PX
  @litState() private sidebarResizeActive = false
  @litState() private lightboxSrc = ''

  private subscriberCount = 0
  private detailsChannelId: string | null = null
  private activeSurface: 'chat' | 'settings' | 'sandboxes' | 'apps' = 'chat'
  private readonly appOpenErrors = new Map<string, string>()
  private dmStatusTokenSeq = 0
  private readonly dmOptimisticStatusTokens = new Map<string, number>()
  private workspaceSyncInFlight: Promise<void> | null = null
  private workspaceSyncQueued = false
  private readonly logLoadPromises = new Map<string, Promise<void>>()
  private readonly logsLoadingAgentIds = new Set<string>()
  private readonly logsLoadingOlderAgentIds = new Set<string>()
  private readonly hostCommandDecisionLoadingIds = new Set<string>()
  private hostApprovalModalOpen = false
  private hostApprovalConfirmRequestId: string | null = null
  private appVersion: string | null = null
  private selectedModelProvider: SelectedModelProvider | null = null
  private settingsInitialSection: SettingsSection = 'general'
  private sidebarResizePointerId: number | null = null
  private sidebarResizeStartX = 0
  private sidebarResizeStartWidth = DEFAULT_SIDEBAR_WIDTH_PX
  private sidebarResizeListenersBound = false
  private readonly stateChangeHandler = () => this.requestUpdate()
  private readonly uiPreferenceChangeHandler = () => {
    this.syncSidebarWidthFromPreferences()
    this.requestUpdate()
  }
  private readonly desktopShellChangeHandler = () => this.requestUpdate()
  private readonly windowResizeHandler = () => {
    if (this.sidebarResizeActive && !this.shouldRenderSidebarResizer()) {
      this.finishSidebarResize()
    }
    const nextWidth = this.clampSidebarWidth(this.sidebarWidthPx)
    if (nextWidth !== this.sidebarWidthPx) {
      this.sidebarWidthPx = nextWidth
      uiPreferences.setSidebarWidth(nextWidth)
      return
    }
    this.requestUpdate()
  }

  static styles = appShellStyles

  connectedCallback() {
    super.connectedCallback()
    desktopShell.init()
    void this.loadAppVersion()
    uiPreferences.init()
    this.sidebarWidthPx = this.clampSidebarWidth(uiPreferences.getSidebarWidth() ?? DEFAULT_SIDEBAR_WIDTH_PX)
    state.addEventListener('change', this.stateChangeHandler)
    uiPreferences.addEventListener('change', this.uiPreferenceChangeHandler)
    desktopShell.addEventListener('change', this.desktopShellChangeHandler)
    window.addEventListener('resize', this.windowResizeHandler)
    this.addEventListener('open-lightbox', ((e: CustomEvent<{ src: string }>) => {
      this.lightboxSrc = e.detail.src
    }) as EventListener)
    this.initApp()
  }

  private async initApp() {
    this.ws = initWorkspaceSync({
      onWorkspaceInvalidate: () => {
        this.queueWorkspaceSync('ws-invalidate')
      },
      onReconnect: () => {
        void this.loadPendingHostOperatorRequests()
      },
      onAgentStatus: (agentId) => {
        this.dmOptimisticStatusTokens.delete(agentId)
      },
      onHostApprovalPending: () => {
        this.hostApprovalModalOpen = true
        this.requestUpdate()
      },
      onHostApprovalUpdated: (payload) => {
        this.syncHostApprovalModalVisibilityFromPendingCount()
        if (payload.requestId === this.hostApprovalConfirmRequestId && payload.status !== 'pending') {
          this.hostApprovalConfirmRequestId = null
        }
      },
    })

    await this.syncWorkspaceData('initial-load')
    await this.loadPendingHostOperatorRequests()
  }

  private queueWorkspaceSync(trigger: string) {
    void this.syncWorkspaceData(trigger)
  }

  private async syncWorkspaceData(trigger: string): Promise<void> {
    if (this.workspaceSyncInFlight) {
      this.workspaceSyncQueued = true
      return this.workspaceSyncInFlight
    }

    this.workspaceSyncInFlight = (async () => {
      do {
        this.workspaceSyncQueued = false
        await this.runWorkspaceSync(trigger)
      } while (this.workspaceSyncQueued)
    })().finally(() => {
      this.workspaceSyncInFlight = null
    })

    return this.workspaceSyncInFlight
  }

  private async runWorkspaceSync(trigger: string): Promise<void> {
    const previousSelectedChannelId = state.selectedChannelId

    try {
      const [channels, agents, settingsSummary] = await Promise.all([
        api.listChannels(),
        api.listAgents(),
        api.getClaudeSettings().catch((err) => {
          console.error('Failed to load workspace settings:', err)
          return null
        }),
      ])
      if (settingsSummary) {
        this.selectedModelProvider = settingsSummary.selectedModelProvider
      }
      state.setChannels(channels)
      state.setAgents(agents)
      this.requestUpdate()

      if (this.detailsChannelId && !channels.some(channel => channel.id === this.detailsChannelId)) {
        this.detailsChannelId = null
        this.requestUpdate()
      }

      if (!state.selectedAgentId && !state.selectedChannelId && channels.length > 0) {
        await this.selectChannel(channels[0].id)
        return
      }

      if (state.selectedChannelId) {
        const needsReselect = state.selectedChannelId !== previousSelectedChannelId
          || !state.messages.has(state.selectedChannelId)
        if (needsReselect) {
          await this.selectChannel(state.selectedChannelId)
        }
      } else if (previousSelectedChannelId) {
        this.ws?.unsubscribeChannel(previousSelectedChannelId)
        this.subscriberCount = 0
        this.requestUpdate()
      }
    } catch (e) {
      console.error(`Failed to sync workspace data (${trigger}):`, e)
    }
  }

  private syncHostApprovalModalVisibilityFromPendingCount(): void {
    if (state.pendingHostOperatorRequests.length === 0) {
      this.hostApprovalModalOpen = false
      this.hostApprovalConfirmRequestId = null
    }
  }

  private formatHostOperatorRequest(request: HostOperatorRequest): string {
    return request.summary
  }

  private async loadPendingHostOperatorRequests(): Promise<void> {
    try {
      const response = await api.listPendingHostOperatorRequestsAdmin()
      state.setPendingHostOperatorRequests(response.requests)
      this.syncHostApprovalModalVisibilityFromPendingCount()
      if (response.requests.length === 0 && this.hostApprovalConfirmRequestId) {
        this.hostApprovalConfirmRequestId = null
      }
    } catch (err) {
      console.error('Failed to load pending host operator requests:', err)
    }
  }

  private openHostApprovalsModal() {
    this.hostApprovalModalOpen = true
    this.requestUpdate()
  }

  private closeHostApprovalsModal() {
    this.hostApprovalModalOpen = false
    this.hostApprovalConfirmRequestId = null
    this.requestUpdate()
  }

  private async decideHostOperatorRequest(request: HostOperatorRequest, decision: 'approve' | 'reject') {
    if (this.hostCommandDecisionLoadingIds.has(request.requestId)) return

    this.hostCommandDecisionLoadingIds.add(request.requestId)
    this.requestUpdate()
    try {
      await api.decideHostOperatorRequestAdmin(request.requestId, {
        decision,
      })
      this.hostApprovalConfirmRequestId = null
    } catch (err) {
      console.error(`Failed to ${decision} host operator request:`, err)
    } finally {
      this.hostCommandDecisionLoadingIds.delete(request.requestId)
      await this.loadPendingHostOperatorRequests()
      this.requestUpdate()
    }
  }

  private appErrorKey(agentId: string, slug: string): string {
    return `${agentId}:${slug}`
  }

  private async selectChannel(channelId: string) {
    if (state.selectedChannelId) {
      this.ws?.unsubscribeChannel(state.selectedChannelId)
    }
    this.activeSurface = 'chat'
    state.selectChannel(channelId)
    this.ws?.subscribeChannel(channelId)

    if (!state.messages.has(channelId)) {
      try {
        const messages = await api.getChannelMessages(channelId)
        state.setMessages(channelId, messages)
      } catch (e) {
        console.error('Failed to load messages:', e)
      }
    }

    try {
      const subs = await api.getChannelSubscribers(channelId)
      this.subscriberCount = subs.length
      this.requestUpdate()
    } catch (e) {
      this.subscriberCount = 0
    }
  }

  private async selectAgent(agentId: string) {
    this.activeSurface = 'chat'
    state.selectAgent(agentId)
    await this.ensureAgentLogsLoaded(agentId)
  }

  private async ensureAgentLogsLoaded(agentId: string): Promise<void> {
    if (state.hasAgentLogs(agentId)) return
    const existing = this.logLoadPromises.get(agentId)
    if (existing) {
      await existing
      return
    }

    this.logsLoadingAgentIds.add(agentId)
    this.requestUpdate()
    const loadPromise = (async () => {
      try {
        const page = await api.getAgentLogs(agentId)
        state.setAgentLogsPage(agentId, page.entries, page.nextBeforeSeq)
      } catch (e) {
        console.error('Failed to load agent logs:', e)
      }
    })().finally(() => {
      this.logLoadPromises.delete(agentId)
      this.logsLoadingAgentIds.delete(agentId)
      this.requestUpdate()
    })

    this.logLoadPromises.set(agentId, loadPromise)
    await loadPromise
  }

  private async loadOlderAgentLogs(agentId: string): Promise<void> {
    const beforeSeq = state.getAgentLogsNextBeforeSeq(agentId)
    if (beforeSeq == null || this.logsLoadingOlderAgentIds.has(agentId)) return

    this.logsLoadingOlderAgentIds.add(agentId)
    this.requestUpdate()
    try {
      const page = await api.getAgentLogs(agentId, { beforeSeq })
      state.prependAgentLogs(agentId, page.entries, page.nextBeforeSeq)
    } catch (e) {
      console.error('Failed to load older agent logs:', e)
    } finally {
      this.logsLoadingOlderAgentIds.delete(agentId)
      this.requestUpdate()
    }
  }

  private async handleCreateChannel(e: CustomEvent) {
    try {
      const channel = await api.createChannel(e.detail)
      state.addChannel(channel)
      this.channelDialog?.close()
      await this.selectChannel(channel.id)
      this.queueWorkspaceSync('crud-success:create-channel')
    } catch (err: any) {
      const msg = err?.message?.includes('409') ? 'A channel with that name already exists' : 'Failed to create channel'
      this.channelDialog?.showError(msg)
      this.queueWorkspaceSync('crud-error-recover:create-channel')
    }
  }

  private async handleCreateAgent(e: CustomEvent) {
    try {
      const agent = await api.createAgent(e.detail)
      state.addAgent(agent)
      state.updateAgentStatus(agent.id, 'starting')
      await api.startAgent(agent.id)
      // Backend broadcasts agent:status 'idle' via WS when truly ready
      if (state.selectedChannelId) {
        await api.subscribeAgentToChannel(state.selectedChannelId, agent.id)
      }
      this.queueWorkspaceSync('crud-success:create-agent')
    } catch (e) {
      console.error('Failed to create agent:', e)
      this.queueWorkspaceSync('crud-error-recover:create-agent')
    }
  }

  private async handleToggleAgent(e: CustomEvent) {
    const agentId = e.detail as string
    const agent = state.agents.find(a => a.id === agentId)
    if (!agent) return
    try {
      if (agent.status === 'stopped') {
        state.updateAgentStatus(agentId, 'starting')
        await api.startAgent(agentId)
        // Backend broadcasts agent:status 'idle' via WS when truly ready
      } else {
        await api.stopAgent(agentId)
        state.updateAgentStatus(agentId, 'stopped')
      }
    } catch (e) {
      console.error('Failed to toggle agent:', e)
      // Backend broadcasts error status via WS, but as a fallback ensure UI isn't stuck
      if (agent.status === 'stopped') {
        // Start failed — backend will broadcast 'error', but refresh to be safe
        this.queueWorkspaceSync('crud-error-recover:toggle-agent')
      }
    }
  }

  private async handleCancelStart(e: CustomEvent) {
    const agentId = e.detail as string
    try {
      await api.cancelAgentStart(agentId)
      // Backend broadcasts agent:status 'stopped' via WS on cancellation
    } catch (e) {
      console.error('Failed to cancel agent start:', e)
    }
  }

  private async handleInterruptAgent(e: CustomEvent) {
    const agentId = e.detail as string
    try {
      await api.interruptAgent(agentId)
    } catch (err) {
      console.error('Failed to interrupt agent workflow:', err)
    }
  }

  private handleManageMembers(e: CustomEvent) {
    const channelId = e.detail as string
    this.membersDialog?.open(channelId)
  }

  private handleMembersChanged(e: CustomEvent) {
    const { count } = e.detail
    this.subscriberCount = count
    this.requestUpdate()
  }

  private handleOpenProfile(e: CustomEvent) {
    const agentId = e.detail as string
    this.openProfile(agentId)
  }

  private handleOpenSelectedAgentProfile() {
    const agentId = this.getToolbarAgent()?.id
    if (!agentId) return
    this.openProfile(agentId)
  }

  private handleOpenSelectedChannelDetails() {
    const channelId = this.activeSurface === 'chat' ? state.currentChannel?.id : null
    if (!channelId) return
    this.detailsChannelId = channelId
    this.requestUpdate()
  }

  private openProfile(agentId: string) {
    if (agentId === 'admin' || agentId === 'system') return
    state.openProfile(agentId)
    void this.ensureAgentLogsLoaded(agentId)
  }

  private handleCloseProfile() {
    state.closeProfile()
  }

  private handleSettingsSaved(e: CustomEvent<ClaudeSettings>) {
    this.selectedModelProvider = e.detail.selectedModelProvider
    this.requestUpdate()
  }

  private handleLoadAgentLogsOlder(e: CustomEvent) {
    const agentId = e.detail as string
    void this.loadOlderAgentLogs(agentId)
  }

  private async handleLoadAgentScreen(e: CustomEvent) {
    const agentId = e.detail as string
    try {
      const screen = await api.getAgentScreen(agentId)
      state.setAgentScreen(agentId, screen)
    } catch (e) {
      console.error('Failed to load agent screen:', e)
    }
  }

  private handleAgentUpdated(e: CustomEvent) {
    state.updateAgent(e.detail)
  }

  private async handleDeleteAgent(e: CustomEvent) {
    const agentId = e.detail as string
    try {
      await api.deleteAgent(agentId)
      for (const key of this.appOpenErrors.keys()) {
        if (key.startsWith(`${agentId}:`)) this.appOpenErrors.delete(key)
      }
      state.removeAgent(agentId)
      this.queueWorkspaceSync('crud-success:delete-agent')
    } catch (e) {
      console.error('Failed to delete agent:', e)
      this.queueWorkspaceSync('crud-error-recover:delete-agent')
    }
  }

  private handleOpenChannelDetails(e: CustomEvent) {
    const channelId = e.detail as string
    this.detailsChannelId = channelId
    this.requestUpdate()
  }

  private handleCloseDetails() {
    this.detailsChannelId = null
    this.requestUpdate()
  }

  private async handleChannelUpdated(e: CustomEvent) {
    const { id, data } = e.detail
    try {
      const updated = await api.updateChannel(id, data)
      state.updateChannel(id, updated)
    } catch (err) {
      console.error('Failed to update channel:', err)
    }
  }

  private async handleChannelDeleted(e: CustomEvent) {
    const channelId = e.detail as string
    try {
      await api.deleteChannel(channelId)
      this.detailsChannelId = null
      state.removeChannel(channelId)
      // Select the new first channel if needed
      if (state.selectedChannelId && state.selectedChannelId !== channelId) {
        // Already on a different channel
      } else if (state.channels.length > 0) {
        await this.selectChannel(state.channels[0].id)
      }
      this.queueWorkspaceSync('crud-success:delete-channel')
    } catch (err) {
      console.error('Failed to delete channel:', err)
      this.queueWorkspaceSync('crud-error-recover:delete-channel')
    }
  }

  private handleChannelContextAction(e: CustomEvent) {
    const { channelId, action } = e.detail
    if (action === 'details') {
      this.detailsChannelId = channelId
      this.requestUpdate()
    } else if (action === 'delete') {
      const ch = state.channels.find(c => c.id === channelId)
      if (!ch) return
      if (!confirm(`Delete channel "#${ch.name}"? All messages will be lost.`)) return
      this.handleChannelDeleted(new CustomEvent('channel-deleted', { detail: channelId }))
    }
  }

  private async handleSendMessage(e: CustomEvent) {
    const { channelId, content } = e.detail
    try {
      await api.sendMessage(channelId, ADMIN_USER_ID, content)
    } catch (e) {
      console.error('Failed to send message:', e)
    }
  }

  private readonly sendDmRequest = async (
    agentId: string,
    content: string,
    options: SendDmRequestOptions = {},
  ): Promise<void> => {
    const previousStatus = state.agents.find(a => a.id === agentId)?.status as AgentStatusType | undefined
    const shouldOptimisticallySetThinking = options.optimisticStatus === true
    const token = shouldOptimisticallySetThinking ? ++this.dmStatusTokenSeq : null

    if (token != null) {
      this.dmOptimisticStatusTokens.set(agentId, token)
      state.updateAgentStatus(agentId, 'thinking')
    }

    try {
      await api.sendDirectMessage(agentId, content, {
        clientRequestId: options.clientRequestId,
      })
    } catch (e) {
      if (token != null && this.dmOptimisticStatusTokens.get(agentId) === token && previousStatus) {
        state.updateAgentStatus(agentId, previousStatus)
      }
      console.error('Failed to send DM:', e)
      throw e
    } finally {
      if (token != null && this.dmOptimisticStatusTokens.get(agentId) === token) {
        this.dmOptimisticStatusTokens.delete(agentId)
      }
    }
  }

  private async openMiniapp(agentId: string, slug: string) {
    const agent = state.agents.find(a => a.id === agentId)
    if (!agent) return
    this.appOpenErrors.delete(this.appErrorKey(agentId, slug))

    state.openMiniappWindow({
      agentId,
      agentName: agent.name,
      slug,
      appName: slug,
      url: '',
      loading: true,
      error: null,
    })

    try {
      const opened = await api.openAgentApp(agentId, slug)
      this.appOpenErrors.delete(this.appErrorKey(agentId, slug))
      state.openMiniappWindow({
        agentId,
        agentName: agent.name,
        slug: opened.app.slug,
        appName: opened.app.name,
        url: opened.url,
        loading: false,
        error: null,
      })
    } catch (err: any) {
      this.appOpenErrors.set(this.appErrorKey(agentId, slug), err.message || 'Failed to open miniapp')
      state.closeMiniappWindow()
      this.requestUpdate()
    }
  }

  private async handleOpenMiniapp(e: CustomEvent<{ slug: string; agentId?: string }>) {
    const agentId = e.detail.agentId || state.selectedAgentId
    if (!agentId) return
    await this.openMiniapp(agentId, e.detail.slug)
  }

  private handleCloseMiniappWindow() {
    state.closeMiniappWindow()
  }

  private async handleReloadMiniappWindow() {
    const win = state.miniappWindow
    if (!win) return
    await this.openMiniapp(win.agentId, win.slug)
  }

  private async handleRestartReloadMiniapp() {
    const win = state.miniappWindow
    if (!win) return
    try {
      const agent = state.agents.find(a => a.id === win.agentId)
      if (agent?.status === 'stopped' || agent?.status === 'error') {
        await api.startAgent(win.agentId)
      }
    } catch (err) {
      state.patchMiniappWindow({ loading: false, error: 'Failed to restart agent' })
      return
    }
    await this.openMiniapp(win.agentId, win.slug)
  }

  disconnectedCallback() {
    this.finishSidebarResize()
    state.removeEventListener('change', this.stateChangeHandler)
    uiPreferences.removeEventListener('change', this.uiPreferenceChangeHandler)
    desktopShell.removeEventListener('change', this.desktopShellChangeHandler)
    window.removeEventListener('resize', this.windowResizeHandler)
    uiPreferences.destroy()
    this.ws?.destroy()
    super.disconnectedCallback()
  }

  private handleOpenSettings(e?: CustomEvent<{ section?: SettingsSection }>) {
    this.settingsInitialSection = e?.detail?.section ?? 'general'
    this.activeSurface = 'settings'
    this.requestUpdate()
  }

  private handleOpenSandboxes() {
    this.activeSurface = 'sandboxes'
    this.requestUpdate()
  }

  private async handleOpenApps() {
    this.activeSurface = 'apps'
    this.requestUpdate()
    try {
      const apps = await api.listAllApps()
      state.setAllApps(apps)
    } catch (err) {
      console.error('Failed to load all apps:', err)
    }
  }

  private handleCloseSettings() {
    this.activeSurface = 'chat'
    this.settingsInitialSection = 'general'
    this.requestUpdate()
  }

  private handleThemeModeChange(e: CustomEvent<ThemeMode>) {
    uiPreferences.setThemeMode(e.detail)
  }

  private supportsFullHideSidebar() {
    return window.matchMedia(DESKTOP_FULL_HIDE_SIDEBAR_QUERY).matches
  }

  private syncSidebarWidthFromPreferences() {
    const persisted = uiPreferences.getSidebarWidth()
    if (persisted == null) return
    const nextWidth = this.clampSidebarWidth(persisted)
    if (nextWidth !== this.sidebarWidthPx) {
      this.sidebarWidthPx = nextWidth
    }
  }

  private getWorkspaceWidth(): number | null {
    const width = this.workspaceEl?.getBoundingClientRect().width || this.getBoundingClientRect().width || window.innerWidth
    return Number.isFinite(width) && width > 0 ? width : null
  }

  private getSidebarWidthEffectiveMax(workspaceWidth = this.getWorkspaceWidth()): number {
    if (workspaceWidth == null || !Number.isFinite(workspaceWidth)) return SIDEBAR_MAX_WIDTH_PX
    const contentBound = Math.floor(workspaceWidth - SIDEBAR_CONTENT_MIN_WIDTH_PX - SIDEBAR_SPLITTER_TRACK_PX)
    return Math.max(SIDEBAR_MIN_WIDTH_PX, Math.min(SIDEBAR_MAX_WIDTH_PX, contentBound))
  }

  private clampSidebarWidth(width: number, workspaceWidth = this.getWorkspaceWidth()): number {
    if (!Number.isFinite(width)) return DEFAULT_SIDEBAR_WIDTH_PX
    const min = SIDEBAR_MIN_WIDTH_PX
    const max = this.getSidebarWidthEffectiveMax(workspaceWidth)
    if (width < min) return min
    if (width > max) return max
    return Math.round(width)
  }

  private persistSidebarWidth() {
    const nextWidth = this.clampSidebarWidth(this.sidebarWidthPx)
    this.sidebarWidthPx = nextWidth
    uiPreferences.setSidebarWidth(nextWidth)
  }

  private bindSidebarResizeListeners() {
    if (this.sidebarResizeListenersBound) return
    this.sidebarResizeListenersBound = true
    window.addEventListener('pointermove', this.handleSidebarResizePointerMove)
    window.addEventListener('pointerup', this.handleSidebarResizePointerEnd)
    window.addEventListener('pointercancel', this.handleSidebarResizePointerEnd)
  }

  private unbindSidebarResizeListeners() {
    if (!this.sidebarResizeListenersBound) return
    this.sidebarResizeListenersBound = false
    window.removeEventListener('pointermove', this.handleSidebarResizePointerMove)
    window.removeEventListener('pointerup', this.handleSidebarResizePointerEnd)
    window.removeEventListener('pointercancel', this.handleSidebarResizePointerEnd)
  }

  private finishSidebarResize() {
    const wasActive = this.sidebarResizeActive
    this.sidebarResizeActive = false
    this.sidebarResizePointerId = null
    this.unbindSidebarResizeListeners()
    if (wasActive) this.persistSidebarWidth()
  }

  private readonly handleSidebarResizePointerMove = (event: PointerEvent) => {
    if (!this.sidebarResizeActive) return
    if (this.sidebarResizePointerId !== null && event.pointerId !== this.sidebarResizePointerId) return
    const deltaX = event.clientX - this.sidebarResizeStartX
    const width = this.sidebarResizeStartWidth + deltaX
    this.sidebarWidthPx = this.clampSidebarWidth(width)
  }

  private readonly handleSidebarResizePointerEnd = (event: PointerEvent) => {
    if (!this.sidebarResizeActive) return
    if (this.sidebarResizePointerId !== null && event.pointerId !== this.sidebarResizePointerId) return
    this.finishSidebarResize()
  }

  private handleSidebarResizePointerDown(event: PointerEvent) {
    if (!this.shouldRenderSidebarResizer()) return
    event.preventDefault()
    const handle = event.currentTarget as HTMLElement | null
    if (handle?.setPointerCapture) {
      try {
        handle.setPointerCapture(event.pointerId)
      } catch {
        // Continue using window listeners if pointer capture is unavailable.
      }
    }
    this.sidebarResizeActive = true
    this.sidebarResizePointerId = event.pointerId
    this.sidebarResizeStartX = event.clientX
    this.sidebarResizeStartWidth = this.clampSidebarWidth(this.sidebarWidthPx)
    this.bindSidebarResizeListeners()
  }

  private handleSidebarResizeKeydown(event: KeyboardEvent) {
    if (!this.shouldRenderSidebarResizer()) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.shiftKey ? SIDEBAR_RESIZE_STEP_FAST_PX : SIDEBAR_RESIZE_STEP_PX
    const delta = event.key === 'ArrowLeft' ? -step : step
    this.sidebarWidthPx = this.clampSidebarWidth(this.sidebarWidthPx + delta)
    this.persistSidebarWidth()
  }

  private shouldFullyHideSidebar() {
    return uiPreferences.sidebarCollapsed && this.supportsFullHideSidebar() && this.activeSurface !== 'settings'
  }

  private shouldRenderSidebarResizer() {
    return this.activeSurface !== 'settings' && !this.shouldFullyHideSidebar() && this.supportsFullHideSidebar()
  }

  private openCreateChannelDialog() {
    this.channelDialog?.open()
  }

  private handleToggleSidebar() {
    if (!this.supportsFullHideSidebar()) return
    uiPreferences.setSidebarCollapsed(!uiPreferences.sidebarCollapsed)
  }

  private get shellState() {
    return desktopShell.state
  }

  private async loadAppVersion() {
    const next = await (window.duneElectron?.getAppVersion?.() ?? Promise.resolve(null)).catch(() => null)
    if (!next || next === this.appVersion) return
    this.appVersion = next
    this.requestUpdate()
  }

  private handleWindowControl(action: WindowControlAction) {
    desktopShell.invokeWindowControl(action)
  }

  private openCurrentChannelDetails() {
    const channel = state.currentChannel
    if (!channel) return
    this.detailsChannelId = channel.id
    this.requestUpdate()
  }

  private openCurrentChannelMembers() {
    const channel = state.currentChannel
    if (!channel) return
    this.membersDialog?.open(channel.id)
  }

  private openCurrentAgentProfile() {
    const agent = state.selectedAgent
    if (!agent) return
    state.openProfile(agent.id)
    void this.ensureAgentLogsLoaded(agent.id)
  }

  private getSurfaceMeta(): { eyebrow: string; title: string; subtitle: string } {
    if (this.activeSurface === 'settings') {
      return {
        eyebrow: 'Workspace Preferences',
        title: 'Settings',
        subtitle: 'Appearance, models, and local workspace behavior.',
      }
    }

    if (this.activeSurface === 'sandboxes') {
      return {
        eyebrow: 'Operations',
        title: 'Sandboxes',
        subtitle: 'Inspect runtime boxes, filesystems, and execution surfaces.',
      }
    }

    if (this.activeSurface === 'apps') {
      return {
        eyebrow: 'Library',
        title: 'Apps',
        subtitle: 'Mini-apps published by agents across the workspace.',
      }
    }

    if (state.selectedAgent) {
      const agent = state.selectedAgent
      return {
        eyebrow: 'Agent Workspace',
        title: agent.name,
        subtitle: agent.status === 'stopped' ? 'Offline' : `Status: ${agent.status}`,
      }
    }

    if (state.currentChannel) {
      const channel = state.currentChannel
      return {
        eyebrow: 'Channel',
        title: channel.name,
        subtitle: channel.description || 'Live coordination surface for people and agents.',
      }
    }

    return {
      eyebrow: 'Workspace',
      title: 'Dune',
      subtitle: 'Desktop-first local agent coordination.',
    }
  }

  private getToolbarAgent() {
    return this.activeSurface === 'chat' ? state.selectedAgent : null
  }

  private renderToolbarTitle(title: string) {
    const agent = this.getToolbarAgent()
    if (agent) {
      return html`
        <button
          class="pane-toolbar-title buttonlike"
          type="button"
          data-testid="desktop-toolbar-title"
          aria-label=${`Open profile for ${title}`}
          title=${title}
          @click=${this.handleOpenSelectedAgentProfile}
        >
          ${title}
        </button>
      `
    }

    const channel = this.activeSurface === 'chat' ? state.currentChannel : null
    if (channel) {
      return html`
        <button
          class="pane-toolbar-title buttonlike"
          type="button"
          data-testid="desktop-toolbar-title"
          aria-label=${`Open details for ${title}`}
          title=${title}
          @click=${this.handleOpenSelectedChannelDetails}
        >
          ${title}
        </button>
      `
    }

    return html`<h1 class="pane-toolbar-title" data-testid="desktop-toolbar-title" title=${title}>${title}</h1>`
  }

  private renderWindowControls() {
    if (!this.shellState.supportsWindowControls) return null

    return html`
      <div class="window-controls" data-testid="desktop-window-controls">
        <button
          class="window-control-btn"
          type="button"
          data-testid="window-minimize"
          aria-label="Minimize window"
          @click=${() => this.handleWindowControl('minimize')}
        >
          ${iconMinus()}
        </button>
        <button
          class="window-control-btn"
          type="button"
          data-testid="window-maximize"
          aria-label="Maximize window"
          @click=${() => this.handleWindowControl('maximize')}
        >
          ${iconSquare()}
        </button>
        <button
          class="window-control-btn"
          type="button"
          data-testid="window-close"
          aria-label="Close window"
          @click=${() => this.handleWindowControl('close')}
        >
          ${iconX()}
        </button>
      </div>
    `
  }

  private renderToolbarLeadingCluster() {
    return null
  }

  private renderPaneToolbarActions() {
    return html`
      ${this.renderWindowControls()}
    `
  }

  private renderDesktopToolbar() {
    const meta = this.getSurfaceMeta()
    const sidebarHidden = this.shouldFullyHideSidebar()
    const toolbarClass = [
      'pane-toolbar',
      sidebarHidden ? 'hidden-sidebar' : '',
      sidebarHidden && this.shellState.usesNativeTrafficLights ? 'native-traffic-lights' : '',
    ].filter(Boolean).join(' ')
    const toolbarMainClass = [
      'pane-toolbar-main',
      sidebarHidden ? 'hidden-sidebar' : '',
    ].filter(Boolean).join(' ')

    return html`
      <header
        class=${toolbarClass}
        data-testid="desktop-toolbar"
      >
        <div class=${toolbarMainClass}>
          ${this.renderToolbarLeadingCluster()}
          <div class="pane-toolbar-copy">
            <div class="pane-toolbar-title-wrap">
              ${this.renderToolbarTitle(meta.title)}
            </div>
          </div>
        </div>

        <div class="pane-toolbar-actions">
          ${this.renderPaneToolbarActions()}
        </div>
      </header>
    `
  }

  private getFooterPermissionMeta() {
    return { label: 'Full access', tone: 'warning' as const }
  }

  private getFooterContextLabel() {
    if (state.selectedAgent) return `@${state.selectedAgent.name}`
    if (state.currentChannel) return state.currentChannel.name
    if (this.activeSurface === 'settings') return 'Settings'
    if (this.activeSurface === 'sandboxes') return 'Sandboxes'
    if (this.activeSurface === 'apps') return 'Apps'
    return 'Workspace'
  }

  private getFooterActivityMeta() {
    return { label: 'Synced', tone: 'success' as const }
  }

  private renderChatSurface() {
    if (state.selectedAgent) {
      return html`
        <agent-chat-view
          .agent=${state.selectedAgent}
          .entries=${state.getRecentAgentLogs(state.selectedAgent.id).filter((entry) => entry.type !== 'runtime')}
          .selectedModelProvider=${this.selectedModelProvider}
          .sendDmRequest=${this.sendDmRequest}
          .paneIntegrated=${true}
          @open-miniapp=${this.handleOpenMiniapp}
          @toggle-agent=${this.handleToggleAgent}
          @interrupt-agent=${this.handleInterruptAgent}
          @cancel-start=${this.handleCancelStart}
          @open-agent-profile=${this.handleOpenProfile}
          @open-settings=${this.handleOpenSettings}
          @agent-updated=${this.handleAgentUpdated}
        ></agent-chat-view>
      `
    }

    return html`
      <message-area
        .channel=${state.currentChannel}
        .messages=${state.currentMessages}
        .agents=${state.agents}
        .typingAgentIds=${state.currentTypingAgentIds}
        .subscriberCount=${this.subscriberCount}
        .selectedModelProvider=${this.selectedModelProvider}
        .paneIntegrated=${true}
        @open-settings=${this.handleOpenSettings}
        @send-message=${this.handleSendMessage}
        @manage-members=${this.handleManageMembers}
        @open-agent-profile=${this.handleOpenProfile}
        @open-channel-details=${this.handleOpenChannelDetails}
      ></message-area>
    `
  }

  private renderActiveSurface() {
    if (this.activeSurface === 'settings') {
      return html`
        <settings-view
          .themeMode=${uiPreferences.themeMode}
          .initialSection=${this.settingsInitialSection}
          @close-settings=${this.handleCloseSettings}
          @settings-saved=${this.handleSettingsSaved}
          @theme-mode-change=${this.handleThemeModeChange}
        ></settings-view>
      `
    }

    if (this.activeSurface === 'sandboxes') {
      return html`
        <sandboxes-view
          .agents=${state.agents}
        ></sandboxes-view>
      `
    }

    if (this.activeSurface === 'apps') {
      return html`
        <apps-view
          .apps=${state.allApps}
          @open-miniapp=${this.handleOpenMiniapp}
        ></apps-view>
      `
    }

    return this.renderChatSurface()
  }

  private renderHostApprovals() {
    return html`
      <host-approval-modal
        .requests=${state.pendingHostOperatorRequests}
        .open=${this.hostApprovalModalOpen}
        .loadingIds=${this.hostCommandDecisionLoadingIds}
        @open-modal=${this.openHostApprovalsModal}
        @close-modal=${this.closeHostApprovalsModal}
        @decide-request=${(e: CustomEvent<{ request: HostOperatorRequest; decision: 'approve' | 'reject' }>) => {
          this.decideHostOperatorRequest(e.detail.request, e.detail.decision)
        }}
      ></host-approval-modal>
    `
  }

  render() {
    const sidebarCollapsed = uiPreferences.sidebarCollapsed
    const isSettings = this.activeSurface === 'settings'
    const sidebarHidden = this.shouldFullyHideSidebar()
    const sidebarResizable = this.shouldRenderSidebarResizer()
    const sidebarWidth = this.clampSidebarWidth(this.sidebarWidthPx)
    const sidebarResizeMax = this.getSidebarWidthEffectiveMax()
    const miniappWindow = state.miniappWindow
    const miniappAgent = miniappWindow ? state.agents.find(agent => agent.id === miniappWindow.agentId) : null
    const shell = this.shellState
    const workspaceClass = [
      'workspace',
      sidebarHidden ? 'collapsed' : '',
      isSettings ? 'settings-mode' : '',
      sidebarResizable ? 'with-sidebar-resizer' : '',
      shell.usesNativeTrafficLights ? 'native-traffic-lights' : '',
    ].filter(Boolean).join(' ')

    return html`
      <div class="frame">
        <div
          class=${workspaceClass}
          style=${isSettings ? '' : `--shell-sidebar-width:${sidebarWidth}px;`}
          data-testid="app-workspace"
        >
          ${isSettings ? '' : html`
            <div class="sidebar-wrap ${sidebarHidden ? 'is-hidden' : ''}" data-testid="sidebar-region" aria-hidden=${sidebarHidden ? 'true' : 'false'}>
              ${sidebarHidden ? '' : html`
                <sidebar-panel
                  .channels=${state.channels}
                  .agents=${state.agents}
                  .selectedChannelId=${state.selectedChannelId}
                  .selectedAgentId=${state.selectedAgentId || ''}
                  .activeSurface=${this.activeSurface}
                  .collapsed=${sidebarCollapsed}
                  .nativeTrafficLights=${shell.usesNativeTrafficLights}
                  @select-channel=${(e: CustomEvent) => this.selectChannel(e.detail)}
                  @select-agent=${(e: CustomEvent) => this.selectAgent(e.detail)}
                  @create-channel=${this.openCreateChannelDialog}
                  @create-agent=${() => this.agentDialog?.open()}
                  @open-settings=${this.handleOpenSettings}
                  @open-sandboxes=${this.handleOpenSandboxes}
                  @open-apps=${this.handleOpenApps}
                  @toggle-sidebar=${this.handleToggleSidebar}
                  @channel-context-action=${this.handleChannelContextAction}
                ></sidebar-panel>
              `}
            </div>
            ${sidebarResizable ? html`
              <button
                class="sidebar-resizer ${this.sidebarResizeActive ? 'active' : ''}"
                type="button"
                role="separator"
                aria-label="Resize sidebar"
                aria-orientation="vertical"
                aria-valuemin=${String(SIDEBAR_MIN_WIDTH_PX)}
                aria-valuemax=${String(sidebarResizeMax)}
                aria-valuenow=${String(sidebarWidth)}
                data-testid="sidebar-resizer"
                @pointerdown=${this.handleSidebarResizePointerDown}
                @keydown=${this.handleSidebarResizeKeydown}
              ></button>
            ` : ''}
          `}
          ${!isSettings && this.supportsFullHideSidebar() ? html`
            <button
              class="sidebar-toggle-overlay"
              type="button"
              title="${sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}"
              aria-label="${sidebarHidden ? 'Show sidebar' : 'Hide sidebar'}"
              data-testid="sidebar-toggle"
              @click=${this.handleToggleSidebar}
            >
              ${iconPanelLeft()}
            </button>
          ` : ''}
          <div class="content-wrap" data-testid="content-region">
            ${this.renderDesktopToolbar()}
            <div class="stage-shell" data-testid="stage-shell">
              ${this.renderActiveSurface()}
            </div>
          </div>
        </div>
      </div>

      ${miniappWindow ? html`
        <miniapp-window
          .open=${miniappWindow.open}
          .agentId=${miniappWindow.agentId}
          .agentName=${miniappWindow.agentName}
          .appSlug=${miniappWindow.slug}
          .appName=${miniappWindow.appName}
          .appUrl=${miniappWindow.url}
          .loading=${miniappWindow.loading}
          .errorMessage=${miniappWindow.error || ''}
          .agentStatus=${miniappAgent?.status || 'stopped'}
          @close-miniapp-window=${this.handleCloseMiniappWindow}
          @reload-miniapp-window=${this.handleReloadMiniappWindow}
          @restart-reload-miniapp=${this.handleRestartReloadMiniapp}
        ></miniapp-window>
      ` : ''}

      ${state.profileAgent ? html`
        <agent-profile-panel
          .agent=${state.profileAgent}
          .channels=${state.channels}
          .screen=${state.getAgentScreen(state.profileAgent.id)}
          .logs=${state.getAgentLogs(state.profileAgent.id)}
          .logsLoading=${this.logsLoadingAgentIds.has(state.profileAgent.id)}
          .logsLoadingOlder=${this.logsLoadingOlderAgentIds.has(state.profileAgent.id)}
          .logsHasMore=${state.getAgentLogsNextBeforeSeq(state.profileAgent.id) !== null}
          @toggle-agent=${this.handleToggleAgent}
          @delete-agent=${this.handleDeleteAgent}
          @close-profile=${this.handleCloseProfile}
          @load-agent-logs-older=${this.handleLoadAgentLogsOlder}
          @load-agent-screen=${this.handleLoadAgentScreen}
          @agent-updated=${this.handleAgentUpdated}
        ></agent-profile-panel>
      ` : ''}

      ${this.detailsChannelId ? html`
        <channel-details-panel
          .channel=${state.channels.find(c => c.id === this.detailsChannelId) || null}
          .agents=${state.agents}
          @close-details=${this.handleCloseDetails}
          @channel-updated=${this.handleChannelUpdated}
          @channel-deleted=${this.handleChannelDeleted}
          @members-changed=${this.handleMembersChanged}
        ></channel-details-panel>
      ` : ''}

      ${this.renderHostApprovals()}

      <create-channel-dialog
        @channel-created=${this.handleCreateChannel}
      ></create-channel-dialog>

      <create-agent-dialog
        @agent-created=${this.handleCreateAgent}
      ></create-agent-dialog>

      <channel-members-dialog
        .agents=${state.agents}
        @members-changed=${this.handleMembersChanged}
      ></channel-members-dialog>

      ${this.lightboxSrc ? html`
        <div class="lightbox" @click=${() => { this.lightboxSrc = '' }}>
          <img src=${this.lightboxSrc} alt="Full size" @click=${(e: Event) => e.stopPropagation()} />
        </div>
      ` : ''}
    `
  }
}
