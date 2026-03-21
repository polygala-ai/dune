#!/usr/bin/env bash
set -euo pipefail

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

BOT_TOKEN="${1:?Usage: slack-connect.sh <botToken> <appToken>}"
APP_TOKEN="${2:?Usage: slack-connect.sh <botToken> <appToken>}"

# Validate token prefixes
if [[ "$BOT_TOKEN" != xoxb-* ]]; then
  echo "Error: Bot token must start with 'xoxb-'" >&2
  exit 1
fi
if [[ "$APP_TOKEN" != xapp-* ]]; then
  echo "Error: App token must start with 'xapp-'" >&2
  exit 1
fi

PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'botToken': sys.argv[1], 'appToken': sys.argv[2]}))" "$BOT_TOKEN" "$APP_TOKEN")

RESULT=$($RPC_CMD slack.updateSettings "$PAYLOAD")

echo "$RESULT" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
if d.get('isConnected'):
    print(f\"Connected to Slack workspace: {d.get('teamName', 'unknown')}\")
else:
    print('Connection failed. Check your tokens and try again.')
    sys.exit(1)
"
