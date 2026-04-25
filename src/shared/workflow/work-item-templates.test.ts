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
    brief: '',
    builtIn: false,
    createdAt: 0,
    agentId: null,
    tasks: [],
    id: 'custom-template',
    name: 'Custom template',
    title: '',
    updatedAt: 0,
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
    expect(BUILTIN_WORK_ITEM_TEMPLATES.map((template) => template.tasks)).toEqual([
      ['Define scope', 'Gather sources', 'Summarize findings', 'Write report'],
      ['Reproduce bug', 'Identify root cause', 'Implement fix', 'Write test', 'Open PR'],
      ['Write design doc', 'Implement feature', 'Write tests', 'Open PR'],
      ['Read diff', 'Run tests locally', 'Leave review comments'],
    ]);
    expect(BUILTIN_WORK_ITEM_TEMPLATES.map((template) => template.title)).toEqual([
      'Research: {topic}',
      'Fix: {bug}',
      'Implement: {feature}',
      'Review: {PR}',
    ]);
    expect(BUILTIN_WORK_ITEM_TEMPLATES.map((template) => template.brief)).toEqual([
      'Research {topic} and summarize findings. Identify credible sources, compare tradeoffs, and end with a concise recommendation.',
      'Investigate the reported bug, document reproduction steps, identify the root cause, implement the fix, and add regression coverage.',
      'Implement the requested feature end to end. Match existing product patterns, update relevant tests, and call out any follow-up work.',
      'Review the target change for correctness, regressions, maintainability, and missing tests. Prioritize actionable findings with file and line references.',
    ]);
  });

  it('normalizes templates and strips invalid values', () => {
    expect(normalizeWorkItemTemplate({
      brief: 'Investigate the issue.',
      builtIn: false,
      createdAt: 123,
      agentId: ' agent-1 ',
      tasks: [' Scope ', '', 'Scope', 'Write summary'],
      id: ' template-1 ',
      name: ' Research helper ',
      title: 'Research: ',
      updatedAt: 456,
    })).toEqual({
      brief: 'Investigate the issue.',
      builtIn: false,
      createdAt: 123,
      agentId: 'agent-1',
      tasks: ['Scope', 'Write summary'],
      id: 'template-1',
      name: 'Research helper',
      title: 'Research: ',
      updatedAt: 456,
    });

    expect(normalizeWorkItemTemplate({
      tasks: [],
      id: '   ',
      name: 'Missing ID',
      title: '',
    })).toBeNull();
  });

  it('normalizes legacy template field names', () => {
    expect(normalizeWorkItemTemplate({
      brief: 'Legacy brief.',
      defaultAssignedAgentId: ' agent-legacy ',
      tasks: ['Read'],
      id: 'legacy-template',
      name: 'Legacy template',
      title: 'Legacy: ',
    })).toEqual({
      brief: 'Legacy brief.',
      builtIn: false,
      createdAt: 0,
      agentId: 'agent-legacy',
      tasks: ['Read'],
      id: 'legacy-template',
      name: 'Legacy template',
      title: 'Legacy: ',
      updatedAt: 0,
    });
  });

  it('deduplicates templates by ID', () => {
    expect(normalizeWorkItemTemplates([
      customTemplate({
        tasks: ['One'],
        id: 'template-1',
        name: 'Alpha',
      }),
      customTemplate({
        tasks: ['Two'],
        id: 'template-1',
        name: 'Duplicate',
      }),
    ])).toEqual([
      customTemplate({
        tasks: ['One'],
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
      brief: 'Research {topic} and summarize findings. Identify credible sources, compare tradeoffs, and end with a concise recommendation.',
      taskTitles: ['Define scope', 'Gather sources', 'Summarize findings', 'Write report'],
      title: 'Research: {topic}',
    });
  });

  it('resolves the default agent only when it matches the project scope', () => {
    const template = customTemplate({
      agentId: 'agent-alpha',
      tasks: ['Investigate'],
      name: 'Scoped template',
      title: 'Investigate: ',
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
      agentId: 'Review agent',
      tasks: ['Review'],
      id: 'custom-review-template',
      name: 'Review template',
      title: 'Review: ',
    });

    expect(resolveWorkItemTemplateDefaultAgent(template, 'project-1', [
      { id: 'agent-review', name: 'Review agent', projectId: 'project-1' },
    ])).toEqual({
      id: 'agent-review',
      name: 'Review agent',
    });
  });
});
