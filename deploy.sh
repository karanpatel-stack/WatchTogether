#!/bin/bash
set -e
cd "$(dirname "$0")"
git pull
HASH=$(git rev-parse --short=6 HEAD)
ENV_FILE=".env"
if grep -q "^COMMIT_HASH=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s/^COMMIT_HASH=.*/COMMIT_HASH=$HASH/" "$ENV_FILE"
else
  echo "COMMIT_HASH=$HASH" >> "$ENV_FILE"
fi
echo "Deploying commit $HASH..."
docker compose up -d --build
echo "Done."
