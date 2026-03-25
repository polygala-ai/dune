import { type KeyboardEvent, type RefObject } from 'react';
import { ArrowUpRight } from 'lucide-react';

import type { PresentedConversation } from '@/renderer/features/chat/types';
import { useDesktopPlatform } from '@/renderer/shared/lib/use-desktop-platform';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';

interface ChatPanelProps {
  composerRef: RefObject<HTMLTextAreaElement | null>;
  conversation: PresentedConversation;
  draft: string;
  isStreaming: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (value: string) => Promise<void>;
  transcriptRef: RefObject<HTMLDivElement | null>;
}

function roleLabel(role: PresentedConversation['messages'][number]['role']) {
  switch (role) {
    case 'assistant':
      return 'Assistant';
    case 'user':
      return 'You';
    default:
      return 'System';
  }
}

export function ChatPanel({
  composerRef,
  conversation,
  draft,
  isStreaming,
  onDraftChange,
  onSubmit,
  transcriptRef,
}: ChatPanelProps) {
  const { modifierLabel } = useDesktopPlatform();

  const handleComposerKeyDown = async (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    const isPrimaryModifier = modifierLabel === '⌘' ? event.metaKey : event.ctrlKey;

    if (event.key === 'Enter' && isPrimaryModifier) {
      event.preventDefault();
      await onSubmit(draft);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div
        className="thin-scrollbar flex-1 min-h-0 overflow-y-auto px-8 pb-6 pt-8"
        ref={transcriptRef}
      >
        <div className="mx-auto flex min-w-0 max-w-3xl flex-col gap-3">
          <div className="mb-3 border-b border-app-border pb-4">
            <h2 className="truncate text-[1.35rem] font-semibold tracking-[-0.04em] text-app-text">
              {conversation.title}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-app-muted">
              <span>{conversation.workspace}</span>
              <span className="h-1 w-1 rounded-full bg-app-border-strong" />
              <span>{conversation.updatedLabel}</span>
            </div>
          </div>

          {conversation.messages.map((message) => {
            const isUser = message.role === 'user';

            return (
              <div
                className={cn(
                  'message-reveal flex min-w-0',
                  isUser ? 'justify-end' : 'justify-start',
                )}
                key={message.id}
              >
                <article
                  className={cn(
                    'min-w-0 max-w-[44rem]',
                    isUser ? 'rounded-[18px] bg-app-accent-soft px-4 py-3' : 'px-1 py-1',
                  )}
                >
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-app-muted">
                    <span>{roleLabel(message.role)}</span>
                    <span className="h-1 w-1 rounded-full bg-app-border-strong" />
                    <span>{message.createdAtLabel}</span>
                    {message.status === 'streaming' ? (
                      <>
                        <span className="h-1 w-1 rounded-full bg-app-border-strong" />
                        <span className="streaming-dot rounded-full text-app-accent">
                          Streaming
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="prose-message mt-2 break-words whitespace-pre-wrap text-[15px] leading-7 text-app-text">
                    {message.content || '…'}
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </div>

      <form
        className="shrink-0 border-t border-app-border px-8 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit(draft);
        }}
      >
        <div className="mx-auto max-w-3xl">
          <textarea
            aria-label="Composer"
            className="min-h-[84px] w-full bg-transparent px-1 text-[14px] leading-7 text-app-text outline-none placeholder:text-app-muted"
            disabled={isStreaming}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              void handleComposerKeyDown(event);
            }}
            placeholder="Reply..."
            ref={composerRef}
            rows={4}
            value={draft}
          />

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] leading-5 text-app-muted">
              {modifierLabel} Enter to send · Shift Enter for a new line
            </p>

            <Button disabled={!draft.trim() || isStreaming} size="sm" type="submit">
              {isStreaming ? 'Streaming…' : 'Send'}
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
