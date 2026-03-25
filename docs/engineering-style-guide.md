# Engineering Style Guide

## Scope

This repo is an Electron desktop app with a React renderer, a preload bridge, and a small Zustand store. The code should read like a typed desktop product, not a web prototype with Electron bolted on top.

## TypeScript

- Keep `strict` mode enabled and prefer compiler-enforced guarantees over comments.
- Prefer inference for obvious locals and return values. Add explicit annotations at module boundaries, public helpers, and non-obvious unions.
- Prefer `unknown` over `any` for untrusted values. Narrow before use.
- Use discriminated unions for UI and async state that has multiple variants.
- Prefer `interface` for object contracts and `type` for unions, mapped types, and derived aliases.
- Use `import type` and `export type` for type-only imports and re-exports.
- Store raw domain values in state. Derive display labels and formatted strings in selectors or presenters.
- Handle promises explicitly with `await`, `return`, or `void`.

## React And Zustand

- Default exports are reserved for top-level screens. Hooks, helpers, store utilities, and reusable components use named exports.
- Keep components small and focused on composition. Pull orchestration, derived state, and side effects into hooks or controllers.
- Read grouped store selectors from hooks such as `useChatSession`, `useShellState`, and `useSettingsState` instead of long lists of single-field subscriptions.
- Keep slice actions domain-scoped. Cross-slice workflows live in app commands/controllers.
- Prefer pure helpers for domain transforms so they can be tested without rendering.

## Electron

- The main process owns lifecycle, windows, OS integrations, security policy, and future privileged IPC.
- The preload layer exposes a minimal typed bridge via `contextBridge`.
- The renderer should not import Electron or Node APIs directly.
- Future privileged operations should use `ipcMain.handle` and `ipcRenderer.invoke`, with one bridge capability per method.
- Keep `contextIsolation`, `sandbox`, and `nodeIntegration: false` enabled.

## Files And Modules

- Feature-owned domain logic belongs under that feature's `model` directory.
- Presentation components stay close to the feature or shell they render.
- Shared primitives belong in `src/renderer/shared`.
- Prefer one responsibility per file. Split a file once it mixes domain transforms, UI composition, and side effects.

## Tests

- Unit-test pure domain helpers and app commands.
- Keep integration tests focused on user-observable behavior.
- Use Electron smoke coverage to protect launch, layout, routing, and preload safety boundaries.
