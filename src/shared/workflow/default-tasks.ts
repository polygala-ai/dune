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

/** Normalizes task titles. */
export function normalizeWorkflowTaskTitles(taskTitles: string[]) {
  return [...new Set(
    taskTitles
      .map((taskTitle) => taskTitle.trim())
      .filter(Boolean),
  )];
}

/** Creates workflow tasks from titles. */
export function createWorkflowTasks(taskTitles: string[], now: number): DefaultTask[] {
  return normalizeWorkflowTaskTitles(taskTitles).map((title) => ({
    createdAt: now,
    id: createId('task'),
    notes: '',
    status: 'todo' as const,
    title,
    updatedAt: now,
  }));
}

/** Creates default tasks. */
export function createDefaultTasks(now: number): DefaultTask[] {
  return createWorkflowTasks([...DEFAULT_TASK_TITLES], now);
}
