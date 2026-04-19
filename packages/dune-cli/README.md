# @polygala/dune-cli

Terminal access to Dune workflow items, agents, and feedback.

## Installation

```bash
npm install -g @polygala/dune-cli
```

## Auth

The CLI reads `DUNE_API_KEY` first, then falls back to `~/.dune/config`.

Supported config formats:

```ini
apiKey=your-api-key
```

```json
{ "apiKey": "your-api-key" }
```

## Commands

```bash
dune items list [--project <id-or-name>] [--json]
dune items create <title> [--brief <text>] [--status <status>] [--project <id-or-name>] [--json]
dune items move <item-id> <status> [--json]
dune items show <item-id> [--json]
dune agents list [--project <id-or-name>] [--json]
dune feedback <item-id> <message> [--json]
```

## Options

- `--json` prints machine-readable JSON instead of the default table or detail view.
- `--user-data-dir <path>` points the CLI at a specific Dune user-data directory.
