import type { WorkflowItemStatus, WorkflowTaskStatus } from '@/renderer/features/workflow/types';

import type {
  CliAgentRecord,
  CliItemDetails,
  CliItemRecord,
} from './local-client';

const workflowItemStatusLabels: Record<WorkflowItemStatus, string> = {
  acceptance: 'Acceptance',
  active: 'Active',
  done: 'Done',
  inbox: 'Inbox',
  ready: 'Ready',
  review: 'Review',
};

const workflowTaskStatusLabels: Record<WorkflowTaskStatus, string> = {
  blocked: 'Blocked',
  doing: 'Doing',
  done: 'Done',
  review: 'Review',
  todo: 'To do',
};

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function padCell(value: string, width: number): string {
  return `${value}${' '.repeat(Math.max(0, width - value.length))}`;
}

function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...rows.map((row) => row[index]?.length ?? 0),
    ));
  const renderRow = (row: string[]) =>
    row.map((cell, index) => padCell(cell, widths[index] ?? cell.length)).join('  ');

  return [renderRow(headers), renderRow(widths.map((width) => '-'.repeat(width))), ...rows.map(renderRow)].join('\n');
}

function formatItemStatus(status: string): string {
  return workflowItemStatusLabels[status as WorkflowItemStatus] ?? status;
}

function formatTaskStatus(status: string): string {
  return workflowTaskStatusLabels[status as WorkflowTaskStatus] ?? status;
}

function formatItemTitle(item: CliItemRecord): string {
  return item.title.trim() || item.id;
}

function formatAssignmentSummary(agent: CliAgentRecord): string {
  if (!agent.currentAssignment) {
    return 'Unassigned';
  }

  if (agent.assignments.length === 1) {
    return `${agent.currentAssignment.id} · ${agent.currentAssignment.title}`;
  }

  return `${agent.currentAssignment.id} · ${agent.currentAssignment.title} +${agent.assignments.length - 1} more`;
}

export function renderItemsTable(items: CliItemRecord[]): string {
  if (items.length === 0) {
    return 'No work items found.';
  }

  return renderTable(
    ['ID', 'Status', 'Agent', 'Updated', 'Title'],
    items.map((item) => [
      item.id,
      formatItemStatus(item.status),
      item.primaryAgentName ?? 'Unassigned',
      formatTimestamp(item.updatedAt),
      formatItemTitle(item),
    ]),
  );
}

export function renderAgentsTable(agents: CliAgentRecord[]): string {
  if (agents.length === 0) {
    return 'No agents found.';
  }

  return renderTable(
    ['ID', 'Status', 'Project', 'Assignment', 'Agent'],
    agents.map((agent) => [
      agent.id,
      agent.status,
      agent.projectName ?? 'No project',
      formatAssignmentSummary(agent),
      agent.name,
    ]),
  );
}

export function renderItemDetails(item: CliItemDetails): string {
  const lines = [
    `${item.title}`,
    `ID: ${item.id}`,
    `Status: ${formatItemStatus(item.status)}`,
    `Project: ${item.project.name} (${item.project.id})`,
    `Assigned agent: ${item.primaryAgentName ?? 'Unassigned'}`,
    `Artifact path: ${item.artifactPath ?? 'None'}`,
    `Updated: ${formatTimestamp(item.updatedAt)}`,
  ];

  if (item.brief.trim()) {
    lines.push('', 'Brief:', item.brief.trim());
  }

  lines.push('', 'Tasks:');
  if (item.tasks.length === 0) {
    lines.push('- None');
  } else {
    for (const task of item.tasks) {
      lines.push(`- [${formatTaskStatus(task.status)}] ${task.title}`);
    }
  }

  lines.push('', 'Events:');
  if (item.events.length === 0) {
    lines.push('- None');
  } else {
    for (const event of item.events) {
      lines.push(
        `- ${formatTimestamp(event.createdAt)} · ${event.actor ?? 'Dune'} · ${event.description}`,
      );
    }
  }

  return lines.join('\n');
}
