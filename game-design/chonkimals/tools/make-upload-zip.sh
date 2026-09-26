#!/usr/bin/env bash
# Zip the whole project for uploading (e.g. into the What-If Machine), leaving
# out node_modules (reinstalled from package-lock.json), git history and macOS
# clutter. Writes camp-chonkimal-upload.zip at the repo root, replacing any
# previous one.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP_NAME="camp-chonkimal-upload.zip"

cd "$ROOT"
rm -f "$ZIP_NAME"
zip -r -q "$ZIP_NAME" . \
  -x "node_modules/*" \
  -x ".git/*" \
  -x "*.DS_Store" \
  -x "$ZIP_NAME"

echo "Wrote $ROOT/$ZIP_NAME ($(du -h "$ZIP_NAME" | cut -f1))"
