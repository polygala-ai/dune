/**
 * _init.ts — circular-dependency bridge wiring.
 *
 * Must be imported once (side-effect only) before any agents/* module is
 * called. The app entry point (index.ts) imports this at the top.
 */
import { __setLifecycleDeps as __setRuntimeSandboxLifecycleDeps } from './runtime-sandbox.js'
import { __setLifecycleDeps as __setSettingsSyncLifecycleDeps } from './settings-sync.js'
import { __setSendMessageDep } from './todo-reminder.js'

import { ensureAgentRunning, stopAgent } from './lifecycle.js'
import { sendMessage } from './messaging.js'

__setRuntimeSandboxLifecycleDeps({ ensureAgentRunning, stopAgent })
__setSettingsSyncLifecycleDeps({ ensureAgentRunning, stopAgent })
__setSendMessageDep(sendMessage)
