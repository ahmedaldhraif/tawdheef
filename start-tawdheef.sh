#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if [ -x ./runtime/bin/node ]; then
  exec ./runtime/bin/node scripts/start.mjs "$@"
fi
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH
exec node scripts/start.mjs "$@"
