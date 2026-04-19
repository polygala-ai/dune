// Workflow dependency graph view.

import type { WorkflowItem } from '@/renderer/features/workflow/types';
import { cn } from '@/renderer/shared/lib/utils';
import {
  isDependencyResolved,
  isItemBlocked,
  normalizeDependencyIds,
} from '@/shared/workflow/dependency-utils';

const GRAPH_NODE_WIDTH = 232;
const GRAPH_NODE_HEIGHT = 108;
const GRAPH_COLUMN_GAP = 88;
const GRAPH_ROW_GAP = 34;
const GRAPH_PADDING_X = 40;
const GRAPH_PADDING_Y = 28;

interface GraphNode {
  dependsOn?: string[] | undefined;
  id: string;
  isBlocked: boolean;
  isMissing: boolean;
  status: string;
  title: string;
}

interface DependencyGraphViewProps {
  items: WorkflowItem[];
  onSelectItem: (itemId: string) => void;
  selectedItemId: string | null;
}

function formatNodeStatus(status: string) {
  return status[0]?.toUpperCase() ? `${status[0].toUpperCase()}${status.slice(1)}` : status;
}

function buildGraphNodes(items: WorkflowItem[]): GraphNode[] {
  const missingDependencyIds = new Set<string>();
  const itemIds = new Set(items.map((item) => item.id));

  for (const item of items) {
    for (const dependencyId of normalizeDependencyIds(item.dependsOn) ?? []) {
      if (!itemIds.has(dependencyId)) {
        missingDependencyIds.add(dependencyId);
      }
    }
  }

  return [
    ...items.map((item) => ({
      ...(normalizeDependencyIds(item.dependsOn)
        ? { dependsOn: normalizeDependencyIds(item.dependsOn) }
        : {}),
      id: item.id,
      isBlocked: isItemBlocked(item, items),
      isMissing: false,
      status: item.status,
      title: item.title,
    })),
    ...[...missingDependencyIds]
      .sort((left, right) => left.localeCompare(right))
      .map((dependencyId) => ({
        id: dependencyId,
        isBlocked: true,
        isMissing: true,
        status: 'missing',
        title: `Missing item (${dependencyId})`,
      })),
  ];
}

function getNodeTone(node: GraphNode) {
  if (node.isMissing) {
    return 'border-dashed border-app-border-strong bg-app-card/40 text-app-muted';
  }

  if (node.isBlocked) {
    return 'border-rose-500/35 bg-rose-500/10 text-app-text';
  }

  switch (node.status) {
    case 'done':
      return 'border-emerald-500/35 bg-emerald-500/10 text-app-text';
    case 'acceptance':
      return 'border-amber-500/35 bg-amber-500/10 text-app-text';
    case 'active':
      return 'border-sky-500/35 bg-sky-500/10 text-app-text';
    case 'review':
      return 'border-orange-500/35 bg-orange-500/10 text-app-text';
    case 'ready':
      return 'border-app-accent/35 bg-app-accent-soft/40 text-app-text';
    default:
      return 'border-app-border bg-app-panel text-app-text';
  }
}

/** Renders the dependency graph UI. */
export function DependencyGraphView({
  items,
  onSelectItem,
  selectedItemId,
}: DependencyGraphViewProps) {
  const graphNodes = buildGraphNodes(items);

  if (graphNodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-app-border bg-app-card/40 px-6 text-center">
        <div>
          <div className="surface-eyebrow">Dependency Graph</div>
          <p className="mt-2 text-sm leading-6 text-app-muted">
            Create a few work items to visualize how work depends on prior steps.
          </p>
        </div>
      </div>
    );
  }

  const nodesById = new Map(graphNodes.map((node) => [node.id, node] as const));
  const depthCache = new Map<string, number>();

  const getDepth = (nodeId: string, visiting: Set<string> = new Set()): number => {
    const cached = depthCache.get(nodeId);

    if (cached !== undefined) {
      return cached;
    }

    const node = nodesById.get(nodeId);
    const dependencyIds = normalizeDependencyIds(node?.dependsOn);

    if (!node || !dependencyIds || dependencyIds.length === 0 || visiting.has(nodeId)) {
      depthCache.set(nodeId, 0);
      return 0;
    }

    visiting.add(nodeId);
    const depth = Math.max(...dependencyIds.map((dependencyId) => getDepth(dependencyId, visiting) + 1));
    visiting.delete(nodeId);
    depthCache.set(nodeId, depth);
    return depth;
  };

  const columns = new Map<number, GraphNode[]>();

  for (const node of graphNodes) {
    const depth = getDepth(node.id);
    const column = columns.get(depth) ?? [];
    column.push(node);
    columns.set(depth, column);
  }

  for (const column of columns.values()) {
    column.sort((left, right) => left.title.localeCompare(right.title));
  }

  const sortedColumnEntries = [...columns.entries()].sort(([left], [right]) => left - right);
  const positions = new Map<string, { x: number; y: number }>();

  for (const [columnIndex, [, columnNodes]] of sortedColumnEntries.entries()) {
    for (const [rowIndex, node] of columnNodes.entries()) {
      positions.set(node.id, {
        x: GRAPH_PADDING_X + (columnIndex * (GRAPH_NODE_WIDTH + GRAPH_COLUMN_GAP)),
        y: GRAPH_PADDING_Y + (rowIndex * (GRAPH_NODE_HEIGHT + GRAPH_ROW_GAP)),
      });
    }
  }

  const graphWidth = (sortedColumnEntries.length * GRAPH_NODE_WIDTH)
    + (Math.max(0, sortedColumnEntries.length - 1) * GRAPH_COLUMN_GAP)
    + (GRAPH_PADDING_X * 2);
  const maxRows = Math.max(...sortedColumnEntries.map(([, columnNodes]) => columnNodes.length));
  const graphHeight = (maxRows * GRAPH_NODE_HEIGHT)
    + (Math.max(0, maxRows - 1) * GRAPH_ROW_GAP)
    + (GRAPH_PADDING_Y * 2);
  const dependencyEdges = graphNodes.flatMap((node) =>
    (normalizeDependencyIds(node.dependsOn) ?? []).flatMap((dependencyId) => {
      const dependencyPosition = positions.get(dependencyId);
      const targetPosition = positions.get(node.id);

      if (!dependencyPosition || !targetPosition) {
        return [];
      }

      const startX = dependencyPosition.x + GRAPH_NODE_WIDTH;
      const startY = dependencyPosition.y + (GRAPH_NODE_HEIGHT / 2);
      const endX = targetPosition.x;
      const endY = targetPosition.y + (GRAPH_NODE_HEIGHT / 2);
      const controlOffset = Math.max(40, (endX - startX) / 2);

      return [{
        d: `M ${startX} ${startY} C ${startX + controlOffset} ${startY}, ${endX - controlOffset} ${endY}, ${endX} ${endY}`,
        id: `${dependencyId}->${node.id}`,
        resolved: isDependencyResolved(nodesById.get(dependencyId) ?? null),
      }];
    }),
  );

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[24px] border border-app-border bg-app-panel/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border pb-4">
        <div>
          <div className="surface-eyebrow">Dependency Graph</div>
          <p className="mt-2 text-sm leading-6 text-app-muted">
            Dependencies flow left to right. Red nodes are still blocked by unfinished prerequisites.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-app-muted">
          <span className="pill-key border-transparent bg-rose-500/10 text-rose-200">Blocked</span>
          <span className="pill-key border-transparent bg-sky-500/10 text-app-text">Active</span>
          <span className="pill-key border-transparent bg-amber-500/10 text-app-text">Acceptance</span>
          <span className="pill-key border-transparent bg-emerald-500/10 text-app-text">Done</span>
        </div>
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-auto pt-4">
        <div
          className="relative rounded-[24px] border border-app-border bg-app-card/30"
          style={{
            height: graphHeight,
            minHeight: graphHeight,
            minWidth: graphWidth,
            width: graphWidth,
          }}
        >
          <svg className="absolute inset-0 h-full w-full" height={graphHeight} width={graphWidth}>
            {dependencyEdges.map((edge) => (
              <path
                d={edge.d}
                fill="none"
                key={edge.id}
                stroke={edge.resolved ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)'}
                strokeWidth="2.5"
              />
            ))}
          </svg>

          {graphNodes.map((node) => {
            const position = positions.get(node.id)!;
            const isSelected = selectedItemId === node.id;

            return (
              <button
                className={cn(
                  'absolute flex flex-col items-start justify-between rounded-[22px] border p-4 text-left shadow-[var(--app-shadow)] transition-transform hover:-translate-y-0.5',
                  getNodeTone(node),
                  isSelected ? 'ring-2 ring-app-accent/60 ring-offset-2 ring-offset-app-panel' : '',
                  node.isMissing ? 'cursor-default' : 'cursor-pointer',
                )}
                disabled={node.isMissing}
                key={node.id}
                onClick={() => {
                  if (!node.isMissing) {
                    onSelectItem(node.id);
                  }
                }}
                style={{
                  height: GRAPH_NODE_HEIGHT,
                  left: position.x,
                  top: position.y,
                  width: GRAPH_NODE_WIDTH,
                }}
                type="button"
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold tracking-[-0.02em]">
                      {node.title}
                    </p>
                    <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-app-muted">
                      {formatNodeStatus(node.status)}
                    </p>
                  </div>
                  {node.isBlocked && !node.isMissing ? (
                    <span className="pill-key border-transparent bg-rose-500/10 text-rose-200">
                      Blocked
                    </span>
                  ) : null}
                </div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-app-muted">
                  {node.id}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
