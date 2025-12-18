#!/bin/bash

npm install --quiet --no-fund --no-audit 2>/dev/null >/dev/null

if [ -f "package.json" ]; then
  if grep -q "\"dev\":" "package.json"; then
    # Extract the dev command and check if it contains 'mastra dev'
    DEV_CMD=$(grep "\"dev\":" package.json | sed -E 's/.*"dev":\s*"([^"]+)".*/\1/')
    if [[ "$DEV_CMD" == *"mastra dev"* ]]; then
      npm run dev -- --port 8080
    else
      npm run dev
    fi
  fi
fi

node /watcher/entrypoint.mjs "$@"
