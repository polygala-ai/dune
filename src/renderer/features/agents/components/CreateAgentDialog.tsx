import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/renderer/shared/ui/dialog';
import { Button } from '@/renderer/shared/ui/button';
import { Input } from '@/renderer/shared/ui/input';

interface CreateAgentDialogProps {
  onCreateAgent: (name: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CreateAgentDialog({
  onCreateAgent,
  onOpenChange,
  open,
}: CreateAgentDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!open) {
      setValue('');
    }
  }, [open]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return;
    }

    await onCreateAgent(trimmedValue);
    setValue('');
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="w-[min(92vw,520px)]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle>Name the agent</DialogTitle>
        <DialogDescription className="mt-2 leading-6">
          Start with one durable agent workspace. Runtime-specific configuration can
          wait for the AgentLite integration phase.
        </DialogDescription>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted"
              htmlFor="create-agent-name"
            >
              Agent name
            </label>
            <Input
              id="create-agent-name"
              onChange={(event) => setValue(event.target.value)}
              placeholder="Release coordinator"
              ref={inputRef}
              value={value}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] leading-5 text-app-muted">
              This prototype keeps the agent local while the app is open.
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={() => onOpenChange(false)} type="button" variant="quiet">
                Cancel
              </Button>
              <Button disabled={!value.trim()} type="submit">
                Create agent
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
