#!/bin/bash
# Polls every agent's in.txt for new lines and prints them prefixed,
# so a single Monitor call can watch all 8 chat panes at once.
BASE="/home/ken/FinsightV1/.agent-chat"
AGENTS="backend-api web-frontend mobile database ai-ocr-analytics qa-security devops-release orchestrator"

declare -A last
for a in $AGENTS; do
  f="$BASE/$a/in.txt"
  touch "$f"
  last[$a]=$(wc -l < "$f")
done

while true; do
  for a in $AGENTS; do
    f="$BASE/$a/in.txt"
    n=$(wc -l < "$f")
    if [ "$n" -gt "${last[$a]}" ]; then
      tail -n +"$(( last[$a] + 1 ))" "$f" | while IFS= read -r line; do
        echo "AGENT:$a|$line"
      done
      last[$a]=$n
    fi
  done
  sleep 1
done
