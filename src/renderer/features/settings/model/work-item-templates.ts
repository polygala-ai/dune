// Work item template settings persistence helpers.

import type { WorkItemTemplate } from '@/shared/workflow/work-item-templates';
import {
  BUILTIN_WORK_ITEM_TEMPLATES,
  isBuiltInWorkItemTemplateId,
  normalizeWorkItemTemplate,
  normalizeWorkItemTemplates,
} from '@/shared/workflow/work-item-templates';

/** Storage key for work item templates. */
export const WORK_ITEM_TEMPLATES_KEY = 'templates';
const LEGACY_WORK_ITEM_TEMPLATE_KEYS = ['itemTemplates', 'workItemTemplates'] as const;

/** Work item template store contract. */
export interface WorkItemTemplateStore {
  get: <T>(key: string) => Promise<T | null>;
  set?: <T>(key: string, value: T) => Promise<void>;
}

interface ExportedWorkItemTemplate {
  brief: string;
  defaultAgent: string | null;
  defaultTasks: string[];
  id: string;
  name: string;
  titlePattern: string;
}

/** Normalizes custom work item templates. */
export function normalizeCustomWorkItemTemplates(value: unknown): WorkItemTemplate[] {
  return normalizeWorkItemTemplates(value)
    .filter((template) => !template.builtIn && !isBuiltInWorkItemTemplateId(template.id))
    .map((template) => ({ ...template, builtIn: false }));
}

function createStoredWorkItemTemplates(customTemplates: WorkItemTemplate[]) {
  return [
    ...BUILTIN_WORK_ITEM_TEMPLATES,
    ...normalizeCustomWorkItemTemplates(customTemplates),
  ];
}

/** Loads custom work item templates. */
export async function loadCustomWorkItemTemplates(
  settingsStore: WorkItemTemplateStore,
) {
  const value = await settingsStore.get<unknown>(WORK_ITEM_TEMPLATES_KEY);

  if (value === null) {
    let legacyValue: unknown = null;

    for (const legacyKey of LEGACY_WORK_ITEM_TEMPLATE_KEYS) {
      legacyValue = await settingsStore.get<unknown>(legacyKey);

      if (legacyValue !== null) {
        break;
      }
    }

    const storedTemplates = legacyValue ?? BUILTIN_WORK_ITEM_TEMPLATES;

    if (settingsStore.set) {
      await settingsStore.set(
        WORK_ITEM_TEMPLATES_KEY,
        legacyValue === null
          ? BUILTIN_WORK_ITEM_TEMPLATES
          : createStoredWorkItemTemplates(normalizeCustomWorkItemTemplates(storedTemplates)),
      );
    }

    return normalizeCustomWorkItemTemplates(storedTemplates);
  }

  return normalizeCustomWorkItemTemplates(value);
}

/** Saves custom work item templates. */
export async function saveCustomWorkItemTemplates(
  settingsStore: WorkItemTemplateStore,
  templates: WorkItemTemplate[],
) {
  const normalized = normalizeCustomWorkItemTemplates(templates);

  if (!settingsStore.set) {
    throw new Error('Templates store does not support saving.');
  }

  await settingsStore.set(WORK_ITEM_TEMPLATES_KEY, createStoredWorkItemTemplates(normalized));
  return normalized;
}

/** Returns built-in and custom work item templates. */
export function mergeWorkItemTemplates(customTemplates: WorkItemTemplate[]) {
  return [
    ...BUILTIN_WORK_ITEM_TEMPLATES,
    ...normalizeCustomWorkItemTemplates(customTemplates),
  ];
}

/** Parses imported work item templates JSON. */
export function parseImportedWorkItemTemplates(json: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Templates file must contain valid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Templates file must contain a JSON array.');
  }

  const parsedTemplates = parsed as unknown[];
  const invalidEntryIndex = parsedTemplates.findIndex((candidate) =>
    normalizeWorkItemTemplate(candidate) === null,
  );

  if (invalidEntryIndex >= 0) {
    throw new Error('Templates file contains one or more invalid templates.');
  }

  return normalizeCustomWorkItemTemplates(parsedTemplates);
}

/** Serializes work item templates to JSON. */
export function serializeCustomWorkItemTemplates(templates: WorkItemTemplate[]) {
  const exportedTemplates: ExportedWorkItemTemplate[] = normalizeCustomWorkItemTemplates(templates)
    .map((template) => ({
      brief: template.briefTemplate,
      defaultAgent: template.defaultAgentId,
      defaultTasks: [...template.defaultTasks],
      id: template.id,
      name: template.name,
      titlePattern: template.titlePattern,
    }));

  return JSON.stringify(exportedTemplates, null, 2);
}

/** Upserts imported work item templates into the current custom set. */
export function upsertImportedWorkItemTemplates(
  currentTemplates: WorkItemTemplate[],
  importedTemplates: WorkItemTemplate[],
) {
  const mergedTemplates = new Map(
    normalizeCustomWorkItemTemplates(currentTemplates).map((template) => [template.id, template] as const),
  );

  for (const template of normalizeCustomWorkItemTemplates(importedTemplates)) {
    mergedTemplates.set(template.id, template);
  }

  return [...mergedTemplates.values()];
}
