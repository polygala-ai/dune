import {
  useEffectEvent,
  useRef,
} from 'react';

export function useComposerFocus() {
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const focusComposer = useEffectEvent(() => {
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
  });

  return {
    composerRef,
    focusComposer,
  };
}
