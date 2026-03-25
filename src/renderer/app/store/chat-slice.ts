import {
  createRuntimeAssistantMessage,
  createRuntimeUserMessage,
} from '@/renderer/features/chat/model/conversation-factories';
import {
  createInitialConversations,
  deriveConversationTitle,
  summarizeConversationPreview,
  updateConversation,
} from '@/renderer/features/chat/model/conversation-transforms';

import type {
  AppStoreSlice,
  ChatSlice,
  ChatState,
} from './types';

export function createInitialChatState(): ChatState {
  return {
    conversations: createInitialConversations(),
    draft: '',
    isStreaming: false,
  };
}

export function createChatSlice(initialState: ChatState): AppStoreSlice<ChatSlice> {
  return (set) => ({
    ...initialState,
    setDraft: (draft) => {
      set({ draft });
    },
    setConversations: (conversations) => {
      set({ conversations });
    },
    insertConversation: (conversation) => {
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        draft: '',
      }));
    },
    appendUserMessage: (conversationId, content) => {
      const now = Date.now();
      const newMessage = createRuntimeUserMessage(content, now);

      set((state) => {
        return {
          conversations: updateConversation(
            state.conversations,
            conversationId,
            (conversation) => ({
              ...conversation,
              messages: [...conversation.messages, newMessage],
              preview: summarizeConversationPreview(content),
              status: 'live',
              title: conversation.title.startsWith('New session')
                ? deriveConversationTitle(content)
                : conversation.title,
              updatedAt: now,
            }),
          ),
        };
      });
    },
    beginAssistantMessage: (conversationId) => {
      const now = Date.now();
      const messageId = `message-assistant-${now}`;

      set((state) => ({
        conversations: updateConversation(
          state.conversations,
          conversationId,
          (conversation) => ({
            ...conversation,
            messages: [
              ...conversation.messages,
              createRuntimeAssistantMessage(messageId, now),
            ],
            status: 'live',
            updatedAt: now,
          }),
        ),
        isStreaming: true,
      }));

      return messageId;
    },
    updateAssistantMessage: (
      conversationId,
      messageId,
      content,
      status = 'streaming',
    ) => {
      const now = Date.now();

      set((state) => ({
        conversations: updateConversation(
          state.conversations,
          conversationId,
          (conversation) => ({
            ...conversation,
            messages: conversation.messages.map((message) =>
              message.id === messageId
                ? {
                    ...message,
                    content,
                    status,
                  }
                : message,
            ),
            preview: status === 'complete'
              ? summarizeConversationPreview(content)
              : conversation.preview,
            status: status === 'complete' ? 'ready' : conversation.status,
            updatedAt: now,
          }),
        ),
      }));
    },
    completeAssistantMessage: (conversationId, messageId) => {
      const now = Date.now();

      set((state) => ({
        conversations: updateConversation(
          state.conversations,
          conversationId,
          (conversation) => {
            const completedMessage = conversation.messages.find(
              (message) => message.id === messageId,
            );

            return {
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === messageId
                  ? {
                      ...message,
                      status: 'complete',
                    }
                  : message,
              ),
              preview:
                completedMessage?.content.trim()
                  ? summarizeConversationPreview(completedMessage.content)
                  : conversation.preview,
              status: 'ready',
              updatedAt: now,
            };
          },
        ),
        isStreaming: false,
      }));
    },
  });
}
