import type { Conversation } from '@/renderer/features/chat/types';

import {
  createConversationId,
  createMessageId,
} from './conversation-factories';
import { createRelativeTimestamp } from './time';

export function createSeedConversations(now: number = Date.now()): Conversation[] {
  const studioShellUpdatedAt = createRelativeTimestamp(now, { minutes: 48 });
  const composerPolishUpdatedAt = createRelativeTimestamp(now, { hours: 4, minutes: 12 });
  const settingsSurfaceUpdatedAt = createRelativeTimestamp(now, { days: 1, hours: 3 });
  const launchChecklistUpdatedAt = createRelativeTimestamp(now, { days: 3, hours: 5 });

  return [
    {
      id: createConversationId('studio-shell'),
      title: 'Studio shell',
      preview:
        'Map the window layout, spacing rhythm, and tone before touching any backend detail.',
      updatedAt: studioShellUpdatedAt,
      status: 'live',
      workspace: 'Desktop shell',
      note: 'A tight shell with deliberate spacing keeps the prototype closer to a product than a demo dashboard.',
      contextCards: [
        {
          id: 'surface-direction',
          eyebrow: 'Surface direction',
          title: 'Paper, graphite, and a narrow accent range',
          body: 'Warm neutrals keep the desktop shell calm while still leaving enough contrast for message hierarchy and keyboard hints.',
        },
        {
          id: 'interaction-bias',
          eyebrow: 'Interaction bias',
          title: 'Keyboard first, pointer friendly',
          body: 'Fast switching, a stable composer, and a quiet command palette matter more than heavy chrome or decorative controls.',
        },
        {
          id: 'prototype-rule',
          eyebrow: 'Prototype rule',
          title: 'Everything resets on relaunch',
          body: 'Seeded conversations make the app feel inhabited without introducing persistence, auth, or backend wiring yet.',
        },
      ],
      messages: [
        {
          id: createMessageId('studio-shell-1'),
          role: 'assistant',
          createdAt: createRelativeTimestamp(now, { minutes: 58 }),
          status: 'complete',
          content:
            'Let the shell do most of the work.\n\nKeep the sidebar deliberate, let the transcript breathe, and treat the right panel as ambient context rather than a competing dashboard.',
        },
        {
          id: createMessageId('studio-shell-2'),
          role: 'user',
          createdAt: createRelativeTimestamp(now, { minutes: 55 }),
          status: 'complete',
          content:
            'I want it to feel closer to Codex than a generic productivity app, but still original.',
        },
        {
          id: createMessageId('studio-shell-3'),
          role: 'assistant',
          createdAt: studioShellUpdatedAt,
          status: 'complete',
          content:
            'Anchor that with layout and restraint rather than imitation.\n\nA quiet left rail, wide transcript column, compact context panel, and clear keyboard affordances will read as agentic without copying brand cues.',
        },
      ],
    },
    {
      id: createConversationId('composer-polish'),
      title: 'Composer polish',
      preview:
        'The input should feel like a drafting surface, not a chat widget bolted onto the bottom.',
      updatedAt: composerPolishUpdatedAt,
      status: 'ready',
      workspace: 'Interaction details',
      note: 'The composer should stay steady under streaming replies, with just enough utility text to hint at shortcuts and send behavior.',
      contextCards: [
        {
          id: 'composer-tone',
          eyebrow: 'Composer tone',
          title: 'Drafting surface over message box',
          body: 'Use roomier line height, generous internal padding, and a restrained send affordance so the input feels purposeful.',
        },
        {
          id: 'send-behavior',
          eyebrow: 'Send behavior',
          title: 'Modifier-based submit',
          body: 'Allow multiline drafting, then keep submission on primary-modifier + Enter to preserve composition flow.',
        },
        {
          id: 'feedback',
          eyebrow: 'Streaming feedback',
          title: 'Show progress without noise',
          body: 'A quiet streaming marker and a disabled send state are enough. Avoid loud progress bars or spinner-heavy chrome.',
        },
      ],
      messages: [
        {
          id: createMessageId('composer-polish-1'),
          role: 'assistant',
          createdAt: createRelativeTimestamp(now, { hours: 4, minutes: 23 }),
          status: 'complete',
          content:
            'Treat the composer as a drafting stage.\n\nIf the input area looks disposable, the whole app will feel disposable.',
        },
        {
          id: createMessageId('composer-polish-2'),
          role: 'user',
          createdAt: createRelativeTimestamp(now, { hours: 4, minutes: 20 }),
          status: 'complete',
          content:
            'How do we keep it minimal without losing the sense of flow while streaming?',
        },
        {
          id: createMessageId('composer-polish-3'),
          role: 'assistant',
          createdAt: composerPolishUpdatedAt,
          status: 'complete',
          content:
            'Pin the composer, keep the controls sparse, and let the transcript absorb the motion.\n\nThe input stays still; the conversation moves.',
        },
      ],
    },
    {
      id: createConversationId('settings-surface'),
      title: 'Settings surface',
      preview: 'A dedicated page is fine, but keep it lean and clearly prototype-scoped.',
      updatedAt: settingsSurfaceUpdatedAt,
      status: 'draft',
      workspace: 'Preferences',
      note: 'Settings should feel like part of the same shell, not a separate control panel app.',
      contextCards: [
        {
          id: 'scope-guardrail',
          eyebrow: 'Scope guardrail',
          title: 'Only theme changes are live',
          body: 'Everything else should read as informative or future-facing so the prototype stays honest about capability.',
        },
        {
          id: 'structure',
          eyebrow: 'Structure',
          title: 'Use section navigation instead of tabs',
          body: 'A slim left rail inside settings makes the page easier to expand later without adding route sprawl today.',
        },
        {
          id: 'shortcuts',
          eyebrow: 'Shortcuts',
          title: 'Keep the keyboard reference visible',
          body: 'This app wants to be used from the keyboard, so shortcuts belong in Settings as first-class product language.',
        },
      ],
      messages: [
        {
          id: createMessageId('settings-surface-1'),
          role: 'user',
          createdAt: createRelativeTimestamp(now, { days: 1, hours: 3, minutes: 6 }),
          status: 'complete',
          content: 'Do we really need a full page for settings in v1?',
        },
        {
          id: createMessageId('settings-surface-2'),
          role: 'assistant',
          createdAt: settingsSurfaceUpdatedAt,
          status: 'complete',
          content:
            'Yes, if the page stays restrained.\n\nIt gives the shell credibility, keeps `Cmd+,` meaningful, and leaves room for future backend controls without polluting the main workspace.',
        },
      ],
    },
    {
      id: createConversationId('launch-checklist'),
      title: 'Launch checklist',
      preview:
        'Before packaging, verify the shell, keyboard flow, and theme handling under a minimum window width.',
      updatedAt: launchChecklistUpdatedAt,
      status: 'ready',
      workspace: 'QA',
      note: 'Smoke coverage is mostly about launch confidence: does the app open, route, and stream without looking broken?',
      contextCards: [
        {
          id: 'launch-smoke',
          eyebrow: 'Smoke pass',
          title: 'Open app, switch views, send one prompt',
          body: 'That single loop catches most shell regressions in a desktop prototype before manual polish begins.',
        },
        {
          id: 'window-size',
          eyebrow: 'Window size',
          title: 'Protect the minimum width',
          body: 'The three-pane layout only works if the content column keeps enough air for both transcript and composer.',
        },
        {
          id: 'theme-parity',
          eyebrow: 'Theme parity',
          title: 'Light and dark need equal polish',
          body: 'Both modes should feel designed, not like one is just an inverted fallback.',
        },
      ],
      messages: [
        {
          id: createMessageId('launch-checklist-1'),
          role: 'assistant',
          createdAt: launchChecklistUpdatedAt,
          status: 'complete',
          content:
            'Package the app only after the workspace feels stable at the minimum size and the settings route doesn’t break the visual rhythm.',
        },
      ],
    },
  ];
}
