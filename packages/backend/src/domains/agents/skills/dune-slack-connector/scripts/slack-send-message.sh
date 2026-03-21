#!/usr/bin/env bash
set -euo pipefail

# Send a text message to the agent's synced Slack channel.
# Usage: slack-send-message.sh <text> [channelId]

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <text> [channelId]" >&2
  exit 1
fi

TEXT="$1"
CHANNEL_ID="${2:-}"

PAYLOAD=$(python3 -c "
import json, sys
d = {'agentId': sys.argv[1], 'text': sys.argv[2]}
if sys.argv[3]:
    d['channelId'] = sys.argv[3]
print(json.dumps(d))
" "$AGENT_ID" "$TEXT" "$CHANNEL_ID")

$RPC_CMD slack.sendMessage "$PAYLOAD"
