export const runtimeIpcChannels = {
  createAgent: 'dune:runtime:create-agent',
  getRuntimeSnapshot: 'dune:runtime:get-snapshot',
  resetRuntime: 'dune:runtime:reset',
  runtimeSnapshotUpdated: 'dune:runtime:snapshot-updated',
  selectAgent: 'dune:runtime:select-agent',
  sendAgentMessage: 'dune:runtime:send-agent-message',
} as const;
