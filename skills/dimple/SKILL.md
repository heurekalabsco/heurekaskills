---
name: dimple
description: Design programmed missense, insertion and deletion variant libraries for Golden Gate assembly with DIMPLE — from a plasmid FASTA to uniform-length orderable oligo pools, barcoded fragment primers and a variant table with HGVS names.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [mutagenesis, library-design, golden-gate, indels, dms]
datasets: [https://raw.githubusercontent.com/coywil26/DIMPLE/master/examples/Kir.fa]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-18
  against: DIMPLE master 5befb95 / Python 3.11.17 / numpy 2.4.6 / biopython 1.88 / pydna 5.5.16
  executed: 8
  unverified: 0
---
# DIMPLE — programmed indel and missense library design

DIMPLE turns a target gene into an **orderable oligo pool**. You give it the plasmid
sequence and say which variants you want; it returns uniform-length oligos, the PCR
primers that amplify each fragment, and a table naming every variant it designed.

What makes it worth reaching for is **indels**. Deep mutational scanning tooling almost
universally assumes missense-only, so programmed insertion and deletion libraries are the
underserved case — and DIMPLE designs substitutions, insertions and deletions in the same
run, from the same fragmentation.

It is a design tool, not an analysis tool. It does not see sequencing data; it tells you
what to order.

## What you need before you start

Nothing to obtain — no account, no API key, no licence to accept, no GPU. DIMPLE is MIT
licensed and runs on a CPU in seconds.

One thing to know before you install: **DIMPLE is not on PyPI.** There *is* a package
called `dimple` on PyPI (version 0.2.0, author "noogie", no project URLs, no description)
and it is a different, unrelated project. `pip install dimple` does not get you this tool.
Install from the repository.

## Install

The dependency list in the project README is incomplete — it names numpy, biopython and
tkinter, but the module also imports `pydna` at load time, so an install built from the
README alone fails with `ModuleNotFoundError: No module named 'pydna'`. Use
`requirements.txt`, which is correct.

```bash
git clone --depth 1 https://github.com/coywil26/DIMPLE
cd DIMPLE
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt   # numpy, biopython, pydna
```

The project recommends Python 3.12 and notes that biopython can break on 3.13. Python 3.11
also works; 3.13 is the one to avoid.

### Run it through the command line, not as a library

The supported entry point is `run_dimple.py`. Importing the module and driving it yourself
looks possible and is not: several of the settings the design code reads are assigned onto
the class by the command-line entry point and are **not** class attributes, so a direct
import leaves them undefined.

```bash
./.venv/bin/python -c "
from DIMPLE.DIMPLE import DIMPLE
print('enzyme set at import?', hasattr(DIMPLE, 'enzyme'))
print('cutsite set at import?', hasattr(DIMPLE, 'cutsite'))"
```

Both print `False`, and the quality-control step reads `DIMPLE.enzyme` unconditionally — so
a library-style call raises `AttributeError: type object 'DIMPLE' has no attribute 'enzyme'`.
This is also why the project's own `python -m unittest discover` currently fails on `master`:
the test drives the design functions directly and hits exactly this. A failing test suite
here is a known upstream rough edge, not a broken install.

There is a Tk GUI (`run_dimple_gui.py`) with the same functionality, and a Colab notebook on
the project's `colab` branch if you would rather not install anything. Neither was run for
this page, and the `colab` branch is not pinned to the commit above, so it may differ.

## Input — the gene file

One FASTA file containing the **entire library-generation construct**, not just the open
reading frame. DIMPLE needs the flanking plasmid sequence to check that the primers it
designs do not amplify somewhere else.

Declare the ORF in the header, as the first and last base of the coding sequence:

    >Kir start:583 end:1890
    GACGTC...

That is 1308 nucleotides, or 436 codons. Positions in every output are **codon numbers
within the ORF**, not plasmid coordinates. If you leave the bounds out of the header you
must supply the ORF on the command line instead.

The project ships this construct as an example. Set up a working directory with it — the
runs below all read from `work/` and write their outputs back into it:

```bash
mkdir -p work && cp examples/Kir.fa work/
head -1 work/Kir.fa
```

## Design a saturating missense library

```bash
./.venv/bin/python run_dimple.py \
  -wDir work -geneFile Kir.fa \
  -oligoLen 230 -DMS \
  -restriction_sequence BsmBI -avoid_sequence CGTCTC GGTCTC \
  -seed 1
```

Note the path convention: **`-geneFile` is resolved relative to `-wDir`**, so it takes a bare
filename. Passing `work/Kir.fa` alongside `-wDir work` looks right and fails with
`FileNotFoundError: work/work/Kir.fa`.

`-DMS` substitutes every amino acid except the wildtype at each position, skipping the start
codon. For a 436-codon ORF that is **435 positions × 19 amino acids = 8265 variants**, which
is a useful arithmetic check on any run: if the count is not `(codons − 1) × 19`, the ORF
bounds in the header are not what you think they are.

`-oligoLen` is the synthesis length you are buying. DIMPLE fragments the gene so that every
oligo it emits is the **same length** and no longer than that — here 222 nt against a 230 nt
budget, the remainder going to cut sites, barcodes and primer handles. A pooled order needs a
single length, so a run that emitted mixed lengths would be a bug.

`-avoid_sequence` lists the sites that must not appear inside a fragment. Pass the recognition
sequences of both enzymes you plan to use; DIMPLE adds the cut site itself to the list if you
forget, and warns when it does.

## Design insertion and deletion libraries

```bash
./.venv/bin/python run_dimple.py \
  -wDir work -geneFile Kir.fa \
  -oligoLen 230 \
  -insertions GGC GGCGGC -deletions 3 6 \
  -restriction_sequence BsmBI -avoid_sequence CGTCTC GGTCTC \
  -seed 1
```

`-insertions` takes the **nucleotides to insert**; `-deletions` takes the **number of
nucleotides to remove**. Both want multiples of three to stay in frame — DIMPLE will accept
other values and shift the reading frame, which is occasionally what you want and usually
not.

Each specification is applied at every position, so two insertions plus two deletions over
435 positions is 1740 variants. Insertions are named by the residues they add, not the
nucleotides you asked for: `GGC` becomes `1_2_insG`, `GGCGGC` becomes `1_2_insGG`.

Note the position convention differs from substitutions. Indels are placed *between* codons
and run from position 1 to 435; substitutions run from 2 to 436. Both are 435 positions on
this gene, which makes the off-by-one easy to miss when you join the tables.

## Combine substitutions with indels

The flags compose, and sharing one fragmentation across all three variant classes is the
reason to do it in a single run rather than three:

```bash
./.venv/bin/python run_dimple.py \
  -wDir work -geneFile Kir.fa \
  -oligoLen 230 -DMS \
  -insertions GGC -deletions 3 \
  -restriction_sequence BsmBI -avoid_sequence CGTCTC GGTCTC \
  -seed 1
```

That yields 8265 substitutions + 435 insertions + 435 deletions = 9135 variants.

## Record the seed with the order

Codon choice and barcode assignment are random. **Without `-seed` a rerun produces a
different oligo pool** — same variants, different sequences. With a seed the output is
byte-identical, which is what lets you regenerate the exact pool you ordered six months
later when the sequencing comes back. Put the seed in your notes next to the order number.

## What DIMPLE writes

Into the `-wDir` directory:

| file | contents |
|---|---|
| `All_Oligos.fasta` | every designed oligo, uniform length — this is the synthesis order |
| `All_Primers.fasta` | gene and oligo amplification primers for all fragments |
| `<gene>_designed_variants.csv` | one row per variant, with HGVS names |
| `<gene>_mutations.csv` | the substitution codon table, written for `-DMS` runs |
| `<gene>_DMS_Oligos.fasta` | the per-gene oligo set that `All_Oligos.fasta` aggregates |
| `<gene>_DMS_Gene_Primers.fasta` | primers amplifying each gene fragment from the plasmid |
| `<gene>_DMS_Oligo_Primers.fasta` | primers amplifying each oligo sub-pool |

Separate gene and oligo primer sets are deliberate: each fragment is amplified from the
construct and the matching oligo sub-pool is amplified from synthesis, then the two are
assembled.

## Reading the variant table

`<gene>_designed_variants.csv` has one row per variant:

```python
import csv, collections

rows = list(csv.DictReader(open("work/Kir_designed_variants.csv")))
print("columns:", list(rows[0]))
print("variants:", len(rows))
print("by type:", dict(collections.Counter(r["mutation_type"] for r in rows)))

# pos is a codon number in the ORF; name and hgvs are the two naming conventions.
for r in rows[:2]:
    print(r["pos"], r["mutation_type"], r["name"], r["wt_codon"], "->", r["codon"], r["hgvs"])
```

`mutation_type` is `M` for missense, `I` for insertion, `D` for deletion. `length` is in
codons for indels and `1` for substitutions. `hgvs` carries protein-level HGVS
(`p.(G2C)`, `p.(M1del)`, `p.(1_2_insG)`), which is the column to join on if you are
matching against variant-effect records from elsewhere.

## Pitfalls

1. **`-geneFile` is joined onto `-wDir`.** The two are not independent paths. Give
   `-geneFile` a bare filename that exists inside `-wDir`, or an absolute path. This is the
   first thing that bites, and the traceback names the doubled directory, so read it.
2. **Unwanted restriction sites inside a fragment.** DIMPLE emits
   `UserWarning: Unwanted restriction site found within substitution fragment: ...` and keeps
   going. These are not fatal and not noise: each one is a variant whose oligo carries a site
   that will cut during assembly. Count them, and if there are many, change enzyme or extend
   `-avoid_sequence`.
3. **Barcode exhaustion across runs.** The barcode pool is finite and consumed from the start
   each time. Designing a second library with the defaults reissues the same barcodes, so the
   two pools cannot be sequenced together — pass `-barcode_start` past what the first run used.
4. **Primer specificity is checked, silently.** The run ends with
   `No non-specific primers detected` or names the offending set. Read that line; it is the
   only place the check reports.
5. **`-oligoLen` is a ceiling, not a target.** Shorter oligos mean more fragments and more
   primer pairs. If the fragment count is higher than you expected, that is the lever.
6. **The archived publication code is a different repository.** The version used in the paper
   is archived separately and on Zenodo; `master` on the active repository has moved since.
   Cite the paper, but design against the active repository.

## Try it

A self-contained check that this skill still works. Public data, no account, no key.

**Data** — the Kir2.1 library-generation construct that ships with the project:

    https://raw.githubusercontent.com/coywil26/DIMPLE/master/examples/Kir.fa

MIT licensed, 5121 nt, with the ORF declared in the header as `start:583 end:1890`
(436 codons). Last confirmed reachable 2026-10-18.

```bash
set -euo pipefail

curl -sSfL -o Kir.fa \
  https://raw.githubusercontent.com/coywil26/DIMPLE/master/examples/Kir.fa
head -1 Kir.fa

git clone --quiet --depth 1 https://github.com/coywil26/DIMPLE dimple-src
DIMPLE_HOME="$PWD/dimple-src"
python3 -m venv .venv
./.venv/bin/pip install --quiet --disable-pip-version-check -r "$DIMPLE_HOME/requirements.txt"

./.venv/bin/python "$DIMPLE_HOME/run_dimple.py" \
  -wDir "$PWD" -geneFile Kir.fa \
  -oligoLen 230 -DMS \
  -restriction_sequence BsmBI -avoid_sequence CGTCTC GGTCTC \
  -seed 1 > dimple.log 2>&1

./.venv/bin/python - <<'PY'
import csv, collections
from Bio import SeqIO

rows = list(csv.DictReader(open("Kir_designed_variants.csv")))
per = collections.Counter(int(r["pos"]) for r in rows)
oligo_len = {len(r.seq) for r in SeqIO.parse("All_Oligos.fasta", "fasta")}

print("variants          :", len(rows))
print("positions         :", len(per))
print("variants/position :", sorted(set(per.values())))
print("position range    :", min(per), "-", max(per))
print("mutation types    :", sorted({r["mutation_type"] for r in rows}))
print("oligo length(s)   :", sorted(oligo_len))

# Invariants — one variant per non-wildtype amino acid at every codon but the start.
assert len(per) == 435 and set(per.values()) == {19}
assert len(rows) == 435 * 19 == 8265
assert (min(per), max(per)) == (2, 436)
assert sorted({r["mutation_type"] for r in rows}) == ["M"]
# Invariant — a pooled order needs one synthesis length, within the stated budget.
assert len(oligo_len) == 1 and max(oligo_len) <= 230
# Observed, seed 1, master 5befb95 — a different seed picks a different synonymous codon.
assert [r["codon"] for r in rows if r["pos"] == "2" and r["mutation"] == "C"] == ["TGT"]
print("OK")
PY
```

**Expect**

```text
>Kir start:583 end:1890
variants          : 8265
positions         : 435
variants/position : [19]
position range    : 2 - 436
mutation types    : ['M']
oligo length(s)   : [222]
OK
```

The counts and the single oligo length are invariants — a mismatch means the skill is wrong,
or the ORF bounds changed. The `TGT` codon is an observed value for `-seed 1` on master
`5befb95`; a different seed or an upstream change to codon selection moves it, and that is
drift to investigate rather than a failure.

## Related skills

- `pydna` — DIMPLE depends on it; useful for simulating the Golden Gate assembly of the
  fragments DIMPLE designs.
- `biopython` — reading and manipulating the FASTA files on either side of a run.

## Citing

- Macdonald, C.B. et al. *DIMPLE: deep insertion, deletion, and missense mutation libraries
  for exploring protein variation in evolution, disease, and biology.* Genome Biology (2023).
  doi:10.1186/s13059-023-02880-6
- Preprint: doi:10.1101/2022.07.26.501589
