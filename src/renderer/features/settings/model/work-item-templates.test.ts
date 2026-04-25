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
    briefTemplate: 'Custom brief',
    builtIn: false,
    defaultTasks: ['One'],
    id: 'custom-template',
    name: 'Custom template',
    titlePattern: 'Custom: ',
    ...overrides,
  };
}

describe('work item templates settings model', () => {
  it('loads only custom templates from the settings store', async () => {
    const store = new MemoryStore();

    await store.set(WORK_ITEM_TEMPLATES_KEY, [
      customTemplate({
        defaultTasks: ['First', 'Second'],
      }),
      {
        briefTemplate: 'Should be filtered',
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
        briefTemplate: 'Investigate',
        defaultTasks: [' Scope ', '', 'Scope', 'Write summary'],
        id: ' custom-template ',
        name: ' Custom template ',
        titlePattern: 'Research: ',
      }),
    ]);

    expect(saved).toEqual([
      customTemplate({
        briefTemplate: 'Investigate',
        defaultTasks: ['Scope', 'Write summary'],
        id: 'custom-template',
        name: 'Custom template',
        titlePattern: 'Research: ',
      }),
    ]);
    await expect(store.get(WORK_ITEM_TEMPLATES_KEY)).resolves.toEqual(saved);
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
        briefTemplate: 'Imported brief',
        defaultTasks: ['Read the diff'],
        id: 'imported-template',
        name: 'Imported template',
        titlePattern: 'Import: ',
      }),
      {
        briefTemplate: 'Built-in copy',
        builtIn: true,
        defaultTasks: ['Ignore'],
        id: 'builtin-bug-fix',
        name: 'Bug fix',
        titlePattern: 'Fix: ',
      },
    ]))).toEqual([
      customTemplate({
        briefTemplate: 'Imported brief',
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
    expect(() => parseImportedWorkItemTemplates(JSON.stringify([{ name: 'Invalid' }]))).toThrow(
      'Templates file contains one or more invalid templates.',
    );
  });

  it('serializes all normalized templates', () => {
    const serialized = serializeCustomWorkItemTemplates([
      customTemplate({
        briefTemplate: 'Keep this',
      }),
      {
        briefTemplate: 'Include this',
        builtIn: true,
        defaultTasks: ['Ignored'],
        id: 'builtin-bug-fix',
        name: 'Bug fix',
        titlePattern: 'Fix: ',
      },
    ]);

    expect(serialized).toContain('"custom-template"');
    expect(serialized).toContain('"builtin-bug-fix"');
  });

  it('upserts imported templates by ID and preserves order', () => {
    expect(upsertImportedWorkItemTemplates(
      [
        customTemplate({
          briefTemplate: 'Original brief',
          defaultTasks: ['One'],
          id: 'template-a',
          name: 'Template A',
          titlePattern: 'A: ',
        }),
      ],
      [
        customTemplate({
          briefTemplate: 'Updated brief',
          defaultTasks: ['Two'],
          id: 'template-a',
          name: 'Template A',
          titlePattern: 'Updated: ',
        }),
        customTemplate({
          briefTemplate: 'New brief',
          defaultTasks: ['Three'],
          id: 'template-b',
          name: 'Template B',
          titlePattern: 'B: ',
        }),
      ],
    )).toEqual([
      customTemplate({
        briefTemplate: 'Updated brief',
        defaultTasks: ['Two'],
        id: 'template-a',
        name: 'Template A',
        titlePattern: 'Updated: ',
      }),
      customTemplate({
        briefTemplate: 'New brief',
        defaultTasks: ['Three'],
        id: 'template-b',
        name: 'Template B',
        titlePattern: 'B: ',
      }),
    ]);
  });
});
