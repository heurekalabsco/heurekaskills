#!/usr/bin/env bash
# Exercise the autonomous-merge gate against committed fixtures.
#
# This decides whether a diff may merge WITHOUT a human, so it gets the same treatment as the
# corroborator: committed inputs, asserted exit codes, and a mutation check that the suite can
# go red. A gate nobody has watched reject is not known to reject.
set -uo pipefail
cd "$(dirname "$0")/.."
FIX=.github/fixtures/refresh-gate
fail=0
expect () { # <want-exit> <label> <fixture>
  node scripts/is-verification-refresh.js --diff "$FIX/$3" >/dev/null 2>&1
  local got=$?
  if [ "$got" = "$1" ]; then printf '  ok   %-46s exit=%s\n' "$2" "$got"
  else printf '  FAIL %-46s exit=%s, wanted %s\n' "$2" "$got" "$1"; fail=1; fi
}
echo "refresh-gate selftest"
expect 0 "dates and versions only -> may auto-merge"   pass-dates-only.diff
expect 1 "a sentence added -> human"                   fail-prose-added.diff
expect 1 "a threshold moved 70->50 -> human"           fail-threshold-moved.diff
expect 1 "two skills in one diff -> human"             fail-two-skills.diff
expect 1 "a caveat deleted outright -> human"           fail-caveat-deleted.diff
node scripts/is-verification-refresh.js >/dev/null 2>&1; [ $? = 2 ] \
  && printf '  ok   %-46s exit=2\n' "no --diff -> refuses to decide" \
  || { printf '  FAIL %-46s\n' "no --diff -> refuses to decide"; fail=1; }
[ "$fail" = 0 ] && echo "  all cases pass" || echo "  SELFTEST FAILED"
exit $fail
