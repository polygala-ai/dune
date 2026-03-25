import { useEffect } from 'react';

import type { RefObject } from 'react';

import type { PresentedAgent } from '@/renderer/features/agents/types';
import type { AppRoute } from '@/renderer/app/store/types';

interface UseTranscriptScrollOptions {
  agent: PresentedAgent | null;
  route: AppRoute;
  transcriptRef: RefObject<HTMLDivElement | null>;
}

export function useTranscriptScroll({
  agent,
  route,
  transcriptRef,
}: UseTranscriptScrollOptions) {
  useEffect(() => {
    if (route !== 'agent') {
      return;
    }

    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [
    agent?.id,
    agent?.messages.length,
    agent?.messages.at(-1)?.content,
    route,
    transcriptRef,
  ]);
}
