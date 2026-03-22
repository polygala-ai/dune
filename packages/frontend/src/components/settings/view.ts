import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { ClaudeSettings } from '@dune/shared'
import type { ThemeMode } from '../../state/ui-preferences.js'
import { settingsViewStyles } from './view.css.js'
import { iconChevronLeft, iconMenu, iconBox, iconLink } from '../../utils/icons.js'
import './model-section.js'
import './slack-section.js'

type SettingsSection = 'general' | 'model' | 'integrations'

@customElement('settings-view')
export class SettingsView extends LitElement {
  @property() themeMode: ThemeMode = 'system'
  @property({ attribute: false }) initialSection: SettingsSection = 'general'

  @state() private activeSection: SettingsSection = 'general'

  static styles = settingsViewStyles

  override willUpdate(changed: Map<string, unknown>) {
    if (changed.has('initialSection')) {
      this.activeSection = this.initialSection
    }
  }

  private closeSettings() {
    this.dispatchEvent(new CustomEvent('close-settings', {
      bubbles: true,
      composed: true,
    }))
  }

  private emitThemeMode(value: ThemeMode) {
    this.dispatchEvent(new CustomEvent<ThemeMode>('theme-mode-change', {
      detail: value,
      bubbles: true,
      composed: true,
    }))
  }

  private setActiveSection(section: SettingsSection) {
    this.activeSection = section
  }

  private renderThemeSegment(label: string, value: ThemeMode) {
    const active = value === this.themeMode
    return html`
      <button
        class="segment ${active ? 'active' : ''}"
        type="button"
        aria-pressed=${active}
        @click=${() => this.emitThemeMode(value)}
      >${label}</button>
    `
  }

  private renderGeneralSection() {
    return html`
      <section class="section">
        <h2 class="section-title">General</h2>
        <div class="card">
          <div class="row">
            <div class="row-copy">
              <div class="row-label">Theme</div>
              <p class="row-sub">Use light, dark, or follow your system preference.</p>
            </div>
            <div class="segmented" role="radiogroup" aria-label="Theme mode">
              ${this.renderThemeSegment('Light', 'light')}
              ${this.renderThemeSegment('Dark', 'dark')}
              ${this.renderThemeSegment('System', 'system')}
            </div>
          </div>
        </div>
      </section>
    `
  }

  private handleSettingsSaved(e: CustomEvent<ClaudeSettings>) {
    this.dispatchEvent(new CustomEvent<ClaudeSettings>('settings-saved', {
      detail: e.detail,
      bubbles: true,
      composed: true,
    }))
  }

  override render() {
    const isGeneral = this.activeSection === 'general'
    const isModel = this.activeSection === 'model'

    return html`
      <div class="layout">
        <aside class="nav" aria-label="Settings navigation">
          <button class="back-btn" type="button" @click=${this.closeSettings}>
            ${iconChevronLeft()}
            <span>Back to app</span>
          </button>

          <div class="nav-list">
            <button
              class="nav-item ${isGeneral ? 'active' : ''}"
              type="button"
              aria-current=${isGeneral ? 'page' : 'false'}
              @click=${() => this.setActiveSection('general')}
            >
              ${iconMenu()}
              <span>General</span>
            </button>
            <button
              class="nav-item ${isModel ? 'active' : ''}"
              type="button"
              aria-current=${isModel ? 'page' : 'false'}
              @click=${() => this.setActiveSection('model')}
            >
              ${iconBox()}
              <span>Model</span>
            </button>
            <button
              class="nav-item ${this.activeSection === 'integrations' ? 'active' : ''}"
              type="button"
              aria-current=${this.activeSection === 'integrations' ? 'page' : 'false'}
              @click=${() => this.setActiveSection('integrations')}
            >
              ${iconLink()}
              <span>Integrations</span>
            </button>
          </div>
        </aside>

        <main class="content">
          <div class="top">
            <h1 class="title">Settings</h1>
          </div>
          ${this.activeSection === 'general'
            ? this.renderGeneralSection()
            : this.activeSection === 'model'
              ? html`<settings-model-section @settings-saved=${this.handleSettingsSaved}></settings-model-section>`
              : html`<settings-slack-section></settings-slack-section>`}
        </main>
      </div>
    `
  }
}
