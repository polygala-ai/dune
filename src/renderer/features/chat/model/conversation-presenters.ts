import {
  formatConversationStatus,
  formatConversationTimestamp,
  formatMessageTimestamp,
} from './time';

import type {
  Conversation,
  ConversationSummary,
  PresentedConversation,
} from '@/renderer/features/chat/types';

export function presentConversationSummary(
  conversation: Conversation,
  now: number = Date.now(),
): ConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    preview: conversation.preview,
    updatedLabel: formatConversationTimestamp(conversation.updatedAt, now),
    statusLabel: formatConversationStatus(conversation.status),
  };
}

export function presentConversation(
  conversation: Conversation,
  now: number = Date.now(),
): PresentedConversation {
  return {
    ...conversation,
    ...presentConversationSummary(conversation, now),
    messages: conversation.messages.map((message) => ({
      ...message,
      createdAtLabel: formatMessageTimestamp(message.createdAt, now),
    })),
  };
}

export function selectConversationById(
  conversations: Conversation[],
  selectedConversationId: string,
) {
  return (
    conversations.find((conversation) => conversation.id === selectedConversationId) ??
    conversations[0] ??
    null
  );
}
