// Default workflow task builders.

import { createId } from '@/shared/id';

/** Default task shape. */
export interface DefaultTask {
  createdAt: number;
  id: string;
  notes: string;
  status: 'todo';
  title: string;
  updatedAt: number;
}

const DEFAULT_TASK_TITLES = [
  'Understand — Read the brief. Clarify ambiguities. Understand context and constraints.',
  'Research — Search for existing solutions, similar projects, and best practices.',
  'Plan — Write a concrete plan with specific steps. Get it reviewed before proceeding.',
  'Execute — Implement the plan. Only start after the above steps are done.',
] as const;

/** Creates default tasks. */
export function createDefaultTasks(now: number): DefaultTask[] {
  return DEFAULT_TASK_TITLES.map((title) => ({
    createdAt: now,
    id: createId('task'),
    notes: '',
    status: 'todo' as const,
    title,
    updatedAt: now,
  }));
}
