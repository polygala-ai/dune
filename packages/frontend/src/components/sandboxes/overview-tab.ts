import { LitElement, css, html } from 'lit'
import { customElement, property, state as litState } from 'lit/decorators.js'
import type { BoxResource } from '@dune/shared'
import * as api from '../../services/rpc.js'
import { panelStyles } from './view.css.js'

type SandboxDurability = 'ephemeral' | 'persistent'

@customElement('sandbox-overview-tab')
export class SandboxOverviewTab extends LitElement {
  @property({ type: Object }) box!: BoxResource
  @property({ type: Boolean }) readOnly = false

  @litState() private updateError = ''
  @litState() private updateName = ''
  @litState() private updateDurability: SandboxDurability = 'persistent'

  private lastBoxId: string | null = null

  static styles = [
    panelStyles,
    css`
      :host { display: block; }

      .overview-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .overview-item {
        border-radius: 10px;
        padding: 8px;
        background: color-mix(in srgb, var(--bg-surface) 85%, transparent);
        border: 1px solid color-mix(in srgb, var(--text-muted) 12%, transparent);
      }

      .overview-key {
        font-size: 11px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 700;
      }

      .overview-value {
        margin-top: 4px;
        font-size: 13px;
        color: var(--text-primary);
        word-break: break-word;
      }

      @media (max-width: 1020px) {
        .overview-grid { grid-template-columns: 1fr; }
      }
    `,
  ]

  willUpdate() {
    if (this.box && this.box.boxId !== this.lastBoxId) {
      this.lastBoxId = this.box.boxId
      this.updateName = this.box.name || ''
      this.updateDurability = this.box.durability
      this.updateError = ''
    }
  }

  private formatDate(ts: number | null): string {
    if (!ts) return 'n/a'
    return new Date(ts).toLocaleString()
  }

  private async handleSaveOverview() {
    if (!this.box || this.readOnly) return
    this.updateError = ''
    try {
      await api.patchBox(this.box.boxId, {
        name: this.updateName.trim() || '',
        durability: this.updateDurability,
      })
      this.dispatchEvent(new CustomEvent('sandbox-refresh', { bubbles: true, composed: true }))
    } catch (err: any) {
      this.updateError = err?.message || 'Failed to update sandbox'
    }
  }

  render() {
    const box = this.box
    if (!box) return html``

    return html`
      <section class="panel">
        <div class="panel-title">Overview</div>
        <div class="overview-grid">
          <div class="overview-item">
            <div class="overview-key">Box ID</div>
            <div class="overview-value">${box.boxId}</div>
          </div>
          <div class="overview-item">
            <div class="overview-key">Status</div>
            <div class="overview-value">${box.status}</div>
          </div>
          <div class="overview-item">
            <div class="overview-key">Durability</div>
            <div class="overview-value">${box.durability}</div>
          </div>
          <div class="overview-item">
            <div class="overview-key">Image</div>
            <div class="overview-value">${box.image}</div>
          </div>
          <div class="overview-item">
            <div class="overview-key">Started</div>
            <div class="overview-value">${this.formatDate(box.startedAt)}</div>
          </div>
          <div class="overview-item">
            <div class="overview-key">Stopped</div>
            <div class="overview-value">${this.formatDate(box.stoppedAt)}</div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">Edit</div>
        ${this.updateError ? html`<div class="error">${this.updateError}</div>` : ''}
        <label class="field">
          <span class="label">Name</span>
          <input class="input" .value=${this.updateName} @input=${(e: Event) => {
            this.updateName = (e.target as HTMLInputElement).value
          }} ?disabled=${this.readOnly} />
        </label>
        <label class="field">
          <span class="label">Durability</span>
          <select class="select" .value=${this.updateDurability} @change=${(e: Event) => {
            this.updateDurability = (e.target as HTMLSelectElement).value as SandboxDurability
          }} ?disabled=${this.readOnly}>
            <option value="persistent">persistent</option>
            <option value="ephemeral">ephemeral</option>
          </select>
        </label>
        <div class="modal-actions">
          <button class="btn primary" type="button" @click=${this.handleSaveOverview} ?disabled=${this.readOnly}>Save changes</button>
        </div>
      </section>
    `
  }
}
