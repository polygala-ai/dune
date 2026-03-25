import { useEffect } from 'react';

import type { RefObject } from 'react';

import type { PresentedConversation } from '@/renderer/features/chat/types';
import type { AppRoute } from '@/renderer/app/store/types';

interface UseTranscriptScrollOptions {
  conversation: PresentedConversation | null;
  route: AppRoute;
  transcriptRef: RefObject<HTMLDivElement | null>;
}

export function useTranscriptScroll({
  conversation,
  route,
  transcriptRef,
}: UseTranscriptScrollOptions) {
  useEffect(() => {
    if (route !== 'chat') {
      return;
    }

    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [
    conversation?.id,
    conversation?.messages.length,
    conversation?.messages.at(-1)?.content,
    route,
    transcriptRef,
  ]);
}
