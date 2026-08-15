---
name: paperpush
description: Fill a journal or preprint submission portal from a manuscript directory — choose a venue, generate its submission file, extract the field values from the paper, validate them, then hand a signed-in browser to the author for the final submit.
category: communication
license: BSD-2-Clause
author: Pachter Lab (adapted by Heureka Labs)
attribution: https://github.com/pachterlab/paperpush
version: 1.0.0
try-it: pending
tags: [manuscript, preprint, submission, publishing]
allowed-tools: Read, Write, Edit, Bash
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
`CC-BY-NC-ND`, the most restrictive reuse option it offers, and `author_consent`
defaults to `no`. Use
`--dont-fill-defaults` to leave them empty instead, and `--force` to overwrite an
existing `.sub`.

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

The command prints a four-part summary. Read all four parts back to the author:

```
Filled 5 field(s):            written, high confidence, not a judgment call
4 field(s) need your review:  written, but medium confidence or a classification
Left for you to set (3):      refused by policy, or listed in your `unfilled`
N field(s) still need filling in before submit
```

Useful flags: `-o OUTPUT` writes elsewhere instead of overwriting the `.sub`,
`--min-confidence medium|high` refuses to write anything weaker, and `--dry-run` reports
the decisions without touching the file.

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
problem with its field name. Warnings are advisory and do not block. By default it also
probes the URLs cited in the manuscript for dead links (including repositories that are
still private) and scans the referenced files for material that should not be published —
API keys, passwords, private keys, GPS coordinates embedded in figures, links to editable
documents, and LaTeX source comments. Both passes are worth keeping on; skip them with
`--dont-check-links` and `--dont-check-for-sensitive-info` if the author asks.

A typical first run:

```
warning: no GitHub repository link found in the manuscript files; if the paper has
         associated code, add a link to its public repository
error: 1 problem(s) in biorxiv.sub must be fixed before submitting:
  - [author_consent] All authors consent to deposit and to the chosen license must be
    confirmed (set to yes)
```

That error is the author's to clear, not yours. Ask them.

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

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `error: unknown venue 'x'` | The slug is wrong. Run `paperpush --venues` — the slug is the parenthesised name. |
| `error: venue 'v' has no field 'f'` | The `id` is not in that venue's `.sub`. Read the generated file for the real names. |
| A field reported as `unknown` in the summary | Same cause — the id does not exist for this venue and nothing was written. |
| `Looks like Playwright was just installed…` | The browser is missing. Run `playwright install chromium`. |
| `invalid pdf header` / `EOF marker not found` | The manuscript file is not a real PDF, or is truncated. Check the file before re-running. |
| A value you proposed appears under *Left for you to set* | It is a `never` field. Working as designed — ask the author. |
| A value you proposed is missing entirely | It fell below `--min-confidence`, or its `value` was empty. |

## What this does not do

It does not submit. It does not choose a venue, a licence, or a set of suggested
reviewers. It does not check the manuscript against a journal's formatting or policy
requirements beyond the fields in the form. And it does not relieve the author of reading
the filled form before they press submit — say so when you hand it back.
