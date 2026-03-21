import { LitElement, css, html } from 'lit'
import { customElement, property, state as litState } from 'lit/decorators.js'
import type { BoxResource, ExecEvent, ExecResource } from '@dune/shared'
import * as api from '../../services/rpc.js'
import { panelStyles } from './view.css.js'

@customElement('sandbox-execs-tab')
export class SandboxExecsTab extends LitElement {
  @property({ type: Object }) box!: BoxResource
  @property({ type: Boolean }) readOnly = false

  @litState() private execCommand = 'echo sandbox-ready'
  @litState() private execRunning = false
  @litState() private execs: ExecResource[] = []
  @litState() private selectedExecId: string | null = null
  @litState() private execEvents: ExecEvent[] = []
  @litState() private execError = ''

  private lastBoxId: string | null = null

  static styles = [
    panelStyles,
    css`
      :host { display: block; }

      .exec-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 190px;
        overflow: auto;
      }

      .exec-row {
        border: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
        border-radius: 9px;
        background: color-mix(in srgb, var(--bg-surface) 74%, transparent);
        padding: 8px;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        transition: background var(--transition-fast), border-color var(--transition-fast);
      }

      .exec-row:hover {
        border-color: color-mix(in srgb, var(--text-muted) 28%, transparent);
        background: color-mix(in srgb, var(--bg-hover) 70%, transparent);
      }

      .exec-row.active {
        border-color: color-mix(in srgb, var(--accent) 35%, transparent);
        background: color-mix(in srgb, var(--accent) 9%, transparent);
      }

      .exec-command {
        font-size: 12px;
        color: var(--text-primary);
        font-family: var(--font-mono);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .exec-status {
        font-size: 11px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 700;
      }

      .log {
        border: 1px solid color-mix(in srgb, var(--text-muted) 16%, transparent);
        border-radius: 10px;
        background: color-mix(in srgb, var(--bg-surface) 84%, transparent);
        min-height: 160px;
        max-height: 260px;
        overflow: auto;
        padding: 10px;
        font-size: 12px;
        line-height: 1.4;
        color: var(--text-secondary);
        font-family: var(--font-mono);
        white-space: pre-wrap;
        word-break: break-word;
      }
    `,
  ]

  willUpdate() {
    if (this.box && this.box.boxId !== this.lastBoxId) {
      this.lastBoxId = this.box.boxId
      this.execs = []
      this.selectedExecId = null
      this.execEvents = []
      this.execError = ''
    }
  }

  async refreshData(resetEvents = false) {
    if (!this.box) return
    try {
      const result = await api.listExecs(this.box.boxId)
      this.execs = result.execs

      if (!this.selectedExecId && this.execs.length > 0) {
        this.selectedExecId = this.execs[0].executionId
        resetEvents = true
      }

      if (this.selectedExecId) {
        const afterSeq = resetEvents || this.execEvents.length === 0
          ? 0
          : this.execEvents[this.execEvents.length - 1].seq
        const events = await api.getExecEvents(this.box.boxId, this.selectedExecId, afterSeq, 500)

        if (afterSeq === 0) {
          this.execEvents = events
        } else if (events.length > 0) {
          this.execEvents = [...this.execEvents, ...events]
        }
      }

      this.execError = ''
    } catch (err: any) {
      this.execError = err?.message || 'Failed to load executions'
    }
  }

  private async handleRunExec() {
    if (!this.box || this.readOnly) return
    const command = this.execCommand.trim()
    if (!command) return

    this.execRunning = true
    this.execError = ''
    try {
      const created = await api.createExec(this.box.boxId, {
        command: 'bash',
        args: ['-lc', command],
      })
      this.selectedExecId = created.executionId
      this.execEvents = []
      await this.refreshData(true)
    } catch (err: any) {
      this.execError = err?.message || 'Failed to run command'
    } finally {
      this.execRunning = false
    }
  }

  render() {
    if (!this.box) return html``

    return html`
      <section class="panel">
        <div class="panel-title">Run Command</div>
        ${this.execError ? html`<div class="error">${this.execError}</div>` : ''}
        <label class="field">
          <span class="label">Command</span>
          <input
            class="input"
            .value=${this.execCommand}
            @input=${(e: Event) => { this.execCommand = (e.target as HTMLInputElement).value }}
            placeholder="pnpm test"
            ?disabled=${this.readOnly}
          />
        </label>
        <div class="modal-actions">
          <button class="btn primary" type="button" @click=${this.handleRunExec} ?disabled=${this.readOnly || this.execRunning}>Run</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">Executions</div>
        ${this.execs.length === 0
          ? html`<div class="meta-text">No executions yet.</div>`
          : html`<div class="exec-list">
              ${this.execs.map((exec) => html`
                <button
                  class="exec-row ${this.selectedExecId === exec.executionId ? 'active' : ''}"
                  type="button"
                  @click=${() => {
                    this.selectedExecId = exec.executionId
                    this.execEvents = []
                    void this.refreshData(true)
                  }}
                >
                  <div class="exec-command">${exec.command} ${exec.args.join(' ')}</div>
                  <div class="exec-status">${exec.status}</div>
                </button>
              `)}
            </div>`}
      </section>

      <section class="panel">
        <div class="panel-title">Events</div>
        <div class="log">${this.execEvents.length > 0
          ? this.execEvents.map((event) => `[${event.seq}] ${event.eventType}: ${event.data}`).join('\n')
          : 'No events yet.'}</div>
      </section>
    `
  }
}
