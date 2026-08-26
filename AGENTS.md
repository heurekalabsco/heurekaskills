# AGENTS.md

Guidance for AI agents working in this repository. Humans should start with
[README.md](README.md) and [CONTRIBUTING.md](CONTRIBUTING.md) — this file is the
operational version of both.

## What this repo is

The public source of truth for the skills published at
**[heurekaskills.com](https://heurekaskills.com)** — a library of agent skills for
scientific discovery: getting data, running models, analyzing results, communicating them,
and producing the documents funders require.

Content only. Skills, their schemas, and the validator that checks them. There is no
application code here, and none should be added.

Two consequences that shape everything below:

- **A skill becomes another agent's instructions.** Whatever you write here, some
  agent will later follow literally, including any code block. Wrong instructions are
  worse than no skill.
- **Every skill is reviewed by a scientist before it is published, and this history is
  public and permanent.** Assume a person reads every line, and that nothing you
  commit can be unpublished later.

## Layout

```
skills/<slug>/
  SKILL.md            # required — YAML frontmatter + instruction body
  references/*.md     # optional supporting material
schema/               # JSON Schema for registry.json and skill.json
scripts/validate.js   # the checks CI runs
NOTICE                # attribution for every adapted skill
```

## Commands

```bash
npm install
npm run validate        # format + public-tier boundary
npm run check-versions  # every changed skill carries a version bump
```

Both run on the PR, so run both before pushing. `check-versions` compares against
`origin/main` by default; pass a ref to compare against something else.

## Frontmatter contract

```yaml
---
name: <slug>                 # must equal the directory name; ^[a-z0-9-]+$
description: One single-line sentence — when should an agent use this skill?
category: data | models | analysis | utility | communication
license: <the licence that actually governs this text>
author: <name or org>
version: 1.0.0
tags: [a, b]                 # max 5, no duplicates
attribution: <source url>    # adapted skills only

# data skills — see "Making a data skill findable" below
covers: [liver, rna-seq, human]   # free-text search vocabulary; max 30
papers: [PMID:39607691]           # or doi:10.…; max 20
access: [open]                    # open | registered | controlled
platform: snovault                # optional; shared infrastructure
---
```

Traps that will fail CI or, worse, fail silently in a client:

- **Never quote `name` or `description`, and never use block scalars (`>` / `|`).**
  A line-based parser reads these fields, and CI checks that it and a real YAML parser
  return the same value. Quoting makes them diverge, so the check fails by design.
- **No `: ` inside an unquoted description.** YAML reads it as a nested mapping and the
  file stops parsing. Use an em dash instead.
- **Keep descriptions at or under 400 characters — CI enforces this.** A description is
  loaded for every installed skill in every session whether or not the skill is used, so
  it is a shared cost and not free space. Upstream descriptions routinely run past 1,000
  characters — rewrite them, don't paste. The long tail of search vocabulary belongs in
  `covers`, which costs nothing per session; don't stuff it in here.
- **Nested keys flatten into the top level.** The client's parser splits each line on its
  first colon and has no nesting model, so the children of a mapping land beside `name` and
  `description`. `verified:` does this harmlessly. A nested key *named* `name`,
  `description` or `allowed-tools` would overwrite what every client installs, so CI
  rejects it.
- Upstream frontmatter often carries junk: authoring metadata, platform-specific blocks,
  stale compatibility strings. Rebuild the frontmatter rather than patching theirs.
- **Reuse an existing tag before inventing one.** Tags are filter chips on the site, so a
  tag only your skill uses is a filter that returns exactly one result. Run
  `npm run validate` — it prints how many tags are used by a single skill — and check the
  live vocabulary before adding a synonym of one that already exists (`rna-seq` vs
  `rnaseq`, `structure-prediction` vs `protein-structure`). New vocabulary is fine when
  the subject is genuinely new; a fifth spelling of an existing idea is not.

### Versioning

`version` is `MAJOR.MINOR.PATCH`, it starts at `1.0.0`, and **it moves whenever anything the
reader receives changes.** That means `SKILL.md` *and* the `references/*.md` a skill ships
alongside it — those are published too, so an edit to one of them moves the version in
`SKILL.md` exactly as a body edit would. CI enforces it: `scripts/check-versions.js`
compares every file under a changed skill against the merge base and fails the PR if
anything moved and the number did not. It also fails the PR if the number went **backwards**,
whether or not anything else changed — a partial revert or a bad rebase takes a version back
one line at a time, and the check exists to notice. A version-only edit is not a content
change and needs no second bump.

- **Minor** — a revision round. New or rewritten sections, a corrected claim, a changed
  recommendation, a re-verification that moved the numbers. This is the common case, and it
  is what a drift sweep produces.
- **Patch** — a typo, a dead link, a formatting fix. Nothing that changes what the page
  tells a reader to do.
- **Major** — reserved. A skill that changes what it is about should be a new slug, not a
  `2.0.0`, because installers key on the name.

Bump once per publication, not once per commit: five commits on a branch that merge together
are one revision and one minor bump.

The reason to care is narrow and worth stating. Nobody reads this number for its own sake —
it is the only signal a reader or an installing client has that a page they already have
changed underneath them. A stale version tells them nothing changed when something did, and
that is indistinguishable from the truth until they diff it themselves.

This went wrong at scale before the check existed. Nineteen of forty-one skills had
accumulated content changes across as many as four separate publications with no bump
between them, and one had shipped with no `version` field at all. Not carelessness: the
routine that does most of the updating was told to refresh `verified:` on every skill it
touched and was never told about `version:`, so it did precisely what it was asked. A rule
that lives only in a contributor's memory decays to whoever happens to remember it, which is
why this one is a script.

### Categories

| category | for |
|---|---|
| `data` | getting information out of an external source — databases, atlases, APIs |
| `models` | running a trained model — protein language models, structure prediction, docking |
| `analysis` | processing, computing over, or evaluating data you already have |
| `utility` | file formats, methodology, general-purpose helpers |
| `communication` | conveying science to a person — figures, posters, plain-language summaries |
| `grants` | producing a document an agency requires, in the structure that agency mandates — data management plans, biosketches, facilities statements |

`communication` vs `utility`: a communication skill's output is read by a person; a
utility skill's output feeds another tool or workflow step.

`grants` vs both: the test is **who requires the document**. A **funding agency** requiring a
specific structure as a condition of applying for or holding an award is `grants`. A journal
portal, a conference form or a file converter is still `utility` — a publisher is not a funder.
A figure or summary a person reads to understand the science is still `communication`.


When both readings fit, ask **what the skill hands back at the end**:

| Skill | Hands back | Category |
|---|---|---|
| Graphical abstract for a paper | An SVG a reader looks at | `communication` |
| Plain-language summary of a result | Prose a non-specialist reads | `communication` |
| Filling a journal submission portal | A form field file the tool consumes | `utility` |
| Converting between file formats | A file the next step opens | `utility` |
| An NIH Data Management and Sharing plan | A document NIH requires to fund the work | `grants` |

The subject matter being publication-adjacent does not make it `communication`.
Submission, formatting and packaging are plumbing; the manuscript is the artefact a
person reads, and a skill that does not produce that artefact is `utility`.

### `grants` skills: one per agency, per document type

`nih-dms-plan`, `nih-biosketch`, `nsf-dmp` — never a single cross-agency `dms-plan`. The same
document has different required elements, limits and deadlines at each funder, and a skill that
straddles two is wrong for both. This is the `data` one-per-project rule applied to documents:
split on the thing that owns the requirements.

The agency's own template governs, and it is not always what the policy notice says. When they
disagree, follow the template — it is what gets submitted — and say so in the skill, with both
dated. A skill in this category ages on the agency's schedule, not ours, so date every claim
and name the notice it came from.

### `data` skills: one per project, one per repository

**A named project gets its own skill** — HuBMAP, GTEx, SenNet, DepMap — even one no longer
funded or collecting. **A generic repository gets one skill for the repository**, not one per
deposit: GEO, Zenodo, Dryad, PRIDE.

The test between them: *does it have an ongoing maintained access surface and its own
identity, or is it a deposit?* A Zenodo record is a deposit. HuBMAP is a project.

Split on the **project**, not on the infrastructure, even when two projects share it — 4DN
and SMaHT are both snovault and answer the same query grammar, HuBMAP and SenNet are both an
Elasticsearch passthrough, and each still gets its own skill. Shared infrastructure is an
implementation detail that can change under the skill, and nobody has ever gone looking for
"the snovault grammar" — they want HuBMAP data. Record the shared platform in `platform:` so
grammar drift can be swept across every skill using it; that is what the key is for.

The redundancy this creates is deliberate and it is the cheaper mistake. Merging two projects
into one skill makes it findable under one name and invisible under the other.

### Making a `data` skill findable

A skill's whole searchable surface on the site is `name`, `slug`, `description`, `tags` and
`category`, matched as *every term must appear somewhere*. **The body is not indexed.** So a
reader searching `liver rna-seq` reaches a project skill only if both words are in that
surface — and a description that spends its budget naming the project has nothing left.

That is what `covers:` is for. Free text, up to 30 terms — tissue, assay, organism, modality,
platform, whatever someone would actually type. It is indexed for search and is *not*
rendered as filter chips (that is `tags`, which stays at five and stays curated). It is also
not loaded into session context, so unlike `description` its length is free.

Write descriptions that name **both the source and what is in it**. "Query HuBMAP" is
findable only by people who already know to look for HuBMAP, which is not the person who
needed it.

**Write the words people type, not the category they belong to.** Learned by testing:
`cellxgene-census` was given `tissue` and `disease` as covers terms, and a search for
`liver rna-seq` then found nothing — `rna-seq` matched via `scRNA-seq`, `liver` matched
nothing. Nobody searches for "tissue". Name the actual tissues, assays and organisms.
Matching is substring, so no term expands into another.

`papers:` carries provenance — the paper defining the resource, and papers that used it.
Both `PMID:39607691` and `doi:10.…` are accepted, because deposits on Zenodo and Dryad have
a DOI and no PMID.

### `data` skills end in files on disk

Every `data` skill needs a `## Get the files` section, and CI enforces it. Retrieving the
data is the point of the category. The failure this prevents is real and tempting: the query
grammar is the interesting thing to write, and a skill that explains it beautifully and stops
at a printed result has not given the reader what they came for.

One carve-out, set out under *Document the platform; never operate inside it* below: where a
source's terms forbid removing the data at all, this section delivers a catalogue instead. Still
files on disk — just not the data.

`access:` states the route the skill documents — `open`, `registered`, `controlled`, or
several. This is the §3b access test made mechanical rather than a new rule: a `data` skill
whose only route is `controlled` has no lawful reader path and CI rejects it. Sources with
tiers list both, document the open one, and say plainly which side a reader's question sits
on — `alphafold` is `[open]`; a resource with an open summary tier and controlled
individual-level data is `[open, controlled]`.

### Controlled tiers: describe them, never promise them

Much of the most valuable biomedical data is individual-level human data behind an
application — dbGaP and the programs built on it. §3b says we do not ship a skill promising
data nobody can lawfully obtain. It does **not** rule out a skill answering *does a cohort
like this exist, and what would using it require* — a question whose answer is entirely open.

The distinction that makes this legitimate: **the access test asks what the skill instructs a
reader to do.** Querying a public study catalogue, reading terms, and reporting requirements
is open to anyone. The controlled tier is what such a skill *describes*, never what it *uses*.
So it declares `access: [open, controlled]` — and `[controlled]` alone stays rejected in any
category, because that is a skill that can deliver nothing. §3b is not about `data`: a `models`
skill documenting weights handed out case by case fails for the same reason.

**Declaring `controlled` requires a `## Requesting access` section.** CI enforces that the
section exists and is not empty — it cannot read what you wrote there, so the rest is on
review: who may apply, what the application asks for, what it costs in time, and where the
authoritative instructions live. Without it, a skill names a locked door and walks away.

The section has to be a real level-2 heading in `SKILL.md`. Showing `## Requesting access`
inside a code block, an HTML comment, or the frontmatter used to satisfy the check — all four
now fail, along with `## Try it` and `## Get the files` shown the same way.

Two things that decide whether such a skill is useful or a well-formatted trap:

- **Lead with what the data may be used for, not with how to get in.** The binding constraint
  is usually the consent under which subjects enrolled, not the application. A study consented
  for one disease is unusable for unrelated research *even after access is granted*. Surface
  that during triage, before the application is mentioned, or you send someone through a
  months-long process for data that cannot answer their question.
- **Assist with an application; never author one.** Draft a research use statement, checklist
  the requirements, explain what an institutional signing official is and why one is needed,
  state the renewal and cancellation timelines. **Do not fill in attestations** — IRB status,
  data security, non-re-identification. Those are legal claims published under a named
  person's name, and an agent that makes them easy to produce makes them easy to produce
  carelessly.

Say in the body that the skill cannot obtain access and does not promise it. And be explicit
in the `description` about what a reader actually gets: someone searching for a gated
resource's *data* will find a catalogue skill, and they should learn that before installing,
not after.

### Document the platform; never operate inside it

Some controlled resources are not a download at all — the data never leaves, and the analysis
happens on the provider's own platform. A skill may describe how to reach such a platform and
what access requires. **It must never drive an agent inside one.**

This is not caution, it is the terms. Repositories are adding clauses aimed squarely at tools
like ours as they respond to AI. The All of Us Data User Code of Conduct (V6, July 2026) is the
worked example:

> I will NOT use or provision research resource access, including access to any All of Us
> analytical platform, to any Artificial Intelligence (AI), AI-enabled, or other type of tool
> that could result in the export of participant-level data or other violations of the terms of
> this Code of Conduct.

A skill *is* an AI-enabled tool, and the same agreement makes the signatory personally liable
for "any external data, files, software, or other tools" used in conjunction with their
workspace. So publishing a skill that operates in there would hand every reader who installs it
a private liability they did not ask for — and they, not we, would carry it.

Three consequences for how such a skill is written:

- **`## Get the files` delivers a catalogue, not the data.** Where the terms forbid removing
  participant-level data, the section cannot deliver it — so it delivers the catalogue instead,
  as files on disk. That still satisfies *`data` skills end in files on disk* above; what the
  rule forbids is stopping at a printed result, not delivering something other than the data
  itself. Say which it is, in the `description`, before anyone installs.
- **Synthetic data has a direction.** Generating it *inside* from participant data and taking it
  out is prohibited outright — All of Us names synthetic data explicitly in both its
  no-removal and no-reproduction clauses. Generating it *outside*, against a published open
  schema, to develop code you then carry in, is a different act and a legitimate one: nothing is
  derived from participant data and nothing is exported.
- **Be honest about what a synthetic pass proves.** Public catalogues typically publish marginal
  counts, not joint distributions, so synthetic data built from them validates schema, concept
  ids, joins and whether the code runs — not the statistics. An analysis that depends on
  correlation structure will pass against synthetic data and still be wrong. And generate to the
  standard schema rather than tuning the generator to reproduce a real dataset's frequencies:
  dissemination terms commonly bar reproducing an available dataset "in part", and synthetic
  data is usually named in that clause.

## Documentation only — do not add scripts

Publishable file types: `.md` `.txt` `.json` `.yaml` `.yml` `.csv` `.tsv` `.bib`.
Caps: 50 files per skill, 1 MB per file, 5 MB per skill.

**A single disallowed file makes the entire skill uninstallable** — clients reject the
whole manifest, not just the offending file. The allowlist is enforced in the validator
here *and* independently in each client, so it cannot be widened from this repo alone.

So when a skill needs code, **inline it as a fenced code block in the body** and let the
agent write it into the project. This is deliberate: in a lab notebook, code the
researcher can read and keep beats a black box they cannot. Most upstream "scripts" are
argument parsers wrapped around a few library calls, which an agent writes correctly
from a clear description.

Do not add a `scripts/` directory to a skill, and do not reference one in the body.

## Writing the body

1. **Verify against live sources, not documentation, and run every code block** —
   including its error paths — before proposing it. Endpoints migrate, response shapes
   are not what the docs claim, model versions move on. A skill that ships a broken
   snippet is worse than no skill, because the agent will run it.
2. **Write in your own words.** Do not reproduce an upstream manual. Permissive
   licensing allows reuse, but a copied manual is bad content regardless.
3. **Do not reference skills that are not in this registry.** "See the `foo` skill" is a
   dead end that sends an agent hunting for something that does not exist. CI checks both
   forms — "see/use/refer to the … skill", and every name bulleted under a "Related
   skills" heading — across `SKILL.md` and `references/*.md`. A **library** is not a
   skill: naming statsmodels under that heading reads as a registry skill that does not
   exist, so mention tools in prose instead. **Write skill names in backticks.** A bare
   word is left alone, because "the router will see the same skill twice" is English, not
   a reference — so `` `foo` `` is what CI can actually check.
4. **Strip the origin's branding, keep the subject matter.** An adapted skill credits its
   source in `author`, `attribution`, and `NOTICE` — not in the prose. Naming the tools
   being documented is correct and expected; carrying another vendor's authorship or
   house style is not.
5. **Do not route work through third-party AI services.** Prefer something local and
   editable — a Mermaid diagram stays readable as text; a generated image does not.

## `## Try it` — every skill must be testable

A skill is a claim that a tool works a certain way. `## Try it` is what lets anyone — a
reader, or the nightshift — check whether that claim still holds. Required on every new
skill, and on any existing skill you touch.

**It is maintained, not written once.** Datasets decay independently of the tool: URLs 404,
accessions get withdrawn, hosts add a login. That is the same class of decay as an upstream
API change and is treated the same way — `npm run check-datasets` probes every declared
dataset in the registry, the nightshift runs it before choosing a target, and CI runs it
nightly besides. A dead dataset is drift, and it becomes work.

**Declare the dataset in frontmatter, not just in prose:**

```yaml
datasets: [https://alphafold.ebi.ac.uk/api/prediction/P04637]
```

The checker reads that key and never parses the body — which is what keeps the cost flat as
the registry grows. Prose still needs to say what the dataset *is*, what licence it carries,
and when it was last confirmed reachable; frontmatter is what a machine sweeps.

**A skill awaiting backfill declares `try-it: pending`** in its own frontmatter. That marker
is the only exemption from the rule above, and it lives in the skill rather than in a central
list on purpose: the nightshift publishes one skill's files at a time, so an exemption stored
anywhere else makes backfilling a two-file change it cannot make — which deadlocked the whole
queue until 2026-08-15. Backfilling is now: delete the marker, add the section, declare the
data. One file. A new skill may not use the marker.

Entries must be `https://` URLs. If your `Try it` generates its data inline and there is
nothing to fetch, say so explicitly with an empty list — `datasets: []` — rather than
omitting the key. `npm run validate` enforces all of this on every PR, so a malformed entry
fails there rather than going quiet until the nightly check.

`skills/alphafold/SKILL.md` is the worked example. Three parts, in this order:

**Data.** A named, citable, public dataset, with its licence and the fact that no account
is needed. Prefer real data over synthetic: real data is what catches the schema change
that breaks the skill. If no lawful public dataset exists — the §3b access test applies to
data exactly as it does to tools — generate it inline instead, and say why you had to.
Never `example.com`, never `path/to/your.bam`. A placeholder is not testable.

**And the same rule going the other way — what the skill hands back is a deliverable, not a
worksheet.** Never emit text the reader has to find and delete: no instructions to the user, no
`[fill this in]`, no "delete the text in italics", no inline notes, no commentary interleaved
with the artefact. Where upstream ships a template with its guidance baked in, strip it —
carrying it through is not fidelity, it is homework.

What the reader needs to know *about* the output goes in a **separate summary**: what the skill
**proposed** and on what basis, what it **inferred** and from where, what it **decided** on the
reader's behalf, and what it left **outstanding** and why. A paragraph when the output is small,
a companion file when it is not.

A field the skill declines to answer is left genuinely blank — an unticked box, an empty cell —
and named in the summary. Blank plus a summary line is honest. Blank plus silence is a gap the
reader will not notice, and a bracketed placeholder is the worksheet problem again.

The summary is the point, not a courtesy: it is the tl;dr, and it is where a reader corrects
something the skill misread. That turns a single shot the reader has to clean up into an
exchange they can steer.

**Run.** One self-contained block that goes from the data to a result, runnable by copy
and paste with nothing else set up. Where the tool has a trap, route the example through
it — the AlphaFold example matches the record by `entryId` precisely because the endpoint
returns a *list*, treating it as a dict is the usual mistake, and taking `records[0]` is the
subtler one: above 2700 residues that index silently returns a different, shorter protein.

**Expect.** What makes this a test rather than a demo. Two kinds, and both matter:

- **Invariants** — true regardless of version, so a failure means the skill is *wrong*.
  One pLDDT per residue; the recomputed mean matching the API's own figure.
- **Observed values, dated and version-stamped** — these move when upstream rebuilds, so a
  mismatch means *drift to investigate*, not a bug.

Keeping those apart is the whole point. Collapse them and every upstream release reads as
a failure, and the section gets ignored within a month.

**Containers are fine; privilege escalation is not.** A container runtime is an ordinary
reader requirement — disclose it like an API key or a GPU. But `validate.js` rejects
`--privileged`, mounting `/var/run/docker.sock`, mounting the host root filesystem, and piping
a download into a shell, anywhere in a skill. Those are host root or unreviewed remote code,
and an agent will run them without pausing. Skills still ship documentation only: an inline
build command is fine, a `Dockerfile` shipped as a file is not.

**State your coverage.** Every skill declares `verified:` — the date, the versions, how many
runnable blocks you executed, how many you did not, and why not. The floor is 50% of runnable
blocks, and an unverified count needs a reason naming what would unblock it. Narrative
fragments that cannot run standalone count neither way; the number is about blocks a reader
could actually execute. `biopython` is the worked example, at 84 executed against 43
unverified. Skills predating the rule carry `verified: pending`.

**One example is not a test — run the technique across several.** `## Try it` proves the skill
works on the study you chose. It does not prove the *method* generalises, and that is the claim
a reader relies on. Before shipping, apply the skill's own approach to a handful of other
records — different instrument, different organism, oldest and newest identifiers — and see
where it breaks.

This is not theoretical. `metabolights` was written and verified against three studies and
passed everything. Run against fifteen, its file-reading function turned out to return **12 of
84 samples** for a study with three metabolite files, because it read the first and mentioned
the others in a printed note. It would have shipped, looked right, and quietly handed readers
one seventh of a dataset. The same pass also found that a repeated file type can appear four
times rather than twice, and that `401` means *embargoed*, not *your credentials are wrong*.

Budget ten minutes for it. Pick records that differ along the axes the source actually varies
on, and prefer the awkward ones — the largest, the oldest, the one with two assays. When the
method does hold everywhere, say so in the PR with the sample you tried; when it does not, the
fix belongs in the skill and the counter-example belongs in `## Try it` as an assertion, so
nobody re-introduces the simplification later.

**Run it before you ship it.** The block goes in the skill only after it has executed
verbatim and produced the output written under Expect. This is `## 7` applied to the one
block a reader is most likely to run first.

## Licensing

Two separate questions. Conflating them has already produced wrong answers on the issue
tracker — twice — so ask them in order.

### 1. Whose text is this? — what goes in `license`

`license` describes **the text in the file**, not the tool the text is about.

A skill written here from scratch is `CC-BY-4.0`, credited to whoever wrote it —
`author: Heureka Labs`, or a contributor by name, as `pathway-cca-coessentiality` is.
That holds even when its entire subject is somebody else's database or program:
`alphafold` documents an EMBL-EBI database and `autodock-vina` documents a program we did
not write, and both are original skills.

**Adapted** means you reused the upstream's **expression** — not only its sentences, but
its structure, its worked examples, its selection and ordering of what matters. Rewording
an upstream manual is still adapting it; `paperpush` was written here against the released
tool and is *still* adapted, because what it documents came from that project. Two
tests, in this order:

- **Facts and interfaces are not expression.** Endpoint names, parameters, return shapes,
  version numbers, what a flag does — reading those off a tool and writing them up is
  original work. That is the usual case.
- **If you cannot tell which you produced, it is adapted.** Set the source's licence and
  add the `NOTICE` entry. Where the call is genuinely close and the answer changes what
  ships, leave it to a human.

Where text *is* adapted, its licence must be **positively identified** and **permissive**
(MIT, BSD, Apache-2.0, CC-BY-4.0, or equivalent). Rejected, without exception:

- Unknown, missing, or ambiguous licence. If the original author did not know, we don't either.
- Share-alike (CC-BY-SA, GPL) — it would force its terms onto the registry. A dual
  expression is fine when a permissive branch exists: `MIT OR GPL-3.0` is accepted and
  taken under MIT, because nothing here inherits the GPL terms. `MIT AND GPL-3.0` is not.
- Non-commercial (CC-BY-NC).
- Content credited to an individual contributor rather than the publishing project,
  unless that project demonstrably holds an assignment or CLA. A repository LICENSE file
  does not prove the repository owner had the right to grant it.

**Never relicense adapted content.** Set `license` to the licence that actually governs
the text being redistributed. Do not relabel it CC-BY-4.0 just because that is this
repo's default for original content — claiming a licence we do not hold creates exactly
the problem the gate exists to prevent. Every adapted skill also needs an entry in
`NOTICE`.

These four rejections are about text we would republish. None of them is a reason to
refuse to *document* a tool — that question is the next one.

Two things hold whichever way the skill was written. The frontmatter `license` must always
be one CI permits, original or adapted — `scripts/validate.js` checks every skill, not
only adapted ones. And **never paste upstream code into a body.** Inlined blocks are how
this registry ships code (see *Documentation only*), so a copied script carries its
source's licence into a file stamped with ours. Write the snippet yourself.

### 2. Can the reader run it? — the access test

A skill nobody can run is not a skill, and a registry of them is worse than a smaller one
that works. This gate is about the tool, and it decides whether documenting it is worth
doing at all.

**Ship it, and state what the reader must obtain before the first code block that runs the
tool.** A free or paid API key, an account, a click-through licence, a GPU — all fine,
because any reader can get one. `boltz2-nim` states its NGC key requirement before the
first call. Install commands do not count as that block; the rule is about not letting
someone reach the point of running something before they learn they cannot.

Plenty of skills need nothing at all — `alphafold` reads an open endpoint,
`graphical-abstract` documents a method. Nothing to obtain is the easiest pass, not a gap.

**Do not ship it** when no reader has a lawful route to running it:

- **Non-commercial terms on the tool.** Share-alike restricts redistribution, and the code
  in these bodies is ours — documenting a GPL tool is fine, which is why `autodock-vina`
  routes to two GPL-2.0 engines. Non-commercial restricts *use*, and getting an agent to
  use the tool is the whole function of a skill. Much of this registry's audience works
  commercially, so publishing one would route them into terms they cannot meet. Settled.
- **No licence at all** — no `LICENSE`, no terms page, nothing stated. Silence grants
  nothing, which is stricter than the non-commercial case, not looser. Upstream can fix
  this, so it parks rather than closes.
- **Access granted case by case** — committee approval, an institutional agreement, "email
  us for the weights". We cannot promise a reader a door somebody else opens. Settled
  unless the gate is advertised as open to anyone who asks.
- **No public install path, or a dependency that is not released yet.** Parks.

Judge the *paths*, not the tool, and ask whether **one** reader can lawfully take one.
A restricted option alongside usable ones is a disclosure; a restriction on the only path
is a reject. Free-for-academics with commercial terms by negotiation is the common hard
case: it ships, because the academic route is real and open — say plainly who each route
is for. Where a gated tool has an open equivalent, document the equivalent.

**A path carries its dependencies' terms, not just the tool's.** The cases above say "on the
tool", which reads as though a permissive `LICENSE` on the repo settles it. It does not: a
reader runs the whole path, so the binding constraint is whatever the path actually requires.
BindCraft is the worked example — MIT, and its standard build needs PyRosetta, which is not
OSI-licensed and needs a paid licence for commercial use. The tool is clean and the path is
not. Its `--no-pyrosetta` build substitutes open components, which is what makes this a
disclosure rather than a reject, and is the path to lead with.

Two practical notes. **Check the dependency's own distribution, not the parent's reputation** —
`pyrosetta` is absent from public PyPI and `pyrosetta-installer` ships under `Rosetta Software
License`, which is the fact that settles it. And **an organisation name is not a licence**:
`RosettaCommons` publishes `foundry` and `RFdiffusion` under BSD-3-Clause while core Rosetta and
PyRosetta are not OSI-licensed at all, so confirming one repo and generalising across the org
gets the answer backwards.

Where upstream states the limitation itself, **quote upstream**. FreeBindCraft's README says a
licence is required for commercial use; citing that is better than asserting the same
conclusion in our own voice in a repo whose history is permanent.

Record the finding on the issue either way, with the link that proves it. Settled cases
get `blocked`; re-checkable ones get `needs-info`, stay open, and **name what would
unblock them** — "when a LICENSE lands", "when the package ships" — so a later pass tests
that instead of repeating the search. A rejection nobody wrote down gets investigated
again next pass.

## Pull requests

- **Always a PR. Never push to `main`.** CI validates on the PR; a maintainer reviews
  and merges. Merged changes publish automatically — there is no manual publish step, so
  a bad merge is live within minutes.
- **`git fetch` before comparing against `main`.** A stale local ref has already caused a
  duplicated fix and a merge conflict. Compare against `origin/main`.
- **Commit messages are as public as the files** and are permanent. Keep them factual and
  about the content.
- **Everything you write here is world-readable — PR titles and bodies, issue comments,
  and review threads, not just files.** Heureka Labs' other repositories are private. In
  anything published here, do not name them, link to them, or quote what is inside them:
  PR and issue numbers, file paths, line numbers, branch names, commit SHAs, hostnames,
  or pasted logs and screenshots containing any of those. Say "the Bench client", "the
  registry site", or "the submission service" instead.

  This covers the private *repositories*, not the products. The public names — **Heureka
  Bench**, **ARC**, **heurekaskills.com** — are used deliberately in `README.md` and in
  the issue templates, and telling a user where to install a skill is the whole point.
  Keep writing them.

  Editing a body afterwards does not undo it — GitHub keeps the edit history visible.
- Do not add AI co-authorship trailers to commits. One commit on `main`, `49762ff`,
  carries one and a session URL; it predates this rule and cannot be edited out without
  rewriting history. It is the exception, not the pattern to copy.
- Group changes into logical commits — the history is a public artifact.
