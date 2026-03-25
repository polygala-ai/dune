import { useAppStore } from '@/renderer/app/store/use-app-store';
import { createBlankConversation } from '@/renderer/features/chat/model/conversation-factories';
import { reorderConversations } from '@/renderer/features/chat/model/conversation-transforms';

import type {
  SettingsRoute,
  ThemePreference,
} from '@/renderer/features/settings/types';

function getConversationByOffset(
  conversationIds: string[],
  selectedConversationId: string,
  direction: -1 | 1,
) {
  const currentIndex = conversationIds.findIndex((id) => id === selectedConversationId);

  if (currentIndex === -1 || conversationIds.length === 0) {
    return null;
  }

  const nextIndex = (currentIndex + direction + conversationIds.length) % conversationIds.length;

  return conversationIds[nextIndex] ?? null;
}

export function startConversation() {
  const state = useAppStore.getState();
  const nextConversation = createBlankConversation(state.conversations.length + 1);

  state.insertConversation(nextConversation);
  state.setRoute('chat');
  state.setSelectedConversationId(nextConversation.id);

  return nextConversation.id;
}

export function openConversation(conversationId: string) {
  const state = useAppStore.getState();

  state.setConversations(reorderConversations(state.conversations, conversationId));
  state.setRoute('chat');
  state.setSelectedConversationId(conversationId);
}

export function cycleConversation(direction: -1 | 1) {
  const state = useAppStore.getState();
  const nextConversationId = getConversationByOffset(
    state.conversations.map((conversation) => conversation.id),
    state.selectedConversationId,
    direction,
  );

  if (!nextConversationId) {
    return;
  }

  state.setRoute('chat');
  state.setSelectedConversationId(nextConversationId);
}

export function openSettings() {
  const state = useAppStore.getState();

  state.setCommandOpen(false);
  state.setRoute('settings');
}

export function setCommandOpen(isOpen: boolean) {
  useAppStore.getState().setCommandOpen(isOpen);
}

export function toggleInspector(force?: boolean) {
  const state = useAppStore.getState();

  state.setContextPanelOpen(typeof force === 'boolean' ? force : !state.isContextPanelOpen);
}

export function setDraft(draft: string) {
  useAppStore.getState().setDraft(draft);
}

export function setSettingsRoute(route: SettingsRoute) {
  useAppStore.getState().setSettingsRoute(route);
}

export function setThemePreference(preference: ThemePreference) {
  useAppStore.getState().setThemePreference(preference);
}

export function useAppCommands() {
  return {
    cycleConversation,
    openConversation,
    openSettings,
    setCommandOpen,
    setDraft,
    setSettingsRoute,
    setThemePreference,
    startConversation,
    toggleInspector,
  };
}
