// Work item template helpers.

import { isPlainObject } from '@/shared/is-record';
import { normalizeWorkflowTaskTitles } from '@/shared/workflow/default-tasks';

/** Work item template shape. */
export interface WorkItemTemplate {
  briefTemplate: string;
  builtIn: boolean;
  createdAt: number;
  /** Agent ID or exact agent name to assign when the template is used. */
  defaultAgentId: string | null;
  defaultTasks: string[];
  id: string;
  name: string;
  titlePattern: string;
  updatedAt: number;
}

/** Template-scoped agent shape. */
export interface TemplateScopedAgent {
  id: string;
  name: string;
  projectId: string | null;
}

/** Prefilled work item draft shape. */
export interface WorkItemTemplatePrefill {
  brief: string;
  taskTitles: string[];
  title: string;
}

/** Built-in work item templates. */
export const BUILTIN_WORK_ITEM_TEMPLATES: WorkItemTemplate[] = [
  {
    briefTemplate: 'Research and summarize findings on...',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Define scope', 'Gather sources', 'Analyze findings', 'Write summary'],
    id: 'builtin-research-task',
    name: 'Research task',
    titlePattern: 'Research: [topic]',
    updatedAt: 0,
  },
  {
    briefTemplate: 'Steps to reproduce:\n\nExpected behavior:\n\nActual behavior:',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Reproduce the bug', 'Identify root cause', 'Implement fix', 'Write tests', 'Verify fix'],
    id: 'builtin-bug-fix',
    name: 'Bug fix',
    titlePattern: 'Fix: [bug description]',
    updatedAt: 0,
  },
  {
    briefTemplate: 'Requirements:\n\nAcceptance criteria:',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Design', 'Implement', 'Write tests', 'Code review', 'Deploy'],
    id: 'builtin-feature-implementation',
    name: 'Feature implementation',
    titlePattern: 'Feature: [name]',
    updatedAt: 0,
  },
  {
    briefTemplate: 'Review the following code for correctness, style, and best practices.',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Read the code', 'Check for bugs', 'Check style/conventions', 'Write review comments'],
    id: 'builtin-code-review',
    name: 'Code review',
    titlePattern: 'Review: [PR/branch name]',
    updatedAt: 0,
  },
];

export const BUILTIN_WORK_ITEM_TEMPLATE_IDS = new Set(
  BUILTIN_WORK_ITEM_TEMPLATES.map((template) => template.id),
);

function normalizeOptionalAgentId(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeTimestamp(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

/** Returns whether the template ID belongs to a built-in template. */
export function isBuiltInWorkItemTemplateId(templateId: string) {
  return BUILTIN_WORK_ITEM_TEMPLATE_IDS.has(templateId);
}

/** Normalizes a single work item template. */
export function normalizeWorkItemTemplate(value: unknown): WorkItemTemplate | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const titlePattern = typeof value.titlePattern === 'string'
    ? value.titlePattern
    : typeof value.title === 'string'
      ? value.title
      : typeof value.titlePrefix === 'string'
        ? value.titlePrefix
        : '';
  const name = typeof value.name === 'string' && value.name.trim()
    ? value.name.trim()
    : titlePattern.trim() || id;

  if (!id) {
    return null;
  }

  const defaultTasks = Array.isArray(value.defaultTasks)
    ? normalizeWorkflowTaskTitles(
        value.defaultTasks.filter((task): task is string => typeof task === 'string'),
      )
    : Array.isArray(value.tasks)
      ? normalizeWorkflowTaskTitles(
          value.tasks.filter((task): task is string => typeof task === 'string'),
        )
      : [];

  return {
    briefTemplate: typeof value.briefTemplate === 'string'
      ? value.briefTemplate
      : typeof value.brief === 'string'
        ? value.brief
        : typeof value.briefSkeleton === 'string'
          ? value.briefSkeleton
          : '',
    builtIn: value.builtIn === true || value.isBuiltIn === true || isBuiltInWorkItemTemplateId(id),
    createdAt: normalizeTimestamp(value.createdAt),
    defaultAgentId: normalizeOptionalAgentId(
      value.defaultAgentId
        ?? value.defaultAgent
        ?? value.defaultAssigneeId
        ?? value.assignedAgentId
        ?? value.defaultAssignedAgentId
        ?? value.agentId,
    ) ?? null,
    defaultTasks,
    id,
    name,
    titlePattern,
    updatedAt: normalizeTimestamp(value.updatedAt),
  };
}

/** Normalizes work item templates. */
export function normalizeWorkItemTemplates(value: unknown): WorkItemTemplate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set<string>();
  const normalizedTemplates: WorkItemTemplate[] = [];

  for (const candidate of value) {
    const normalizedTemplate = normalizeWorkItemTemplate(candidate);

    if (!normalizedTemplate || seenIds.has(normalizedTemplate.id)) {
      continue;
    }

    seenIds.add(normalizedTemplate.id);
    normalizedTemplates.push(normalizedTemplate);
  }

  return normalizedTemplates;
}

/** Creates a prefilled work item draft from a template. */
export function createWorkItemTemplatePrefill(template: WorkItemTemplate): WorkItemTemplatePrefill {
  return {
    brief: template.briefTemplate,
    taskTitles: [...template.defaultTasks],
    title: template.titlePattern,
  };
}

/** Resolves the template default agent for the target project. */
export function resolveWorkItemTemplateDefaultAgent(
  template: WorkItemTemplate | null | undefined,
  projectId: string,
  agents: TemplateScopedAgent[],
) {
  const defaultAgentId = normalizeOptionalAgentId(template?.defaultAgentId);

  if (!defaultAgentId) {
    return null;
  }

  const matchingAgent = agents.find((agent) =>
    agent.id === defaultAgentId || agent.name === defaultAgentId,
  );

  if (!matchingAgent) {
    return null;
  }

  if (matchingAgent.projectId && matchingAgent.projectId !== projectId) {
    return null;
  }

  return {
    id: matchingAgent.id,
    name: matchingAgent.name,
  };
}
