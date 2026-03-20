#!/usr/bin/env bash
set -euo pipefail

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

$RPC_CMD slack.disconnect '{}'
echo "Slack disconnected and credentials cleared."
