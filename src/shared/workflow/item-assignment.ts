/** Returns whether an item lane should have a live assignment task. */
export function shouldScheduleItemAssignmentTask(status: string | null | undefined): boolean {
  return status === 'ready' || status === 'active' || status === 'review';
}
