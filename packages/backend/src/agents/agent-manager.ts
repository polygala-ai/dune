/**
 * agent-manager.ts — barrel re-export
 *
 * All logic has been extracted into sub-modules. This file re-exports
 * every public symbol so that existing consumers (17 test files + src
 * modules) continue to work via `import * from './agent-manager.js'`.
 */

// ── Wire up circular-dependency bridges ─────────────────────────────────
// These must run at module-evaluation time so that the lazy references are
// available before any exported function is called.

import { __setLifecycleDeps as __setRuntimeSandboxLifecycleDeps } from './runtime-sandbox.js'
import { __setLifecycleDeps as __setSettingsSyncLifecycleDeps } from './settings-sync.js'
import { __setSendMessageDep } from './todo-reminder.js'

// We use a lazy approach: lifecycle and messaging are imported, then deps
// are wired after all modules are evaluated (via a micro-task).
import { ensureAgentRunning, stopAgent } from './lifecycle.js'
import { sendMessage } from './messaging.js'

__setRuntimeSandboxLifecycleDeps({ ensureAgentRunning, stopAgent })
__setSettingsSyncLifecycleDeps({ ensureAgentRunning, stopAgent })
__setSendMessageDep(sendMessage)

// ── Re-exports from constants ───────────────────────────────────────────
export { BUILTIN_AGENT_SKILLS, __resolveBundledAssetDirForTests } from './constants.js'
export type { SkillInfo, ClaudeSettingsSyncAgentResult, ClaudeSettingsSyncSummary, RunningAgent, InputMetadata } from './constants.js'

// ── Re-exports from runtime-state ───────────────────────────────────────
export { isAgentRunning, closeRuntime, __setRunningAgentForTests, __setRuntimeForTests } from './runtime-state.js'

// ── Re-exports from prompt-builder ──────────────────────────────────────
export { listSkills, assembleSystemPrompt } from './prompt-builder.js'

// ── Re-exports from host-paths ──────────────────────────────────────────
export { __ensureAgentRuntimeHostPathsForTests, __buildAgentRuntimeBaseVolumesForTests, __buildAgentRuntimeVolumesForTests } from './host-paths.js'

// ── Re-exports from nginx ───────────────────────────────────────────────
export { patchMiniappNginxRouting, ensureMiniappNginxConfigured } from './nginx.js'

// ── Re-exports from settings-sync ───────────────────────────────────────
export { __mergeClaudeSettingsContentForTests, __buildClaudeSettingsEnvValuesForTests, __buildClaudeCliAuthEnvValuesForTests, syncClaudeSettingsForAllAgents, syncClaudeSettingsForRunningAgents } from './settings-sync.js'

// ── Re-exports from daemon-sync ─────────────────────────────────────────
export { __syncCommunicationDaemonAssetsForTests, __reconcileCommunicationDaemonsForTests, __getCommunicationDaemonProcessStatusForTests, reconcileAllRunningCommunicationDaemons, redeployAllDaemons } from './daemon-sync.js'

// ── Re-exports from todo-reminder ───────────────────────────────────────
export { __parseLeaderPdcaForTests, __detectLeaderPolicyViolationForTests, __finalizeTodoReminderTurnForTests, __getTodoReminderCooldownForTests, __setAgentLockForTests, __setTodoReminderEnqueueForTests, __runTodoReminderCheckForTests, __resetTodoReminderStateForTests } from './todo-reminder.js'

// ── Re-exports from messaging ───────────────────────────────────────────
export { sendMessage, __buildClaudeCliCommandForTests, __getStopAgentShutdownPromptForTests } from './messaging.js'

// ── Re-exports from lifecycle ───────────────────────────────────────────
export { cancelStartup, ensureAgentRunning, startAgent, stopAgent, stopAllAgents, interruptAgentWorkflow, __waitUntilDesktopReadyForTests, __prepareAgentConfigFacadeInBoxForTests } from './lifecycle.js'

// ── Re-exports from screen ──────────────────────────────────────────────
export { takeScreenshot, getAgentScreen, getAgentHttpBaseUrl, debugExec } from './screen.js'

// ── Re-exports from runtime-sandbox ─────────────────────────────────────
export { resolveAgentIdByRuntimeSandboxId, ensureRuntimeSandboxRunning, stopRuntimeSandbox, destroyRuntimeSandbox, execInRuntimeSandbox, withRuntimeSandboxBox, destroyAgentRuntimeSandbox, resetStoppedAgentRuntimeSandbox, listRunningAgentSandboxes } from './runtime-sandbox.js'
