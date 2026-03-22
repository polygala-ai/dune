import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { Agent } from '@dune/shared'
import * as api from '../../services/rpc.js'
import { profilePanelStyles } from './profile-panel.css.js'

type SkillInfo = { name: string; description: string; preview: string; scripts: string[]; markdown: string }

@customElement('agent-skills-tab')
export class AgentSkillsTab extends LitElement {
  @property({ type: Object }) agent: Agent | null = null

  @state() private skills: SkillInfo[] = []
  @state() private skillsLoaded = false
  @state() private expandedSkillDocs = new Set<string>()

  static styles = profilePanelStyles

  override updated(changed: Map<string, unknown>) {
    if (changed.has('agent') && this.agent) {
      this.skillsLoaded = false
      this.expandedSkillDocs = new Set<string>()
      this.loadSkills()
    }
  }

  private async loadSkills() {
    if (!this.agent || this.skillsLoaded) return
    try {
      this.skills = await api.getAgentSkills(this.agent.id)
    } catch {
      this.skills = []
    } finally {
      this.skillsLoaded = true
    }
  }

  private toggleSkillDoc(skillName: string) {
    const next = new Set(this.expandedSkillDocs)
    if (next.has(skillName)) {
      next.delete(skillName)
    } else {
      next.add(skillName)
    }
    this.expandedSkillDocs = next
  }

  render() {
    if (!this.skillsLoaded) {
      return html`<div class="section-card"><p class="empty">Loading skills...</p></div>`
    }

    if (this.skills.length === 0) {
      return html`<div class="section-card"><p class="empty">No skills available.</p></div>`
    }

    return html`
      <div class="skill-info-banner">
        All skills are shared across agents. Skills provide communication, sandbox, miniapp, and team management capabilities.
      </div>
      ${this.skills.map(skill => html`
        <div class="skill-card">
          <div class="skill-name">${skill.name}</div>
          ${skill.description ? html`<div class="skill-desc">${skill.description}</div>` : nothing}
          <div class="skill-preview">${skill.preview || skill.description || 'No preview available.'}</div>
          ${skill.scripts.length > 0 ? html`
            <div class="skill-scripts">
              ${skill.scripts.map(s => html`<span class="script-tag">${s}</span>`)}
            </div>
          ` : nothing}
          <button class="skill-viewer-btn" @click=${() => this.toggleSkillDoc(skill.name)}>
            ${this.expandedSkillDocs.has(skill.name) ? 'Hide SKILL.md' : 'View SKILL.md'}
          </button>
          ${this.expandedSkillDocs.has(skill.name)
            ? html`<pre class="skill-markdown">${skill.markdown || '(SKILL.md not found)'}</pre>`
            : nothing}
        </div>
      `)}
    `
  }
}
