---
name: antibody-numbering
description: Number antibody, nanobody and TCR variable domains under IMGT, Chothia, Kabat, Martin or AHo with ANARCII, then slice CDRs and frameworks out of the result — covering the scheme differences that silently move CDR boundaries.
category: utility
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [antibody, nanobody, tcr, imgt, cdr]
datasets: [https://data.rcsb.org/rest/v1/core/polymer_entity/1N8Z/2]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-04
  against: anarcii 2.0.8 / abnumber 0.4.4 / torch 2.14.1 / numpy 2.4.6 / Python 3.11.15 / CPU only / RCSB PDB entries 1N8Z, 1MEL, 1AO7 fetched 2026-10-04
  executed: 10
  unverified: 0
---
# Numbering antibody, nanobody and TCR sequences

Every other antibody task presupposes a numbering. CDR definitions, epitope positions,
humanisation, library design and "mutate position 52" all mean nothing until you have
said *under which scheme*. This skill assigns one and slices regions out of it.

## The thing that goes wrong

The schemes disagree about where the CDRs are, and they disagree by several residues.
The same heavy chain, numbered three ways:

| scheme | CDR1 | CDR2 | CDR3 |
|---|---|---|---|
| IMGT | `GFNIKDTY` | `IYPTNGYT` | `SRWGGDGFYAMDY` |
| Chothia | `GFNIKDT` | `YPTNGY` | `WGGDGFYAMDY` |
| Kabat | `DTYIH` | `RIYPTNGYTRYADSVKG` | `WGGDGFYAMDY` |

That is one molecule, one numbering tool, one call each. Kabat CDR-H2 is 17 residues
where IMGT's is 8. IMGT CDR-H3 carries two residues Kabat's does not.

So a CDR sequence is not a property of an antibody — it is a property of an antibody
*and a scheme*. Record which one you used next to every position you report, and never
compare a CDR length across two sources without checking that both used the same scheme.

## What you need

`pip install anarcii`. Nothing else:

- **No API key, no account, no licence to accept.** ANARCII is BSD-3-Clause
  (University of Oxford).
- **No GPU.** It is a language model and it pulls in PyTorch, but it runs on CPU — pass
  `cpu=True`. Everything in this skill was verified CPU-only.
- **No weights download at run time.** The six model files ship inside the wheel, about
  19 MB in total, so the first call works offline and there is no cache to warm.

ANARCII needs Python 3.11 or newer.

### Use ANARCII, not ANARCI

ANARCI is the older tool and much of the literature still names it. Prefer ANARCII:
ANARCI builds HMMs from IMGT germline downloads at install time, so its install breaks
when that source changes shape or goes down, and it needs HMMER on the machine. ANARCII
replaces the HMM alignment with a sequence model, which is why it installs from the
package index alone.

## Numbering a chain

```python
from anarcii import Anarcii

VH = (
    "EVQLVESGGGLVQPGGSLRLSCAASGFNIKDTYIHWVRQAPGKGLEWVARIYPTNGYTRYADSVKGRFTISADTSKNT"
    "AYLQMNSLRAEDTAVYYCSRWGGDGFYAMDYWGQGTLVTVSS"
)

numberer = Anarcii(seq_type="antibody", mode="accuracy", cpu=True, ncpu=1)
result = numberer.number([("trastuzumab_H", VH)])

record = result["trastuzumab_H"]
print(record["chain_type"], record["scheme"], len(record["numbering"]))
print(record["query_start"], record["query_end"], record["error"])
```

`number()` returns a **dict keyed by sequence name**, not a list. Pass a list of
`(name, sequence)` pairs and you get your names back. Pass a bare string and the single
key is the literal `"Sequence"` — which is the first thing to trip over, because
`result[0]` and iterating the result both fail or give you keys instead of records.

Each record holds:

| key | what it is |
|---|---|
| `numbering` | list of `((position, insertion_code), residue)` tuples; `-` marks a gap |
| `chain_type` | `H`, `K`, `L`, `A`, `B`, `G`, `D` — or `F` when numbering failed |
| `score` | model confidence; below the cut-off the chain is rejected |
| `query_start`, `query_end` | 0-based inclusive span of the input the domain occupies |
| `error` | `None` on success, otherwise why it was rejected |
| `scheme` | the scheme the numbering is currently in |

### `query_start` and `query_end` locate the domain

Hand it a whole Fab chain, or a full-length sequence with signal peptide and constant
region attached, and ANARCII numbers only the variable domain and tells you where it
found it. The 220-residue Fab heavy chain of the worked example yields
`query_start=0, query_end=119` — the V domain is the first 120 residues and the rest is
ignored rather than mis-numbered. You do not need to trim input to the variable domain
yourself.

Concatenating the non-gap residues reconstructs exactly that slice of the input, which is
the cheapest assertion that a numbering is intact:

```python
numbered = "".join(aa for _, aa in record["numbering"] if aa != "-")
assert numbered == VH[record["query_start"]:record["query_end"] + 1]
```

### A kappa light chain is `K`, not `L`

`chain_type` distinguishes the light-chain classes: kappa is `K` and lambda is `L`. So
`chain_type == "L"` is **not** a test for "is this a light chain" — it is a test for
lambda, and it returns False for every kappa chain, which is most of them. Test
membership instead:

```python
if record["chain_type"] in {"K", "L"}:
    ...  # light chain
```

TCR chains come back as `A`, `B`, `G`, `D` — verified `A` for the alpha chain of PDB
`1AO7`.

### Set `seq_type` to match the receptor — nothing checks it for you

`Anarcii(seq_type=...)` selects the model, and the wrong one fails **silently rather than
loudly**. The alpha chain of `1AO7` put through the default antibody model comes back
`chain_type='H'`, `error=None` and a full numbering — a confident, wrong answer, with
nothing in the record to suggest it. Through `seq_type="tcr"` the same chain is `A`.

```python
# alpha chain of PDB 1AO7, a human TCR bound to HLA-A2
TCR_ALPHA = (
    "KEVEQNSGPLSVPEGAIASLNCTYSDRGSQSFFWYRQYSGKSPELIMSIYSNGDKEDGRFTAQLNKASQYVSLLIRDS"
    "QPSDSATYLCAVTTDSWGKLQFGAGTQVVVTPDIQNPDPAVYQLRDSKSSDKSVCLFTDFDSQTNVSQSKDSDVYITD"
    "KTVLDMRSMDFKSNSAVAWSNKSDFACANAFNNSIIPEDTFFPSPESS"
)

tcr = Anarcii(seq_type="tcr", mode="accuracy", cpu=True, ncpu=1)
print(tcr.number([("1ao7_A", TCR_ALPHA)])["1ao7_A"]["chain_type"])
```

`seq_type` takes `antibody`, `tcr` and `shark` (VNAR). Nanobodies and other VHH
single-domain antibodies are **not** a separate type — they go through `antibody` and
number as `H`, as the `1MEL` VHH above does.

## Switching scheme

```python
chothia = numberer.to_scheme("chothia")
print(chothia["trastuzumab_H"]["numbering"][:5])
```

`to_scheme()` converts **the most recent `number()` result held on the numberer** — it
takes no numbering argument and returns the whole converted result set. So convert before
you number anything else, and keep a reference if you want two schemes at once. It does
not mutate the records you already hold.

Accepted values are `imgt`, `chothia`, `kabat`, `martin` and `aho`.

### The frames are not all the same width, and not all fixed

Measured on two heavy chains — a conventional VH with a 13-residue IMGT CDR3, and the
camelid VHH of PDB `1MEL` with a 26-residue one:

| scheme | VH slots | VHH slots | highest position | how a long loop is absorbed |
|---|---|---|---|---|
| IMGT | 128 | **141** | 128 | insertion codes beyond the frame |
| AHo | 149 | 149 | 149 | absorbed inside the frame, no insertions |
| Chothia | 120 | 133 | 113 | insertion codes |

The invariant is the **highest position**, not the slot count. IMGT numbering never goes
past position 128 — but it reaches a 26-residue CDR3 by hanging insertion codes off
positions 111 and 112, and each of those is another entry in the list. So the VHH comes
back as 141 entries, and `len(numbering) == 128` is not a valid check on an IMGT
numbering. It passes for most human antibodies and fails on exactly the chains people
care about, because long CDR3s are the norm in camelid single-domain antibodies.

AHo was the only scheme here that took the long CDR3 without insertion codes. Chothia,
Kabat and Martin drop the gap slots entirely and carry insertions, so their slot count
tracks the chain.

### Do not sort the numbering

The list comes back in sequence order, and that order is not the sort order of its own
keys. IMGT fills CDR3 insertions outward from the middle, so the `1MEL` nanobody runs
`111A, 111B … 111F` and then `112G, 112F … 112A` — descending. Sorting by
`(position, insertion_code)` puts `112A` before `112G` and silently reverses that half
of the CDR3. Read the list as given; the only safe operations are filtering and slicing.

```python
nb = record["numbering"]
assert max(pos for (pos, _ins), _aa in nb) <= 128          # IMGT ceiling holds
insertions = [(p, i) for (p, i), aa in nb if i != " "]     # [] for most human chains
print(len(nb), "slots,", len(insertions), "insertion-coded")
```

## Slicing CDRs and frameworks

IMGT's region boundaries are fixed position ranges, which makes region extraction a
filter over the numbering rather than anything cleverer:

```python
IMGT_REGIONS = {
    "FR1": (1, 26),
    "CDR1": (27, 38),
    "FR2": (39, 55),
    "CDR2": (56, 65),
    "FR3": (66, 104),
    "CDR3": (105, 117),
    "FR4": (118, 128),
}

def imgt_regions(record):
    if record["error"] is not None:
        raise ValueError(f"{record['chain_type']}: {record['error']}")
    out = {}
    for name, (lo, hi) in IMGT_REGIONS.items():
        out[name] = "".join(
            aa for (pos, _ins), aa in record["numbering"]
            if lo <= pos <= hi and aa != "-"
        )
    return out

for name, seq in imgt_regions(record).items():
    print(f"{name:5s} {seq}")
```

This only works on an IMGT numbering. The other schemes put their boundaries at
different positions, so either convert to IMGT first or use the region accessors in the
next section.

## Checking failures, and sanitising input first

Numbering fails in two different ways and they need different handling.

**A protein that is not an antigen receptor** is rejected cleanly. Feed in a receptor
ectodomain and you get `chain_type='F'`, `numbering=None` and
`error='Score less than cut off.'`. So guard on `error` before touching `numbering`,
as `imgt_regions` above does — the failure mode is a `None` you will otherwise index.

**A sequence containing characters that are not amino acids does not fail cleanly.**
This is the sharp edge. Verified against 2.0.8:

| input | result |
|---|---|
| `X` in the sequence | numbered normally |
| lowercase sequence | raises `IndexError` |
| `*` stop codon | raises `IndexError` |
| a digit | raises `IndexError` |
| `-` alignment gap | raises `KeyError` on the sequence name |

Lowercase and `*` are not exotic — soft-masked FASTA is lowercase, and translating an
ORF with its stop gives you `*`. The exception surfaces from inside the model, not as a
validation error, and `IndexError` is not something you would think to catch around a
numbering call.

The behaviour is also batch-dependent, which makes it easy to miss in testing: a bad
sequence **on its own** raises, but the same bad sequence batched alongside a valid one
degrades to `chain_type='F'`, `numbering=None` and
`error='Less than 50 non insertion residues numbered.'` instead. Do not rely on either —
sanitise before the call:

```python
AA = set("ACDEFGHIKLMNPQRSTVWYX")

def clean(seq):
    seq = seq.strip().upper().replace("-", "").replace("*", "")
    bad = sorted(set(seq) - AA)
    if bad:
        raise ValueError(f"non-amino-acid characters in sequence: {bad}")
    return seq

records = numberer.number([(name, clean(s)) for name, s in [("trastuzumab_H", VH)]])
print(records["trastuzumab_H"]["chain_type"], records["trastuzumab_H"]["error"])
```

Uppercasing and dropping gaps and stops covers the realistic cases; raising on anything
else left over means a malformed FASTA stops at your code with a message naming the
character, rather than at a tensor index.

## Region accessors with abnumber

`abnumber` (MIT) wraps a numbering in a `Chain` object with scheme-aware region
accessors, alignment and CDR-graft humanisation. Historically it required ANARCI and
therefore HMMER; as of 0.4.4 it takes `use_anarcii=True` and then installs and runs from
the package index alone, on any platform ANARCII supports:

```python
from abnumber import Chain

chain = Chain(
    VH,
    scheme="imgt",
    use_anarcii=True,
    anarcii_args={"cpu": True, "ncpu": 1},
)
print(chain.chain_type, chain.is_heavy_chain())
print(chain.cdr1_seq, chain.cdr2_seq, chain.cdr3_seq)
print(list(chain.regions.keys()))
```

`Chain(..., scheme="kabat", use_anarcii=True)` gives you Kabat's region definitions
directly, which is how the comparison table at the top of this page was produced.

One limit worth knowing before you choose a backend: **germline assignment is not
available through ANARCII**. Passing `assign_germline=True` together with
`use_anarcii=True` warns and silently falls back to ANARCI, so that one feature still
costs you a HMMER install. Everything else works on the ANARCII path.

## Exporting a numbering

`to_csv()` writes the last result as one row per sequence — `Name`, `Chain`, `Score`,
`Query start`, `Query end`, then one column per numbered position:

```python
numberer.to_csv("numbering.csv")
```

Position columns only line up across rows for the fixed-width frames (IMGT, AHo). There
are also `to_legacy()` for the older ANARCI tuple layout and `to_msgpack()` for a
compact round-trip.

## Try it

**Data.** The heavy chain of the trastuzumab Fab, read from RCSB PDB entry `1N8Z`
(trastuzumab Fab in complex with the HER2 extracellular domain). Entity 2 is the heavy
chain, 220 residues — a Fab chain rather than an isolated variable domain, so it also
exercises domain-boundary detection. RCSB data is public and needs no account; the entry
was confirmed reachable on 2026-10-04.

**Run.** In a fresh empty directory:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install --quiet anarcii

cat > try_it.py <<'PY'
import json, urllib.request
from anarcii import Anarcii

URL = "https://data.rcsb.org/rest/v1/core/polymer_entity/1N8Z/2"
with urllib.request.urlopen(URL, timeout=60) as fh:
    entity = json.load(fh)
seq = entity["entity_poly"]["pdbx_seq_one_letter_code_can"].strip().upper()
print(f"fetched {len(seq)} residues")

numberer = Anarcii(seq_type="antibody", mode="accuracy", cpu=True, ncpu=1)
rec = numberer.number([("1n8z_H", seq)])["1n8z_H"]
assert rec["error"] is None, rec["error"]

print(f"chain_type={rec['chain_type']} scheme={rec['scheme']} "
      f"slots={len(rec['numbering'])} span={rec['query_start']}-{rec['query_end']} "
      f"score={rec['score']:.2f}")

# non-gap residues must reconstruct the domain slice of the query
numbered = "".join(aa for _, aa in rec["numbering"] if aa != "-")
assert numbered == seq[rec["query_start"]:rec["query_end"] + 1]

IMGT_CDRS = {"CDR1": (27, 38), "CDR2": (56, 65), "CDR3": (105, 117)}
for name, (lo, hi) in IMGT_CDRS.items():
    cdr = "".join(aa for (p, _i), aa in rec["numbering"] if lo <= p <= hi and aa != "-")
    print(f"IMGT {name} {cdr}")

kabat = numberer.to_scheme("kabat")["1n8z_H"]
kabat_cdr3 = "".join(aa for (p, _i), aa in kabat["numbering"] if 95 <= p <= 102 and aa != "-")
print(f"Kabat CDR3 {kabat_cdr3}")
PY

python3 try_it.py
```

**Expect.**

Invariants — a failure here means this page is wrong, not that upstream moved:

- `chain_type` is `H` and `error` is `None`.
- No IMGT position exceeds **128**. That ceiling is the invariant — the *slot* count is
  128 only for a chain with no insertion codes, which this one has none of.
- The non-gap residues equal `seq[query_start:query_end + 1]`. The assertion in the
  script covers this.
- IMGT CDR3 is `SRWGGDGFYAMDY` and Kabat CDR3 is `WGGDGFYAMDY` — the two-residue
  difference is the scheme definitions, and it is the point of the table at the top.
- IMGT CDR1 `GFNIKDTY`, IMGT CDR2 `IYPTNGYT`.

Observed on 2026-10-04 with anarcii 2.0.8 — a mismatch here is drift to investigate,
not a bug:

- `fetched 220 residues` from entity 2.
- `span=0-119`, locating the variable domain in the first 120 residues of the Fab chain.
- `slots=128` — this chain carries no insertion codes.
- `score≈30.88`. Model confidence moves with the model; only its position above the
  cut-off is meaningful.
