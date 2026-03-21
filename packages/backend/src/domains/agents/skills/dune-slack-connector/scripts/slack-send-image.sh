#!/usr/bin/env bash
set -euo pipefail

# Upload an image and send it to the agent's synced Slack channel.
# Usage: slack-send-image.sh <filepath> [alt-text] [channelId]

RPC_CMD="${RPC_CMD:-python3 $DUNE_RPC_SCRIPT}"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <filepath> [alt-text] [channelId]" >&2
  exit 1
fi

FILEPATH="$1"
ALT_TEXT="${2:-image}"
CHANNEL_ID="${3:-}"

if [[ ! -f "$FILEPATH" ]]; then
  echo "File not found: $FILEPATH" >&2
  exit 1
fi

# Step 1: Upload image to Dune media store
MIME_TYPE=$(file --brief --mime-type "$FILEPATH")
CONTENT_B64=$(base64 < "$FILEPATH")
FILENAME=$(basename "$FILEPATH")

UPLOAD_PAYLOAD=$(python3 -c "
import json, sys
print(json.dumps({
    'mimeType': sys.argv[1],
    'contentBase64': sys.argv[2],
    'filename': sys.argv[3]
}))
" "$MIME_TYPE" "$CONTENT_B64" "$FILENAME")

UPLOAD_RESULT=$($RPC_CMD media.uploadImage "$UPLOAD_PAYLOAD")
IMAGE_URL=$(echo "$UPLOAD_RESULT" | python3 -c "import json,sys; print(json.loads(sys.stdin.read())['url'])")

if [[ -z "$IMAGE_URL" ]]; then
  echo "Image upload failed." >&2
  exit 1
fi

# Step 2: Send image to Slack
PAYLOAD=$(python3 -c "
import json, sys
d = {'agentId': sys.argv[1], 'imageUrl': sys.argv[2], 'alt': sys.argv[3]}
if sys.argv[4]:
    d['channelId'] = sys.argv[4]
print(json.dumps(d))
" "$AGENT_ID" "$IMAGE_URL" "$ALT_TEXT" "$CHANNEL_ID")

$RPC_CMD slack.sendImage "$PAYLOAD"
