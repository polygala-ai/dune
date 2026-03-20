#!/usr/bin/env bash
set -euo pipefail

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

usage() {
  cat >&2 <<'USAGE'
Usage:
  sandbox-box.sh list
  sandbox-box.sh create <json-or-json-file>
  sandbox-box.sh get <boxId>
  sandbox-box.sh patch <boxId> <json-or-json-file>
  sandbox-box.sh delete <boxId> [force]
  sandbox-box.sh start <boxId>
  sandbox-box.sh stop <boxId>
  sandbox-box.sh status <boxId>
  sandbox-box.sh attach <boxId>
USAGE
  exit 1
}

json_arg() {
  local value="$1"
  if [[ -f "$value" ]]; then
    cat "$value"
  else
    printf '%s' "$value"
  fi
}

# Merge boxId into a JSON object: {"boxId":"...", ...rest}
merge_box_id() {
  local box_id="$1"
  local json_body="$2"
  python3 -c "
import json,sys
d = json.loads(sys.argv[2])
d['boxId'] = sys.argv[1]
print(json.dumps(d, ensure_ascii=True))
" "$box_id" "$json_body"
}

ACTION="${1:-}"
[[ -n "$ACTION" ]] || usage
shift || true

case "$ACTION" in
  list)
    $RPC_CMD sandboxes.listBoxes '{}'
    ;;
  create)
    [[ $# -ge 1 ]] || usage
    $RPC_CMD sandboxes.createBox "$(json_arg "$1")"
    ;;
  get)
    [[ $# -ge 1 ]] || usage
    $RPC_CMD sandboxes.getBox "{\"boxId\":\"$1\"}"
    ;;
  patch)
    [[ $# -ge 2 ]] || usage
    $RPC_CMD sandboxes.patchBox "$(merge_box_id "$1" "$(json_arg "$2")")"
    ;;
  delete)
    [[ $# -ge 1 ]] || usage
    FORCE="false"
    if [[ "${2:-}" == "force" || "${2:-}" == "true" ]]; then
      FORCE="true"
    fi
    $RPC_CMD sandboxes.deleteBox "{\"boxId\":\"$1\",\"force\":$FORCE}"
    ;;
  start)
    [[ $# -ge 1 ]] || usage
    $RPC_CMD sandboxes.startBox "{\"boxId\":\"$1\"}"
    ;;
  stop)
    [[ $# -ge 1 ]] || usage
    $RPC_CMD sandboxes.stopBox "{\"boxId\":\"$1\"}"
    ;;
  status)
    [[ $# -ge 1 ]] || usage
    $RPC_CMD sandboxes.getBoxStatus "{\"boxId\":\"$1\"}"
    ;;
  attach)
    echo "attach_not_implemented" >&2
    exit 1
    ;;
  *)
    usage
    ;;
esac
