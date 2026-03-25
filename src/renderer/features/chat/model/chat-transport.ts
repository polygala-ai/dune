import type { Conversation } from '@/renderer/features/chat/types';

export interface ChatTransport {
  streamReply: (
    conversation: Conversation | undefined,
    input: string,
  ) => AsyncIterable<string>;
}
