// Work item template helper tests.

import { describe, expect, it } from 'vitest';

import {
  BUILTIN_WORK_ITEM_TEMPLATES,
  createWorkItemTemplatePrefill,
  normalizeWorkItemTemplate,
  normalizeWorkItemTemplates,
  resolveWorkItemTemplateDefaultAgent,
  type WorkItemTemplate,
} from './work-item-templates';

function customTemplate(overrides: Partial<WorkItemTemplate> = {}): WorkItemTemplate {
  return {
    briefTemplate: '',
    builtIn: false,
    defaultAgentId: null,
    defaultTasks: [],
    id: 'custom-template',
    name: 'Custom template',
    titlePattern: '',
    ...overrides,
  };
}

describe('work item templates', () => {
  it('defines the four built-in templates', () => {
    expect(BUILTIN_WORK_ITEM_TEMPLATES.map((template) => template.name)).toEqual([
      'Research task',
      'Bug fix',
      'Feature implementation',
      'Code review',
    ]);
    expect(BUILTIN_WORK_ITEM_TEMPLATES.map((template) => template.builtIn)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(BUILTIN_WORK_ITEM_TEMPLATES.map((template) => template.defaultTasks)).toEqual([
      ['Define research scope', 'Gather sources', 'Synthesize findings', 'Write summary'],
      ['Reproduce the bug', 'Identify root cause', 'Implement fix', 'Write tests', 'Verify fix'],
      ['Research and design', 'Implement feature', 'Write tests', 'Update documentation'],
      ['Read the code', 'Check for bugs', 'Check style and naming', 'Verify test coverage', 'Write review summary'],
    ]);
    expect(BUILTIN_WORK_ITEM_TEMPLATES.map((template) => template.titlePattern)).toEqual([
      'Research: [topic]',
      'Fix: [bug description]',
      'Feature: [name]',
      'Review: [PR/branch name]',
    ]);
    expect(BUILTIN_WORK_ITEM_TEMPLATES.map((template) => template.briefTemplate)).toEqual([
      'Research [topic] and summarize findings.',
      'Fix [describe bug]. Steps to reproduce: [steps]. Expected: [expected]. Actual: [actual].',
      'Implement [feature name]. Requirements: [requirements].',
      'Review [PR/code] for correctness, style, and test coverage.',
    ]);
  });

  it('normalizes templates and strips invalid values', () => {
    expect(normalizeWorkItemTemplate({
      briefTemplate: 'Investigate the issue.',
      builtIn: false,
      defaultAgentId: ' agent-1 ',
      defaultTasks: [' Scope ', '', 'Scope', 'Write summary'],
      id: ' template-1 ',
      name: ' Research helper ',
      titlePattern: 'Research: ',
    })).toEqual({
      briefTemplate: 'Investigate the issue.',
      builtIn: false,
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

  it('normalizes legacy template field names', () => {
    expect(normalizeWorkItemTemplate({
      briefTemplate: 'Legacy brief.',
      defaultAssignedAgentId: ' agent-legacy ',
      defaultTasks: ['Read'],
      id: 'legacy-template',
      name: 'Legacy template',
      titlePattern: 'Legacy: ',
    })).toEqual({
      briefTemplate: 'Legacy brief.',
      builtIn: false,
      defaultAgentId: 'agent-legacy',
      defaultTasks: ['Read'],
      id: 'legacy-template',
      name: 'Legacy template',
      titlePattern: 'Legacy: ',
    });
  });

  it('deduplicates templates by ID', () => {
    expect(normalizeWorkItemTemplates([
      customTemplate({
        defaultTasks: ['One'],
        id: 'template-1',
        name: 'Alpha',
      }),
      customTemplate({
        defaultTasks: ['Two'],
        id: 'template-1',
        name: 'Duplicate',
      }),
    ])).toEqual([
      customTemplate({
        defaultTasks: ['One'],
        id: 'template-1',
        name: 'Alpha',
      }),
    ]);
  });

  it('creates prefill values from a template', () => {
    const researchTemplate = BUILTIN_WORK_ITEM_TEMPLATES[0];

    if (!researchTemplate) {
      throw new Error('Missing research built-in template.');
    }

    expect(createWorkItemTemplatePrefill(researchTemplate)).toEqual({
      brief: 'Research [topic] and summarize findings.',
      taskTitles: ['Define research scope', 'Gather sources', 'Synthesize findings', 'Write summary'],
      title: 'Research: [topic]',
    });
  });

  it('resolves the default agent only when it matches the project scope', () => {
    const template = customTemplate({
      defaultAgentId: 'agent-alpha',
      defaultTasks: ['Investigate'],
      name: 'Scoped template',
      titlePattern: 'Investigate: ',
    });

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
    const template = customTemplate({
      defaultAgentId: 'Review agent',
      defaultTasks: ['Review'],
      id: 'custom-review-template',
      name: 'Review template',
      titlePattern: 'Review: ',
    });

    expect(resolveWorkItemTemplateDefaultAgent(template, 'project-1', [
      { id: 'agent-review', name: 'Review agent', projectId: 'project-1' },
    ])).toEqual({
      id: 'agent-review',
      name: 'Review agent',
    });
  });
});
