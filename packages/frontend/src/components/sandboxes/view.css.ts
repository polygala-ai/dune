import { css } from 'lit'

/* ─── shared tokens used by child components ─── */
export const panelStyles = css`
  .panel {
    border: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--bg-primary) 96%, transparent);
    padding: 11px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .panel-title {
    font-size: 13px;
    font-weight: 620;
    color: var(--text-primary);
    letter-spacing: -0.01em;
  }

  .error {
    margin-bottom: 10px;
    color: var(--error);
    font-size: 13px;
    line-height: 1.4;
  }

  .meta-text {
    font-size: 12px;
    color: var(--text-muted);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field.full {
    grid-column: 1 / -1;
  }

  .label {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .input,
  .textarea,
  .select {
    width: 100%;
    border: 1px solid color-mix(in srgb, var(--text-muted) 22%, transparent);
    border-radius: 10px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 13px;
    min-height: 34px;
    padding: 7px 10px;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }

  .input:focus,
  .textarea:focus,
  .select:focus {
    border-color: color-mix(in srgb, var(--accent) 45%, transparent);
    background: var(--bg-surface);
  }

  .textarea {
    resize: vertical;
    min-height: 92px;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.45;
  }

  .btn {
    border: none;
    border-radius: 10px;
    height: 34px;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 600;
    transition: opacity var(--transition-fast), transform var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
  }

  .btn:hover {
    transform: translateY(-1px);
  }

  .btn.muted {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn.primary {
    background: var(--text-primary);
    color: var(--bg-primary);
  }

  .btn.warn {
    background: color-mix(in srgb, var(--error) 14%, transparent);
    color: var(--error);
  }

  .btn:disabled {
    opacity: 0.52;
    cursor: default;
    transform: none;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
    margin-top: 2px;
  }

  .chip {
    border-radius: 999px;
    padding: 2px 7px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .chip.running {
    background: color-mix(in srgb, var(--success) 16%, transparent);
    color: var(--success);
  }

  .chip.error {
    background: color-mix(in srgb, var(--error) 16%, transparent);
    color: var(--error);
  }

  .chip.readonly {
    background: color-mix(in srgb, var(--warning) 20%, transparent);
    color: var(--warning);
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 130;
    background: rgba(15, 23, 42, 0.42);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal {
    width: min(640px, 92vw);
    max-height: min(90vh, 860px);
    overflow: auto;
    border: none;
    border-radius: var(--radius-lg);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-lg);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .modal-title {
    font-size: 20px;
    font-weight: 620;
    letter-spacing: -0.02em;
    color: var(--text-primary);
  }

  .check-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-secondary);
  }
`

/* ─── parent-only styles (grid, cards, detail shell, tabs) ─── */
export const parentStyles = css`
  :host {
    display: block;
    height: 100%;
    background: var(--bg-primary);
  }

  .shell {
    height: 100%;
    overflow: auto;
    padding: 14px 18px 24px;
  }

  .page {
    max-width: 1100px;
    margin: 0 auto;
    min-height: 100%;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    min-height: var(--header-height);
    margin-bottom: 8px;
    flex-wrap: wrap;
  }

  .refresh-btn {
    border: none;
    border-radius: 11px;
    height: 36px;
    padding: 0 10px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 500;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    transition: background var(--transition-fast), color var(--transition-fast), opacity var(--transition-fast);
  }

  .refresh-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .refresh-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .refresh-btn svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
    flex-shrink: 0;
  }

  .search-wrap {
    position: relative;
    width: min(310px, 100%);
  }

  .search-wrap svg {
    position: absolute;
    left: 11px;
    top: 50%;
    width: 14px;
    height: 14px;
    stroke: var(--text-muted);
    stroke-width: 2;
    fill: none;
    transform: translateY(-50%);
    pointer-events: none;
  }

  .search {
    width: 100%;
    height: 36px;
    border: 1px solid color-mix(in srgb, var(--text-muted) 22%, transparent);
    border-radius: 11px;
    background: var(--bg-primary);
    color: var(--text-primary);
    padding: 0 12px 0 32px;
    font-size: 14px;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }

  .search:focus {
    border-color: color-mix(in srgb, var(--accent) 48%, transparent);
    background: var(--bg-surface);
  }

  .search::placeholder {
    color: var(--text-muted);
  }

  .new-btn {
    border: none;
    border-radius: 11px;
    height: 36px;
    padding: 0 14px;
    background: var(--text-primary);
    color: var(--bg-primary);
    font-size: 14px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    transition: opacity var(--transition-fast), transform var(--transition-fast);
  }

  .new-btn:hover {
    opacity: 0.92;
    transform: translateY(-1px);
  }

  .new-btn svg {
    width: 14px;
    height: 14px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
    flex-shrink: 0;
  }

  .heading {
    margin-bottom: 20px;
  }

  .title {
    font-size: clamp(56px, 5.5vw, 64px);
    line-height: 0.97;
    letter-spacing: -0.04em;
    font-weight: 620;
    color: var(--text-primary);
  }

  .subtitle {
    margin-top: 8px;
    font-size: 15px;
    color: var(--text-secondary);
    font-weight: 520;
    line-height: 1.3;
  }

  .subtitle a {
    color: var(--accent);
    text-decoration: none;
  }

  .subtitle a:hover {
    opacity: 0.86;
  }

  .error {
    margin-bottom: 10px;
    color: var(--error);
    font-size: 13px;
    line-height: 1.4;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 16px;
  }

  .card {
    border: 1px solid color-mix(in srgb, var(--text-muted) 15%, transparent);
    border-radius: 16px;
    background: color-mix(in srgb, var(--bg-primary) 95%, transparent);
    min-height: 104px;
    padding: 13px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    transition: border-color var(--transition-fast), background var(--transition-fast), transform var(--transition-fast), box-shadow var(--transition-fast);
    cursor: pointer;
  }

  .card:hover {
    border-color: color-mix(in srgb, var(--text-muted) 30%, transparent);
    background: color-mix(in srgb, var(--bg-surface) 96%, transparent);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  .card-icon {
    width: 38px;
    height: 38px;
    border-radius: 11px;
    background: color-mix(in srgb, var(--bg-hover) 74%, transparent);
    color: var(--text-primary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .card-icon svg {
    width: 17px;
    height: 17px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }

  .card-main {
    min-width: 0;
  }

  .card-title {
    font-size: 22px;
    line-height: 1;
    font-weight: 620;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-sub {
    margin-top: 4px;
    font-size: 14px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    margin-top: 7px;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--text-muted);
  }

  .chip {
    border-radius: 999px;
    padding: 2px 7px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .chip.running {
    background: color-mix(in srgb, var(--success) 16%, transparent);
    color: var(--success);
  }

  .chip.error {
    background: color-mix(in srgb, var(--error) 16%, transparent);
    color: var(--error);
  }

  .chip.readonly {
    background: color-mix(in srgb, var(--warning) 20%, transparent);
    color: var(--warning);
  }

  .action {
    border: none;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: transparent;
    color: var(--text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .action:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .action svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }

  .empty {
    border-radius: 14px;
    border: 1px dashed color-mix(in srgb, var(--text-muted) 26%, transparent);
    color: var(--text-muted);
    font-size: 14px;
    padding: 20px;
    text-align: center;
    background: color-mix(in srgb, var(--bg-surface) 85%, transparent);
  }

  .detail {
    width: min(980px, 96vw);
    max-height: min(90vh, 900px);
    border: none;
    border-radius: var(--radius-lg);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-lg);
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
  }

  .detail-head {
    padding: 12px 14px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 16%, transparent);
    background: var(--bg-primary);
  }

  .detail-title {
    font-size: 26px;
    line-height: 1.1;
    letter-spacing: -0.025em;
    font-weight: 620;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-sub {
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .tabs {
    display: flex;
    gap: 2px;
    padding: 8px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--text-muted) 14%, transparent);
    background: var(--bg-primary);
  }

  .tab {
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    border-radius: 8px;
    padding: 7px 9px;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .tab:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tab.active {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .detail-body {
    min-height: 0;
    overflow: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 130;
    background: rgba(15, 23, 42, 0.42);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .btn {
    border: none;
    border-radius: 10px;
    height: 34px;
    padding: 0 12px;
    font-size: 13px;
    font-weight: 600;
    transition: opacity var(--transition-fast), transform var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
  }

  .btn:hover {
    transform: translateY(-1px);
  }

  .btn.muted {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .btn.primary {
    background: var(--text-primary);
    color: var(--bg-primary);
  }

  .btn.warn {
    background: color-mix(in srgb, var(--error) 14%, transparent);
    color: var(--error);
  }

  .btn:disabled {
    opacity: 0.52;
    cursor: default;
    transform: none;
  }

  @media (max-width: 1020px) {
    .shell {
      padding: 14px;
    }

    .grid {
      grid-template-columns: 1fr;
    }

    .card-title {
      font-size: 20px;
    }

    .title {
      font-size: 46px;
    }
  }
`
