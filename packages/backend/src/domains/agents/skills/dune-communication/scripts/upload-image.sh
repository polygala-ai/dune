#!/usr/bin/env bash
set -euo pipefail

# Upload an image file and print its markdown reference.
# Usage: upload-image.sh <filepath> [alt-text]

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <filepath> [alt-text]" >&2
  exit 1
fi

FILEPATH="$1"
ALT_TEXT="${2:-image}"

if [[ ! -f "$FILEPATH" ]]; then
  echo "File not found: $FILEPATH" >&2
  exit 1
fi

MIME_TYPE=$(file --brief --mime-type "$FILEPATH")
CONTENT_B64=$(base64 < "$FILEPATH")
FILENAME=$(basename "$FILEPATH")

PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({
    'mimeType': sys.argv[1],
    'contentBase64': sys.argv[2],
    'filename': sys.argv[3]
}, ensure_ascii=True))
" "$MIME_TYPE" "$CONTENT_B64" "$FILENAME")

RESULT=$($RPC_CMD media.uploadImage "$PAYLOAD")

URL=$(echo "$RESULT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['url'])")

if [[ -z "$URL" ]]; then
  echo "Upload failed: $RESULT" >&2
  exit 1
fi

echo "![${ALT_TEXT}](${URL})"
