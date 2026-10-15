#!/usr/bin/env bash
# Exercise the autonomous-merge gate against every diff that has ever beaten it, plus one that
# must still be accepted.
#
# This decides whether a change reaches a public registry with no human review, so the standard
# is higher than "the tests pass": every negative here is an exploit that was CONFIRMED BY
# EXECUTION against an earlier version of the gate, by a review briefed to defeat it. Seventeen
# of them got through v1.
#
# The positive case is not a formality. A gate that refuses everything satisfies every negative
# in this file, and an earlier draft of v2 did exactly that — a frontmatter `version:` bump read
# as "a version on a line carrying no date". Without PASS-real-refresh the suite would have been
# green on a gate that could never fire.
set -uo pipefail
cd "$(dirname "$0")/.."
FIX=.github/fixtures/refresh-gate
fail=0

run () { node scripts/is-verification-refresh.js --diff "$FIX/$1" --base-dir . >/dev/null 2>&1; }

must_reject () {
  if run "$1"; then printf '  FAIL %-34s ACCEPTED — %s\n' "$1" "$2"; fail=1
  else printf '  ok   %-34s rejected\n' "$1"; fi
}
must_accept () {
  if run "$1"; then printf '  ok   %-34s accepted\n' "$1"
  else printf '  FAIL %-34s REJECTED — the gate can no longer fire at all\n' "$1"
       node scripts/is-verification-refresh.js --diff "$FIX/$1" --base-dir . 2>&1 | sed 's/^/       /'
       fail=1; fi
}

echo "refresh-gate selftest"
echo "  — the one that must be accepted —"
must_accept PASS-real-refresh.diff

echo "  — exploits that beat an earlier gate —"
must_reject V1-decimal-cutoff-real.diff      "a published iLIS cutoff moved"
must_reject V2-doi-swap-real.diff            "a citation retargeted at another paper"
must_reject V3-selfmodify.diff               "the gate editing itself"
must_reject V4-backdoor.diff                 "a one-line backdoor that disables the gate"
must_reject V5-refresh-plus-threshold.diff   "a real refresh with a threshold hidden in it"
must_reject E1-decimal-threshold.diff        "FDR 0.05 -> 0.50"
must_reject E2-doi-swap.diff                 "a DOI prefix swap"
must_reject E3-prose-behind-date.diff        "prose smuggled behind a date: prefix"
must_reject E4a-rename.diff                  "a rename, which carries no +/- lines"
must_reject E4b-mode.diff                    "a file-mode change"
must_reject E4c-binary.diff                  "a swapped binary"
must_reject E5-cross-file-move.diff          "a caveat relocated out of SKILL.md"
must_reject E6-dashdash-invisible.diff       "a deleted --flag line"
must_reject E7-newfile-verified-fields.diff  "a new file whose lines all start with excused tokens"
must_reject E8-url-version-tail.diff         "a URL version tail"
must_reject E9-ip-swap.diff                  "an IPv4 address"
must_reject R1-real-combined.diff            "real git output: delete + chmod + binary"
must_reject R2-real-rename.diff              "real git output: a rename"

echo "  — refusals —"
node scripts/is-verification-refresh.js >/dev/null 2>&1; [ $? = 2 ] \
  && printf '  ok   %-34s exit=2\n' "no --diff" \
  || { printf '  FAIL %-34s should exit 2\n' "no --diff"; fail=1; }
node scripts/is-verification-refresh.js --diff "$FIX/PASS-real-refresh.diff" >/dev/null 2>&1; [ $? = 2 ] \
  && printf '  ok   %-34s exit=2\n' "no --base-dir" \
  || { printf '  FAIL %-34s should exit 2\n' "no --base-dir"; fail=1; }

[ "$fail" = 0 ] && echo "  all cases pass" || echo "  SELFTEST FAILED"
exit $fail
