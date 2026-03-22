#!/usr/bin/env bash
set -euo pipefail

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

usage() {
  cat >&2 <<'USAGE'
Usage:
  sandbox-files.sh upload-b64 <boxId> <containerPath> <contentBase64> [overwrite=true]
  sandbox-files.sh upload-file <boxId> <containerPath> <hostFilePath> [overwrite=true]
  sandbox-files.sh download <boxId> <containerPath>
  sandbox-files.sh import-host <boxId> <hostPath> <destPath>
  sandbox-files.sh attach <boxId>
USAGE
  exit 1
}

ACTION="${1:-}"
[[ -n "$ACTION" ]] || usage
shift || true

case "$ACTION" in
  upload-b64)
    [[ $# -ge 3 ]] || usage
    BOX_ID="$1"
    CONTAINER_PATH="$2"
    CONTENT_B64="$3"
    OVERWRITE="${4:-true}"
    PAYLOAD="$(python3 - "$BOX_ID" "$CONTAINER_PATH" "$CONTENT_B64" "$OVERWRITE" <<'PY'
import json
import sys

box_id = sys.argv[1]
path = sys.argv[2]
content = sys.argv[3]
overwrite = sys.argv[4].lower() != 'false'
print(json.dumps({"boxId": box_id, "path": path, "contentBase64": content, "overwrite": overwrite}, ensure_ascii=True))
PY
)"
    $RPC_CMD sandboxes.uploadFiles "$PAYLOAD"
    ;;
  upload-file)
    [[ $# -ge 3 ]] || usage
    BOX_ID="$1"
    CONTAINER_PATH="$2"
    HOST_FILE="$3"
    OVERWRITE="${4:-true}"
    [[ -f "$HOST_FILE" ]] || { echo "File not found: $HOST_FILE" >&2; exit 1; }
    CONTENT_B64=$(base64 < "$HOST_FILE")
    PAYLOAD="$(python3 - "$BOX_ID" "$CONTAINER_PATH" "$CONTENT_B64" "$OVERWRITE" <<'PY'
import json
import sys

box_id = sys.argv[1]
path = sys.argv[2]
content = sys.argv[3]
overwrite = sys.argv[4].lower() != 'false'
print(json.dumps({"boxId": box_id, "path": path, "contentBase64": content, "overwrite": overwrite}, ensure_ascii=True))
PY
)"
    $RPC_CMD sandboxes.uploadFiles "$PAYLOAD"
    ;;
  download)
    [[ $# -ge 2 ]] || usage
    BOX_ID="$1"
    CONTAINER_PATH="$2"
    $RPC_CMD sandboxes.downloadFile "{\"boxId\":\"${BOX_ID}\",\"path\":\"${CONTAINER_PATH}\"}"
    ;;
  import-host)
    [[ $# -ge 3 ]] || usage
    BOX_ID="$1"
    HOST_PATH="$2"
    DEST_PATH="$3"
    PAYLOAD="$(python3 - "$BOX_ID" "$HOST_PATH" "$DEST_PATH" <<'PY'
import json
import sys

print(json.dumps({"boxId": sys.argv[1], "hostPath": sys.argv[2], "destPath": sys.argv[3]}, ensure_ascii=True))
PY
)"
    $RPC_CMD sandboxes.importHostPath "$PAYLOAD"
    ;;
  attach)
    echo "attach_not_implemented" >&2
    exit 1
    ;;
  *)
    usage
    ;;
esac
