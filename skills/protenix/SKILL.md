---
name: protenix
description: Predict all-atom structures of proteins, nucleic acids, ligands and ions with Protenix, an open AlphaFold3 reproduction — the input JSON grammar, MSA and template handling, checkpoint selection, and how to read pLDDT, PAE, pTM and ipTM without over-reading them. Running the model needs an NVIDIA GPU.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-structure, structure-prediction, protenix, plddt, pae]
datasets: [https://protenix.tos-cn-beijing.volces.com/checkpoint/protenix_base_default_v1.0.0.pt, https://protenix.tos-cn-beijing.volces.com/common/components.cif]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-27
  against: protenix 2.0.0 (PyPI) / torch 2.7.1+cpu / biotite 1.4.0 / gemmi 0.6.x / Python 3.12.14 on linux-aarch64 / dependency resolution checked on linux/amd64 / checkpoint host probed 2026-08-27
  executed: 8
  unverified: 3
  unverified_reason: >-
    The three unexecuted blocks install and run the model itself. The validating host is
    arm64 with no NVIDIA GPU, and `triton==3.3.1` — which `protenix` pins — publishes no
    linux/aarch64 wheel, so the full package cannot be installed there at all. Re-run the
    install block on a linux x86_64 host, and the two `protenix` CLI blocks on that host
    with a CUDA GPU and roughly 10 GB free for weights and the CCD.
---

# Protenix

Protenix is an open reproduction of AlphaFold 3 from ByteDance — one model that folds
proteins, DNA, RNA, ligands, ions and covalent modifications together in a single
all-atom prediction, rather than a protein-only backbone.

Two things make it worth reaching for over a database lookup. It predicts **complexes**,
including a ligand you specify as a SMILES string, which no precomputed archive holds.
And the whole thing — code *and* trained weights — is Apache-2.0, so the output is
yours to use commercially without a separate licence conversation.

What this skill is mostly about is the part that goes wrong quietly: the input grammar
has three asymmetries that produce a valid-looking job describing the wrong molecule, and
the confidence block has a field that reads as a quality score and is not one. Both are
covered below with the checks that catch them.

Related tools you may actually want instead. For a protein that already exists in UniProt
and needs no ligand, retrieving a precomputed model is faster and free — the `alphafold`
skill covers that. For a hosted API rather than your own GPU, `boltz2-nim` predicts
structure and binding affinity through NVIDIA's endpoint. For rigid small-molecule
docking into a known pocket, `autodock-vina` is the cheaper tool. PXDesign, from the same
group, is a separate project that *designs* binders on top of this model rather than
predicting a given complex; it is not covered here.

## What you need before you run anything

Running the model is not optional-hardware territory. State of the requirements as of
2026-08-27:

| requirement | why |
|---|---|
| **NVIDIA GPU with CUDA** | The package pins `triton`, `deepspeed` and `cuequivariance-ops-torch-cu12`, all CUDA-only. |
| **linux x86_64** | `triton==3.3.1` ships no arm64 wheel, so the pinned tree does not resolve on Apple Silicon or ARM servers. |
| **A C/C++ toolchain** | Four dependencies have no wheel and build from source. |
| **~10 GB of disk** | 1.4 GB per base checkpoint, plus a 0.46 GB chemical component dictionary and its 0.13 GB RDKit cache. |
| Python 3.11 or newer | `requires_python >=3.11`. |

There is a CPU branch in the inference runner — it selects `torch.device("cpu")` when
`torch.cuda.device_count()` is zero — but it is not a supported path: the autocast context
is guarded on `torch.cuda.is_available()`, the default attention and triangle kernels are
CUDA extensions, and nothing in the project documents or benchmarks CPU inference. Treat
the CPU branch as a code path that exists, not as a way to run this without a GPU.

No account, no API key, no click-through licence. Weights are served as plain HTTPS
objects.

## Install

Before committing to a multi-gigabyte download, check the pinned dependency tree still
resolves. This runs anywhere Docker does, including a laptop, and downloads only package
metadata:

```bash
docker run --rm --platform linux/amd64 -v "$PWD":/out python:3.12-slim sh -c '
  pip install --quiet --root-user-action=ignore --upgrade pip &&
  pip install --dry-run --root-user-action=ignore --report /out/resolve.json protenix==2.0.0 >/dev/null &&
  python - <<EOF
import json
r = json.load(open("/out/resolve.json"))["install"]
sdist = [p["metadata"]["name"] + "==" + p["metadata"]["version"]
         for p in r if p["download_info"]["url"].endswith((".tar.gz", ".zip"))]
cuda = [p["metadata"]["name"] for p in r
        if p["metadata"]["name"].startswith("nvidia-") or p["metadata"]["name"] == "triton"]
ver = {p["metadata"]["name"]: p["metadata"]["version"] for p in r}
print("packages          :", len(r))
print("protenix / torch  :", ver["protenix"], "/", ver["torch"])
print("CUDA-only wheels  :", len(cuda))
print("built from source :", ", ".join(sorted(sdist)))
EOF'
```

Run 2026-08-27:

```
packages          : 115
protenix / torch  : 2.0.0 / 2.7.1
CUDA-only wheels  : 16
built from source : deepspeed==0.17.5, ihm==2.11, modelcif==1.4, scikit-learn-extra==0.3.0
```

Those four source builds are why the toolchain is a requirement rather than a nicety; on
a bare `python:3.12-slim` the install dies at `error: [Errno 2] No such file or directory:
'gcc'` after downloading most of the tree. Install the compiler first.

```bash
apt-get update && apt-get install -y gcc g++
python -m venv .venv && . .venv/bin/activate
pip install --upgrade protenix --index-url https://pypi.org/simple
```

The explicit index matters: a mirror that lags behind serves an older `protenix` whose
CLI does not match these commands. On a current index the unpinned command above resolves
to 2.0.0.

**The version pins are load-bearing, and one of them fails late.** `biotite==1.4.0` is not
a conservative floor. The structure writer assigns to `atom_array.bonds._bonds`, a private
attribute biotite removed after 1.4 — under biotite 1.7.1 the same call raises
`AttributeError: 'biotite.structure.BondList' object has no attribute '_bonds'`. That
happens when results are written, *after* inference has run, so an unpinned environment
costs you the whole GPU run before it tells you. Do not relax the pins to resolve a
conflict with something else in the environment; give Protenix its own virtualenv.

## Checkpoints, and the one that is missing

Weights download on first use to `$PROTENIX_ROOT_DIR/checkpoint/` — `PROTENIX_ROOT_DIR`
defaults to your home directory, and the chemical component dictionary lands in
`$PROTENIX_ROOT_DIR/common/`. Set it somewhere with room before the first run.

Check what is actually fetchable before planning around a model:

```python
import json, urllib.request, urllib.error

BASE = "https://protenix.tos-cn-beijing.volces.com"
CHECKPOINTS = [
    "protenix-v2", "protenix_base_default_v1.0.0", "protenix_base_20250630_v1.0.0",
    "protenix_base_default_v0.5.0", "protenix_base_constraint_v0.5.0",
    "protenix_mini_default_v0.5.0", "protenix_mini_esm_v0.5.0",
    "protenix_mini_ism_v0.5.0", "protenix_tiny_default_v0.5.0",
]
COMMON = ["components.cif", "components.cif.rdkit_mol.pkl"]

def probe(url, timeout=30):
    req = urllib.request.Request(url, method="HEAD",
                                 headers={"User-Agent": "protenix-skill-check"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, int(r.headers.get("Content-Length") or 0)
    except urllib.error.HTTPError as e:
        return e.code, 0
    except Exception as e:
        return type(e).__name__, 0

rows, total = [], 0
for name in CHECKPOINTS:
    code, size = probe(f"{BASE}/checkpoint/{name}.pt")
    rows.append((name, code, size))
    if code == 200:
        total += size
for name in COMMON:
    code, size = probe(f"{BASE}/common/{name}")
    rows.append(("common/" + name, code, size))

for name, code, size in rows:
    gb = f"{size/2**30:6.2f} GB" if size else "       -"
    flag = "" if code == 200 else "  <-- not downloadable"
    print(f"{name:34} {str(code):>5}  {gb}{flag}")
reachable = sum(1 for _, c, _ in rows if c == 200)
print(f"\n{reachable}/{len(rows)} reachable; "
      f"{total/2**30:.1f} GB if you pull every reachable checkpoint")
json.dump([{"asset": n, "status": c, "bytes": s} for n, c, s in rows],
          open("checkpoint_availability.json", "w"), indent=2)
```

Run 2026-08-27:

```
protenix-v2                          403         -  <-- not downloadable
protenix_base_default_v1.0.0         200    1.37 GB
protenix_base_20250630_v1.0.0        200    1.37 GB
protenix_base_default_v0.5.0         200    1.37 GB
protenix_base_constraint_v0.5.0      200    1.37 GB
protenix_mini_default_v0.5.0         200    0.50 GB
protenix_mini_esm_v0.5.0             200    0.50 GB
protenix_mini_ism_v0.5.0             200    0.50 GB
protenix_tiny_default_v0.5.0         200    0.41 GB
common/components.cif                200    0.46 GB
common/components.cif.rdkit_mol.pkl  200    0.13 GB

10/11 reachable; 7.4 GB if you pull every reachable checkpoint
```

**`protenix-v2` is the headline model and its checkpoint answers 403.** The object store
returns `{"Code":"AccessDenied", ...}` to both `HEAD` and a ranged `GET`, and the URL
baked into the released package is the same one. So `-n protenix-v2` will fail at download
time no matter how the run is configured. Everything else on the list downloads. Until
that object is published, `protenix_base_default_v1.0.0` is the best checkpoint you can
actually obtain, and `protenix_base_20250630_v1.0.0` is the same architecture trained to a
2025-06-30 cutoff — prefer the latter for anything where a recent structure in the
training data is a help rather than a leak, and the former when you are benchmarking
against AlphaFold 3's 2021-09-30 cutoff.

Choosing among the rest:

| checkpoint | params | when |
|---|---|---|
| `protenix_base_default_v1.0.0` | 368 M | Default. Supports templates and RNA MSA. |
| `protenix_base_20250630_v1.0.0` | 368 M | Same, trained through 2025-06-30. Applied work. |
| `protenix_base_constraint_v0.5.0` | 368 M | When you have pocket or contact priors to impose. |
| `protenix_mini_default_v0.5.0` | 134 M | High-throughput screening. |
| `protenix_tiny_default_v0.5.0` | 110 M | Cheapest; triage only. |
| `protenix_mini_esm_v0.5.0` / `_ism_` | 135 M | Single-sequence targets with no usable MSA. Pulls an ESM2-3B checkpoint on top. |

The mini and tiny models are not just smaller — their recommended settings are also
shallower (`N_cycle` 4 and 5 diffusion steps against 10 and 200 for the base models), so
the speed difference is much larger than the parameter count suggests, and so is the
accuracy gap. Use `--use_default_params true` to get the right settings for whichever you
pick rather than carrying base-model settings onto a tiny model.

## The input JSON

One JSON file describes one or more jobs. Five entity types — `proteinChain`,
`dnaSequence`, `rnaSequence`, `ligand`, `ion` — plus optional `covalent_bonds` and
`constraint` blocks.

```python
import json

AA = set("ACDEFGHIKLMNPQRSTVWY") | {"X"}
NT = {"dnaSequence": set("ATGCN"), "rnaSequence": set("AUGCN")}
POLYMERS = {"proteinChain", "dnaSequence", "rnaSequence"}

job = {
    "name": "kras_g12c_complex",
    "sequences": [
        {"proteinChain": {
            "sequence": ("MTEYKLVVVGACGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDGETCLLDILDTAG"
                         "QEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHQYREQIKRVKDSDDVPMVLVGNKCDL"
                         "PSRTVDTKQAQDLARSYGIPFIETSAKTRQGVDDAFYTLVREIRKHKEK"),
            "count": 1, "id": ["A"]}},
        {"dnaSequence": {"sequence": "CTAGGTAACATTACTCGCG", "count": 1, "id": ["B"]}},
        {"dnaSequence": {"sequence": "CGCGAGTAATGTTACCTAG", "count": 1, "id": ["C"]}},
        # SMILES ligand: no CCD_ prefix, a bare SMILES string is recognised as such
        {"ligand": {"ligand": "CC(=O)Oc1ccccc1C(=O)O", "count": 1, "id": ["D"]}},
        # ion: the CCD code carries NO "CCD_" prefix -- unlike a ligand
        {"ion": {"ion": "MG", "count": 2, "id": ["E", "F"]}},
    ],
    "covalent_bonds": [],
}

with open("input.json", "w") as fh:
    json.dump([job], fh, indent=2)          # top level is a LIST, always

n_chains = sum(v["count"] for e in job["sequences"] for v in e.values())
print("entities        :", len(job["sequences"]))
print("chains          :", n_chains)
print("entity types    :", [next(iter(e)) for e in job["sequences"]])
print("wrote input.json:", len(json.dumps([job])), "bytes")
```

```
entities        : 5
chains          : 6
entity types    : ['proteinChain', 'dnaSequence', 'dnaSequence', 'ligand', 'ion']
wrote input.json: 584 bytes
```

Four things the format does not warn you about:

- **A ligand's CCD code is prefixed `CCD_`; an ion's is not.** `"ligand": "CCD_ATP"` and
  `"ion": "MG"`. Writing `"ion": "CCD_MG"` is the single most common input error.
- **DNA is single-stranded.** A duplex is two `dnaSequence` entities, and you write the
  reverse complement yourself. One strand quietly models one strand.
- **`covalent_bonds` entity numbers are 1-based positions in the `sequences` list**, not
  chain ids and not zero-indexed. For a single-CCD, SMILES or FILE ligand `position` is
  always 1; for a multi-CCD glycan like `CCD_NAG_BMA_BGC` it is the index of the CCD.
- **`X` is legal in a protein sequence and means UNK.** It will be modelled as an unknown
  residue rather than rejected, so a sequence carrying stray `X` characters from a
  translation step produces a structure with silent gaps in it.

A validator for the mistakes that survive `json.load`:

```python
import json

AA = set("ACDEFGHIKLMNPQRSTVWY") | {"X"}
ALPHABET = {"proteinChain": AA, "dnaSequence": set("ATGCN"), "rnaSequence": set("AUGCN")}
KINDS = {"proteinChain", "dnaSequence", "rnaSequence", "ligand", "ion"}

def validate(jobs):
    """Catch the input errors Protenix rejects late, or silently models as something else."""
    problems = []
    if not isinstance(jobs, list):
        return ["top level must be a list, even for a single job"]
    for j, job in enumerate(jobs):
        where = f"job[{j}] {job.get('name', '<unnamed>')}"
        ents = job.get("sequences", [])
        if not ents:
            problems.append(f"{where}: no sequences")
        for i, ent in enumerate(ents, start=1):        # entity numbers are 1-based
            if len(ent) != 1:
                problems.append(f"{where} entity {i}: exactly one key expected, got {list(ent)}")
                continue
            kind, body = next(iter(ent.items()))
            if kind not in KINDS:
                problems.append(f"{where} entity {i}: unknown entity type {kind!r}")
                continue
            count = body.get("count", 1)
            ids = body.get("id")
            if ids is not None and len(ids) != count:
                problems.append(f"{where} entity {i}: id has {len(ids)} entries, count is {count}")
            if kind in ALPHABET:
                seq = body.get("sequence", "")
                bad = sorted(set(seq) - ALPHABET[kind])
                if not seq:
                    problems.append(f"{where} entity {i}: empty {kind} sequence")
                elif bad:
                    problems.append(f"{where} entity {i}: {kind} has illegal residues {bad}")
            elif kind == "ligand":
                lig = body.get("ligand", "")
                if not lig:
                    problems.append(f"{where} entity {i}: empty ligand")
                elif lig.startswith("FILE_") and "." not in lig:
                    problems.append(f"{where} entity {i}: FILE_ ligand needs a real file path")
            elif kind == "ion":
                ion = body.get("ion", "")
                # the single most common input error: an ion is a bare CCD code
                if ion.startswith("CCD_"):
                    problems.append(f"{where} entity {i}: ion {ion!r} must NOT carry the "
                                    f"CCD_ prefix -- write {ion[4:]!r}")
                elif not ion.isalnum():
                    problems.append(f"{where} entity {i}: ion {ion!r} is not a CCD code")
        for b, bond in enumerate(job.get("covalent_bonds", [])):
            for side in ("1", "2"):
                e = bond.get(f"entity{side}")
                if e is None:
                    problems.append(f"{where} bond {b}: missing entity{side}")
                elif not 1 <= int(e) <= len(ents):
                    problems.append(f"{where} bond {b}: entity{side}={e} is out of range "
                                    f"1..{len(ents)} (entity numbers are 1-based)")
    return problems

jobs = json.load(open("input.json"))
print("input.json      :", validate(jobs) or "valid")

CASES = {
    "ion with CCD_ prefix":
        [{"name": "x", "sequences": [{"ion": {"ion": "CCD_MG", "count": 1}}]}],
    "T in an RNA sequence":
        [{"name": "x", "sequences": [{"rnaSequence": {"sequence": "GATTACA", "count": 1}}]}],
    "id list shorter than count":
        [{"name": "x", "sequences": [{"proteinChain": {"sequence": "MKV", "count": 2,
                                                       "id": ["A"]}}]}],
    "bond to a 0-indexed entity":
        [{"name": "x", "sequences": [{"proteinChain": {"sequence": "MKV", "count": 1}}],
          "covalent_bonds": [{"entity1": "0", "position1": "1", "atom1": "CA",
                              "entity2": "1", "position2": "1", "atom2": "N"}]}],
    "single job not wrapped in a list":
        {"name": "x", "sequences": []},
}
for label, doc in CASES.items():
    print(f"{label:30}: {validate(doc)[0]}")
```

```
input.json      : valid
ion with CCD_ prefix          : job[0] x entity 1: ion 'CCD_MG' must NOT carry the CCD_ prefix -- write 'MG'
T in an RNA sequence          : job[0] x entity 1: rnaSequence has illegal residues ['T']
id list shorter than count    : job[0] x entity 1: id has 1 entries, count is 2
bond to a 0-indexed entity    : job[0] x bond 0: entity1=0 is out of range 1..1 (entity numbers are 1-based)
single job not wrapped in a list: top level must be a list, even for a single job
```

Run against the eleven JSON files the project ships as examples, this passes all eight
that are job inputs and flags the other three — which are not job inputs at all but
JSON-wrapped mmCIF templates, a different schema living in the same tree under the same
extension. Do not point `-i` at a directory and assume everything in it is a job.

## MSA and templates

Protenix is an MSA model. Every base checkpoint expects a protein MSA, and accuracy drops
without one — the `_esm_` and `_ism_` variants exist precisely because single-sequence
prediction needs a different model, not a flag.

Two ways to supply it. Either point at files you already have, per chain:

```json
{"proteinChain": {"sequence": "MTEY...", "count": 1,
                  "pairedMsaPath": "/abs/path/pairing.a3m",
                  "unpairedMsaPath": "/abs/path/non_pairing.a3m",
                  "templatesPath": "/abs/path/hmmsearch.a3m"}}
```

…or let the CLI search for you and rewrite the JSON with the paths it produced:

```bash
# MSA + template search, writing an updated JSON into ./prepped
protenix prep -i input.json -o ./prepped

# MSA + template only, without the RNA MSA step
protenix mt -i input.json -o ./prepped
```

`prep` posts to a remote search service — `https://protenix-server.com/api/msa` by
default, overridable through `MMSEQS_SERVICE_HOST_URL`, with `--msa_server_mode colabfold`
switching to `https://api.colabfold.com`. **Your sequences leave your machine.** For an
unpublished target that is a disclosure decision, not a configuration detail; run a local
MMseqs2/ColabFold search and use `pairedMsaPath` instead if it matters.

Absolute paths in the JSON. A relative path resolves against the working directory the
runner happens to have, which is not where you wrote the file.

Template and RNA-MSA features additionally need `kalign` and `hmmer` on `PATH`, and they
are off unless you pass `--use_template true` / `--use_rna_msa true`. An input carrying
`templatesPath` with the flag left at its default is silently predicted without templates.

## Running a prediction

```bash
export PROTENIX_ROOT_DIR=/data/protenix        # weights and CCD land here

protenix pred \
  -i ./prepped/input.json \
  -o ./output \
  -n protenix_base_default_v1.0.0 \
  -s 101,102,103,104,105 \
  -e 5 \
  --use_template true \
  --use_default_params true \
  --need_atom_confidence true
```

| flag | meaning |
|---|---|
| `-s` | seeds, comma separated. Each seed is an independent trajectory. |
| `-e` | diffusion samples per seed. Five seeds × five samples is 25 structures. |
| `-c` / `-p` | Pairformer recycles and diffusion steps. `--use_default_params` sets both correctly for the chosen checkpoint; override only deliberately. |
| `-d` | `bf16` (default) or `fp32`. |
| `--need_atom_confidence` | also writes the per-atom PAE/pLDDT arrays, not just the summary. |

**Sampling is the accuracy knob.** Protenix's own reporting is that going from a handful
of samples to hundreds buys consistent gains on hard targets such as antibody–antigen
complexes, which is why multi-seed fan-out is the normal way to run it rather than an
optimisation. Cost scales with seeds × samples and, superlinearly, with token count, so a
run is minutes for a small monomer at default settings and can reach many hours for a
large complex fanned out across seeds. Those are orders of magnitude, not measurements —
no timing in this skill was measured, because the validating host has no GPU.

## What comes out

```
output/<dataset>/<job name>/seed_<seed>/predictions/
  <name>_sample_0.cif                              coordinates, best-ranked first
  <name>_summary_confidence_sample_0.json          one per sample
  <name>_full_data_sample_0.json                   only with --need_atom_confidence
```

The `_sample_N` suffix is a **rank, not an index**: the dumper sorts by `ranking_score`
descending and names each file by its position in that order, so `_sample_0` is the best
sample of that seed. It is not the zeroth trajectory. Across several seeds you have
several `_sample_0` files and still have to compare them on `ranking_score` yourself.

## Reading the confidence numbers

This is where predictions get over-read, and one field is actively misleading.

| field | what it is |
|---|---|
| `plddt` | mean per-**atom** pLDDT × 100, over every atom in the model |
| `ptm` | predicted TM-score for the whole complex |
| `iptm` | pTM restricted to **cross-chain** token pairs — the interface |
| `gpde` | contact-weighted mean predicted distance error, in ångström. Lower is better |
| `has_clash` | 0/1 steric clash flag |
| `disorder` | present, and always exactly 0 |
| `ranking_score` | `0.8·iptm + 0.2·ptm + 0.5·disorder − 100·has_clash` |
| `chain_ptm`, `chain_iptm`, `chain_plddt` | per chain |
| `chain_pair_iptm`, `chain_pair_iptm_global`, `chain_pair_pae_min` | per chain pair |

**`iptm` is exactly 0 for anything with one chain.** It averages over token pairs in
*different* chains; with a single chain there are none, and the guarded division returns
zero rather than a null or an error. That flows straight into `ranking_score`, which
therefore collapses to `0.2 · ptm` and can never exceed 0.2 for a monomer — while a
mediocre dimer scores four times higher. Protenix's own scoring functions import without
weights or a GPU, so this is checkable rather than something to take on trust:

```python
import torch
from protenix.model.sample_confidence import (
    calculate_ptm, calculate_iptm, get_bin_centers)

# The PAE head's bins, straight from the shipped config (loss.pae).
PAE_BINS = {"min_bin": 0, "max_bin": 32, "no_bins": 64}
centers = get_bin_centers(**PAE_BINS)

def pae_prob(target, sigma=1.5):
    """A PAE distribution peaked at `target` angstroms for every token pair."""
    d = -((centers.view(1, 1, 1, -1) - target.unsqueeze(-1)) ** 2) / (2 * sigma ** 2)
    return torch.softmax(d, dim=-1)

def scene(chain_sizes, within=1.5, between=20.0):
    """Tokens grouped into chains; confident inside each chain, vague between them."""
    asym = torch.cat([torch.full((n,), i) for i, n in enumerate(chain_sizes)]).long()
    same = asym[:, None] == asym[None, :]
    target = torch.where(same, torch.tensor(within), torch.tensor(between))
    return pae_prob(target.unsqueeze(0)), asym, torch.ones(len(asym), dtype=torch.bool)

def score(prob, asym, has_frame):
    ptm = calculate_ptm(prob, has_frame=has_frame, **PAE_BINS)
    iptm = calculate_iptm(prob, has_frame=has_frame, asym_id=asym, **PAE_BINS)
    # Exactly the expression in sample_confidence.py, with disorder hard-wired to zero
    # and no clash.
    ranking = 0.8 * iptm + 0.2 * ptm + 0.5 * 0.0 - 100 * 0.0
    return ptm.item(), iptm.item(), ranking.item()

print(f"{'input':38} {'pTM':>6} {'ipTM':>6} {'ranking_score':>14}")
for label, sizes, between in [
    ("monomer, 120 tokens",              [120], 20.0),
    ("monomer, 300 tokens",              [300], 20.0),
    ("homodimer, confident interface",   [120, 120], 1.5),
    ("homodimer, vague interface",       [120, 120], 20.0),
    ("trimer, confident interface",      [80, 80, 80], 1.5),
    ("protein + 1-token ligand, close",  [120, 1], 1.5),
]:
    prob, asym, hf = scene(sizes, between=between)
    p, i, r = score(prob, asym, hf)
    print(f"{label:38} {p:6.3f} {i:6.3f} {r:14.3f}")

# The claim, asserted rather than asserted-about.
prob, asym, hf = scene([120], between=20.0)
p, i, r = score(prob, asym, hf)
assert i == 0.0, f"ipTM for a single-chain input was {i}, expected exactly 0"
assert abs(r - 0.2 * p) < 1e-6
print(f"\nsingle chain -> ipTM is exactly {i}, so ranking_score == 0.2 * pTM "
      f"({r:.3f} == {0.2 * p:.3f})")
print("ranking_score for a monomer can never exceed 0.2, whatever the prediction.")
```

```
input                                     pTM   ipTM  ranking_score
monomer, 120 tokens                     0.802  0.000          0.160
monomer, 300 tokens                     0.899  0.000          0.180
homodimer, confident interface          0.881  0.881          0.881
homodimer, vague interface              0.479  0.077          0.158
trimer, confident interface             0.881  0.881          0.881
protein + 1-token ligand, close         0.804  0.804          0.804

single chain -> ipTM is exactly 0.0, so ranking_score == 0.2 * pTM (0.160 == 0.160)
ranking_score for a monomer can never exceed 0.2, whatever the prediction.
```

Four things that table settles:

- **Never compare `ranking_score` between jobs with different chain counts.** It is a
  within-job ranking key, not a quality score. For a monomer, rank on `ptm` and `plddt`.
- **`disorder` contributes nothing.** AlphaFold 3's published ranking expression includes a
  disorder term; here it is initialised to zeros and never filled, so the `0.5·disorder`
  term is dead weight in the formula. Do not read a `disorder` of 0 as "no disorder
  predicted" — nothing was predicted.
- **`has_clash` costs 100 points.** A clashing sample sorts below every clean one no matter
  how good its pTM. That is deliberate, but it means `ranking_score` is bimodal and its
  numeric distance is meaningless across the gap.
- **pTM is size-normalised.** The two monomer rows carry identical per-pair confidence and
  differ only in length, and the longer one scores higher. Comparing pTM across proteins of
  very different size compares the normalisation as much as the prediction.

A single ligand modelled as its own chain does count as an interface, which is what makes
`iptm` meaningful for protein–ligand jobs — the last row above.

### Ranking a run

```python
import json, os, torch
from protenix.model.sample_confidence import break_down_to_per_sample_dict
from protenix.utils.file_io import save_json
from runner.dumper import DataDumper

# Five diffusion samples, as `-e 5` would produce. Values stand in for a real run;
# every field name, the file naming and the ordering come from the shipped dumper.
summary = {
    "plddt":        torch.tensor([84.1, 91.7, 62.0, 88.4, 79.3]),
    "ptm":          torch.tensor([0.81, 0.90, 0.55, 0.87, 0.77]),
    "iptm":         torch.tensor([0.74, 0.88, 0.41, 0.85, 0.69]),
    "gpde":         torch.tensor([2.10, 1.40, 6.80, 1.70, 2.90]),
    "has_clash":    torch.tensor([0.0, 0.0, 0.0, 1.0, 0.0]),
    "disorder":     torch.zeros(5),
    "num_recycles": torch.tensor(10),
}
summary["ranking_score"] = (0.8 * summary["iptm"] + 0.2 * summary["ptm"]
                            + 0.5 * summary["disorder"] - 100 * summary["has_clash"])
per_sample = break_down_to_per_sample_dict(summary, shared_keys=["num_recycles"])

out = "predictions"
os.makedirs(out, exist_ok=True)
ranks = DataDumper(base_dir=".")._get_ranker_indices({"summary_confidence": per_sample})
for idx, rank in enumerate(ranks):
    save_json(per_sample[idx], f"{out}/demo_summary_confidence_sample_{rank}.json", indent=4)

# --- what a reader actually does with the directory -------------------------
def read_summary(path):
    d = json.load(open(path))
    return {k: (v.item() if hasattr(v, "item") else v) for k, v in d.items()}

rows = []
for fn in sorted(os.listdir(out)):
    s = read_summary(f"{out}/{fn}")
    rows.append((fn.split("_sample_")[1].split(".")[0], s))
rows.sort(key=lambda r: int(r[0]))

print(f"{'file':10} {'pLDDT':>7} {'pTM':>6} {'ipTM':>6} {'gPDE':>6} {'clash':>6} {'ranking':>9}")
for rank, s in rows:
    print(f"sample_{rank:<3} {s['plddt']:7.1f} {s['ptm']:6.2f} {s['iptm']:6.2f} "
          f"{s['gpde']:6.2f} {s['has_clash']:6.0f} {s['ranking_score']:9.2f}")

best = rows[0][1]
print(f"\nsample_0 is the model to use: ranking_score {best['ranking_score']:.2f}")
assert best["ranking_score"] == max(s["ranking_score"] for _, s in rows)
clashing = [r for r, s in rows if s["has_clash"]]
print(f"the clashing sample sorted to rank {clashing[0]} — has_clash costs 100 points, "
      f"so any clash sinks a sample regardless of its pTM")
```

```
file         pLDDT    pTM   ipTM   gPDE  clash   ranking
sample_0      91.7   0.90   0.88   1.40      0      0.88
sample_1      84.1   0.81   0.74   2.10      0      0.75
sample_2      79.3   0.77   0.69   2.90      0      0.71
sample_3      62.0   0.55   0.41   6.80      0      0.44
sample_4      88.4   0.87   0.85   1.70      1    -99.15

sample_0 is the model to use: ranking_score 0.88
the clashing sample sorted to rank 4 — has_clash costs 100 points, so any clash sinks a sample regardless of its pTM
```

The clashing sample carries the second-best pLDDT and the second-best pTM in that set and
still lands last. If you rank on pLDDT — the obvious thing to do — you pick it.

### pLDDT in the coordinate file

The `B_iso_or_equiv` column of the output mmCIF carries pLDDT, not a temperature factor.
Two details that differ from what you may expect from other predictors: it is **per atom**,
not one value repeated across a residue, and the model emits it on 0–1 (the pLDDT head's
bins run `min_bin: 0, max_bin: 1.0`) with the writer multiplying by 100. So the file holds
0–100 and the summary `plddt` is the mean of that column.

This check writes a file through Protenix's own writer, which reads the chemical component
dictionary — so run it after a prediction has populated `$PROTENIX_ROOT_DIR/common/`, or
it stops at `FileNotFoundError` on `components.cif` before reaching the assertions.

```python
import numpy as np, torch, biotite.structure as struc
from protenix.data.utils import save_structure_cif

# Does the B-factor column really carry pLDDT, and on what scale? Round-trip a known
# vector through the writer Protenix actually uses and read the column back.
N = 12
atoms = struc.AtomArray(N)
atoms.coord = np.zeros((N, 3), dtype=np.float32)
atoms.chain_id = np.array(["A"] * N)
atoms.res_id = np.repeat(np.arange(1, N // 3 + 1), 3)
atoms.res_name = np.array(["GLY"] * N)
atoms.atom_name = np.array(["N", "CA", "C"] * (N // 3))
atoms.element = np.array(["N", "C", "C"] * (N // 3))
atoms.set_annotation("label_entity_id", np.array(["1"] * N))
atoms.set_annotation("label_asym_id", np.array(["A"] * N))
atoms.set_annotation("label_seq_id", atoms.res_id.astype(str))
atoms.set_annotation("auth_seq_id", atoms.res_id.astype(str))
atoms.set_annotation("auth_asym_id", np.array(["A"] * N))
atoms.set_annotation("occupancy", np.ones(N, dtype=np.float32))
atoms.set_annotation("charge", np.zeros(N, dtype=int))
# Protenix's CIF writer emits _struct_conn, so the AtomArray must carry a BondList.
bonds = [[i, i + 1, 1] for i in range(N - 1)]
atoms.bonds = struc.BondList(N, np.array(bonds, dtype=np.uint32))

atom_plddt = torch.rand(N)                             # what the model emits: 0-1
b_factor = np.round((atom_plddt.numpy() * 100.0), 2)   # what the dumper writes
atoms.set_annotation("b_factor", b_factor)

save_structure_cif(atom_array=atoms, pred_coordinate=torch.zeros(N, 3),
                   output_fpath="demo.cif", entity_poly_type={"1": "polypeptide(L)"},
                   pdb_id="demo", save_wo_unresolved=False)

def plddt_from_cif(path):
    """Read per-ATOM pLDDT out of the B_iso_or_equiv column of a Protenix mmCIF."""
    import gemmi
    doc = gemmi.cif.read(path)
    tab = doc.sole_block().find("_atom_site.", ["label_atom_id", "B_iso_or_equiv"])
    return [(r[0], float(r[1])) for r in tab]

got = plddt_from_cif("demo.cif")
print("atoms in file        :", len(got))
print("range                : %.2f - %.2f" % (min(v for _, v in got), max(v for _, v in got)))
recovered = np.array([v for _, v in got])
print("max round-trip error : %.4f" % np.abs(recovered - b_factor).max())

assert len(got) == N                                  # one B-factor per ATOM, not per residue
assert np.allclose(recovered, b_factor, atol=1e-6)
assert recovered.min() >= 0 and recovered.max() <= 100
print("\nB_iso_or_equiv carries per-ATOM pLDDT on a 0-100 scale, one value per atom.")
print("summary plddt is the mean over ATOMS x 100: %.2f" % (atom_plddt.mean().item() * 100))
print("recomputed from the file column            : %.2f" % recovered.mean())
assert abs(recovered.mean() - atom_plddt.mean().item() * 100) < 0.01
```

Because the mean is over **atoms**, it is not a per-residue average: a tryptophan
contributes 14 heavy atoms and a glycine 4, and a large ligand can move the number on its
own. When you report confidence over a region, average the column over the atoms of that
region rather than quoting the global figure.

Bands to read pLDDT by — the same convention AlphaFold established, and worth stating
because a confidently-reported structure at pLDDT 40 is a guess presented as a result:
above 90 backbone and side chains are both reliable; 70–90 the backbone is reliable;
50–70 treat as a hypothesis; below 50 do not interpret as structure, and read it as a
signal of disorder rather than of failure.

And PAE, in `_full_data_sample_*.json` under `token_pair_pae`, answers the question pLDDT
cannot: aligned on token *i*, how wrong is token *j*. Two domains can each be at pLDDT 95
and be placed wrongly relative to one another. Anything that spans chains or domains — a
distance measurement, a binding site, a docking pose — needs PAE or `chain_pair_pae_min`
checked before it is reported.

## Limits

- **One conformation per sample.** Diffusion samples are not a conformational ensemble
  and their spread is not a free-energy landscape.
- **The training cutoff decides what "prediction" means.** `protenix_base_default_v1.0.0`
  is cut at 2021-09-30 and `protenix_base_20250630_v1.0.0` at 2025-06-30. A target whose
  experimental structure predates the cutoff is recall, not prediction, and benchmarking
  on one is self-congratulation.
- **No affinity prediction.** Protenix returns a pose and confidence, not a binding
  constant. `boltz2-nim` is the skill for a predicted pIC50.
- **Confidence is not accuracy.** It is the model's self-assessment, and confidently wrong
  predictions exist — particularly for interfaces with no homologous complex in training.
- **Polymer–polymer covalent bonds are largely unsupported**, with the documented
  exceptions of cyclic-peptide head-to-tail amides and disulfides. Other such bonds are
  accepted in the input and not reliably formed in the output — the residues end up near
  each other and not bonded, which looks like a near miss rather than an unsupported
  feature.
- **`protenix-v2` is undownloadable** at the URL the package uses, so the model behind the
  headline benchmark numbers is not currently the model you can run.

## Try it

A cold check that this skill still holds: the input grammar it teaches, and whether the
weights can still be obtained. No GPU, no install, standard library only.

**Data** — the checkpoint and chemical-component objects Protenix downloads on first use:

    https://protenix.tos-cn-beijing.volces.com/checkpoint/protenix_base_default_v1.0.0.pt
    https://protenix.tos-cn-beijing.volces.com/common/components.cif

Both are Apache-2.0 and need no account, key or licence acceptance. Last confirmed
reachable 2026-08-27. The block probes them rather than downloading them — together they
are 1.8 GB.

```python
import json, urllib.request, urllib.error

BASE = "https://protenix.tos-cn-beijing.volces.com"
AA = set("ACDEFGHIKLMNPQRSTVWY") | {"X"}
ALPHABET = {"proteinChain": AA, "dnaSequence": set("ATGCN"), "rnaSequence": set("AUGCN")}
KINDS = {"proteinChain", "dnaSequence", "rnaSequence", "ligand", "ion"}


def validate(jobs):
    problems = []
    if not isinstance(jobs, list):
        return ["top level must be a list, even for a single job"]
    for j, job in enumerate(jobs):
        where = f"job[{j}]"
        ents = job.get("sequences", [])
        if not ents:
            problems.append(f"{where}: no sequences")
        for i, ent in enumerate(ents, start=1):          # entity numbers are 1-based
            kind, body = next(iter(ent.items()))
            if kind not in KINDS:
                problems.append(f"{where} entity {i}: unknown type {kind!r}"); continue
            ids, count = body.get("id"), body.get("count", 1)
            if ids is not None and len(ids) != count:
                problems.append(f"{where} entity {i}: id has {len(ids)}, count is {count}")
            if kind in ALPHABET:
                bad = sorted(set(body.get("sequence", "")) - ALPHABET[kind])
                if bad:
                    problems.append(f"{where} entity {i}: {kind} has illegal residues {bad}")
            elif kind == "ion" and body.get("ion", "").startswith("CCD_"):
                problems.append(f"{where} entity {i}: ion must NOT carry the CCD_ prefix")
        for b, bond in enumerate(job.get("covalent_bonds", [])):
            for side in ("1", "2"):
                e = bond.get(f"entity{side}")
                if e is None or not 1 <= int(e) <= len(ents):
                    problems.append(f"{where} bond {b}: entity{side}={e} outside 1..{len(ents)}")
    return problems


job = {
    "name": "kras_ligand",
    "sequences": [
        {"proteinChain": {"sequence": "MTEYKLVVVGACGVGKSALTIQLIQNHFVDEYDPTIEDSYRKQVVIDG",
                          "count": 1, "id": ["A"]}},
        {"ligand": {"ligand": "CC(=O)Oc1ccccc1C(=O)O", "count": 1, "id": ["B"]}},
        {"ion": {"ion": "MG", "count": 1, "id": ["C"]}},   # ion: no CCD_ prefix
    ],
    "covalent_bonds": [],
}
json.dump([job], open("input.json", "w"), indent=2)
print("input.json valid :", validate(json.load(open("input.json"))) or True)

BAD = {
    "ion written as CCD_MG": [{"sequences": [{"ion": {"ion": "CCD_MG", "count": 1}}]}],
    "T inside an RNA chain": [{"sequences": [{"rnaSequence": {"sequence": "GATTACA"}}]}],
    "id shorter than count": [{"sequences": [{"proteinChain": {"sequence": "MKV",
                                                              "count": 2, "id": ["A"]}}]}],
    "0-indexed bond entity": [{"sequences": [{"proteinChain": {"sequence": "MKV"}}],
                              "covalent_bonds": [{"entity1": "0", "entity2": "1"}]}],
    "job not in a list":     {"sequences": []},
}
for label, doc in BAD.items():
    print(f"rejects {label:22}:", validate(doc)[0])


def probe(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(
                url, method="HEAD", headers={"User-Agent": "protenix-skill-check"}),
                timeout=30) as r:
            return r.status, int(r.headers.get("Content-Length") or 0)
    except urllib.error.HTTPError as e:
        return e.code, 0


print()
for name in ["protenix-v2", "protenix_base_default_v1.0.0", "protenix_tiny_default_v0.5.0"]:
    code, size = probe(f"{BASE}/checkpoint/{name}.pt")
    print(f"{name:32} {code}  {size / 2**30:5.2f} GB" if size
          else f"{name:32} {code}  unavailable")
code, size = probe(f"{BASE}/common/components.cif")
print(f"{'common/components.cif':32} {code}  {size / 2**30:5.2f} GB")

assert probe(f"{BASE}/checkpoint/protenix_base_default_v1.0.0.pt")[0] == 200
assert probe(f"{BASE}/common/components.cif")[0] == 200
```

**Expect**

Invariants — these hold regardless of release, and a failure means the skill is wrong:

- The top level of an input file is a **list**, even for one job.
- An `ion` takes a bare CCD code and a `ligand` takes a `CCD_`-prefixed one. The
  validator rejecting `CCD_MG` as an ion is the check that this asymmetry still exists.
- RNA rejects `T` and DNA rejects `U`; the alphabets are not interchangeable.
- `covalent_bonds` entity numbers are 1-based indices into `sequences`, so `0` is out of
  range for every input.
- An explicit `id` list must have exactly `count` entries.
- `protenix_base_default_v1.0.0` and `components.cif` are fetchable without credentials —
  the two asserts. If either starts refusing, the model is no longer obtainable and the
  skill needs a human decision, not a patch.

Observed 2026-08-27 — sizes move when checkpoints are rebuilt, so treat a mismatch as
drift to investigate rather than a failure:

```
input.json valid : True
rejects ion written as CCD_MG : job[0] entity 1: ion must NOT carry the CCD_ prefix
rejects T inside an RNA chain : job[0] entity 1: rnaSequence has illegal residues ['T']
rejects id shorter than count : job[0] entity 1: id has 1, count is 2
rejects 0-indexed bond entity : job[0] bond 0: entity1=0 outside 1..1
rejects job not in a list     : top level must be a list, even for a single job

protenix-v2                      403  unavailable
protenix_base_default_v1.0.0     200   1.37 GB
protenix_tiny_default_v0.5.0     200   0.41 GB
common/components.cif            200   0.46 GB
```

`protenix-v2` answering 403 is the finding to watch: if it turns 200, the flagship
checkpoint has been published and the checkpoint table above should change.

## Sources

- Protenix — https://github.com/bytedance/Protenix
- Input JSON format — https://github.com/bytedance/Protenix/blob/main/docs/infer_json_format.md
- Supported models — https://github.com/bytedance/Protenix/blob/main/docs/supported_models.md
- Zhang et al. (2026) *Protenix-v2 — Broadening the Reach of Structure Prediction and Biomolecular Design*, bioRxiv — https://doi.org/10.64898/2026.04.10.717613
- Zhang et al. (2026) *Protenix-v1 — Toward High-Accuracy Open-Source Biomolecular Structure Prediction*, bioRxiv — https://doi.org/10.64898/2026.02.05.703733
- ByteDance AML AI4Science Team et al. (2025) *Protenix — Advancing Structure Prediction Through a Comprehensive AlphaFold3 Reproduction*, bioRxiv — https://doi.org/10.1101/2025.01.08.631967
- Abramson et al. (2024) *Nature* 630, 493-500 — the AlphaFold 3 method Protenix reproduces — https://doi.org/10.1038/s41586-024-07487-w

Protenix source and trained parameters are both Apache-2.0. The project states it plainly:
"The Protenix project including both code and model parameters is released under the
Apache 2.0 License. It is free for both academic research and commercial use." Chemical
component definitions come from the wwPDB CCD, which carries its own terms.
