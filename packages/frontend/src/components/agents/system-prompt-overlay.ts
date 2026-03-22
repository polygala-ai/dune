import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import * as api from '../../services/rpc.js'
import { profilePanelStyles } from './profile-panel.css.js'

@customElement('agent-system-prompt-overlay')
export class AgentSystemPromptOverlay extends LitElement {
  @property({ type: String }) agentId = ''

  @state() private systemPrompt = ''
  @state() private loading = false

  static styles = profilePanelStyles

  override updated(changed: Map<string, unknown>) {
    if (changed.has('agentId') && this.agentId) {
      this.loadPrompt()
    }
  }

  private async loadPrompt() {
    this.loading = true
    try {
      const result = await api.getAgentSystemPrompt(this.agentId)
      this.systemPrompt = result.prompt
    } catch {
      this.systemPrompt = '(Failed to load system prompt)'
    } finally {
      this.loading = false
    }
  }

  private handleClose() {
    this.dispatchEvent(new CustomEvent('close-prompt', {
      bubbles: true, composed: true,
    }))
  }

  render() {
    return html`
      <div class="prompt-overlay">
        <div class="prompt-header">
          <span class="prompt-title">System Prompt</span>
          <button class="close-btn" @click=${this.handleClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke-linecap="round"></path>
            </svg>
          </button>
        </div>
        <div class="prompt-body">
          ${this.loading
            ? html`<p class="empty">Loading...</p>`
            : html`<pre class="prompt-text">${this.systemPrompt}</pre>`
          }
        </div>
      </div>
    `
  }
}
