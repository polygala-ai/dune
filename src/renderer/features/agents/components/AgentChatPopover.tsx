// Agent chat popover UI.

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { GripHorizontal, Maximize2, X } from 'lucide-react';

import { AgentPanel } from '@/renderer/features/agents/components/AgentPanel';
import type { PresentedAgent } from '@/renderer/features/agents/types';
import { useAppStore } from '@/renderer/app/store/use-app-store';
import { agentRuntime } from '@/renderer/features/agents/runtime/agent-runtime';
import { cn } from '@/renderer/shared/lib/utils';

/** Agent chat popover props. */
interface AgentChatPopoverProps {
  agent: PresentedAgent;
  onClose: () => void;
  onExpand: () => void;
}

/** Renders the agent chat popover UI. */
export function AgentChatPopover({ agent, onClose, onExpand }: AgentChatPopoverProps) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draft = useAppStore((state) => state.agentDrafts[agent.id] ?? '');
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handleDraftChange = useCallback((value: string) => {
    useAppStore.getState().setDraft(agent.id, value);
  }, [agent.id]);

  const handleSubmit = useCallback(async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;

    try {
      await agentRuntime.service.sendMessage(agent.id, value);
      useAppStore.getState().setDraft(agent.id, '');
    } catch (error) {
      console.error(`Failed to send message to agent "${agent.id}".`, error);
    } finally {
      composerRef.current?.focus();
    }
  }, [agent.id, agent.channel.canCompose, agent.status]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [agent.activityEvents.length, agent.codingEngineEvents.length, agent.messages.length]);

  const handleDragStart = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const currentX = position?.x ?? rect.left;
    const currentY = position?.y ?? rect.top;

    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: currentX,
      origY: currentY,
    };

    /** Handles move. */
    const handleMove = (ev: globalThis.MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      setPosition({
        x: dragState.current.origX + dx,
        y: dragState.current.origY + dy,
      });
    };

    /** Handles up. */
    const handleUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [position]);

  const style = position
    ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' }
    : {};

  return (
    <div
      className={cn(
        'fixed z-50',
        'flex flex-col',
        'w-[420px] h-[560px]',
        'rounded-2xl border border-app-border',
        'bg-app-bg shadow-2xl shadow-black/20',
        'overflow-hidden',
        !position && 'bottom-4 right-4',
      )}
      ref={containerRef}
      style={style}
    >
      <div
        className="flex items-center justify-between border-b border-app-border px-4 py-2.5 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-app-muted/50" />
          <h3 className="truncate text-sm font-semibold text-app-text">
            {agent.name}
          </h3>
        </div>
        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          <button
            className="rounded-md p-1 text-app-muted hover:bg-app-hover hover:text-app-text"
            onClick={onExpand}
            title="Open full window"
            type="button"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            className="rounded-md p-1 text-app-muted hover:bg-app-hover hover:text-app-text"
            onClick={onClose}
            title="Close"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden [&_.agent-panel-scroll]:px-4 [&_.agent-panel-scroll]:pt-4 [&_.agent-panel-header]:hidden [&_form]:px-4 [&_form]:py-3 [&_textarea]:min-h-[48px] [&_textarea]:text-[13px]">
        <AgentPanel
          agent={agent}
          composerRef={composerRef}
          draft={draft}
          onDraftChange={handleDraftChange}
          onSubmit={handleSubmit}
          transcriptRef={transcriptRef}
        />
      </div>
    </div>
  );
}
