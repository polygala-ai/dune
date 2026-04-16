# Dune Architecture

This document describes the current checked-out worktree, including the `tools-handler` agent IPC path.

## Overview

Dune is an Electron desktop app with:

- a React renderer in `src/renderer/`
- a flat preload bridge exposed as `window.duneDesktop`
- a privileged main process in `src/electron/main/`
- an AgentLite-backed runtime in `src/electron/main/runtime/`
- local persistence in Electron `userData` plus the `.dune` runtime tree

The main product surfaces are:

- agents
- workflow
- settings

## System Map

- Renderer
  - `AppShell` and the workspace components render the UI.
  - Zustand holds agent, shell, settings, and workflow state.
  - `agentRuntime` syncs runtime snapshots into the store.
  - `useWorkflowPersistence` loads and saves the workflow snapshot.
  - The renderer does not import Electron or Node APIs directly.
- Preload
  - `src/electron/preload.ts` exposes a flat `DesktopBridge`.
  - Each bridge method maps to one IPC capability or subscription.
- Main process
  - Creates the window.
  - Registers IPC handlers.
  - Owns storage, proxy configuration, runtime bootstrap, reset, and shutdown.
- Runtime controller
  - `DesktopRuntimeController` is the main-process facade for runtime actions.
  - It starts in mock mode, then swaps to `AgentRuntime` when available.
- Runtime core
  - `AgentRuntime` owns persisted agent state, AgentLite startup, snapshots, Telegram integration, and Dune-managed agent runtimes.
  - `DuneAgent` wraps one AgentLite agent.
  - `TelegramBridge` manages Telegram setup sessions, observers, and inbound messages.
- Storage
  - `JsonFileStorage` stores non-secret app state.
  - `EncryptedFileStorage` stores secrets with `safeStorage` when available.
- Agent IPC
  - `AgentIpcManager` watches project agent IPC directories.
  - `AgentIpcConnection` reads and writes JSON files in `agent/` and `host/`.
  - `tools-handler` serves structured tool calls for workflow, agents, and runtime inspection.
- External integrations
  - Telegram is implemented.
  - Slack and Discord are placeholders.

### Call Graph (Big Picture)

Three processes, one snapshot. Commands flow up, snapshots flow down.

```text
┌─ RENDERER ──────────────────────────┐
│  entry.tsx                           │
│    └─► AppShell                      │
│          └─► useAppStore (zustand)   │
│                ├─ agent-slice        │
│                ├─ shell-slice        │
│                ├─ settings-slice     │
│                └─ workflow-slice     │
│                                      │
│  BridgeAgentRuntime                  │
│   (store ⇄ window.duneDesktop)       │
└──────────────┬───────────────────────┘
               │
               ▼  window.duneDesktop.xxx()
┌─ PRELOAD ────────────────────────────┐
│  preload.ts                          │
│    const bridge: DesktopBridge       │
│    contextBridge.exposeInMainWorld   │
└──────────────┬───────────────────────┘
               │
               ▼  ipcRenderer.invoke / .on
┌─ MAIN ───────────────────────────────┐
│  main.ts                             │
│    ipcMain.handle(...)               │
│         │                            │
│         ▼                            │
│  DesktopRuntimeController            │
│         │                            │
│         ▼                            │
│  AgentRuntime                        │
│    └─► DuneAgent                     │
│          └─► DuneChannel             │
│                                      │
│  JsonFileStorage / Encrypted...      │
└──────────────────────────────────────┘

Shared contracts (types only, no runtime):
  ipc-channels.ts    channel names
  desktop-bridge.ts  DesktopBridge interface
  agent-runtime.ts   AgentServiceSnapshot
```

Two flows to memorise:

```text
Command    UI → store → Bridge → preload → ipcMain → Controller → Engine
Snapshot   Engine → Controller → webContents.send → preload → Bridge → store → UI
```

Read in this order: `ipc-channels.ts` → `desktop-bridge.ts` → `preload.ts` →
`main.ts` → `AppShell.tsx` → `use-app-store.ts`. After those six, everything
else is just following names.

### Process Boundary Reference

| Layer       | Lives in                      | Can touch                        | Talks to next layer via           |
|-------------|-------------------------------|----------------------------------|-----------------------------------|
| Renderer    | `src/renderer/`               | DOM, React, Zustand              | `window.duneDesktop.*`            |
| Preload     | `src/electron/preload.ts` | `contextBridge`, `ipcRenderer` | `ipcRenderer.invoke` / `.on`      |
| Main        | `src/electron/main/`          | Node, fs, child_process, network | `ipcMain.handle` / `webContents.send` |

The preload is intentionally a dumb pass-through — one method per IPC channel,
no logic. All real work happens on the ends: React state in the renderer,
`DesktopRuntimeController` + `AgentRuntime` + `AppStorage` in main.

### Component Graph

This is the finer-grained ownership tree behind the big-picture diagram above.

```text
Legend:
  -> direct call or ownership
  => emitted update or persisted side effect

User
  -> Renderer (React + Zustand)
    -> Preload (window.duneDesktop / DesktopBridge)
      -> Main process (window + IPC + storage + proxy)
        -> Local stores
          -> agents.json
          -> workflow.json
          -> settings.json
          -> secrets.json
        -> NetworkProxyManager
        -> DesktopRuntimeController
          -> AgentRuntime
            -> AgentLite / DuneAgent
            -> TelegramBridge
            -> Project agent IPC tree
              -> agent/
              -> host/
              -> CLAUDE.md
            -> AgentIpcManager / AgentIpcConnection
              -> tools-handler
                -> workflow store
                -> DesktopRuntimeController
```

## Runtime Boot And Lifecycle

Startup begins in `app.whenReady()` in `src/electron/main.ts`.

1. Resolve the runtime home and Electron `userData` paths.
   - `DUNE_AGENTLITE_HOME_DIR` overrides the home used for AgentLite data and project IPC trees.
2. Create four stores:
   - `agents` and `settings` with `JsonFileStorage`
   - `workflow` with `JsonFileStorage`
   - `secrets` with `EncryptedFileStorage`
3. Create `NetworkProxyManager` and apply saved network settings before showing the window.
   - Electron traffic uses `session.setProxy(...)`.
   - Node traffic uses `global-agent` with the `DUNE_PROXY_` namespace.
4. Register IPC handlers for runtime actions, storage access, reset/restart, clipboard, and external links.
5. Create the main window with a sandboxed preload script, `contextIsolation: true`, and `nodeIntegration: false`.
6. Bootstrap the runtime lazily.
   - `scheduleRuntimeBootstrap(250)` starts it shortly after launch.
   - Any earlier runtime call also forces bootstrap through `ensureRuntime()`.
7. Real bootstrap imports the runtime modules on demand, migrates model provider settings, creates `AgentIpcManager`, installs `tools-handler`, creates `DesktopRuntimeController`, subscribes snapshot fanout, and starts the runtime and IPC manager.
8. When the renderer finishes loading, the latest runtime snapshot is pushed immediately if the controller already exists.

### Runtime States

- `DesktopRuntimeController` starts in mock mode so the UI can render immediately.
- If AgentLite starts successfully, it swaps to `AgentRuntime`.
- If AgentLite startup fails, it stays in mock fallback mode with an error message.

### Quit, Reset, And Relaunch

- `createQuitCoordinator(...)` waits for runtime shutdown before quitting.
- `deleteLocalData` clears Electron storage, removes the AgentLite runtime root, and relaunches the app.
- `resetRuntime` clears in-process runtime state only.
- On macOS, closing all windows does not quit the app.

## Core Data Flows

### Agent Chat Flow

1. The chat composer calls `useAgentSubmit`.
2. `useAgentSubmit` sends the message through `agentRuntime.service.sendMessage(...)`.
3. The preload bridge calls `window.duneDesktop.sendAgentMessage(...)`.
4. The main process routes the request to `DesktopRuntimeController`.
5. The controller forwards it to `AgentRuntime`.
6. `AgentRuntime` updates persisted and in-memory transcript state, ensures a `DuneAgent` exists, and pushes the input into the Dune channel.
7. Assistant output updates the runtime snapshot.
8. The main process broadcasts `runtimeSnapshotUpdated`.
9. The bridge runtime updates the snapshot and the renderer store rerenders.

```text
Legend:
  -> direct call
  => emitted update

User
  -> Renderer composer
    -> agentRuntime
      -> window.duneDesktop.sendAgentMessage(...)
        -> ipcMain handler
          -> DesktopRuntimeController
            -> AgentRuntime
              -> DuneAgent / AgentLite
              => runtime snapshot update
          => runtimeSnapshotUpdated
        => renderer store
          => rerender
```

### Workflow Hydration And Persistence

1. `useWorkflowPersistence` loads `workflow/snapshot` through `storageGet(...)`.
2. It normalizes persisted snapshot shapes and hydrates the workflow slice.
3. Renderer-side workflow edits write the new snapshot through `storageSet(...)`.
4. Agent tool calls can also update the same snapshot in the main process.
5. After a main-process workflow update, `tools-handler` emits `workflowChanged`.
6. The renderer reloads the stored snapshot and rehydrates.

This keeps workflow state local-first in the renderer while still allowing project agents to mutate it through the main process.

## Persistence Model

### Electron `userData`

App-owned local state lives in Electron `app.getPath('userData')`.

- `agents.json`
  - Persisted agent records and `selectedAgentId`.
- `workflow.json`
  - The stored workflow `snapshot`: projects, items, tasks, work products, and selection state.
- `settings.json`
  - Non-secret settings such as theme, network settings, and model provider metadata.
- `secrets.json`
  - Secret values such as model provider credentials and Telegram bot tokens.
  - Values are encrypted with `safeStorage` when available.

These stores are simple JSON files. There is no database layer.

### `.dune` Runtime Tree

Runtime-managed state lives under the configured home directory.

- AgentLite runtime root
  - `~/.dune/agentlite`
  - Stores AgentLite groups, agent runtime data, and attachment files.
- Project agent support tree
  - `~/.dune/projs/...`
  - Contains generated `CLAUDE.md` guides plus per-project and per-agent support files that are mounted into AgentLite containers.

In short:

- Electron `userData` stores app state.
- `.dune` stores runtime state and generated agent support files.

## Agent Actions And Workflow Tools

Project agents talk to Dune through AgentLite's built-in HTTP `actions` transport.

### Action Surface

Each Dune agent registers a project-scoped action surface in the host process via `registerDuneActions(...)`:

- Workflow actions
  - `workflow.projects.*`
  - `workflow.items.*`
  - `workflow.tasks.*`
  - `workflow.work_products.*`
  - `workflow.assignments.*`
- Agent/runtime actions
  - `agents.*`
  - `runtime.get_snapshot`
- ACP delegation actions from AgentLite itself
  - `acp_list_remote_agents`
  - `acp_new_session`
  - `acp_prompt`
  - `acp_cancel`
  - `acp_close_session`

Inside the container, the model does not see host functions as bespoke tools. Instead it uses the built-in MCP helpers:

- `search_actions({ query?, limit? })`
  - discovers registered host actions plus their JSON schemas
- `call_action({ name, payload })`
  - invokes one action synchronously and returns JSON

ACP peers are separate from Dune-owned actions. They run on the host and are used for background coding delegation to Claude Code / Codex when available.

### Workflow Mutation Path

Workflow action handlers follow one pattern:

1. Read the stored workflow snapshot.
2. Clone and validate it.
3. Apply the project, item, task, assignment, or work-product change.
4. Normalize selection and sort order.
5. Persist the snapshot back to `workflow.json`.
6. Emit `workflowChanged`.
7. Let `useWorkflowPersistence` reload the snapshot in the renderer.

Tool handlers can also call the runtime controller. For example:

- deleting an agent clears any primary workflow assignment pointing to it
- deleting a project also deletes its project-scoped agents
- agent lookup and creation use the live runtime snapshot

```text
Legend:
  -> direct call
  => emitted update or persisted side effect

Project agent
  -> search_actions / call_action
    -> AgentLite actions HTTP transport
      -> registerDuneActions
        -> workflow store
          => read snapshot
          => write normalized snapshot
        -> DesktopRuntimeController
        => workflowChanged
          => renderer reloads workflow snapshot
```

## Current Limits And Extension Seams

### Known Limits

- Telegram is the only implemented external channel.
- Slack and Discord are placeholders.
- Plugins are a reserved workspace, not a full plugin runtime yet.
- The renderer depends on the preload bridge for privileged work.
- The runtime can fall back to mock mode if AgentLite is unavailable.

### Stable Seams

- `window.duneDesktop`
  - The renderer-to-desktop contract.
- `DesktopBridge`
  - The typed bridge surface.
- `ipcChannels`
  - The canonical IPC channel list.
- `registerDuneActions(...)`
  - The host action surface registered on each agent.
- `readIpcGuide(...)`
  - The generated guide that teaches agents how to use `search_actions`, `call_action`, and ACP peers.
- `settings-sections.ts`
  - The settings route registry.
- Workflow store and presenters
  - The main extension point for workflow UI and derived state.

When extending Dune, keep the current split:

- privileged logic in the main process
- a thin typed preload bridge
- a Node-free renderer
- workflow reconciliation centered on the stored snapshot
- project agent automation flowing through the shared IPC tool protocol
