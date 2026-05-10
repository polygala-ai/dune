// Shared ORM schema constants.

export const agentStatuses = ['draft', 'live', 'ready'] as const;
export const codingEngineIds = ['claude-code', 'codex'] as const;
export const messageFormats = ['markdown', 'plain'] as const;
export const messageRoles = ['assistant', 'system', 'user'] as const;
export const messageStatuses = ['complete', 'streaming'] as const;
export const modelAuthTypes = ['api-key', 'oauth-token'] as const;
export const modelProviderKinds = ['anthropic', 'openai'] as const;
export const networkProxyModes = ['direct', 'manual', 'system'] as const;
export const workflowEventKinds = ['assignment', 'feedback', 'item', 'note', 'task'] as const;
export const workflowItemStatuses = ['inbox', 'ready', 'active', 'review', 'acceptance', 'done'] as const;
export const workflowProjectFilters = ['all', 'assigned', 'blocked', 'review'] as const;
export const workflowProjectViews = ['board', 'agents', 'activity'] as const;
export const workflowTaskStatuses = ['todo', 'doing', 'blocked', 'review', 'done'] as const;

/** Singleton row id used for app-level UI state tables. */
export const GLOBAL_STATE_ROW_ID = 'global';
