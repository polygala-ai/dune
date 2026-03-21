import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { ClaudeSettings, ClaudeSettingsUpdate, SelectedModelProvider } from '@dune/shared'
import { getClaudeSettings, updateClaudeSettings } from '../../services/rpc.js'
import { settingsViewStyles } from './settings-view.css.js'

type TrafficMode = 'inherit' | 'enabled' | 'disabled'

@customElement('settings-model-section')
export class SettingsModelSection extends LitElement {
  @state() private claudeSettings: ClaudeSettings | null = null
  @state() private claudeLoading = false
  @state() private claudeSaving = false
  @state() private claudeStatusTone: 'idle' | 'success' | 'error' = 'idle'
  @state() private claudeStatusMessage = ''

  @state() private selectedModelProviderDraft: SelectedModelProvider | null = null
  @state() private defaultModelIdDraft = ''
  @state() private anthropicApiKeyDraft = ''
  @state() private claudeCodeOAuthTokenDraft = ''
  @state() private anthropicAuthTokenDraft = ''
  @state() private anthropicBaseUrlDraft = ''
  @state() private trafficMode: TrafficMode = 'inherit'

  @state() private clearAnthropicApiKey = false
  @state() private clearClaudeCodeOAuthToken = false
  @state() private clearAnthropicAuthToken = false

  static styles = settingsViewStyles

  override connectedCallback() {
    super.connectedCallback()
    void this.loadClaudeSettings()
  }

  private resetSettingsDrafts(settings: ClaudeSettings) {
    this.selectedModelProviderDraft = settings.selectedModelProvider ?? null
    this.defaultModelIdDraft = settings.defaultModelId ?? ''
    this.anthropicApiKeyDraft = ''
    this.claudeCodeOAuthTokenDraft = ''
    this.anthropicAuthTokenDraft = ''
    this.clearAnthropicApiKey = false
    this.clearClaudeCodeOAuthToken = false
    this.clearAnthropicAuthToken = false
    this.anthropicBaseUrlDraft = settings.anthropicBaseUrl ?? ''

    if (settings.claudeCodeDisableNonessentialTraffic === '1') {
      this.trafficMode = 'enabled'
    } else if (settings.claudeCodeDisableNonessentialTraffic === '0') {
      this.trafficMode = 'disabled'
    } else {
      this.trafficMode = 'inherit'
    }
  }

  private async loadClaudeSettings() {
    this.claudeLoading = true
    try {
      const settings = await getClaudeSettings()
      this.claudeSettings = settings
      this.resetSettingsDrafts(settings)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load model settings'
      this.claudeStatusTone = 'error'
      this.claudeStatusMessage = message
    } finally {
      this.claudeLoading = false
    }
  }

  private buildSettingsPatch(): ClaudeSettingsUpdate {
    const patch: ClaudeSettingsUpdate = {}
    const currentSettings = this.claudeSettings

    if (this.selectedModelProviderDraft !== (currentSettings?.selectedModelProvider ?? null)) {
      patch.selectedModelProvider = this.selectedModelProviderDraft
    }
    const nextDefaultModelId = this.defaultModelIdDraft.trim()
    const currentDefaultModelId = currentSettings?.defaultModelId ?? ''
    if (nextDefaultModelId !== currentDefaultModelId) {
      patch.defaultModelId = nextDefaultModelId || null
    }

    const nextBaseUrl = this.anthropicBaseUrlDraft.trim()
    const currentBaseUrl = currentSettings?.anthropicBaseUrl ?? ''
    if (nextBaseUrl !== currentBaseUrl) {
      patch.anthropicBaseUrl = nextBaseUrl || null
    }

    const nextTrafficValue = this.trafficMode === 'inherit'
      ? ''
      : this.trafficMode === 'enabled'
        ? '1'
        : '0'
    const currentTrafficValue = currentSettings?.claudeCodeDisableNonessentialTraffic ?? ''
    if (nextTrafficValue !== currentTrafficValue) {
      patch.claudeCodeDisableNonessentialTraffic = nextTrafficValue || null
    }

    const nextApiKey = this.anthropicApiKeyDraft.trim()
    if (nextApiKey) {
      patch.anthropicApiKey = nextApiKey
    } else if (this.clearAnthropicApiKey) {
      patch.anthropicApiKey = null
    }

    const nextOAuthToken = this.claudeCodeOAuthTokenDraft.trim()
    if (nextOAuthToken) {
      patch.claudeCodeOAuthToken = nextOAuthToken
    } else if (this.clearClaudeCodeOAuthToken) {
      patch.claudeCodeOAuthToken = null
    }

    const nextAuthToken = this.anthropicAuthTokenDraft.trim()
    if (nextAuthToken) {
      patch.anthropicAuthToken = nextAuthToken
    } else if (this.clearAnthropicAuthToken) {
      patch.anthropicAuthToken = null
    }

    return patch
  }

  private hasSettingsChanges(): boolean {
    return Object.keys(this.buildSettingsPatch()).length > 0
  }

  private async saveSettings() {
    if (this.claudeSaving) return
    const patch = this.buildSettingsPatch()

    if (Object.keys(patch).length === 0) {
      this.claudeStatusTone = 'success'
      this.claudeStatusMessage = 'No changes to save.'
      return
    }

    this.claudeSaving = true
    this.claudeStatusTone = 'idle'
    this.claudeStatusMessage = ''

    try {
      const settings = await updateClaudeSettings(patch)
      this.claudeSettings = settings
      this.resetSettingsDrafts(settings)
      this.dispatchEvent(new CustomEvent<ClaudeSettings>('settings-saved', {
        detail: settings,
        bubbles: true,
        composed: true,
      }))
      this.claudeStatusTone = 'success'
      this.claudeStatusMessage = 'Model settings saved.'
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save model settings'
      this.claudeStatusTone = 'error'
      this.claudeStatusMessage = message
    } finally {
      this.claudeSaving = false
    }
  }

  private clearClaudeStatusMessage() {
    this.claudeStatusTone = 'idle'
    this.claudeStatusMessage = ''
  }

  private formatUpdatedAt(timestamp: number | null): string {
    if (!timestamp) return 'Never saved from UI'
    return new Date(timestamp).toLocaleString()
  }

  private renderProviderOption(label: string, value: SelectedModelProvider) {
    const active = this.selectedModelProviderDraft === value
    return html`
      <button
        class="segment ${active ? 'active' : ''}"
        type="button"
        aria-pressed=${active}
        @click=${() => {
          this.selectedModelProviderDraft = value
          this.clearClaudeStatusMessage()
        }}
      >${label}</button>
    `
  }

  private renderDefaultModelOption(label: string, value: string | null) {
    const active = (this.defaultModelIdDraft.trim() || null) === value
    return html`
      <button
        class="segment ${active ? 'active' : ''}"
        type="button"
        aria-pressed=${active}
        @click=${() => {
          this.defaultModelIdDraft = value ?? ''
          this.clearClaudeStatusMessage()
        }}
      >${label}</button>
    `
  }

  private renderTrafficOption(label: string, value: TrafficMode) {
    const active = this.trafficMode === value
    return html`
      <button
        class="segment ${active ? 'active' : ''}"
        type="button"
        aria-pressed=${active}
        @click=${() => {
          this.trafficMode = value
          this.clearClaudeStatusMessage()
        }}
      >${label}</button>
    `
  }

  private secretStatus(hasValue: boolean, draft: string, clearFlag: boolean): { label: string; tone: '' | 'success' | 'warn' } {
    if (draft.trim()) return { label: 'Will update', tone: 'warn' }
    if (clearFlag) return { label: 'Will clear', tone: 'warn' }
    if (hasValue) return { label: 'Configured', tone: 'success' }
    return { label: 'Not set', tone: '' }
  }

  render() {
    const hasChanges = this.hasSettingsChanges()
    const apiKeyStatus = this.secretStatus(
      !!this.claudeSettings?.hasAnthropicApiKey,
      this.anthropicApiKeyDraft,
      this.clearAnthropicApiKey,
    )
    const oauthStatus = this.secretStatus(
      !!this.claudeSettings?.hasClaudeCodeOAuthToken,
      this.claudeCodeOAuthTokenDraft,
      this.clearClaudeCodeOAuthToken,
    )
    const authTokenStatus = this.secretStatus(
      !!this.claudeSettings?.hasAnthropicAuthToken,
      this.anthropicAuthTokenDraft,
      this.clearAnthropicAuthToken,
    )
    const providerLabel = this.selectedModelProviderDraft === 'claude' ? 'Claude selected' : 'Not set'
    const defaultModelLabel = this.defaultModelIdDraft.trim() || 'Claude CLI default'

    return html`
      <section class="section">
        <h2 class="section-title">Model</h2>
        <div class="settings-card">
          <div class="meta-line">Last updated: ${this.formatUpdatedAt(this.claudeSettings?.updatedAt ?? null)}</div>

          <div class="field">
            <div class="field-top">
              <div class="field-title">Default provider</div>
              <div class="field-status ${this.selectedModelProviderDraft ? 'success' : ''}">${providerLabel}</div>
            </div>
            <div class="field-help">Choose the provider chat uses before sending prompts.</div>
            <div class="field-actions">
              <div class="segmented" role="radiogroup" aria-label="Model provider">
                ${this.renderProviderOption('Claude', 'claude')}
              </div>
              <button
                class="btn"
                type="button"
                .disabled=${this.claudeSaving || this.claudeLoading || this.selectedModelProviderDraft === null}
                @click=${() => {
                  this.selectedModelProviderDraft = null
                  this.clearClaudeStatusMessage()
                }}
              >Clear selection</button>
            </div>
          </div>

          <div class="field">
            <div class="field-top">
              <div class="field-title">Workspace default Claude model</div>
              <div class="field-status ${this.defaultModelIdDraft.trim() ? 'success' : ''}">${defaultModelLabel}</div>
            </div>
            <div class="field-help">Optional Claude model alias passed as <code>--model</code>. Leave unset to use Claude Code&apos;s own default.</div>
            <div class="field-actions">
              <div class="segmented" role="radiogroup" aria-label="Default Claude model">
                ${this.renderDefaultModelOption('Claude default', null)}
                ${this.renderDefaultModelOption('Sonnet', 'sonnet')}
                ${this.renderDefaultModelOption('Opus', 'opus')}
                ${this.renderDefaultModelOption('Haiku', 'haiku')}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">Claude</h2>
        <div class="settings-card">
          <div class="field-grid">
            <div class="field">
              <div class="field-top">
                <div class="field-title">Anthropic API Key</div>
                <div class="field-status ${apiKeyStatus.tone}">${apiKeyStatus.label}</div>
              </div>
              <div class="field-help">Used as ANTHROPIC_API_KEY for Claude runtime.</div>
              <input
                class="text-input"
                type="password"
                placeholder="Enter new API key"
                autocomplete="off"
                .value=${this.anthropicApiKeyDraft}
                @input=${(e: Event) => {
                  this.anthropicApiKeyDraft = (e.target as HTMLInputElement).value
                  if (this.anthropicApiKeyDraft.trim()) this.clearAnthropicApiKey = false
                  this.clearClaudeStatusMessage()
                }}
              />
              <div class="field-actions">
                <button
                  class="btn"
                  type="button"
                  .disabled=${this.claudeSaving || this.claudeLoading}
                  @click=${() => {
                    this.anthropicApiKeyDraft = ''
                    this.clearAnthropicApiKey = true
                    this.clearClaudeStatusMessage()
                  }}
                >Clear</button>
              </div>
            </div>

            <div class="field">
              <div class="field-top">
                <div class="field-title">Claude Code OAuth Token</div>
                <div class="field-status ${oauthStatus.tone}">${oauthStatus.label}</div>
              </div>
              <div class="field-help">Used as CLAUDE_CODE_OAUTH_TOKEN for Claude CLI execution.</div>
              <input
                class="text-input"
                type="password"
                placeholder="Enter new OAuth token"
                autocomplete="off"
                .value=${this.claudeCodeOAuthTokenDraft}
                @input=${(e: Event) => {
                  this.claudeCodeOAuthTokenDraft = (e.target as HTMLInputElement).value
                  if (this.claudeCodeOAuthTokenDraft.trim()) this.clearClaudeCodeOAuthToken = false
                  this.clearClaudeStatusMessage()
                }}
              />
              <div class="field-actions">
                <button
                  class="btn"
                  type="button"
                  .disabled=${this.claudeSaving || this.claudeLoading}
                  @click=${() => {
                    this.claudeCodeOAuthTokenDraft = ''
                    this.clearClaudeCodeOAuthToken = true
                    this.clearClaudeStatusMessage()
                  }}
                >Clear</button>
              </div>
            </div>

            <div class="field">
              <div class="field-top">
                <div class="field-title">Anthropic Auth Token</div>
                <div class="field-status ${authTokenStatus.tone}">${authTokenStatus.label}</div>
              </div>
              <div class="field-help">Written into /config/.claude/settings.json under env.ANTHROPIC_AUTH_TOKEN.</div>
              <input
                class="text-input"
                type="password"
                placeholder="Enter new auth token"
                autocomplete="off"
                .value=${this.anthropicAuthTokenDraft}
                @input=${(e: Event) => {
                  this.anthropicAuthTokenDraft = (e.target as HTMLInputElement).value
                  if (this.anthropicAuthTokenDraft.trim()) this.clearAnthropicAuthToken = false
                  this.clearClaudeStatusMessage()
                }}
              />
              <div class="field-actions">
                <button
                  class="btn"
                  type="button"
                  .disabled=${this.claudeSaving || this.claudeLoading}
                  @click=${() => {
                    this.anthropicAuthTokenDraft = ''
                    this.clearAnthropicAuthToken = true
                    this.clearClaudeStatusMessage()
                  }}
                >Clear</button>
              </div>
            </div>

            <div class="field">
              <div class="field-top">
                <div class="field-title">Anthropic Base URL</div>
                <div class="field-status">${this.anthropicBaseUrlDraft.trim() ? 'Set' : 'Using fallback'}</div>
              </div>
              <div class="field-help">Written into /config/.claude/settings.json under env.ANTHROPIC_BASE_URL.</div>
              <input
                class="text-input"
                type="text"
                placeholder="https://api.anthropic.com"
                .value=${this.anthropicBaseUrlDraft}
                @input=${(e: Event) => {
                  this.anthropicBaseUrlDraft = (e.target as HTMLInputElement).value
                  this.clearClaudeStatusMessage()
                }}
              />
            </div>

            <div class="field">
              <div class="field-top">
                <div class="field-title">Disable Nonessential Traffic</div>
                <div class="field-status">${this.trafficMode === 'inherit' ? 'Using fallback' : this.trafficMode === 'enabled' ? 'Enabled' : 'Disabled'}</div>
              </div>
              <div class="field-help">Controls CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC in settings.json env.</div>
              <div class="segmented" role="radiogroup" aria-label="Disable nonessential traffic">
                ${this.renderTrafficOption('Inherit', 'inherit')}
                ${this.renderTrafficOption('Enabled', 'enabled')}
                ${this.renderTrafficOption('Disabled', 'disabled')}
              </div>
            </div>
          </div>

          <div class="field-actions">
            <button
              class="btn"
              type="button"
              .disabled=${this.claudeSaving}
              @click=${() => void this.loadClaudeSettings()}
            >Reload</button>
            <button
              class="btn primary"
              type="button"
              .disabled=${this.claudeLoading || this.claudeSaving || !hasChanges}
              @click=${() => void this.saveSettings()}
            >${this.claudeSaving ? 'Saving...' : 'Save model settings'}</button>
          </div>

          ${this.claudeLoading
            ? html`<div class="feedback">Loading model settings...</div>`
            : nothing}
          ${this.claudeStatusMessage
            ? html`
                <div class="feedback ${this.claudeStatusTone === 'success' ? 'success' : ''} ${this.claudeStatusTone === 'error' ? 'error' : ''}">
                  ${this.claudeStatusMessage}
                </div>
              `
            : nothing}
        </div>
      </section>
    `
  }
}
