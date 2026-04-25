// Work item template helper tests.

import { describe, expect, it } from 'vitest';

import {
  BUILTIN_WORK_ITEM_TEMPLATES,
  createWorkItemTemplatePrefill,
  normalizeWorkItemTemplate,
  normalizeWorkItemTemplates,
  resolveWorkItemTemplateDefaultAgent,
} from './work-item-templates';

describe('work item templates', () => {
  it('defines the four built-in templates', () => {
    expect(BUILTIN_WORK_ITEM_TEMPLATES.map((template) => template.name)).toEqual([
      'Research task',
      'Bug fix',
      'Feature implementation',
      'Code review',
    ]);
  });

  it('normalizes templates and strips invalid values', () => {
    expect(normalizeWorkItemTemplate({
      brief: 'Investigate the issue.',
      defaultAgentId: ' agent-1 ',
      defaultTasks: [' Scope ', '', 'Scope', 'Write summary'],
      id: ' template-1 ',
      name: ' Research helper ',
      titlePattern: 'Research: ',
    })).toEqual({
      brief: 'Investigate the issue.',
      defaultAgentId: 'agent-1',
      defaultTasks: ['Scope', 'Write summary'],
      id: 'template-1',
      name: 'Research helper',
      titlePattern: 'Research: ',
    });

    expect(normalizeWorkItemTemplate({
      defaultTasks: [],
      id: '   ',
      name: 'Missing ID',
      titlePattern: '',
    })).toBeNull();
  });

  it('deduplicates templates by ID', () => {
    expect(normalizeWorkItemTemplates([
      {
        brief: '',
        defaultTasks: ['One'],
        id: 'template-1',
        name: 'Alpha',
        titlePattern: '',
      },
      {
        brief: '',
        defaultTasks: ['Two'],
        id: 'template-1',
        name: 'Duplicate',
        titlePattern: '',
      },
    ])).toEqual([
      {
        brief: '',
        defaultTasks: ['One'],
        id: 'template-1',
        name: 'Alpha',
        titlePattern: '',
      },
    ]);
  });

  it('creates prefill values from a template', () => {
    expect(createWorkItemTemplatePrefill(BUILTIN_WORK_ITEM_TEMPLATES[0]!)).toEqual({
      brief: 'Research question/topic:\n\nGoal:\n\nDeliverables:',
      taskTitles: ['Define scope', 'Gather sources', 'Synthesize findings', 'Write summary'],
      title: 'Research: ',
    });
  });

  it('resolves the default agent only when it matches the project scope', () => {
    const template = {
      brief: '',
      defaultAgentId: 'agent-alpha',
      defaultTasks: ['Investigate'],
      id: 'custom-template',
      name: 'Scoped template',
      titlePattern: 'Investigate: ',
    };

    expect(resolveWorkItemTemplateDefaultAgent(template, 'project-1', [
      { id: 'agent-alpha', name: 'Alpha', projectId: 'project-1' },
    ])).toEqual({
      id: 'agent-alpha',
      name: 'Alpha',
    });

    expect(resolveWorkItemTemplateDefaultAgent(template, 'project-2', [
      { id: 'agent-alpha', name: 'Alpha', projectId: 'project-1' },
    ])).toBeNull();

    expect(resolveWorkItemTemplateDefaultAgent(template, 'project-2', [
      { id: 'agent-alpha', name: 'Alpha', projectId: null },
    ])).toEqual({
      id: 'agent-alpha',
      name: 'Alpha',
    });
  });

  it('resolves the default agent by exact name when an ID is not stored', () => {
    const template = {
      brief: '',
      defaultAgentId: 'Review agent',
      defaultTasks: ['Review'],
      id: 'custom-review-template',
      name: 'Review template',
      titlePattern: 'Review: ',
    };

    expect(resolveWorkItemTemplateDefaultAgent(template, 'project-1', [
      { id: 'agent-review', name: 'Review agent', projectId: 'project-1' },
    ])).toEqual({
      id: 'agent-review',
      name: 'Review agent',
    });
  });
});
