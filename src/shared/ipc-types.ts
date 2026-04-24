// Shared IPC serialization types.

import type {
  ItemPriority,
  WorkflowItem,
  WorkflowSnapshot,
} from '@/renderer/features/workflow/types';

export interface SerializedWorkItem extends WorkflowItem {
  priority: ItemPriority;
  slaDeadlineMs?: number;
}

export interface SerializedWorkflowSnapshot extends WorkflowSnapshot {
  items: SerializedWorkItem[];
}
