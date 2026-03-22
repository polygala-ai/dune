import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { Agent, Channel } from '@dune/shared'
import * as api from '../../services/rpc.js'
import { profilePanelStyles } from './profile-panel.css.js'
import { iconFileText } from '../../utils/icons.js'

const AVATAR_COLORS = ['#0f9a90', '#0ea5e9', '#3b82f6', '#6d28d9', '#ef4444', '#f97316', '#10b981', '#64748b']

@customElement('agent-profile-tab')
export class AgentProfileTab extends LitElement {
  @property({ type: Object }) agent: Agent | null = null
  @property({ type: Array }) channels: Channel[] = []

  @state() private subscriptions: string[] = []
  @state() private editPersonality = ''
  @state() private personalityDirty = false
  @state() private editColor = ''
  @state() private editRole: Agent['role'] = 'follower'
  @state() private editWorkMode: Agent['workMode'] = 'normal'
  @state() private editModelIdOverride: Agent['modelIdOverride'] = null
  @state() private saving = false

  static styles = profilePanelStyles

  override updated(changed: Map<string, unknown>) {
    if (changed.has('agent') && this.agent) {
      this.editPersonality = this.agent.personality
      this.editColor = this.agent.avatarColor
      this.editRole = this.agent.role
      this.editWorkMode = this.agent.workMode
      this.editModelIdOverride = this.agent.modelIdOverride
      this.personalityDirty = false
      this.loadSubscriptions()
    }
  }

  private async loadSubscriptions() {
    if (!this.agent) return
    try {
      this.subscriptions = await api.getAgentSubscriptions(this.agent.id)
    } catch {
      this.subscriptions = []
    }
  }

  private handlePersonalityInput(e: Event) {
    const textarea = e.target as HTMLTextAreaElement
    this.editPersonality = textarea.value
    this.personalityDirty = this.editPersonality !== this.agent?.personality
  }

  private async savePersonality() {
    if (!this.agent || !this.personalityDirty) return
    await this.saveField({ personality: this.editPersonality })
    this.personalityDirty = false
  }

  private async selectColor(color: string) {
    if (!this.agent || color === this.editColor) return
    this.editColor = color
    await this.saveField({ avatarColor: color })
  }

  private async selectRole(role: Agent['role']) {
    if (!this.agent || role === this.editRole) return
    this.editRole = role
    await this.saveField({ role })
  }

  private async selectWorkMode(workMode: Agent['workMode']) {
    if (!this.agent || workMode === this.editWorkMode) return
    this.editWorkMode = workMode
    await this.saveField({ workMode })
  }

  private async selectModelIdOverride(modelIdOverride: Agent['modelIdOverride']) {
    if (!this.agent || modelIdOverride === this.editModelIdOverride) return
    this.editModelIdOverride = modelIdOverride
    await this.saveField({ modelIdOverride })
  }

  private async saveField(data: Partial<{
    personality: string
    role: Agent['role']
    workMode: Agent['workMode']
    modelIdOverride: Agent['modelIdOverride']
    avatarColor: string
  }>) {
    if (!this.agent) return
    this.saving = true
    try {
      const updated = await api.updateAgent(this.agent.id, data)
      this.dispatchEvent(new CustomEvent('agent-updated', {
        detail: updated, bubbles: true, composed: true,
      }))
    } catch (err) {
      console.error('Failed to update agent:', err)
    } finally {
      this.saving = false
    }
  }

  private async handleUnsubscribe(channelId: string) {
    if (!this.agent) return
    try {
      await api.unsubscribeAgentFromChannel(channelId, this.agent.id)
      this.subscriptions = this.subscriptions.filter(id => id !== channelId)
    } catch (err) {
      console.error('Failed to unsubscribe:', err)
    }
  }

  private formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    })
  }

  private formatRoleLabel(role: Agent['role']): string {
    return role === 'leader' ? 'Leader' : 'Follower'
  }

  private formatWorkModeLabel(workMode: Agent['workMode']): string {
    return workMode === 'plan-first' ? 'Plan First' : 'Normal'
  }

  private formatModelOverrideLabel(modelIdOverride: Agent['modelIdOverride']): string {
    return modelIdOverride || 'Workspace default'
  }

  private handleViewSystemPrompt() {
    this.dispatchEvent(new CustomEvent('view-system-prompt', {
      bubbles: true, composed: true,
    }))
  }

  render() {
    const a = this.agent
    if (!a) return html``

    const channelNames = this.subscriptions
      .map(id => {
        const ch = this.channels.find(c => c.id === id)
        return ch ? { id, name: ch.name } : null
      })
      .filter(Boolean) as Array<{ id: string; name: string }>

    return html`
      <div class="section-card">
        <div class="section-title">Role</div>
        <div class="role-picker">
          ${[
            { id: 'leader', title: 'Leader', copy: 'Plans next steps and keeps nextPlan current.' },
            { id: 'follower', title: 'Follower', copy: 'Preserves the original request and tracks progress.' },
          ].map(role => html`
            <button
              class="role-option ${role.id === this.editRole ? 'selected' : ''}"
              @click=${() => this.selectRole(role.id as Agent['role'])}
              ?disabled=${this.saving}
            >
              <div class="role-option-title">${role.title}</div>
              <div class="role-option-copy">${role.copy}</div>
            </button>
          `)}
        </div>
      </div>

      <div class="section-card">
        <div class="section-title">Work Mode</div>
        <div class="role-picker">
          ${[
            { id: 'plan-first', title: 'Plan First', copy: 'Inspect the state and build a concrete plan before multi-step work.' },
            { id: 'normal', title: 'Normal', copy: 'Act directly once enough context has been gathered.' },
          ].map(mode => html`
            <button
              class="role-option ${mode.id === this.editWorkMode ? 'selected' : ''}"
              @click=${() => this.selectWorkMode(mode.id as Agent['workMode'])}
              ?disabled=${this.saving}
            >
              <div class="role-option-title">${mode.title}</div>
              <div class="role-option-copy">${mode.copy}</div>
            </button>
          `)}
        </div>
      </div>

      <div class="section-card">
        <div class="section-title">Claude Model</div>
        <div class="role-picker">
          ${[
            { id: null, title: 'Inherit', copy: 'Use the workspace default Claude model.' },
            { id: 'opus', title: 'Opus', copy: 'Use the Opus alias for this agent.' },
            { id: 'sonnet', title: 'Sonnet', copy: 'Use the Sonnet alias for this agent.' },
            { id: 'haiku', title: 'Haiku', copy: 'Use the Haiku alias for this agent.' },
          ].map(model => html`
            <button
              class="role-option ${model.id === this.editModelIdOverride ? 'selected' : ''}"
              @click=${() => this.selectModelIdOverride(model.id as Agent['modelIdOverride'])}
              ?disabled=${this.saving}
            >
              <div class="role-option-title">${model.title}</div>
              <div class="role-option-copy">${model.copy}</div>
            </button>
          `)}
        </div>
      </div>

      <div class="section-card">
        <div class="section-title">Avatar Color</div>
        <div class="color-picker">
          ${AVATAR_COLORS.map(c => html`
            <button
              class="color-swatch ${c === this.editColor ? 'selected' : ''}"
              style="background: ${c}"
              @click=${() => this.selectColor(c)}
            ></button>
          `)}
        </div>
      </div>

      <div class="section-card">
        <div class="section-title">Personality</div>
        <textarea
          class="personality-textarea"
          .value=${this.editPersonality}
          @input=${this.handlePersonalityInput}
        ></textarea>
        ${this.personalityDirty ? html`
          <div class="save-row">
            <button class="action-btn" @click=${() => { this.editPersonality = a.personality; this.personalityDirty = false }}>Cancel</button>
            <button class="action-btn primary" @click=${this.savePersonality} ?disabled=${this.saving}>Save</button>
          </div>
        ` : nothing}
      </div>

      <div class="section-card">
        <div class="section-title">Created</div>
        <p class="section-content">${this.formatDate(a.createdAt)}</p>
      </div>

      <div class="section-card">
        <div class="section-title">Current Role</div>
        <p class="section-content">${this.formatRoleLabel(a.role)}</p>
      </div>

      <div class="section-card">
        <div class="section-title">Current Work Mode</div>
        <p class="section-content">${this.formatWorkModeLabel(a.workMode)}</p>
      </div>

      <div class="section-card">
        <div class="section-title">Current Claude Model</div>
        <p class="section-content">${this.formatModelOverrideLabel(a.modelIdOverride)}</p>
      </div>

      <div class="section-card">
        <div class="section-title">Channels</div>
        ${channelNames.length > 0
          ? channelNames.map(ch => html`
            <div class="channel-item">
              <span># ${ch.name}</span>
              <button class="channel-remove-btn" @click=${() => this.handleUnsubscribe(ch.id)} title="Unsubscribe">✕</button>
            </div>
          `)
          : html`<p class="empty">No channels</p>`
        }
      </div>

      <div class="section-card">
        <button class="action-btn" @click=${this.handleViewSystemPrompt}>
          ${iconFileText()}
          <span>View System Prompt</span>
        </button>
      </div>
    `
  }
}
