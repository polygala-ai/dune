import { describe, expect, it } from 'vitest';

import { createAgentAssignmentMessage } from '@/shared/agents/assignment-message';

describe('createAgentAssignmentMessage', () => {
  it('formats the assigned work item with project context and checklist items', () => {
    const message = createAgentAssignmentMessage({
      agentName: 'Navigator',
      artifactPath: '/workspace/extra/project/refine-onboarding-copy-abcd1234',
      itemBrief: 'Tighten the board language before launch.',
      itemStatus: 'active',
      itemTitle: 'Refine onboarding copy',
      projectName: 'Research Platform',
      tasks: [
        { status: 'doing', title: 'Review the current empty state' },
        { status: 'todo', title: 'Rewrite the first heading' },
      ],
    });

    expect(message).toContain('You have been assigned as the primary agent for "Refine onboarding copy".');
    expect(message).toContain('Agent: Navigator');
    expect(message).toContain('Project: Research Platform');
    expect(message).toContain('Artifact folder: /workspace/extra/project/refine-onboarding-copy-abcd1234');
    expect(message).toContain('Status: Active');
    expect(message).toContain('Brief:');
    expect(message).toContain('Tighten the board language before launch.');
    expect(message).toContain('Current checklist:');
    expect(message).toContain('- [Doing] Review the current empty state');
    expect(message).toContain('- [To do] Rewrite the first heading');
    expect(message).toContain(
      'Create and update generated files inside "/workspace/extra/project/refine-onboarding-copy-abcd1234".',
    );
  });

  it('adds a fallback instruction when the work item has no checklist items', () => {
    expect(createAgentAssignmentMessage({
      itemBrief: '',
      itemStatus: 'ready',
      itemTitle: 'Handle the next pass',
      tasks: [],
    })).toContain('- No checklist items yet. Break the work into the first concrete steps.');
  });
});
