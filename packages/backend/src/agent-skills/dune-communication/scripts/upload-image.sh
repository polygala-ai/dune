#!/usr/bin/env bash
set -euo pipefail

# Upload an image file and print its markdown reference.
# Usage: upload-image.sh <filepath> [alt-text]

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <filepath> [alt-text]" >&2
  exit 1
fi

FILEPATH="$1"
ALT_TEXT="${2:-image}"
BASE_URL="${DUNE_AGENT_URL:?DUNE_AGENT_URL not set}"

if [[ ! -f "$FILEPATH" ]]; then
  echo "File not found: $FILEPATH" >&2
  exit 1
fi

RESULT=$(curl -sS -X POST "${BASE_URL}/api/media" \
  -H "X-Actor-Type: system" \
  -H "X-Agent-Id: ${AGENT_ID}" \
  -F "file=@${FILEPATH}")

URL=$(echo "$RESULT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['url'])")

if [[ -z "$URL" ]]; then
  echo "Upload failed: $RESULT" >&2
  exit 1
fi

echo "![${ALT_TEXT}](${URL})"
