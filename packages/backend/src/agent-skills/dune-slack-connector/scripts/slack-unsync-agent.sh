#!/usr/bin/env bash
set -euo pipefail

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

AGENT_TARGET="${1:?Usage: slack-unsync-agent.sh <agentId>}"

PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'agentId': sys.argv[1]}))" "$AGENT_TARGET")

$RPC_CMD slack.unsyncAgent "$PAYLOAD"
echo "Agent unsynced from Slack. The Slack channel has been archived."
