// Workflow board drag-and-drop UI.

import { useState } from 'react';
import {
  type DragEndEvent,
  type DragStartEvent,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

import {
  workflowItemStatusLabels,
} from '@/renderer/features/workflow/model/workflow-presenters';
import type {
  WorkflowItemStatus,
  WorkflowItemSummary,
} from '@/renderer/features/workflow/types';
import { cn } from '@/renderer/shared/lib/utils';

const workflowColumns: WorkflowItemStatus[] = [
  'inbox',
  'ready',
  'active',
  'review',
  'done',
];

/** Workflow board props. */
interface WorkflowBoardProps {
  items: WorkflowItemSummary[];
  onMoveItem: (itemId: string, status: WorkflowItemStatus, index: number) => void;
  onSelectItem: (itemId: string) => void;
  selectedItemId: string | null;
}

/** Returns column items. */
function getColumnItems(
  items: WorkflowItemSummary[],
  status: WorkflowItemStatus,
) {
  return items.filter((item) => item.status === status);
}

/** Renders the item card UI. */
function ItemCard({
  active,
  item,
  listeners,
  onSelect,
}: {
  active: boolean;
  item: WorkflowItemSummary;
  listeners?: Record<string, unknown>;
  onSelect: () => void;
}) {
  return (
    <article
      className={cn(
        'rounded-[22px] border border-app-border bg-app-panel px-4 py-4 text-left shadow-[var(--app-shadow)] transition-colors',
        active ? 'border-app-accent/50 bg-app-panel-strong' : 'hover:bg-app-card',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          aria-label={`Open ${item.title}`}
          className="min-w-0 flex-1 cursor-pointer text-left"
          onClick={onSelect}
          type="button"
        >
          <p className="text-[15px] font-semibold tracking-[-0.03em] text-app-text">
            {item.title}
          </p>
          <p className="mt-2 truncate text-sm leading-6 text-app-muted">
            {item.brief || 'No brief yet.'}
          </p>
        </button>
        <button
          aria-label={`Drag ${item.title}`}
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] text-app-muted transition-colors hover:bg-app-card"
          type="button"
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-[12px] text-app-muted">
        <span className="flex items-center gap-1.5 truncate">
          {item.isAgentWorking ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          ) : null}
          {item.primaryAgentName ?? 'No agent'}
        </span>
        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em]">
          {item.totalTaskCount === 0
            ? '0/0'
            : `${item.completedTaskCount}/${item.totalTaskCount}`}
        </span>
      </div>

      {item.isAgentWorking && item.currentTaskTitle ? (
        <p className="mt-2 truncate text-[11px] text-emerald-500/80">
          ↳ {item.currentTaskTitle.split('—')[0]?.trim()}
        </p>
      ) : null}

      {item.specialStateLabel ? (
        <div className="mt-3">
          <span className="pill-key border-transparent bg-app-card">
            {item.specialStateLabel}
          </span>
        </div>
      ) : null}
    </article>
  );
}

/** Renders the sortable item card UI. */
function SortableItemCard({
  item,
  onSelect,
  selectedItemId,
}: {
  item: WorkflowItemSummary;
  onSelect: () => void;
  selectedItemId: string | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: item.id,
  });

  return (
    <div
      className="touch-none"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      {...attributes}
    >
      <ItemCard
        active={selectedItemId === item.id}
        item={item}
        onSelect={onSelect}
        {...(listeners ? { listeners: listeners as Record<string, unknown> } : {})}
      />
    </div>
  );
}

/** Renders the column UI. */
function Column({
  items,
  onSelectItem,
  selectedItemId,
  status,
}: {
  items: WorkflowItemSummary[];
  onSelectItem: (itemId: string) => void;
  selectedItemId: string | null;
  status: WorkflowItemStatus;
}) {
  const { isOver, setNodeRef } = useDroppable({
    data: {
      status,
      type: 'column',
    },
    id: `column:${status}`,
  });

  return (
    <section
      className="flex min-h-0 min-w-[220px] flex-[1_1_0] flex-col rounded-[24px] border border-app-border bg-app-card/60 p-3"
      data-testid={`workflow-column-${status}`}
    >
      <div className="flex items-center justify-between gap-3 px-2 pb-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">
            {workflowItemStatusLabels[status]}
          </div>
          <div className="mt-1 text-sm text-app-muted">
            {items.length} item{items.length === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div
        className={cn(
          'no-scrollbar flex min-h-[180px] min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-[20px] p-1 transition-colors',
          isOver ? 'bg-app-accent-soft/60' : 'bg-transparent',
        )}
        data-testid={`workflow-column-body-${status}`}
        ref={setNodeRef}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <SortableItemCard
              item={item}
              key={item.id}
              onSelect={() => onSelectItem(item.id)}
              selectedItemId={selectedItemId}
            />
          ))}
        </SortableContext>

        {items.length === 0 ? (
          <div className="flex min-h-[140px] items-center justify-center rounded-[18px] border border-dashed border-app-border bg-app-panel/60 px-4 text-center text-sm leading-6 text-app-muted">
            Drop a work item here or create a new one for this stage.
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Renders the workflow board UI. */
export function WorkflowBoard({
  items,
  onMoveItem,
  onSelectItem,
  selectedItemId,
}: WorkflowBoardProps) {
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeItem =
    items.find((item) => item.id === activeItemId) ?? null;

  /** Handles start drag. */
  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveItemId(String(active.id));
  };

  /** Handles end drag. */
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveItemId(null);

    if (!over) {
      return;
    }

    const itemId = String(active.id);
    const draggedItem = items.find((item) => item.id === itemId);

    if (!draggedItem) {
      return;
    }

    const overId = String(over.id);
    const overItem = items.find((item) => item.id === overId) ?? null;
    const nextStatus =
      overItem?.status ??
      (overId.startsWith('column:')
        ? (overId.replace('column:', '') as WorkflowItemStatus)
        : draggedItem.status);
    const statusItems = getColumnItems(items, nextStatus);
    let nextIndex = statusItems.length;

    if (overItem) {
      nextIndex = statusItems.findIndex((item) => item.id === overItem.id);
      if (nextIndex === -1) {
        nextIndex = statusItems.length;
      }
    }

    onMoveItem(itemId, nextStatus, nextIndex);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="workflow-board">
      <DndContext
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className="no-scrollbar flex min-h-0 flex-1 gap-4 overflow-x-auto overflow-y-hidden pb-2">
          {workflowColumns.map((status) => (
            <Column
              items={getColumnItems(items, status)}
              key={status}
              onSelectItem={onSelectItem}
              selectedItemId={selectedItemId}
              status={status}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="w-[280px]">
              <ItemCard
                active
                item={activeItem}
                onSelect={() => undefined}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
