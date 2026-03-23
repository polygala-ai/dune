import { css } from 'lit'

export const profilePanelStyles = css`
    :host {
      display: block;
    }
    :host(agent-profile-panel) {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: flex;
      align-items: stretch;
      justify-content: flex-end;
    }
    .backdrop {
      position: absolute;
      inset: 0;
      background: var(--sheet-scrim);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: flex;
      align-items: stretch;
      justify-content: flex-end;
      padding: 12px 0 12px 12px;
    }

    .sheet-shell {
      display: grid;
      grid-template-columns: 6px auto;
      gap: 0;
      min-height: 0;
      height: 100%;
      align-items: stretch;
    }

    .inspector-resizer {
      width: 6px;
      min-height: 0;
      border: none;
      border-radius: var(--radius-sm);
      background: transparent;
      cursor: col-resize;
      touch-action: none;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .inspector-resizer::before {
      content: '';
      width: 2px;
      height: 38px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--border-primary) 72%, transparent);
      transition: background var(--transition-fast), height var(--transition-fast);
    }

    .inspector-resizer:hover::before,
    .inspector-resizer.active::before {
      background: color-mix(in srgb, var(--accent) 55%, var(--border-primary));
      height: 48px;
    }

    .inspector-resizer:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 1px;
    }

    .modal {
      position: relative;
      width: min(520px, 42vw);
      height: 100%;
      max-height: none;
      background: var(--sheet-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px 0 0 16px;
      box-shadow: var(--shadow-lg);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: width 0.25s ease, height 0.25s ease, max-width 0.25s ease, max-height 0.25s ease, border-radius 0.2s ease;
    }

    .modal.resize-active {
      transition: height 0.25s ease, max-width 0.25s ease, max-height 0.25s ease, border-radius 0.2s ease;
    }

    .modal.computer {
      height: 85vh;
      width: min(94vw, calc((85vh - 120px) * 4 / 3 + 52px));
      border-radius: 16px;
      margin: auto 12px auto auto;
      align-self: center;
    }

    .modal.fullscreen {
      height: 100vh;
      width: min(100vw, calc((100vh - 100px) * 4 / 3 + 48px));
      max-width: 100vw;
      max-height: 100vh;
      border-radius: 0;
    }

    /* System prompt overlay */
    .modal.prompt-view {
      width: min(800px, 92vw);
      height: 85vh;
      border-radius: 16px;
      margin: auto 12px auto auto;
      align-self: center;
    }

    .modal-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 20px 14px;
      transition: padding 0.25s ease;
    }

    .modal.computer .modal-header {
      padding: 10px 12px 9px;
      gap: 12px;
    }

    .avatar {
      width: 64px;
      height: 64px;
      border-radius: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
      font-weight: 600;
      color: white;
      flex-shrink: 0;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
      transition: width 0.25s ease, height 0.25s ease, font-size 0.25s ease, border-radius 0.2s ease;
      cursor: pointer;
      position: relative;
    }

    .modal.computer .avatar {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-sm);
      font-size: 18px;
    }

    .color-picker {
      display: flex;
      gap: 4px;
      margin-top: 6px;
    }

    .role-picker {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 6px;
    }

    .role-option {
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--border-color, #334155);
      background: var(--bg-elevated);
      color: var(--text-primary);
      text-align: left;
      cursor: pointer;
    }

    .role-option.selected {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
    }

    .role-option-title {
      font-size: 13px;
      font-weight: 600;
    }

    .role-option-copy {
      margin-top: 4px;
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    .color-swatch {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      transition: all var(--transition-fast);
      padding: 0;
      background: none;
    }

    .color-swatch:hover {
      transform: scale(1.15);
    }

    .color-swatch.selected {
      border-color: white;
      box-shadow: 0 0 0 2px var(--accent);
    }

    .header-info {
      flex: 1;
      min-width: 0;
    }
    .agent-name {
      font-size: var(--text-title-size);
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: font-size 0.25s ease;
      cursor: pointer;
    }

    .agent-name:hover {
      color: var(--accent);
    }

    .name-input {
      font-size: var(--text-title-size);
      font-weight: 600;
      color: var(--text-primary);
      background: var(--bg-surface);
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      padding: 2px 6px;
      width: 100%;
      outline: none;
    }

    .modal.computer .agent-name {
      font-size: 15px;
    }
    .agent-status {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
    }

    .modal.computer .agent-status {
      margin-top: 2px;
      font-size: 12px;
    }

    .status-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
    }

    .status-idle { background: var(--success); }

    .status-starting {
      background: var(--accent);
      animation: pulse 1.5s ease-in-out infinite;
    }

    .status-thinking,
    .status-responding {
      background: var(--warning);
      animation: pulse 1.5s ease-in-out infinite;
    }

    .status-error { background: var(--error); }
    .status-stopped { background: var(--text-muted); opacity: 0.5; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    .header-buttons {
      display: flex;
      align-items: center;
      gap: 6px;
      align-self: flex-start;
    }

    .close-btn,
    .expand-btn {
      width: 30px;
      height: 30px;
      border: none;
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      color: var(--text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);
    }

    .close-btn:hover,
    .expand-btn:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }

    .close-btn svg,
    .expand-btn svg {
      width: 16px;
      height: 16px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      flex-shrink: 0;
    }

    .actions-row {
      display: flex;
      gap: 8px;
      padding: 10px 12px;
      transition: all 0.25s ease;
    }

    .modal.computer .actions-row {
      display: none;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-surface);
      border: none;
      border-radius: var(--radius-sm);
      padding: 6px 11px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      transition: all var(--transition-fast);
    }

    .action-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    .action-btn.danger:hover {
      color: var(--error);
      background: color-mix(in srgb, var(--error) 8%, transparent);
    }

    .action-btn.primary {
      background: var(--accent);
      color: white;
    }

    .action-btn.primary:hover {
      opacity: 0.9;
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .action-icon {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      flex-shrink: 0;
    }

    .tab-bar {
      display: flex;
      padding: 0 12px;
      gap: 2px;
    }

    .tab {
      background: none;
      border: none;
      border-bottom: none;
      padding: 9px 10px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .tab:hover {
      color: var(--text-primary);
    }

    .tab.active {
      background: var(--bg-hover);
      border-radius: var(--radius-sm);
      color: var(--text-primary);
    }

    .tab-content {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
      padding-top: 4px;
    }

    .logs-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .logs-actions-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .logs-wrap-toggle {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px;
      border-radius: var(--radius-sm);
      background: color-mix(in srgb, var(--bg-elevated) 65%, #0b1220);
    }

    .logs-wrap-btn {
      border: none;
      border-radius: calc(var(--radius-sm) - 2px);
      padding: 4px 8px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text-secondary);
      background: transparent;
      cursor: pointer;
    }

    .logs-wrap-btn:hover {
      color: var(--text-primary);
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }

    .logs-wrap-btn.active {
      color: #dbeafe;
      background: color-mix(in srgb, #0b1220 64%, var(--accent));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 38%, transparent);
    }

    .logs-meta {
      font-size: 12px;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }

    .jump-latest-wrap {
      position: sticky;
      bottom: 12px;
      margin: 0 12px 10px;
      display: flex;
      justify-content: flex-end;
      pointer-events: none;
      z-index: 1;
    }

    .jump-latest-btn {
      pointer-events: auto;
      border: 1px solid color-mix(in srgb, var(--accent) 38%, transparent);
      border-radius: 999px;
      padding: 6px 10px;
      background: color-mix(in srgb, #0b1220 70%, var(--accent));
      color: #dbeafe;
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-mono);
      cursor: pointer;
      box-shadow: 0 6px 16px rgba(2, 6, 23, 0.35);
    }

    .jump-latest-btn:hover {
      background: color-mix(in srgb, #172554 65%, var(--accent));
    }

    .section-card {
      margin: 8px 12px;
      border-radius: var(--radius);
      padding: 11px;
      background: var(--bg-surface);
    }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 6px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .section-content {
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.55;
      margin: 0;
    }

    .personality-textarea {
      width: 100%;
      min-height: 80px;
      resize: vertical;
      font-size: 14px;
      font-family: inherit;
      color: var(--text-primary);
      background: var(--bg-elevated);
      border: 1px solid var(--border-color, #334155);
      border-radius: var(--radius-sm);
      padding: 8px;
      line-height: 1.55;
      outline: none;
      box-sizing: border-box;
    }

    .personality-textarea:focus {
      border-color: var(--accent);
    }

    .save-row {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }

    .channel-item {
      font-size: 13px;
      color: var(--text-secondary);
      padding: 3px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .channel-remove-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px 4px;
      font-size: 11px;
      border-radius: var(--radius-sm);
    }

    .channel-remove-btn:hover {
      color: var(--error);
      background: color-mix(in srgb, var(--error) 8%, transparent);
    }

    .empty {
      font-size: 13px;
      color: var(--text-muted);
      font-style: italic;
      margin: 0;
    }

    /* Skills tab */
    .skill-card {
      margin: 8px 12px;
      border-radius: var(--radius);
      padding: 11px;
      background: var(--bg-surface);
    }

    .skill-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .skill-desc {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.4;
      margin-bottom: 6px;
    }

    .skill-preview {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 8px;
    }

    .skill-scripts {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
    }

    .script-tag {
      font-size: 11px;
      color: var(--text-muted);
      background: var(--bg-elevated);
      padding: 2px 7px;
      border-radius: 10px;
      font-family: monospace;
    }

    .skill-info-banner {
      margin: 8px 12px;
      padding: 8px 11px;
      background: color-mix(in srgb, var(--accent) 8%, transparent);
      border-radius: var(--radius-sm);
      font-size: 12px;
      color: var(--text-secondary);
    }

    .skill-viewer-btn {
      border: none;
      background: var(--bg-elevated);
      color: var(--text-primary);
      border-radius: var(--radius-sm);
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }

    .skill-viewer-btn:hover {
      background: var(--bg-hover);
    }

    .skill-markdown {
      margin-top: 8px;
      max-height: 220px;
      overflow: auto;
      background: var(--bg-elevated);
      border-radius: var(--radius-sm);
      padding: 10px;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.45;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* System prompt modal */
    .prompt-overlay {
      position: absolute;
      inset: 0;
      background: var(--bg-elevated);
      display: flex;
      flex-direction: column;
      z-index: 10;
    }

    .prompt-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid var(--bg-surface);
    }

    .prompt-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .prompt-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 14px;
    }

    .prompt-text {
      font-size: 13px;
      font-family: monospace;
      color: var(--text-secondary);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }

    @media (max-width: 760px) {
      :host,
      .backdrop {
        align-items: center;
        justify-content: center;
      }

      .backdrop {
        padding: 0;
      }

      .modal {
        width: min(620px, 92vw);
        height: auto;
        max-height: 88vh;
        border-radius: 16px;
      }

      .modal-header {
        padding: 14px 14px 12px;
      }

      .actions-row {
        padding: 10px;
      }

      .tab-bar {
        padding: 0 10px;
      }

      .section-card,
      .skill-card {
        margin-left: 10px;
        margin-right: 10px;
      }
    }
`
