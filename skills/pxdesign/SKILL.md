---
name: pxdesign
description: Design de novo protein binders against a target structure with PXDesign — writing the target YAML in the residue numbering it actually reads, running the diffusion generator behind its AF2-IG and Protenix filters, and reading summary.csv without mistaking which PAE column is in angstrom or which ipTM is the interface. The generator needs an NVIDIA GPU; the checks in this skill do not.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [protein-design, protein-structure, structure-prediction, pae, plddt]
datasets: [https://files.rcsb.org/download/5O45.cif, https://pxdesign.tos-cn-beijing.volces.com/release_model/pxdesign_v0.1.0.pt, https://storage.googleapis.com/alphafold/alphafold_params_2022-12-06.tar]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-28
  against: PXDesign at commit f788441 (2025-12-31) / PXDesignBench v0.1.2 (f6d0d72) / protenix 0.5.0 from PyPI with its scoring module checked byte-identical to the v0.5.0+pxd tag PXDesign pins / torch 2.13.0 CPU, numpy 2.5.2, rdkit 2026.3.5, PyYaml 6.0.3, Python 3.12.8 on arm64 macOS / structures from RCSB PDB / weight objects probed 2026-08-28
  executed: 11
  unverified: 2
  unverified_reason: >-
    The two unexecuted blocks install the CUDA environment and run the design
    pipeline. PXDesign builds custom CUDA kernels, requires CUDA 12.1 or newer,
    and its Protenix filter needs NVIDIA CUTLASS; the validating host has no
    NVIDIA GPU. Re-run both on a linux x86_64 host with a CUDA 12.1+ GPU and
    roughly 9 GB free for weights.
---

# De novo binder design with PXDesign

PXDesign designs a protein binder against a structure you supply. You give it a target
mmCIF, the region of it to keep, optionally the residues you want the binder to sit on,
and a length; it generates backbones with a diffusion model, designs sequences onto them,
folds each design back with two independent predictors, and hands you a ranked CSV with
pass/fail flags. It is from the same group as Protenix and is built on it — the `protenix`
skill covers the co-folding model itself, and the confidence fields it emits, in the
detail this one assumes.

Its own technical report puts nanomolar hit rates at 17–82% on six of seven targets. In the
2026 multi-target campaign that pooled designs from several generators and had them made
and assayed by two contract laboratories, PXDesign contributed 358 — more than any other
generator in the set.

Most of what follows is about the three places this pipeline goes wrong quietly: a target
specification that is syntactically perfect and points at the wrong residues, an install
that resolves and then cannot import, and a results file whose column names invite exactly
the wrong threshold. None of those needs a GPU to catch, which is fortunate, because
almost everything else here does.

## Before you run the model

Running PXDesign is not optional-hardware territory. State of the requirements at
commit `f788441`:

| requirement | why |
|---|---|
| **NVIDIA GPU, CUDA 12.1 or newer** | The installer takes `--cuda-version` and refuses anything below 12.1. Custom kernels are compiled on the first run. |
| **NVIDIA CUTLASS 3.5.1** | Only if you enable `--use_deepspeed_evo_attention`, which the project recommends for the Protenix filter. Expected at `$CUTLASS_PATH`. |
| **linux x86_64** | The dependency tree is `jax[cuda]`, `deepspeed` and a CUDA base image. |
| **~9 GB of disk** | 3.4 GB of PXDesign and Protenix weights plus chemical data, and 5.2 GB of AlphaFold2 parameters. |
| Python 3.10 or newer | `python_requires=">=3.10"`. |

A CPU branch exists in the generator's runner — it selects `torch.device("cpu")` when no
CUDA device is present, and the autocast context is guarded on `torch.cuda.is_available()`
rather than assumed — but it is not a way to run this. The installed tree is `jax[cuda]`
and `deepspeed`, the AF2-IG filter runs through CUDA JAX, the Protenix filter compiles CUDA
kernels, and nothing in the project documents or benchmarks CPU inference. The `protenix`
skill records the same shape in the predictor underneath. Treat it as a code path that
exists, not as an option.

**If you do not have a GPU, the project's own hosted web server is the route it
recommends**, free and with no install — and the ordinary caveat applies, which is that
your target and your designs leave your machine, so an unpublished target is a disclosure
decision rather than a configuration one.

No account, no key and no click-through licence for the local route. Weights are plain
HTTPS objects.

**What this skill verifies without a GPU**, and what it therefore lets you check before
committing to a run: the weights are fetchable and what licence each carries, the install
actually imports, your target specification points at the residues you meant, and what the
numbers in `summary.csv` mean. Two blocks below install and run the model itself; they are
marked and were not executed here.

## Three licences, and only one of them is PXDesign's

PXDesign's code is Apache-2.0 and its README states the project "is free for both academic
research and commercial use". Two things that sentence does not settle, and both matter
before you build on the output.

**The model parameters are not licensed separately.** Protenix says explicitly that its
release covers "both code and model parameters"; PXDesign says "this project", names no
parameters, and serves the weights from an object store with no LICENSE file beside them
and no terms page. Read that as the Apache-2.0 grant extending to them by the plain sense
of "this project" — but if your legal position depends on it, that is a question for the
address in the repository rather than an inference from a README.

**The pipeline pulls three sets of third-party weights, and they are not all Apache-2.0.**
The first block gets the licence for the largest of them out of the archive itself:

```python
import urllib.error
import urllib.request as U

def head(url):
    try:
        r = U.urlopen(U.Request(url, method="HEAD",
                                headers={"User-Agent": "pxdesign-skill-check"}), timeout=60)
        return r.status, int(r.headers.get("Content-Length") or 0)
    except urllib.error.HTTPError as e:
        return e.code, 0

PXD = "https://pxdesign.tos-cn-beijing.volces.com"
OBJECTS = [
    ("release_model/pxdesign_v0.1.0.pt",                    "PXDesign-d diffusion weights"),
    ("release_model/protenix_base_default_v0.5.0.pt",       "Protenix base, the strict filter"),
    ("release_model/protenix_mini_default_v0.5.0.pt",       "Protenix mini"),
    ("release_model/protenix_mini_tmpl_v0.5.0.pt",          "Protenix mini, templates"),
    ("release_data/components.v20240608.cif",               "wwPDB chemical components"),
    ("release_data/components.v20240608.cif.rdkit_mol.pkl", "RDKit cache for the above"),
    ("release_data/clusters-by-entity-40.txt",              "PDB 40% identity clusters"),
]
total = 0
for path, what in OBJECTS:
    code, n = head(f"{PXD}/{path}")
    total += n
    print(f"{path:52} {code}  {n/2**30:6.3f} GB  {what}")
print(f"{'':52}      {total/2**30:6.3f} GB  total, fetched on first run")

# The AlphaFold2 parameters the AF2-IG filter needs are a separate archive from
# Google and carry their own licence. Read that licence out of the tar without
# downloading 5 GB: walk the member headers with ranged GETs.
AF2 = "https://storage.googleapis.com/alphafold/alphafold_params_2022-12-06.tar"

def chunk(url, off, n):
    return U.urlopen(U.Request(url, headers={"Range": f"bytes={off}-{off+n-1}"}),
                     timeout=60).read()

off, members = 0, []
while True:
    h = chunk(AF2, off, 512)
    name = h[0:100].rstrip(b"\x00").decode("utf-8", "replace").strip()
    if not name:
        break
    size = int(h[124:136].rstrip(b"\x00 ").decode(), 8)
    members.append((name, size, off + 512))
    off += 512 + ((size + 511) // 512) * 512

print(f"\nalphafold_params_2022-12-06.tar: {len(members)} members, "
      f"{sum(s for _, s, _ in members)/2**30:.2f} GB")
lic = [m for m in members if m[0] == "LICENSE"]
assert lic, "no LICENSE member in the AlphaFold2 parameter archive"
name, size, body = lic[0]
first = chunk(AF2, body, 200).decode("utf-8", "replace").splitlines()[0]
print(f"LICENSE member: {size} bytes, first line: {first!r}")
assert "Attribution 4.0" in first and "NonCommercial" not in first
print("-> the AlphaFold2 parameters are CC BY 4.0, read from the archive itself")
```

Run 2026-08-28:

```
release_model/pxdesign_v0.1.0.pt                     200   0.518 GB  PXDesign-d diffusion weights
release_model/protenix_base_default_v0.5.0.pt        200   1.373 GB  Protenix base, the strict filter
release_model/protenix_mini_default_v0.5.0.pt        200   0.500 GB  Protenix mini
release_model/protenix_mini_tmpl_v0.5.0.pt           200   0.501 GB  Protenix mini, templates
release_data/components.v20240608.cif                200   0.398 GB  wwPDB chemical components
release_data/components.v20240608.cif.rdkit_mol.pkl  200   0.117 GB  RDKit cache for the above
release_data/clusters-by-entity-40.txt               200   0.020 GB  PDB 40% identity clusters
                                                           3.428 GB  total, fetched on first run

alphafold_params_2022-12-06.tar: 16 members, 5.20 GB
LICENSE member: 18657 bytes, first line: 'Attribution 4.0 International'
-> the AlphaFold2 parameters are CC BY 4.0, read from the archive itself
```

So the full picture, and none of it blocks commercial use:

| component | licence | where it comes from |
|---|---|---|
| PXDesign code | Apache-2.0 | the repository's LICENSE |
| PXDesign and Protenix weights | Apache-2.0 by the project's own statement, not stated separately for parameters | `pxdesign.tos-cn-beijing.volces.com` |
| PXDesignBench, the evaluation half | Apache-2.0 | its own repository |
| AlphaFold2 parameters | **CC BY 4.0** — attribution required | Google's archive, verified above |
| ProteinMPNN weights | MIT | cloned from the ProteinMPNN repository by the download script |
| ColabDesign, which drives AF2-IG | **Beerware, revision 42** — "do whatever you want with this stuff" | installed from source; GitHub reports it as unrecognised |

Two of those are worth carrying into a methods section. The CC BY 4.0 on the AlphaFold2
parameters is an attribution obligation on anything downstream of the AF2-IG filter, and
the Beerware licence on ColabDesign is permissive but unusual enough that a licence audit
tool will flag it as unknown rather than as fine.

## Set up the half that needs no GPU

Everything in this skill except the two marked blocks runs in this environment. `protenix`
goes in with `--no-deps` deliberately — here it is a library for reading its own scoring
code and your own files on CPU, and its pinned CUDA tree is three gigabytes you do not
need for that.

```bash
python3 -m venv .venv
./.venv/bin/pip install --quiet --disable-pip-version-check torch numpy rdkit ml_collections click pyyaml
./.venv/bin/pip install --quiet --disable-pip-version-check --no-deps protenix==0.5.0

# PXDesign is not on PyPI. The repository is the only distribution.
git clone --depth 1 https://github.com/bytedance/PXDesign.git

# The target the shipped example designs against, taken from the PDB rather than
# the repository copy so the checks below run against what you would download.
curl -sSL -o 5O45.cif https://files.rcsb.org/download/5O45.cif

./.venv/bin/python -c "import torch; print('torch', torch.__version__, '| CUDA available:', torch.cuda.is_available())"
ls -d PXDesign 5O45.cif
```

```
torch 2.13.0 | CUDA available: False
5O45.cif
PXDesign
```

Run every Python block below with `./.venv/bin/python`, from this directory.

## Installing the model itself

The project supports a conda installer and a Docker image; the installer is the shorter
route and takes the CUDA version it should build against.

```bash
# unverified — needs an NVIDIA GPU and CUDA 12.1 or newer, which the validating host lacks
cd PXDesign
bash install.sh --env pxdesign --pkg_manager conda --cuda-version 12.1
conda activate pxdesign
pip install -e .                     # editable, and see below for why that matters
bash download_tool_weights.sh        # AlphaFold2 parameters, ProteinMPNN weights, CCD cache
pxdesign pipeline --help
```

`download_tool_weights.sh` fetches the third-party weights from the table above and is the
step that costs 5 GB. PXDesign's own checkpoints and Protenix's download themselves on the
first run.

**Two things will cost you an afternoon**, and both are visible without a GPU.

### `pip install .` produces a package that cannot start

Two subdirectories of the package ship without an `__init__.py`. `find_packages()` never
lists them, so an ordinary install copies neither, and the CLI then fails at import on the
config it needs. An editable install works because the source tree stays on the path,
where such a directory still resolves as a namespace package.

```bash
./.venv/bin/python - <<'PY'
import os
for d, _, files in os.walk("PXDesign/pxdesign"):
    if "__pycache__" not in d:
        print("package      " if "__init__.py" in files else "NOT A PACKAGE", d)
PY

./.venv/bin/pip install --quiet --disable-pip-version-check --no-deps ./PXDesign
./.venv/bin/python -c "import pxdesign, os; print('installed:', sorted(
    d for d in os.listdir(os.path.dirname(pxdesign.__file__)) if not d.startswith('__')))"
./.venv/bin/python -c "import pxdesign.configs" 2>&1 | tail -1

# The editable install the project documents keeps the source tree on the path,
# where a directory without __init__.py still resolves as a namespace package.
./.venv/bin/pip uninstall --quiet -y pxdesign
./.venv/bin/pip install --quiet --disable-pip-version-check --no-deps -e ./PXDesign
./.venv/bin/python -c "import pxdesign.configs; print('under -e, pxdesign.configs resolves')"
```

```
package       PXDesign/pxdesign
package       PXDesign/pxdesign/runner
package       PXDesign/pxdesign/utils
NOT A PACKAGE PXDesign/pxdesign/configs
package       PXDesign/pxdesign/model
package       PXDesign/pxdesign/data
NOT A PACKAGE PXDesign/pxdesign/pxd_server
installed: ['data', 'model', 'runner', 'utils']
ModuleNotFoundError: No module named 'pxdesign.configs'
under -e, pxdesign.configs resolves
```

Always `pip install -e .`, which is what the project's own Docker instructions do. Anything
that builds a wheel and installs it — a lockfile pipeline, a conda recipe, a CI image —
produces the broken tree instead, and it fails at the first subcommand rather than at
install time.

### The Protenix requirement that resolves is not the one that works

`requirements.txt` asks for `protenix>=0.1.0`, and the Dockerfile installs a git tag,
`v0.5.0+pxd`. Those are not the same thing. The tag is 54 commits and 63 changed files ahead
of the `v0.5.0` release, and one of those files decides whether PXDesign can build its own
config at all.

```python
import difflib, urllib.request

def source(tag, path="protenix/config/extend_types.py"):
    url = f"https://raw.githubusercontent.com/bytedance/Protenix/{tag}/{path}"
    return urllib.request.urlopen(url, timeout=60).read().decode().splitlines(True)

print("".join(difflib.unified_diff(source("v0.5.0"), source("v0.5.0%2Bpxd"),
                                   "protenix v0.5.0", "protenix v0.5.0+pxd", n=2)), end="")

# PXDesign's own inference config asks for exactly the call that line governs.
from protenix.config.extend_types import ListValue
try:
    ListValue([], dtype=int)              # pxdesign/configs/configs_infer.py, "seeds"
    print("\nListValue([], dtype=int) is accepted -> this Protenix can build the config")
except IndexError as e:
    print(f"\nListValue([], dtype=int) raises IndexError: {e}")
    print("-> every pxdesign subcommand dies at import against a released Protenix")
```

```
--- protenix v0.5.0
+++ protenix v0.5.0+pxd
@@ -40,5 +40,5 @@
         if value is not None:
             self.value = value
-            self.dtype = type(value[0])
+            self.dtype = dtype or type(value[0])
         else:
             self.value = None

ListValue([], dtype=int) raises IndexError: list index out of range
-> every pxdesign subcommand dies at import against a released Protenix
```

Every published Protenix release still carries the unfixed line, 2.0.0 included, so
"upgrade Protenix" makes this worse rather than better. Install
`git+https://github.com/bytedance/Protenix.git@v0.5.0+pxd`, and do not let a dependency
resolver talk you out of it. Give PXDesign its own environment: this pin is incompatible
with anything else that wants a current Protenix.

## The target YAML, and the numbering that will bite you

One file describes one design job.

```yaml
binder_length: 80
target:
  file: 5O45.cif
  chains:
    A:
      crop: ["1-116"]            # discontinuous is a list: ["1-186", "311-500"]
      hotspots: [40, 99, 107]    # residues the binder should sit on
      msa: msa/PDL1/0            # a directory holding pairing.a3m and non_pairing.a3m
    B: "all"                     # keep the whole chain, no hotspots
```

Five rules that decide whether this file means what you think:

- **Indices are `label_seq_id`, the canonical mmCIF numbering, not the deposited
  `auth_seq_id`.** Every molecular viewer shows you the deposited one by default, and every
  paper quotes the deposited one. They agree for some entries and not others, and nothing
  warns you when they do not.
- **Chain ids are `label_asym_id` for a `.cif` input.** The letters an antibody structure is
  known by — `H`, `L` — are `auth_asym_id`, and are frequently not the same letters.
- **A `.pdb` input is converted to mmCIF first**, and on that path PXDesign does map your
  deposited-style indices for you. That is the one case where auth numbering is correct in
  the YAML, which makes the rule harder to remember rather than easier. Supply mmCIF and
  keep one rule.
- **The MSA is only used by the filter stage**, never by generation, so a `preview` run does
  not need one — but the Protenix filter's confidence numbers are the ranking, and without a
  target MSA they are not worth ranking on.
- **`hotspots` guide, they do not constrain.** They bias the diffusion; they do not force
  contact.

**`pxdesign check-input` is a syntax check and nothing more.** It parses the YAML, confirms
`binder_length` and `target.file` exist, and confirms any MSA directory holds its two
`.a3m` files. It never opens the structure. Chain existence is checked much later, when the
dataset is built for a run; crop ranges and hotspot indices are **never** checked against
the structure at all. Both are applied as a set-membership test over residue ids, so an
index that does not exist matches nothing and is silently dropped — a crop can select zero
residues and a hotspot list can guide nothing, with no error on either.

That is what the following module is for. It reads the structure and tells you which
residues your specification actually names.

```python
"""Audit a PXDesign target specification against the structure file it names.

Checks what `pxdesign check-input` does not: that the chains exist under the ids
PXDesign will look for, that crop ranges and hotspots land on residues that are
really there, which residues they actually are, and whether the MSA belongs to
this target. Standard library plus PyYaml, which PXDesign already requires.
"""
import os, re

AA3 = {"ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C", "GLN": "Q",
       "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I", "LEU": "L", "LYS": "K",
       "MET": "M", "PHE": "F", "PRO": "P", "SER": "S", "THR": "T", "TRP": "W",
       "TYR": "Y", "VAL": "V"}
TOKEN = re.compile(r"'([^']*)'|\"([^\"]*)\"|(\S+)")


def cif_loop(path, prefix):
    """Rows of one mmCIF loop_ as dicts, handling quoted and ;multi-line; fields."""
    cols, rows, pending, buf, state = [], [], [], None, "scan"
    for raw in open(path, errors="replace"):
        line = raw.rstrip("\n")
        s = line.strip()
        if state == "scan":
            if s.startswith(prefix):
                cols.append(s[len(prefix):])
                state = "cols"
            continue
        if state == "cols":
            if s.startswith(prefix):
                cols.append(s[len(prefix):])
                continue
            state = "rows"
        if buf is not None:
            if line.startswith(";"):
                pending.append("".join(buf))
                buf = None
            else:
                buf.append(line)
        elif line.startswith(";"):
            buf = [line[1:]]
        elif s in ("#", "") or s.startswith(("loop_", "_", "data_")):
            break
        else:
            pending.extend(a or b or c for a, b, c in TOKEN.findall(s))
        while len(pending) >= len(cols):
            rows.append(dict(zip(cols, pending[:len(cols)])))
            del pending[:len(cols)]
    return rows


def target_chains(path):
    """label_asym_id -> residue records, from _pdbx_poly_seq_scheme.

    That table has one row per residue of the full entity, resolved or not, and
    carries both numbering schemes plus insertion codes. It is the one place the
    label -> auth mapping is written down explicitly.
    """
    chains = {}
    for r in cif_loop(path, "_pdbx_poly_seq_scheme."):
        ins = r.get("pdb_ins_code", ".")
        chains.setdefault(r["asym_id"], []).append({
            "label_seq": int(r["seq_id"]),
            "auth_seq": r["pdb_seq_num"],
            "ins": "" if ins in (".", "?") else ins,
            "mon": r["mon_id"],
            "auth_chain": r.get("pdb_strand_id", "?"),
            "resolved": r.get("pdb_mon_id", "?") != "?",
        })
    return chains


def n_models(path):
    return len({l.split()[-1] for l in open(path, errors="replace")
                if l.startswith(("ATOM", "HETATM"))})


def parse_crop(spec):
    """PXDesign joins a YAML crop list with commas and expands 'a-b' inclusively."""
    if spec is None:
        return None
    parts = spec if isinstance(spec, list) else [spec]
    if len(parts) == 1 and str(parts[0]).lower() in ("all", "full"):
        return None
    keep = []
    for p in parts:
        p = str(p).strip()
        if "-" in p.lstrip("-"):
            a, b = p.split("-", 1)
            keep += list(range(int(a), int(b) + 1))
        else:
            keep.append(int(p))
    return keep


def audit(cfg, cif):
    """-> (problems, notes). A problem is something that designs the wrong thing."""
    problems, notes = [], []
    if "binder_length" not in cfg:
        problems.append("binder_length is required and missing")
    chains = target_chains(cif)
    if not chains:
        problems.append(f"{cif}: no _pdbx_poly_seq_scheme table — not a polymer mmCIF")
        return problems, notes
    if (m := n_models(cif)) > 1:
        problems.append(f"{m} models in the file; PXDesign conditions on one structure, "
                        f"so split the ensemble and choose")
    auth_ids = sorted({r["auth_chain"] for rs in chains.values() for r in rs})
    for cid, spec in (cfg.get("target", {}).get("chains") or {}).items():
        cid = str(cid)
        if cid not in chains:
            problems.append(f"chain {cid!r} is not a label_asym_id here "
                            f"(label ids {sorted(chains)}; auth ids {auth_ids})")
            continue
        res = chains[cid]
        by_label = {r["label_seq"]: r for r in res}
        seq = "".join(AA3.get(r["mon"], "X") for r in res)
        offs = {r["label_seq"] - int(re.sub(r"[^-0-9]", "", r["auth_seq"])) for r in res}
        notes.append(f"chain {cid}: label_seq_id {res[0]['label_seq']}-{res[-1]['label_seq']}, "
                     f"{len(res)} residues, {sum(r['resolved'] for r in res)} resolved; "
                     f"auth chain {res[0]['auth_chain']} numbered "
                     f"{res[0]['auth_seq']}-{res[-1]['auth_seq']}")
        if offs != {0}:
            how = (f"constant {sorted(offs)[0]}" if len(offs) == 1
                   else f"VARIES over {len(offs)} values")
            notes.append(f"  label_seq_id - auth_seq_id = {how}; the YAML takes label_seq_id")
        if ins := [r for r in res if r["ins"]]:
            notes.append(f"  {len(ins)} residues carry an insertion code (e.g. auth "
                         f"{ins[0]['auth_seq']}{ins[0]['ins']})")
        spec = {} if spec is None or str(spec).lower() in ("all", "full") else spec
        keep = parse_crop(spec.get("crop"))
        if keep is None:
            kept = set(by_label)
        else:
            kept = {i for i in keep if i in by_label}
            if not kept:
                problems.append(f"chain {cid}: the crop keeps 0 residues — every index is "
                                f"outside {res[0]['label_seq']}-{res[-1]['label_seq']}")
            elif len(kept) < len(keep):
                problems.append(f"chain {cid}: the crop names {len(keep)} residues, "
                                f"{len(keep) - len(kept)} of which do not exist")
            if unres := sorted(i for i in kept if not by_label[i]["resolved"]):
                notes.append(f"  the crop includes {len(unres)} residues with no coordinates "
                             f"(first label_seq_id {unres[0]})")
        for h in spec.get("hotspots") or []:
            h = int(h)
            if h not in by_label:
                problems.append(f"chain {cid}: hotspot {h} is outside "
                                f"{res[0]['label_seq']}-{res[-1]['label_seq']}; it matches no "
                                f"residue and the run proceeds unguided")
            elif h not in kept:
                problems.append(f"chain {cid}: hotspot {h} ({by_label[h]['mon']}) is cropped away")
            else:
                r = by_label[h]
                notes.append(f"  hotspot {h} = {r['mon']} (auth {r['auth_chain']}{r['auth_seq']}"
                             f"{r['ins']})" + ("" if r["resolved"] else "  <- NO COORDINATES"))
        if msa := spec.get("msa"):
            for fn in ("pairing.a3m", "non_pairing.a3m"):
                if not os.path.exists(os.path.join(msa, fn)):
                    problems.append(f"chain {cid}: no {fn} in {msa}")
            q = os.path.join(msa, "pairing.a3m")
            if os.path.exists(q):
                with open(q) as fh:
                    fh.readline()
                    query = fh.readline().strip()
                if query == seq:
                    notes.append(f"  MSA query is the whole chain ({len(seq)} aa)")
                elif query in seq:
                    where = "the first" if seq.startswith(query) else "an internal"
                    notes.append(f"  MSA query is {where} {len(query)} of {len(seq)} residues")
                else:
                    problems.append(f"chain {cid}: the MSA query ({len(query)} aa) is not a "
                                    f"subsequence of this chain ({len(seq)} aa) — wrong target")
    return problems, notes


def report(cfg, cif):
    problems, notes = audit(cfg, cif)
    for n in notes:
        print("   ", n)
    for p in problems:
        print("  !!", p)
    if not problems:
        print("    no problems")
    return problems
```

Save that as `px_audit.py`. Against the PD-L1 example the repository ships:

```python
import yaml
from px_audit import report

cfg = yaml.safe_load(open("PXDesign/examples/PDL1_quick_start.yaml"))
cfg["target"]["chains"]["A"]["msa"] = "PXDesign/examples/msa/PDL1/0"
print("the shipped PD-L1 example, against the PDB copy of 5O45:")
assert report(cfg, "5O45.cif") == []
```

```
the shipped PD-L1 example, against the PDB copy of 5O45:
    chain A: label_seq_id 1-129, 129 residues, 129 resolved; auth chain A numbered 17-145
      label_seq_id - auth_seq_id = constant -16; the YAML takes label_seq_id
      hotspot 40 = TYR (auth A56)
      hotspot 99 = MET (auth A115)
      hotspot 107 = TYR (auth A123)
      MSA query is the first 116 of 129 residues
    no problems
```

Read that output rather than the pass. The example's hotspots `40, 99, 107` are Tyr56,
Met115 and Tyr123 — the canonical PD-L1 hydrophobic patch, and exactly the residues the
technical report names for this target. **The two numbering schemes differ by 16 here.**
Type the paper's numbers into the YAML and you design against Glu72, Asn131 and Glu147
instead, and every check the project ships will pass.

The last line is worth a moment too: the shipped MSA covers residues 1–116, the crop,
rather than the whole 129-residue entity — the remaining 13 are a C-terminal expression tag.
The rule to take from that is not "crop your MSA", it is: **the MSA query must be a
subsequence of the chain sequence, and you should know which subsequence.** An MSA left
over from a previous target is otherwise indistinguishable from a correct one until the
confidence numbers come out low.

### What passes the shipped check and still designs the wrong thing

```python
import os, urllib.request
from px_audit import report

def pdb(pid):
    """An mmCIF from the PDB. Public domain, no account, nothing to accept."""
    f = f"{pid}.cif"
    if not os.path.exists(f):
        urllib.request.urlretrieve(f"https://files.rcsb.org/download/{pid}.cif", f)
    return f

MSA = "PXDesign/examples/msa/PDL1/0"
CASES = [
    ("hotspots typed out of a viewer, which shows auth numbering",
     {"binder_length": 80, "target": {"chains": {"A": {"crop": ["1-116"],
                                                       "hotspots": [56, 115, 123]}}}}, "5O45"),
    ("a crop that runs past the end of the chain",
     {"binder_length": 60, "target": {"chains": {"A": {"crop": ["1-200"]}}}}, "1UBQ"),
    ("an antibody heavy chain, called H the way everyone calls it",
     {"binder_length": 80, "target": {"chains": {"H": {"hotspots": [100]}}}}, "12E8"),
    ("the same chain under the id PXDesign looks for",
     {"binder_length": 80, "target": {"chains": {"B": {"crop": ["1-120"],
                                                       "hotspots": [100, 101]}}}}, "12E8"),
    ("spike RBD, cropped in the numbering the literature uses",
     {"binder_length": 80, "target": {"chains": {"A": {"crop": ["330-530"],
                                                       "hotspots": [417, 453]}}}}, "6VXX"),
    ("an NMR ensemble as the target structure",
     {"binder_length": 60, "target": {"chains": {"A": {"hotspots": [44]}}}}, "1D3Z"),
    ("an MSA directory left over from the previous target",
     {"binder_length": 60, "target": {"chains": {"A": {"msa": MSA}}}}, "1UBQ"),
    ("binder_length forgotten",
     {"target": {"chains": {"A": "all"}}}, "1UBQ"),
]
for label, cfg, pid in CASES:
    print(f"\n{pid}: {label}")
    report(cfg, pdb(pid))
```

```
5O45: hotspots typed out of a viewer, which shows auth numbering
    chain A: label_seq_id 1-129, 129 residues, 129 resolved; auth chain A numbered 17-145
      label_seq_id - auth_seq_id = constant -16; the YAML takes label_seq_id
      hotspot 56 = GLU (auth A72)
      hotspot 115 = ASN (auth A131)
  !! chain A: hotspot 123 (GLU) is cropped away

1UBQ: a crop that runs past the end of the chain
    chain A: label_seq_id 1-76, 76 residues, 76 resolved; auth chain A numbered 1-76
  !! chain A: the crop names 200 residues, 124 of which do not exist

12E8: an antibody heavy chain, called H the way everyone calls it
  !! chain 'H' is not a label_asym_id here (label ids ['A', 'B', 'C', 'D']; auth ids ['H', 'L', 'M', 'P'])

12E8: the same chain under the id PXDesign looks for
    chain B: label_seq_id 1-221, 221 residues, 221 resolved; auth chain H numbered 1-214
      label_seq_id - auth_seq_id = VARIES over 8 values; the YAML takes label_seq_id
      7 residues carry an insertion code (e.g. auth 52A)
      hotspot 100 = HIS (auth H96)
      hotspot 101 = ASP (auth H97)
    no problems

6VXX: spike RBD, cropped in the numbering the literature uses
    chain A: label_seq_id 1-1281, 1281 residues, 972 resolved; auth chain A numbered -18-1262
      label_seq_id - auth_seq_id = constant 19; the YAML takes label_seq_id
      the crop includes 30 residues with no coordinates (first label_seq_id 464)
      hotspot 417 = ASP (auth A398)
      hotspot 453 = ILE (auth A434)
    no problems

1D3Z: an NMR ensemble as the target structure
    chain A: label_seq_id 1-76, 76 residues, 76 resolved; auth chain A numbered 1-76
      hotspot 44 = ILE (auth A44)
  !! 10 models in the file; PXDesign conditions on one structure, so split the ensemble and choose

1UBQ: an MSA directory left over from the previous target
    chain A: label_seq_id 1-76, 76 residues, 76 resolved; auth chain A numbered 1-76
  !! chain A: the MSA query (116 aa) is not a subsequence of this chain (76 aa) — wrong target

1UBQ: binder_length forgotten
    chain A: label_seq_id 1-76, 76 residues, 76 resolved; auth chain A numbered 1-76
  !! binder_length is required and missing
```

Four of those deserve naming, because in each the run completes and produces designs:

- **The antibody case has no constant offset at all.** Chain `H` of 12E8 carries seven
  insertion-coded residues, so the difference between the two numberings takes eight
  different values along one chain. There is no arithmetic fix; you have to look the
  mapping up per residue.
- **Spike numbering is negative at the N terminus.** 6VXX starts at auth −18, so the offset
  is +19, and a crop written as the receptor-binding domain everyone quotes — 330 to 530 —
  lands 19 residues short at both ends.
- **A crop can quietly include residues with no coordinates.** 309 of 6VXX's 1281 modelled
  residues are unresolved. They are in the sequence, so the crop keeps them; they have no
  atoms, so the diffusion model is conditioned on a hole.
- **An NMR ensemble is not a target.** Ten models in one file, and the run conditions on
  whatever the parser returns.

### Converting a target out of the literature

Papers specify targets in deposited numbering. PXDesign takes canonical numbering. This
converts one into the other, using the seven targets of PXDesign's own technical report as
the test set — which is the fairest possible sample, because those are the specifications
that produced its published hit rates.

```python
import os, re, urllib.request
from px_audit import target_chains

def pdb(pid):
    f = f"{pid}.cif"
    if not os.path.exists(f):
        urllib.request.urlretrieve(f"https://files.rcsb.org/download/{pid}.cif", f)
    return f

def to_label(pid, auth_chain, auth_ranges, auth_hotspots):
    """Turn a target described the way a paper describes one — deposited chain
    letter and deposited residue numbers — into the chain id and label_seq_id
    ranges the YAML needs."""
    chains = target_chains(pdb(pid))
    hit = [(cid, res) for cid, res in chains.items()
           if res and res[0]["auth_chain"] == auth_chain]
    if not hit:
        return None, None, None, None
    cid, res = hit[0]
    a2l = {}
    for r in res:
        a2l.setdefault(r["auth_seq"] + r["ins"], r["label_seq"])
    crop = [f"{a2l.get(str(a))}-{a2l.get(str(b))}" for a, b in auth_ranges]
    hot = [a2l.get(str(h)) for h in auth_hotspots]
    offs = {r["label_seq"] - int(re.sub(r"[^-0-9]", "", r["auth_seq"])) for r in res}
    return cid, crop, hot, (sorted(offs)[0] if len(offs) == 1 else "varies")

# The seven targets of the PXDesign technical report, as its Table 3 states them:
# PDB entry, deposited chain letter, deposited residue numbers.
SPECS = [
    ("IL-7RA", "3DI3", "B", [(17, 209)],            [58, 80, 139]),
    ("SC2RBD", "6M0J", "E", [(333, 526)],           [485, 489, 494, 500, 505]),
    ("PD-L1",  "5O45", "A", [(17, 132)],            [56, 115, 123]),
    ("TrkA",   "1WWW", "X", [(282, 382)],           [294, 296, 333]),
    ("VEGF-A", "1BJ1", "V", [(14, 107)],            [81, 83, 91]),
    ("VEGF-A", "1BJ1", "W", [(14, 107)],            []),
    ("TNF-a",  "1TNF", "A", [(12, 157)],            [31, 32, 113]),
    ("TNF-a",  "1TNF", "C", [(12, 157)],            [73, 87]),
    ("EGFR",   "1MOX", "A", [(1, 186), (311, 500)], [357, 380, 412]),
]
print(f"{'target':8} {'pdb':5} {'paper':>5} {'yaml':>5} {'shift':>6}  "
      f"{'crop as published':18} {'crop for the yaml':18} hotspots")
shifted = renamed = 0
for name, pid, ch, ranges, hs in SPECS:
    cid, crop, hot, off = to_label(pid, ch, ranges, hs)
    published = ",".join(f"{a}-{b}" for a, b in ranges)
    print(f"{name:8} {pid:5} {ch:>5} {cid:>5} {str(off):>6}  {published:18} "
          f"{','.join(crop):18} " + ", ".join(f"{a}->{b}" for a, b in zip(hs, hot)))
    shifted += off != 0
    renamed += cid != ch
print(f"\n{shifted} of {len(SPECS)} chain specifications need renumbering, "
      f"{renamed} of {len(SPECS)} need a different chain id")

# The shipped example is exactly this conversion, which is the check that the
# mapping above is the one PXDesign's own authors applied.
assert to_label("5O45", "A", [(17, 132)], [56, 115, 123])[:3] == ("A", ["1-116"], [40, 99, 107])
print("PD-L1 converts to the crop and hotspots in examples/PDL1_quick_start.yaml")
```

```
target   pdb   paper  yaml  shift  crop as published  crop for the yaml  hotspots
IL-7RA   3DI3      B     B      4  17-209             21-213             58->62, 80->84, 139->143
SC2RBD   6M0J      E     B   -318  333-526            15-208             485->167, 489->171, 494->176, 500->182, 505->187
PD-L1    5O45      A     A    -16  17-132             1-116              56->40, 115->99, 123->107
TrkA     1WWW      X     C   -281  282-382            1-101              294->13, 296->15, 333->52
VEGF-A   1BJ1      V     C     -7  14-107             7-100              81->74, 83->76, 91->84
VEGF-A   1BJ1      W     D     -7  14-107             7-100              
TNF-a    1TNF      A     A      0  12-157             12-157             31->31, 32->32, 113->113
TNF-a    1TNF      C     C      0  12-157             12-157             73->73, 87->87
EGFR     1MOX      A     A      0  1-186,311-500      1-186,311-500      357->357, 380->380, 412->412

6 of 9 chain specifications need renumbering, 4 of 9 need a different chain id
PD-L1 converts to the crop and hotspots in examples/PDL1_quick_start.yaml
```

Six of nine chain specifications shift, by as much as 318 residues, and four name a chain
letter that does not exist in the file under that name. Transcribing a target from a paper
without converting it is wrong more often than it is right, and the three that happen to
need no change — TNF-α and EGFR — are exactly the ones that would teach you the wrong
lesson if you checked only those.

The final assertion is the load-bearing one: converting PD-L1 from the report's deposited
numbering reproduces, digit for digit, the crop and hotspots in the YAML the project ships.
The mapping above is the one its authors applied.

## Running a design job

```bash
# unverified — the generator and both filters are CUDA-only
export CUTLASS_PATH=$HOME/cutlass          # only for --use_deepspeed_evo_attention

pxdesign check-input --yaml pdl1.yaml      # syntax only; the audit above is the rest
pxdesign parse-target --yaml pdl1.yaml -o debug/   # writes what the model will see

pxdesign pipeline \
  --preset extended \
  -i pdl1.yaml \
  -o run1 \
  --N_sample 100 \
  --dtype bf16 \
  --use_fast_ln True \
  --use_deepspeed_evo_attention True
```

`parse-target` writes the cropped, relabelled structure the model is actually conditioned
on, plus a PyMOL script that colours the crop and the hotspots. Open it. It is the visual
form of the audit above and it catches the same class of mistake from the other direction.

| preset | what runs | when |
|---|---|---|
| `--preset extended` | generation, then AF2-IG **and** Protenix filters | the pipeline behind the published results, and what you want for anything you intend to order |
| `--preset preview` | generation, then AF2-IG only | quick read on whether a target and hotspot choice are workable at all |
| `pxdesign infer` | generation only | backbones with no scores and no ranking |

Sampling knobs worth knowing: `--N_sample` is designs per run and `--N_step` the diffusion
steps, defaulting to 400. Use `--dtype fp32 --use_deepspeed_evo_attention False` on
pre-Ampere hardware. The project recommends collecting 10,000-plus designs per target and
expecting 10–100 to survive both strict filters, so the unit of work is many runs across
seeds and binder lengths rather than one large run. First-run cost includes kernel
compilation and 9 GB of downloads; per-design time is seconds to minutes on a current
data-centre GPU and scales with target length. Those are orders of magnitude, not
measurements — nothing in this skill timed a GPU.

## What comes out

```
run1/design_outputs/<task_name>/
  summary.csv                    ranked designs, every score, the pass/fail flags
  server_xx_mode.png             where this target sits against the project's benchmarks
  task_info.json                 what was run
  orig_designed/                 backbones from the diffusion generator
  passing-AF2-IG-easy/           complexes re-predicted by AF2-IG, for designs that passed
  passing-Protenix-basic/        complexes re-predicted by Protenix, for designs that passed
```

Three things about those files that are not obvious:

- **Chains are renamed on the way out.** Target chains become `A0`, `B0`, `C0` … in the
  order your YAML lists them, and **the binder is always the last chain**. Downstream code
  should take the last chain, not chain `B`, and not the chain your target used to be.
- **The B-factor column of every structure PXDesign writes is zero.** Both writers set it
  explicitly to a zeroed array — `pxdesign/runner/dumper.py` line 143 says so in a comment,
  and `pxdesign/data/utils.py` line 231 does the same for `B_iso_or_equiv`. The diffusion
  generator has no confidence head, so there is nothing to put there. Anything that reads
  per-residue confidence out of a B-factor column, which for AlphaFold outputs is the
  normal thing to do, will read zeros and rank every design identically. Per-design
  confidence exists only in `summary.csv`.
- **One design, several files.** A design that passed both filters appears three times —
  as a backbone, as an AF2-IG re-prediction and as a Protenix re-prediction — and
  `chosen_struct_path` in the CSV says which one the pipeline considers canonical, with
  Protenix preferred over AF2-IG over the raw backbone.

### Reading summary.csv without misreading it

The columns are renamed on the way into the CSV, and two of the renames invite the wrong
threshold. `af2_ipAE` is the interface PAE **in ångström**. `af2_pAE` is ColabDesign's
overall PAE **divided by 31** — neither in ångström nor restricted to the interface. The
name that looks like the normalised one is the raw one. Meanwhile the column the
AF2-IG-easy filter is actually written against, `i_pAE`, is dropped before the file is
written; its threshold of 0.35 is 0.35 × 31 = 10.85 Å in the column you do have.

Everything AF2 returns comes through ColabDesign on a 0–1 scale, so `af2_plddt` runs 0–1
and not 0–100.

```python
import csv

# summary.csv columns, in the order pxdesign/utils/pipeline.py:trim_summary_df
# emits them and under the names it renames them to. ptx_mini_* appear as well
# when the mini filter is enabled.
COLUMNS = ["rank", "task_name", "sequence",
           "AF2-IG-easy-success", "AF2-IG-success", "Protenix-success",
           "Protenix-basic-success",
           "af2_plddt", "af2_ptm", "af2_iptm", "af2_pAE", "af2_ipAE",
           "af2_monomer_plddt", "af2_monomer_ptm", "af2_monomer_pAE",
           "af2_bound_unbound_RMSD", "af2_binder_pred_design_rmsd",
           "af2_complex_pred_design_rmsd",
           "ptx_plddt", "ptx_ptm_binder", "ptx_ptm_target", "ptx_iptm", "ptx_ptm",
           "ptx_iptm_binder", "ptx_pred_design_rmsd",
           "alpha", "beta", "loop", "Rg", "chosen_struct_type", "chosen_struct_path"]

# Thresholds from pxdbench/pxd_configs/eval.py, binder.filters. The easy AF2
# filter is written against the ColabDesign-normalised interface PAE, so its
# 0.35 is 0.35 x 31 = 10.85 angstrom in the column the CSV actually carries.
THRESHOLDS = {
    "AF2-IG-easy-success":    [("af2_plddt", ">", 0.8), ("af2_iptm", ">", 0.5),
                               ("af2_ipAE", "<", 0.35 * 31),
                               ("af2_bound_unbound_RMSD", "<", 3.5)],
    "AF2-IG-success":         [("af2_plddt", ">", 0.9), ("af2_ipAE", "<", 7.0),
                               ("af2_binder_pred_design_rmsd", "<", 1.5)],
    "Protenix-success":       [("ptx_iptm_binder", ">", 0.85), ("ptx_ptm_binder", ">", 0.88),
                               ("ptx_pred_design_rmsd", "<", 2.5)],
    "Protenix-basic-success": [("ptx_iptm_binder", ">", 0.8), ("ptx_ptm_binder", ">", 0.8),
                               ("ptx_pred_design_rmsd", "<", 2.5)],
}
# The range each column must lie in for its name to mean what it looks like it
# means. Everything AF2 returns comes through ColabDesign on 0-1; the one PAE
# column that is in angstrom is af2_ipAE.
SCALES = {"af2_plddt": (0, 1), "af2_ptm": (0, 1), "af2_iptm": (0, 1), "af2_pAE": (0, 1),
          "af2_monomer_plddt": (0, 1), "af2_monomer_ptm": (0, 1), "af2_monomer_pAE": (0, 1),
          "af2_ipAE": (0, 32), "ptx_plddt": (0, 1), "ptx_ptm": (0, 1), "ptx_iptm": (0, 1),
          "ptx_ptm_binder": (0, 1), "ptx_iptm_binder": (0, 1), "ptx_ptm_target": (0, 1)}


def passes(row, rule):
    col, op, thr = rule
    v = row.get(col)
    if v in (None, "", "None"):
        return None
    v = float(v)
    return v > thr if op == ">" else v < thr


def recompute(row):
    out = {}
    for name, rules in THRESHOLDS.items():
        vals = [passes(row, r) for r in rules]
        out[name] = None if any(v is None for v in vals) else all(vals)
    return out


def audit_summary(path):
    rows = list(csv.DictReader(open(path)))
    missing = [c for c in COLUMNS if c not in rows[0]]
    extra = [c for c in rows[0] if c not in COLUMNS and not c.startswith("ptx_mini_")]
    print(f"{len(rows)} designs, {len(rows[0])} columns"
          + (f"; missing {missing}" if missing else "")
          + (f"; unexpected {extra}" if extra else ""))
    for col, (lo, hi) in SCALES.items():
        vals = [float(r[col]) for r in rows if r.get(col) not in (None, "", "None")]
        if vals and not (lo <= min(vals) and max(vals) <= hi):
            print(f"  !! {col} spans {min(vals):.3f}-{max(vals):.3f}, outside {lo}-{hi} — "
                  f"it is not on the scale its threshold assumes")
    for r in rows:
        for name, got in recompute(r).items():
            have = str(r.get(name, "")).lower() == "true"
            if got is not None and got != have:
                print(f"  !! rank {r['rank']}: {name} is {have} in the file, "
                      f"{got} from the thresholds")
    return rows


# Four rows with the real column names and stand-in values, so the reader above
# can be exercised without a GPU. No prediction produced these numbers.
STAND_IN = [
    (1, 0.93, 0.86, 0.88, 0.21, 5.4, 0.94, 0.88, 0.19, 1.10, 0.90, 1.30, 0.92, 0.91, 0.94, 0.90, 0.92, 0.90, 1.40),
    (2, 0.88, 0.81, 0.74, 0.28, 8.9, 0.90, 0.85, 0.22, 2.30, 1.80, 2.60, 0.87, 0.83, 0.93, 0.82, 0.88, 0.82, 2.10),
    (3, 0.82, 0.74, 0.61, 0.33, 10.4, 0.88, 0.82, 0.25, 3.10, 2.40, 3.40, 0.80, 0.74, 0.92, 0.71, 0.83, 0.72, 2.90),
    (4, 0.71, 0.62, 0.41, 0.45, 15.2, 0.79, 0.71, 0.34, 5.60, 4.90, 6.10, 0.68, 0.60, 0.91, 0.55, 0.74, 0.56, 5.80),
]
FIELDS = ["rank", "af2_plddt", "af2_ptm", "af2_iptm", "af2_pAE", "af2_ipAE",
          "af2_monomer_plddt", "af2_monomer_ptm", "af2_monomer_pAE",
          "af2_bound_unbound_RMSD", "af2_binder_pred_design_rmsd",
          "af2_complex_pred_design_rmsd", "ptx_plddt", "ptx_ptm_binder",
          "ptx_ptm_target", "ptx_iptm", "ptx_ptm", "ptx_iptm_binder",
          "ptx_pred_design_rmsd"]
with open("summary.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=COLUMNS)
    w.writeheader()
    for t in STAND_IN:
        row = dict(zip(FIELDS, t))
        row.update(task_name="pdl1", sequence="", chosen_struct_type="ptx",
                   chosen_struct_path=f"passing-Protenix-basic/rank_{t[0]}.cif",
                   alpha=0.4, beta=0.2, loop=0.4, Rg=13.1)
        row.update(recompute(row))
        w.writerow(row)

rows = audit_summary("summary.csv")
print(f"\n{'rank':>4} {'af2_ipAE':>9} {'af2_pAE':>8} {'iptm_bnd':>9} {'ptm_bnd':>8}  "
      f"{'easy':>5} {'AF2-IG':>7} {'ptx-basic':>10} {'ptx':>5}")
for r in rows:
    print(f"{r['rank']:>4} {float(r['af2_ipAE']):>9.2f} {float(r['af2_pAE']):>8.2f} "
          f"{float(r['ptx_iptm_binder']):>9.2f} {float(r['ptx_ptm_binder']):>8.2f}  "
          f"{r['AF2-IG-easy-success']:>5} {r['AF2-IG-success']:>7} "
          f"{r['Protenix-basic-success']:>10} {r['Protenix-success']:>5}")

kept = [r for r in rows if float(r["af2_pAE"]) < 10]
print("\nthe field-standard interface-PAE cut, applied to the wrong column:")
print(f"  af2_pAE  < 10 keeps {len(kept)}/{len(rows)} designs — af2_pAE is neither in "
      f"angstrom nor about the interface")
print(f"  af2_ipAE < 10 keeps "
      f"{len([r for r in rows if float(r['af2_ipAE']) < 10])}/{len(rows)} — this is the column")
assert len(kept) == len(rows)
```

```
4 designs, 31 columns

rank  af2_ipAE  af2_pAE  iptm_bnd  ptm_bnd   easy  AF2-IG  ptx-basic   ptx
   1      5.40     0.21      0.90     0.91   True    True       True  True
   2      8.90     0.28      0.82     0.83   True   False       True False
   3     10.40     0.33      0.72     0.74   True   False      False False
   4     15.20     0.45      0.56     0.60  False   False      False False

the field-standard interface-PAE cut, applied to the wrong column:
  af2_pAE  < 10 keeps 4/4 designs — af2_pAE is neither in angstrom nor about the interface
  af2_ipAE < 10 keeps 2/4 — this is the column
```

Point that reader at a real `summary.csv` before you filter one. It fails loudly on a
column whose scale is not what its threshold assumes, and on any `*-success` flag that
disagrees with recomputing it from the published thresholds — which is what you want to
know if you ever edit the filter config or merge results from two runs.

The four filters, with the thresholds as the config states them:

| flag | criteria |
|---|---|
| `AF2-IG-easy-success` | pLDDT > 0.8, i_pTM > 0.5, interface PAE < 10.85 Å, bound-vs-unbound binder RMSD < 3.5 Å |
| `AF2-IG-success` | pLDDT > 0.9, interface PAE < 7.0 Å, binder RMSD to the design < 1.5 Å |
| `Protenix-basic-success` | binder ipTM > 0.8, binder pTM > 0.8, complex RMSD to the design < 2.5 Å |
| `Protenix-success` | binder ipTM > 0.85, binder pTM > 0.88, complex RMSD to the design < 2.5 Å |

The easy AF2 thresholds are BindCraft's; the rest come from the project's own benchmarking.
Its own recommendation is to use the strict AF2-IG filter throughout and to fall back from
`Protenix` to `Protenix-basic` on hard targets — it names VEGF-A, TrkA, SC2RBD and TNF-α as
the ones where it did so — with the difficulty plot in the output directory as the guide.

## What "binder ipTM" is, and what it is not

The two Protenix filters threshold `ptx_iptm_binder` and `ptx_ptm_binder`, which sit
alongside `ptx_iptm` and `ptx_ptm` in the same CSV, differing only by a suffix. They are
different quantities. The `protenix` skill covers what pTM and ipTM mean and why a monomer's
ipTM is exactly zero; this is the part specific to how PXDesign slices them per chain, and
the scoring code runs on CPU with no weights, so it can be checked rather than believed.

`ptx_iptm_binder` is `chain_iptm[last]`, and `chain_iptm[c]` is the **mean over every chain
pair involving c** of the pairwise ipTM. `ptx_ptm_binder` is `chain_ptm[last]`, pTM computed
over the binder's tokens alone, with the TM normalisation taken from that chain's length.

```python
import hashlib, urllib.request
import torch
import protenix.model.sample_confidence as sc
from protenix.model.sample_confidence import (
    calculate_chain_based_ptm, calculate_iptm, calculate_normalization,
    calculate_ptm, get_bin_centers)

# PXDesign pins Protenix at a fork tag rather than a release. Confirm the scoring
# file is the same in both before trusting a number computed with the release.
FORK = ("https://raw.githubusercontent.com/bytedance/Protenix/"
        "v0.5.0%2Bpxd/protenix/model/sample_confidence.py")
remote = urllib.request.urlopen(FORK, timeout=60).read()
assert hashlib.sha256(remote).digest() == hashlib.sha256(open(sc.__file__, "rb").read()).digest()
print("sample_confidence.py is byte-identical between protenix 0.5.0 and the "
      "v0.5.0+pxd tag PXDesign pins\n")

PAE = {"min_bin": 0, "max_bin": 32, "no_bins": 64}    # configs_base.py, loss.pae
CENTERS = get_bin_centers(**PAE)


def scene(sizes, pair_pae, within=1.0, sigma=1.5):
    """A PAE distribution over chains of the given sizes, peaked at `within` inside
    each chain and at pair_pae[(i, j)] between chains i and j. Stand-in numbers:
    what is under test is how the scores are assembled, not what a real prediction
    returns."""
    n = sum(sizes)
    asym = torch.cat([torch.full((s,), i) for i, s in enumerate(sizes)]).long()
    tgt = torch.full((n, n), float(within))
    for (i, j), v in pair_pae.items():
        m = ((asym[:, None] == i) & (asym[None, :] == j)) | \
            ((asym[:, None] == j) & (asym[None, :] == i))
        tgt[m] = float(v)
    d = -((CENTERS.view(1, 1, -1) - tgt.unsqueeze(-1)) ** 2) / (2 * sigma ** 2)
    return (torch.softmax(d, dim=-1).unsqueeze(0), asym,
            torch.ones(n, dtype=torch.bool), torch.zeros(n, dtype=torch.bool))


def score(sizes, pair_pae):
    prob, asym, frame, lig = scene(sizes, pair_pae)
    ch = calculate_chain_based_ptm(prob, frame, asym, lig, **PAE)
    return {"ptm": calculate_ptm(prob, frame, **PAE).item(),
            "iptm": calculate_iptm(prob, frame, asym, **PAE).item(),
            "chain_ptm": ch["chain_ptm"][0].tolist(),
            "chain_iptm": ch["chain_iptm"][0].tolist(),
            "pair_iptm": ch["chain_pair_iptm"][0].tolist()}


BIND, FAR, PACKED = 2.0, 25.0, 3.0   # angstrom: an interface, no contact, target-target

s = score([116, 80], {(0, 1): BIND})
print("one target chain of 116 residues, an 80-residue binder as the last chain")
print(f"  ptx_ptm          {s['ptm']:.4f}   whole complex")
print(f"  ptx_iptm         {s['iptm']:.4f}   whole complex")
print(f"  ptx_ptm_binder   {s['chain_ptm'][-1]:.4f}   chain_ptm[last]")
print(f"  ptx_iptm_binder  {s['chain_iptm'][-1]:.4f}   chain_iptm[last]")
assert abs(s["iptm"] - s["chain_iptm"][-1]) < 1e-6
print("  with two chains, ptx_iptm and ptx_iptm_binder are the same number")

s3 = score([116, 90, 70, 80], {(0, 3): BIND, (1, 3): FAR, (2, 3): FAR,
                               (0, 1): PACKED, (0, 2): PACKED, (1, 2): PACKED})
print("\nthree target chains kept, the binder engaging only the first")
print(f"  ptx_iptm         {s3['iptm']:.4f}   reads like a good complex")
print(f"  ptx_iptm_binder  {s3['chain_iptm'][-1]:.4f}   what the filter thresholds")
print(f"  per chain pair: binder-A0 {s3['pair_iptm'][3][0]:.4f}  "
      f"binder-B0 {s3['pair_iptm'][3][1]:.4f}  binder-C0 {s3['pair_iptm'][3][2]:.4f}")
assert abs(s3["chain_iptm"][-1] - sum(s3["pair_iptm"][3][:3]) / 3) < 1e-6
print("  chain_iptm[binder] is the mean of those three, so chains the binder never")
print("  touches decide the score")
print(f"  Protenix-basic (>0.8): {s3['chain_iptm'][-1] > 0.8}   "
      f"Protenix (>0.85): {s3['chain_iptm'][-1] > 0.85}")

print("\nthe same interface, different binder length")
print(f"  {'residues':>9} {'d0':>7} {'ptx_ptm_binder':>15} {'>0.88':>6} {'ptx_iptm_binder':>16}")
prev = -1.0
for L in [16, 30, 50, 80, 120, 200]:
    r = score([116, L], {(0, 1): BIND})
    print(f"  {L:>9} {calculate_normalization(L):>7.3f} {r['chain_ptm'][-1]:>15.4f} "
          f"{str(r['chain_ptm'][-1] > 0.88):>6} {r['chain_iptm'][-1]:>16.4f}")
    assert r["chain_ptm"][-1] > prev
    prev = r["chain_ptm"][-1]
print("  chain_ptm normalises by the length of the chain it scores, so 0.88 is a")
print("  different demand at every binder length")
```

```
sample_confidence.py is byte-identical between protenix 0.5.0 and the v0.5.0+pxd tag PXDesign pins

one target chain of 116 residues, an 80-residue binder as the last chain
  ptx_ptm          0.8649   whole complex
  ptx_iptm         0.8270   whole complex
  ptx_ptm_binder   0.7813   chain_ptm[last]
  ptx_iptm_binder  0.8270   chain_iptm[last]
  with two chains, ptx_iptm and ptx_iptm_binder are the same number

three target chains kept, the binder engaging only the first
  ptx_iptm         0.8437   reads like a good complex
  ptx_iptm_binder  0.2988   what the filter thresholds
  per chain pair: binder-A0 0.8270  binder-B0 0.0368  binder-C0 0.0325
  chain_iptm[binder] is the mean of those three, so chains the binder never
  touches decide the score
  Protenix-basic (>0.8): False   Protenix (>0.85): False

the same interface, different binder length
   residues      d0  ptx_ptm_binder  >0.88  ptx_iptm_binder
         16   0.168          0.0632  False           0.7721
         30   1.258          0.4802  False           0.7875
         50   2.256          0.6772  False           0.8057
         80   3.186          0.7813  False           0.8270
        120   4.050          0.8412  False           0.8481
        200   5.266          0.8927   True           0.8763
```

Three consequences, and the first is the one that will cost you designs:

- **Keeping target chains your binder does not touch destroys `ptx_iptm_binder`.** Because
  it averages over chain pairs, a perfect interface against the first of three kept chains
  scores 0.30 rather than 0.83, and fails both Protenix filters, while the global `ptx_iptm`
  still reads 0.84 and looks healthy. Crop the target to the chains the binder is meant to
  engage. Where the epitope genuinely spans two chains you must keep both, and you should
  then expect the threshold to behave differently than it does on a single-chain target.
- **On a single-chain target, `ptx_iptm` and `ptx_iptm_binder` are the same number**, so
  nothing is lost by using either — and nothing is gained by quoting both as if they were
  independent evidence.
- **`ptx_ptm_binder` is length-normalised on the binder alone.** The same interface scores
  0.68 at 50 residues and 0.89 at 200, because the TM normalisation constant is computed
  from the scored chain's length; below 19 residues it hits a floor and the score collapses.
  The direction is an invariant of the formula. The absolute numbers above come from a
  stand-in PAE distribution, not from a prediction, so read them as the shape of the effect
  and not as calibration. Practically: `> 0.88` is a much harder demand on a 50-residue
  binder than on a 120-residue one, and a threshold you tuned at one length does not
  transfer to another.

**Where this skill stops.** PXDesign hands you a filtered, ranked CSV. Deciding which of
those designs to synthesise — how much a confidence filter is worth, what it discards, how
to ensemble predictors, and what the published hit rates were measured against — is the
subject of the `binder-design-filtering` skill, which starts exactly here. Its threshold
table is where the numbers above sit against the rest of the field's, and it is worth
reading before you spend an order.

## Limits

- **Only the diffusion generator ships.** The technical report describes two, diffusion
  (PXDesign-d) and hallucination (PXDesign-h); the repository contains one checkpoint and
  the diffusion generator alone. The in-silico benchmarking covers both, and the wet-lab
  table is PXDesign-d — so the hit rates quoted at the top of this page are for the half
  you can run, which is the good case. The hallucination results are not reproducible from
  this repository.
- **The pipeline's honesty about its own failures is worth reading.** Its report records
  0 successful binders from 20 designs against TNF-α, notes that confidence thresholds do
  not transfer between targets — raising one target's pTM cutoff improved it and destroyed
  another — and that its filters look overly strict on the standard public benchmark while
  working in the wet lab. Do not carry a threshold between targets without re-checking it.
- **The filters see one prediction each.** Protenix runs at `N_sample: 1` per design by
  default and the summary averages what it gets; there is no seed ensembling in the shipped
  configuration, and a single prediction is not a measurement.
- **Nothing here predicts affinity, specificity, expression or immunogenicity.** A design
  that passes every filter has cleared a structural plausibility bar and nothing else.
- **Hotspots are a bias, not a constraint.** A design can pass every filter while binding a
  different surface than the one you specified. The re-predicted complex in
  `passing-Protenix-basic/` is where you check that, not the score.
- **The environment is not shareable.** The Protenix pin is a fork tag incompatible with
  every published release, and PXDesign must be installed editable. It wants its own
  environment and its own machine image.

## Try it

A cold check of the claim this skill spends most of its length on: which residues a PXDesign
target specification actually names, and whether the weights are still fetchable. No GPU, no
install, standard library only.

**Data** — PDB entry 5O45, the PD-L1 structure PXDesign's own example designs against, plus
the two weight archives the pipeline downloads:

    https://files.rcsb.org/download/5O45.cif
    https://pxdesign.tos-cn-beijing.volces.com/release_model/pxdesign_v0.1.0.pt
    https://storage.googleapis.com/alphafold/alphafold_params_2022-12-06.tar

PDB coordinate data is public domain and needs no account. The PXDesign weights are
Apache-2.0 by the project's statement and the AlphaFold2 parameters are CC BY 4.0. The block
probes the two archives rather than downloading them; together they are 5.7 GB. All three
confirmed reachable 2026-08-28.

```bash
mkdir -p pxdesign-check && cd pxdesign-check

# PDB entry 5O45, the PD-L1 structure PXDesign's own example designs against.
# Public domain, no account, no licence to accept.
curl -sSL -o 5O45.cif https://files.rcsb.org/download/5O45.cif

python3 - <<'PY'
import re, urllib.request as U, urllib.error

TOKEN = re.compile(r"'([^']*)'|\"([^\"]*)\"|(\S+)")

def poly_seq(path):
    """One record per residue of every polymer chain, from _pdbx_poly_seq_scheme:
    label_asym_id, label_seq_id, the deposited (auth) chain and number, and whether
    the residue has coordinates. This table is where the two numberings are related."""
    cols, out, state = [], [], "scan"
    for raw in open(path, errors="replace"):
        s = raw.strip()
        if state == "scan":
            if s.startswith("_pdbx_poly_seq_scheme."):
                cols.append(s.split(".", 1)[1]); state = "cols"
            continue
        if state == "cols":
            if s.startswith("_pdbx_poly_seq_scheme."):
                cols.append(s.split(".", 1)[1]); continue
            state = "rows"
        if s in ("#", "") or s.startswith(("loop_", "_")):
            break
        f = [a or b or c for a, b, c in TOKEN.findall(s)]
        out.append(dict(zip(cols, f)))
    return out

rows = [r for r in poly_seq("5O45.cif") if r["asym_id"] == "A"]
label = {int(r["seq_id"]): r for r in rows}
offsets = {int(r["seq_id"]) - int(r["pdb_seq_num"]) for r in rows}

print(f"5O45 chain A: label_seq_id {min(label)}-{max(label)}, "
      f"auth chain {rows[0]['pdb_strand_id']} numbered "
      f"{rows[0]['pdb_seq_num']}-{rows[-1]['pdb_seq_num']}")
print(f"label_seq_id - auth_seq_id = {sorted(offsets)} over the whole chain")

# The shipped example: crop ["1-116"], hotspots [40, 99, 107], in label_seq_id.
for h in (40, 99, 107):
    r = label[h]
    print(f"  hotspot {h:>3} = {r['mon_id']} = auth {r['pdb_strand_id']}{r['pdb_seq_num']}")
print(f"  crop 1-116 = auth {label[1]['pdb_seq_num']}-{label[116]['pdb_seq_num']}")

assert offsets == {-16}
assert [label[h]["mon_id"] for h in (40, 99, 107)] == ["TYR", "MET", "TYR"]
assert [label[h]["pdb_seq_num"] for h in (40, 99, 107)] == ["56", "115", "123"]
assert (label[1]["pdb_seq_num"], label[116]["pdb_seq_num"]) == ("17", "132")

# Two indices that pass `pxdesign check-input` and design the wrong thing.
print(f"  hotspot 120 is inside the chain but outside the crop: "
      f"{120 in label and 120 > 116}")
print(f"  hotspot 300 exists in this chain: {300 in label}")
assert 120 in label and 300 not in label

def head(url):
    try:
        r = U.urlopen(U.Request(url, method="HEAD",
                                headers={"User-Agent": "pxdesign-skill-check"}), timeout=60)
        return r.status, int(r.headers.get("Content-Length") or 0)
    except urllib.error.HTTPError as e:
        return e.code, 0

print()
for url in ["https://pxdesign.tos-cn-beijing.volces.com/release_model/pxdesign_v0.1.0.pt",
            "https://storage.googleapis.com/alphafold/alphafold_params_2022-12-06.tar"]:
    code, n = head(url)
    print(f"{url.rsplit('/', 1)[1]:38} {code}  {n / 2**30:5.2f} GB")
    assert code == 200
PY
```

**Expect**

Invariants — true of PDB entry 5O45 and of PXDesign's input grammar regardless of release,
so a failure here means this skill is wrong:

- 5O45 chain A runs 1–129 in `label_seq_id` and 17–145 in `auth_seq_id`, a constant offset
  of −16 over the whole chain. The two numberings are not the same and PXDesign takes the
  first.
- The shipped example's hotspots — 40, 99, 107 — are Tyr, Met and Tyr, and are residues 56,
  115 and 123 in deposited numbering. Those are the residues the technical report names for
  this target, which is what ties the YAML's numbering to the paper's.
- The crop `1-116` covers deposited residues 17 to 132.
- Index 120 exists in the chain and lies outside the crop; index 300 does not exist at all.
  Both are accepted by `pxdesign check-input` and neither designs what you asked for.
- Both weight archives answer 200 without credentials. If either stops, the model is no
  longer obtainable and the skill needs a decision rather than a patch.

Observed 2026-08-28 — the archive sizes move when weights are rebuilt, so treat a mismatch
there as drift to investigate rather than a failure:

```
5O45 chain A: label_seq_id 1-129, auth chain A numbered 17-145
label_seq_id - auth_seq_id = [-16] over the whole chain
  hotspot  40 = TYR = auth A56
  hotspot  99 = MET = auth A115
  hotspot 107 = TYR = auth A123
  crop 1-116 = auth 17-132
  hotspot 120 is inside the chain but outside the crop: True
  hotspot 300 exists in this chain: False

pxdesign_v0.1.0.pt                     200   0.52 GB
alphafold_params_2022-12-06.tar        200   5.20 GB
```

## Sources

- PXDesign — https://github.com/bytedance/PXDesign, Apache-2.0. Read at commit `f788441`.
- PXDesignBench, the evaluation and filtering half —
  https://github.com/bytedance/PXDesignBench, Apache-2.0, tag `v0.1.2`. `pxd_configs/eval.py`
  is where every threshold quoted above is defined.
- Ren, M. *et al.* PXDesign — fast, modular, and accurate de novo design of protein binders.
  bioRxiv (2025). doi:10.1101/2025.08.15.670450. The technical report shipped with the
  repository is version 3, 2025-12-12; its Table 3 is the source of the seven target
  specifications converted above, and its section 5 of the limitations quoted.
- Protenix — https://github.com/bytedance/Protenix, Apache-2.0 for code and parameters
  alike. PXDesign pins the tag `v0.5.0+pxd`.
- ByteDance AML AI4Science Team *et al.* Protenix — advancing structure prediction through a
  comprehensive AlphaFold3 reproduction. bioRxiv (2025). doi:10.1101/2025.01.08.631967.
- Bennett, N. R. *et al.* Improving de novo protein binder design with deep learning.
  *Nat Commun* **14**, 2625 (2023). doi:10.1038/s41467-023-38328-5 — the AF2 initial-guess
  protocol the AF2-IG filter implements.
- Dauparas, J. *et al.* Robust deep learning-based protein sequence design using ProteinMPNN.
  *Science* **378**, 49–56 (2022). doi:10.1126/science.add2187. Weights MIT, from
  https://github.com/dauparas/ProteinMPNN.
- ColabDesign — https://github.com/sokrypton/ColabDesign, "THE BEER-WARE LICENSE" revision
  42. Supplies the AF2-IG and ProteinMPNN interfaces the filter stage drives, and the
  divide-by-31 PAE normalisation the `af2_pAE` and `i_pAE` columns inherit.
- AlphaFold2 parameters — https://storage.googleapis.com/alphafold/alphafold_params_2022-12-06.tar,
  CC BY 4.0 per the `LICENSE` member of the archive itself.
- BindCraft — https://github.com/martinpacesa/BindCraft, MIT — the source of the AF2-IG-easy
  thresholds.
- Anthropic. Autonomous de novo protein binder design, 2026.
  https://www-cdn.anthropic.com/30bf50e22a01388bb29bf077ee3f244531594b7a.pdf — the campaign
  whose ordered designs PXDesign contributed 358 of, more than any other generator used.
- RCSB PDB entries 5O45, 3DI3, 6M0J, 1WWW, 1BJ1, 1TNF, 1MOX, 1UBQ, 12E8, 6VXX, 1D3Z.
  https://www.rcsb.org
