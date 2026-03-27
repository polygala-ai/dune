# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                 # Start Electron + Vite dev server
pnpm typecheck           # tsc --noEmit
pnpm lint                # ESLint for .ts/.tsx
pnpm test                # Unit tests (vitest)
pnpm test:watch          # Unit tests watch mode
pnpm package:mac         # Package app (required before E2E)
pnpm test:e2e            # Playwright E2E tests
```

Run a single unit test: `pnpm vitest run src/path/to/file.test.ts`
Run a single E2E test: `pnpm playwright test tests/e2e/file.spec.ts`

## Architecture

Electron app with three process boundaries:

**Main** (`src/electron/main/`) — Node.js process. Owns windows, IPC handlers, storage (JsonFileStorage/EncryptedFileStorage), and the AgentLite runtime controller. Storage files live in `app.getPath('userData')`.

**Preload** (`src/electron/preload/`) — Thin bridge exposed as `window.duneDesktop`. Flat object with one method per IPC operation (Electron best practice). Methods map 1:1 to `ipcChannels` constants.

**Renderer** (`src/renderer/`) — React app. Cannot import Node/Electron APIs. Accesses main process only through `window.duneDesktop`.

### Key modules

- `src/shared/electron/ipc-channels.ts` — All IPC channel constants. Prefixed `dune:runtime:*` or `dune:storage:*`.
- `src/shared/electron/desktop-bridge.ts` — `DesktopBridge` interface. Single flat interface, no sub-interfaces.
- `src/electron/main/storage/` — `AppStorage` interface with `JsonFileStorage` and `EncryptedFileStorage` implementations.
- `src/renderer/app/store/` — Zustand store composed from three slices (agent, settings, shell). Cross-slice workflows in `app-commands.ts`.
- `src/renderer/features/settings/config/settings-sections.ts` — Settings section registry. Defines `SettingsSectionComponentProps` and maps route IDs to components.

### Data flow

```
Renderer → window.duneDesktop.method() → ipcRenderer.invoke → ipcMain.handle → Main process
Main → webContents.send(channel, data) → ipcRenderer.on → bridge.subscribe callback → Zustand store
```

## Critical rules

**Settings components must NOT import `useAppStore`**. This creates a module dependency through `settings-sections.ts` that changes init order and causes a blank screen. Settings components receive all data via `SettingsSectionComponentProps` props, passed down from `AppShell → SettingsWorkspace → SettingsView → SectionComponent`.

**Bridge is flat**. Storage methods are `storageGet`, `storageSet`, `storageDelete`, `storageKeys` — not nested under a `storage` object. Each bridge method wraps exactly one `ipcRenderer.invoke` call.

**E2E tests need `--user-data-dir` isolation**. Each test creates a temp directory passed via `--user-data-dir` to prevent storage pollution between runs. See `tests/e2e/helpers.ts`.

## Workflow

1. **Research** — Study how other projects solve the same problem. Read existing codebase patterns before writing code.
2. **Implement bottom-up** — Start from types and interfaces, then backend/infrastructure, then UI. Verify each layer compiles before moving to the next.
3. **Type check continuously** — Run `pnpm typecheck` after each group of changes. Don't batch all changes and check at the end.
4. **Unit test** — Run `pnpm test` after implementation. Fix failures before moving on.
5. **E2E test** — After the feature is complete, run `pnpm package:mac && pnpm test:e2e` to verify the full flow works in the packaged app.
6. **Review** — Read every modified file. Remove dead code, redundant abstractions, and unnecessary type casts. Follow existing patterns exactly.

## Style (from docs/engineering-style-guide.md)

- `interface` for object contracts, `type` for unions/mapped types
- `import type` for type-only imports
- Default exports only for top-level screens; named exports everywhere else
- Store raw domain values in state; derive display strings in selectors/presenters
- Slice actions are domain-scoped; cross-slice coordination lives in `app-commands.ts`
- One responsibility per file; feature-owned logic under `feature/model/`
