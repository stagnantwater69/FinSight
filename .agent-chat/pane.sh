#!/bin/bash
# One chat pane: shows out.txt live, and appends typed lines to in.txt
# Usage: pane.sh <agent-dir-name> "<Display Title>"
AGENT="$1"
TITLE="${2:-$1}"
DIR="/home/ken/FinsightV1/.agent-chat/$AGENT"
IN="$DIR/in.txt"
OUT="$DIR/out.txt"

mkdir -p "$DIR"
touch "$IN" "$OUT"

clear
printf '\033]2;%s\007' "$TITLE"   # set pane/window title
echo "== $TITLE =========================================="
echo "(type a message and press Enter — it goes to this agent)"
echo "----------------------------------------------------"

# Live-follow the conversation output in the background
tail -n 100 -f "$OUT" &
TAILPID=$!
trap "kill $TAILPID 2>/dev/null" EXIT

# Foreground: read typed lines, append to the agent's inbox
while IFS= read -r line; do
  [ -z "$line" ] && continue
  ts=$(date +%H:%M:%S)
  printf '[%s] YOU: %s\n' "$ts" "$line" >> "$IN"
done
