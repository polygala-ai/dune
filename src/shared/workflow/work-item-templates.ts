// Work item template helpers.

import { isPlainObject } from '@/shared/is-record';
import { normalizeWorkflowTaskTitles } from '@/shared/workflow/default-tasks';

/** Work item template shape. */
export interface WorkItemTemplate {
  briefTemplate: string;
  /** Agent ID or exact agent name to assign when the template is used. */
  defaultAssignedAgentId?: string;
  defaultTasks: string[];
  id: string;
  name: string;
  titlePattern: string;
}

/** Template-scoped agent shape. */
export interface TemplateScopedAgent {
  id: string;
  name: string;
  projectId: string | null;
}

/** Prefilled work item draft shape. */
export interface WorkItemTemplatePrefill {
  briefTemplate: string;
  taskTitles: string[];
  title: string;
}

/** Built-in work item templates. */
export const BUILTIN_WORK_ITEM_TEMPLATES: WorkItemTemplate[] = [
  {
    briefTemplate: 'Research question/topic:\n\nGoal:\n\nSources to check:\n\nSynthesis:\n\nReport:',
    defaultTasks: ['Understand', 'Research', 'Synthesize', 'Write report'],
    id: 'builtin-research-task',
    name: 'Research task',
    titlePattern: 'Research: ',
  },
  {
    briefTemplate: 'Bug description:\n\nSteps to reproduce:\n\nExpected behavior:\n\nActual behavior:\n\nFix notes:',
    defaultTasks: ['Reproduce', 'Root cause analysis', 'Fix', 'Test', 'PR'],
    id: 'builtin-bug-fix',
    name: 'Bug fix',
    titlePattern: 'Fix: ',
  },
  {
    briefTemplate: 'Feature description:\n\nRequirements:\n\nDesign notes:\n\nAcceptance criteria:',
    defaultTasks: ['Design', 'Review design', 'Implement', 'Test', 'PR'],
    id: 'builtin-feature-implementation',
    name: 'Feature implementation',
    titlePattern: 'Implement: ',
  },
  {
    briefTemplate: 'Brief:\n\nCode/PR to review:\n\nFocus areas:\n\nFeedback:',
    defaultTasks: ['Read brief', 'Review code', 'Write feedback'],
    id: 'builtin-code-review',
    name: 'Code review',
    titlePattern: 'Review: ',
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
    briefTemplate: typeof value.briefTemplate === 'string'
      ? value.briefTemplate
      : typeof value.brief === 'string'
        ? value.brief
        : '',
    defaultTasks: Array.isArray(value.defaultTasks)
      ? normalizeWorkflowTaskTitles(
          value.defaultTasks.filter((task): task is string => typeof task === 'string'),
        )
      : [],
    id,
    name,
    titlePattern: typeof value.titlePattern === 'string' ? value.titlePattern : '',
  };
  const defaultAssignedAgentId = normalizeOptionalAgentId(
    value.defaultAssignedAgentId ?? value.defaultAgentId,
  );

  if (defaultAssignedAgentId) {
    template.defaultAssignedAgentId = defaultAssignedAgentId;
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
    briefTemplate: template.briefTemplate,
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
  const defaultAssignedAgentId = normalizeOptionalAgentId(template?.defaultAssignedAgentId);

  if (!defaultAssignedAgentId) {
    return null;
  }

  const matchingAgent = agents.find((agent) =>
    agent.id === defaultAssignedAgentId || agent.name === defaultAssignedAgentId,
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
