export const ipcChannels = {
  createAgent: 'dune:runtime:create-agent',
  getRuntimeSnapshot: 'dune:runtime:get-snapshot',
  resetRuntime: 'dune:runtime:reset',
  runtimeSnapshotUpdated: 'dune:runtime:snapshot-updated',
  selectAgent: 'dune:runtime:select-agent',
  sendAgentMessage: 'dune:runtime:send-agent-message',
  storageDelete: 'dune:storage:delete',
  storageGet: 'dune:storage:get',
  storageKeys: 'dune:storage:keys',
  storageSet: 'dune:storage:set',
} as const;
