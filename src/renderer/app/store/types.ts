import type { StateCreator } from 'zustand';

import type {
  Conversation,
  ConversationSummary,
  MessageStatus,
} from '@/renderer/features/chat/types';
import type {
  SettingsRoute,
  ThemePreference,
} from '@/renderer/features/settings/types';

export type AppRoute = 'chat' | 'settings';

export interface ChatState {
  conversations: Conversation[];
  draft: string;
  isStreaming: boolean;
}

export interface ChatActions {
  appendUserMessage: (conversationId: string, content: string) => void;
  beginAssistantMessage: (conversationId: string) => string;
  completeAssistantMessage: (conversationId: string, messageId: string) => void;
  insertConversation: (conversation: Conversation) => void;
  setConversations: (conversations: Conversation[]) => void;
  setDraft: (draft: string) => void;
  updateAssistantMessage: (
    conversationId: string,
    messageId: string,
    content: string,
    status?: MessageStatus,
  ) => void;
}

export type ChatSlice = ChatState & ChatActions;

export interface SettingsState {
  settingsRoute: SettingsRoute;
  themePreference: ThemePreference;
}

export interface SettingsActions {
  setSettingsRoute: (route: SettingsRoute) => void;
  setThemePreference: (preference: ThemePreference) => void;
}

export type SettingsSlice = SettingsState & SettingsActions;

export interface ShellState {
  isCommandOpen: boolean;
  isContextPanelOpen: boolean;
  route: AppRoute;
  selectedConversationId: string;
}

export interface ShellActions {
  setCommandOpen: (isOpen: boolean) => void;
  setContextPanelOpen: (isOpen: boolean) => void;
  setRoute: (route: AppRoute) => void;
  setSelectedConversationId: (conversationId: string) => void;
}

export type ShellSlice = ShellState & ShellActions;

export type AppStoreState = ChatState & SettingsState & ShellState;
export type AppStore = AppStoreState & ChatActions & SettingsActions & ShellActions;
export type AppStoreSlice<T> = StateCreator<AppStore, [], [], T>;

export interface ChatSessionState {
  activeConversation: Conversation | null;
  conversationSummaries: ConversationSummary[];
  draft: string;
  isStreaming: boolean;
  selectedConversationId: string;
}
