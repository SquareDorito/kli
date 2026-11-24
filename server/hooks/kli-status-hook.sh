#!/usr/bin/env sh
# Updates KLI worker dot status from agy lifecycle hooks (PreInvocation, PreToolUse, Stop)
STATUS="$1"
[ -z "$TMUX" ] && exit 0
SESSION=$(tmux display-message -p '#S' 2>/dev/null)
case "$SESSION" in
  kli_*)
    curl -s --max-time 1 -X POST "http://127.0.0.1:${KLI_PORT:-3001}/api/sessions/${SESSION}/status" \
      -H "Content-Type: application/json" \
      -d "{\"status\":\"${STATUS}\",\"source\":\"hook\"}" >/dev/null 2>&1 &
    ;;
esac
exit 0
