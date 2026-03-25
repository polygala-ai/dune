import { useEffectEvent } from 'react';

import { startConversation } from '@/renderer/app/store/app-commands';
import { useAppStore } from '@/renderer/app/store/use-app-store';
import type { ChatTransport } from '@/renderer/features/chat/model/chat-transport';
import { mockChatTransport } from '@/renderer/features/chat/transports/mock-chat-transport';

interface UseConversationSubmitOptions {
  focusComposer: () => void;
  transport?: ChatTransport;
}

export function useConversationSubmit({
  focusComposer,
  transport = mockChatTransport,
}: UseConversationSubmitOptions) {
  const isStreaming = useAppStore((state) => state.isStreaming);
  const selectedConversationId = useAppStore(
    (state) => state.selectedConversationId,
  );

  const appendUserMessage = useAppStore((state) => state.appendUserMessage);
  const beginAssistantMessage = useAppStore(
    (state) => state.beginAssistantMessage,
  );
  const completeAssistantMessage = useAppStore(
    (state) => state.completeAssistantMessage,
  );
  const setDraft = useAppStore((state) => state.setDraft);
  const updateAssistantMessage = useAppStore(
    (state) => state.updateAssistantMessage,
  );

  return useEffectEvent(async (rawValue: string) => {
    const value = rawValue.trim();

    if (!value || isStreaming) {
      return;
    }

    const conversationId = selectedConversationId || startConversation();

    setDraft('');
    appendUserMessage(conversationId, value);

    const conversation = useAppStore
      .getState()
      .conversations.find((item) => item.id === conversationId);
    const assistantMessageId = beginAssistantMessage(conversationId);

    try {
      let streamedContent = '';

      for await (const chunk of transport.streamReply(conversation, value)) {
        streamedContent += chunk;
        updateAssistantMessage(
          conversationId,
          assistantMessageId,
          streamedContent,
          'streaming',
        );
      }

      updateAssistantMessage(
        conversationId,
        assistantMessageId,
        streamedContent,
        'complete',
      );
      completeAssistantMessage(conversationId, assistantMessageId);
    } catch (error) {
      const fallback =
        'The prototype reply stalled while streaming. Submit again and the session will reset the assistant output.';

      updateAssistantMessage(
        conversationId,
        assistantMessageId,
        fallback,
        'complete',
      );
      completeAssistantMessage(conversationId, assistantMessageId);
      console.error(error);
    } finally {
      focusComposer();
    }
  });
}
