---
name: paperpush
description: Fill a journal or preprint submission portal from a manuscript directory — choose a venue, generate its submission file, extract the field values from the paper, validate them, then hand a signed-in browser to the author for the final submit.
category: communication
license: BSD-2-Clause
author: Pachter Lab (adapted by Heureka Labs)
attribution: https://github.com/pachterlab/paperpush
version: 1.5.0
datasets: []
tags: [manuscript, preprint, submission, publishing]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-09-13
  against: paperpush 0.2.0 / pypdf 6.18.1 / pydantic 2.13.5 / Python 3.11.15
  executed: 9
  unverified: 1
  unverified_reason: >-
    The install block's `playwright install chromium` downloads a browser the validating
    environment does not fetch, so the browser half of the install is unrun; `login` and
    `submit` need that browser plus real portal credentials, which is why they are shown
    as plain output rather than runnable blocks. Re-run from a host that can download a
    Playwright browser and holds a test account on a venue. Separately, `validate`'s
    reference pass was exercised only as far as parsing — the DOIs were read out of a
    `.bib` and handed to the resolver, but doi.org was unreachable from the validating
    host, so no warning text for a mismatched or unregistered DOI was observed. Re-run
    from a host that can reach doi.org to confirm those messages.
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
for the journal portals listed by `paperpush --venues`.

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

Check the install and list the venues:

```bash
paperpush --version
paperpush --venues
```

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

This writes `biorxiv.sub`, a commented, line-based file with one entry per field. Read
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
`--dont-fill-defaults` to leave them empty instead (`--fill-defaults` is the default and
is there to say so explicitly), and `--force` to overwrite an existing `.sub`.

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

**File paths are relative to the manuscript directory** you pass with `-d`, not to your
working directory. Give `manuscript.pdf` and `figures/figure1.png`; the tool rewrites
them into the `.sub` relative to where the `.sub` lives.

## Step 4 — write the values into the submission file

```bash
paperpush autofill -d ./manuscript --engine manual --values values.json biorxiv.sub
```

`manual` is the default engine and is the one to use — you have already read the
manuscript, so a second extraction pass adds cost and a second chance to be wrong. If
the `.sub` does not exist yet, `autofill` creates it from the venue slug in the filename.

The command prints a four-part summary, plus a validation-warning section whenever the
run raises one. Read all four parts back to the author:

```
Filled 5 field(s):            written, high confidence, not a judgment call
4 field(s) need your review:  written, but medium confidence or a classification
Left for you to set (3):      refused by policy, or listed in your `unfilled`
N field(s) still need filling in before submit
```

Useful flags: `-o OUTPUT` writes elsewhere instead of overwriting the `.sub`,
`--min-confidence low|medium|high` refuses to write anything weaker, and `--dry-run`
reports the decisions without touching the file. The floor **defaults to `low`**, which
writes everything you propose — if you want the tool to hold back your guesses, you have
to ask for it. Every subcommand also takes `-v`/`-vv` and `-q`, or the `PAPERPUSH_LOG_LEVEL`
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
paperpush validate biorxiv.sub
```

Exits `0` when the file is ready and non-zero when it is not, printing each blocking
problem with its field name. Warnings are advisory and do not block.

Five passes run **by default**. The field check is the one that decides the exit code; the
other four only ever warn, and each of those has its own opt-out.

| pass | what it does | network | skip with |
|---|---|---|---|
| fields | required fields present, values legal for the venue | no | — (this is the exit code) |
| links | probes URLs cited in the uploads, including still-private repositories | yes | `--dont-check-links` |
| sensitive info | scans the uploads for API keys, passwords, private keys, GPS coordinates in figures, editable-document links and LaTeX source comments; nudges when no public repository is linked | no | `--dont-check-for-sensitive-info` |
| references | reads the bibliography — `.bib` uploads and the reference list in the manuscript itself — and resolves each DOI, warning when one is malformed, duplicated, unregistered, or registered to a different title, author or year | yes | `--dont-check-references` |
| manuscript | measures the uploads against the venue's own author guidelines | no | `--dont-check-manuscript` |

The last two are new in 0.2.0, and both change what a clean run means. Keep them on.

**The reference pass reads the uploads, not the directory.** It resolves DOIs found in the
files the `.sub` actually lists — `manuscript_file`, `supplementary_files`, and so on. A
`.bib` sitting in the manuscript directory that no field points at is never opened, and
nothing says so. If you want the bibliography checked, put it in the submission.

**And it fails silent.** When the DOI registry cannot be reached, every lookup is abandoned
at debug level and **no warning is printed** — a run against an unreachable doi.org is
indistinguishable from a clean bibliography, right down to the exit code. Verified on
2026-09-13 with a deliberately unregistered DOI, which passed without comment. So do not
report "references check out"; report that the check ran. `-v` prints the
`Resolving N of N distinct DOI(s)` line, which is the only evidence the pass did anything.

A typical first run:

```
warning: no GitHub repository link found in the manuscript files; if the paper has
         associated code, add a link to its public repository
08:17:55 WARNING paperpush.cli: validation failed for biorxiv: 1 error(s)
error: 1 problem(s) in biorxiv.sub must be fixed before submitting:
  - [author_consent] All authors consent to deposit and to the chosen license must be
    confirmed (set to yes)
```

That error is the author's to clear, not yours. Ask them. The timestamped `WARNING` line
is the logger restating the count on stderr; it carries nothing the `error:` block below it
does not, so read the `error:` block to the author and leave the log line out.

### What the venue actually requires

The manuscript pass measures the uploads against rules paperpush ships for each venue, and
`requirements` prints those same rules — so you can read what the submission will be judged
against before you build it, rather than discovering it from warnings afterwards.

```bash
paperpush requirements biorxiv
paperpush requirements nature --article-type "Matters Arising"
paperpush requirements nature --json
```

The summary names the guideline pages it was read from and the date it was read, then lists
the manuscript, figure and supplementary rules — accepted formats, size caps, word and
display-item limits, required section headings and declarations, and free-text notes for
everything that does not reduce to a number. Where a venue runs different rules for other
article types, the header lists them and `--article-type` switches to one — for Nature the
default research article allows 4,300 words and 6 display items, while `Matters Arising`
allows 1,200 and 2. `--json` prints the same content as data.

Spell that string the way the header spells it. An article type the venue has no overrides
for does **not** fail: it warns once and prints the default rules anyway, so a typo hands
you the wrong limits under the right heading. Exit status is `0` either way.

Two things about it are worth holding onto. It is **a recorded snapshot, not a live fetch** —
the header's date is when a human last read those pages, and a venue can change its
guidelines the day after. Treat a rule that matters as something to confirm on the venue's
own page, which the header links. And the manuscript pass is **advisory only**: every finding
is a warning, so a submission that breaks a stated word limit still exits `0`. Those warnings
are for the author to weigh, not for you to clear on their behalf — and a heading the tool
cannot find in a PDF is as likely to be an extraction miss as a missing section.

## Step 6 — hand it back

When `validate` passes, stop and report:

- the fields you filled, with the source for each,
- the fields flagged for review, and why each was flagged,
- the fields left for them to set, and what each is asking,
- the exact commands to finish.

```
paperpush login biorxiv     # if not already signed in
paperpush submit biorxiv.sub
```

`submit` re-runs validation first and refuses to open a browser if anything still fails.
It then opens the portal in a headed window, reuses a saved session or signs in with the
stored credentials, clicks through the wizard typing in the values from the `.sub` — and
**stops before the final submit**, leaving the window on the review page. Every venue
runner behaves this way. The author reviews the filled form in the portal and presses
submit themselves.

If a step breaks, the browser is left open at the point of failure so it can be finished
by hand. `--timeout SECONDS` raises the per-action limit (default 10s, `0` waits forever)
on a slow portal, and `--new-session` discards a saved session after an account switch.

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
grep -E '^(license|author_consent):' biorxiv.sub
paperpush autofill -d ./paper --engine manual --values values.json biorxiv.sub
paperpush validate biorxiv.sub; echo "validate exit: $?"
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
- `validate` **exits 1** while `author_consent` is `no`, and the error names that field.
  Setting it to `yes` in `biorxiv.sub` and re-running exits `0` with
  `biorxiv.sub passed validation for biorxiv; ready to submit.` That is the whole contract:
  a non-zero exit is a blocking problem, zero is ready.
- The one warning — no repository link found in the manuscript — is advisory and does **not**
  change the exit code. Warnings never block.

*Observed values — paperpush 0.2.0, checked 2026-09-13. A mismatch is drift to investigate,
not a bug: bioRxiv changes its form, and the template tracks it.*

- `paperpush subfile biorxiv` reports `19 fields (11 required)`.
- The pre-populated defaults are `license: CC-BY-NC-ND` and `author_consent: no`.
- `autofill` reports `Filled 4 field(s)` — title, abstract, authors, manuscript_file.
- `paperpush requirements biorxiv` reports guidelines `read from the author guidelines on
  2026-09-10` and accepted manuscript formats `.docx, .pdf`. That date is the snapshot the
  installed version carries, so it moves with the release, not with today.
- `validate`'s failing run prints a timestamped `WARNING paperpush.cli: validation failed
  for biorxiv: 1 error(s)` line on stderr ahead of the `error:` block.

No network beyond the install: the generated manuscript cites no URLs and carries no
references, so `validate`'s link probe has nothing to fetch, its reference pass has no DOI
to resolve, and the sensitive-information and manuscript passes read local files only. That
is what makes this block runnable on a restricted host — and also why it does not exercise
the two network passes. Checking those needs a manuscript with real URLs and a real
bibliography, on a host that can reach them.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `error: unknown venue 'x'` | The slug is wrong. Run `paperpush --venues` — the slug is the parenthesised name. |
| `error: venue 'v' has no field 'f'` | The `id` is not in that venue's `.sub`. Read the generated file for the real names. |
| `ignored proposed field 'f': not a field in the <venue> template` | Same cause — the id does not exist for this venue and nothing was written. |
| `Looks like Playwright was just installed…` | The browser is missing. Run `playwright install chromium`. |
| `<file> does not look like a valid PDF (missing %PDF header)`, preceded on stderr by pypdf's own `invalid pdf header: b'…'` and `EOF marker not found`, four times each | The manuscript file is not a real PDF. The pypdf lines come first and name no field, so search for the paperpush message — it is the one that says which field is at fault. Both `autofill` and `validate` report it. Check the file before re-running. |
| `could not detect any pages in <file>` / `<file> is only N bytes; it may be empty` | Advisory warnings, not errors — the PDF parsed but looks truncated or blank. Confirm you pointed at the built manuscript, not a stub. |
| A value you proposed appears under *Left for you to set* | It is a `never` field. Working as designed — ask the author. |
| A value you proposed is missing entirely | It fell below `--min-confidence`, or its `value` was empty. |
| `validate` reports no reference problems and you expected some | Either the bibliography is not in the uploads (the pass reads the files the `.sub` lists, not the directory), or doi.org was unreachable and every lookup was dropped silently. Re-run with `-v` and read the `Resolving N of N distinct DOI(s)` line: no line means nothing was read, `0 of 0` means nothing was found. |
| A pile of `no 'X' section heading found` warnings on a manuscript that has them | The manuscript pass reads text extracted from the upload. A heading in a figure, an image-only PDF, or unusual typesetting will not be found. Warnings never block, so confirm by eye and move on. |
| `error: unknown venue 'x'` or `venue 'v' has no field 'f'` exits `2` | Usage errors exit `2`, a failed validation exits `1`, success exits `0`. Do not treat every non-zero exit as a validation failure. |

## What this does not do

It does not submit. It does not choose a venue, a licence, or a set of suggested
reviewers. And it does not relieve the author of reading the filled form before they press
submit — say so when you hand it back.

It *does* now check the manuscript itself against the venue's recorded author guidelines
and the bibliography against the DOI registry — both added in 0.2.0, both advisory. Neither
is a substitute for the venue's own page: the guidelines are a dated snapshot, and the DOI
pass reports nothing at all when it cannot reach the registry.
