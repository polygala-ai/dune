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
    briefTemplate: 'Research [topic]. Summarize findings and produce a report.',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Define scope', 'Research sources', 'Synthesize findings', 'Write report'],
    id: 'builtin-research-task',
    name: 'Research task',
    titlePattern: 'Research [topic]',
    updatedAt: 0,
  },
  {
    briefTemplate: 'Fix [bug description]. Steps to reproduce: [steps]. Expected: [expected].',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Reproduce bug', 'Identify root cause', 'Implement fix', 'Write test', 'Verify fix'],
    id: 'builtin-bug-fix',
    name: 'Bug fix',
    titlePattern: 'Fix [bug description]',
    updatedAt: 0,
  },
  {
    briefTemplate: 'Implement [feature]. Requirements:\n1. [req1]\n2. [req2]',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Design', 'Implement', 'Write tests', 'Open PR'],
    id: 'builtin-feature-implementation',
    name: 'Feature implementation',
    titlePattern: 'Implement [feature]',
    updatedAt: 0,
  },
  {
    briefTemplate: 'Review [PR/branch]. Check for correctness, style, test coverage.',
    builtIn: true,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['Read diff', 'Run tests', 'Leave review comments', 'Approve or request changes'],
    id: 'builtin-code-review',
    name: 'Code review',
    titlePattern: 'Review [PR/branch]',
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
