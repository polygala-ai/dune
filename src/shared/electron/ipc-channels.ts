export const ipcChannels = {
  createAgent: 'dune:runtime:create-agent',
  deleteAgent: 'dune:runtime:delete-agent',
  getRuntimeSnapshot: 'dune:runtime:get-snapshot',
  resetRuntime: 'dune:runtime:reset',
  restartApp: 'dune:runtime:restart-app',
  runtimeSnapshotUpdated: 'dune:runtime:snapshot-updated',
  selectAgent: 'dune:runtime:select-agent',
  sendAgentMessage: 'dune:runtime:send-agent-message',
  storageDelete: 'dune:storage:delete',
  storageGet: 'dune:storage:get',
  storageKeys: 'dune:storage:keys',
  storageSet: 'dune:storage:set',
} as const;
