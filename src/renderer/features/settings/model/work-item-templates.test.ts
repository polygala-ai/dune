// Work item template settings model tests.

import { describe, expect, it } from 'vitest';

import type { WorkItemTemplate } from '@/shared/workflow/work-item-templates';

import type { WorkItemTemplateStore } from './work-item-templates';
import {
  WORK_ITEM_TEMPLATES_KEY,
  loadCustomWorkItemTemplates,
  mergeWorkItemTemplates,
  parseImportedWorkItemTemplates,
  saveCustomWorkItemTemplates,
  serializeCustomWorkItemTemplates,
  upsertImportedWorkItemTemplates,
} from './work-item-templates';

class MemoryStore implements WorkItemTemplateStore {
  private readonly data = new Map<string, unknown>();

  get<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.data.get(key) as T | undefined) ?? null);
  }

  set<T>(key: string, value: T) {
    this.data.set(key, value);
    return Promise.resolve();
  }
}

function customTemplate(overrides: Partial<WorkItemTemplate> = {}): WorkItemTemplate {
  return {
    brief: 'Custom brief',
    builtIn: false,
    createdAt: 0,
    defaultAgentId: null,
    defaultTasks: ['One'],
    id: 'custom-template',
    name: 'Custom template',
    titlePattern: 'Custom: ',
    updatedAt: 0,
    ...overrides,
  };
}

describe('work item templates settings model', () => {
  it('uses the local templates settings key', () => {
    expect(WORK_ITEM_TEMPLATES_KEY).toBe('templates');
  });

  it('loads only custom templates from the settings store', async () => {
    const store = new MemoryStore();

    await store.set(WORK_ITEM_TEMPLATES_KEY, [
      customTemplate({
        defaultTasks: ['First', 'Second'],
      }),
      {
        brief: 'Should be filtered',
        builtIn: true,
        defaultTasks: ['Ignore me'],
        id: 'builtin-research-task',
        name: 'Duplicate built-in',
        titlePattern: 'Ignore: ',
      },
    ]);

    await expect(loadCustomWorkItemTemplates(store)).resolves.toEqual([
      customTemplate({
        defaultTasks: ['First', 'Second'],
      }),
    ]);
  });

  it('normalizes and saves custom templates', async () => {
    const store = new MemoryStore();

    const saved = await saveCustomWorkItemTemplates(store, [
      customTemplate({
        brief: 'Investigate',
        defaultTasks: [' Scope ', '', 'Scope', 'Write summary'],
        id: ' custom-template ',
        name: ' Custom template ',
        titlePattern: 'Research: ',
      }),
    ]);

    expect(saved).toEqual([
      customTemplate({
        brief: 'Investigate',
        defaultTasks: ['Scope', 'Write summary'],
        id: 'custom-template',
        name: 'Custom template',
        titlePattern: 'Research: ',
      }),
    ]);
    await expect(store.get<WorkItemTemplate[]>(WORK_ITEM_TEMPLATES_KEY)).resolves.toEqual([
      expect.objectContaining({ builtIn: true, id: 'builtin-research-task' }),
      expect.objectContaining({ builtIn: true, id: 'builtin-bug-fix' }),
      expect.objectContaining({ builtIn: true, id: 'builtin-feature-implementation' }),
      expect.objectContaining({ builtIn: true, id: 'builtin-code-review' }),
      ...saved,
    ]);
  });

  it('seeds built-in templates on first run when the store is writable', async () => {
    const store = new MemoryStore();

    await expect(loadCustomWorkItemTemplates(store)).resolves.toEqual([]);
    await expect(store.get<WorkItemTemplate[]>(WORK_ITEM_TEMPLATES_KEY)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          builtIn: true,
          id: 'builtin-research-task',
          name: 'Research task',
        }),
      ]),
    );
  });

  it('migrates templates from the legacy itemTemplates key', async () => {
    const store = new MemoryStore();

    await store.set('itemTemplates', [
      customTemplate({
        brief: 'Legacy stored brief',
        id: 'legacy-custom-template',
      }),
    ]);

    await expect(loadCustomWorkItemTemplates(store)).resolves.toEqual([
      customTemplate({
        brief: 'Legacy stored brief',
        id: 'legacy-custom-template',
      }),
    ]);
    await expect(store.get<WorkItemTemplate[]>(WORK_ITEM_TEMPLATES_KEY)).resolves.toEqual([
      expect.objectContaining({ builtIn: true, id: 'builtin-research-task' }),
      expect.objectContaining({ builtIn: true, id: 'builtin-bug-fix' }),
      expect.objectContaining({ builtIn: true, id: 'builtin-feature-implementation' }),
      expect.objectContaining({ builtIn: true, id: 'builtin-code-review' }),
      customTemplate({
        brief: 'Legacy stored brief',
        id: 'legacy-custom-template',
      }),
    ]);
  });

  it('migrates templates from the older legacy workItemTemplates key', async () => {
    const store = new MemoryStore();

    await store.set('workItemTemplates', [
      customTemplate({
        brief: 'Older legacy stored brief',
        id: 'older-legacy-custom-template',
      }),
    ]);

    await expect(loadCustomWorkItemTemplates(store)).resolves.toEqual([
      customTemplate({
        brief: 'Older legacy stored brief',
        id: 'older-legacy-custom-template',
      }),
    ]);
  });

  it('stores built-in templates with custom templates when saving', async () => {
    const store = new MemoryStore();

    await saveCustomWorkItemTemplates(store, [customTemplate()]);

    await expect(store.get<WorkItemTemplate[]>(WORK_ITEM_TEMPLATES_KEY)).resolves.toEqual([
      expect.objectContaining({ builtIn: true, id: 'builtin-research-task' }),
      expect.objectContaining({ builtIn: true, id: 'builtin-bug-fix' }),
      expect.objectContaining({ builtIn: true, id: 'builtin-feature-implementation' }),
      expect.objectContaining({ builtIn: true, id: 'builtin-code-review' }),
      customTemplate(),
    ]);
  });

  it('merges built-in templates ahead of custom templates', () => {
    expect(mergeWorkItemTemplates([
      customTemplate(),
    ]).map((template) => template.id)).toEqual([
      'builtin-research-task',
      'builtin-bug-fix',
      'builtin-feature-implementation',
      'builtin-code-review',
      'custom-template',
    ]);
  });

  it('parses imported templates from JSON and filters built-ins', () => {
    expect(parseImportedWorkItemTemplates(JSON.stringify([
      customTemplate({
        brief: 'Imported brief',
        defaultTasks: ['Read the diff'],
        id: 'imported-template',
        name: 'Imported template',
        titlePattern: 'Import: ',
      }),
      {
        brief: 'Built-in copy',
        builtIn: true,
        defaultTasks: ['Ignore'],
        id: 'builtin-bug-fix',
        name: 'Bug fix',
        titlePattern: 'Fix: ',
      },
    ]))).toEqual([
      customTemplate({
        brief: 'Imported brief',
        defaultTasks: ['Read the diff'],
        id: 'imported-template',
        name: 'Imported template',
        titlePattern: 'Import: ',
      }),
    ]);

    expect(() => parseImportedWorkItemTemplates('{bad-json')).toThrow(
      'Templates file must contain valid JSON.',
    );
    expect(() => parseImportedWorkItemTemplates(JSON.stringify({ nope: true }))).toThrow(
      'Templates file must contain a JSON array.',
    );
    expect(() => parseImportedWorkItemTemplates(JSON.stringify([{ titlePattern: 'Invalid' }]))).toThrow(
      'Templates file contains one or more invalid templates.',
    );
  });

  it('parses the public template data model without display names', () => {
    expect(parseImportedWorkItemTemplates(JSON.stringify([
      {
        defaultAgentId: 'agent-research',
        brief: 'Research this topic.',
        id: 'public-template',
        defaultTasks: ['Read', 'Summarize'],
        titlePattern: 'Research: topic',
      },
    ]))).toEqual([
      customTemplate({
        defaultAgentId: 'agent-research',
        brief: 'Research this topic.',
        id: 'public-template',
        name: 'Research: topic',
        defaultTasks: ['Read', 'Summarize'],
        titlePattern: 'Research: topic',
      }),
    ]);
  });

  it('serializes all normalized templates', () => {
    const serialized = serializeCustomWorkItemTemplates([
      customTemplate({
        brief: 'Keep this',
      }),
      {
        brief: 'Include this',
        builtIn: true,
        createdAt: 0,
        defaultAgentId: null,
        defaultTasks: ['Ignored'],
        id: 'builtin-bug-fix',
        name: 'Bug fix',
        titlePattern: 'Fix: ',
        updatedAt: 0,
      },
    ]);

    expect(serialized).toContain('"custom-template"');
    expect(serialized).toContain('"builtin-bug-fix"');
  });

  it('upserts imported templates by ID and preserves order', () => {
    expect(upsertImportedWorkItemTemplates(
      [
        customTemplate({
          brief: 'Original brief',
          defaultTasks: ['One'],
          id: 'template-a',
          name: 'Template A',
          titlePattern: 'A: ',
        }),
      ],
      [
        customTemplate({
          brief: 'Updated brief',
          defaultTasks: ['Two'],
          id: 'template-a',
          name: 'Template A',
          titlePattern: 'Updated: ',
        }),
        customTemplate({
          brief: 'New brief',
          defaultTasks: ['Three'],
          id: 'template-b',
          name: 'Template B',
          titlePattern: 'B: ',
        }),
      ],
    )).toEqual([
      customTemplate({
        brief: 'Updated brief',
        defaultTasks: ['Two'],
        id: 'template-a',
        name: 'Template A',
        titlePattern: 'Updated: ',
      }),
      customTemplate({
        brief: 'New brief',
        defaultTasks: ['Three'],
        id: 'template-b',
        name: 'Template B',
        titlePattern: 'B: ',
      }),
    ]);
  });
});
