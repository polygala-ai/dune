import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'
import type { HostOperatorRequest } from '@dune/shared'

@customElement('host-approval-modal')
export class HostApprovalModal extends LitElement {
  @property({ type: Array }) requests: HostOperatorRequest[] = []
  @property({ type: Boolean }) open = false
  @property({ attribute: false }) loadingIds: Set<string> = new Set()

  static styles = css`
    :host {
      display: contents;
    }

    .fab {
      position: fixed;
      right: 18px;
      bottom: 18px;
      border: none;
      border-radius: var(--radius-sm);
      min-height: 36px;
      padding: 0 12px;
      background: var(--accent);
      color: #fff;
      font-size: var(--text-secondary-size);
      font-weight: 600;
      box-shadow: var(--shadow-lg);
      z-index: 40;
    }

    .overlay {
      position: fixed;
      inset: 0;
      background: var(--sheet-scrim);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: grid;
      place-items: center;
      z-index: 50;
    }

    .modal {
      width: min(920px, 92vw);
      max-height: min(80vh, 720px);
      overflow: auto;
      border-radius: var(--radius-xl);
      background: var(--sheet-bg);
      box-shadow: var(--shadow-lg);
      padding: 18px;
      border: 1px solid var(--border-color);
      display: grid;
      gap: 14px;
    }

    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .title {
      font-size: 18px;
      font-weight: 640;
      color: var(--text-primary);
    }

    .list {
      display: grid;
      gap: 10px;
    }

    .item {
      border-radius: var(--radius-lg);
      background: var(--bg-surface);
      padding: 14px;
      display: grid;
      gap: 10px;
      border: 1px solid var(--border-color);
    }

    .meta {
      font-size: var(--text-meta-size);
      color: var(--text-muted);
    }

    .command {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--bg-hover) 82%, transparent);
      padding: 10px;
      color: var(--text-primary);
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .btn {
      border: 1px solid transparent;
      border-radius: 999px;
      min-height: 32px;
      padding: 0 12px;
      background: color-mix(in srgb, var(--bg-hover) 82%, transparent);
      color: var(--text-primary);
      font-size: var(--text-secondary-size);
      font-weight: 600;
    }

    .btn.primary {
      background: var(--accent);
      color: #fff;
    }

    .btn.danger {
      background: color-mix(in srgb, var(--error) 18%, var(--bg-hover));
      color: var(--text-primary);
    }

    .help {
      font-size: var(--text-meta-size);
      color: var(--text-muted);
    }
  `

  private fireClose() {
    this.dispatchEvent(new CustomEvent('close-modal', { bubbles: true, composed: true }))
  }

  private fireOpen() {
    this.dispatchEvent(new CustomEvent('open-modal', { bubbles: true, composed: true }))
  }

  private fireDecision(request: HostOperatorRequest, decision: 'approve' | 'reject') {
    this.dispatchEvent(new CustomEvent('decide-request', {
      detail: { request, decision },
      bubbles: true,
      composed: true,
    }))
  }

  render() {
    const count = this.requests.length

    return html`
      ${count > 0
        ? html`
            <button class="fab" type="button" @click=${this.fireOpen}>
              Approvals (${count})
            </button>
          `
        : ''}

      ${this.open
        ? html`
            <div class="overlay" @click=${this.fireClose}>
              <section class="modal" @click=${(event: Event) => event.stopPropagation()}>
                <div class="head">
                  <div class="title">Pending Host Operator Approvals (${count})</div>
                  <button class="btn" type="button" @click=${this.fireClose}>Close</button>
                </div>
                <div class="list">
                  ${count === 0
                    ? html`<div class="item"><div class="help">No pending requests.</div></div>`
                    : this.requests.map((request) => {
                      const isLoading = this.loadingIds.has(request.requestId)
                      return html`
                        <div class="item">
                          <div class="meta">
                            Request: ${request.requestId} · Agent: ${request.agentId} · Kind: ${request.kind}
                          </div>
                          <div class="command">${request.summary}</div>
                          <div class="actions">
                            <button
                              class="btn danger"
                              type="button"
                              ?disabled=${isLoading}
                              @click=${() => this.fireDecision(request, 'reject')}
                            >
                              Reject
                            </button>
                            <button
                              class="btn primary"
                              type="button"
                              ?disabled=${isLoading}
                              @click=${() => this.fireDecision(request, 'approve')}
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      `
                    })}
                </div>
              </section>
            </div>
          `
        : ''}
    `
  }
}
