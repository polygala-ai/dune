#!/usr/bin/env bash
set -euo pipefail

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

BUNDLE_ID="${1:-}"

PAYLOAD=$(python3 -c "
import json,sys
p = {'id': sys.argv[1], 'kind': 'overview'}
bundle_id = sys.argv[2].strip()
if bundle_id:
    p['bundleId'] = bundle_id
print(json.dumps(p))
" "$AGENT_ID" "$BUNDLE_ID")

$RPC_CMD agents.submitHostOperator "$PAYLOAD" | python3 -c "
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
