#!/usr/bin/env bash
# Verify OPENROUTER_API_KEY is loaded on deployed API hosts.
#
# Usage:
#   ./scripts/verify-deploy-health.sh https://staging-api.example.com https://api.example.com
#
# Each argument is a base URL (no trailing slash). Checks GET /health and
# asserts "llm_fallback_configured": true.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <api-base-url> [<api-base-url> ...]" >&2
  echo "Example: $0 https://staging-api.example.com https://api.example.com" >&2
  exit 1
fi

failures=0

for base in "$@"; do
  base="${base%/}"
  url="${base}/health"
  echo "Checking ${url} ..."

  if ! body="$(curl -fsS --max-time 15 "$url" 2>&1)"; then
    echo "  FAIL: request failed — ${body}"
    failures=$((failures + 1))
    continue
  fi

  if ! echo "$body" | python3 -c "
import json, sys
data = json.load(sys.stdin)
ok = data.get('status') == 'ok' and data.get('llm_fallback_configured') is True
print(json.dumps(data, indent=2))
sys.exit(0 if ok else 2)
" 2>/dev/null; then
    echo "  FAIL: expected status=ok and llm_fallback_configured=true"
    echo "  Response: ${body}"
    failures=$((failures + 1))
    continue
  fi

  echo "  OK: llm_fallback_configured=true"
done

if [[ $failures -gt 0 ]]; then
  echo ""
  echo "${failures} host(s) failed."
  echo "Without OPENROUTER_API_KEY, blurry/difficult IDs fall back to regex-only"
  echo "and the UI shows a warning banner — fix the secret before go-live if LLM recovery is required."
  exit 1
fi

echo ""
echo "All hosts passed."
