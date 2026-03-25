import { useShallow } from 'zustand/react/shallow';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import {
  presentConversation,
  presentConversationSummary,
  selectConversationById,
} from '@/renderer/features/chat/model/conversation-presenters';

export function useChatSession() {
  const {
    conversations,
    draft,
    isStreaming,
    selectedConversationId,
  } = useAppStore(
    useShallow((state) => ({
      conversations: state.conversations,
      draft: state.draft,
      isStreaming: state.isStreaming,
      selectedConversationId: state.selectedConversationId,
    })),
  );

  const activeConversation = selectConversationById(
    conversations,
    selectedConversationId,
  );

  return {
    activeConversation: activeConversation
      ? presentConversation(activeConversation)
      : null,
    commandConversations: conversations.map((conversation) => ({
      ...presentConversationSummary(conversation),
      workspace: conversation.workspace,
    })),
    conversationSummaries: conversations.map((conversation) =>
      presentConversationSummary(conversation),
    ),
    draft,
    isStreaming,
    selectedConversationId,
  };
}

export function useShellState() {
  return useAppStore(
    useShallow((state) => ({
      isCommandOpen: state.isCommandOpen,
      isContextPanelOpen: state.isContextPanelOpen,
      route: state.route,
      selectedConversationId: state.selectedConversationId,
    })),
  );
}

export function useSettingsState() {
  return useAppStore(
    useShallow((state) => ({
      settingsRoute: state.settingsRoute,
      themePreference: state.themePreference,
    })),
  );
}
