import { css } from 'lit'

export const chatViewStyles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: transparent;
      position: relative;
      padding: 0;
      gap: 0;
    }

    /* ── Header ── */
    .header {
      display: flex;
      align-items: center;
      padding: 10px 16px 8px;
      background: transparent;
      min-height: 54px;
      gap: 14px;
      flex-shrink: 0;
    }

    .header-main {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
      flex: 1;
    }
    .header-avatar {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 600;
      color: white;
      cursor: pointer;
      flex-shrink: 0;
      transition: transform var(--transition-fast), filter var(--transition-fast);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
    }
    .header-avatar:hover {
      transform: translateY(-1px);
      filter: brightness(0.96);
    }

    .header-info {
      flex: 1;
      min-width: 0;
      display: grid;
      gap: 4px;
    }

    .header-kicker {
      font-size: 11px;
      line-height: 1.2;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .header-name {
      font-size: 18px;
      font-weight: 640;
      color: var(--text-primary);
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    .header-name.profile-trigger {
      cursor: pointer;
    }

    .header-name.profile-trigger:hover {
      color: var(--accent);
    }

    .header-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .status-dot.thinking {
      animation: pulse 1.5s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }
    /* ── Conversation ── */
    .conversation {
      flex: 1;
      overflow-y: auto;
      padding: 4px 18px 6px;
      min-height: 0;
    }
    .conversation-lane {
      width: min(var(--content-max-width), 100%);
      margin: 0 auto;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 40vh;
      gap: 12px;
      color: var(--text-muted);
      border: none;
      background: transparent;
    }
    .empty-avatar {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 600;
      color: white;
    }
    .empty-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .empty-subtitle {
      font-size: 13px;
      max-width: 360px;
      text-align: center;
      line-height: 1.5;
    }

    /* ── System entries (received, etc.) ── */
    .entry-system {
      display: flex;
      justify-content: center;
      padding: 5px 12px;
    }
    .system-pill {
      background: color-mix(in srgb, var(--bg-hover) 84%, white 16%);
      border-radius: 10px;
      border: 1px solid var(--border-color);
      padding: 4px 12px;
      font-size: 12px;
      color: var(--text-muted);
      font-style: italic;
      max-width: 600px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── Thinking indicator ── */
    .entry-thinking {
      display: flex;
      gap: 12px;
      padding: 7px 12px;
      max-width: 820px;
    }
    .thinking-dots {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 0;
    }
    .thinking-dots span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
      animation: thinking-bounce 1.4s ease-in-out infinite;
    }
    .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
    .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes thinking-bounce {
      0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1); }
    }

    /* ── Text entries (assistant response) ── */
    .entry-text {
      display: flex;
      gap: 12px;
      padding: 7px 12px;
      max-width: 820px;
    }
    .entry-avatar {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      color: white;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .entry-text-body {
      flex: 1;
      min-width: 0;
    }
    .entry-text-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      margin-bottom: 2px;
    }
    .entry-text-content {
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-primary);
      word-break: break-word;
    }
    .entry-text-content p { margin: 0 0 8px 0; }
    .entry-text-content p:last-child { margin-bottom: 0; }
    .entry-text-content code {
      background: var(--bg-code);
      color: var(--error);
      padding: 2px 5px;
      border-radius: 4px;
      border: none;
      font-family: var(--font-mono);
      font-size: 13px;
    }
    .entry-text-content pre {
      background: var(--bg-code);
      padding: 14px 16px;
      border-radius: 8px;
      border: none;
      overflow-x: auto;
      margin: 8px 0;
    }
    .entry-text-content pre code {
      background: none;
      border: none;
      color: var(--text-primary);
      padding: 0;
    }

    .chat-app-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: none;
      border-radius: 999px;
      background: var(--accent);
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      cursor: pointer;
      transition: background var(--transition-fast), transform var(--transition-fast);
      vertical-align: middle;
      margin: 0 2px;
      line-height: 1.4;
    }
    .chat-app-btn:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }

    /* ── Tool call / Tool result (collapsible cards) ── */
    .entry-tool {
      padding: 4px 12px 4px 48px;
    }
    .tool-card {
      border-radius: 12px;
      border: 1px solid var(--border-color);
      overflow: hidden;
      max-width: 720px;
      background: var(--bg-surface);
    }
    .tool-card.tool-use {
      background: color-mix(in srgb, var(--warning) 12%, var(--bg-surface));
    }
    .tool-card.tool-result {
      background: color-mix(in srgb, var(--accent-soft) 55%, var(--bg-surface));
    }
    .tool-card.tool-error {
      background: color-mix(in srgb, var(--error) 12%, var(--bg-surface));
    }
    .tool-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: color-mix(in srgb, var(--bg-hover) 80%, white 20%);
      cursor: pointer;
      user-select: none;
      transition: background var(--transition-fast);
    }
    .tool-header:hover {
      background: var(--bg-code);
    }
    .tool-chevron {
      font-size: 10px;
      color: var(--text-muted);
      transition: transform 0.15s;
      flex-shrink: 0;
      width: 12px;
    }
    .tool-chevron.open {
      transform: rotate(90deg);
    }
    .tool-icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      color: var(--text-secondary);
    }
    .tool-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tool-label-type {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 6px;
      border-radius: 3px;
      color: white;
      flex-shrink: 0;
      border-radius: 999px;
    }
    .tool-body {
      padding: 0;
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.2s ease, padding 0.2s ease;
    }
    .tool-body.open {
      padding: 10px 12px;
      max-height: 400px;
      overflow-y: auto;
    }
    .tool-code {
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.5;
      color: var(--text-primary);
      white-space: pre-wrap;
      word-break: break-all;
    }
    .tool-code.error {
      color: var(--error);
    }

    /* ── Result stats ── */
    .entry-result {
      padding: 5px 12px 5px 48px;
    }
    .result-bar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 10px 0;
      border-top: none;
      max-width: 720px;
      flex-wrap: wrap;
    }
    .result-stat {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 4px 9px;
      background: var(--bg-hover);
    }
    .result-label {
      color: var(--text-muted);
    }
    .result-value {
      font-weight: 600;
      font-family: var(--font-mono);
      color: var(--text-secondary);
    }

    /* ── Error entries ── */
    .entry-error {
      padding: 5px 12px 5px 48px;
    }
    .error-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: color-mix(in srgb, var(--error) 12%, transparent);
      border: none;
      border-radius: 8px;
      padding: 6px 14px;
      font-size: 13px;
      color: var(--error);
      font-weight: 600;
      max-width: 720px;
    }

    .error-pill svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      flex-shrink: 0;
    }

    /* ── User message (Slack-style, left-aligned) ── */
    .entry-user {
      display: flex;
      gap: 12px;
      padding: 7px 12px;
      max-width: 820px;
    }
    .user-avatar {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      color: white;
      flex-shrink: 0;
      margin-top: 2px;
      background: var(--accent);
    }
    .entry-user-body {
      flex: 1;
      min-width: 0;
    }
    .entry-user-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 2px;
    }
    .entry-user-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .entry-user-time {
      font-size: 11px;
      color: var(--text-muted);
    }
    .entry-user-content {
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-primary);
      word-break: break-word;
    }

    /* ── Mailbox notices ── */
    .entry-mailbox {
      padding: 5px 12px 5px 48px;
    }
    .mailbox-card {
      max-width: 720px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--warning) 12%, var(--bg-surface));
      color: var(--text-primary);
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .mailbox-copy {
      min-width: 0;
      flex: 1;
    }
    .mailbox-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .mailbox-meta {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
    }
    .mailbox-count {
      border-radius: 999px;
      background: color-mix(in srgb, var(--warning) 18%, var(--bg-hover));
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 700;
      padding: 6px 10px;
      white-space: nowrap;
      font-family: var(--font-mono);
    }

    /* ── Channel input (inbox card) ── */
    .entry-channel-input {
      padding: 4px 12px;
    }
    .channel-card {
      border-radius: 8px;
      border: none;
      background: color-mix(in srgb, var(--accent-soft) 55%, var(--bg-surface));
      overflow: hidden;
      max-width: 720px;
    }
    .channel-card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: var(--bg-hover);
      cursor: pointer;
      user-select: none;
      transition: background 0.1s;
    }
    .channel-card-header:hover {
      background: var(--bg-code);
    }
    .channel-card-icon {
      font-size: 14px;
      flex-shrink: 0;
    }
    .channel-card-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-primary);
      flex: 1;
    }
    .channel-card-count {
      font-size: 11px;
      color: var(--text-muted);
      flex-shrink: 0;
    }
    .channel-card-body {
      padding: 0;
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.2s ease, padding 0.2s ease;
    }
    .channel-card-body.open {
      padding: 8px 12px;
      max-height: 400px;
      overflow-y: auto;
    }
    .channel-msg {
      padding: 3px 0;
      font-size: 13px;
      line-height: 1.4;
    }
    .channel-msg-author {
      font-weight: 600;
      color: var(--text-primary);
    }
    .channel-msg-content {
      color: var(--text-secondary);
    }

    /* ── Unknown entries ── */
    .entry-unknown {
      padding: 4px 12px 4px 48px;
    }
    .unknown-code {
      background: var(--bg-code);
      border: none;
      border-radius: var(--radius-sm);
      padding: 10px 14px;
      font-family: var(--font-mono);
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-all;
      max-width: 720px;
      color: var(--text-primary);
    }

    /* ── Input area ── */
    .input-area {
      padding: 6px 12px 8px;
      flex-shrink: 0;
      background: var(--dock-bg);
    }

    .input-guard {
      width: min(calc(var(--content-max-width) + 24px), 100%);
      margin: 0 auto 6px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--warning) 10%, var(--dock-bg));
      color: var(--text-primary);
      padding: 10px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      border: 1px solid var(--dock-border);
    }

    .input-guard-copy {
      font-size: var(--text-secondary-size);
      line-height: 1.4;
      color: var(--text-secondary);
    }

    .input-guard-btn {
      border: 1px solid var(--control-border);
      border-radius: 10px;
      min-height: var(--control-height);
      padding: 0 10px;
      background: var(--control-bg);
      color: var(--text-primary);
      font-size: var(--text-secondary-size);
      font-weight: 600;
    }

    .composer-shell {
      position: relative;
      width: min(calc(var(--content-max-width) + 24px), 100%);
      margin-inline: auto;
    }

    .composer-aux-btn {
      border: 1px solid var(--control-border);
      border-radius: 999px;
      background: var(--control-bg);
      color: var(--text-secondary);
      font-size: 11px;
      padding: 0 10px;
      min-height: var(--control-height);
      line-height: 1;
      cursor: pointer;
      transition: background var(--transition-fast), color var(--transition-fast);
      font-weight: 600;
      white-space: nowrap;
    }

    .composer-aux-btn:hover {
      background: var(--control-bg-hover);
      border-color: var(--border-primary);
      color: var(--text-primary);
    }

    .composer-aux-btn.success {
      color: var(--success);
    }

    .composer-aux-btn.success:hover {
      background: color-mix(in srgb, var(--success) 12%, transparent);
    }

    .composer-aux-btn.danger {
      color: var(--error);
    }

    .composer-aux-btn.danger:hover {
      background: color-mix(in srgb, var(--error) 12%, transparent);
    }

    .mount-popover {
      position: absolute;
      left: 0;
      right: 0;
      bottom: calc(100% + 8px);
      z-index: 70;
    }

    @media (max-width: 760px) {
      .input-area {
        padding-bottom: 8px;
      }

      .composer-shell {
        width: calc(100% - 20px);
      }

      .input-guard {
        width: calc(100% - 20px);
      }
    }
`
