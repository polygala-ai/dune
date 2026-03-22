import { LitElement, html, css, nothing } from 'lit'
import { customElement, property } from 'lit/decorators.js'

export type StashItemState = 'stashed' | 'queued' | 'error'

export type StashItem = {
  clientRequestId: string
  content: string
  state: StashItemState
  createdAt: number
  queuedAt: number | null
  errorMessage: string | null
}

@customElement('agent-stash-strip')
export class AgentStashStrip extends LitElement {
  @property({ type: Array }) items: StashItem[] = []
  @property({ type: Boolean }) canSend = true

  static styles = css`
    :host {
      display: block;
    }

    .stash-strip {
      width: min(var(--content-max-width), 100%);
      margin: 0 auto 8px;
      display: grid;
      gap: 6px;
    }

    .stash-row {
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--border-primary) 72%, transparent);
      background: color-mix(in srgb, var(--bg-surface) 96%, transparent);
      padding: 9px 11px;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .stash-row.queued {
      background: color-mix(in srgb, var(--accent-soft) 58%, var(--bg-surface));
    }

    .stash-row.error {
      background: color-mix(in srgb, var(--error) 9%, var(--bg-surface));
      border-color: color-mix(in srgb, var(--error) 28%, transparent);
    }

    .stash-copy {
      min-width: 0;
      flex: 1;
      display: grid;
      gap: 4px;
    }

    .stash-head {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .stash-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
    }

    .stash-state {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .stash-content {
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-primary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .stash-error {
      font-size: 12px;
      color: var(--error);
    }

    .stash-action {
      border: 1px solid var(--control-border);
      border-radius: 10px;
      min-height: var(--control-height);
      padding: 0 10px;
      background: var(--control-bg);
      color: var(--text-primary);
      font-size: 11.5px;
      font-weight: 700;
      white-space: nowrap;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .stash-action:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .stash-action:not(:disabled):hover {
      background: var(--control-bg-hover);
      border-color: var(--border-primary);
      color: var(--text-primary);
    }

    .stash-action.passive {
      opacity: 0.72;
      cursor: default;
    }

    @media (max-width: 760px) {
      .stash-strip {
        width: calc(100% - 20px);
      }

      .stash-row {
        flex-direction: column;
      }

      .stash-action {
        align-self: flex-start;
      }
    }
  `

  private canSendItem(index: number): boolean {
    return this.canSend && !this.items.slice(0, index).some((item) => item.state === 'stashed' || item.state === 'error')
  }

  private handleSendNow(clientRequestId: string) {
    this.dispatchEvent(new CustomEvent('stash-send-now', {
      detail: { clientRequestId },
      bubbles: true,
      composed: true,
    }))
  }

  render() {
    if (this.items.length === 0) return nothing

    return html`
      <div class="stash-strip" role="status" aria-live="polite">
        ${this.items.map((item, index) => {
          const canSendNow = this.canSendItem(index)
          const stateLabel = item.state === 'queued'
            ? 'Queued behind the current run'
            : item.state === 'error'
              ? 'Send failed'
              : 'Saved while the agent is working'

          return html`
            <div class="stash-row ${item.state}">
              <div class="stash-copy">
                <div class="stash-head">
                  <span class="stash-label">Stashed</span>
                  <span class="stash-state">${stateLabel}</span>
                </div>
                <div class="stash-content">${item.content}</div>
                ${item.state === 'error' && item.errorMessage
                  ? html`<div class="stash-error">${item.errorMessage}</div>`
                  : nothing}
              </div>
              ${item.state === 'queued'
                ? html`<span class="stash-action passive">Queued...</span>`
                : html`
                    <button
                      class="stash-action"
                      type="button"
                      ?disabled=${!canSendNow}
                      @click=${() => this.handleSendNow(item.clientRequestId)}
                    >Send now</button>
                  `}
            </div>
          `
        })}
      </div>
    `
  }
}
