export type MessageRole = 'assistant' | 'system' | 'user';
export type MessageStatus = 'complete' | 'streaming';
export type ConversationStatus = 'draft' | 'live' | 'ready';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  status: MessageStatus;
}

export interface ContextCard {
  id: string;
  title: string;
  eyebrow: string;
  body: string;
}

export interface PresentedMessage extends Message {
  createdAtLabel: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  preview: string;
  updatedLabel: string;
  statusLabel: string;
}

export interface Conversation extends Pick<ConversationSummary, 'id' | 'title' | 'preview'> {
  note: string;
  status: ConversationStatus;
  updatedAt: number;
  workspace: string;
  contextCards: ContextCard[];
  messages: Message[];
}

export interface PresentedConversation extends ConversationSummary {
  id: string;
  note: string;
  status: ConversationStatus;
  updatedAt: number;
  workspace: string;
  contextCards: ContextCard[];
  messages: PresentedMessage[];
}
