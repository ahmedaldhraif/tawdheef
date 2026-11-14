#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if [ -x ./runtime/bin/node ]; then
  exec ./runtime/bin/node scripts/start.mjs "$@"
fi
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
if ! command -v node >/dev/null 2>&1; then
  printf '%s\n' 'Install Node.js 26 LTS from https://nodejs.org/en/download, then reopen this file.'
  exit 1
fi
exec node scripts/start.mjs "$@"
