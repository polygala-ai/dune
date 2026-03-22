#!/usr/bin/env bash
set -euo pipefail

# Upload an image and send it as a channel message in one step.
# Usage: send-image-message.sh <channel> <filepath> [caption]

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <channel> <filepath> [caption]" >&2
  exit 1
fi

CHANNEL="$1"
FILEPATH="$2"
CAPTION="${3:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

IMAGE_MD=$("${SCRIPT_DIR}/upload-image.sh" "$FILEPATH")

if [[ -n "$CAPTION" ]]; then
  CONTENT="${CAPTION}

${IMAGE_MD}"
else
  CONTENT="${IMAGE_MD}"
fi

"${SCRIPT_DIR}/send-channel-message.sh" "$CHANNEL" "$CONTENT"
