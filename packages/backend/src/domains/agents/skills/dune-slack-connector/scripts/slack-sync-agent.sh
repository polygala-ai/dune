#!/usr/bin/env bash
set -euo pipefail

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

AGENT_TARGET="${1:?Usage: slack-sync-agent.sh <agentId>}"

PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'agentId': sys.argv[1]}))" "$AGENT_TARGET")

RESULT=$($RPC_CMD slack.syncAgent "$PAYLOAD")

echo "$RESULT" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
ch_id = d.get('slackChannelId', '')
ch_name = d.get('slackChannelName', '')
if ch_id:
    print(f'Agent synced to Slack channel: #{ch_name} ({ch_id})')
    print('Messages in this Slack channel will now be routed to the agent.')
else:
    print('Sync failed. Check that Slack is connected and the agent exists.')
    sys.exit(1)
"
