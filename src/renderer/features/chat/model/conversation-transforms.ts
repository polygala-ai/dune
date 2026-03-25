import { createSeedConversations } from './seed-conversations';

import type { Conversation } from '@/renderer/features/chat/types';

export function createInitialConversations() {
  return createSeedConversations();
}

export function summarizeConversationPreview(content: string) {
  return content.replace(/\s+/g, ' ').trim().slice(0, 92);
}

export function deriveConversationTitle(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return 'New session';
  }

  const words = normalized.split(' ').slice(0, 6).join(' ');
  return words.length > 36 ? `${words.slice(0, 33)}…` : words;
}

export function reorderConversations(conversations: Conversation[], id: string) {
  const currentIndex = conversations.findIndex((conversation) => conversation.id === id);

  if (currentIndex <= 0) {
    return conversations;
  }

  const nextConversations = [...conversations];
  const [conversation] = nextConversations.splice(currentIndex, 1);

  if (!conversation) {
    return conversations;
  }

  nextConversations.unshift(conversation);

  return nextConversations;
}

export function updateConversation(
  conversations: Conversation[],
  id: string,
  updater: (conversation: Conversation) => Conversation,
) {
  return conversations.map((conversation) =>
    conversation.id === id ? updater(conversation) : conversation,
  );
}
