#!/bin/bash
# Fetch external data from bible-story-builder GitHub releases and repo.
# Run before build: pnpm fetch-data
#
# Sources:
#   - Release assets: ALL-langs-data.zip, {Template}-ALL-timings.zip, {Template}-content.zip
#   - Repo export/: ALL-langs*.json
#
# Targets:
#   - src/data/ALL-langs-data/
#   - src/data/ALL-langs*.json
#   - src/data/templates/{Template}/
#   - src/data/templates-timings/{Template}/ALL-timings/

set -euo pipefail

REPO="larsgson/bible-story-builder"
DATA_DIR="src/data"
TIMINGS_DIR="$DATA_DIR/templates-timings"
TMP_DIR=$(mktemp -d)

trap "rm -rf $TMP_DIR" EXIT

echo "── Fetching data from $REPO ──"

# Get the latest release download URL prefix
RELEASE_URL="https://github.com/$REPO/releases/latest/download"

# ── 1. Language JSON files from repo main branch ──
echo "Fetching language JSON files..."
for f in ALL-langs-compact.json ALL-langs-mini.json ALL-langs.json; do
    curl -sfL "https://raw.githubusercontent.com/$REPO/main/export/$f" -o "$DATA_DIR/$f"
    echo "  ✓ $f"
done

# ── 2. ALL-langs-data from latest release ──
echo "Fetching ALL-langs-data.zip..."
curl -sfL "$RELEASE_URL/ALL-langs-data.zip" -o "$TMP_DIR/ALL-langs-data.zip"
rm -rf "$DATA_DIR/ALL-langs-data"
mkdir -p "$DATA_DIR/ALL-langs-data"
unzip -q "$TMP_DIR/ALL-langs-data.zip" -d "$DATA_DIR/ALL-langs-data"
echo "  ✓ ALL-langs-data/"

# ── 3. Template content from latest release ──
# Content zips are named {Template}-content.zip and extract to {Template}/ inside target
mkdir -p "$DATA_DIR/templates"
TEMPLATES="John"
for tpl in $TEMPLATES; do
    content_zip="${tpl}-content.zip"
    echo "Fetching $content_zip..."
    if curl -sfL "$RELEASE_URL/$content_zip" -o "$TMP_DIR/$content_zip" 2>/dev/null; then
        unzip -qo "$TMP_DIR/$content_zip" -d "$DATA_DIR/templates"
        echo "  ✓ $tpl content"
    else
        echo "  ⊘ No content zip for $tpl (no $content_zip in release)"
    fi
done

# ── 4. Template timing data from latest release ──
# Discover templates from extracted content and fetch matching timing zips
for tpl_dir in "$DATA_DIR/templates"/*/; do
    tpl=$(basename "$tpl_dir")
    zip_name="${tpl}-ALL-timings.zip"
    echo "Fetching $zip_name..."
    if curl -sfL "$RELEASE_URL/$zip_name" -o "$TMP_DIR/$zip_name" 2>/dev/null; then
        rm -rf "$TIMINGS_DIR/$tpl/ALL-timings"
        mkdir -p "$TIMINGS_DIR/$tpl/ALL-timings"
        unzip -q "$TMP_DIR/$zip_name" -d "$TIMINGS_DIR/$tpl/ALL-timings"
        echo "  ✓ $tpl timing data"
    else
        echo "  ⊘ No timing data for $tpl (no $zip_name in release)"
    fi
done

echo ""
echo "── Data fetch complete ──"
