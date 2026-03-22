import { css } from 'lit'

export const settingsViewStyles = css`
    :host {
      display: block;
      height: 100%;
      background: transparent;
      padding: 18px;
    }

    .layout {
      height: 100%;
      display: grid;
      grid-template-columns: var(--settings-nav-width) minmax(0, 1fr);
      min-height: 0;
      gap: 14px;
    }

    .nav {
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 14px 10px 12px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      gap: 12px;
      box-shadow: var(--shadow-sm);
    }

    .back-btn {
      width: 100%;
      min-height: var(--control-height);
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: var(--text-secondary);
      font-size: var(--text-secondary-size);
      font-weight: 500;
      text-align: left;
      padding: 0 10px;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: background var(--transition-fast), color var(--transition-fast);
    }

    .back-btn:hover {
      background: var(--bg-hover);
      border-color: var(--border-light);
      color: var(--text-primary);
    }

    .back-btn svg,
    .nav-item svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      flex-shrink: 0;
    }

    .nav-list {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .nav-item {
      width: 100%;
      min-height: var(--sidebar-row-height);
      border: 1px solid transparent;
      border-radius: 8px;
      background: transparent;
      color: var(--text-secondary);
      font-size: var(--text-body-size);
      font-weight: 500;
      text-align: left;
      padding: 0 10px;
      display: inline-flex;
      align-items: center;
      gap: 9px;
      transition: background var(--transition-fast), color var(--transition-fast);
    }

    .nav-item:hover,
    .nav-item.active {
      background: var(--bg-hover);
      border-color: var(--row-selected-border);
      box-shadow: var(--shadow-sm);
      color: var(--text-primary);
    }

    .content {
      min-height: 0;
      overflow-y: auto;
      padding: 24px 28px 32px;
      background: var(--bg-elevated);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      box-shadow: var(--shadow-sm);
    }

    .top {
      min-height: 78px;
      display: flex;
      align-items: flex-end;
      justify-content: flex-start;
      gap: 10px;
      margin-bottom: 18px;
    }

    .title {
      font-size: clamp(28px, 3vw, 36px);
      font-weight: 640;
      color: var(--text-primary);
      letter-spacing: -0.03em;
    }

    .section {
      margin-top: 14px;
    }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .card {
      border-radius: 12px;
      background: var(--bg-surface);
      overflow: visible;
      padding: 8px;
      border: 1px solid var(--border-color);
    }

    .settings-card {
      border-radius: 12px;
      background: var(--bg-surface);
      padding: 16px;
      display: grid;
      gap: 14px;
      border: 1px solid var(--border-color);
    }

    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 16px 18px;
      border-radius: 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
    }

    .row-copy {
      min-width: 0;
    }

    .row-label,
    .field-title {
      font-size: var(--text-title-size);
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.25;
    }

    .row-sub,
    .field-help {
      margin-top: 3px;
      font-size: var(--text-secondary-size);
      color: var(--text-muted);
      line-height: 1.4;
    }

    .segmented {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--bg-hover) 84%, transparent);
      padding: 3px;
      max-width: 100%;
      overflow-x: auto;
    }

    .segment {
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--text-secondary);
      height: 30px;
      padding: 0 11px;
      font-size: var(--text-secondary-size);
      font-weight: 500;
      white-space: nowrap;
      transition: background var(--transition-fast), color var(--transition-fast);
    }

    .segment:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }

    .segment.active {
      background: var(--sidebar-selected);
      color: var(--text-primary);
    }

    .field-grid {
      display: grid;
      gap: 12px;
    }

    .field {
      padding: 16px;
      border-radius: 12px;
      background: var(--bg-subtle);
      display: grid;
      gap: 8px;
      border: 1px solid var(--border-color);
    }

    .field-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
    }

    .field-status {
      font-size: var(--text-secondary-size);
      color: var(--text-muted);
      white-space: nowrap;
    }

    .field-status.success {
      color: var(--text-primary);
    }

    .field-status.warn {
      color: #c38b00;
    }

    .text-input {
      width: 100%;
      min-height: 34px;
      border: 1px solid color-mix(in srgb, var(--text-muted) 24%, transparent);
      border-radius: var(--radius-sm);
      background: var(--bg-surface);
      color: var(--text-primary);
      font-size: var(--text-body-size);
      padding: 7px 9px;
      outline: none;
    }

    .text-input:focus {
      border-color: color-mix(in srgb, var(--text-primary) 40%, transparent);
    }

    .field-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .btn {
      border: none;
      border-radius: var(--radius-sm);
      min-height: 36px;
      padding: 0 10px;
      background: var(--bg-hover);
      color: var(--text-primary);
      font-size: var(--text-secondary-size);
      font-weight: 500;
      transition: background var(--transition-fast), opacity var(--transition-fast);
    }

    .btn:hover {
      background: color-mix(in srgb, var(--bg-hover) 75%, var(--text-primary) 8%);
    }

    .btn:disabled {
      opacity: 0.55;
    }

    .btn.primary {
      background: color-mix(in srgb, var(--text-primary) 16%, var(--bg-hover));
    }

    .meta-line {
      font-size: var(--text-secondary-size);
      color: var(--text-muted);
    }

    .feedback {
      font-size: var(--text-secondary-size);
      line-height: 1.4;
    }

    .feedback.success {
      color: #2c7a4b;
    }

    .feedback.error {
      color: #b33a3a;
    }

    @media (max-width: 920px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr);
      }

      .nav {
        padding: 10px;
      }

      .nav::after {
        display: none;
      }

      .content {
        padding: 14px;
      }

      .row {
        grid-template-columns: minmax(0, 1fr);
      }
    }
`
