// Work item template settings model tests.

import { describe, expect, it } from 'vitest';

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

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T) {
    this.data.set(key, value);
  }
}

describe('work item templates settings model', () => {
  it('loads only custom templates from the settings store', async () => {
    const store = new MemoryStore();

    await store.set(WORK_ITEM_TEMPLATES_KEY, [
      {
        brief: 'Custom brief',
        defaultTasks: ['First', 'Second'],
        id: 'custom-template',
        name: 'Custom template',
        titlePattern: 'Custom: ',
      },
      {
        brief: 'Should be filtered',
        defaultTasks: ['Ignore me'],
        id: 'builtin-research-task',
        name: 'Duplicate built-in',
        titlePattern: 'Ignore: ',
      },
    ]);

    await expect(loadCustomWorkItemTemplates(store)).resolves.toEqual([
      {
        brief: 'Custom brief',
        defaultTasks: ['First', 'Second'],
        id: 'custom-template',
        name: 'Custom template',
        titlePattern: 'Custom: ',
      },
    ]);
  });

  it('normalizes and saves custom templates', async () => {
    const store = new MemoryStore();

    const saved = await saveCustomWorkItemTemplates(store, [
      {
        brief: 'Investigate',
        defaultTasks: [' Scope ', '', 'Scope', 'Write summary'],
        id: ' custom-template ',
        name: ' Custom template ',
        titlePattern: 'Research: ',
      },
    ]);

    expect(saved).toEqual([
      {
        brief: 'Investigate',
        defaultTasks: ['Scope', 'Write summary'],
        id: 'custom-template',
        name: 'Custom template',
        titlePattern: 'Research: ',
      },
    ]);
    await expect(store.get(WORK_ITEM_TEMPLATES_KEY)).resolves.toEqual(saved);
  });

  it('merges built-in templates ahead of custom templates', () => {
    expect(mergeWorkItemTemplates([
      {
        brief: 'Custom brief',
        defaultTasks: ['One'],
        id: 'custom-template',
        name: 'Custom template',
        titlePattern: 'Custom: ',
      },
    ]).map((template) => template.id)).toEqual([
      'builtin-research-task',
      'builtin-bug-fix',
      'builtin-feature-implementation',
      'builtin-code-review',
      'custom-template',
    ]);
  });

  it('parses imported templates from JSON', () => {
    expect(parseImportedWorkItemTemplates(JSON.stringify([
      {
        brief: 'Imported brief',
        defaultTasks: ['Read the diff'],
        id: 'imported-template',
        name: 'Imported template',
        titlePattern: 'Import: ',
      },
    ]))).toEqual([
      {
        brief: 'Imported brief',
        defaultTasks: ['Read the diff'],
        id: 'imported-template',
        name: 'Imported template',
        titlePattern: 'Import: ',
      },
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

  it('serializes only custom templates', () => {
    expect(serializeCustomWorkItemTemplates([
      {
        brief: 'Keep this',
        defaultTasks: ['One'],
        id: 'custom-template',
        name: 'Custom template',
        titlePattern: 'Custom: ',
      },
      {
        brief: 'Drop this',
        defaultTasks: ['Ignored'],
        id: 'builtin-bug-fix',
        name: 'Built-in copy',
        titlePattern: 'Fix: ',
      },
    ])).toContain('"custom-template"');
  });

  it('upserts imported templates by ID', () => {
    expect(upsertImportedWorkItemTemplates(
      [
        {
          brief: 'Original brief',
          defaultTasks: ['One'],
          id: 'template-a',
          name: 'Template A',
          titlePattern: 'A: ',
        },
      ],
      [
        {
          brief: 'Updated brief',
          defaultTasks: ['Two'],
          id: 'template-a',
          name: 'Template A',
          titlePattern: 'Updated: ',
        },
        {
          brief: 'New brief',
          defaultTasks: ['Three'],
          id: 'template-b',
          name: 'Template B',
          titlePattern: 'B: ',
        },
      ],
    )).toEqual([
      {
        brief: 'Updated brief',
        defaultTasks: ['Two'],
        id: 'template-a',
        name: 'Template A',
        titlePattern: 'Updated: ',
      },
      {
        brief: 'New brief',
        defaultTasks: ['Three'],
        id: 'template-b',
        name: 'Template B',
        titlePattern: 'B: ',
      },
    ]);
  });
});
