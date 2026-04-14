// Nuclear settings UI.

import { useState } from 'react';
import { Trash2 } from 'lucide-react';

import type { SettingsSectionComponentProps } from '@/renderer/features/settings/config/settings-sections';
import { cn } from '@/renderer/shared/lib/utils';
import { Button } from '@/renderer/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';

import { SettingsSectionIntro } from './SettingsSectionIntro';

/** Feedback state. */
type FeedbackState =
  | { kind: 'error'; message: string }
  | null;

/** Renders the nuclear settings UI. */
export function NuclearSettings(props: SettingsSectionComponentProps) {
  void props;
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setDeleting] = useState(false);

  /** Handles delete. */
  const handleDelete = async () => {
    setDeleting(true);
    setFeedback(null);

    try {
      if (typeof window.duneDesktop?.deleteLocalData !== 'function') {
        throw new Error('Local data deletion is unavailable in this build.');
      }

      await window.duneDesktop.deleteLocalData();
      setDeleteDialogOpen(false);
    } catch (error) {
      setDeleteDialogOpen(false);
      setFeedback({
        kind: 'error',
        message: `Failed to delete local data. ${String(error)}`,
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <SettingsSectionIntro
        eyebrow="Nuclear"
        title="Factory reset"
      />

      <section className="mt-6 rounded-[22px] border border-rose-500/20 bg-rose-500/5 p-5">
        <h3 className="text-sm font-semibold text-app-text">Delete local data</h3>
        <p className="mt-2 text-sm leading-6 text-app-muted">
          Removes local settings, cached state, stored agents, secrets, and the AgentLite
          runtime data. This action is irreversible.
        </p>

        <div className="mt-5 flex items-center">
          <Button
            className="border-rose-500/35 text-rose-700 hover:border-rose-400/45 hover:bg-rose-500/10 hover:text-rose-800"
            onClick={() => setDeleteDialogOpen(true)}
            type="button"
            variant="outline"
          >
            <Trash2 className="h-4 w-4" />
            Delete local data
          </Button>
        </div>
      </section>

      {feedback ? (
        <div
          className={cn(
            'mt-4 rounded-[16px] border px-4 py-3 text-sm',
            'border-rose-500/30 bg-rose-500/10 text-rose-100',
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      <Dialog
        onOpenChange={(open) => {
          if (isDeleting) {
            return;
          }

          setDeleteDialogOpen(open);
        }}
        open={isDeleteDialogOpen}
      >
        <DialogContent
          className="w-[min(92vw,560px)]"
          onEscapeKeyDown={(event) => {
            if (isDeleting) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (isDeleting) {
              event.preventDefault();
            }
          }}
        >
          <DialogTitle>Delete all local data?</DialogTitle>
          <DialogDescription className="mt-2 leading-6">
            Dune will remove app userData and the AgentLite runtime data, then restart
            immediately. This cannot be undone.
          </DialogDescription>

          <div className="mt-4 rounded-[18px] border border-app-border bg-app-panel/40 px-4 py-3 text-sm leading-6 text-app-muted">
            The AgentLite runtime root is <code>~/.dune/agentlite</code> by default.
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button
              disabled={isDeleting}
              onClick={() => setDeleteDialogOpen(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={isDeleting}
              onClick={() => void handleDelete()}
              type="button"
            >
              {isDeleting ? 'Deleting…' : 'Delete and restart'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
