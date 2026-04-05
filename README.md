# Dune

Minimalist Electron chat prototype inspired by Codex.

## Prerequisites

- Node.js
- pnpm

This repo is pnpm-only. Do not use `npm install` or commit a `package-lock.json`.

## Getting started

```bash
pnpm install
pnpm dev
```

## Tests

```bash
pnpm test          # unit tests (vitest)
pnpm test:e2e      # end-to-end (playwright, requires pnpm package:mac first)
```

## Other commands

```bash
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint
pnpm package:mac   # package the app
```

## License

Apache 2.0
