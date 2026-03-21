import { LitElement, html, nothing } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import type { SlackSettings, Agent, Channel } from '@dune/shared'
import { getSlackSettings, updateSlackSettings, disconnectSlack, syncAgentToSlack, unsyncAgentFromSlack, syncAllAgentsToSlack, syncAllChannelsToSlack, syncChannelToSlack, unsyncChannelFromSlack, listSlackChannelLinks, listAgents, listChannels } from '../../services/rpc.js'
import { settingsViewStyles } from './view.css.js'

@customElement('settings-slack-section')
export class SettingsSlackSection extends LitElement {
  @state() private slackSettings: SlackSettings | null = null
  @state() private slackLoading = false
  @state() private slackBotTokenDraft = ''
  @state() private slackAppTokenDraft = ''
  @state() private allAgents: Agent[] = []
  @state() private allChannels: Channel[] = []
  @state() private channelLinks: Array<{ id: string; duneChannelId: string; slackChannelId: string; slackChannelName: string }> = []
  @state() private slackSyncingAgentId = ''
  @state() private slackSyncingChannelId = ''
  @state() private slackBulkSyncing = false
  @state() private slackStatusMessage = ''
  @state() private slackStatusTone: 'idle' | 'success' | 'error' = 'idle'

  static styles = settingsViewStyles

  override connectedCallback() {
    super.connectedCallback()
    void this.loadSlackSettings()
  }

  private async loadSlackSettings() {
    this.slackLoading = true
    try {
      const [settings, agents, channels, links] = await Promise.all([
        getSlackSettings(),
        listAgents(),
        listChannels(),
        listSlackChannelLinks(),
      ])
      this.slackSettings = settings
      this.allAgents = agents
      this.allChannels = channels
      this.channelLinks = links
    } catch (err) {
      this.slackStatusTone = 'error'
      this.slackStatusMessage = err instanceof Error ? err.message : 'Failed to load Slack settings'
    } finally {
      this.slackLoading = false
    }
  }

  private async saveSlackCredentials() {
    const data: { botToken?: string; appToken?: string } = {}
    if (this.slackBotTokenDraft.trim()) data.botToken = this.slackBotTokenDraft.trim()
    if (this.slackAppTokenDraft.trim()) data.appToken = this.slackAppTokenDraft.trim()
    if (!data.botToken && !data.appToken) return
    try {
      this.slackSettings = await updateSlackSettings(data)
      this.slackBotTokenDraft = ''
      this.slackAppTokenDraft = ''
      this.slackStatusTone = 'success'
      this.slackStatusMessage = 'Connected to Slack.'
      await this.loadSlackSettings()
    } catch (err) {
      this.slackStatusTone = 'error'
      this.slackStatusMessage = err instanceof Error ? err.message : 'Failed to connect'
    }
  }

  private copySlackManifest() {
    const manifest = JSON.stringify({
      display_information: { name: 'Dune' },
      features: {
        app_home: { messages_tab_enabled: true, messages_tab_read_only_enabled: false },
        bot_user: { display_name: 'Dune', always_online: true },
      },
      oauth_config: {
        scopes: {
          bot: ['channels:history', 'channels:manage', 'channels:read', 'chat:write', 'chat:write.customize', 'files:write', 'users:read', 'app_mentions:read'],
        },
      },
      settings: {
        event_subscriptions: { bot_events: ['app_mention', 'message.channels'] },
        socket_mode_enabled: true,
      },
    }, null, 2)
    navigator.clipboard.writeText(manifest)
    this.slackStatusTone = 'success'
    this.slackStatusMessage = 'Manifest copied to clipboard.'
  }

  private async handleDisconnectSlack() {
    try {
      await disconnectSlack()
      this.slackSettings = { isConnected: false, teamId: null, teamName: null, botUserId: null, installedAt: null, hasBotToken: false, hasAppToken: false }
      this.slackStatusTone = 'success'
      this.slackStatusMessage = 'Slack disconnected.'
    } catch (err) {
      this.slackStatusTone = 'error'
      this.slackStatusMessage = err instanceof Error ? err.message : 'Failed to disconnect'
    }
  }

  private async handleSyncAgent() {
    if (!this.slackSyncingAgentId) return
    try {
      const result = await syncAgentToSlack(this.slackSyncingAgentId)
      this.slackSyncingAgentId = ''
      this.slackStatusTone = 'success'
      this.slackStatusMessage = `Synced to #${result.slackChannelName}`
      this.allAgents = await listAgents()
    } catch (err) {
      this.slackStatusTone = 'error'
      this.slackStatusMessage = err instanceof Error ? err.message : 'Failed to sync agent'
    }
  }

  private async handleUnsyncAgent(agentId: string) {
    try {
      await unsyncAgentFromSlack(agentId)
      this.slackStatusTone = 'success'
      this.slackStatusMessage = 'Agent unsynced from Slack.'
      this.allAgents = await listAgents()
    } catch (err) {
      this.slackStatusTone = 'error'
      this.slackStatusMessage = err instanceof Error ? err.message : 'Failed to unsync agent'
    }
  }

  private async handleSyncAllAgents() {
    this.slackBulkSyncing = true
    try {
      const result = await syncAllAgentsToSlack()
      this.allAgents = await listAgents()
      const msg = `Synced ${result.synced} agent(s) to Slack.`
      if (result.errors.length > 0) {
        this.slackStatusTone = 'error'
        this.slackStatusMessage = `${msg} Errors: ${result.errors.join('; ')}`
      } else {
        this.slackStatusTone = 'success'
        this.slackStatusMessage = msg
      }
    } catch (err) {
      this.slackStatusTone = 'error'
      this.slackStatusMessage = err instanceof Error ? err.message : 'Failed to sync agents'
    } finally {
      this.slackBulkSyncing = false
    }
  }

  private async handleSyncChannel() {
    if (!this.slackSyncingChannelId) return
    try {
      const result = await syncChannelToSlack(this.slackSyncingChannelId)
      this.slackSyncingChannelId = ''
      this.slackStatusTone = 'success'
      this.slackStatusMessage = `Synced to #${result.slackChannelName}`
      this.channelLinks = await listSlackChannelLinks()
    } catch (err) {
      this.slackStatusTone = 'error'
      this.slackStatusMessage = err instanceof Error ? err.message : 'Failed to sync channel'
    }
  }

  private async handleUnsyncChannel(duneChannelId: string) {
    try {
      await unsyncChannelFromSlack(duneChannelId)
      this.slackStatusTone = 'success'
      this.slackStatusMessage = 'Channel unsynced from Slack.'
      this.channelLinks = await listSlackChannelLinks()
    } catch (err) {
      this.slackStatusTone = 'error'
      this.slackStatusMessage = err instanceof Error ? err.message : 'Failed to unsync channel'
    }
  }

  private async handleSyncAllChannels() {
    this.slackBulkSyncing = true
    try {
      const result = await syncAllChannelsToSlack()
      this.channelLinks = await listSlackChannelLinks()
      const msg = `Synced ${result.synced} channel(s) to Slack.`
      if (result.errors.length > 0) {
        this.slackStatusTone = 'error'
        this.slackStatusMessage = `${msg} Errors: ${result.errors.join('; ')}`
      } else {
        this.slackStatusTone = 'success'
        this.slackStatusMessage = msg
      }
    } catch (err) {
      this.slackStatusTone = 'error'
      this.slackStatusMessage = err instanceof Error ? err.message : 'Failed to sync channels'
    } finally {
      this.slackBulkSyncing = false
    }
  }

  render() {
    const connected = this.slackSettings?.isConnected ?? false

    return html`
      <section class="section">
        <h2 class="section-title">Slack</h2>
        <div class="settings-card">
          <div class="field">
            <div class="field-top">
              <div class="field-title">Connection</div>
              <div class="field-status ${connected ? 'success' : ''}">${connected ? `Connected to ${this.slackSettings?.teamName || 'workspace'}` : 'Not connected'}</div>
            </div>
            <div class="field-help">Connect to Slack so agents can interact with users directly in dedicated Slack channels.</div>

            ${!connected ? html`
              <div class="field-help">
                1. <a href="https://api.slack.com/apps" target="_blank" rel="noopener">Create a Slack app</a> (use
                <button class="btn" type="button" style="display:inline;min-height:auto;padding:2px 6px;font-size:inherit;" @click=${() => this.copySlackManifest()}>Copy Manifest</button>
                for quick setup)
                <br>2. Install it to your workspace
                <br>3. Paste the tokens below
              </div>
              <div class="field-grid">
                <div class="field">
                  <div class="field-top">
                    <div class="field-title">Bot Token</div>
                  </div>
                  <div class="field-help">From: Install App → Bot User OAuth Token</div>
                  <input class="text-input" type="password" placeholder="xoxb-..." autocomplete="off"
                    .value=${this.slackBotTokenDraft}
                    @input=${(e: Event) => { this.slackBotTokenDraft = (e.target as HTMLInputElement).value }}
                  />
                </div>
                <div class="field">
                  <div class="field-top">
                    <div class="field-title">App Token (optional)</div>
                  </div>
                  <div class="field-help">Enables receiving Slack messages in Dune. From: Basic Information → App-Level Tokens</div>
                  <input class="text-input" type="password" placeholder="xapp-..." autocomplete="off"
                    .value=${this.slackAppTokenDraft}
                    @input=${(e: Event) => { this.slackAppTokenDraft = (e.target as HTMLInputElement).value }}
                  />
                </div>
              </div>
              <div class="field-actions">
                <button class="btn primary" type="button"
                  .disabled=${!this.slackBotTokenDraft.trim()}
                  @click=${() => void this.saveSlackCredentials()}
                >Connect</button>
              </div>
            ` : html`
              <div class="field-actions">
                <button class="btn" type="button"
                  @click=${() => void this.handleDisconnectSlack()}
                >Disconnect</button>
                <button class="btn" type="button"
                  @click=${() => void this.loadSlackSettings()}
                >Refresh</button>
              </div>

              ${!this.slackSettings?.hasAppToken ? html`
                <div class="field">
                  <div class="field-top">
                    <div class="field-title">App Token (optional)</div>
                  </div>
                  <div class="field-help">Enables receiving Slack messages in Dune. From: Basic Information → App-Level Tokens</div>
                  <input class="text-input" type="password" placeholder="xapp-..." autocomplete="off"
                    .value=${this.slackAppTokenDraft}
                    @input=${(e: Event) => { this.slackAppTokenDraft = (e.target as HTMLInputElement).value }}
                  />
                  <div class="field-actions">
                    <button class="btn primary" type="button"
                      .disabled=${!this.slackAppTokenDraft.trim()}
                      @click=${() => void this.saveSlackCredentials()}
                    >Save token</button>
                  </div>
                </div>
              ` : nothing}
            `}
          </div>

          ${connected ? html`
            <div class="field">
              <div class="field-top">
                <div class="field-title">Agent Sync</div>
                <button class="btn primary" type="button"
                  .disabled=${this.slackBulkSyncing || this.allAgents.filter(a => !a.slackChannelId).length === 0}
                  @click=${() => void this.handleSyncAllAgents()}
                >${this.slackBulkSyncing ? 'Syncing...' : 'Sync All Agents'}</button>
              </div>
              <div class="field-help">Sync agents to Slack. Each synced agent gets a dedicated channel (dune-agent-xxx).</div>

              ${this.allAgents.filter(a => a.slackChannelId).map(agent => html`
                <div class="row">
                  <div class="row-copy">
                    <div class="row-label">${agent.name}</div>
                    <p class="row-sub">Synced to Slack</p>
                  </div>
                  <button class="btn" type="button" @click=${() => void this.handleUnsyncAgent(agent.id)}>Unsync</button>
                </div>
              `)}

              ${this.allAgents.filter(a => !a.slackChannelId).length > 0 ? html`
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  <select class="text-input" style="flex:1;min-width:120px;"
                    .value=${this.slackSyncingAgentId}
                    @change=${(e: Event) => { this.slackSyncingAgentId = (e.target as HTMLSelectElement).value }}
                  >
                    <option value="">Select agent...</option>
                    ${this.allAgents.filter(a => !a.slackChannelId).map(a => html`<option value=${a.id}>${a.name}</option>`)}
                  </select>
                  <button class="btn primary" type="button"
                    .disabled=${!this.slackSyncingAgentId}
                    @click=${() => void this.handleSyncAgent()}
                  >Sync to Slack</button>
                </div>
              ` : nothing}
            </div>

            <div class="field">
              <div class="field-top">
                <div class="field-title">Channel Sync</div>
                <button class="btn primary" type="button"
                  .disabled=${this.slackBulkSyncing || (() => {
                    const linkedIds = new Set(this.channelLinks.map(l => l.duneChannelId))
                    return this.allChannels.filter(c => !linkedIds.has(c.id)).length === 0
                  })()}
                  @click=${() => void this.handleSyncAllChannels()}
                >${this.slackBulkSyncing ? 'Syncing...' : 'Sync All Channels'}</button>
              </div>
              <div class="field-help">Sync channels to Slack. Each synced channel gets a dedicated Slack channel (dune-channel-xxx).</div>

              ${(() => {
                const linkedMap = new Map(this.channelLinks.map(l => [l.duneChannelId, l]))
                return this.allChannels.filter(c => linkedMap.has(c.id)).map(channel => html`
                  <div class="row">
                    <div class="row-copy">
                      <div class="row-label">${channel.name}</div>
                      <p class="row-sub">Synced to #${linkedMap.get(channel.id)!.slackChannelName}</p>
                    </div>
                    <button class="btn" type="button" @click=${() => void this.handleUnsyncChannel(channel.id)}>Unsync</button>
                  </div>
                `)
              })()}

              ${(() => {
                const linkedIds = new Set(this.channelLinks.map(l => l.duneChannelId))
                const unsyncedChannels = this.allChannels.filter(c => !linkedIds.has(c.id))
                return unsyncedChannels.length > 0 ? html`
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <select class="text-input" style="flex:1;min-width:120px;"
                      .value=${this.slackSyncingChannelId}
                      @change=${(e: Event) => { this.slackSyncingChannelId = (e.target as HTMLSelectElement).value }}
                    >
                      <option value="">Select channel...</option>
                      ${unsyncedChannels.map(c => html`<option value=${c.id}>${c.name}</option>`)}
                    </select>
                    <button class="btn primary" type="button"
                      .disabled=${!this.slackSyncingChannelId}
                      @click=${() => void this.handleSyncChannel()}
                    >Sync to Slack</button>
                  </div>
                ` : nothing
              })()}
            </div>
          ` : nothing}

          ${this.slackLoading ? html`<div class="feedback">Loading Slack settings...</div>` : nothing}
          ${this.slackStatusMessage ? html`
            <div class="feedback ${this.slackStatusTone === 'success' ? 'success' : ''} ${this.slackStatusTone === 'error' ? 'error' : ''}">
              ${this.slackStatusMessage}
            </div>
          ` : nothing}
        </div>
      </section>
    `
  }
}
