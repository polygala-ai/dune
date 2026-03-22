#!/usr/bin/env bash
set -euo pipefail

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

$RPC_CMD agents.submitHostOperator "{\"id\":\"$AGENT_ID\",\"kind\":\"status\"}" | python3 -c "
import json,sys
raw = json.load(sys.stdin)
status = raw.get('status','')
if status == 'failed':
    print(raw.get('errorMessage','unknown error'), file=sys.stderr); sys.exit(1)
if status == 'rejected':
    print('rejected', file=sys.stderr); sys.exit(1)
rj = raw.get('resultJson')
if not rj:
    print(json.dumps(raw, indent=2)); sys.exit(0)
if isinstance(rj, dict) and 'text' in rj:
    print(rj['text'])
else:
    print(json.dumps(rj, indent=2))
"
