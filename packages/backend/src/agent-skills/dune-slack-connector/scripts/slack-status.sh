#!/usr/bin/env bash
set -euo pipefail

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

RESULT=$($RPC_CMD slack.getSettings '{}')

echo "$RESULT" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
connected = d.get('isConnected', False)
print(f\"Connected: {connected}\")
if connected:
    print(f\"Team: {d.get('teamName', 'unknown')} ({d.get('teamId', '')})\")
    print(f\"Bot User: {d.get('botUserId', 'unknown')}\")
    print(f\"Has Bot Token: {d.get('hasBotToken', False)}\")
    print(f\"Has App Token: {d.get('hasAppToken', False)}\")
else:
    print('Slack is not connected. Run slack-connect.sh with bot and app tokens.')
"
