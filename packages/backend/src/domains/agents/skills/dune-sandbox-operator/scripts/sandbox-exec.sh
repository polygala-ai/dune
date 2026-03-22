#!/usr/bin/env bash
set -euo pipefail

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

usage() {
  cat >&2 <<'USAGE'
Usage:
  sandbox-exec.sh create <boxId> <command> [args...]
  sandbox-exec.sh list <boxId>
  sandbox-exec.sh get <boxId> <execId>
  sandbox-exec.sh events <boxId> <execId> [afterSeq] [limit]
  sandbox-exec.sh sse <boxId> <execId>
USAGE
  exit 1
}

ACTION="${1:-}"
[[ -n "$ACTION" ]] || usage
shift || true

case "$ACTION" in
  create)
    [[ $# -ge 2 ]] || usage
    BOX_ID="$1"
    COMMAND="$2"
    shift 2
    PAYLOAD="$(python3 - "$BOX_ID" "$COMMAND" "$@" <<'PY'
import json
import sys

box_id = sys.argv[1]
command = sys.argv[2]
args = sys.argv[3:]
print(json.dumps({"boxId": box_id, "command": command, "args": args, "env": {}}, ensure_ascii=True))
PY
)"
    $RPC_CMD sandboxes.createExec "$PAYLOAD"
    ;;
  list)
    [[ $# -ge 1 ]] || usage
    $RPC_CMD sandboxes.listExecs "{\"boxId\":\"$1\"}"
    ;;
  get)
    [[ $# -ge 2 ]] || usage
    $RPC_CMD sandboxes.getExec "{\"boxId\":\"$1\",\"execId\":\"$2\"}"
    ;;
  events)
    [[ $# -ge 2 ]] || usage
    AFTER_SEQ="${3:-0}"
    LIMIT="${4:-500}"
    $RPC_CMD sandboxes.getExecEvents "{\"boxId\":\"$1\",\"execId\":\"$2\",\"afterSeq\":${AFTER_SEQ},\"limit\":${LIMIT}}"
    ;;
  sse)
    # Poll getExecEvents until a terminal event (exit_code present) arrives
    [[ $# -ge 2 ]] || usage
    BOX_ID="$1"
    EXEC_ID="$2"
    AFTER_SEQ=0
    while true; do
      RESULT=$($RPC_CMD sandboxes.getExecEvents "{\"boxId\":\"${BOX_ID}\",\"execId\":\"${EXEC_ID}\",\"afterSeq\":${AFTER_SEQ},\"limit\":100}")
      echo "$RESULT"

      # Check for terminal event and update afterSeq
      PARSED=$(python3 - "$RESULT" "$AFTER_SEQ" <<'PY'
import json, sys
events = json.loads(sys.argv[1])
after_seq = int(sys.argv[2])
done = False
if isinstance(events, list):
    for ev in events:
        seq = ev.get("seq", after_seq)
        if seq > after_seq:
            after_seq = seq
        if "exit_code" in ev.get("data", ev):
            done = True
print(json.dumps({"afterSeq": after_seq, "done": done}))
PY
)
      AFTER_SEQ=$(echo "$PARSED" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['afterSeq'])")
      DONE=$(echo "$PARSED" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['done'])")
      if [[ "$DONE" == "True" ]]; then
        break
      fi
      sleep 1
    done
    ;;
  *)
    usage
    ;;
esac
