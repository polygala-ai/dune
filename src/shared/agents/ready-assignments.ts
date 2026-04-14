// Ready-assignment signal helpers.

/** Ready assignments inbox filename constant. */
export const READY_ASSIGNMENTS_INBOX_FILENAME = 'ready-assignments.v1.json';
/** Ready assignments inbox mount path constant. */
export const READY_ASSIGNMENTS_INBOX_MOUNT_PATH = `/workspace/extra/dune/inbox/${READY_ASSIGNMENTS_INBOX_FILENAME}`;

/** Ready assignments inbox signal shape. */
export interface ReadyAssignmentsInboxSignal {
  generation: number;
  itemCount: number;
}

/** Creates ready assignments inbox signal message. */
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
