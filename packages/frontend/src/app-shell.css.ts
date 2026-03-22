import { css } from 'lit'

export const appShellStyles = css`
    :host {
      display: block;
      height: 100vh;
      background: var(--app-canvas);
      color: var(--text-primary);
      overflow: hidden;
    }

    .frame {
      height: 100%;
      padding: 0;
    }

    .workspace {
      min-height: 0;
      height: 100%;
      display: grid;
      grid-template-columns: var(--shell-sidebar-width, var(--sidebar-width)) minmax(0, 1fr);
      gap: 0;
      background: var(--shell-stage-bg);
      border: none;
      border-radius: 0;
      overflow: hidden;
      box-shadow: var(--shell-stage-shadow);
    }

    .workspace.with-sidebar-resizer {
      grid-template-columns: var(--shell-sidebar-width, var(--sidebar-width)) 6px minmax(0, 1fr);
    }

    .workspace.collapsed {
      grid-template-columns: 0 minmax(0, 1fr);
    }

    .workspace.with-sidebar-resizer.collapsed {
      grid-template-columns: 0 0 minmax(0, 1fr);
    }

    .workspace.settings-mode {
      grid-template-columns: minmax(0, 1fr);
    }

    .sidebar-wrap {
      min-width: 0;
      min-height: 0;
      height: 100%;
      overflow: hidden;
      background: var(--sidebar-bg);
      border-right: 1px solid var(--pane-divider);
    }

    .workspace.with-sidebar-resizer .sidebar-wrap {
      border-right: none;
    }

    .workspace.collapsed .sidebar-wrap {
      background: transparent;
      border-right: none;
    }

    .sidebar-wrap.is-hidden {
      pointer-events: none;
    }

    .sidebar-resizer {
      width: 6px;
      min-height: 0;
      border: none;
      background: transparent;
      cursor: col-resize;
      touch-action: none;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .sidebar-resizer::before {
      content: '';
      width: 2px;
      height: 38px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--border-primary) 72%, transparent);
      transition: background var(--transition-fast), height var(--transition-fast);
    }

    .sidebar-resizer:hover::before,
    .sidebar-resizer.active::before {
      background: color-mix(in srgb, var(--accent) 55%, var(--border-primary));
      height: 48px;
    }

    .sidebar-resizer:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 1px;
    }

    .content-wrap {
      min-height: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      background: var(--shell-stage-bg);
      overflow: hidden;
    }

    .workspace.settings-mode .content-wrap {
      border-left: none;
    }

    .pane-toolbar {
      min-height: var(--toolbar-height);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 0 16px;
      border-bottom: none;
      box-shadow: 0 1px 0 var(--border-color);
      background: var(--toolbar-bg);
      position: relative;
    }

    .pane-toolbar.hidden-sidebar.native-traffic-lights {
      padding-left: calc(var(--toolbar-safe-left) + 10px);
    }

    .pane-toolbar-main {
      min-width: 0;
      display: flex;
      align-items: stretch;
      align-self: stretch;
      gap: 8px;
      flex: 1;
    }

    .pane-toolbar-main.hidden-sidebar {
      gap: 12px;
    }

    .pane-toolbar-leading {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
    }

    .pane-toolbar-leading-btn {
      width: var(--control-height);
      min-width: var(--control-height);
      height: var(--control-height);
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--text-muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background var(--transition-fast), color var(--transition-fast);
    }

    .pane-toolbar-leading-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .pane-toolbar-leading-btn svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      stroke-width: 1.6;
      fill: none;
      flex-shrink: 0;
    }

    .pane-toolbar-copy {
      min-width: 0;
      display: flex;
      align-items: stretch;
      gap: 6px;
      flex: 1;
    }

    .pane-toolbar-title-wrap {
      display: flex;
      align-items: center;
      align-self: stretch;
      min-width: 0;
      flex: 1;
      -webkit-app-region: drag;
      user-select: none;
      -webkit-user-select: none;
    }

    .pane-toolbar-title {
      margin: 0;
      font-size: 14px;
      line-height: 1.2;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: min(720px, 100%);
      user-select: none;
      -webkit-user-select: none;
    }

    .pane-toolbar-title.buttonlike {
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      text-align: left;
      appearance: none;
      -webkit-appearance: none;
      -webkit-app-region: no-drag;
      transition: color var(--transition-fast);
    }

    .pane-toolbar-title.buttonlike:hover {
      color: var(--accent);
    }

    .pane-toolbar-title.buttonlike:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 3px;
      border-radius: 8px;
    }

    .pane-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex-shrink: 0;
      -webkit-app-region: no-drag;
    }

    .window-control-btn {
      border: 1px solid var(--border-color);
      border-radius: 8px;
      min-height: var(--control-height);
      padding: 0 12px;
      background: transparent;
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      transition: background var(--transition-fast), color var(--transition-fast);
      white-space: nowrap;
    }

    .window-control-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .window-control-btn svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 1.9;
      fill: none;
      flex-shrink: 0;
    }

    .toolbar-count {
      font-size: 11px;
      line-height: 1;
      font-weight: 650;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }

    .toolbar-count.positive {
      color: var(--success);
    }

    .toolbar-count.negative {
      color: var(--error);
    }

    .window-controls {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-left: 2px;
      padding-left: 8px;
      border-left: 1px solid var(--pane-divider);
    }

    .window-control-btn {
      width: var(--control-height);
      min-width: var(--control-height);
      padding: 0;
      border-radius: 8px;
    }

    .stage-shell {
      min-height: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
      background: var(--shell-stage-bg);
    }

    .footer-strip {
      min-height: var(--footer-height);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 14px;
      border-top: 1px solid var(--footer-border);
      background: var(--footer-bg);
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1;
    }

    .footer-cluster {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: nowrap;
    }

    .footer-chip {
      min-width: 0;
      max-width: 280px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 8px;
      min-height: 20px;
      border: 1px solid transparent;
      border-radius: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: transparent;
      color: var(--text-secondary);
    }

    .footer-chip.emphasis {
      border-color: var(--control-border);
      background: color-mix(in srgb, var(--control-bg) 82%, transparent);
      color: var(--text-primary);
    }

    .footer-chip.warning {
      border-color: color-mix(in srgb, var(--warning) 28%, var(--control-border));
      color: var(--warning);
    }

    .footer-chip.success {
      border-color: transparent;
      color: var(--success);
    }

    .footer-chip.branch {
      max-width: 320px;
    }

    .footer-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      flex-shrink: 0;
      background: currentColor;
    }

    sidebar-panel {
      min-height: 0;
      height: 100%;
      position: relative;
    }

    message-area,
    agent-chat-view,
    settings-view,
    sandboxes-view,
    apps-view {
      min-height: 0;
      height: 100%;
      border-radius: inherit;
      border: none;
      box-shadow: none;
      background: transparent;
      overflow: hidden;
    }

    .host-approvals-fab {
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

    .host-approvals-overlay {
      position: fixed;
      inset: 0;
      background: var(--sheet-scrim);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: grid;
      place-items: center;
      z-index: 50;
    }

    .host-approvals-modal {
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

    .host-approvals-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .host-approvals-title {
      font-size: 18px;
      font-weight: 640;
      color: var(--text-primary);
    }

    .host-approvals-list {
      display: grid;
      gap: 10px;
    }

    .host-approvals-item {
      border-radius: var(--radius-lg);
      background: var(--bg-surface);
      padding: 14px;
      display: grid;
      gap: 10px;
      border: 1px solid var(--border-color);
    }

    .host-approvals-meta {
      font-size: var(--text-meta-size);
      color: var(--text-muted);
    }

    .host-approvals-command {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--bg-hover) 82%, transparent);
      padding: 10px;
      color: var(--text-primary);
    }

    .host-approvals-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .host-approvals-btn {
      border: 1px solid transparent;
      border-radius: 999px;
      min-height: 32px;
      padding: 0 12px;
      background: color-mix(in srgb, var(--bg-hover) 82%, transparent);
      color: var(--text-primary);
      font-size: var(--text-secondary-size);
      font-weight: 600;
    }

    .host-approvals-btn.primary {
      background: var(--accent);
      color: #fff;
    }

    .host-approvals-btn.danger {
      background: color-mix(in srgb, var(--error) 18%, var(--bg-hover));
      color: var(--text-primary);
    }

    .host-approvals-help {
      font-size: var(--text-meta-size);
      color: var(--text-muted);
    }

    @media (max-width: 980px) {
      .pane-toolbar {
        min-height: var(--toolbar-height-compact);
        padding: 0 14px;
      }

      .pane-toolbar-main,
      .pane-toolbar-copy {
        gap: 10px;
      }

      .workspace,
      .workspace.with-sidebar-resizer,
      .workspace.settings-mode,
      .workspace.collapsed,
      .workspace.with-sidebar-resizer.collapsed {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(188px, 34vh) minmax(0, 1fr);
      }

      .workspace.settings-mode {
        grid-template-rows: minmax(0, 1fr);
      }

      .sidebar-wrap {
        border-right: none;
        border-bottom: 1px solid var(--pane-divider);
      }

      .footer-strip {
        padding: 0 12px;
      }
    }

    @media (max-width: 760px) {
      .pane-toolbar {
        flex-wrap: wrap;
        align-items: flex-start;
        padding: 10px 12px;
      }

      .pane-toolbar-title-wrap {
        max-width: 100%;
      }

      .pane-toolbar-actions {
        width: 100%;
        justify-content: flex-start;
        flex-wrap: wrap;
      }

      .footer-strip {
        min-height: auto;
        padding: 8px 12px;
        flex-wrap: wrap;
      }

      .footer-cluster {
        width: 100%;
        justify-content: space-between;
        flex-wrap: wrap;
      }
    }

    .lightbox {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      cursor: zoom-out;
    }

    .lightbox img {
      max-width: 90vw;
      max-height: 90vh;
      object-fit: contain;
      border-radius: var(--radius);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
`
