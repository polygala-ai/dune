import { describe, expect, it } from 'vitest';

import { shouldScheduleItemAssignmentTask } from '@/shared/workflow/item-assignment';

describe('shouldScheduleItemAssignmentTask', () => {
  it('returns true for ready and active lanes', () => {
    expect(shouldScheduleItemAssignmentTask('ready')).toBe(true);
    expect(shouldScheduleItemAssignmentTask('active')).toBe(true);
  });

  it('returns false for inbox, review, acceptance, done, and unknown lanes', () => {
    expect(shouldScheduleItemAssignmentTask('inbox')).toBe(false);
    expect(shouldScheduleItemAssignmentTask('review')).toBe(false);
    expect(shouldScheduleItemAssignmentTask('acceptance')).toBe(false);
    expect(shouldScheduleItemAssignmentTask('done')).toBe(false);
    expect(shouldScheduleItemAssignmentTask('blocked')).toBe(false);
    expect(shouldScheduleItemAssignmentTask(null)).toBe(false);
    expect(shouldScheduleItemAssignmentTask(undefined)).toBe(false);
  });
});
