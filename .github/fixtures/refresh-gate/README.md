# refresh-gate fixtures

Inputs for `scripts/is-verification-refresh.js`, the gate that decides whether a nightshift PR
may merge into this public registry with **no human review**.

**Do not edit these files by hand.** Each case is described in `scripts/make-refresh-fixtures.js`
and regenerated with:

    node scripts/make-refresh-fixtures.js

`manifest.json` records the **full set of reasons** the gate must give for each case, and the
selftest asserts that set exactly.

## Why they are generated, and why the full reason set

Three things earlier versions of this suite got wrong, each of which let a green suite sit on top
of a broken gate.

**They were hand-written.** The gate rebuilds the proposed file from the base and refuses a diff
that does not apply, so for twelve of eighteen cases a header-integrity check fired before the
rule under test ever ran. All eighteen reported `ok`.

**It asserted one reason substring.** That let a case be refused for a bundled, unrelated reason.
`R1-real-combined` named two files that do not exist in this tree and carried a `SKILL.md` hunk
expecting a shell line at line 1 of a markdown file; it passed because
`reasons.some(includes('refuses a file-mode change'))` matched a *different* file's header. It had
been vacuous for some time and nothing said so.

**And two cases were green restatements of defeated rules.** The nested-key rule and the
prose-date rule each had a passing fixture while a one-level-deeper spelling of the same attack
walked through. That is why the body rule is now absolute rather than conditional.

Under mutation testing — neutralising each of the gate's **33 refusals** one at a time — all 33
fail the suite.

## The cases

| fixture | what it smuggles | must be refused because |
|---|---|---|
| `PASS-frontmatter-refresh` | a version bump and the verified: block, with the page itself untouched — the only shape that merges without a human | **must be accepted** |
| `body-threshold-moved` | the published iLIS cutoff moved, 0.223 -> 0.023, inside an otherwise real refresh | `skills/afm-lis/SKILL.md changes the body at line` |
| `body-date-is-a-claim` | a training-data cutoff moved to the run date — a prose date that is a capability claim, which beat v3 even unforged | `skills/protenix/SKILL.md changes the body at line` |
| `body-date-in-inline-code` | a census_version in inline backticks — not a fence, so v3 read it as prose and let the dataset selector move | `skills/cellxgene-census/SKILL.md changes the body at line` |
| `body-doi-retargeted` | a citation pointed at a different record | `skills/afm-lis/SKILL.md changes the body at line` |
| `body-line-added` | arbitrary prose added, here pointing a reader at another host | `skills/afm-lis/SKILL.md changes the body — 1 line(s) added or removed` |
| `body-line-deleted` | a deleted --flag line, which a naive "---" header skip once swallowed whole | `skills/bindcraft/SKILL.md changes the body — 1 line(s) added or removed` |
| `body-ip-swap` | a loopback address pointed somewhere else | `skills/brain-researcher/SKILL.md changes the body at line` |
| `fm-block-scalar-smuggles-key` | a YAML block scalar under verified.against whose TEXT contains "license: GPL-3.0-only" — real YAML and validate.js both read CC-BY-4.0, the client reads GPL-3.0-only. This beat v3, whose rule only rejected values that PARSED as maps | `skills/afm-lis/SKILL.md changes what the client's frontmatter parser reads for "license"` |
| `fm-nested-key-direct` | the same attack spelled as a plain nested key rather than a block scalar | `skills/afm-lis/SKILL.md changes what the client's frontmatter parser reads for "license"`<br>`skills/afm-lis/SKILL.md puts "license" inside verified:` |
| `fm-new-key-above-verified` | a tool grant inserted on the line above verified:, landing on a position v3 excused as being inside the block | `skills/pathway-cca-coessentiality/SKILL.md adds the frontmatter key "allowed-tools"`<br>`skills/pathway-cca-coessentiality/SKILL.md changes what the client's frontmatter parser reads for "allowed-tools"` |
| `fm-field-changed` | an API version path segment retargeted, v1 -> v2 | `skills/all-of-us/SKILL.md changes the frontmatter field "datasets"`<br>`skills/all-of-us/SKILL.md changes what the client's frontmatter parser reads for "datasets"` |
| `fm-version-downgrade` | a refresh carrying a version that goes backwards | `skills/afm-lis/SKILL.md version "1.0.0" -> "0.9.0" is not an increase` |
| `fm-verified-erased` | a populated verification record — date, against, executed, unverified — replaced by one scalar. validate.js accepts "pending" too, so nothing else caught this | `skills/alphafold/SKILL.md replaces the verified: record with "pending"` |
| `fm-verified-core-dropped` | the "how much of this actually ran" count quietly removed | `skills/afm-lis/SKILL.md drops verified.executed` |
| `fm-verified-date-future` | a verification stamped in the future — the one date the gate still reads, checked against its own clock rather than anything in the diff | `skills/afm-lis/SKILL.md verified.date 2099-01-01 is in the future` |
| `fm-verified-date-backwards` | a verification backdated, which would make a stale check look recent relative to an older one | `skills/afm-lis/SKILL.md moves verified.date backwards, 2026-09-27 -> 2026-01-01` |
| `scope-references-file` | a change to a references/ page, where nothing a refresh records belongs | `touches "skills/anndata/references/io_operations.md" — a refresh changes one skill's SKILL.md and nothing else` |
| `scope-two-skills` | two skills refreshed in one diff, so one review covers both | `touches 2 files` |
| `scope-gate-self-edit` | the gate editing itself — exit 0 is what the workflow reads as "merge this", and v1 ran the gate from the PR's own checkout | `touches "scripts/is-verification-refresh.js" — a refresh changes one skill's SKILL.md and nothing else` |
| `struct-rename` | a rename, which carries no +/- lines at all | `refuses a diff header whose paths differ: a/skills/alphafold/SKILL.md vs b/skills/alphafold/SKILL-old.md` |
| `struct-mode` | a file made executable, which clients refuse to install | `refuses a file-mode change (skills/alphafold/SKILL.md)` |
| `struct-new-file` | a whole new file, whose every line is an addition and so has no counterpart to compare against | `refuses an added or deleted file (skills/alphafold/references/extra.md)`<br>`touches "skills/alphafold/references/extra.md"` |
| `struct-deleted-file` | a deleted page, which removes what a reader was told to consult | `refuses an added or deleted file (skills/anndata/references/io_operations.md)`<br>`touches "skills/anndata/references/io_operations.md"` |
| `struct-binary` | a swapped binary, whose content a text diff cannot show at all | `refuses a binary change (skills/alphafold/references/model.bin)`<br>`touches "skills/alphafold/references/model.bin"` |
| `struct-eof-newline` | a diff that changes whether the file ends in a newline | `skills/afm-lis/SKILL.md: refuses a diff that changes the end-of-file newline` |
| `struct-header-unparseable` | a header the gate cannot read, which must refuse rather than skip the file it names | `cannot parse a diff header` |
| `malformed-hunk-undercount` | a hunk header declaring fewer lines than it carries, so the gate would judge a document missing the added line | `skills/afm-lis/SKILL.md: the hunk at line 136 carries more lines than its header declares` |
| `malformed-does-not-apply` | a diff whose removed line is not what the base file says, so the gate cannot know what it would produce | `skills/afm-lis/SKILL.md: the diff does not apply to the base tree` |

## What counts as a refresh

One skill's `SKILL.md`, whose **body is byte-identical**, whose frontmatter differs only in
`verified:` and an increasing `version:`, which **parses to the same values the client's own
parser read before** outside the fields a refresh owns, and whose `verified:` record keeps every
field it had with a date no later than today. Nothing else. There is no date rule for the page,
no fence detector, and no run date.

## What three versions of this taught

**You cannot ask what a token means.** v1 and v2 asked it of versions, v3 of dates. `0.05` is a
version to a regex and a threshold to a reader; `2025-06-30` is a date to a regex and a training
cutoff to a reader; `` `2025-11-08` `` is a `census_version` a reader passes to `open_soma`.
Position does not separate them, and neither does "it only moved forward".

**A guard must not travel inside the thing it guards.** v3's entire defence for prose dates was
"the new date must equal the run date", and the run date came from the head commit's *author*
date, which whoever writes the commit sets with `git commit --date=`.

**Enumerating bad shapes loses to the next shape.** v3 rejected a nested *mapping* under
`verified:`. A YAML block scalar parses to a *string*, and the client's parser — which has no
nesting model and flattens every colon-bearing line — read its text as top-level keys. The rule
is now the invariant itself: what the client reads must not change.

**Rejection is not enough either.** A gate that refuses everything satisfies every negative here.
`PASS-frontmatter-refresh` is the case that fails when the gate stops being useful, and it has
already caught one over-correction.
