#!/usr/bin/env bash
# Fills the plist placeholders with this machine's real paths and installs it.
# The committed plist keeps placeholders so a public repo does not publish the
# home directory path or the ingest key.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$(command -v node)"
DEST="$HOME/Library/LaunchAgents/com.moation.xscrape.plist"

if [ -z "${INGEST_KEY:-}" ]; then
  echo "Set INGEST_KEY first: INGEST_KEY=... $0" >&2
  exit 1
fi

if [ ! -d "$HOME/.config/moation/chrome-profile" ]; then
  echo "No X session yet. Run 'npm run x:login' before installing the job," >&2
  echo "otherwise it relaunches a browser every 15 minutes and fails." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/.config/moation"
sed -e "s|__REPO__|$REPO|g" -e "s|__NODE__|$NODE|g" -e "s|__HOME__|$HOME|g" \
    -e "s|__INGEST_KEY__|$INGEST_KEY|g" \
    "$REPO/scraper/com.moation.xscrape.plist" > "$DEST"
chmod 600 "$DEST"   # contains the ingest key

launchctl unload "$DEST" 2>/dev/null || true
launchctl load "$DEST"
echo "Loaded com.moation.xscrape"
echo "Next runs today: $(node "$REPO/scraper/next-runs.mjs" 2>/dev/null || echo 'run npm run x:tick once to generate')"
