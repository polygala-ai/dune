// Work item template helpers.

import { isPlainObject } from '@/shared/is-record';
import { normalizeWorkflowTaskTitles } from '@/shared/workflow/default-tasks';

/** Work item template shape. */
export interface WorkItemTemplate {
  brief: string;
  builtIn: boolean;
  createdAt: number;
  /** Agent ID or exact agent name to assign when the template is used. */
  defaultAgentId?: string;
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
    brief: 'Research the following topic: {topic}\n\nDeliverables:\n- Summary document\n- Key findings\n- Recommendations',
    builtIn: true,
    createdAt: 0,
    defaultTasks: ['Define research scope', 'Gather sources', 'Synthesize findings', 'Write summary'],
    id: 'builtin-research-task',
    name: 'Research task',
    titlePattern: 'Research: {topic}',
    updatedAt: 0,
  },
  {
    brief: '**Bug**: {description}\n\n**Steps to reproduce**:\n1. \n\n**Expected**: \n**Actual**: ',
    builtIn: true,
    createdAt: 0,
    defaultTasks: ['Reproduce the bug', 'Identify root cause', 'Implement fix', 'Write regression test', 'Verify fix'],
    id: 'builtin-bug-fix',
    name: 'Bug fix',
    titlePattern: 'Bug: {description}',
    updatedAt: 0,
  },
  {
    brief: '## Feature: {name}\n\n**Goal**: \n\n**Requirements**:\n- \n\n**Acceptance criteria**:\n- ',
    builtIn: true,
    createdAt: 0,
    defaultTasks: ['Write design doc', 'Get design reviewed', 'Implement feature', 'Write tests', 'Open PR'],
    id: 'builtin-feature-implementation',
    name: 'Feature implementation',
    titlePattern: 'Feature: {name}',
    updatedAt: 0,
  },
  {
    brief: 'Review PR: {pr_url}\n\nFocus areas:\n- Correctness\n- Performance\n- Security\n- Code quality',
    builtIn: true,
    createdAt: 0,
    defaultTasks: ['Read the PR diff', 'Run tests locally', 'Leave review comments', 'Approve or request changes'],
    id: 'builtin-code-review',
    name: 'Code review',
    titlePattern: 'Review PR: {pr_url}',
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
  const name = typeof value.name === 'string' ? value.name.trim() : '';

  if (!id || !name) {
    return null;
  }

  const template: WorkItemTemplate = {
    brief: typeof value.brief === 'string'
      ? value.brief
      : typeof value.briefTemplate === 'string'
        ? value.briefTemplate
        : '',
    createdAt: normalizeTimestamp(value.createdAt),
    defaultTasks: Array.isArray(value.defaultTasks)
      ? normalizeWorkflowTaskTitles(
          value.defaultTasks.filter((task): task is string => typeof task === 'string'),
        )
      : [],
    id,
    builtIn: value.builtIn === true || value.isBuiltIn === true || isBuiltInWorkItemTemplateId(id),
    name,
    titlePattern: typeof value.titlePattern === 'string' ? value.titlePattern : '',
    updatedAt: normalizeTimestamp(value.updatedAt),
  };
  const defaultAgentId = normalizeOptionalAgentId(
    value.defaultAgentId ?? value.defaultAssignedAgentId,
  );

  if (defaultAgentId) {
    template.defaultAgentId = defaultAgentId;
  }

  return template;
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
    brief: template.brief,
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
