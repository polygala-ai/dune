export const READY_ASSIGNMENTS_INBOX_FILENAME = 'ready-assignments.v1.json';
export const READY_ASSIGNMENTS_INBOX_MOUNT_PATH = `/workspace/extra/dune/inbox/${READY_ASSIGNMENTS_INBOX_FILENAME}`;

export interface ReadyAssignmentsInboxSignal {
  generation: number;
  itemCount: number;
}

export function createReadyAssignmentsInboxSignalMessage(
  signal: ReadyAssignmentsInboxSignal,
): string {
  return [
    'READY_ASSIGNMENTS_INBOX_UPDATED',
    `generation=${signal.generation}`,
    `item_count=${signal.itemCount}`,
    `path=${READY_ASSIGNMENTS_INBOX_MOUNT_PATH}`,
    '',
    'Read the inbox file and use it as the source of truth for assigned ready work.',
  ].join('\n');
}
