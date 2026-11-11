---
name: paperpush
description: Fill a journal or preprint submission portal from a manuscript directory — choose a venue, generate its submission file, extract the field values from the paper, validate them, then hand a signed-in browser to the author for the final submit.
category: communication
license: BSD-2-Clause
author: Pachter Lab (adapted by Heureka Labs)
attribution: https://github.com/pachterlab/paperpush
version: 1.6.0
datasets: []
tags: [manuscript, preprint, submission, publishing]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-11
  against: paperpush 0.5.4 / venue data 7af06f9 published 2026-11-10 / pypdf 7.0.1 / pydantic 2.14.3 / playwright 1.65.0 / Python 3.11.18
  executed: 10
  unverified: 1
  unverified_reason: The install block's playwright browser download is unrun because the validating environment does not fetch it, and login and submit need that browser plus real portal credentials, which is why they are shown as plain output rather than runnable blocks. Re-run from a host that can download a Playwright browser and holds a test account on a venue. Separately, the reference DOI checks were exercised only as far as reporting that they could not run — the DOI registry was unreachable from the validating host, so no text for a mismatched, unregistered or retracted DOI was observed. Re-run from a host that can reach the registry to confirm those messages.
---

# Submitting a manuscript with paperpush

`paperpush` turns a directory of manuscript files into a filled-in submission form on a
preprint server or journal portal. It is a two-part tool, and the split matters:

- **A deterministic core**, which you drive. It generates a per-venue submission file,
  writes proposed values into it under a fixed set of rules, and validates the result.
- **A browser runner**, which the author drives. It opens the real portal, types the
  values in, and **stops before the final submit button**, leaving the window open.

You do the reading and the extraction. You never sign in as the author, and you never
press submit.

## When to use this

The author has a finished manuscript and a target venue, and wants the submission form
populated rather than typed by hand. Use it for arXiv, bioRxiv and medRxiv preprints and
for the journal portals listed by `paperpush venues`.

Do not use it to decide *where* to submit, to write any part of the manuscript, or to
answer the policy questions a submission asks (licence, consent, competing interests,
suggested reviewers). Those belong to the author, and the tool enforces that — see
*What the tool refuses to fill* below.

## Guardrails

1. **Never run `paperpush login` for the author, and never ask for their password.**
   Login collects a real submission-portal username and password and stores them on the
   machine — in the OS secret store where one is available, otherwise in an owner-only
   JSON file that is *not* encrypted at rest. If a venue is not already authenticated,
   stop and tell the author to run it themselves in their own terminal.
2. **Never run `paperpush submit --headless`.** The whole point of the run is that the
   wizard stops on the review page for a person to look at, and headless gives them no
   window to look at. Run `submit` only when the author is at the machine, or hand them
   the command instead.
3. **Set confidence honestly.** `high` only for text copied verbatim from the manuscript
   or an unambiguous file match. `medium` for anything inferred or classified. `low` for
   a genuine guess. The confidence you write decides whether a value is presented to the
   author as settled or flagged for review — an inflated `high` is how a wrong author
   email reaches a journal unchallenged.
4. **Never invent an email, ORCID iD, DOI, funder, or grant number.** If it is not in the
   files, leave the subfield blank and list the field under `unfilled` with a reason.

## Install

```bash
pip install paperpush
playwright install chromium
```

`playwright install chromium` downloads a browser (a few hundred MB) and is needed only
for `login` and `submit`; everything up to `validate` works without it.

**Install the `validate` extra too if you will run `validate` on a PDF.** Without it the
checks that read the PDF's text layer — hidden text and prompt injection among them — are
skipped, and `validate` says so in a warning rather than failing:

```bash
pip install 'paperpush[validate]'
```

On the one-page fixture in `## Try it` the extra moves four checks out of *could not run*
and into *passed*. Skipped is not clean, so install it before telling an author the
manuscript checked out.

Check the install and list the venues:

```bash
paperpush --version
paperpush venues
```

`venues` is a subcommand, not a flag: `paperpush --venues` exits 2 with
`unrecognized arguments`. The table it prints has a column for each of `validate` and
`submit`, so it also tells you which venues have a browser runner and which are
validate-only — a venue with no tick under *Submit* can be filled and checked but not
driven.

`paperpush --agent-guide` prints the project's own guidance for agents driving the CLI.
It is worth reading once: it is upstream's statement of the same split this page describes,
so where the two ever diverge, the tool's copy is the current one.

## Step 1 — check the author is signed in

Do this first. It decides whether the run can finish at all.

```bash
paperpush login --list
```

If the target venue is not listed, **stop and hand the step back**:

> bioRxiv isn't authenticated yet. Run `paperpush login biorxiv` in your terminal — it
> will prompt for your portal credentials and store them in your system keyring. I don't
> handle logins. Tell me when it's done.

`paperpush login --status <venue>` checks one venue and exits non-zero when there are no
stored credentials. `paperpush login --logout <venue>` removes them.

## Step 2 — generate the submission file

```bash
paperpush subfile biorxiv
```

This writes `biorxiv.sub.txt`, a commented, line-based file with one entry per field.
**The extension is `.sub.txt`, not `.sub`** — `-o` adds it unless the name you give
already ends in `.sub.txt` or `.sub`. Commands that take the file accept either spelling
and resolve it, so a stale `biorxiv.sub` on a command line still works; a `grep` or an
editor pointed at that name does not, because the file on disk is `biorxiv.sub.txt`. Read
it — the comments are the field schema, and they carry everything you need to fill it:

- the field's **type** (`text`, `textarea`, `choice`, `multichoice`, `boolean`,
  `authorlist`, `file`, `filelist`),
- whether it is **REQUIRED**,
- the closed **option list** for a choice field,
- and the exact column format for a list field.

For example, bioRxiv's `authors` field documents itself as
`Name | email | affiliation | ORCID | corresponding(yes/no)`, one author per line, with
exactly one corresponding author. Follow the help text in the file, not a format you
remember from another venue — the columns differ between portals.

By default `subfile` pre-populates fields that have a default value. Note what those
defaults are before assuming they are correct: bioRxiv's `license` defaults to
`CC-BY-NC-ND`, the most restrictive of the Creative Commons options it offers — the list
also carries a stricter `No reuse without permission` — and `author_consent` defaults to
`no`. Neither default is one to accept on the author's behalf; both are `never` fields.
Use
`--dont-fill-defaults` to leave them empty instead, and `--overwrite` to replace an
existing `.sub` file (there is no `--force`, and no `--fill-defaults`: pre-populating is
the default and has no flag of its own).

For a long or nested option list, query it directly rather than scrolling the comments:

```bash
paperpush options biorxiv.subject_category
```

Some venues nest their categories. Pass the path to descend a level:

```bash
paperpush options nature.subject_level
paperpush options nature.subject_level "Biological sciences"
```

## Step 3 — read the manuscript and write the values

Read every file in the manuscript directory — the manuscript itself, a separate title
page if there is one, the supplement, and the figure files. Then write a JSON file of
proposed values. This is the only place your judgment enters; everything downstream is
deterministic.

The format is fixed:

```json
{
  "fields": [
    {"id": "title", "value": "…", "confidence": "high", "source": "manuscript.md title"},
    {"id": "abstract", "value": "…", "confidence": "high", "source": "manuscript.md Abstract"},
    {"id": "subject_category", "value": "Cancer Biology", "confidence": "medium", "source": "classified from the abstract"}
  ],
  "unfilled": [
    {"id": "author_consent", "reason": "an attestation only the corresponding author can make"}
  ]
}
```

- `id` is the field name from the `.sub` file.
- `value` is a plain string. For a multi-line field (authors, figure lists, funding),
  it is one record per line, `\n`-separated, in the column format the field's help gives.
- `confidence` is `high`, `medium` or `low`. Defaults to `medium` if omitted.
- `source` is a short note on where the value came from. It is echoed back in the summary
  and is what lets the author check your work quickly.
- `unfilled` is for fields you deliberately left alone, with a reason. Use it — a field
  silently omitted is indistinguishable from one you forgot.

**File paths are relative to the manuscript directory** you pass with `-p`, not to your
working directory. Give `manuscript.pdf` and `figures/figure1.png`; the tool rewrites
them into the `.sub` relative to where the `.sub` lives.

## Step 4 — write the values into the submission file

```bash
paperpush autofill -p ./manuscript --engine manual --values values.json biorxiv.sub.txt
```

`-p`/`--path` is **required**, and it is the flag to use: it takes one or more manuscript
directories *and/or* individual document files, repeated or listed together, and consumes
arguments up to the next flag or the first `.sub` file. The older `-d` still works but is
no longer in `autofill --help`, so write `-p`.

`manual` is the default engine and is the one to use — you have already read the
manuscript, so a second extraction pass adds cost and a second chance to be wrong. If
the `.sub` does not exist yet, `autofill` creates it from the venue slug in the filename.

The command prints a four-part summary of its decisions, then a validation-warning
section whenever the run raises one, then the count still blocking submission. Read all
of it back to the author:

```
Filled 4 field(s):            written, high confidence, not a judgment call
1 field(s) need your review:  written, but medium confidence or a classification
Left for you to set (2):      refused by policy, or listed in your `unfilled`
6 validation warning(s):      advisory; they do not block
1 field(s) still need filling in before submit
```

Useful flags: `-o OUTPUT` writes elsewhere instead of overwriting the `.sub`,
`--overwrite` replaces an existing output file, `--min-confidence low|medium|high`
refuses to write anything weaker, and `--dry-run` reports the decisions without touching
the file. The floor **defaults to `low`**, which writes everything you propose — if you
want the tool to hold back your guesses, you have to ask for it. Every subcommand also takes `-v`/`-vv` and `-q`, or the `PAPERPUSH_LOG_LEVEL`
environment variable, which is how you see what a check actually did rather than only what
it concluded.

### What the tool refuses to fill

Every field carries a role, and one of those roles is `never`. A `never` field is left at
its template default and reported to the author no matter what you propose or how
confident you claim to be. On bioRxiv that covers the reuse `license`, the
`author_consent` attestation, the scope and server-routing questions, and the
journal-forwarding flags; on other venues it also covers suggested reviewers, prior
submission history, and declaration checkboxes.

This gate is in the tool, not in these instructions, so you cannot talk your way past it.
Do not try. Report those fields to the author as theirs to answer, and move on.

## Step 5 — validate

```bash
paperpush validate biorxiv.sub.txt
```

`validate` prints a **report of every check it knows about for the venue**, each with a
status, and ends with a one-line verdict. It exits `0` when nothing is blocking
(`Ready to submit: no blocking errors.`) and non-zero when something is
(`Not ready: N error(s) must be fixed before submitting.`). **Only errors move the exit
code** — a file can exit `0` carrying warnings, and does.

The summary line is the thing to read first, and to read back to the author:

```
✔ 19 passed  ·  ✖ 1 failed  ·  ▲ 5 with warnings  ·  ? 15 could not run  ·  ? 16 need AI  ·  – 0 not implemented
```

Six statuses, and the three on the right are the ones a report of "it validated" hides:

| status | what it means |
|---|---|
| passed | the check ran and found nothing |
| failed | blocking. These, and only these, set the exit code |
| with warnings | the check ran and found something advisory |
| could not run | the check applies but something stopped it — a missing extra, a file it could not read, an unreachable registry. It **says which** |
| needs AI | the check needs a model to judge it, and no model was given |
| not implemented / not applicable | nothing to do for this venue and these files |

**AI checks are off by default.** The ones that need a model to judge — figure lettering
in raster images, a venue's free-text rules, whether the `.sub`'s fields say the same
thing as the manuscript — are listed as *needs AI* and are **not** failures. Run them with
`--ai` plus a provider API key, or hand them to an agent with `--ai-tasks FILE` and
`--ai-results FILE`, which writes the pending checks out as JSON and merges the verdicts
back in. Do not report an unrun AI check as passed.

Pick what runs with `--disable-CHECK` and `--enable-CHECK`, by check id or by the start
of one for a whole family — `--disable-prose`, `--disable-references`. The older
`--dont-check-links`-style flags are gone. Control the report itself with
`--show-errors-only`, `--hide-warnings` and `--hide-unchecked`; `--json` prints the same
content as data (each check's id, status and issues), and `-o` also saves it as `.pdf`,
`.html`, `.md` or `.txt`.

`validate` also runs **without a `.sub`**: name the files with `--manuscript`,
`--title-page`, `--cover-letter`, `--figures`, `--tables`, `--supplement`, and add
`--venue` to check them against a venue's guidelines. When the journal is not one of the
listed venues, name its publisher with `--publisher` (or let `--issn`/`--journal` look the
publisher up over the network) and the files are measured against that publisher's house
rules instead — reported as warnings, since any one journal may depart from them.

**The reference checks read the uploads, not the directory.** They resolve the DOIs found
in the files the `.sub` actually lists — `manuscript_file`, `supplementary_files`, and so
on. A `.bib` sitting in the manuscript directory that no field points at is never opened.
If you want the bibliography checked, put it in the submission.

**An unreachable DOI registry is now reported, not swallowed.** This is a change from
0.2.0, where the lookups were abandoned at debug level and a run against an unreachable
registry was indistinguishable from a clean bibliography. Today the check lands under
*could not run* and names the count:

```
? [Integrity] Reference DOIs match the works they cite
    2 of 2 reference DOI(s) were not checked: 2 got no usable answer from the registry
    (unreachable, rate-limited, or no record in a readable form)
? [Integrity] No cited work has been retracted
    the reference lookups did not finish
```

So you no longer need `-v` to find out whether the pass did anything — but you do still
have to read past the summary count, because *could not run* is not *passed*. `-v` prints
the `Resolving N of N distinct DOI(s)` line if you want the detail.

A typical first run, with `--show-errors-only` to cut the report to the blocking part:

```
paperpush validation report: biorxiv.sub.txt
Command: paperpush validate biorxiv.sub.txt --show-errors-only (run in …)
Generated: …
File: biorxiv.sub.txt
Venue: biorxiv
AI checks: off. Run with --ai (and an ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY), or let an agent do them with the paperpush-validate skill (--ai-tasks / --ai-results).

Not ready: 1 error(s) must be fixed before submitting.
✔ 19 passed  ·  ✖ 1 failed  ·  ▲ 5 with warnings  ·  ? 15 could not run  ·  ? 16 need AI  ·  – 0 not implemented
Not shown: Warnings (5); Not checked: could not run (15); Not checked: needs AI (16); Passed (19); Not applicable (71).

FAILED (1)
  ✖ [Submission form] Required fields are filled and confirmations given
    - error: [author_consent] All authors consent to deposit and to the chosen license must be confirmed (set to yes)

Fix the errors above, then run 'paperpush validate' again.
```

That error is the author's to clear, not yours. Ask them.

### What the venue actually requires

The guideline checks measure the uploads against rules paperpush ships for each venue, and
`requirements` prints those same rules — so you can read what the submission will be judged
against before you build it, rather than discovering it from warnings afterwards.

```bash
paperpush requirements biorxiv
paperpush requirements nature --article-type "Matters Arising"
paperpush requirements nature --json
```

The summary names the guideline pages it was read from, the date a human read them, and the
publication stamp of the venue-rule data the installed release carries, then lists
the manuscript, figure and supplementary rules — accepted formats, size caps, word and
display-item limits, required section headings and declarations, and free-text notes for
everything that does not reduce to a number. Where a venue runs different rules for other
article types, the header lists them and `--article-type` switches to one — for Nature the
default research article allows 4,300 words and 6 display items, while `Matters Arising`
allows 1,200 and 2. `--json` prints the same content as data.

Spell that string the way the header spells it. An article type the venue has no overrides
for does **not** fail: it warns once and prints the default rules anyway, so a typo hands
you the wrong limits under the right heading. Exit status is `0` either way.

Some rules are the **publisher's** rather than the venue's own, and the summary marks those
with a `*` and says so in its header — for a Springer Nature journal, a rule the journal's
guidelines never state. `validate` reports what those catch as warnings, because a journal
may depart from its publisher's rules.

Two things about it are worth holding onto. It is **a recorded snapshot, not a live fetch** —
the header's date is when a human last read those pages, and a venue can change its
guidelines the day after. Treat a rule that matters as something to confirm on the venue's
own page, which the header links. And the guideline checks are **advisory only**: every
finding is a warning, so a submission that breaks a stated word limit still exits `0`. Those
warnings are for the author to weigh, not for you to clear on their behalf — and a heading
the tool cannot find in a PDF is as likely to be an extraction miss as a missing section.

## Step 6 — hand it back

When `validate` passes, stop and report:

- the fields you filled, with the source for each,
- the fields flagged for review, and why each was flagged,
- the fields left for them to set, and what each is asking,
- the exact commands to finish.

```
paperpush login biorxiv     # if not already signed in
paperpush submit biorxiv.sub.txt
```

`submit` re-runs validation first and refuses to open a browser if anything still fails.
It then opens the portal in a headed window, reuses a saved session or signs in with the
stored credentials, clicks through the wizard typing in the values from the `.sub` — and
**stops before the final submit**, leaving the window on the review page. Every venue
runner behaves this way. The author reviews the filled form in the portal and presses
submit themselves.

If a step breaks, the browser is left open at the point of failure so it can be finished
by hand (`--close-on-failure` closes it instead). `--timeout SECONDS` raises the per-action
limit (default 10s, `0` waits forever) on a slow portal, and `--new-session` discards a
saved session after an account switch.

`submit` is for **initial** submissions. When the `.sub` looks like a revision — it sits in
a `revisionN/` directory, or beside a response to reviewers — it stops and asks, because
the portal routes a revision through a different entry point of its own. `-y` answers that
prompt, so do not pass it on the author's behalf.

## Try it

Runs the whole deterministic core end to end — template, autofill, validate — in a fresh
empty directory. It never signs in and never submits, so it is safe to run anywhere.

**Data.** Generated inline, which is why the frontmatter declares `datasets: []`. There is
no public dataset to fetch here: the input to this tool is an author's own unpublished
manuscript, and a real one is exactly what should not be checked into a registry. The block
writes a three-line manuscript and a valid one-page PDF instead. The author is fictional and
the address sits in the reserved `example.org` documentation domain, so nothing here can
reach a real mailbox — the file is a fixture, not a submission.

**Run.**

```bash
pip install paperpush
mkdir -p paper && cd paper
cat > manuscript.md <<'EOF'
# A reproducible workflow for counting transcripts

**Abstract.** We describe a workflow that counts transcripts from short-read
RNA-seq data and reports per-gene estimates with calibrated uncertainty.
EOF
python3 - <<'PY'
# a valid one-page PDF, padded past paperpush's 1 KB "may be empty" warning
body = b"BT /F1 12 Tf 72 720 Td (A reproducible workflow for counting transcripts) Tj ET"
objs = [b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R"
        b" /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(body) + body + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
out, offs = bytearray(b"%PDF-1.4\n% " + b"padding " * 128 + b"\n"), []
for i, o in enumerate(objs, 1):
    offs.append(len(out)); out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
x = len(out)
out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
for off in offs: out += b"%010d 00000 n \n" % off
out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, x)
open("manuscript.pdf", "wb").write(out)
PY
cd ..
cat > values.json <<'EOF'
{
  "fields": [
    {"id": "title", "value": "A reproducible workflow for counting transcripts", "confidence": "high", "source": "manuscript.md title"},
    {"id": "abstract", "value": "We describe a workflow that counts transcripts from short-read RNA-seq data.", "confidence": "high", "source": "manuscript.md Abstract"},
    {"id": "authors", "value": "Ada Lovelace | ada@example.org | Institute of Computation | 0000-0002-1825-0097 | yes", "confidence": "high", "source": "manuscript.md title block"},
    {"id": "manuscript_file", "value": "manuscript.pdf", "confidence": "high", "source": "the only PDF in the directory"},
    {"id": "subject_category", "value": "Bioinformatics", "confidence": "medium", "source": "classified from the abstract"},
    {"id": "license", "value": "CC-BY", "confidence": "high", "source": "deliberately proposed - license is a never field"}
  ],
  "unfilled": [
    {"id": "author_consent", "reason": "an attestation only the corresponding author can make"}
  ]
}
EOF
paperpush requirements biorxiv | head -8
paperpush subfile biorxiv
grep -E '^(license|author_consent):' biorxiv.sub.txt
paperpush autofill -p ./paper --engine manual --values values.json biorxiv.sub.txt
paperpush validate biorxiv.sub.txt --show-errors-only; echo "validate exit: $?"
```

The `license` entry in `values.json` is proposed **on purpose, at `high` confidence**, to
route the run through the gotcha this skill exists to teach: `license` is a `never` field,
so a confident proposal is still refused. Do not "fix" it.

**Expect.**

*Invariants — a mismatch means the skill is wrong.*

- `license` is **not** written. It appears under `Left for you to set (2)` alongside
  `author_consent`, even though it was proposed at `high` confidence. Confidence cannot buy
  a `never` field.
- `author_consent`, listed in `unfilled`, also lands under *Left for you to set* rather than
  being silently dropped.
- `subject_category`, proposed at `medium`, lands under `1 field(s) need your review` rather
  than under *Filled* — the confidence you declare decides which list a value appears in.
- `validate` **exits 1** while `author_consent` is `no`, printing
  `Not ready: 1 error(s) must be fixed before submitting.` and naming that field under
  `FAILED (1)`. Setting it to `yes` in `biorxiv.sub.txt` and re-running exits `0` with
  `Ready to submit: no blocking errors.` and
  `biorxiv.sub.txt passed validation for biorxiv; ready to submit.` That is the whole
  contract: a non-zero exit is a blocking problem, zero is ready.
- The warnings — six of them here — are advisory and do **not** change the exit code. The
  `0` run above still carries all five of the ones `validate` counts. Warnings never block.
- `subfile` writes **`biorxiv.sub.txt`**. The `grep` in the block is pointed at that name
  deliberately: pointed at `biorxiv.sub` it fails with `No such file or directory`, while
  `autofill` and `validate` given the same stale name resolve it and carry on.

*Observed values — paperpush 0.5.4, venue data 7af06f9, checked 2026-11-11. A mismatch is
drift to investigate, not a bug: bioRxiv changes its form, and the template tracks it.*

- `paperpush subfile biorxiv` reports `19 fields (11 required)`.
- The pre-populated defaults are `license: CC-BY-NC-ND` and `author_consent: no`.
- `autofill` reports `Filled 4 field(s)` — title, abstract, authors, manuscript_file — then
  `6 validation warning(s)`.
- `validate --show-errors-only` summarises
  `19 passed · 1 failed · 5 with warnings · 15 could not run · 16 need AI · 0 not implemented`,
  with 71 more listed as not applicable to this venue and these files. The counts move with
  the release, and the gap between `autofill`'s six warnings and `validate`'s five is the
  missing-`[validate]`-extra notice, which `validate` reports as a skipped check rather than
  as a check warning.
- `paperpush requirements biorxiv` reports guidelines read from the author guidelines on a
  dated snapshot and a `venue data: published …` stamp. Both are properties of the installed
  release, so they move with the release, not with today.
- The report header states `AI checks: off` and names the two ways to run them. Nothing in
  this block calls a model.

No network beyond the install: the generated manuscript cites no URLs and carries no
references, so `validate`'s link check has nothing to fetch, its DOI checks have nothing to
resolve, and the sensitive-information and guideline checks read local files only. That is
what makes this block runnable on a restricted host — and also why it does not exercise the
checks that need the network. Checking those needs a manuscript with real URLs and a real
bibliography, on a host that can reach them.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `error: unknown venue 'x'` | The slug is wrong. Run `paperpush venues` — the tool's own hint line says the same — and take the value from the *Slug* column. |
| `error: venue 'v' has no field 'f'` | The `id` is not in that venue's `.sub`. Read the generated file for the real names. |
| `ignored proposed field 'f': not a field in the <venue> template` | Same cause — the id does not exist for this venue and nothing was written. |
| `Looks like Playwright was just installed…` | The browser is missing. Run `playwright install chromium`. |
| `PDF checks skipped (hidden text / prompt injection): they need pdfminer.six` | The `validate` extra is not installed. `pip install 'paperpush[validate]'`. It is a warning, not an error, so a run without it still exits `0`. |
| `<file> does not look like a valid PDF (missing %PDF header)`, preceded on stderr by pypdf's own `invalid pdf header: b'…'` and `EOF marker not found`, four times each | The manuscript file is not a real PDF. The pypdf lines come first and name no field, so search for the paperpush message — it is the one that says which field is at fault. Both `autofill` and `validate` report it. Check the file before re-running. |
| `could not detect any pages in <file>` / `<file> is only N bytes; it may be empty` | Advisory warnings, not errors — the PDF parsed but looks truncated or blank. Confirm you pointed at the built manuscript, not a stub. |
| A value you proposed appears under *Left for you to set* | It is a `never` field. Working as designed — ask the author. |
| A value you proposed is missing entirely | It fell below `--min-confidence`, or its `value` was empty. |
| `validate` reports no reference problems and you expected some | Most likely the bibliography is not in the uploads — the reference checks read the files the `.sub` lists, not the directory. If the registry was unreachable, the DOI check is listed under *could not run* with the count it could not check, so look there before concluding the references are clean. `-v` prints the `Resolving N of N distinct DOI(s)` line if you want the detail. |
| The guideline checks warn that required section headings are missing from a manuscript that has them | Those checks read text extracted from the upload. A heading in a figure, an image-only PDF, or unusual typesetting will not be found. Warnings never block, so confirm by eye and move on. |
| `error: unknown venue 'x'` or `venue 'v' has no field 'f'` exits `2` | Usage errors exit `2` — including `paperpush --venues`, which is no longer a flag. A failed validation exits `1`, success exits `0`. Do not treat every non-zero exit as a validation failure. |

## What this does not do

It does not submit. It does not choose a venue, a licence, or a set of suggested
reviewers. And it does not relieve the author of reading the filled form before they press
submit — say so when you hand it back.

It *does* check the manuscript itself against the venue's recorded author guidelines and
the bibliography against the DOI registry, and both are advisory. Neither is a substitute
for the venue's own page: the guidelines are a dated snapshot carried by the installed
release, and a registry lookup that could not run tells you only that it could not run.

Nor does it do the parts of the current CLI this page leaves undocumented — reformatting or
converting a manuscript, choosing a venue, finding reviewers, recording a new venue's
wizard, or the browser-based editor. They exist; they are not described here, so read their
`--help` before driving them.
