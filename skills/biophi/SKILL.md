---
name: biophi
description: Humanise murine antibody variable domains with BioPhi's Sapiens model and score humanness as OASis identity — covers the bioconda-only install, the 21 GiB peptide database and the lighter route around it.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [antibody, humanization, protein-language-model, protein-engineering]
papers: [PMID:35133949, PMID:15136729]
covers: [antibody humanization, humanisation, murine antibody, mouse antibody, chimeric antibody, Sapiens, OASis, humanness, immunogenicity, anti-drug antibody, antibody language model, variable domain, VH, VL, Fab, nanobody, VHH, CDR grafting, back-mutation, germline, therapeutic antibody, biologics, Observed Antibody Space, 9-mer peptide, Kabat, framework, OKT3, teplizumab]
datasets: ["https://data.rcsb.org/rest/v1/core/polymer_entity/1SY6/1", "https://data.rcsb.org/rest/v1/core/polymer_entity/1SY6/2", "https://zenodo.org/records/5164685/files/OASis_9mers_v1.db.gz"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: BioPhi 1.0.11 (bioconda noarch, uploaded 2025-05-13) with sapiens 1.1.0, abnumber 0.3.2, ANARCI and HMMER 3.4 from the same environment, sqlalchemy 1.4.54, transformers 5.20.2, torch 2.14.1, pandas 2.1.4, biopython 1.88 and Python 3.12.15 on macOS arm64, CPU only. Sapiens weights pulled from the Hugging Face repositories prihodad/biophi-sapiens1-vh (revision 2caf2a8) and -vl (revision 4bb31b6). promb 1.0.2 from PyPI. Sequences from RCSB PDB entries 1SY6, 1N8Z, 1MEL and 1IGT, fetched 2026-10-20.
  executed: 9
  unverified: 3
  unverified_reason: The three blocks that download or read the full OASis peptide database were not run. The file is a 6.04 GiB download that expands to 21.5 GiB, and this host saw about 11 kB/s from the Zenodo record on 2026-10-20 and 73-259 kB/s on ranged GETs on 2026-10-21 - hours at best, days at worst. The schema and both sizes quoted here were read out of the first 10 MB of that same file, and the identity figures were reproduced against the precomputed 10%-subject peptide set in promb, which is a close proxy for a full-database run at 10% and not the same lookup. Re-run those three blocks from a host with real bandwidth to the Zenodo record and 22 GB of free disk.
---

# Humanising antibodies and scoring humanness with BioPhi

A mouse antibody that binds its target beautifully is still a foreign protein, and a
patient's immune system will usually say so. Humanisation is the step that keeps the
binding and replaces as much of the rest as possible with sequence a human immune system
reads as its own. BioPhi does two things here, and they answer different questions:

- **Sapiens** proposes the mutations. It is a BERT-style language model trained on human
  antibody repertoires; it scores every position of a variable domain in one pass and
  returns, for each, the residue a human antibody would most likely carry there.
- **OASis** scores the result. It chops a variable domain into overlapping 9-mers and
  asks, for each one, in how many human donors that exact peptide has been observed.

Neither answers whether the humanised antibody still binds. That is a wet-lab question,
and nothing on this page predicts it.

## What you need

BioPhi is MIT (Merck Sharp & Dohme) and runs on CPU. There is no key, no account and no
licence to accept. Three practical facts decide how you install it:

- **It is not on PyPI.** `pip install biophi` 404s. The package is bioconda-only —
  `biophi 1.0.11`, a `noarch` build uploaded 2025-05-13. Bioconda's container mirror at
  `quay.io/biocontainers/biophi` is a release behind: checked 2026-10-20, its newest active
  tag is `1.0.10--pyhdfd78af_2`, pushed the day before 1.0.11 went to conda. Use conda if
  you want the current version.
- **`hmmscan` has to be on `PATH`.** BioPhi numbers chains through `abnumber`, which calls
  ANARCI, which shells out to HMMER by bare name. Calling the environment's `biophi`
  binary by absolute path without activating the environment fails deep inside a
  `subprocess` call with `FileNotFoundError: [Errno 2] No such file or directory:
  'hmmscan'`. Activate the environment.
- **Sapiens fetches its weights on first use.** Two Hugging Face repositories,
  `prihodad/biophi-sapiens1-vh` and `-vl`, each a 2.2 MB `model.safetensors`, plus a
  tokenizer repository of a few kilobytes. All three are tagged MIT, are public, and need
  no token — the `HF_TOKEN` line in the output is a rate-limit notice, not a requirement.
  Note the licence on the weights is declared separately from the licence on the code, and
  both say MIT.

**OASis is the expensive half, and it is a separate decision.** Scoring humanness against
the full peptide database means a 6.04 GiB download that expands to 21.5 GiB on disk. That
is disclosed here before the first block that needs it, and *Scoring humanness without the
database* below gives the route that avoids it.

### Install

```bash
conda create -y -p ./env -c conda-forge -c bioconda biophi=1.0.11
eval "$(conda shell.bash hook)"
conda activate ./env
biophi --help
```

Three subcommands: `sapiens` (humanise), `oasis` (score humanness) and `web` (a local
server). No root needed anywhere on this page.

### The hosted server has no API

A university-hosted instance runs at `biophi.dichlab.org` and it is a form-driven web
application only. Probed 2026-10-20: `/` answers 200, and `/api`, `/docs` and
`/openapi.json` all answer 404. There is nothing to call, so an agent gets no use out of
it — everything below is the local route.

You can run the same interface yourself:

```bash
biophi web --port 5099
```

`--host` defaults to `localhost` and `--port` to **5001**, not the 5000 the project's
container example maps. It prints a banner saying it is the simplified server — no Celery
queue, no Redis — and runs Flask's development server. **Do not expose it**, and the
reason is specific rather than general caution: the command calls
`app.run(debug=True, …)`, so the Werkzeug interactive debugger is on. Its console is gated
only by a PIN that the server prints in its own output, which is a speed bump rather than
access control: bound to anything other than a loopback address, the debugger lets anyone
who can reach the port and get that PIN run arbitrary code on the host. Leave `--host` at
its default.

Verified to serve 200 at `/` with no OASis database present; what goes blank without the
database is the humanness half of the report. The paths under `/` are not a stable
interface: treat the UI as a UI and drive the CLI from code.

## Humanising a variable domain

Input is a FASTA of variable domains. **Pair a heavy and a light chain by giving them the
same ID with a `_VH` and `_VL` suffix** — BioPhi strips the suffix and reports the pair as
one antibody. `_HC` and `_LC` work too. Unpaired chains are processed, with a warning, as
separate antibodies.

```bash
cat > okt3.fa <<'FASTA'
>OKT3_VH
QVQLQQSGAELARPGASVKMSCKASGYTFTRYTMHWVKQRPGQGLEWIGYINPSRGYTNYNQKFKDKATLTTDKSSSTAYMQLSSLTSEDSAVYYCARYYDDHYCLDYWGQGTTLTVSS
>OKT3_VL
QIVLTQSPAIMSASPGEKVTMTCSASSSVSYMNWYQQKSGTSPKRWIYDTSKLASGVPAHFRGSGSGTSYSLTISGMEAEDAATYYCQQWSSNPFTFGSGTKLEIN
FASTA

biophi sapiens okt3.fa --fasta-only --output humanized.fa
```

That is the murine anti-CD3 antibody OKT3, which is as canonical a humanisation target as
exists — its clinical descendants are humanised versions of it. One iteration takes a few
seconds per chain on CPU and produces:

```
>OKT3_VH VH Sapiens 1iter parental Kabat CDRs
QVQLVQSGAEVKKPGASVKVSCKASGYTFTRYTMHWVRQAPGQGLEWMGYINPSRGYTNYNQKFKDRVTLTTDTSSSTAYMELSSLTSEDTAVYYCARYYDDHYCLDYWGQGTLVTVSS
>OKT3_VL VL Sapiens 1iter parental Kabat CDRs
EIVLTQSPAILSLSPGEKVTLTCSASSSVSYMNWYQQKPGTAPKLLIYDTSKLASGVPARFSGSGSGTDFSLTISGLQAEDAATYYCQQWSSNPFTFGQGTKLEIK
```

### What Sapiens does and does not change

**It substitutes; it never inserts or deletes.** The humanised domain is the same length as
the parental one, position for position, which is what makes the two directly comparable
and makes a diff meaningful.

**The parental CDRs are grafted back by default.** Sapiens predicts over the whole domain,
including the loops, and then the CDRs you started with are written back over the
prediction unless you pass `--humanize-cdrs`. So the default output carries human
framework and mouse CDRs — the thing you wanted — and the CDRs are byte-identical to the
input. `--humanize-cdrs` is a different and much riskier request: it is the binding site.

**The CDR definition sets what is protected**, and `--cdr-definition` defaults to `kabat`.
The definitions disagree by several residues: on trastuzumab's heavy chain, CDR-H2 is 17
residues under Kabat, 8 under IMGT and 6 under Chothia. So the definition decides which
residues Sapiens is allowed to touch, and a narrower one hands it more of the loop. The
`antibody-numbering` skill covers how far the schemes diverge; the short version is that
`--scheme` and `--cdr-definition` are part of the result and belong in whatever you record.

**More iterations converge quickly.** Each iteration re-runs the model on its own previous
output. On OKT3's VH, measured 2026-10-20: 1 iteration gives 15 mutations, 2 gives 17, and
3 gives the same sequence as 2. Two is usually where it stops moving.

### Driving it from Python

The CLI covers bulk work; the Python API is what you want when you need the per-position
scores or the alignment.

```python
from abnumber import Chain
from biophi.humanization.methods.humanization import (
    SapiensHumanizationParams, humanize_chain,
)

VH = ("QVQLQQSGAELARPGASVKMSCKASGYTFTRYTMHWVKQRPGQGLEWIGYINPSRGYTNYNQKFKDKATLTTDKS"
      "SSTAYMQLSSLTSEDSAVYYCARYYDDHYCLDYWGQGTTLTVSS")

chain = Chain(VH, scheme="kabat", cdr_definition="kabat", name="OKT3_VH")
h = humanize_chain(chain, params=SapiensHumanizationParams(
    scheme="kabat", cdr_definition="kabat", iterations=1))

print(h.num_mutations())
print(h.alignment.format())
print(h.to_score_dataframe().shape)
```

`to_score_dataframe()` is one row per position and one column per amino acid, 20 columns
wide — the model's probability for every residue at every position, which is what you read
when you want to know *how confident* a proposed mutation was rather than just that it was
made. `h.scores` and `h.next_scores` hold the same numbers keyed by numbering position, the
first predicted from the parental sequence and the second from the humanised one, so
`next_scores` is where a second round of mutations would come from.

`alignment.format()` prints four lines: parental, an identity line (`|` identical, `+`
similar, `.` different), humanised, and a region line. In the region line `^` marks CDR
positions, and `°` marks Vernier positions — but **`°` appears only under the Kabat CDR
definition**, because that is the only definition `abnumber` carries Vernier positions for.
Under any other definition the region line still prints, carrying `^` alone.

**`humanize_chain` asserts that the chain's CDR definition matches the parameters'.** Build
a `Chain(seq, scheme="imgt")` and hand it `SapiensHumanizationParams(cdr_definition="kabat")`
and you get `AssertionError: Expected chain with kabat CDR definition, got imgt`. Set both
or neither.

### CDR grafting, as the alternative method

BioPhi also implements classical CDR grafting — put your CDRs onto the closest human
germline framework and back-mutate the Vernier positions. It is exposed in the Python API
and in the web UI, but **not** in the CLI.

```python
from biophi.humanization.methods.humanization import CDRGraftingHumanizationParams

g = humanize_chain(chain, params=CDRGraftingHumanizationParams(
    scheme="kabat", cdr_definition="kabat"))
print(g.num_mutations(), g.humanized_chain.seq)
```

`heavy_v_germline` and `light_v_germline` default to `'auto'`, which picks the nearest
human germline; `backmutate_vernier` defaults to `True` here and `False` on the Sapiens
path. On OKT3's VH this gives 13 mutations against Sapiens' 15 — a different set, not a
subset. Running both and comparing is cheap and worth doing: where they agree you have two
independent votes for the same substitution.

### Nanobodies go through, and lose their hallmarks

A camelid VHH parses as a heavy chain and humanises without complaint, which is the
problem. Sapiens' heavy model is trained on human VH, and human VH sits in a VH–VL pair,
so the model proposes the residues that would be there if a light chain were coming.

Measured on the VHH of RCSB PDB entry `1MEL`, 2026-10-20: 14 mutations, among them Kabat
F37→V, E44→G and R45→L. Those are three of the four VHH hallmark positions — the
substitutions that distinguish a single-domain antibody from a VH that expects a partner,
and the reason the domain is soluble on its own. Nothing in the output flags it.

So if you humanise a nanobody with this, diff the framework-2 positions yourself and
decide deliberately which hallmarks to keep. The `immunebuilder` skill models VHH
structures if you want to look at what moved.

## Scoring humanness with OASis

OASis asks a concrete question: of the overlapping 9-mers in this variable domain, what
fraction appear in at least *X*% of human donors in the Observed Antibody Space? That
fraction is the **OASis identity**. A domain of *n* residues yields *n* − 8 peptides, so
the denominator is fixed by the sequence and the number is a plain proportion.

`--min-percent-subjects` is the *X*, it must be between 1 and 90, and BioPhi names four
conventional settings: `loose` 1%, `relaxed` 10%, `medium` 50%, `strict` 90%. **10% is the
default and it is also hard-coded** on the `biophi sapiens` path — the `--oasis-db` option
there scores at 10% whatever you do. Only `biophi oasis` lets you move the threshold. An
identity is meaningless without its threshold attached; record both.

### The database

The peptide database is a separate download, published on Zenodo under **CC-BY-4.0** as
record 5164685 (DOI 10.5281/zenodo.5164685, v1, 2021-08-05). It is open — no account, no
click-through. Measured 2026-10-20:

| | |
|---|---|
| download | `OASis_9mers_v1.db.gz`, 6,484,781,782 bytes (6.04 GiB) — the record publishes md5 `28fa18135b3ef1710970f72b5953cbc5`, so check it |
| on disk | 23,114,940,416 bytes (21.5 GiB), computed from the database's own header — 5,643,296 SQLite pages of 4 KiB |
| content | 9-mers from 118 million human antibody sequences, per the record's description |

```bash
curl -L -o OASis_9mers_v1.db.gz \
  https://zenodo.org/records/5164685/files/OASis_9mers_v1.db.gz
gunzip OASis_9mers_v1.db.gz
```

Allow for a long transfer, and do not plan around a single measurement. The same record
delivered about 11 kB/s to the host this page was written on (2026-10-20, sustained
fetch), and 73–259 kB/s to the same host on ranged GETs the next day — so hours at best
and days at worst, from one place on two days. Whether that is the record or the route is
not something a reader can tell from outside, so budget for it and resume rather than
restart. `curl -C -` resumes a partial file.

The CLI takes the database as `--oasis-db`. The **web interface and the container route
read it from the environment instead**, as `OASIS_DB_PATH`; unset, the server still
starts and the humanness half of the report is simply unavailable, which it says on the
front page.

It is a plain SQLite database with two tables, and knowing the shape saves guessing:

```sql
CREATE TABLE peptides (peptide TEXT, subject BIGINT, count BIGINT);
CREATE TABLE subjects (
  id BIGINT, "Subject" TEXT, "HeavySeqs" BIGINT, "LightSeqs" BIGINT,
  "CompleteHeavySeqs" BIGINT, "CompleteLightSeqs" BIGINT, "StudyPath" TEXT,
  "Author" TEXT, "Link" TEXT, "Year" BIGINT, "Age" TEXT, "Disease" TEXT,
  "Vaccine" TEXT, "Isotype" TEXT, "BType" TEXT, "BSource" TEXT, "Processed" TEXT
);
```

Two things in the query BioPhi builds over those tables are worth knowing, because they
mean you cannot reproduce an OASis identity with a naive `SELECT COUNT(*)`. The donor pool
is restricted to subjects with at least 10,000 complete sequences **of the matching chain
type**, so a heavy chain and a light chain are scored against different denominators; and
the study `Corcoran_2016` is excluded outright.

### Running it

```bash
biophi oasis okt3.fa \
  --oasis-db OASis_9mers_v1.db \
  --min-percent-subjects 10 \
  --output oasis.xlsx
```

`--output` is declared optional and is not: omit it and BioPhi dies on
`AttributeError: 'NoneType' object has no attribute 'endswith'` while checking that the
filename ends in `.xlsx`. It must be an `.xlsx` path. `--summary` writes only the summary
sheet; without it the workbook carries the full per-peptide detail, and BioPhi itself
suggests the flag once you pass more than one antibody.

To humanise and score in one pass, give `biophi sapiens` the database and a directory:

```bash
biophi sapiens okt3.fa \
  --oasis-db OASis_9mers_v1.db \
  --output report/
```

That writes `humanized.fa`, `alignments.txt` and `Sapiens.xlsx`. The directory must not
already exist or must be empty — a non-empty one raises `FileExistsError` — and BioPhi
removes the directory again after a failure if it is still empty.

### A bad database path does not say so

This one will cost you time if you have not seen it. Both a missing file and a still-gzipped
file are detected correctly inside the worker, but the worker's error handler **prints the
real message and returns `None`**, and the empty result set then fails the report writer.
What reaches the terminal is:

```
KeyError: "None of ['Antibody'] are in the columns"
```

with the actual cause — `The OASis DB path does not exist: …` or `The OASis DB file needs
to be unzipped (use "gunzip DB_PATH.db.gz")` — printed on a separate `Error:` line that the
traceback buries. When you see that `KeyError`, scroll up to the `Error:` lines; the
`KeyError` itself means only that every antibody failed.

## Scoring humanness without the database

For the 10% threshold — the default, and the setting the `sapiens` path forces anyway —
the precomputed peptide set is small enough to ship inside a package. `promb` (MIT, from
the same group) carries `OASis_9mers_v1_10perc_subjects.txt.gz`, a resource of
14,018,806 bytes holding 5,725,303 9-mers (measured 2026-10-21 from the installed 1.0.2
wheel), and computes the same fraction against it:

```bash
pip install promb==1.0.2
promb oasis okt3.fa -o parental.csv
promb oasis humanized.fa -o humanized.csv
```

Output is `File,ID,Identity`. It is not a reimplementation of the scoring, but it is not
BioPhi's own lookup either, and the difference has a direction. The bundled file is the
OASis v1 9-mers at **one precomputed ~10% cutoff**, built over the **pooled** heavy- and
light-eligible donors — the union of the two subject sets — with the cutoff taken as the
smaller of the two 10% counts and the selection made on a strict `>`. BioPhi scores each
chain against its *own* chain-type donor pool, the per-chain `CompleteHeavySeqs` /
`CompleteLightSeqs` filter described under *The database*, and tests `>=`. Both exclude
`Corcoran_2016`, so that is not a difference. So the bundled
set is a hybrid, broader than either per-chain set, and a `promb` identity is expected to
read **slightly high** against BioPhi's own OASis identity. It is a close proxy, not the
same number. It also cannot move the threshold, and whether it agrees with a
full-database run to the last decimal is not something verified here, because the
comparison needs the database. Treat it as the 10% approximation and the full database as
the authority.

BioPhi's own percentile tables are hard-coded in the package rather than read from the
database, so you can turn an identity into a percentile with no download at all:

```python
from biophi.humanization.methods.stats import get_oasis_percentile

print(get_oasis_percentile(chain_type="H", oasis_identity=0.7838,
                           min_fraction_subjects=0.10))
print(get_oasis_percentile(chain_type="mean", oasis_identity=0.7416,
                           min_fraction_subjects=0.10))
```

`chain_type` takes `H`, `K`, `L` or `mean`, and the percentile places the identity against
the IMGT monoclonal-antibody database — that is, against clinical-stage antibodies, not
against human repertoires. `mean` is the whole-antibody figure, and it is the
peptide-weighted mean of the two chains, not the average of the two identities: sum the
human peptides and divide by the total.

Those tables are calibrated on BioPhi's per-chain OASis identities, so a percentile
computed from a `promb` identity **inherits the approximation above** — it is as
approximate as the identity fed into it, and in the same direction. Say which identity a
percentile came from whenever you record one.

## Score matched regions, or the comparison is meaningless

The trap that invalidates a humanisation result quietly. BioPhi's humanised output is the
**variable domain only** — hand it a Fab chain and `abnumber` numbers the V domain, keeps
the constant region as an untouched `tail`, and writes out only the domain. Score the
parental Fab against the humanised domain and you have changed the denominator and the
content at the same time.

Measured on the OKT3 Fab heavy chain from RCSB PDB entry `1SY6`, 2026-10-20: the whole
219-residue chain scores 0.2749, its 119-residue V domain scores 0.5225. Nothing changed
but the window, and the murine constant region is what drags the first number down. Trim
first:

```python
from abnumber import Chain

FAB_H = ("QVQLQQSGAELARPGASVKMSCKASGYTFTRYTMHWVKQRPGQGLEWIGYINPSRGYTNYNQKFKDKATLTTD"
         "KSSSTAYMQLSSLTSEDSAVYYCARYYDDHYCLDYWGQGTTLTVSSAKTTAPSVYPLAPVCGGTTGSSVTLGC"
         "LVKGYFPEPVTLTWNSGSLSSGVHTFPAVLQSDLYTLSSSVTVTSSTWPSQSITCNVAHPASSTKVDKKIEPR")

chain = Chain(FAB_H, scheme="kabat")
print(len(chain), len(chain.tail), chain.chain_type)
with open("okt3_vh.fa", "wt") as fh:
    fh.write(f">OKT3_VH\n{chain.seq}\n")
```

## Where input stops being accepted

`abnumber` is more forgiving than its error messages suggest, and the one hard failure is
the useful one:

| input | result |
|---|---|
| a Fab or full-length chain | V domain numbered, remainder kept as `.tail` |
| lowercase sequence | accepted |
| a trailing `*` stop codon | accepted |
| a non-antibody protein | `ChainParseError: Variable chain sequence not recognized: "…"` |

So guard the call with `try: … except ChainParseError`, and do not assume a file of
"antibody sequences" is one. A sweep of ten RCSB antibody entries on 2026-10-20 turned up
the related mistake: **a polymer entity index is not a chain role.** In nine of the ten —
`1SY6`, `1IGT`, `1IGY`, `12E8`, `1FBI`, `1BJ1`, `1AD0`, `2FBJ`, `1DQJ` — entity 1 was the
light chain and entity 2 the heavy. In `4HKX` entity 1 is the antigen, the heavy chain is
entity 2 and the light chain is entity 3, where it also comes back as `L` rather than `K`.
Read `chain_type` off the parsed chain instead of trusting the order you fetched them in.

For reference, the same sweep on already-humanised input: trastuzumab's VH (entry `1N8Z`)
takes 7 Sapiens mutations and its VL takes 1. A near-zero mutation count is the expected
answer for a human or humanised domain, and a useful control — if a known-human sequence
comes back with twenty changes, something upstream is wrong.

## Try it

**Data.** The murine OKT3 Fab, RCSB PDB entry `1SY6` — polymer entity 2 is the heavy chain
(219 residues) and entity 1 is the light chain (213 residues), both *Mus musculus*. These
are Fab chains rather than isolated variable domains, so the example also exercises
domain-boundary detection and the matched-window trap above. RCSB data is public, needs no
account, and both entities were confirmed reachable on 2026-10-21. Humanness is scored
against the OASis v1 10%-subject peptide set that ships inside `promb` — a derivative of
the same CC-BY-4.0 Zenodo record, carried in an MIT-licensed package — which is the one
route that does not need the 21.5 GiB download. Every identity below is therefore that
proxy's, not BioPhi's own OASis identity; see *Scoring humanness without the database*
for what the two differ on and which way.

**Run.** In a fresh empty directory, with `conda` on the path. Takes a few minutes end to
end, most of it the environment — the conda solve dominates, and how long it takes is
about the solver and the channel, not about BioPhi:

```bash
set -e
conda create -y -q -p ./env -c conda-forge -c bioconda biophi=1.0.11
eval "$(conda shell.bash hook)"
conda activate ./env
pip install --quiet promb==1.0.2

python - <<'PY'
import json, urllib.request
from abnumber import Chain
BASE = "https://data.rcsb.org/rest/v1/core/polymer_entity/1SY6/"
with open("okt3_fab.fa", "wt") as fab, open("okt3.fa", "wt") as var:
    for entity, label in [("2", "VH"), ("1", "VL")]:
        with urllib.request.urlopen(BASE + entity, timeout=60) as fh:
            seq = json.load(fh)["entity_poly"]["pdbx_seq_one_letter_code_can"].strip().upper()
        chain = Chain(seq, scheme="kabat")
        fab.write(f">OKT3_{label}\n{seq}\n")
        var.write(f">OKT3_{label}\n{chain.seq}\n")
        print(f"{label}: Fab chain {len(seq)} aa, V domain {len(chain)} aa, "
              f"constant tail {len(chain.tail)} aa, chain_type {chain.chain_type}")
PY

biophi sapiens okt3.fa --fasta-only --output humanized.fa
promb oasis okt3_fab.fa  -o fab.csv
promb oasis okt3.fa      -o parental.csv
promb oasis humanized.fa -o humanized.csv

python - <<'CHECK'
import csv
from abnumber import Chain
from biophi.humanization.methods.stats import get_oasis_percentile

def fasta(path):
    out, name = {}, None
    for line in open(path):
        line = line.strip()
        if line.startswith(">"):
            name = line[1:].split()[0]; out[name] = ""
        elif line:
            out[name] += line
    return out

def ident(path):
    return {r["ID"]: float(r["Identity"]) for r in csv.DictReader(open(path))}

par, hum = fasta("okt3.fa"), fasta("humanized.fa")
fid, pid, hid = ident("fab.csv"), ident("parental.csv"), ident("humanized.csv")
npep = {}

for label, chain_type in [("VH", "H"), ("VL", "K")]:
    key = f"OKT3_{label}"
    p, h = Chain(par[key], scheme="kabat"), Chain(hum[key], scheme="kabat")
    npep[label] = len(p) - 8
    assert p.chain_type == chain_type, (label, p.chain_type)
    assert len(p) == len(h), "Sapiens substitutes residues; it never inserts or deletes"
    assert (p.cdr1_seq, p.cdr2_seq, p.cdr3_seq) == (h.cdr1_seq, h.cdr2_seq, h.cdr3_seq), \
        "parental Kabat CDRs are grafted back unless --humanize-cdrs is given"
    assert hid[key] > pid[key], "humanisation must raise OASis identity"
    assert fid[key] < pid[key], "the murine constant region drags the Fab-wide identity down"
    n_mut = sum(a != b for a, b in zip(p.seq, h.seq))
    print(f"{label} {len(p)} aa, {n_mut} mutations, {npep[label]} 9-mers | "
          f"OASis identity (promb 10% set): Fab {fid[key]:.4f}  "
          f"V domain {pid[key]:.4f} -> {hid[key]:.4f} "
          f"({round(pid[key] * npep[label])} -> {round(hid[key] * npep[label])} human 9-mers)")

total = npep["VH"] + npep["VL"]
for tag, d in [("parental", pid), ("humanized", hid)]:
    mean = (d["OKT3_VH"] * npep["VH"] + d["OKT3_VL"] * npep["VL"]) / total
    pct = get_oasis_percentile(chain_type="mean", oasis_identity=mean, min_fraction_subjects=0.10)
    print(f"{tag:9s} paired OASis identity (promb 10% set) {mean:.4f}  "
          f"OASis percentile {pct:.3f}")
print("OK")
CHECK
```

**Expect.** Every assertion passes and the block prints:

```
VH: Fab chain 219 aa, V domain 119 aa, constant tail 100 aa, chain_type H
VL: Fab chain 213 aa, V domain 106 aa, constant tail 107 aa, chain_type K
VH 119 aa, 15 mutations, 111 9-mers | OASis identity (promb 10% set): Fab 0.2749  V domain 0.5225 -> 0.7838 (58 -> 87 human 9-mers)
VL 106 aa, 16 mutations, 98 9-mers | OASis identity (promb 10% set): Fab 0.1024  V domain 0.2143 -> 0.6939 (21 -> 68 human 9-mers)
parental  paired OASis identity (promb 10% set) 0.3780  OASis percentile 0.004
humanized paired OASis identity (promb 10% set) 0.7416  OASis percentile 0.354
OK
```

Invariants — a failure here means this page is wrong, not that upstream moved. All five are
asserted in the block:

- The heavy chain parses as `H` and the light chain as `K`, not `L`. Kappa and lambda are
  separate chain types, so `chain_type == "L"` is a test for lambda and false for most
  light chains.
- Parental and humanised domains are the same length. Sapiens substitutes only.
- The three Kabat CDRs are byte-identical before and after, because `--humanize-cdrs` was
  not given.
- Humanisation raises OASis identity on both chains. A humanisation that lowers it has
  failed at its only job.
- The Fab-wide identity is below the V-domain identity on both chains, because the murine
  constant region contributes non-human peptides. This is the matched-window trap, asserted
  rather than described.

Both identity assertions are directional, which is why the proxy does not weaken them: a
set that reads slightly high reads slightly high on both sides of each comparison.

Observed on 2026-10-21 with BioPhi 1.0.11, sapiens 1.1.0 and promb 1.0.2 — a mismatch here
is drift to investigate, not a bug. Every figure below depends on the model weights, the
peptide set or the PDB entry:

- V domains of 119 and 106 residues inside Fab chains of 219 and 213, leaving tails of 100
  and 107.
- 15 Sapiens mutations in VH and 16 in VL at one iteration.
- 111 and 98 nine-mers, which is `len − 8` and moves only if the entry's sequence does.
- OASis identity against the `promb` 10% set: VH 0.5225 → 0.7838 (58 → 87 human
  peptides), VL 0.2143 → 0.6939 (21 → 68). These are the proxy's figures, expected to sit
  slightly above what a full-database run at the same threshold would give.
- Paired identity 0.3780 → 0.7416, OASis percentile 0.004 → 0.354 — the percentile is
  computed from the proxy's identity and inherits that approximation. Humanising OKT3
  moves it from below the first percentile of clinical-stage antibodies to around the
  35th.
