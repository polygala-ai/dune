import {
  type HTMLAttributes,
  useEffect,
  useState,
} from 'react';
import {
  ArrowLeft,
  RotateCcw,
  X,
} from 'lucide-react';

import { useAppStore } from '@/renderer/app/store/use-app-store';
import { AgentCustomizationEditor } from '@/renderer/features/agents/components/AgentCustomizationEditor';
import { AgentContextPanel } from '@/renderer/features/agents/components/AgentContextPanel';
import { TelegramChannelSetupCard } from '@/renderer/features/agents/components/TelegramChannelSetupCard';
import {
  cloneAgentCustomizationDraft,
  createEmptyAgentCustomizationDraft,
  getAgentCustomizationSummary,
  hasAgentCustomization,
  type AgentCustomizationDraft,
} from '@/renderer/features/agents/model/agent-customization';
import {
  agentRuntime,
  syncAgentRuntimeSnapshot,
} from '@/renderer/features/agents/runtime/agent-runtime';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Button } from '@/renderer/shared/ui/button';
import { ScrollArea } from '@/renderer/shared/ui/scroll-area';

import type {
  AgentExternalTarget,
  PresentedAgent,
  TelegramSetupSession,
} from '@/renderer/features/agents/types';

interface ContextPanelHostProps {
  agent: PresentedAgent | null;
  customization: AgentCustomizationDraft | null;
  inlineResizeHandleProps?: HTMLAttributes<HTMLDivElement>;
  isInlineResizing?: boolean;
  mode: 'hidden' | 'inline' | 'overlay';
  onClose: () => void;
  onDeleteAgent?: () => Promise<void> | void;
}

interface CustomizationSurfaceProps {
  agentRole: PresentedAgent['role'];
  artifactsPath?: string | undefined;
  draft: AgentCustomizationDraft;
  onBack?: () => void;
  onCancel: () => void;
  onChange: (value: AgentCustomizationDraft) => void;
  onReset: () => void;
  onSave: () => void;
}

interface TelegramSetupSurfaceProps {
  agent: PresentedAgent;
  errorMessage?: string | null;
  isApplying: boolean;
  matchedChat: AgentExternalTarget | null;
  onApply: () => Promise<void>;
  onCancel: () => void;
  onSessionChange: (session: TelegramSetupSession | null) => void;
  session: TelegramSetupSession | null;
}

function AgentCustomizationSurface({
  agentRole,
  artifactsPath,
  draft,
  onBack,
  onCancel,
  onChange,
  onReset,
  onSave,
}: CustomizationSurfaceProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-app-border px-6 py-5">
        <div className="flex min-w-0 items-start gap-2">
          {onBack ? (
            <Button
              aria-label="Back to inspector"
              className="mt-0.5 shrink-0"
              onClick={onBack}
              size="icon"
              type="button"
              variant="quiet"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
          <div className="min-w-0">
            <div className="surface-eyebrow">Customization</div>
            <DialogTitle className="mt-2 text-[1.15rem] font-semibold tracking-[-0.04em] text-app-text">
              Edit customization
            </DialogTitle>
            <DialogDescription className="mt-2 max-w-[32rem] text-sm leading-6 text-app-muted">
              Draft only. Stored locally for this session.
            </DialogDescription>
          </div>
        </div>
        <Button
          aria-label="Close customization editor"
          className="shrink-0"
          onClick={onCancel}
          size="icon"
          type="button"
          variant="quiet"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1" contentWidth="fill">
        <div className="px-6 py-6">
          <AgentCustomizationEditor
            agentRole={agentRole}
            artifactsPath={artifactsPath}
            value={draft}
            onChange={onChange}
          />
        </div>
      </ScrollArea>

      <div className="flex flex-col gap-3 border-t border-app-border bg-app-panel/35 px-6 py-4">
        <div className="min-w-0 text-xs leading-5 text-app-muted">
          {hasAgentCustomization(draft)
            ? getAgentCustomizationSummary(draft)
            : 'No draft'}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button onClick={onReset} type="button" variant="quiet">
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>
          <Button onClick={onCancel} type="button" variant="quiet">
            Cancel
          </Button>
          <Button onClick={onSave} type="button">
            Save draft
          </Button>
        </div>
      </div>
    </div>
  );
}

function TelegramSetupSurface({
  agent,
  errorMessage = null,
  isApplying,
  matchedChat,
  onApply,
  onCancel,
  onSessionChange,
}: TelegramSetupSurfaceProps) {
  const canApply = Boolean(matchedChat && !isApplying);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-app-border px-6 py-5">
        <div className="min-w-0">
          <div className="surface-eyebrow">Connection</div>
          <DialogTitle className="mt-2 text-[1.15rem] font-semibold tracking-[-0.04em] text-app-text">
            Telegram setup
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-[32rem] text-sm leading-6 text-app-muted">
            Pair a Telegram chat here, then save the channel change from this popup.
          </DialogDescription>
        </div>
        <Button
          aria-label="Close Telegram setup"
          className="shrink-0"
          disabled={isApplying}
          onClick={onCancel}
          size="icon"
          type="button"
          variant="quiet"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1" contentWidth="fill">
        <div className="px-6 py-6">
          <TelegramChannelSetupCard
            agent={agent}
            onSessionChange={onSessionChange}
          />
        </div>
      </ScrollArea>

      <div className="flex flex-col gap-3 border-t border-app-border bg-app-panel/35 px-6 py-4">
        <div className="min-w-0 text-xs leading-5 text-app-muted">
          {matchedChat
            ? `Matched chat ready: ${matchedChat.name}`
            : 'Complete Telegram pairing to enable saving.'}
        </div>
        {errorMessage ? (
          <div className="min-w-0 text-xs leading-5 text-red-600">
            {errorMessage}
          </div>
        ) : null}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button disabled={isApplying} onClick={onCancel} type="button" variant="quiet">
            Close
          </Button>
          <Button
            disabled={!canApply}
            onClick={() => {
              void onApply();
            }}
            type="button"
          >
            {isApplying ? 'Saving…' : 'Save Telegram channel'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ContextPanelHost({
  agent,
  customization,
  inlineResizeHandleProps,
  isInlineResizing = false,
  mode,
  onClose,
  onDeleteAgent,
}: ContextPanelHostProps) {
  const resetAgentCustomization = useAppStore((state) => state.resetAgentCustomization);
  const upsertAgentCustomization = useAppStore((state) => state.upsertAgentCustomization);
  const artifactsPath = useAppStore((state) => state.runtimeInfo.artifactsPath);
  const codingEngines = useAppStore((state) => state.codingEngines);
  const deleteAgentProps = onDeleteAgent ? { onDeleteAgent } : {};
  const [isEditingCustomization, setEditingCustomization] = useState(false);
  const [isApplyingTelegramChannel, setApplyingTelegramChannel] = useState(false);
  const [isTelegramSetupOpen, setTelegramSetupOpen] = useState(false);
  const [telegramSetupError, setTelegramSetupError] = useState<string | null>(null);
  const [telegramSetupSession, setTelegramSetupSession] = useState<TelegramSetupSession | null>(null);
  const [telegramSetupSessionId, setTelegramSetupSessionId] = useState<string | null>(null);
  const [telegramMatchedChat, setTelegramMatchedChat] = useState<AgentExternalTarget | null>(null);
  const [draft, setDraft] = useState(createEmptyAgentCustomizationDraft);

  useEffect(() => {
    setEditingCustomization(false);
    setDraft(cloneAgentCustomizationDraft(customization));
  }, [agent?.id, customization, mode]);

  useEffect(() => {
    setTelegramSetupOpen(false);
    setApplyingTelegramChannel(false);
    setTelegramSetupError(null);
    setTelegramSetupSession(null);
    setTelegramSetupSessionId(null);
    setTelegramMatchedChat(null);
  }, [agent?.id, agent?.channel.id, mode]);

  const openCustomizationEditor = () => {
    setDraft(cloneAgentCustomizationDraft(customization));
    setEditingCustomization(true);
  };

  const closeCustomizationEditor = () => {
    setEditingCustomization(false);
    setDraft(cloneAgentCustomizationDraft(customization));
  };

  const handleSaveCustomization = () => {
    if (!agent) {
      return;
    }

    if (hasAgentCustomization(draft)) {
      upsertAgentCustomization(agent.id, draft);
    } else {
      resetAgentCustomization(agent.id);
    }

    setEditingCustomization(false);
  };

  const handleResetCustomization = () => {
    if (!agent) {
      return;
    }

    resetAgentCustomization(agent.id);
    setDraft(createEmptyAgentCustomizationDraft());
    setEditingCustomization(false);
  };

  const closeTelegramSetup = () => {
    setTelegramSetupOpen(false);
    setApplyingTelegramChannel(false);
    setTelegramSetupError(null);
    setTelegramSetupSession(null);
    setTelegramSetupSessionId(null);
    setTelegramMatchedChat(null);
  };

  const handleTelegramSetupSessionChange = (session: TelegramSetupSession | null) => {
    setTelegramSetupSession(session);
    setTelegramSetupError(null);

    if (session?.id) {
      setTelegramSetupSessionId(session.id);
    }

    if (session?.matchedChat) {
      setTelegramMatchedChat(session.matchedChat);
      return;
    }

    if (session) {
      setTelegramMatchedChat(null);
    }
  };

  const handleApplyTelegramChannel = async () => {
    const setupSessionId = telegramSetupSession?.id ?? telegramSetupSessionId;

    if (!agent || !setupSessionId || !telegramMatchedChat) {
      return;
    }

    setApplyingTelegramChannel(true);
    setTelegramSetupError(null);

    try {
      await agentRuntime.service.updateAgentChannel({
        agentId: agent.id,
        channelId: 'telegram',
        telegramSetupSessionId: setupSessionId,
      });
      await syncAgentRuntimeSnapshot('agent-context-telegram-channel-save');
      setTelegramSetupOpen(false);
    } catch (error) {
      setTelegramSetupError(`Failed to save Telegram channel. ${String(error)}`);
    } finally {
      setApplyingTelegramChannel(false);
    }
  };

  if (mode === 'hidden' || !agent) {
    return null;
  }

  if (mode === 'inline') {
    return (
      <div className="relative min-h-0 min-w-0">
        {inlineResizeHandleProps ? (
          <div
            {...inlineResizeHandleProps}
            className="context-panel-resize-handle"
            data-resizing={isInlineResizing}
          />
        ) : null}
        <AgentContextPanel
          agent={agent}
          className="h-full border-l border-app-border"
          codingEngines={codingEngines}
          customization={customization}
          onClose={onClose}
          onEditCustomization={openCustomizationEditor}
          onOpenTelegramSetup={() => {
            setTelegramSetupError(null);
            setTelegramSetupOpen(true);
          }}
          telegramSetupSession={telegramSetupSession}
          onUpdateChannel={async (input) => {
            await agentRuntime.service.updateAgentChannel({
              agentId: agent.id,
              ...input,
            });
          }}
          {...deleteAgentProps}
        />
        <Dialog
          onOpenChange={(open) => {
            if (!open) {
              closeCustomizationEditor();
            }
          }}
          open={isEditingCustomization}
        >
          <DialogContent className="flex h-[min(90vh,860px)] w-[min(94vw,900px)] flex-col overflow-hidden p-0">
            <AgentCustomizationSurface
              agentRole={agent.role}
              artifactsPath={artifactsPath}
              draft={draft}
              onCancel={closeCustomizationEditor}
              onChange={setDraft}
              onReset={handleResetCustomization}
              onSave={handleSaveCustomization}
            />
          </DialogContent>
        </Dialog>
        <Dialog
          onOpenChange={(open) => {
            if (!open && !isApplyingTelegramChannel) {
              closeTelegramSetup();
            }
          }}
          open={isTelegramSetupOpen}
        >
          <DialogContent className="flex h-[min(90vh,780px)] w-[min(94vw,720px)] flex-col overflow-hidden p-0">
            <TelegramSetupSurface
              agent={agent}
              errorMessage={telegramSetupError}
              isApplying={isApplyingTelegramChannel}
              matchedChat={telegramMatchedChat}
              onApply={handleApplyTelegramChannel}
              onCancel={closeTelegramSetup}
              onSessionChange={handleTelegramSetupSessionChange}
              session={telegramSetupSession}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent
        className="shell-context-drawer"
        data-dialog-motion="drawer"
        overlayProps={{
          'data-testid': 'context-panel-overlay',
          onClick: onClose,
        }}
      >
        {isEditingCustomization ? (
          <AgentCustomizationSurface
            agentRole={agent.role}
            artifactsPath={artifactsPath}
            draft={draft}
            onBack={closeCustomizationEditor}
            onCancel={onClose}
            onChange={setDraft}
            onReset={handleResetCustomization}
            onSave={handleSaveCustomization}
          />
        ) : (
          <>
            <DialogTitle className="sr-only">Agent inspector</DialogTitle>
            <DialogDescription className="sr-only">
              Inspect the current agent workspace.
            </DialogDescription>
            <DialogClose asChild>
              <Button
                aria-label="Close context panel"
                className="absolute right-4 top-4 z-10"
                size="icon"
                type="button"
                variant="quiet"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
            <AgentContextPanel
              agent={agent}
              className="app-no-drag h-full"
              codingEngines={codingEngines}
              customization={customization}
              onClose={onClose}
              onEditCustomization={openCustomizationEditor}
              onOpenTelegramSetup={() => {
                setTelegramSetupError(null);
                setTelegramSetupOpen(true);
              }}
              telegramSetupSession={telegramSetupSession}
              onUpdateChannel={async (input) => {
                await agentRuntime.service.updateAgentChannel({
                  agentId: agent.id,
                  ...input,
                });
              }}
              showCloseButton={false}
              {...deleteAgentProps}
            />
          </>
        )}
      </DialogContent>
      <Dialog
        onOpenChange={(open) => {
          if (!open && !isApplyingTelegramChannel) {
            closeTelegramSetup();
          }
        }}
        open={isTelegramSetupOpen}
      >
        <DialogContent className="flex h-[min(90vh,780px)] w-[min(94vw,720px)] flex-col overflow-hidden p-0">
          <TelegramSetupSurface
            agent={agent}
            errorMessage={telegramSetupError}
            isApplying={isApplyingTelegramChannel}
            matchedChat={telegramMatchedChat}
            onApply={handleApplyTelegramChannel}
            onCancel={closeTelegramSetup}
            onSessionChange={handleTelegramSetupSessionChange}
            session={telegramSetupSession}
          />
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
