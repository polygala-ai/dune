import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import type { ClaudeSettings } from '@dune/shared'
import type { ThemeMode } from '../../state/ui-preferences.js'
import { settingsViewStyles } from './view.css.js'
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
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 6 8 12l6 6" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            <span>Back to app</span>
          </button>

          <div class="nav-list">
            <button
              class="nav-item ${isGeneral ? 'active' : ''}"
              type="button"
              aria-current=${isGeneral ? 'page' : 'false'}
              @click=${() => this.setActiveSection('general')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round"></path>
              </svg>
              <span>General</span>
            </button>
            <button
              class="nav-item ${isModel ? 'active' : ''}"
              type="button"
              aria-current=${isModel ? 'page' : 'false'}
              @click=${() => this.setActiveSection('model')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 4 8 4-8 4-8-4 8-4Zm-8 4v8l8 4 8-4V8" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
              <span>Model</span>
            </button>
            <button
              class="nav-item ${this.activeSection === 'integrations' ? 'active' : ''}"
              type="button"
              aria-current=${this.activeSection === 'integrations' ? 'page' : 'false'}
              @click=${() => this.setActiveSection('integrations')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
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
