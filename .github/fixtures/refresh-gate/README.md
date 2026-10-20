# refresh-gate fixtures

Inputs for `scripts/is-verification-refresh.js`, the gate that decides whether a nightshift PR
may merge into this public registry with **no human review**.

**Do not edit these files by hand.** Each case is described in `scripts/make-refresh-fixtures.js`
and regenerated with:

    node scripts/make-refresh-fixtures.js

`manifest.json` records the **full set of reasons** the gate must give for each case, and the
selftest asserts that set exactly, in order.

## What counts as a refresh

One skill's `SKILL.md`, whose **body is byte-identical**, whose **frontmatter text outside the
`verified:` block is byte-identical** but for one `version:` line, which **parses to the same
values the client's own parser read before** outside the fields a refresh owns, and whose
`verified:` record keeps every field it had with a date that is real, not in the future, and not
moving backwards. Nothing else. There is no date rule for the page, no fence detector, and no run
date.

## Why they are generated, and why the full reason set

Four things earlier versions of this suite got wrong, each of which let a green suite sit on top
of a broken gate.

**They were hand-written.** The gate rebuilds the proposed file from the base and refuses a diff
that does not apply, so for twelve of eighteen cases a header-integrity check fired before the
rule under test ever ran. All eighteen reported `ok`.

**It asserted one reason substring.** That let a case be refused for a bundled, unrelated reason.
`R1-real-combined` named two files that do not exist in this tree and carried a `SKILL.md` hunk
expecting a shell line at line 1; it passed because
`reasons.some(includes('refuses a file-mode change'))` matched a *different* file's header. It had
been vacuous for some time and nothing said so.

**Cases were green restatements of defeated rules.** The nested-key rule and the prose-date rule
each had a passing fixture while a one-level-deeper spelling walked through. Twice more after
that: `version` was exempt from the client-parser rule *by name* while also being a real
top-level field in all 101 skills, and a YAML comment was invisible to both parsers at once.

**And a green suite is not coverage.** Mutation testing — neutralising each refusal in turn and
checking the suite goes red — found **13 of 39 surviving**. Those were the defence-in-depth
branches, and twelve now have cases.

**38 of the gate's 39 refusals are load-bearing.** The one that is not —
`has no parseable frontmatter in the base tree` — needs a base `SKILL.md` that does not start
with `---`, which `validate.js` forbids and no skill has. It is named here so its absence is on
the record rather than rediscovered by the next audit.

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
| `fm-block-scalar-smuggles-key` | a YAML block scalar under verified.against whose TEXT contains "license: GPL-3.0-only" — real YAML and validate.js both read CC-BY-4.0, the client reads GPL-3.0-only. This beat v3, whose rule only rejected values that PARSED as maps | `skills/afm-lis/SKILL.md writes "against: \|" into verified:`<br>`skills/afm-lis/SKILL.md changes what the client's frontmatter parser reads for "license"`<br>`skills/afm-lis/SKILL.md makes the client read "license"`<br>`skills/afm-lis/SKILL.md changes verified.against without rewriting it as one line` |
| `fm-nested-key-direct` | the same attack spelled as a plain nested key rather than a block scalar | `skills/afm-lis/SKILL.md writes "license: GPL-3.0-only" into verified:`<br>`skills/afm-lis/SKILL.md changes what the client's frontmatter parser reads for "license"`<br>`skills/afm-lis/SKILL.md makes the client read "license"`<br>`skills/afm-lis/SKILL.md puts "license" inside verified:` |
| `fm-comment-smuggled` | a colon-free YAML comment block in the frontmatter, telling the reader the documented cutoffs are superseded and to fetch another build. Both parsers discard comments and the naive one only makes a key when the line has a colon, so this was invisible to every check in v4 — and to validate.js and check-versions.js | `skills/afm-lis/SKILL.md changes the frontmatter outside the verified: block`<br>`skills/afm-lis/SKILL.md introduces a comment into the frontmatter — "# MAINTAINER NOTICE`<br>`skills/afm-lis/SKILL.md introduces a comment into the frontmatter — "# The iLIS cutoffs`<br>`skills/afm-lis/SKILL.md introduces a comment into the frontmatter — "# raw.githubusercontent.com` |
| `fm-comment-inside-verified` | the same smuggle moved INSIDE the verified: block, where the line comparison is deliberately permissive | `skills/afm-lis/SKILL.md introduces a comment into the frontmatter`<br>`skills/afm-lis/SKILL.md writes "# the table below is stale, use the other build" into verified:`<br>`skills/afm-lis/SKILL.md changes verified.against without rewriting it as one line` |
| `fm-comment-on-verified-line` | a comment appended to the verified: line itself, which the span calculation treats as part of the block | `skills/afm-lis/SKILL.md introduces a comment into the frontmatter` |
| `fm-version-smuggled-via-block-scalar` | a block scalar under verified.against carrying its own "version: 0.0.1" line. The client reads 0.0.1; the YAML and check-versions.js both read 1.0.1. This beat v4, because "version" was exempt from the client-parser rule BY NAME while also being a real top-level field in all 101 skills | `skills/afm-lis/SKILL.md writes "against: \|" into verified:`<br>`skills/afm-lis/SKILL.md makes the client read "version" as "0.0.1`<br>`skills/afm-lis/SKILL.md changes verified.against without rewriting it as one line` |
| `fm-yaml11-line-separator-block` | a records: block scalar whose one line hides license and allowed-tools behind U+2028. js-yaml and the client parser see one line; PyYAML and libyaml see new top-level keys, GPL-3.0-only and Bash(*). This beat v5 | `skills/afm-lis/SKILL.md writes U+2028 into verified:`<br>`skills/afm-lis/SKILL.md writes "records: \|" into verified:`<br>`skills/afm-lis/SKILL.md changes verified.records without rewriting it as one line` |
| `fm-yaml11-next-line-plain` | U+0085 (NEL), a YAML 1.1 line break that js-yaml reads as an ordinary character, inside an ordinary one-line against: value. js-yaml and every layout rule accept it, so the character rule is the only one that sees a value a YAML 1.1 reader splits | `skills/afm-lis/SKILL.md writes U+0085 into verified:` |
| `fm-verified-url` | a download location written into the observation record, which merges without review and is published in the raw file | `skills/afm-lis/SKILL.md puts a URL in verified.against` |
| `fm-verified-backticks` | a command written into the observation record for an agent to copy | `skills/afm-lis/SKILL.md puts backticks in verified.against` |
| `fm-verified-too-long` | an observation record grown into a page of prose, longer than any written so far | `skills/afm-lis/SKILL.md writes 992 characters into verified.against` |
| `fm-verified-header-deleted` | a block scalar header deleted and nothing written: its text folds into the field above, so `unverified: 1` becomes a paragraph, with no new byte for the write rules to see | `skills/4dn/SKILL.md changes verified.unverified without rewriting it as one line` |
| `fm-verified-lines-reordered` | reviewed prose rewritten by moving one of its carried lines, which adds nothing the write rules can see | `skills/4dn/SKILL.md changes verified.unverified_reason without rewriting it as one line` |
| `fm-verified-count-sexagesimal` | a count that is the string "1:20" to js-yaml and 80 to a YAML 1.1 reader | `skills/4dn/SKILL.md verified.executed is "1:20", not a whole number` |
| `PASS-block-scalar-carried` | a refresh of a skill whose unverified_reason is already a block scalar, left untouched. 36 skills hold one; the write rules apply to lines a refresh adds, not to lines it carries | **must be accepted** |
| `fm-verified-date-impossible` | a day that does not exist. YAML silently rolls 2026-10-00 to 2026-09-30, so the future and forward-progress checks saw a sane date while the client displayed the impossible literal — which beat v4 | `skills/afm-lis/SKILL.md verified.date reads as "2026-10-00" but YAML resolves it to 2026-09-30` |
| `fm-new-key-above-verified` | a tool grant inserted on the line above verified:, landing on a position v3 excused as being inside the block | `skills/pathway-cca-coessentiality/SKILL.md changes the frontmatter outside the verified: block`<br>`skills/pathway-cca-coessentiality/SKILL.md adds the frontmatter key "allowed-tools"`<br>`skills/pathway-cca-coessentiality/SKILL.md changes what the client's frontmatter parser reads for "allowed-tools"` |
| `fm-field-changed` | an API version path segment retargeted, v1 -> v2 | `skills/all-of-us/SKILL.md changes the frontmatter outside the verified: block`<br>`skills/all-of-us/SKILL.md changes the frontmatter field "datasets"`<br>`skills/all-of-us/SKILL.md changes what the client's frontmatter parser reads for "datasets"` |
| `fm-version-downgrade` | a refresh carrying a version that goes backwards | `skills/afm-lis/SKILL.md version "1.0.0" -> "0.9.0" is not an increase` |
| `fm-verified-erased` | a populated verification record — date, against, executed, unverified — replaced by one scalar. validate.js accepts "pending" too, so nothing else caught this | `skills/alphafold/SKILL.md replaces the verified: record with "pending"` |
| `fm-verified-core-dropped` | the "how much of this actually ran" count quietly removed | `skills/afm-lis/SKILL.md drops verified.executed` |
| `fm-verified-date-future` | a verification stamped in the future — the one date the gate still reads, checked against its own clock rather than anything in the diff | `skills/afm-lis/SKILL.md verified.date 2099-01-01 is in the future` |
| `fm-verified-date-backwards` | a verification backdated, which would make a stale check look recent relative to an older one | `skills/afm-lis/SKILL.md moves verified.date backwards, 2026-09-27 -> 2026-01-01` |
| `fm-unparseable-yaml` | indentation broken inside the verified: block, which the line comparison permits and YAML does not | `skills/afm-lis/SKILL.md writes "executed: 7" into verified:`<br>`skills/afm-lis/SKILL.md frontmatter is not parseable YAML` |
| `fm-key-removed` | a top-level field deleted outright | `skills/afm-lis/SKILL.md changes the frontmatter outside the verified: block`<br>`skills/afm-lis/SKILL.md removes the frontmatter key(s) author`<br>`skills/afm-lis/SKILL.md changes what the client's frontmatter parser reads for "author"` |
| `fm-already-disagreeing-key` | the one key in the registry whose YAML and client readings already differ — "requests>=2.28" loses its quotes in YAML and keeps them in the client. The gate refuses to reason about which one wins, so nothing about it may move | `skills/boltz2-nim/SKILL.md changes the frontmatter outside the verified: block`<br>`skills/boltz2-nim/SKILL.md changes the frontmatter field "compatibility"`<br>`skills/boltz2-nim/SKILL.md changes what the client's frontmatter parser reads for "compatibility"`<br>`skills/boltz2-nim/SKILL.md changes "compatibility", whose YAML and client values already differ` |
| `fm-verified-date-not-a-date` | a verification stamped with prose instead of a date | `skills/afm-lis/SKILL.md verified.date is not a YYYY-MM-DD date` |
| `scope-references-file` | a change to a references/ page, where nothing a refresh records belongs | `touches "skills/anndata/references/io_operations.md" — a refresh changes one skill's SKILL.md and nothing else` |
| `scope-two-skills` | two skills refreshed in one diff, so one review covers both | `touches 2 files` |
| `scope-gate-self-edit` | the gate editing itself — exit 0 is what the workflow reads as "merge this", and v1 ran the gate from the PR's own checkout | `touches "scripts/is-verification-refresh.js" — a refresh changes one skill's SKILL.md and nothing else` |
| `struct-rename-samepath` | a forged same-path rename header, which reaches the rename rule itself rather than the path-mismatch rule | `refuses a rename (skills/afm-lis/SKILL.md)` |
| `struct-fence-whitespace` | trailing whitespace on the opening --- fence, which belongs to neither the frontmatter nor the body and so was seen by neither comparison | `skills/afm-lis/SKILL.md changes a --- frontmatter fence line` |
| `struct-rename` | a rename, which carries no +/- lines at all | `refuses a diff header whose paths differ: a/skills/alphafold/SKILL.md vs b/skills/alphafold/SKILL-old.md` |
| `struct-mode` | a file made executable, which clients refuse to install | `refuses a file-mode change (skills/alphafold/SKILL.md)` |
| `struct-new-file` | a whole new file, whose every line is an addition and so has no counterpart to compare against | `refuses an added or deleted file (skills/alphafold/references/extra.md)`<br>`touches "skills/alphafold/references/extra.md"` |
| `struct-deleted-file` | a deleted page, which removes what a reader was told to consult | `refuses an added or deleted file (skills/anndata/references/io_operations.md)`<br>`touches "skills/anndata/references/io_operations.md"` |
| `struct-binary` | a swapped binary, whose content a text diff cannot show at all | `refuses a binary change (skills/alphafold/references/model.bin)`<br>`touches "skills/alphafold/references/model.bin"` |
| `struct-eof-newline` | a diff that changes whether the file ends in a newline | `skills/afm-lis/SKILL.md: refuses a diff that changes the end-of-file newline` |
| `struct-header-unparseable` | a header the gate cannot read, which must refuse rather than skip the file it names | `cannot parse a diff header` |
| `fm-not-a-mapping` | the whole frontmatter replaced by a bare scalar, so it parses to a string and every key-wise check below would read from a non-object | `skills/afm-lis/SKILL.md changes the frontmatter outside the verified: block`<br>`skills/afm-lis/SKILL.md frontmatter is not a mapping` |
| `malformed-orphan-hunk` | a hunk with no file header, which must refuse rather than be attributed to a guess | `a hunk appeared before any file header` |
| `malformed-empty` | an empty diff, which is not a harmless diff but one the gate never read | `contains no file changes at all` |
| `malformed-hunk-overcount` | a header declaring more lines than it carries, the mirror of the undercount case | `skills/afm-lis/SKILL.md: the hunk at line 5 declares 5 old and 5 new lines but carries 1 and 1` |
| `malformed-no-net-change` | a diff that removes and re-adds the same line, so it changes nothing and was therefore never inspected | `no file content actually changed` |
| `malformed-before-frontmatter` | a line inserted above the opening fence, so the document no longer starts with --- | `skills/afm-lis/SKILL.md would end up with no parseable frontmatter` |
| `scope-missing-skill` | a well-formed path for a skill that is not in the base tree, which must refuse rather than judge a file it cannot see | `cannot read skills/does-not-exist/SKILL.md in the base tree` |
| `struct-binary-patch` | an inline GIT binary patch, whose content no text comparison can inspect | `refuses a binary patch (skills/alphafold/references/model.bin)`<br>`touches "skills/alphafold/references/model.bin"` |
| `malformed-hunk-undercount` | a hunk header declaring fewer lines than it carries, so the gate would judge a document missing the added line | `skills/afm-lis/SKILL.md: the hunk at line 136 carries more lines than its header declares` |
| `malformed-does-not-apply` | a diff whose removed line is not what the base file says, so the gate cannot know what it would produce | `skills/afm-lis/SKILL.md: the diff does not apply to the base tree` |

## What four versions of this taught

**You cannot ask what a token means.** v1 and v2 asked it of versions, v3 of dates. `0.05` is a
version to a regex and a threshold to a reader; `2025-06-30` is a date to a regex and a training
cutoff to a reader; `` `2025-11-08` `` is a `census_version` a reader passes to `open_soma`.

**A guard must not travel inside the thing it guards.** v3's entire defence for prose dates was
"the new date must equal the run date", and the run date came from the head commit's *author*
date, which whoever writes the commit sets with `git commit --date=`.

**Enumerating bad shapes loses to the next shape.** v3 rejected a nested *mapping* under
`verified:`; a block scalar parses to a *string*. v4 then exempted `version` from the same rule
*by name*, and a block scalar carrying its own `version:` line overrode what the client read.

**Comparing parsed values cannot see what the parsers discard.** Both parsers drop comments, and
the naive one only makes a key when the line has a colon — so a `#` line with no colon was in
neither the body, the YAML, nor the client view. That is why the frontmatter is now compared as
text, not only as values.

**Two parsers agreeing is not every parser agreeing.** v5 compared js-yaml with the client's
naive parser, and both read U+2028, U+2029 and U+0085 as ordinary characters. YAML 1.1 parsers —
PyYAML, libyaml — read them as line breaks, so one physical line inside a `records: |` block
became `license: GPL-3.0-only` and `allowed-tools: Bash(*)` for any Python or Ruby consumer. A
third parser would lose to a fourth, so the gate now constrains the *bytes* a refresh may write
inside `verified:` — one plain `field: value` line each, printable ASCII, and in the free-text
fields no URL, no backticks and no more than 900 characters. Lines carried over unchanged are
exempt, which is what `PASS-block-scalar-carried` holds. Exempting carried lines opened one more door
— deleting or reordering them rewrote a field without writing a byte — so a field whose value
changes must be rewritten whole, as one line, and the counts must be whole numbers.

**Rejection is not enough either.** A gate that refuses everything satisfies every negative here.
`PASS-frontmatter-refresh` is the case that fails when the gate stops being useful, and it has
already caught one over-correction.
