const workflowItemStatusLabels: Record<string, string> = {
  active: 'Active',
  done: 'Done',
  inbox: 'Inbox',
  ready: 'Ready',
  review: 'Review',
};

const workflowTaskStatusLabels: Record<string, string> = {
  blocked: 'Blocked',
  doing: 'Doing',
  done: 'Done',
  review: 'Review',
  todo: 'To do',
};

interface AssignmentTaskSummary {
  status: string;
  title: string;
}

export interface AgentAssignmentMessageInput {
  agentName?: string | null;
  artifactPath?: string | null;
  itemBrief: string;
  itemStatus: string;
  itemTitle: string;
  projectName?: string | null;
  tasks: AssignmentTaskSummary[];
}

function formatWorkflowItemStatus(status: string) {
  return workflowItemStatusLabels[status] ?? status;
}

function formatWorkflowTaskStatus(status: string) {
  return workflowTaskStatusLabels[status] ?? status;
}

export function createAgentAssignmentMessage(
  input: AgentAssignmentMessageInput,
) {
  const projectName = input.projectName?.trim();
  const agentName = input.agentName?.trim();
  const artifactPath = input.artifactPath?.trim();
  const itemTitle = input.itemTitle.trim() || 'Untitled work item';
  const itemBrief = input.itemBrief.trim();
  const lines = [
    `You have been assigned as the primary agent for "${itemTitle}".`,
  ];

  if (agentName) {
    lines.push(`Agent: ${agentName}`);
  }

  if (projectName) {
    lines.push(`Project: ${projectName}`);
  }

  if (artifactPath) {
    lines.push(`Artifact folder: ${artifactPath}`);
  }

  lines.push(`Status: ${formatWorkflowItemStatus(input.itemStatus)}`);
  lines.push('');

  if (itemBrief) {
    lines.push('Brief:');
    lines.push(itemBrief);
    lines.push('');
  }

  lines.push('Current checklist:');

  if (input.tasks.length > 0) {
    for (const task of input.tasks) {
      lines.push(`- [${formatWorkflowTaskStatus(task.status)}] ${task.title.trim()}`);
    }
  } else {
    lines.push('- No checklist items yet. Break the work into the first concrete steps.');
  }

  lines.push('');
  if (artifactPath) {
    lines.push(`Create and update generated files inside "${artifactPath}".`);
    lines.push('');
  }
  lines.push(
    'Use Dune tools to inspect the work item, update checklist progress, and add work products as you make progress.',
  );

  return lines.join('\n');
}
