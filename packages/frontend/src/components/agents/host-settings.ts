import { LitElement, html, css, nothing } from 'lit'
import { customElement, property, state as litState } from 'lit/decorators.js'
import type { Agent } from '@dune/shared'
import * as api from '../../services/rpc.js'

type HostExecApprovalMode = Agent['hostOperatorApprovalMode']

const HOST_EXEC_APPROVAL_OPTIONS: Array<{ value: HostExecApprovalMode; label: string }> = [
  { value: 'approval-required', label: 'Require approval' },
  { value: 'dangerously-skip', label: 'Dangerously skip permissions' },
]

@customElement('agent-host-settings-panel')
export class AgentHostSettingsPanel extends LitElement {
  @property({ type: Object }) agent!: Agent

  @litState() private hostSettingsSaving = false
  @litState() private hostAppsDraft: string[] = []
  @litState() private hostPathsDraft: string[] = []
  @litState() private hostNewApp = ''
  @litState() private hostRunningApps: Array<{ bundleId: string; appName: string; pid: number; active: boolean }> = []
  @litState() private hostRunningAppsLoading = false
  @litState() private hostAppSearchFocused = false
  @litState() private hostExecApprovalConfirmOpen = false
  @litState() private hostExecApprovalDraft: HostExecApprovalMode | null = null
  @litState() private hostExecApprovalSaving = false

  static styles = css`
    :host {
      display: block;
    }

    .host-settings-popover {
      position: absolute;
      right: 0;
      left: 0;
      bottom: calc(100% + 8px);
      z-index: 82;
      max-width: 420px;
      margin-inline: auto;
      max-height: min(70vh, 520px);
      overflow-x: hidden;
      overflow-y: auto;
      border-radius: 16px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-elevated);
      box-shadow: var(--shadow-md);
      padding: 14px;
      display: grid;
      gap: 12px;
    }

    .host-settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .host-settings-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .host-settings-section {
      display: grid;
      gap: 8px;
      min-width: 0;
    }

    .host-settings-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .host-settings-help {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.45;
      overflow-wrap: break-word;
      word-break: break-word;
    }

    .host-settings-list {
      display: grid;
      gap: 6px;
      min-width: 0;
    }

    .host-settings-chip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-radius: 12px;
      background: var(--bg-surface);
      padding: 8px 10px;
      font-size: 12px;
      color: var(--text-primary);
      min-width: 0;
    }

    .host-settings-chip span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }

    .host-settings-chip button {
      flex-shrink: 0;
    }

    .host-settings-chip button,
    .host-settings-header button,
    .host-settings-row button,
    .host-settings-actions button {
      border: none;
      border-radius: 999px;
      background: var(--bg-hover);
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 600;
      padding: 7px 10px;
      cursor: pointer;
    }

    .host-settings-row {
      display: flex;
      gap: 8px;
    }

    .host-settings-row input {
      flex: 1;
      min-width: 0;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 12px;
      padding: 8px 10px;
    }

    .host-settings-select {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 600;
      padding: 8px 10px;
      cursor: pointer;
    }

    .host-settings-danger-confirm {
      display: grid;
      gap: 8px;
      margin-top: 4px;
      padding: 10px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--error) 6%, var(--bg-surface));
      border: 1px solid color-mix(in srgb, var(--error) 18%, transparent);
      min-width: 0;
    }

    .host-settings-danger-confirm .host-settings-help {
      color: var(--text-secondary);
    }

    .host-settings-danger-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .host-app-search {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 12px;
      padding: 8px 10px;
    }

    .host-app-search::placeholder {
      color: var(--text-muted);
    }

    .host-app-results {
      max-height: 180px;
      overflow-y: auto;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      background: var(--bg-primary);
    }

    .host-app-result-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      cursor: pointer;
      transition: background var(--transition-fast);
      min-width: 0;
    }

    .host-app-result-item:not(:last-child) {
      border-bottom: 1px solid var(--border-subtle);
    }

    .host-app-result-item:hover {
      background: var(--bg-hover);
    }

    .host-app-result-item.added {
      opacity: 0.5;
      cursor: default;
    }

    .host-app-result-info {
      display: flex;
      flex-direction: column;
      gap: 1px;
      min-width: 0;
    }

    .host-app-result-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .host-app-result-bundle {
      font-size: 11px;
      color: var(--text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .host-app-result-badge {
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .host-app-empty {
      padding: 12px 10px;
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
    }

    .host-app-add-manual {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      cursor: pointer;
      transition: background var(--transition-fast);
      color: var(--accent);
      font-size: 12px;
      font-weight: 600;
    }

    .host-app-add-manual:hover {
      background: var(--bg-hover);
    }

    .host-settings-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .host-settings-actions .primary {
      background: var(--accent);
      color: #fff;
    }
  `

  async openPanel() {
    this.hostAppsDraft = [...this.agent.hostOperatorApps]
    this.hostPathsDraft = [...this.agent.hostOperatorPaths]
    this.hostNewApp = ''
    this.hostRunningAppsLoading = true
    try {
      const response = await api.listRunningHostOperatorAppsAdmin()
      this.hostRunningApps = response.apps
    } catch (err) {
      console.error('Failed to load running host apps:', err)
      this.hostRunningApps = []
    } finally {
      this.hostRunningAppsLoading = false
    }
  }

  resetState() {
    this.hostExecApprovalConfirmOpen = false
    this.hostExecApprovalDraft = null
    this.hostExecApprovalSaving = false
    this.hostSettingsSaving = false
    this.hostAppsDraft = [...(this.agent?.hostOperatorApps || [])]
    this.hostPathsDraft = [...(this.agent?.hostOperatorPaths || [])]
    this.hostNewApp = ''
    this.hostAppSearchFocused = false
  }

  private get hostExecApprovalValue(): HostExecApprovalMode {
    return this.hostExecApprovalDraft ?? this.agent.hostOperatorApprovalMode
  }

  private handleHostExecApprovalChange(event: Event) {
    const nextMode = (event.target as HTMLSelectElement).value as HostExecApprovalMode
    if (nextMode === this.agent.hostOperatorApprovalMode) {
      this.hostExecApprovalConfirmOpen = false
      this.hostExecApprovalDraft = null
      return
    }
    if (nextMode === 'dangerously-skip') {
      this.hostExecApprovalDraft = nextMode
      this.hostExecApprovalConfirmOpen = true
      return
    }
    this.hostExecApprovalConfirmOpen = false
    this.hostExecApprovalDraft = null
    void this.saveHostExecApprovalMode(nextMode)
  }

  private cancelHostExecApprovalConfirm() {
    if (this.hostExecApprovalSaving) return
    this.hostExecApprovalConfirmOpen = false
    this.hostExecApprovalDraft = null
  }

  private confirmHostExecApprovalChange() {
    if (this.hostExecApprovalDraft !== 'dangerously-skip') return
    void this.saveHostExecApprovalMode(this.hostExecApprovalDraft)
  }

  private async saveHostExecApprovalMode(nextMode: HostExecApprovalMode) {
    if (!this.agent || this.hostExecApprovalSaving) return
    if (nextMode === this.agent.hostOperatorApprovalMode) {
      this.hostExecApprovalConfirmOpen = false
      this.hostExecApprovalDraft = null
      return
    }

    this.hostExecApprovalSaving = true
    try {
      const updated = await api.updateAgent(this.agent.id, { hostOperatorApprovalMode: nextMode })
      this.dispatchEvent(new CustomEvent('agent-updated', {
        detail: updated,
        bubbles: true,
        composed: true,
      }))
      this.hostExecApprovalConfirmOpen = false
      this.hostExecApprovalDraft = null
    } catch (err) {
      console.error('Failed to update host exec approval mode:', err)
      this.hostExecApprovalConfirmOpen = false
      this.hostExecApprovalDraft = null
    } finally {
      this.hostExecApprovalSaving = false
    }
  }

  private handleClose() {
    if (this.hostSettingsSaving) return
    this.hostNewApp = ''
    this.hostAppSearchFocused = false
    this.dispatchEvent(new CustomEvent('host-settings-close', { bubbles: true, composed: true }))
  }

  private handleHostNewAppInput(event: Event) {
    this.hostNewApp = (event.target as HTMLInputElement).value
  }

  private get filteredHostApps() {
    const query = this.hostNewApp.trim().toLowerCase()
    const filtered = query
      ? this.hostRunningApps.filter((app) =>
          app.appName.toLowerCase().includes(query) || app.bundleId.toLowerCase().includes(query))
      : this.hostRunningApps
    return filtered.slice().sort((a, b) => {
      const aAdded = this.hostAppsDraft.includes(a.bundleId) ? 1 : 0
      const bAdded = this.hostAppsDraft.includes(b.bundleId) ? 1 : 0
      if (aAdded !== bAdded) return aAdded - bAdded
      return a.appName.localeCompare(b.appName)
    })
  }

  private get hostSearchHasExactMatch() {
    const query = this.hostNewApp.trim().toLowerCase()
    if (!query) return true
    return this.hostRunningApps.some((app) =>
      app.bundleId.toLowerCase() === query || app.appName.toLowerCase() === query)
  }

  private addHostApp(bundleId: string) {
    const normalized = bundleId.trim()
    if (!normalized) return
    if (!this.hostAppsDraft.includes(normalized)) {
      this.hostAppsDraft = [...this.hostAppsDraft, normalized].sort((a, b) => a.localeCompare(b))
    }
    this.hostNewApp = ''
  }

  private removeHostApp(bundleId: string) {
    this.hostAppsDraft = this.hostAppsDraft.filter((item) => item !== bundleId)
  }

  private removeHostPath(path: string) {
    this.hostPathsDraft = this.hostPathsDraft.filter((item) => item !== path)
  }

  private async handleAddHostPath() {
    try {
      const result = await api.selectAgentMountHostDirectory(this.agent.id)
      if (result.status !== 'selected') return
      if (!this.hostPathsDraft.includes(result.hostPath)) {
        this.hostPathsDraft = [...this.hostPathsDraft, result.hostPath].sort((a, b) => a.localeCompare(b))
      }
    } catch (err) {
      console.error('Failed to pick host operator path:', err)
    }
  }

  private async saveHostSettings() {
    if (this.hostSettingsSaving) return
    this.hostSettingsSaving = true
    try {
      const updated = await api.updateAgent(this.agent.id, {
        hostOperatorApps: this.hostAppsDraft,
        hostOperatorPaths: this.hostPathsDraft,
      })
      this.dispatchEvent(new CustomEvent('agent-updated', {
        detail: updated,
        bubbles: true,
        composed: true,
      }))
      this.dispatchEvent(new CustomEvent('host-settings-close', { bubbles: true, composed: true }))
    } catch (err) {
      console.error('Failed to save host operator settings:', err)
    } finally {
      this.hostSettingsSaving = false
    }
  }

  render() {
    return html`
      <div class="host-settings-popover" role="dialog" aria-label="Host operator settings">
        <div class="host-settings-header">
          <div class="host-settings-title">Host Operator Settings</div>
          <button type="button" @click=${this.handleClose}>Close</button>
        </div>

        <div class="host-settings-section">
          <div class="host-settings-label">Approval Mode</div>
          <select
            class="host-settings-select"
            .value=${this.hostExecApprovalValue}
            ?disabled=${this.hostExecApprovalSaving}
            @change=${this.handleHostExecApprovalChange}
          >
            ${HOST_EXEC_APPROVAL_OPTIONS.map((option) => html`
              <option value=${option.value}>${option.label}</option>
            `)}
          </select>
          ${this.hostExecApprovalConfirmOpen ? html`
            <div class="host-settings-danger-confirm">
              <div class="host-settings-help">
                Future host operator requests for ${this.agent.name} will run without human approval. Existing pending requests will also auto-approve immediately.
              </div>
              <div class="host-settings-danger-actions">
                <button type="button" ?disabled=${this.hostExecApprovalSaving} @click=${this.cancelHostExecApprovalConfirm}>Cancel</button>
                <button type="button" style="background: color-mix(in srgb, var(--error) 14%, var(--bg-surface)); color: var(--error);" ?disabled=${this.hostExecApprovalSaving} @click=${this.confirmHostExecApprovalChange}>
                  ${this.hostExecApprovalSaving ? 'Saving...' : 'Enable'}
                </button>
              </div>
            </div>
          ` : nothing}
        </div>

        <div class="host-settings-section">
          <div class="host-settings-label">Allowed Apps</div>
          <div class="host-settings-help">Bundle IDs are enforced before any request enters the approval queue.</div>
          <input
            class="host-app-search"
            type="search"
            .value=${this.hostNewApp}
            @input=${this.handleHostNewAppInput}
            @focus=${() => { this.hostAppSearchFocused = true }}
            @blur=${() => { setTimeout(() => { this.hostAppSearchFocused = false }, 150) }}
            placeholder="Search running apps..."
          />
          ${this.hostAppSearchFocused || this.hostNewApp.trim() ? html`
            <div class="host-app-results">
              ${this.hostRunningAppsLoading
                ? html`<div class="host-app-empty">Loading apps...</div>`
                : html`
                  ${this.filteredHostApps.map((app) => {
                      const isAdded = this.hostAppsDraft.includes(app.bundleId)
                      return html`
                        <div
                          class="host-app-result-item ${isAdded ? 'added' : ''}"
                          @click=${() => !isAdded && this.addHostApp(app.bundleId)}
                        >
                          <div class="host-app-result-info">
                            <div class="host-app-result-name">${app.appName}</div>
                            <div class="host-app-result-bundle">${app.bundleId}</div>
                          </div>
                          ${isAdded ? html`<span class="host-app-result-badge">Added</span>` : nothing}
                        </div>
                      `
                    })}
                  ${this.hostNewApp.trim() && !this.hostSearchHasExactMatch
                    ? html`
                      <div class="host-app-add-manual" @click=${() => this.addHostApp(this.hostNewApp)}>
                        Add "${this.hostNewApp.trim()}"
                      </div>
                    `
                    : nothing}
                  ${this.filteredHostApps.length === 0 && !this.hostNewApp.trim()
                    ? html`<div class="host-app-empty">No running apps detected.</div>`
                    : nothing}
                  ${this.filteredHostApps.length === 0 && this.hostNewApp.trim() && this.hostSearchHasExactMatch
                    ? html`<div class="host-app-empty">No matching apps.</div>`
                    : nothing}
                `}
            </div>
          ` : nothing}
          <div class="host-settings-list">
            ${this.hostAppsDraft.length === 0
              ? html`<div class="host-settings-help">No allowed apps configured.</div>`
              : this.hostAppsDraft.map((bundleId) => html`
                  <div class="host-settings-chip">
                    <span>${bundleId}</span>
                    <button type="button" @click=${() => this.removeHostApp(bundleId)}>Remove</button>
                  </div>
                `)}
          </div>
        </div>

        <div class="host-settings-section">
          <div class="host-settings-label">Allowed Paths</div>
          <div class="host-settings-help">Filesystem operations are limited to these absolute host roots.</div>
          <div class="host-settings-row">
            <button type="button" @click=${this.handleAddHostPath}>Add folder</button>
          </div>
          <div class="host-settings-list">
            ${this.hostPathsDraft.length === 0
              ? html`<div class="host-settings-help">No allowed paths configured.</div>`
              : this.hostPathsDraft.map((path) => html`
                  <div class="host-settings-chip">
                    <span>${path}</span>
                    <button type="button" @click=${() => this.removeHostPath(path)}>Remove</button>
                  </div>
                `)}
          </div>
        </div>

        <div class="host-settings-actions">
          <button type="button" @click=${this.handleClose}>Cancel</button>
          <button class="primary" type="button" ?disabled=${this.hostSettingsSaving} @click=${this.saveHostSettings}>
            ${this.hostSettingsSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    `
  }
}
