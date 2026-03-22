import { LitElement, css, html } from 'lit'
import { customElement, property, state as litState } from 'lit/decorators.js'
import type { Agent, BoxCreateRequest, HostImportRequest } from '@dune/shared'
import * as api from '../../services/rpc.js'
import { panelStyles } from './view.css.js'

type SandboxDurability = 'ephemeral' | 'persistent'

@customElement('sandbox-create-dialog')
export class SandboxCreateDialog extends LitElement {
  @property({ type: Array }) agents: Agent[] = []

  @litState() private creating = false
  @litState() private createError = ''
  @litState() private createName = ''
  @litState() private createImage = 'ghcr.io/boxlite-ai/boxlite-skillbox:0.1.0'
  @litState() private createDurability: SandboxDurability = 'persistent'
  @litState() private createAutoRemove = false
  @litState() private createWorkingDir = '/workspace'
  @litState() private createCpu = 2
  @litState() private createMemoryMib = 2048
  @litState() private createDiskGb = 10
  @litState() private createGuestPort = 3000
  @litState() private createShareAgents = new Set<string>()
  @litState() private createHostImportPath = ''
  @litState() private createHostImportDest = '/workspace'

  static styles = [
    panelStyles,
    css`
      :host { display: block; }

      .form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .inline-row {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .check-grid {
        border: 1px solid color-mix(in srgb, var(--text-muted) 18%, transparent);
        border-radius: 10px;
        padding: 10px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 10px;
        max-height: 120px;
        overflow: auto;
        background: color-mix(in srgb, var(--bg-surface) 80%, transparent);
      }

      @media (max-width: 1020px) {
        .form-grid, .inline-row { grid-template-columns: 1fr; }
        .check-grid { grid-template-columns: 1fr; }
      }
    `,
  ]

  reset() {
    this.createError = ''
    this.createName = ''
    this.createDurability = 'persistent'
    this.createAutoRemove = false
    this.createImage = 'ghcr.io/boxlite-ai/boxlite-skillbox:0.1.0'
    this.createWorkingDir = '/workspace'
    this.createCpu = 2
    this.createMemoryMib = 2048
    this.createDiskGb = 10
    this.createGuestPort = 3000
    this.createShareAgents = new Set<string>()
    this.createHostImportPath = ''
    this.createHostImportDest = '/workspace'
  }

  private handleClose() {
    if (this.creating) return
    this.dispatchEvent(new CustomEvent('sandbox-create-close', { bubbles: true, composed: true }))
  }

  private toggleShareAgent(agentId: string, checked: boolean) {
    const next = new Set(this.createShareAgents)
    if (checked) next.add(agentId)
    else next.delete(agentId)
    this.createShareAgents = next
  }

  private async handleCreateSandbox() {
    if (this.creating) return
    this.creating = true
    this.createError = ''

    const acl = Array.from(this.createShareAgents).flatMap((agentId) => ([
      { principalType: 'agent' as const, principalId: agentId, permission: 'read' as const },
      { principalType: 'agent' as const, principalId: agentId, permission: 'operate' as const },
    ]))

    const payload: BoxCreateRequest = {
      name: this.createName.trim() || undefined,
      image: this.createImage.trim() || undefined,
      durability: this.createDurability,
      autoRemove: this.createAutoRemove,
      cpus: Number(this.createCpu) || 1,
      memoryMib: Number(this.createMemoryMib) || 512,
      diskSizeGb: Number(this.createDiskGb) || 10,
      workingDir: this.createWorkingDir.trim() || undefined,
      ports: this.createGuestPort > 0
        ? [{ guestPort: Number(this.createGuestPort), protocol: 'tcp' }]
        : [],
      acl,
    }

    try {
      const created = await api.createBox(payload)

      if (this.createHostImportPath.trim()) {
        const req: HostImportRequest = {
          hostPath: this.createHostImportPath.trim(),
          destPath: this.createHostImportDest.trim() || '/workspace',
        }
        await api.importHostPathToBox(created.boxId, req)
      }

      this.dispatchEvent(new CustomEvent('sandbox-created', {
        bubbles: true,
        composed: true,
        detail: { boxId: created.boxId },
      }))
    } catch (err: any) {
      this.createError = err?.message || 'Failed to create sandbox'
    } finally {
      this.creating = false
    }
  }

  render() {
    return html`
      <div class="overlay" @click=${this.handleClose}>
        <div class="modal" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-title">New Sandbox</div>
          ${this.createError ? html`<div class="error">${this.createError}</div>` : ''}

          <div class="form-grid">
            <label class="field full">
              <span class="label">Name</span>
              <input class="input" .value=${this.createName} @input=${(e: Event) => { this.createName = (e.target as HTMLInputElement).value }} placeholder="Optional" />
            </label>

            <label class="field full">
              <span class="label">Image</span>
              <input class="input" .value=${this.createImage} @input=${(e: Event) => { this.createImage = (e.target as HTMLInputElement).value }} />
            </label>

            <label class="field">
              <span class="label">Durability</span>
              <select class="select" .value=${this.createDurability} @change=${(e: Event) => { this.createDurability = (e.target as HTMLSelectElement).value as SandboxDurability }}>
                <option value="persistent">persistent</option>
                <option value="ephemeral">ephemeral</option>
              </select>
            </label>

            <label class="field">
              <span class="label">Working Dir</span>
              <input class="input" .value=${this.createWorkingDir} @input=${(e: Event) => { this.createWorkingDir = (e.target as HTMLInputElement).value }} />
            </label>

            <div class="field full">
              <span class="label">CPU / Memory MiB / Disk GB</span>
              <div class="inline-row">
                <input class="input" type="number" min="1" .value=${String(this.createCpu)} @input=${(e: Event) => { this.createCpu = Number((e.target as HTMLInputElement).value) }} />
                <input class="input" type="number" min="128" .value=${String(this.createMemoryMib)} @input=${(e: Event) => { this.createMemoryMib = Number((e.target as HTMLInputElement).value) }} />
                <input class="input" type="number" min="1" .value=${String(this.createDiskGb)} @input=${(e: Event) => { this.createDiskGb = Number((e.target as HTMLInputElement).value) }} />
              </div>
            </div>

            <label class="field">
              <span class="label">Expose Guest Port</span>
              <input class="input" type="number" min="1" .value=${String(this.createGuestPort)} @input=${(e: Event) => { this.createGuestPort = Number((e.target as HTMLInputElement).value) }} />
            </label>

            <label class="field">
              <span class="label">Auto Remove</span>
              <select class="select" .value=${this.createAutoRemove ? 'true' : 'false'} @change=${(e: Event) => { this.createAutoRemove = (e.target as HTMLSelectElement).value === 'true' }}>
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            </label>

            <div class="field full">
              <span class="label">Share With Agents</span>
              <div class="check-grid">
                ${this.agents.length === 0
                  ? html`<div class="meta-text">No agents available.</div>`
                  : this.agents.map((agent) => html`
                      <label class="check-item">
                        <input type="checkbox" .checked=${this.createShareAgents.has(agent.id)} @change=${(e: Event) => this.toggleShareAgent(agent.id, (e.target as HTMLInputElement).checked)} />
                        <span>${agent.name}</span>
                      </label>
                    `)}
              </div>
            </div>

            <label class="field full">
              <span class="label">Import Host Path (Optional)</span>
              <input class="input" .value=${this.createHostImportPath} @input=${(e: Event) => { this.createHostImportPath = (e.target as HTMLInputElement).value }} placeholder="/absolute/path/on/backend/host" />
            </label>

            <label class="field full">
              <span class="label">Import Destination</span>
              <input class="input" .value=${this.createHostImportDest} @input=${(e: Event) => { this.createHostImportDest = (e.target as HTMLInputElement).value }} placeholder="/workspace" />
            </label>
          </div>

          <div class="modal-actions">
            <button class="btn muted" type="button" @click=${this.handleClose} ?disabled=${this.creating}>Cancel</button>
            <button class="btn primary" type="button" @click=${this.handleCreateSandbox} ?disabled=${this.creating}>Create sandbox</button>
          </div>
        </div>
      </div>
    `
  }
}
