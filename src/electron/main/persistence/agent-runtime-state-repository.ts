// Drizzle-backed agent runtime state persistence.

import { eq } from 'drizzle-orm';

import type { DuneDatabase } from '@/electron/main/db';
import {
  agentActivityEvents,
  agentCodingEngineEvents,
  agentContextCards,
  agentMessages,
  agents,
  agentTranscriptArchives,
  agentUiState,
  GLOBAL_STATE_ROW_ID,
} from '@/electron/main/orm';
import type {
  Agent,
  AgentActivityEvent,
  AgentContextCard,
  AgentMessage,
  CodingEngineEvent,
} from '@/renderer/features/agents/types';
import type {
  PersistedAgentRecord,
  PersistedTranscriptArchive,
} from '@/electron/main/runtime/agent-runtime/records';

/** Persisted agent runtime state. */
export interface PersistedAgentRuntimeState {
  agents: PersistedAgentRecord[];
  selectedAgentId: string | null;
}

/** Agent runtime persistence contract. */
export interface AgentRuntimeStateRepository {
  load(): Promise<PersistedAgentRuntimeState>;
  save(state: PersistedAgentRuntimeState): Promise<void>;
}

function groupBy<T, K extends string>(
  rows: T[],
  resolveKey: (row: T) => K,
): Map<K, T[]> {
  const grouped = new Map<K, T[]>();

  for (const row of rows) {
    const key = resolveKey(row);
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }

  return grouped;
}

/** Drizzle implementation for agent runtime state persistence. */
export class DrizzleAgentRuntimeStateRepository implements AgentRuntimeStateRepository {
  constructor(private readonly db: DuneDatabase) {}

  load(): Promise<PersistedAgentRuntimeState> {
    const agentRows = this.db.select().from(agents).all();
    const messageRowsByAgent = groupBy(
      this.db.select().from(agentMessages).all(),
      (row) => row.agentId,
    );
    const activityRowsByAgent = groupBy(
      this.db.select().from(agentActivityEvents).all(),
      (row) => row.agentId,
    );
    const contextRowsByAgent = groupBy(
      this.db.select().from(agentContextCards).all(),
      (row) => row.agentId,
    );
    const codingRowsByAgent = groupBy(
      this.db.select().from(agentCodingEngineEvents).all(),
      (row) => row.agentId,
    );
    const archiveRowsByAgent = new Map(
      this.db.select().from(agentTranscriptArchives).all()
        .map((archive) => [archive.agentId, archive] as const),
    );
    const uiRow = this.db
      .select()
      .from(agentUiState)
      .where(eq(agentUiState.id, GLOBAL_STATE_ROW_ID))
      .get();

    return Promise.resolve({
      agents: agentRows.map((row): PersistedAgentRecord => {
        const archive = archiveRowsByAgent.get(row.id);
        const agent = {
          activityEvents: (activityRowsByAgent.get(row.id) ?? [])
            .map((event): AgentActivityEvent => ({
              ...(event.detail ? { detail: event.detail } : {}),
              id: event.id,
              kind: event.kind as AgentActivityEvent['kind'],
              label: event.label,
              timestamp: event.timestamp,
            }))
            .sort((left, right) => right.timestamp - left.timestamp),
          channel: row.channel,
          codingEngineEvents: (codingRowsByAgent.get(row.id) ?? [])
            .map((event): CodingEngineEvent => ({
              ...(event.error ? { error: event.error } : {}),
              ...(event.prompt ? { prompt: event.prompt } : {}),
              ...(event.result ? { result: event.result } : {}),
              ...(event.stepLabel ? { stepLabel: event.stepLabel } : {}),
              engineId: event.engineId,
              id: event.id,
              kind: event.kind as CodingEngineEvent['kind'],
              timestamp: event.timestamp,
            }))
            .sort((left, right) => left.timestamp - right.timestamp),
          contextCards: (contextRowsByAgent.get(row.id) ?? [])
            .map((card): AgentContextCard => ({
              body: card.body,
              eyebrow: card.eyebrow,
              id: card.id,
              title: card.title,
            })),
          definition: row.definition,
          id: row.id,
          messages: (messageRowsByAgent.get(row.id) ?? [])
            .map((message): AgentMessage => ({
              ...(message.usage ? { usage: message.usage } : {}),
              attachments: message.attachments,
              content: message.content,
              createdAt: message.createdAt,
              format: message.format,
              id: message.id,
              role: message.role,
              status: message.status,
            }))
            .sort((left, right) => left.createdAt - right.createdAt),
          name: row.name,
          note: row.note,
          preview: row.preview,
          projectId: row.projectId,
          status: row.status,
          telegram: row.telegram,
          transcript: row.transcript,
          updatedAt: row.updatedAt,
          workspace: row.workspace,
        } satisfies Agent;

        return {
          agent,
          groupFolder: row.groupFolder,
          projectName: row.projectName,
          projectRootPath: row.projectRootPath,
          transcriptArchive: archive
            ? {
                lastCompactedAt: archive.lastCompactedAt,
                messages: archive.messages,
                rollingSummary: archive.rollingSummary,
              } satisfies PersistedTranscriptArchive
            : null,
        };
      }),
      selectedAgentId: uiRow?.selectedAgentId ?? null,
    });
  }

  save(state: PersistedAgentRuntimeState): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(agentActivityEvents).run();
      tx.delete(agentCodingEngineEvents).run();
      tx.delete(agentContextCards).run();
      tx.delete(agentMessages).run();
      tx.delete(agentTranscriptArchives).run();
      tx.delete(agents).run();
      tx.delete(agentUiState).run();

      if (state.agents.length > 0) {
        tx.insert(agents).values(state.agents.map((record) => ({
          channel: record.agent.channel,
          definition: record.agent.definition,
          groupFolder: record.groupFolder,
          id: record.agent.id,
          name: record.agent.name,
          note: record.agent.note,
          preview: record.agent.preview,
          projectId: record.agent.projectId,
          projectName: record.projectName ?? null,
          projectRootPath: record.projectRootPath ?? null,
          status: record.agent.status,
          telegram: record.agent.telegram,
          transcript: record.agent.transcript,
          updatedAt: record.agent.updatedAt,
          workspace: record.agent.workspace,
        }))).run();
      }

      const messageRows = state.agents.flatMap((record) =>
        record.agent.messages.map((message) => ({
          agentId: record.agent.id,
          attachments: message.attachments,
          content: message.content,
          createdAt: message.createdAt,
          format: message.format,
          id: message.id,
          role: message.role,
          status: message.status,
          usage: message.usage,
        })));
      const activityRows = state.agents.flatMap((record) =>
        record.agent.activityEvents.map((event) => ({
          agentId: record.agent.id,
          detail: event.detail ?? null,
          id: event.id,
          kind: event.kind,
          label: event.label,
          timestamp: event.timestamp,
        })));
      const contextRows = state.agents.flatMap((record) =>
        record.agent.contextCards.map((card) => ({
          agentId: record.agent.id,
          body: card.body,
          eyebrow: card.eyebrow,
          id: card.id,
          title: card.title,
        })));
      const codingRows = state.agents.flatMap((record) =>
        record.agent.codingEngineEvents.map((event) => ({
          agentId: record.agent.id,
          engineId: event.engineId,
          error: event.error ?? null,
          id: event.id,
          kind: event.kind,
          prompt: event.prompt ?? null,
          result: event.result ?? null,
          stepLabel: event.stepLabel ?? null,
          timestamp: event.timestamp,
        })));
      const archiveRows = state.agents
        .filter((record) => record.transcriptArchive)
        .map((record) => ({
          agentId: record.agent.id,
          lastCompactedAt: record.transcriptArchive?.lastCompactedAt ?? null,
          messages: record.transcriptArchive?.messages ?? [],
          rollingSummary: record.transcriptArchive?.rollingSummary ?? null,
        }));

      if (messageRows.length > 0) {
        tx.insert(agentMessages).values(messageRows).run();
      }
      if (activityRows.length > 0) {
        tx.insert(agentActivityEvents).values(activityRows).run();
      }
      if (contextRows.length > 0) {
        tx.insert(agentContextCards).values(contextRows).run();
      }
      if (codingRows.length > 0) {
        tx.insert(agentCodingEngineEvents).values(codingRows).run();
      }
      if (archiveRows.length > 0) {
        tx.insert(agentTranscriptArchives).values(archiveRows).run();
      }

      tx.insert(agentUiState).values({
        id: GLOBAL_STATE_ROW_ID,
        selectedAgentId: state.selectedAgentId,
      }).run();
    });

    return Promise.resolve();
  }
}
