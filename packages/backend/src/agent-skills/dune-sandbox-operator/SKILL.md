---
name: dune-sandbox-operator
description: Operate Dune sandbox APIs via agent RPC gateway.
---

# Dune Sandbox Operator

All operations use WebSocket RPC via `$DUNE_RPC_SCRIPT` — actor identity is injected automatically.

## Scripts
- `scripts/sandbox-box.sh` — lifecycle: list, create, start, stop, delete, status
- `scripts/sandbox-exec.sh` — exec/event helpers: create, list, get, events
- `scripts/sandbox-files.sh` — file ops: upload-file, download, import-host

## Quick Examples
```bash
scripts/sandbox-box.sh list
scripts/sandbox-box.sh create '{"name":"ops-box","image":"alpine:latest","durability":"persistent"}'
scripts/sandbox-box.sh start <boxId>
scripts/sandbox-exec.sh create <boxId> sh -lc 'echo hello'
scripts/sandbox-files.sh upload-file <boxId> /workspace/note.txt ./note.txt
scripts/sandbox-files.sh import-host <boxId> /absolute/host/path /workspace/import
```
