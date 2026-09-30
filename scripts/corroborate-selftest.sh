#!/usr/bin/env bash
# Exercise scripts/corroborate.js against committed fixtures and assert the EXIT CODE of each.
#
# Every case below pins a behaviour that was wrong in the first version of that script and was
# found by audit rather than by use. The repo's own rule — "an alarm nobody has watched fire is
# not known to work" — applies to a corroborator as much as to the dataset probe it corroborates,
# and none of these bugs would have survived one run of this file.
#
# Exit codes are the contract, because the workflow reads them: 0 nothing to act on, 1 a
# corroborated dead dataset (or one never probed), 2 refused to run.
set -uo pipefail
cd "$(dirname "$0")/.."
FIX=.github/fixtures/corroborate-selftest
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# Substituted at run time, never committed: the script refuses a report past
# CORROBORATE_MAX_AGE_HOURS, so a hardcoded date would make these pass by refusing — green for
# the wrong reason, with the logic under test never reached.
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
MINUS_1H=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)
MINUS_13H=$(date -u -d '13 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-13H +%Y-%m-%dT%H:%M:%SZ)
for f in "$FIX"/*.json; do
  sed -e "s/__NOW__/$NOW/" -e "s/__MINUS_1H__/$MINUS_1H/" -e "s/__MINUS_13H__/$MINUS_13H/" "$f" > "$TMP/$(basename "$f")"
done

fail=0
expect () { # <expected-exit> <label> <ours> <theirs>
  local want=$1 label=$2 ours=$3 theirs=$4
  node scripts/corroborate.js --ours "$TMP/$ours" --theirs "$TMP/$theirs" >"$TMP/out.txt" 2>&1
  local got=$?
  if [ "$got" = "$want" ]; then
    printf '  ok   %-58s exit=%s\n' "$label" "$got"
  else
    printf '  FAIL %-58s exit=%s, wanted %s\n' "$label" "$got" "$want"
    sed 's/^/       /' "$TMP/out.txt"
    fail=1
  fi
}

echo "corroborate selftest"
expect 1 "both vantages saw it die -> stays dead"            agree-ours.json    agree-theirs.json
expect 0 "only one vantage saw it -> downgraded"             disagree-ours.json disagree-theirs.json
expect 2 "corroborator failed across 3 hosts -> refused"     agree-ours.json    blanket-theirs.json
expect 2 "corroborator has wrong-typed inconclusive"         agree-ours.json    badtype-theirs.json
# The gap bound is a measured constant, not a chosen one: the liveness workflow's cron said 07:00
# and it fired five to seven hours late on eight consecutive days, so a six-hour bound refused
# every night. Pin it, or the next person "tidies" it back to something the scheduler cannot meet.
expect 2 "reports 13h apart -> too far apart to corroborate"  agree-ours.json    stale-gap-theirs.json

# The downgrade must say the other vantage REACHED it. Before okUrls existed this read "not in
# their report" — the inverse of the truth, in the field a human uses to pick which network to
# distrust.
node scripts/corroborate.js --ours "$TMP/disagree-ours.json" --theirs "$TMP/disagree-theirs.json" --json >"$TMP/j.json" 2>/dev/null
if node -e '
  const r = require(process.argv[1]);
  const said = r.inconclusive?.[0]?.disagreement?.theirsSaid || "";
  if (!/reached it/.test(said)) { console.error("       got: " + said); process.exit(1); }
' "$TMP/j.json"; then
  printf '  ok   %-58s\n' "downgrade names what the other vantage actually saw"
else
  printf '  FAIL %-58s\n' "downgrade names what the other vantage actually saw"; fail=1
fi

[ "$fail" = 0 ] && echo "  all cases pass" || echo "  SELFTEST FAILED"
exit $fail
