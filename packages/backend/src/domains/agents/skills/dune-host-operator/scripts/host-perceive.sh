#!/usr/bin/env bash
set -euo pipefail

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

if [ "$#" -lt 2 ]; then
  echo "Usage: host-perceive.sh <mode> <bundleId> [query]" >&2
  exit 1
fi

MODE="$1"
BUNDLE_ID="$2"
QUERY="${3:-}"

PAYLOAD=$(python3 -c "
import json,sys
p = {'id': sys.argv[1], 'kind': 'perceive', 'mode': sys.argv[2], 'bundleId': sys.argv[3]}
query = sys.argv[4]
if query:
    p['query'] = query
print(json.dumps(p))
" "$AGENT_ID" "$MODE" "$BUNDLE_ID" "$QUERY")

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
content = rj.get('content') if isinstance(rj, dict) else None
if content and isinstance(content, list):
    for item in content:
        t = item.get('type','')
        if t == 'text':
            print(item.get('text',''))
        elif t == 'image':
            src = item.get('source',{})
            print('[image: %s, %d bytes base64]' % (src.get('media_type','image/png'), len(src.get('data',''))))
else:
    print(json.dumps(rj, indent=2))
artifacts = raw.get('artifactPaths', [])
if artifacts:
    print('--- artifacts ---')
    for p in artifacts:
        print(p)
"
