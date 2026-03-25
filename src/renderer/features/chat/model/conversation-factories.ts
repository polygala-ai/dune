import type {
  Conversation,
  Message,
} from '@/renderer/features/chat/types';

export function createConversationId(slug: string) {
  return `conversation-${slug}`;
}

export function createMessageId(slug: string) {
  return `message-${slug}`;
}

export function createBlankConversation(
  index: number,
  now: number = Date.now(),
): Conversation {
  const paddedIndex = String(index).padStart(2, '0');

  return {
    id: `conversation-new-${index}-${now}`,
    title: `New session ${paddedIndex}`,
    preview: 'Fresh prompt awaiting direction.',
    updatedAt: now,
    status: 'draft',
    workspace: 'Prototype shell',
    note: 'New chats begin from a blank shell and stay local to this session.',
    contextCards: [
      {
        id: `new-session-${index}-1`,
        eyebrow: 'Fresh context',
        title: 'Use this space to sketch',
        body: 'Start with a prompt, interface request, or implementation task. The mock assistant reply will stream into this thread.',
      },
      {
        id: `new-session-${index}-2`,
        eyebrow: 'Prototype scope',
        title: 'No backend, no persistence',
        body: 'This conversation exists only until the app closes, which keeps the prototype honest while the shell matures.',
      },
      {
        id: `new-session-${index}-3`,
        eyebrow: 'Keyboard flow',
        title: 'Stay on the keys',
        body: 'Use quick switch, new chat, and context toggles to move through the shell without reaching for extra chrome.',
      },
    ],
    messages: [
      {
        id: `message-new-${index}-welcome`,
        role: 'assistant',
        createdAt: now,
        status: 'complete',
        content:
          'Start with a design brief, an implementation slice, or a product question.\n\nI’ll answer inside the prototype shell and stream the reply back into this thread.',
      },
    ],
  };
}

export function createRuntimeUserMessage(
  content: string,
  now: number = Date.now(),
): Message {
  return {
    id: `message-user-${now}`,
    role: 'user',
    content,
    createdAt: now,
    status: 'complete',
  };
}

export function createRuntimeAssistantMessage(
  messageId: string,
  now: number = Date.now(),
): Message {
  return {
    id: messageId,
    role: 'assistant',
    content: '',
    createdAt: now,
    status: 'streaming',
  };
}
