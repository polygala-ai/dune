import { LitElement, css, html } from 'lit'
import { customElement, property, state as litState } from 'lit/decorators.js'
import type { BoxResource } from '@dune/shared'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import * as api from '../../services/rpc.js'
import { panelStyles } from './view.css.js'

@customElement('sandbox-terminal-tab')
export class SandboxTerminalTab extends LitElement {
  @property({ type: Object }) box!: BoxResource

  @litState() private terminalError = ''
  @litState() private terminalConnected = false

  private terminalSocket: WebSocket | null = null
  private terminalInstance: Terminal | null = null
  private terminalFitAddon: FitAddon | null = null
  private lastBoxId: string | null = null

  static styles = [
    panelStyles,
    css`
      :host { display: block; }
    `,
  ]

  disconnectedCallback() {
    super.disconnectedCallback()
    this.teardownTerminal()
  }

  willUpdate() {
    if (this.box && this.box.boxId !== this.lastBoxId) {
      this.teardownTerminal()
      this.lastBoxId = this.box.boxId
      this.terminalError = ''
    }
  }

  teardownTerminal() {
    if (this.terminalSocket) {
      try { this.terminalSocket.close() } catch {}
      this.terminalSocket = null
    }
    if (this.terminalInstance) {
      this.terminalInstance.dispose()
      this.terminalInstance = null
    }
    this.terminalFitAddon = null
    this.terminalConnected = false
  }

  private handleTerminalConnect() {
    if (!this.box) return

    this.teardownTerminal()
    this.terminalError = ''

    try {
      const ws = api.terminalBoxWs(this.box.boxId)
      this.terminalSocket = ws

      ws.onopen = () => {
        this.terminalConnected = true
        this.requestUpdate()

        requestAnimationFrame(() => {
          const container = this.shadowRoot?.querySelector('#terminal-container') as HTMLElement | null
          if (!container) return

          const term = new Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
            theme: {
              background: '#1a1a2e',
              foreground: '#e0e0e0',
              cursor: '#e0e0e0',
              selectionBackground: '#3a3a5e',
            },
          })
          const fitAddon = new FitAddon()
          term.loadAddon(fitAddon)
          term.loadAddon(new WebLinksAddon())

          term.open(container)
          fitAddon.fit()

          this.terminalInstance = term
          this.terminalFitAddon = fitAddon

          term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(data)
            }
          })

          term.onResize(({ cols, rows }) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'resize', cols, rows }))
            }
          })

          const resizeObserver = new ResizeObserver(() => {
            try { fitAddon.fit() } catch {}
          })
          resizeObserver.observe(container)
        })
      }

      ws.onmessage = (event) => {
        if (this.terminalInstance) {
          if (typeof event.data === 'string') {
            this.terminalInstance.write(event.data)
          } else if (event.data instanceof Blob) {
            event.data.text().then((text: string) => {
              this.terminalInstance?.write(text)
            })
          }
        }
      }

      ws.onclose = () => {
        this.terminalConnected = false
        if (this.terminalInstance) {
          this.terminalInstance.write('\r\n\x1b[90m[disconnected]\x1b[0m\r\n')
        }
        this.terminalSocket = null
        this.requestUpdate()
      }

      ws.onerror = () => {
        this.terminalError = 'Terminal websocket error'
        this.terminalConnected = false
        this.requestUpdate()
      }
    } catch (err: any) {
      this.terminalError = err?.message || 'Failed to connect terminal'
    }
  }

  render() {
    if (!this.box) return html``

    return html`
      <section class="panel" style="display:flex;flex-direction:column;height:100%;min-height:400px;">
        <div class="panel-title">Terminal</div>
        ${this.terminalError ? html`<div class="error">${this.terminalError}</div>` : ''}
        <div class="modal-actions" style="justify-content:flex-start;margin-bottom:8px;">
          ${this.terminalConnected
            ? html`<button class="btn muted" type="button" @click=${() => this.teardownTerminal()}>Disconnect</button>`
            : html`<button class="btn primary" type="button" @click=${this.handleTerminalConnect}>Connect</button>`}
        </div>
        <div id="terminal-container" style="flex:1;min-height:300px;background:#1a1a2e;border-radius:6px;overflow:hidden;"></div>
      </section>
    `
  }
}
