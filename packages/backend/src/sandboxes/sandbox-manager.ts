/**
 * Backward-compatible barrel — all public API is re-exported from sub-modules.
 */
export { closeSandboxRuntime } from './runtime-state.js'
export { listBoxes, createBox, getBox, patchBox, deleteBox, startBox, stopBox, getBoxStatus, reconcileSandboxesOnStartup, stopAllSandboxes } from './lifecycle.js'
export { createExec, listExecs, getExec, getExecEvents, streamExecEventsSse } from './exec.js'
export { uploadFileContent, downloadFileContent, listFsEntries, readFsFileContent, mkdirFsPath, moveFsPath, deleteFsPath, importHostPath } from './files.js'
export { getTerminalBox } from './terminal.js'
