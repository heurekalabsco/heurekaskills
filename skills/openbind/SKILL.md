---
name: openbind
description: OpenBind protein-ligand data from Diamond Light Source — fetch the CC0 EV-A71 2A structure-affinity release from Zenodo, read pKD and GCI kinetics per binding event, list the FatA and RdRp sets on Fragalysis, and set up OpenBind-0.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, binding-affinity, protein-structure, drug-discovery, zenodo]
covers: [openbind, diamond light source, xchem, fragalysis, fragment screening, crystallographic fragment screen, protein-ligand complex, co-crystal structure, binding affinity, kd, pkd, binding kinetics, grating-coupled interferometry, creoptix, enterovirus, ev-a71, coxsackievirus a16, 2a protease, fata, herbicide target, rdrp, dengue, zika, ns5, openbind-0, openfold3, cofolding, docking benchmark, structure-affinity, cc0]
papers: [doi:10.64898/2026.08.27.747600, doi:10.5281/zenodo.20026660, doi:10.5281/zenodo.20798527, doi:10.5281/zenodo.22037459]
access: [open]
platform: inveniordm
datasets: ["https://zenodo.org/api/records/22142262", "https://zenodo.org/api/records/22142262/files/OpenBind_EV-A71_2A.zip/content", "https://raw.githubusercontent.com/OpenBind-Consortium/EV-A71_2A_benchmark/be4405f3abdf7a933bc0c70ad14b7c6fd3bc8779/affinity/all_affinity_data_release_v1.csv", "https://raw.githubusercontent.com/OpenBind-Consortium/EV-A71_2A_benchmark/be4405f3abdf7a933bc0c70ad14b7c6fd3bc8779/affinity/reference/fragalysis_compound_reference.csv"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: Zenodo record 22142262 (version 2 of concept 20026660) / EV-A71_2A_benchmark at commit be4405f / Fragalysis REST API / openfold3 0.5.0 (OpenFold3 commit c477165) / rdkit 2026.09.1, pandas 3.0.6, numpy 2.5.4 / Python 3.12.8, uv 0.9.24 on macOS arm64
  executed: 10
  unverified: 1
  unverified_reason: The OpenBind-0 prediction block was not run. It needs an NVIDIA GPU with CUDA 12.1 or later and 32 GB of memory per the OpenFold3 docs, plus a 2.3 GB weight download, and this host is Apple Silicon with no CUDA on a slow link. The install and query-building blocks did run here (openfold3 0.5.0 imports, CLI parses). Re-run on a CUDA host to verify.
---

# OpenBind — crystal structures paired with measured affinities

OpenBind is a consortium hosted at Diamond Light Source, with Oxford and partners, that
produces protein–ligand crystal structures at fragment-screen scale and measures binding for
the same compounds, so the two can be learned from together. It publishes artefacts, not a
service. There is no query API and no hosted model. What exists is a set of Zenodo deposits,
a GitHub benchmark repository, structures browsable on Diamond's Fragalysis platform, and a
model checkpoint, OpenBind-0, distributed through the OpenFold3 package.

This skill gets those artefacts onto disk and, more importantly, reads them correctly. The
release looks simple, a folder of PDB and SDF files and a CSV with a pKD column, but three
things about it are easy to get wrong. The affinity belongs to a binding event, not to a
compound. The SMILES in the structure table has lost the stereo annotation that says whether
a racemate or one enantiomer was measured. And the DOI everyone cites points at a superseded
version whose file names differ from the current one.

Everything below is anonymous HTTPS. No account, token or click-through is needed for any
data route. OpenBind-0 needs a GPU, covered at the end.

## What has been released

Checked on 2026-10-21. Sizes are the byte counts Zenodo and the S3 host report.

| What | Where | Licence (read at source) | Size |
|---|---|---|---|
| EV-A71 2A structure–affinity release, version 2 | Zenodo record `22142262`, concept `20026660` | CC0-1.0 (Zenodo `rights`) | 124,498,453 B, one zip |
| Same release, version 1 (superseded) | Zenodo record `20026661` | CC0-1.0 | 98,388,623 B |
| Row-level affinity fits, curated pKD reference | GitHub `OpenBind-Consortium/EV-A71_2A_benchmark` | repository Apache-2.0, data CC0 per its README | 538,222 B and 56,410 B |
| Prepared inputs, docking and cofolding outputs | Zenodo record `20798528` | CC-BY-4.0 and MIT both listed; **`zip_run_af3.zip` is AlphaFold 3 output under Google's AF3 Output Terms** | 46.89 GB, 11 files |
| OpenBind-0 benchmark set (462 systems, MSAs) | Zenodo record `22037460` | CC-BY-4.0 | 9.34 GB, 16 files |
| GNINA sampling outputs on EV-A71 2A | Zenodo record `22211566` | CC-BY-4.0 | 651,348,584 B |
| FatA and Flavi NS5 RdRp fragment-to-hit structures | Fragalysis targets `FatA` (id 62), `Flavi_NS5_RdRp` (id 56) | **none stated** | not measured |
| OpenBind-0 weights `of3-ob-2025-06-30-174k.pt` | OpenFold3 parameter bucket, fetched by `setup_openfold` | Apache-2.0 per the OpenBind-0 announcement; CC BY 4.0 per the bucket's own `LICENSE` and its AWS Open Data registry entry | 2,287,872,989 B |

Five of these need a sentence each.

**The experimental release is the only CC0 item.** The derived benchmark deposits are
CC-BY-4.0, so they need attribution when reused. Record `20798528` lists both CC-BY-4.0 and
MIT without saying which governs what. The likeliest reading is MIT for code, CC-BY for data,
but the record does not say so. Between those two, treat it as CC-BY-4.0.

**One file in record `20798528` is AlphaFold 3 output.** `zip_run_af3.zip` (3,301,889,206 B)
holds AlphaFold 3 predictions. Whatever the record's label says, Google DeepMind's AlphaFold 3
Output Terms of Use (last modified 2024-11-09) govern those predictions. In summary, outputs
are "made available free of charge, for non-commercial use only". Only non-commercial
organisations may use them, and you may not use them "on behalf of a commercial organization
or in connection with any commercial activities". You may not share them with a commercial
organisation, except through publication or an open-source release. You may not use them to
train biomolecular structure-prediction models similar to AlphaFold 3. Redistribution must
carry a notice of the terms, and findings must cite the AlphaFold 3 paper. A commercial reader
cannot use this file at all. The download script below blocks it by name, and nothing in this
skill fetches it. On 2026-10-21 I scanned the file names in `A71EV2A_data.zip`,
`A71EV2A_prepared_inputs.zip` and `A71EV2A_docked.zip` remotely, and none mentions AlphaFold 3.

**The FatA and RdRp structures carry no licence.** OpenBind-0 was released alongside 717
structures from two fragment-to-hit campaigns, FatA (a herbicide target, with Syngenta) and
the RdRp domain of NS5 from dengue serotype 2 and Zika virus (with ASAP Discovery). They live
on Fragalysis only. The OpenBind-0 post says only that they are "available for download via
the fragalysis platform", and gives no terms. The Fragalysis target records and the
Fragalysis documentation state none either. The EV-A71 2A set, by contrast, is CC0. A
missing licence grants nothing, so this skill lists those structures but does not download
them. Ask `openbind@diamond.ac.uk` before training on them or redistributing them.

**Two sources give different licences for the OpenBind-0 weights.** The OpenBind
announcement says "OB0 is fully open source under the Apache 2.0 licence: the training data,
code, model weights, and training recipes are publicly available." The weights are served
from the `openfold3-data` S3 bucket. That bucket has a `LICENSE` file at its root (18,657 B,
dated 2026-03-20), and the file is the Creative Commons Attribution 4.0 International
licence. The AWS Open Data registry entry for the bucket ("OpenFold3 Training Data") also
lists CC BY 4.0. The OpenFold3 repository's Apache-2.0 `LICENSE` covers its code. This skill
does not decide between them. Both are permissive, and CC BY 4.0 adds an attribution
requirement. If the difference matters to you, ask the OpenFold or OpenBind maintainers.

**The model has no affinity head.** One OpenBind news post describes OpenBind-0 as trained on
OpenBind data to predict how strongly molecules bind. The technical post and the release
notes say otherwise. It is an OpenFold3 cofolding model trained on PDB structures to
2025-06-30, contains no OpenBind data, and predicts complex structures. Use the technical
description.

## Finding the current records

OpenBind releases on a stated six-month cadence, so check what exists before assuming the
table above is complete. There is a Zenodo community, `openbind`, but not every OpenBind
deposit is in it. The GNINA record was not, on 2026-10-21. Query both the community and a
keyword search:

```bash
python3 - <<'PY'
import json, urllib.request

RDM = {"Accept": "application/vnd.inveniordm.v1+json"}
Z = "https://zenodo.org/api"


def hits(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=RDM), timeout=60) as r:
        return {h["id"]: h for h in json.load(r)["hits"]["hits"]}


community = hits(f"{Z}/communities/openbind/records?size=25&sort=newest")
search = hits(f"{Z}/records?q=openbind&size=25&sort=newest")
for rid, h in sorted({**search, **community}.items(), reverse=True):
    lic = ",".join(x.get("id") or "free-text" for x in h["metadata"].get("rights", []))
    where = "community" if rid in community else "search only"
    print(f"{rid}  v{h['versions']['index']}  {lic:<14} {h['files']['total_bytes']/1e9:6.2f} GB  "
          f"{where:<11}  {h['metadata']['title'][:55]}")
PY
```

On 2026-10-21 this printed four records: `22211566` (search only), `22142262`, `22037460`
and `20798528` (all three in the community). A new data release shows up here first.

## Concept DOI, version DOI, and why the cited one is stale

The OpenBind blog posts and documentation page link `10.5281/zenodo.20026661`. That is **version 1**. Version 2, record `22142262`, was published
on 2026-08-28. Its `metadata.csv` is byte-identical to version 1's, but the per-event files
changed:

| per binding event | version 1 | version 2 |
|---|---|---|
| deposited complex | `<event>_complex_ref.pdb` | `<event>_complex_ref.pdb` |
| ligand as modelled | `<event>_ligand_ref.sdf` | `<event>_ligand_ref.sdf` |
| prepared receptor | `<event>_prepared.pdb` | — |
| prepared ligand | `<event>_ligand_prepared.sdf` | — |
| receptor with ligand and solvent removed | — | `<event>_delig-desolv.pdb` |

Code written against version 1's `prepared.pdb` finds nothing in version 2. Pin a **version**
record id in anything that must be reproducible, and resolve the **concept** id (`20026660`,
which redirects to the latest) only when you want whatever is newest. List the versions:

```bash
python3 - <<'PY'
import json, urllib.request

RDM = {"Accept": "application/vnd.inveniordm.v1+json"}
url = "https://zenodo.org/api/records/20026661/versions?size=25&sort=version"
with urllib.request.urlopen(urllib.request.Request(url, headers=RDM), timeout=60) as r:
    versions = json.load(r)["hits"]["hits"]
for h in sorted(versions, key=lambda h: h["versions"]["index"]):
    f = next(iter(h["files"]["entries"].values()))
    print(f"v{h['versions']['index']}  record {h['id']}  {h['metadata']['publication_date']}  "
          f"latest={h['versions']['is_latest']}  {f['key']} {f['size']:,} B  {f['checksum']}")
PY
```

Printed on 2026-10-21:

```
v1  record 20026661  2026-05-05  latest=False  OpenBind_EV-A71_2A.zip 98,388,623 B  md5:860a4979d0ba9decaa2bfaa933c1d217
v2  record 22142262  2026-08-28  latest=True  OpenBind_EV-A71_2A.zip 124,498,453 B  md5:93d972a5d2a71a7c93ebdb67dfe65ed1
```

## You do not have to download the zip to read it

Zenodo serves file content with `Accept-Ranges: bytes`. A zip keeps its directory at the end,
so a reader that issues HTTP Range requests can list all 4,404 entries and pull out the
115 kB metadata CSV after transferring about 0.7 MB of the 124 MB archive. The `RangeFile`
class in **Try it** below does exactly this with the standard library. It is the right first
move when you only need the table, or a handful of events. Download the whole archive, as in
**Get the files**, when you need the structures in bulk.

## How the release is organised

```
OpenBind_EV-A71_2A/
  EV-A71_2A.fasta               the crystallised construct, 150 residues
  EV-A71_2A_cfdb_msa.a3m        an MSA for that sequence
  EV-A71_2A_metadata.csv        one row per binding event
  structures/<compound_group>/<complex_name>/<complex_name>_{complex_ref.pdb, ligand_ref.sdf, delig-desolv.pdb}
```

**The unit of the release is the binding event, not the compound.** A `complex_name` such as
`A71EV2A-x0351a` is crystal `x0351`, ligand copy `a`. One soak can show a ligand in two or
three places, and those become `x0351a`, `x0351b`, `x0351c`. A `compound_group` is the
directory that collects every event for one SMILES. Its name is the event codes joined with
underscores, such as `x0428a_x2448a_x2448b`, so a group can span several crystals. In version
2, the 925 events fall into 699 groups, and 699 is the "compounds" figure the release quotes.

The PDB files carry the protein numbered to match the FASTA. Residue 7 through 144–147 is
modelled, and the termini are disordered. 488 complexes hold one protein chain, and 437 hold
two, because those crystal forms have two copies in the asymmetric unit. The files also carry the ligand as
residue `LIG`, a structural zinc (`ZN`, present in all 925), waters, and any DMSO (`DMS`). The protein is Coxsackievirus A16 2A protease, used as a surrogate
for EV-A71 2A. The two differ at five positions, none near the active site, and the FASTA is
the crystallised sequence whatever its header says.

`EV-A71_2A_metadata.csv` has these columns:

| column | meaning |
|---|---|
| `complex_name` | the binding event; also the Fragalysis observation code |
| `compound_group` | directory name; one SMILES per group |
| `smiles` | plain SMILES of the modelled ligand, with **enhanced stereo stripped** |
| `experimental_pKD` | −log10(KD / M), empty where there is no curated measurement |
| `covalent` | `True` for the two covalently bound events |
| `fragment_screen` | `True` for events from the original fragment screen, `False` for follow-on compounds |
| `pb_valid_prepared`, `pb_valid_ref` | PoseBusters validity of the prepared and the deposited ligand |
| `suspected_artefact` | ligand suspected to sit on a crystal contact rather than in a real site |
| `sucos_shape`, `pocket_qcov`, `sucos_shape_pocket_qcov` | similarity to the nearest earlier public PDB ligand–pocket pair (the Runs N' Poses metric), on a 0–100 scale |

Booleans are the strings `True` and `False`. The benchmark's headline set of 881 events is
`pb_valid_prepared == True and suspected_artefact == False`, and that filter reproduces 881
exactly.

## Reading the affinities

**The assay is grating-coupled interferometry** on a Creoptix WAVEsystem, using pulsed
analyte injections over captured protein. It is a kinetic measurement. Each fit gives an
on-rate, an off-rate and their ratio, and KD is that ratio, `kd / ka`. This holds, to
rounding, for every row of the released table.

**pKD in the metadata is a mean of logs.** It is the arithmetic mean of −log10(KD in M) over
every fit row whose `Sample type` is `Sample` and whose `Used in analysis` is `True`, grouped
by the exact CXSMILES of the sample measured. That reproduces the 649 values in the
reference table, `fragalysis_compound_reference.csv`, to within 1e-15. It also reproduces all
649 non-empty `experimental_pKD` values in the metadata to within 5e-5, the error you expect
from rounding to four decimals. It is not the log of the mean KD, which differs by
up to 1.17 log units for some samples, and it is not the median.

**pKD belongs to the binding event, not to the compound group.** Twelve groups are not
uniform. Nine have at least one event with no value next to events that have one. Five carry
two different values. Two groups, `x3201a_x3920a_x4347a` and `x5104a_x5200a_x5268a`, are in
both sets. The two-value groups come from stereochemistry that the plain SMILES cannot
express. The affinity table records CXSMILES with enhanced-stereo groups:
`a` (absolute, one known enantiomer), `&1` (a racemic mixture), and `o1` (a single
enantiomer whose identity was not assigned). A racemate and a separated enantiomer of the same
structure, or two diastereomers, are different samples with different KDs. They crystallise to
the same modelled ligand, so they share a `compound_group`. In group `x3229a_x3548a`, for example, the racemate
gives pKD 4.44 and the absolute enantiomer gives 4.75. Join affinities to structures on
`complex_name`, and never collapse a group to one pKD without deciding how.

The row-level table, `all_affinity_data_release_v1.csv`, has one row per fit:

| column | unit or format |
|---|---|
| `Run date` | `DD/MM/YYYY`, day first |
| `Cycle number` | Creoptix cycle within the run |
| `Protein concentration (μg/mL)` | capture concentration |
| `Channel` | `Ch Y-X`, active channel Y referenced against channel X. Every cycle has `Ch 2-1`, `Ch 3-1` and `Ch 4-1`, so one injection yields three rows |
| `Sample type` | `Sample` or `Control` |
| `ASAP IDs`, `OpenBind IDs` | compound and batch identifiers |
| `SMILES` | CXSMILES with enhanced stereo |
| `Sample concentration (M)` | top analyte concentration |
| `ka (M-1s-1)`, `kd (s-1)`, `KD (M)` | on-rate, off-rate, equilibrium constant |
| `ka error (%)`, `kd error (%)` | 95% confidence interval as a percentage of the value |
| `Rmax (pg/mm2)`, `Sqrt(Chi2) (pg/mm2)` | fitted maximum response and fit residual |
| `Used in analysis` | `True` if the fit passed curation |

The table has no fragalysis code. Its bridge to the structures is
`affinity/reference/fragalysis_compound_reference.csv` in the same repository, which maps each
`complex_name` to the CXSMILES that was measured. The release blog lists a `Comments` column.
The published CSV does not have one.

Set up an environment for the remaining Python blocks:

```bash
uv venv .venv --python 3.12
VIRTUAL_ENV=.venv uv pip install rdkit pandas numpy
.venv/bin/python -c "import rdkit, pandas; print('rdkit', rdkit.__version__, 'pandas', pandas.__version__)"
```

This builds one row per measured sample, keeps the stereo flag a reader needs, and writes it
to disk:

```python
import re
import numpy as np
import pandas as pd

BASE = ("https://raw.githubusercontent.com/OpenBind-Consortium/EV-A71_2A_benchmark/"
        "be4405f3abdf7a933bc0c70ad14b7c6fd3bc8779/affinity/")
fits = pd.read_csv(BASE + "all_affinity_data_release_v1.csv")
fits["Run date"] = pd.to_datetime(fits["Run date"], format="%d/%m/%Y")   # day first
fits["pKD"] = -np.log10(fits["KD (M)"])                                 # KD is molar


def stereo_label(cxsmiles):
    """Enhanced-stereo flags that a plain SMILES string drops."""
    m = re.search(r"\|(.+)\|", cxsmiles)
    flags = re.findall(r"(?:^|,)(a|o\d+|&\d+):", m.group(1)) if m else []
    kinds = {"a": "absolute", "o": "single enantiomer, unassigned", "&": "racemic mixture"}
    return "; ".join(sorted({kinds[f[0]] for f in flags})) or "no stereo groups"


curated = fits[(fits["Sample type"] == "Sample") & fits["Used in analysis"]]
per_sample = (curated.groupby("SMILES")
              .agg(pKD=("pKD", "mean"), pKD_sd=("pKD", "std"), n_fits=("pKD", "size"),
                   openbind_ids=("OpenBind IDs", lambda s: ";".join(sorted(set(s)))),
                   first_run=("Run date", "min"), last_run=("Run date", "max"))
              .reset_index())
per_sample["stereo"] = per_sample["SMILES"].map(stereo_label)
per_sample.to_csv("openbind_ev_a71_2a_pkd_per_sample.csv", index=False)

print(f"{len(fits)} fit rows: {fits['Sample type'].value_counts().to_dict()}, "
      f"channels {sorted(fits['Channel'].unique())}")
print(f"{len(per_sample)} curated samples; stereo {per_sample['stereo'].value_counts().to_dict()}")
print(f"fits per sample: median {per_sample.n_fits.median():.0f}, "
      f"max {per_sample.n_fits.max()}; pKD {per_sample.pKD.min():.2f}-{per_sample.pKD.max():.2f}")
```

On 2026-10-21 this printed:

```
2733 fit rows: {'Sample': 2559, 'Control': 174}, channels ['Ch 2-1', 'Ch 3-1', 'Ch 4-1']
494 curated samples; stereo {'absolute': 249, 'racemic mixture': 161, 'single enantiomer, unassigned': 47, 'no stereo groups': 37}
fits per sample: median 3, max 11; pKD 3.44-7.94
```

The headline count of "affinity measurements for 601 compounds" counts every measured
compound before curation. After the `Used in analysis` filter, 494 samples remain, attached to
649 events in 499 compound groups. The benchmark repository's `affinity/README.md` gives 490 for its final
compound-level set, after it also drops PoseBusters-invalid and artefact events. Quote the
figure that matches the filter you applied.

## Get the files

This downloads named files from one pinned record version. It refuses before any transfer
in five cases: the record is not open, the record carries a licence id outside `ACCEPT`, no
files are named, a named file is on the `BLOCKED` list, or the total exceeds `MAX_BYTES`.
Every licence id on the record must be in `ACCEPT`, so the dual-labelled benchmark record
passes when you accept both CC-BY-4.0 and MIT. A resume is accepted only as a `206` with a
matching `Content-Range`. Any other reply restarts the file from zero, so a server that
ignores `Range` cannot make it append whole copies. The script then checks the MD5 that
Zenodo declares, extracts zips, and writes a manifest recording which version and licence the
files came from:

```python
import hashlib, json, os, time, urllib.request, zipfile

ZENODO = "https://zenodo.org/api/records"
RDM = {"Accept": "application/vnd.inveniordm.v1+json"}

# What to fetch. Name files explicitly; nothing is fetched by default from the large
# benchmark records. Pick one line, or write your own.
RECORD, FILES = "22142262", {"OpenBind_EV-A71_2A.zip"}          # CC0 release, 124 MB
# RECORD, FILES = "22037460", {"queries.json", "ground_truth.tar.gz"}   # OB0 benchmark, 33 MB
# RECORD, FILES = "20798528", {"A71EV2A_data.zip"}                      # prepared set, 62 MB
ACCEPT = {"cc0-1.0", "cc-by-4.0", "mit"}   # every licence id on the record must be in here
MAX_BYTES = 500_000_000                    # refuse before any transfer above this total
BLOCKED = {  # never fetched by this script, whatever FILES says
    "zip_run_af3.zip": "AlphaFold 3 predictions, governed by the AlphaFold 3 Output Terms "
                       "of Use (non-commercial organisations only), not by the record licence",
}
OUT = f"openbind_{RECORD}"

with urllib.request.urlopen(urllib.request.Request(f"{ZENODO}/{RECORD}", headers=RDM),
                            timeout=60) as r:
    rec = json.load(r)
rights = {x.get("id") or "free-text" for x in rec["metadata"]["rights"]}
entries = rec["files"]["entries"]
if rec["access"]["status"] != "open":
    raise SystemExit(f"refusing: access is {rec['access']['status']}")
if not rights or not rights <= ACCEPT:
    raise SystemExit(f"refusing: licence {sorted(rights)} is not within {sorted(ACCEPT)}")
if not FILES:
    raise SystemExit("refusing: name the files you want in FILES")
if FILES & BLOCKED.keys():
    raise SystemExit("refusing: " + "; ".join(f"{k} is {BLOCKED[k]}" for k in FILES & BLOCKED.keys()))
if FILES - entries.keys():
    raise SystemExit(f"refusing: not in record {RECORD}: {sorted(FILES - entries.keys())}")
total = sum(entries[k]["size"] for k in FILES)
if total > MAX_BYTES:
    raise SystemExit(f"refusing: {total:,} B requested, over MAX_BYTES {MAX_BYTES:,}")

os.makedirs(OUT, exist_ok=True)
manifest = {"record": RECORD, "doi": rec["pids"]["doi"]["identifier"],
            "concept_doi": rec["parent"]["pids"]["doi"]["identifier"],
            "version_index": rec["versions"]["index"], "licence": sorted(rights), "files": []}
for name in sorted(FILES):
    e, path = entries[name], os.path.join(OUT, name)
    for attempt in range(20):
        have = os.path.getsize(path) if os.path.exists(path) else 0
        if have == e["size"]:
            break
        if have > e["size"]:                    # never trust an over-long partial file
            os.remove(path)
            have = 0
        hdr = {"Range": f"bytes={have}-"} if have else {}
        try:
            with urllib.request.urlopen(urllib.request.Request(e["links"]["content"], headers=hdr),
                                        timeout=120) as r:
                resumed = (r.status == 206 and (r.headers.get("Content-Range") or "")
                           .startswith(f"bytes {have}-"))
                if have and not resumed:        # Range ignored or misread: start again cleanly
                    print(f"  {name}: HTTP {r.status} without a matching Content-Range; restarting")
                    os.remove(path)
                    if r.status != 200:
                        continue
                    have = 0
                with open(path, "ab" if have else "wb") as fh:
                    while chunk := r.read(1 << 20):
                        fh.write(chunk)
        except OSError as err:
            print(f"  {name}: {err}; resuming")
            time.sleep(5)
    if not os.path.exists(path) or os.path.getsize(path) != e["size"]:
        raise SystemExit(f"{name}: incomplete after 20 attempts")
    algo, want = e["checksum"].split(":", 1)
    h = hashlib.new(algo)
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    if h.hexdigest() != want:
        raise SystemExit(f"{name}: {algo} mismatch, delete it and fetch again")
    item = {"key": name, "bytes": e["size"], algo: want}
    if name.endswith(".zip"):
        with zipfile.ZipFile(path) as z:
            z.extractall(OUT)
            item["zip_entries"] = len(z.namelist())
    manifest["files"].append(item)
    print(f"{name}: {e['size']:,} B, {algo} ok" +
          (f", {item['zip_entries']:,} entries extracted" if "zip_entries" in item else ""))

with open(os.path.join(OUT, "MANIFEST.json"), "w") as fh:
    json.dump(manifest, fh, indent=2)
print("wrote", os.path.join(OUT, "MANIFEST.json"))
```

Printed on 2026-10-21, after resuming from a partial file with a `206`. A full transfer took
24 minutes on a slow link, which is why the loop resumes rather than restarts:

```
OpenBind_EV-A71_2A.zip: 124,498,453 B, md5 ok, 4,404 entries extracted
wrote openbind_22142262/MANIFEST.json
```

The archive extracts to 925 binding-event directories under 699 compound groups. Each event
holds the three files listed above.

These are the refusals, each run on 2026-10-21. None of them transfers or writes anything.

| change | printed |
|---|---|
| `RECORD, FILES = "20798528", {"zip_run_af3.zip"}` | `refusing: zip_run_af3.zip is AlphaFold 3 predictions, governed by the AlphaFold 3 Output Terms of Use (non-commercial organisations only), not by the record licence` |
| `RECORD, FILES = "20798528", {"zip_run_rf3.zip"}` | `refusing: 4,768,191,812 B requested, over MAX_BYTES 500,000,000` |
| `ACCEPT = {"cc0-1.0"}` with record `20798528` | `refusing: licence ['cc-by-4.0', 'mit'] is not within ['cc0-1.0']` |
| `RECORD, FILES = "22037460", set()` | `refusing: name the files you want in FILES` |

Against a local server that ignores `Range`, a 1,000,000 B partial file printed
`HTTP 200 without a matching Content-Range; restarting` and then completed with the MD5
matching. An over-long partial file was discarded and refetched.

Then read the events. **A `complex_ref.pdb` can hold more ligands than the event's own.**
Crystal `x1180` has a ligand bound to each of its two chains, and
both `x1180a_complex_ref.pdb` and `x1180b_complex_ref.pdb` contain both `LIG` residues.
Selecting `resname LIG` from the PDB therefore returns more than one ligand for 293 of the
925 events. The event's ligand is the one in
`ligand_ref.sdf`. This block finds which `LIG` residue that is, by coordinates, and checks
the SDF's chemistry against the metadata SMILES. Run it from the directory that holds
`openbind_22142262/`:

```python
from collections import defaultdict

import numpy as np
import pandas as pd
from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")
ROOT = "openbind_22142262/OpenBind_EV-A71_2A"
meta = pd.read_csv(f"{ROOT}/EV-A71_2A_metadata.csv")


def event_files(row):
    d = f"{ROOT}/structures/{row.compound_group}/{row.complex_name}/{row.complex_name}"
    return d + "_complex_ref.pdb", d + "_ligand_ref.sdf", d + "_delig-desolv.pdb"


def lig_residues(pdb_path):
    """Heavy-atom coordinates of every LIG residue in a complex, keyed by (chain, resnum)."""
    res = defaultdict(list)
    for line in open(pdb_path):
        if line.startswith("HETATM") and line[17:20] == "LIG" and line[76:78].strip() != "H":
            res[(line[21], int(line[22:26]))].append(
                [float(line[30:38]), float(line[38:46]), float(line[46:54])])
    return {k: np.array(v) for k, v in res.items()}


def flat(smi):
    """Canonical SMILES with stereo removed, for a like-for-like comparison."""
    m = Chem.MolFromSmiles(smi)
    Chem.RemoveStereochemistry(m)
    return Chem.MolToSmiles(m)


rows = []
for row in meta.itertuples():
    complex_pdb, ligand_sdf, apo_pdb = event_files(row)
    lig = Chem.MolFromMolFile(ligand_sdf)          # this event's ligand, crystal coordinates
    xyz = lig.GetConformer().GetPositions()
    residues = lig_residues(complex_pdb)
    # The complex holds every ligand copy in the crystal; find the one that is this event.
    dist = {k: np.min(np.linalg.norm(c[:, None] - xyz[None], axis=2), axis=0).max()
            for k, c in residues.items()}
    best = min(dist, key=dist.get)
    rows.append({
        "complex_name": row.complex_name,
        "lig_residues_in_complex": len(residues),
        "event_residue": f"{best[0]}{best[1]}",
        "max_atom_offset_A": round(float(dist[best]), 3),
        "graph_matches_metadata": flat(Chem.MolToSmiles(lig)) == flat(row.smiles),
    })
check = pd.DataFrame(rows)
check.to_csv("openbind_event_ligands.csv", index=False)
print("ligand graph matches metadata SMILES:", int(check.graph_matches_metadata.sum()), "of", len(check))
print("complexes holding more than one LIG residue:", int((check.lig_residues_in_complex > 1).sum()))
print("events whose SDF sits on a LIG residue (every atom within 0.1 A):",
      int((check.max_atom_offset_A < 0.1).sum()))
print(check.sort_values("max_atom_offset_A").tail(3).to_string(index=False))
```

Printed on 2026-10-21:

```
ligand graph matches metadata SMILES: 925 of 925
complexes holding more than one LIG residue: 293
events whose SDF sits on a LIG residue (every atom within 0.1 A): 923
  complex_name  lig_residues_in_complex event_residue  max_atom_offset_A  graph_matches_metadata
A71EV2A-x7631a                        1          A201              0.000                    True
A71EV2A-x1778a                        1          A201              1.797                    True
A71EV2A-x1776a                        1          A201              1.868                    True
```

Two events, `x1776a` and `x1778a`, have one more heavy atom in the SDF than in the PDB's
`LIG` residue, so their nearest-residue offset is large. The SDF carries the complete
ligand. Prefer it whenever the two disagree.

The other Zenodo deposits are large, so name files from them rather than taking whole records.
The commented lines in the script are the useful starting points. For record `22037460`,
`{"queries.json", "ground_truth.tar.gz"}` (448,958 B and 32,829,183 B) is enough to rerun
the OpenBind-0 benchmark against your own model, without the 3.8 GB processed MSAs. For
record `20798528`, `{"A71EV2A_data.zip"}` (61,839,284 B) is the prepared dataset. Its eight
cofolding archives are 2.9 to 8.4 GB each. Raise `MAX_BYTES` deliberately if you want one,
and leave `zip_run_af3.zip` blocked unless a person has confirmed that the AlphaFold 3 Output
Terms allow your use.

Run with the `22037460` line uncommented, the script printed on 2026-10-21:

```
ground_truth.tar.gz: 32,829,183 B, md5 ok
queries.json: 448,958 B, md5 ok
wrote openbind_22037460/MANIFEST.json
```

## The FatA and RdRp structures on Fragalysis

Fragalysis has a public, anonymous REST API. Each binding event is a "site observation" under
a target. This writes a catalogue of the three OpenBind targets, giving event codes, compound
codes and file URLs. It downloads no structure files, for the licence reason given above. The catalogue holds
`bound_file` URLs. **Do not fetch those URLs for FatA or RdRp unless the user has confirmed
terms with OpenBind.**

```bash
python3 - <<'PY'
import csv, json, urllib.request
from collections import Counter

API = "https://fragalysis.diamond.ac.uk/api"


def get(path):
    with urllib.request.urlopen(f"{API}/{path}", timeout=120) as r:
        return json.load(r)


targets = {t["title"]: t for t in get("targets/?format=json")["results"]}
with open("openbind_fragalysis_catalogue.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["target", "code", "longcode", "compound_code", "series", "bound_file"])
    for title in ("FatA", "Flavi_NS5_RdRp", "A71EV2A"):
        t = targets[title]
        page = get(f"site_observations/?format=json&target={t['id']}&limit=2000")
        obs = page["results"]
        assert page["next"] is None and len(obs) == page["count"]
        live = [o for o in obs if not o["superseded"]]
        for o in live:
            w.writerow([title, o["code"], o["longcode"], o["compound_code"],
                        o["prefix_tooltip"], o["bound_file"]])
        series = Counter(o["prefix_tooltip"] or "(none)" for o in live)
        print(f"{title:<15} target {t['id']:>3}  {len(live):>4} binding events  "
              f"{len({o['compound_code'] for o in live}):>4} compound codes  {dict(series)}")
print("wrote openbind_fragalysis_catalogue.csv")
PY
```

On 2026-10-21 this printed:

```
FatA            target  62   402 binding events   161 compound codes  {'(none)': 402}
Flavi_NS5_RdRp  target  56   347 binding events   235 compound codes  {'DENV2_NS5_RdRp structures': 120, 'Zika_NS5_RdRp structures': 203, 'external Flavi_NS5_RdRp structures': 24}
A71EV2A         target  53   925 binding events   713 compound codes  {'A71 2A structures': 925}
wrote openbind_fragalysis_catalogue.csv
```

FatA matches the 402 events OpenBind announced. The RdRp target does not match its
announcement (124 DENV-2 and 191 ZIKV, 315 in all). It now holds 120 and 203, plus 24
external PDB structures that are not OpenBind data. Filter on `series` before counting.
Fragalysis `compound_code` is a supplier or registry identifier, so 713 codes for EV-A71 2A
is not the same partition as the release's 699 SMILES groups. Do not use it to count
compounds.

## OpenBind-0

**What you need first: an NVIDIA GPU with CUDA 12.1 or later and at least 32 GB of memory**,
which is OpenFold3's stated requirement for inference. You also need 2.3 GB of disk for the
weights, and outbound access to the ColabFold MSA server, unless you supply MSAs yourself.
OpenFold3 ships a CPU environment that also covers Apple Silicon. The install below works on
macOS arm64, and PyTorch reports MPS as available there, but this skill did not run a
prediction on it. Expect it to be slow if it works at all.

OpenBind-0 is OpenFold3 version 0.5.0 with the checkpoint `openbind-2025-06-30-174k`, which
is that version's default. Install it into its own environment:

```bash
uv venv .venv-ob0 --python 3.12
VIRTUAL_ENV=.venv-ob0 uv pip install "openfold3==0.5.0"
.venv-ob0/bin/run_openfold --help | head -5
```

Build queries from the release itself: the construct sequence, the structural zinc, and a
ligand per event. Leaving out the zinc gives the model a different protein from the one that
was crystallised. One protein chain matches what OpenBind did. Most of the cofolding
archives in record `20798528` are named `..._monomer`, even though 437 of the crystals hold
two copies.

```python
import csv, json

ROOT = "openbind_22142262/OpenBind_EV-A71_2A"
EVENTS = ["A71EV2A-x7631a", "A71EV2A-x5854a", "A71EV2A-x3548a"]

with open(f"{ROOT}/EV-A71_2A.fasta") as fh:
    sequence = "".join(l.strip() for l in fh if not l.startswith(">"))
meta = {r["complex_name"]: r for r in csv.DictReader(open(f"{ROOT}/EV-A71_2A_metadata.csv"))}

queries = {}
for ev in EVENTS:
    r = meta[ev]
    queries[ev] = {"chains": [
        {"molecule_type": "protein", "chain_ids": "A", "sequence": sequence},
        {"molecule_type": "ligand", "chain_ids": "Z", "ccd_codes": "ZN"},   # structural zinc
        {"molecule_type": "ligand", "chain_ids": "L", "smiles": r["smiles"]},
    ]}
with open("ob0_queries.json", "w") as fh:
    json.dump({"queries": queries}, fh, indent=2)
print(f"{len(queries)} queries, protein {len(sequence)} aa ->", "ob0_queries.json")
```

Then download the weights and predict. `setup_openfold --non-interactive` writes outside the
project. It puts the 2.3 GB checkpoint, a `ckpt_root` pointer and `setup_config.json` into
`~/.openfold3`. It also refreshes the chemical component dictionary inside the environment's
`biotite` package, which stays inside `.venv-ob0`. To keep the checkpoint in the project, use
`setup_openfold --config` with a JSON file that sets `openfold_cache` and `param_directory`.
The non-interactive default ignores `OPENFOLD_CACHE`. `run_openfold` finds the checkpoint
through the `ckpt_root` file in `$OPENFOLD_CACHE`, and falls back to `~/.openfold3`. So
after a `--config` setup, either export `OPENFOLD_CACHE` set to the same `openfold_cache`
before predicting, or pass `--inference-ckpt-path` pointing at the `.pt` file. The checkpoint name is passed explicitly,
because the 0.5.0 documentation contradicts itself on the default.

```bash
# Downloads of3-ob-2025-06-30-174k.pt (2,287,872,989 B) into ~/.openfold3
.venv-ob0/bin/setup_openfold --non-interactive
.venv-ob0/bin/run_openfold predict \
    --query-json ob0_queries.json \
    --inference-ckpt-name openbind-2025-06-30-174k \
    --use-msa-server true \
    --num-model-seeds 5 --num-diffusion-samples 5 \
    --output-dir ob0_out
```

The release ships `EV-A71_2A_cfdb_msa.a3m`, but OpenFold3 reads precomputed MSAs from per-chain
directories with file names declared in a runner YAML. Wiring that up is the way to avoid the
MSA server, and it was not exercised here. To judge a prediction, compare the top-ranked pose
with `<event>_ligand_ref.sdf`. OpenBind scores success as ligand RMSD ≤ 2 Å, LDDT-PLI ≥ 0.8
and PoseBusters-valid. A fine-tuned OpenFold3 checkpoint for this target,
`of3p2-ft-ev2a.ckpt` (6,713,591,118 B), is linked from the benchmark repository. It was
fine-tuned from the preview-2 weights, which the 0.5.0 release notes say no longer work with
openfold3 0.5 or later, so it needs an `openfold3<0.5` install of its own.

## Try it

**Data.** OpenBind's EV-A71 2A structure–affinity release, Zenodo record `22142262` (CC0-1.0),
and two CSVs from the OpenBind benchmark repository at a pinned commit (Apache-2.0
repository, CC0 data). No account or token is needed. The block streams about 0.7 MB of the
124 MB archive through HTTP Range requests, so it never downloads the zip, and it needs only
the Python standard library.

**Run.** In an empty directory:

```bash
cat > openbind_check.py <<'PY'
import csv, io, json, math, statistics, time, urllib.request, zipfile
from collections import defaultdict

ZEN = "https://zenodo.org/api/records"
RDM = {"Accept": "application/vnd.inveniordm.v1+json"}
VERSION = "22142262"                      # v2 of concept 20026660, pinned
GH = ("https://raw.githubusercontent.com/OpenBind-Consortium/EV-A71_2A_benchmark/"
      "be4405f3abdf7a933bc0c70ad14b7c6fd3bc8779/affinity/")


class RangeIgnored(Exception):
    pass


def get(url, headers=None, tries=5):
    """Body and headers. A Range request must come back 206, checked before reading."""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=120) as r:
                if "Range" in (headers or {}) and (
                        r.status != 206 or not r.headers.get("Content-Range")):
                    raise RangeIgnored(f"server ignored Range (HTTP {r.status}); not reading body")
                return r.read(), r.headers
        except RangeIgnored:
            raise
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


class RangeFile(io.RawIOBase):
    """A seekable view of a remote file; each read is one HTTP Range request."""
    def __init__(self, url):
        self.url, self.pos, self.fetched = url, 0, 0
        _, h = get(url, {"Range": "bytes=0-0"})
        self.size = int(h["Content-Range"].split("/")[1])
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = [off, self.pos + off, self.size + off][whence]
        return self.pos
    def readinto(self, b):
        n = min(len(b), self.size - self.pos)
        if n <= 0:
            return 0
        data, _ = get(self.url, {"Range": f"bytes={self.pos}-{self.pos + n - 1}"})
        b[:len(data)] = data
        self.pos += len(data)
        self.fetched += len(data)
        return len(data)


# 1. The record: licence and version, read before any data moves.
rec = json.loads(get(f"{ZEN}/{VERSION}", RDM)[0])
lic = [r["id"] for r in rec["metadata"]["rights"]]
assert rec["access"]["status"] == "open" and lic == ["cc0-1.0"], lic
latest = json.loads(get(f"{ZEN}/20026660", RDM)[0])          # concept id -> latest
entry = rec["files"]["entries"]["OpenBind_EV-A71_2A.zip"]
print(f"record {VERSION}: v{rec['versions']['index']}, licence {lic[0]}, "
      f"zip {entry['size']:,} B; concept now resolves to {latest['id']}")

# 2. Read the 124 MB archive's directory and one CSV without downloading it.
rf = RangeFile(entry["links"]["content"])
z = zipfile.ZipFile(io.BufferedReader(rf, buffer_size=1 << 16))
names = set(z.namelist())
meta = list(csv.DictReader(io.TextIOWrapper(
    z.open("OpenBind_EV-A71_2A/EV-A71_2A_metadata.csv"), encoding="utf-8")))
print(f"read {len(names):,} zip entries and {len(meta)} metadata rows "
      f"using {rf.fetched:,} B of {rf.size:,}")

# 3. Invariants of the layout: one row per binding event, three files each,
#    filed under a compound_group directory, one SMILES per group.
groups, smiles = defaultdict(list), defaultdict(set)
for r in meta:
    g, ev = r["compound_group"], r["complex_name"]
    assert ev.split("-")[1] in g.split("_"), (ev, g)
    for suffix in ("complex_ref.pdb", "ligand_ref.sdf", "delig-desolv.pdb"):
        assert f"OpenBind_EV-A71_2A/structures/{g}/{ev}/{ev}_{suffix}" in names, (ev, suffix)
    groups[g].append(r)
    smiles[g].add(r["smiles"])
assert len({r["complex_name"] for r in meta}) == len(meta)
assert all(len(s) == 1 for s in smiles.values())

# 4. pKD is -log10(KD in M), averaged over the curated GCI fits of the
#    measured sample, and it belongs to the binding event, not the group.
rows = list(csv.DictReader(io.StringIO(get(GH + "all_affinity_data_release_v1.csv")[0].decode())))
ref = list(csv.DictReader(io.StringIO(
    get(GH + "reference/fragalysis_compound_reference.csv")[0].decode())))
fits = defaultdict(list)
for r in rows:
    ka, kd, KD = float(r["ka (M-1s-1)"]), float(r["kd (s-1)"]), float(r["KD (M)"])
    assert math.isclose(KD, kd / ka, rel_tol=0.02), r          # KD = kd / ka
    if r["Sample type"] == "Sample" and r["Used in analysis"] == "True":
        fits[r["SMILES"]].append(-math.log10(KD))
by_event = {r["complex_name"]: r["experimental_pKD"] for r in meta}
with_pkd = [r for r in meta if r["experimental_pKD"]]
assert {r["fragalysis_code"] for r in ref} == {r["complex_name"] for r in with_pkd}
for r in ref:
    mean = statistics.mean(fits[r["smiles"]])
    assert abs(mean - float(r["experimental_pKD"])) < 1e-9, r                # reference
    assert abs(mean - float(by_event[r["fragalysis_code"]])) < 1e-4, r      # metadata, 4 dp
uneven = sum(len({x["experimental_pKD"] for x in v}) > 1 for v in groups.values())
two_values = sum(len({x["experimental_pKD"] for x in v} - {""}) > 1 for v in groups.values())

print(f"{len(groups)} compound groups, {len(with_pkd)} events with pKD "
      f"({len({r['compound_group'] for r in with_pkd})} groups); "
      f"{uneven} groups not uniform in pKD, {two_values} of them with two values")
print(f"{len(rows)} GCI fit rows -> {len(fits)} curated samples; "
      f"every event pKD reproduced from them")
print(f"pKD range {min(float(r['experimental_pKD']) for r in with_pkd):.2f}"
      f"-{max(float(r['experimental_pKD']) for r in with_pkd):.2f}; "
      f"fragment-screen events {sum(r['fragment_screen'] == 'True' for r in meta)}, "
      f"suspected artefacts {sum(r['suspected_artefact'] == 'True' for r in meta)}")
PY
python3 openbind_check.py
```

**Expect.** Run cold in a fresh empty directory on 2026-10-21, this printed:

```
record 22142262: v2, licence cc0-1.0, zip 124,498,453 B; concept now resolves to 22142262
read 4,404 zip entries and 925 metadata rows using 691,498 B of 124,498,453
699 compound groups, 649 events with pKD (499 groups); 12 groups not uniform in pKD, 5 of them with two values
2733 GCI fit rows -> 494 curated samples; every event pKD reproduced from them
pKD range 3.44-7.94; fragment-screen events 113, suspected artefacts 39
```

*Invariants*, asserted by the script, so a failure means the skill is wrong. The record is
open and CC0. Every metadata row is a unique binding event whose code is in its group's name,
and whose three files are in the zip under `structures/<group>/<event>/`. Each compound group
has exactly one SMILES. Every fit row satisfies KD = kd / ka. The reference table covers
exactly the metadata events that carry a pKD, no more and no fewer. Every curated pKD in the
reference equals the mean of −log10(KD) over that sample's curated fits to 1e-9, and matches
the metadata value for its event to 1e-4, since the metadata rounds to four decimals. The
Range probe stops before reading any body if the server answers without a `206`.

*Observed values, 2026-10-21*. These depend on the release, so a mismatch means drift to
investigate. Pinned version `22142262` is immutable on Zenodo, so for these counts to move the
pin itself must have changed. 4,404 zip entries. 925 events in 699 groups. 649 events with
pKD across 499 groups. 12 groups not uniform in pKD, 5 of them with two different values. 2,733 fit rows reducing to
494 curated samples. pKD from 3.44 to 7.94. 113 fragment-screen events. 39 suspected
artefacts. The concept id resolving to `22142262`, which changes when version 3 lands.

## Sources

- OpenBind project site, releases and blog posts — <https://openbind.uk/>
- Data release, concept DOI — <https://doi.org/10.5281/zenodo.20026660>
- Preprint describing the dataset and benchmarks — <https://doi.org/10.64898/2026.08.27.747600>
- Benchmark repository — <https://github.com/OpenBind-Consortium/EV-A71_2A_benchmark>
- OpenBind-0 release scripts and benchmark results — <https://github.com/OpenBind-Consortium/OpenBind-0-model-release-info>
- OpenFold3, release v0.5.0 — <https://github.com/aqlaboratory/openfold-3/releases/tag/v0.5.0>
- Fragalysis and its documentation — <https://fragalysis.diamond.ac.uk/>, <https://fragalysis.readthedocs.io/>
- Experimental protocols — <https://www.protocols.io/workspaces/openbind>
