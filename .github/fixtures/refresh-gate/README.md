# refresh-gate fixtures

Inputs for `scripts/is-verification-refresh.js`, the gate that decides whether a nightshift PR may
merge with **no human review**.

**Do not edit these files by hand.** Each one is described as an edit to a real skill in
`scripts/make-refresh-fixtures.js` and generated with `git diff`:

    node scripts/make-refresh-fixtures.js

`manifest.json` records, for every case, the reason the gate must give. The selftest asserts that
text, so a case refused for an unrelated reason fails rather than passes.

## Why they are generated rather than written

They were hand-written at first. When the gate was rebuilt, all eighteen still "passed" — and
twelve of them were being refused because their hunk headers did not match their bodies, so a
header-integrity check fired before the rule under test ever ran. Twelve green cases proving
nothing, and no way to tell from the output.

Generating them from real edits means they always apply to the base tree, and asserting the reason
means the suite notices when a case stops testing its rule. Under mutation testing — neutralising
each of the gate's 30 refusals one at a time — **all 30 are load-bearing**. The previous suite let
12 of 15 be deleted while staying green.

## What each case is

Every `E*`, `V*` and `R*` case is an exploit that defeated an earlier version of the gate, found
by an adversarial review briefed to treat it as a security boundary and confirmed by execution.
Fifteen of them beat v1 and v2 between them. The `N*` cases are the four that beat v2 plus three
rules that would otherwise go unasserted.

| fixture | what it smuggles | must be refused because |
|---|---|---|
| `PASS-real-refresh` | a version bump, the verified: block, and seven prose observation dates moved to the run date | **must be accepted** |
| `V1-decimal-cutoff-real` | the published iLIS cutoff moved, 0.223 -> 0.023, inside an otherwise real refresh | `changes something other than a date` |
| `E1-decimal-threshold` | the same cutoff moved where it is executed, inside a code fence | `changes something other than a date` |
| `V2-doi-swap-real` | a citation retargeted at another record by its suffix | `changes something other than a date` |
| `E2-doi-swap` | the same citation retargeted by its registrant prefix | `changes something other than a date` |
| `V3-selfmodify` | the gate editing itself — exit 0 is what the workflow reads as "merge this" | `not a file inside one skill` |
| `V4-backdoor` | a line that is a valid JS label AND looked like a dated observation to v1 | `adds or removes 1 body line` |
| `E3-prose-behind-date` | arbitrary prose smuggled in behind a leading date | `adds or removes 1 body line` |
| `V5-refresh-plus-threshold` | a real refresh with one moved threshold hidden among the dates | `changes something other than a date` |
| `E6-dashdash-invisible` | a deleted --flag line, which a naive "---" header skip swallowed whole | `adds or removes 1 body line` |
| `E5-cross-file-move` | a caveat moved out of SKILL.md into references/, so a global pool saw a matched pair | `adds or removes 1 body line` |
| `E8-url-version-tail` | an API version path segment retargeted, v1 -> v2 | `changes the frontmatter field "datasets"` |
| `E9-ip-swap` | a loopback address pointed somewhere else | `changes something other than a date` |
| `N1-verified-nested-key` | license: nested under verified:, which real YAML reads correctly and the client's parser reads as top-level — validate.js passes this one too | `puts "license" inside verified:` |
| `N2-key-above-verified` | a tool grant inserted on the line above verified:, landing on a position v2 excused | `adds the frontmatter key "allowed-tools"` |
| `N3-prose-date-is-semantics` | a training-data cutoff moved ten years out — a date in prose that is a capability claim | `is not the run date` |
| `N4-date-launders-version` | a false install requirement laundered by bumping the date beside it — the change that inverted v2's central rule | `changes something other than a date` |
| `N5-date-in-code` | a date moved to the run date, but inside a fence, where a date can be the argument that selects which data loads | `changes a date inside a code block` |
| `N7-date-backwards` | an embargo lift date pulled back onto the run date, which would say data is available that is not | `moves a date backwards` |
| `N6-version-downgrade` | a verified: refresh carrying a version that goes backwards | `is not an increase` |
| `E4a-rename` | — | `refuses a rename` |
| `E4b-mode` | — | `refuses a file-mode change` |
| `E4c-binary` | — | `refuses a binary change` |
| `E7-newfile-verified-fields` | — | `refuses an added or deleted file` |
| `R1-real-combined` | — | `refuses a file-mode change` |
| `R2-real-rename` | — | `refuses a rename` |

## Two things these taught

**Position is not enough.** v2 classified every changed line as frontmatter, `verified:`, fenced
code or prose, and asked whether a prose change was date-only. `Accept hits with FDR < 0.05` is
prose, and `0.05` is a version to any regex. v2's answer was "a version may change only on a line
whose date also changed" — 77 prose lines in this registry carry both, so `N4` just bumps the date
beside the threshold.

**Rejection is not enough either.** A gate that refuses everything satisfies every negative here.
`PASS-real-refresh` is the case that fails when the gate stops being useful, and it has already
caught one over-correction: a frontmatter `version:` bump read as "a version on a line with no
date", which would have refused every legitimate refresh.

## How often the gate can actually fire

A gate that refuses everything is useless, so this is measured rather than assumed. Simulating a
mechanical refresh on every skill in the registry — bump `version`, set `verified.date`, move
every dated prose line outside a fence to the run date, change nothing else — **99 of 101 skills
auto-merge.**

The two that do not are `biostudies` and `zenodo`, and both are refused by the
*moves a date backwards* rule, because both carry a body date in the future:

- `biostudies` documents a query bound, `release_date=[2026-01-01 TO 2026-12-31]`
- `zenodo` documents an embargo lifting `2026-12-11`

Neither is an observation. Pulling either back onto the run date would change which records a
documented query returns, or claim data is available that is not. `N7` is that case.

This correction is worth recording: an earlier version of this file asserted that the
backwards-date rule had no fixture *because no skill carries a date later than the run date*. Two
do, the rule was already load-bearing on real content, and the claim was never checked.
