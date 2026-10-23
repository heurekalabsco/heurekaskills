---
name: aizynthfinder
description: Plan retrosynthetic routes to purchasable building blocks with AiZynthFinder on CPU — fetch the CC-BY USPTO models, build a stock that actually matches (InChIKeys), bound the search, and rank and read the route trees.
category: models
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [cheminformatics, drug-discovery, retrosynthesis]
covers: [retrosynthesis, synthesis planning, route planning, CASP, computer-aided synthesis planning, reaction templates, USPTO, Monte Carlo tree search, MCTS, building blocks, starting materials, purchasable compounds, stock, ZINC, InChIKey, small molecule, medicinal chemistry, synthetic accessibility, ONNX, AstraZeneca, MolecularAI]
papers: [doi:10.1186/s13321-020-00472-1, doi:10.1186/s13321-024-00860-x]
datasets: [https://zenodo.org/records/7797465/files/uspto_model.onnx, https://zenodo.org/records/7341155/files/uspto_unique_templates.csv.gz, https://zenodo.org/records/7797465/files/uspto_filter_model.onnx]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-22
  against: aizynthfinder 4.4.1 (PyPI; repository HEAD 21ff546 differs only in reactiontree subtree code) / rdkit 2023.9.6, onnxruntime 1.31.0, numpy 1.26.4, pyarrow 25.0.1, pandas 2.3.3 / Python 3.11.14 in a uv venv / CPU only, macOS arm64 / models from Zenodo records 7797465 and 7341155, md5-verified
  executed: 9
  unverified: 2
  unverified_reason: The two blocks using the full public kit (download_public_data and the ZINC stock with the ring-breaker policy) need a 790 MB download whose 663 MB ZINC file stalled over the available link. Re-run from a host with a fast connection to Zenodo and figshare.
---

# Retrosynthesis planning with AiZynthFinder

AiZynthFinder takes a target molecule and works backwards. A neural network ranks which
reaction templates, extracted from US patent reactions, are likely to apply to the
molecule; each applied template splits it into precursors; a Monte Carlo tree search
keeps expanding precursors until every leaf is a compound in your **stock**, or the
search runs out of iterations or time. What comes back is a set of route trees, each
scored, each marked solved or not.

Hold the output at the right distance. **A route is a suggestion from a template model,
not a validated synthesis.** It names reactants, not reagents, solvents, temperatures or
yields. It has not been checked for selectivity, protecting-group needs, or whether the
step works on your substrate. A solved route means every leaf matched something in a
stock file you supplied — nothing more. Treat the top routes as a shortlist for a chemist
to read, and expect to discard some.

Three things decide whether a run is useful, and none of them are the model:

1. **The stock file must contain InChIKeys.** A text file of SMILES loads without error,
   reports the right number of compounds, and then matches nothing — every search comes
   back unsolved. This is the silent failure to know about.
2. **Loaded is not selected.** Policies and stocks named in a config load, but in Python
   none of them is used until you call `select`. Forget the expansion policy and the search
   raises; forget the stock and it runs to the limit and solves nothing. The command-line
   tool selects for you; the Python API does not.
3. **The search is bounded by iterations and wall-clock time, whichever ends first.** Set
   both explicitly. Results depend on how far the search got, so route counts move
   between runs and between machines.

## Licences and what a commercial user may do

Everything here was read at source on 2026-10-22. This page uses nothing that requires an
account, an application or a GPU.

| component | where it lives | licence | what it means for you |
|---|---|---|---|
| AiZynthFinder code 4.4.1 | PyPI `aizynthfinder`; github.com/MolecularAI/aizynthfinder | MIT | Use, modify, embed, commercially included |
| Expansion, filter and ring-breaker policies (ONNX) | Zenodo record 7797465, doi 10.5281/zenodo.7797465 | CC-BY-4.0 | Commercial use allowed; credit the record if you redistribute or publish |
| Template libraries (`uspto_unique_templates.csv.gz` and the ring-breaker set) | Zenodo record 7341155, doi 10.5281/zenodo.7341155 | CC-BY-4.0 | Same |
| Reaction data behind them | USPTO patent reactions. Record 7341155 says the models come from the rxnutils and aizynthtrain pipelines, and rxnutils' USPTO step downloads Lowe's extraction, figshare doi 10.6084/m9.figshare.5104873 | CC0 | No restriction |
| Public ZINC stock `zinc_stock_17_04_20.hdf5` | figshare doi 10.6084/m9.figshare.12334577, file 23086469 | Labelled MIT on figshare, **but built from ZINC** | See below |

**The ZINC stock is the one component with a catch.** The figshare record says it was made
from the ZINC database on 17 April 2020. ZINC's own terms (docking.org Terms and
Conditions, dated 21 March 2025) grant use to anyone — "you are free to share the results
of a ZINC search or a screen of molecules from ZINC" is the permission, and it draws no
line between academic and commercial users — while forbidding redistribution of major
portions of ZINC without written permission from the database's maintainer. A licence
label put on an extract by its uploader cannot grant more than ZINC itself grants. So: downloading it from that record for your own
planning, commercial work included, and publishing the routes you find is within the
stated terms. Re-hosting the file, bundling it into a product, or shipping it to customers
is not, unless you get that permission. This page never redistributes it and does not use
it for the verified path.

Supplier catalogues (eMolecules, Enamine, Mcule, ZINC-22 and similar) are the realistic
stocks for real work, and each carries its own terms. Nothing here fetches one. Building a
stock from a file you are entitled to use is covered below.

## Install

Python 3.10, 3.11 or 3.12. The package declares `>=3.10,<3.13`, and on 3.13 resolution
fails because the pinned RDKit (below 2024) publishes no 3.13 wheels. Everything was verified
on 3.11 with `uv`, which also fetches a 3.11 interpreter if you do not have one.

```bash
uv venv -p 3.11 .venv
. .venv/bin/activate
uv pip install aizynthfinder==4.4.1 pyarrow==25.0.1
python -c "import importlib.metadata as m; from aizynthfinder.aizynthfinder import AiZynthFinder; print(*(f'{p} {m.version(p)}' for p in ('aizynthfinder', 'rdkit', 'numpy', 'pyarrow', 'onnxruntime')), sep=' | ')"
```

```text
aizynthfinder 4.4.1 | rdkit 2023.9.6 | numpy 1.26.4 | pyarrow 25.0.1 | onnxruntime 1.31.0
```

**The `pyarrow` pin is required, not tidiness.** AiZynthFinder pins `numpy<2`. Its
dependency chain pulls in `dask`, which imports `pyarrow`, and an unpinned install resolves
`pyarrow` 26.0.0 (released 2026-10-09), which refuses to load against NumPy 1.x. The
install then succeeds and the first import fails, including every console command:

```text
ImportError: pyarrow requires NumPy 2.0 or newer, found 1.26.4
```

`pyarrow` 25.0.1 imports cleanly. The environment takes about 1.0 GB on disk. The
TensorFlow extra (`aizynthfinder[tf]`) is only for the older Keras model files and is not
needed here; the ONNX policies run on `onnxruntime`, CPU only.

## Get the models

Three files, about 112 MB in total, all CC-BY-4.0 on Zenodo. The package ships a helper,
`download_public_data`, that fetches these plus a ring-breaker policy and the 663 MB ZINC
stock (covered later). It has no resume and no checksum, and Zenodo dropped the connection
mid-file repeatedly during verification, so the helper is the wrong tool on a slow or
flaky link. This fetcher resumes, checks size and md5 against the Zenodo records, and
refuses to start if the disk cannot hold the files. Run it with the venv's Python from your
working directory:

```python
import hashlib, os, shutil, sys, time
import requests

DEST = "aizynth-data"
FILES = [
    # (URL, local name, bytes, md5) from Zenodo records 7797465 and 7341155, CC-BY-4.0
    ("https://zenodo.org/records/7797465/files/uspto_model.onnx",
     "uspto_model.onnx", 91518243, "b466a436b6a8eceaba8c14ef5e2a88c8"),
    ("https://zenodo.org/records/7341155/files/uspto_unique_templates.csv.gz",
     "uspto_templates.csv.gz", 3313598, "e8fb29d4dcd54073658000e212b7845a"),
    ("https://zenodo.org/records/7797465/files/uspto_filter_model.onnx",
     "uspto_filter_model.onnx", 16788859, "ab0df54b62a0aeceecd68051f8dc3f2e"),
]
MIN_BYTES_PER_S = 50_000   # a window slower than this counts as a stall
WINDOW_S = 20              # how long a throughput window is
MAX_STALLS = 5             # stalled reconnects allowed per file
CHUNK = 1 << 16            # small enough that the rate is checked every few seconds
MAX_RETRY_AFTER_S = 60     # cap on a server-supplied Retry-After

os.makedirs(DEST, exist_ok=True)
need = sum(size for _, _, size, _ in FILES) + 50_000_000
free = shutil.disk_usage(DEST).free
if not isinstance(free, int) or free < need:
    sys.exit(f"refusing to download: need {need} bytes free in {DEST}, found {free!r}")

class Stalled(Exception):
    pass

def md5_of(path):
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()

for url, name, size, md5 in FILES:
    path = os.path.join(DEST, name)
    stalls = 0
    for attempt in range(1, 31):
        have = os.path.getsize(path) if os.path.exists(path) else 0
        if have == size:
            break
        if have > size:
            os.remove(path)
            have = 0
        try:
            headers = {"Range": f"bytes={have}-"} if have else {}
            with requests.get(url, headers=headers, stream=True, timeout=60) as r:
                if have and r.status_code != 206:
                    have = 0
                r.raise_for_status()
                started, moved = time.monotonic(), 0
                with open(path, "ab" if have else "wb") as fh:
                    for chunk in r.iter_content(CHUNK):
                        fh.write(chunk)
                        moved += len(chunk)
                        window = time.monotonic() - started
                        if window >= WINDOW_S:
                            if moved / window < MIN_BYTES_PER_S:
                                raise Stalled(f"{moved / window / 1000:.0f} kB/s")
                            started, moved = time.monotonic(), 0
        except Stalled as err:
            stalls += 1
            if stalls > MAX_STALLS:
                sys.exit(f"{name}: stayed under {MIN_BYTES_PER_S // 1000} kB/s across "
                         f"{MAX_STALLS} reconnects; re-run later or use a faster link")
            print(f"{name}: stalled at {err}, reconnecting ({stalls} of {MAX_STALLS})")
        except requests.HTTPError as err:
            code = err.response.status_code if err.response is not None else 0
            if code != 429 and code < 500:
                sys.exit(f"{name}: server returned HTTP {code}; retrying will not help")
            wait = min(30, 2 * attempt)
            after = err.response.headers.get("Retry-After", "") if err.response is not None else ""
            if after.strip().isdigit():
                wait = min(MAX_RETRY_AFTER_S, int(after.strip()))
            print(f"{name}: HTTP {code} at attempt {attempt}, retrying in {wait}s")
            time.sleep(wait)
        except (requests.ConnectionError, requests.Timeout,
                requests.exceptions.ChunkedEncodingError) as err:
            print(f"{name}: connection dropped at attempt {attempt}, resuming ({err.__class__.__name__})")
            time.sleep(min(30, 2 * attempt))
    if not os.path.exists(path) or os.path.getsize(path) != size:
        sys.exit(f"{name}: still incomplete after 30 attempts")
    if md5_of(path) != md5:
        os.remove(path)
        sys.exit(f"{name}: md5 mismatch, file removed")
    print(f"{name}: {size} bytes, md5 ok")
```

```text
uspto_model.onnx: 91518243 bytes, md5 ok
uspto_templates.csv.gz: 3313598 bytes, md5 ok
uspto_filter_model.onnx: 16788859 bytes, md5 ok
```

Progress lines before those are normal — `uspto_model.onnx: stalled at 44 kB/s,
reconnecting (1 of 5)` is the rate check doing its job, and
`uspto_model.onnx: HTTP 503 at attempt 1, retrying in 3s` is a busy server being waited
out. Either way the run carries on from the bytes already on disk. That stall line and the
md5-ok lines come from the same verified run.

Four failure modes, and how each is caught.

- A **dropped connection** raises, and the loop reconnects with a `Range` header from the
  bytes already on disk.
- A **silent connection** trips `timeout=60`, which bounds the wait for the next byte and
  nothing else.
- A **throughput collapse** — bytes still arriving, at a few kB/s — raises neither, and is
  the one that cost the most time here, so the loop measures its own rate. Any 20-second
  window below 50 kB/s closes the connection and re-ranges from the bytes on disk, and five
  such reconnects on one file exit non-zero rather than crawling for hours. `CHUNK` is 64
  KiB for this reason and not for throughput: the rate is only tested when a chunk lands, so
  a megabyte chunk at 20 kB/s would delay the first test to just under a minute. At 64 KiB
  the first test landed at 22.8 s against a 20-second window.
- An **HTTP error status** raises `requests.HTTPError` from `raise_for_status`. A 429 or a
  5xx is a busy server, so it is retried on the same attempt budget as a dropped
  connection, honouring `Retry-After` when the server sends one and capping it at 60 s.
  Any other 4xx exits immediately — a 404 will not fix itself, and retrying it 30 times
  only delays the message.

Reconnecting helps because a fresh connection to the same host is often orders of
magnitude faster than the one that collapsed — that was measured here, and the stall rule
recovered a Zenodo transfer that had fallen to 44 kB/s. Where it does not help, the
constants are what you change: a link that genuinely cannot beat 50 kB/s needs
`MIN_BYTES_PER_S` lowered, or it will reconnect pointlessly five times and then stop.

The template file is renamed on the way down to `uspto_templates.csv.gz`, the name the
package's own helper uses, so configs written for either route are interchangeable. The
expansion policy and its template file are a pair: the network outputs an index into that
exact table, so never mix a model from one record with templates from another.

## Build a stock

The stock is what "purchasable" means to the search. A route is solved when every leaf is
found in it, so the stock decides your answer more than the model does.

AiZynthFinder looks compounds up by **InChIKey**. A `.txt` stock is read as one InChIKey
per line, and nothing checks that the lines are InChIKeys. This block writes the same four
building blocks both ways and shows the difference:

```python
from rdkit import Chem
from aizynthfinder.context.config import Configuration
from aizynthfinder.chem import Molecule

blocks = ["Nc1ccc(O)cc1", "CC(=O)OC(C)=O", "CC(=O)Cl", "CC(=O)O"]

with open("stock_wrong_smiles.txt", "w") as fh:
    fh.write("\n".join(blocks) + "\n")

keys = []
for smi in blocks:
    mol = Chem.MolFromSmiles(smi)
    if mol is None:
        raise ValueError(f"building block does not parse: {smi}")
    keys.append(Chem.MolToInchiKey(mol))
with open("stock_inchikeys.txt", "w") as fh:
    fh.write("\n".join(keys) + "\n")

probe = Molecule(smiles="Nc1ccc(O)cc1")
for name in ("stock_wrong_smiles.txt", "stock_inchikeys.txt"):
    cfg = Configuration.from_dict({"stock": {"demo": name}})
    cfg.stock.select("demo")
    print(f"{name}: {len(cfg.stock)} compounds loaded, 4-aminophenol found: {probe in cfg.stock}")
```

```text
stock_wrong_smiles.txt: 4 compounds loaded, 4-aminophenol found: False
stock_inchikeys.txt: 4 compounds loaded, 4-aminophenol found: True
```

Both files report four compounds. Only one of them works. Probe a compound you know is
in the stock before every real run, and stop if it is not found.

For a catalogue of thousands or millions of SMILES, the package's `smiles2stock` command
does the conversion and writes an HDF5 stock, which loads faster than text:

```bash
printf 'Nc1ccc(O)cc1\nCC(=O)OC(C)=O\nCC(=O)Cl\nCC(=O)O\n' > blocks.smi
smiles2stock --files blocks.smi --source plain --output blocks_stock.hdf5
```

```text
Processing blocks.smi
Created HDF5 stock with 4 unique compounds
```

On current pandas that command also prints a `FutureWarning` about positional arguments to
`to_hdf`, from inside the package. It is harmless and the stock file is written correctly.

Point a config at `blocks_stock.hdf5` exactly as at the text file. Your supplier's licence
governs what you may do with a stock built from its catalogue.

## Plan a route in Python

Paracetamol against the four-compound stock above, with the filter policy switched on
and both search limits stated. Run it from the directory holding `aizynth-data/` and
`stock_inchikeys.txt`:

```python
import json, sys
from rdkit import Chem
from aizynthfinder.aizynthfinder import AiZynthFinder
from aizynthfinder.chem import Molecule

TARGET = "CC(=O)Nc1ccc(O)cc1"
if Chem.MolFromSmiles(TARGET) is None:
    sys.exit(f"target SMILES does not parse: {TARGET}")

config = {
    "expansion": {"uspto": ["aizynth-data/uspto_model.onnx",
                            "aizynth-data/uspto_templates.csv.gz"]},
    "filter": {"uspto": "aizynth-data/uspto_filter_model.onnx"},
    "stock": {"demo": "stock_inchikeys.txt"},
    "search": {"iteration_limit": 100, "time_limit": 120, "max_transforms": 6},
}
finder = AiZynthFinder(configdict=config)
finder.expansion_policy.select("uspto")
finder.filter_policy.select("uspto")
finder.stock.select("demo")

if Molecule(smiles="Nc1ccc(O)cc1") not in finder.stock:
    sys.exit("stock probe failed; the stock file must hold InChIKeys")

finder.target_smiles = TARGET
finder.tree_search()
finder.build_routes()

stats = finder.extract_statistics()
print({k: stats[k] for k in ("is_solved", "number_of_solved_routes", "number_of_steps",
                             "first_solution_iteration")})
for i, tree in enumerate(finder.routes.reaction_trees):
    score = finder.routes.scores[i]["state score"]
    print(i, "solved" if tree.is_solved else "unsolved", round(score, 4),
          len(list(tree.reactions())), "step(s)", [leaf.smiles for leaf in tree.leafs()])

with open("routes.json", "w") as fh:
    json.dump(finder.routes.dict_with_scores(), fh)
```

```text
{'is_solved': True, 'number_of_solved_routes': 3, 'number_of_steps': 1, 'first_solution_iteration': 1}
0 solved 0.9976 1 step(s) ['CC(=O)OC(C)=O', 'Nc1ccc(O)cc1']
1 solved 0.9976 1 step(s) ['CC(=O)Cl', 'Nc1ccc(O)cc1']
2 solved 0.9976 1 step(s) ['CC(=O)O', 'Nc1ccc(O)cc1']
3 unsolved 0.6774 2 step(s) ['Nc1ccc(O)cc1', 'CC(=O)Cl', 'c1c[nH]cn1']
4 unsolved 0.6774 2 step(s) ['Nc1ccc(O)cc1', 'CC(=O)O', 'O=C(n1ccnc1)n1ccnc1']
5 unsolved 0.6774 2 step(s) ['Nc1ccc(O)cc1', 'CC(=O)OC(C)=O', 'c1c[nH]cn1']
6 unsolved 0.6774 2 step(s) ['Nc1ccc(O)cc1', 'CC(C)(C)OC(=O)n1ccnc1', 'CC(=O)OC(C)=O']
```

All 100 iterations took 15 to 20 s on a laptop CPU, and the first solution appeared at
iteration 1. The exact unsolved routes below the top three change from run to run.

What the numbers mean:

- **`is_solved` in the statistics refers to the top-scored route only.** Each tree has
  its own `is_solved`; loop over the trees rather than trusting the summary.
- **`number_of_routes` in the statistics counts leaf states in the whole search tree** (152
  to 175 across the runs behind this page, an observed range rather than a bound), not the
  routes you get back. The returned set is chosen by
  `post_processing` (`min_routes` 5, `max_routes` 25 by default), and ties at the cutoff
  are kept, which is why seven came back here.
- **The default score ties easily.** The "state score" rewards in-stock leaves and
  penalises steps, so every fully solved one-step route gets the same 0.9976. Their order
  in the list is not a ranking.

## Reading a route

A route is a nested dictionary: molecule nodes and reaction nodes alternating, target at
the root. Load it back as a `ReactionTree` to walk it. The per-reaction metadata carries
the policy's probability for the template it applied, which is the natural tie-breaker
when the state score cannot separate routes:

```python
import json
from aizynthfinder.reactiontree import ReactionTree

routes = json.load(open("routes.json"))
ranked = []
for d in routes:
    tree = ReactionTree.from_dict(d)
    if not tree.is_solved:
        continue
    probs = [rxn.metadata["policy_probability"] for rxn in tree.reactions()]
    joint = 1.0
    for p in probs:
        joint *= p
    leaves = [(leaf.smiles, tree.in_stock(leaf)) for leaf in tree.leafs()]
    ranked.append((joint, d["scores"]["state score"], leaves))

for joint, state, leaves in sorted(ranked, key=lambda r: (-r[1], -r[0])):
    print(f"state {state:.4f}  policy {joint:.4f}  {leaves}")
```

```text
state 0.9976  policy 0.4669  [('CC(=O)OC(C)=O', True), ('Nc1ccc(O)cc1', True)]
state 0.9976  policy 0.0722  [('CC(=O)Cl', True), ('Nc1ccc(O)cc1', True)]
state 0.9976  policy 0.0031  [('CC(=O)O', True), ('Nc1ccc(O)cc1', True)]
```

Acetic anhydride first, then acetyl chloride, then acetic acid, which is what a chemist
would write for an aniline acetylation. Read that as the model reflecting how often each
template appeared in patents, not as a judgement on yield or practicality.

Things in a route that are easy to misread:

- **Leaves are reactants only.** A nitro reduction appears as the nitro compound going to
  the amine with no reductant listed; coupling reagents, bases, catalysts and solvents
  never appear. For benzocaine, one solved two-step route had 4-nitrobenzoic acid and
  ethanol as its only leaves, the reduction's reagents nowhere in it.
- **One step can be one pot.** Templates are extracted from patent reactions as recorded,
  so a single reaction node can combine what a textbook draws as two steps. Lidocaine
  against a stock of 2,6-dimethylaniline, chloroacetyl chloride and diethylamine produced
  a solved route with one reaction and all three as leaves.
- **`classification` reads `0.0 Unrecognized`.** Named reaction classes need a commercial
  classifier that the public kit does not include. Read the reaction SMILES in
  `mapped_reaction_smiles` instead.

## Run from the command line

`aizynthcli` takes a YAML config. Unlike the Python API it selects the first expansion
policy, every filter and every stock for you. Paths in the config are relative to where
you run the command:

```yaml
expansion:
  uspto:
    - aizynth-data/uspto_model.onnx
    - aizynth-data/uspto_templates.csv.gz
filter:
  uspto: aizynth-data/uspto_filter_model.onnx
stock:
  demo: stock_inchikeys.txt
search:
  iteration_limit: 100
  time_limit: 120
```

Saved as `config.yml`, one target or a file of targets:

```bash
aizynthcli --config config.yml --smiles "CC(=O)Nc1ccc(O)cc1" --output single.json
printf 'CC(=O)Nc1ccc(O)cc1\nCC(=O)Oc1ccccc1C(=O)O\n' > targets.smi
aizynthcli --config config.yml --smiles targets.smi --output batch.json.gz
```

```text
Done with CC(=O)Nc1ccc(O)cc1 in 21.2 s and is solved
Done with CC(=O)Oc1ccccc1C(=O)O in 20.8 s and is not solved
Output saved to batch.json.gz
```

Those per-target times are machine-dependent — the same two targets took 8 s and 13 s on
another machine — and only the solved/unsolved outcome is stable. `--smiles` is read as a
file path if a file of that name exists, and as a SMILES string otherwise. A single target writes a JSON list of route dictionaries (the same shape as
`routes.json` above); a file of targets writes one pandas table. Aspirin is unsolved here
only because salicylic acid is not in the four-compound stock, which is the point: an
unsolved target usually says more about the stock than the chemistry.

```python
import pandas as pd

df = pd.read_json("batch.json.gz", orient="table")
print(df[["target", "is_solved", "number_of_solved_routes"]].to_string(index=False))
print(len(df.loc[0, "trees"]), "route dicts for the first target")
```

```text
               target  is_solved  number_of_solved_routes
   CC(=O)Nc1ccc(O)cc1       True                        3
CC(=O)Oc1ccccc1C(=O)O      False                        0
7 route dicts for the first target
```

## Inputs that fail, and how

| input | what happens |
|---|---|
| SMILES that RDKit cannot parse (`c1ccccc1C(`) | `AttributeError: 'NoneType' object has no attribute 'GetNumAtoms'` from inside the search, which does not say what is wrong. Parse the SMILES yourself first, as the planning block does |
| SMILES that parses but fails sanitisation (a pentavalent carbon) | `ValueError: Target molecule unsanitizable` |
| Stock file of SMILES | Loads, counts correctly, matches nothing. Every search unsolved |
| Expansion policy loaded but not selected (Python) | `PolicyException: No expansion policy selected` when the search starts |
| Stock loaded but not selected (Python) | Runs to the limit and solves nothing, with no error |
| The same config dict passed to a second `AiZynthFinder` | Loading removes the `expansion`, `filter` and `stock` sections from the dict you passed, so the second finder has no policies and no stock. Build a fresh dict, or pass `copy.deepcopy(config)`, for each finder |
| Target that is itself in the stock | Excluded from the stock for that search by default, so you still get real routes. Set `search.exclude_target_from_stock: false` and the top route comes back "solved" with zero reactions instead |
| `exclude_target_from_stock` put under `stock:` | It is a `search:` key, and the stock loader tries to read the boolean as a file path — `AttributeError: 'bool' object has no attribute 'endswith'` |

## The full public kit, and the ZINC stock

`download_public_data` fetches six files into a directory and writes a matching
`config.yml`: the three above, a ring-breaker policy and its templates (for disconnections
that open rings), and the ZINC stock. Sizes were measured from the servers' own headers on
2026-10-22:

| file | bytes |
|---|---|
| `uspto_model.onnx` | 91,518,243 |
| `uspto_templates.csv.gz` | 3,313,598 |
| `uspto_ringbreaker_model.onnx` | 15,036,094 |
| `uspto_ringbreaker_templates.csv.gz` | 373,753 |
| `uspto_filter_model.onnx` | 16,788,859 |
| `zinc_stock.hdf5` | 663,232,280 |
| **total** | **790,262,827 (about 790 MB)** |

Read the ZINC terms in the licence section before running this — downloading and using
the stock yourself is fine, re-hosting it is not.

**Neither block below was executed.** On the verification date the helper fetched the five
Zenodo files and then the ZINC file stalled partway through as throughput collapsed, so the
run never finished and the block after it never had a stock to load. The helper has no
resume and no checksum, so an interrupted fetch starts again from zero: on a slow link,
adapt the fetcher above instead, which handles the same six files. The file list, URLs and
sizes in the table were read from the 4.4.1 source and from the servers directly, and the
config keys below match the helper's template in that source.

```bash
mkdir -p aizynth-full
download_public_data aizynth-full
cat aizynth-full/config.yml
```

The written config names the expansion policies `uspto` and `ringbreaker`, the filter
`uspto`, and the stock `zinc`. In Python, select the stock and the main policy, and add
the ring-breaker only when ring-forming disconnections matter, since it adds expansion
work:

```python
from aizynthfinder.aizynthfinder import AiZynthFinder

finder = AiZynthFinder(configfile="aizynth-full/config.yml")
finder.stock.select("zinc")
finder.expansion_policy.select(["uspto", "ringbreaker"])
finder.filter_policy.select("uspto")
finder.config.search.iteration_limit = 200
finder.config.search.time_limit = 300
finder.target_smiles = "CC(=O)Nc1ccc(O)cc1"
finder.tree_search()
finder.build_routes()
print(finder.extract_statistics()["is_solved"], len(finder.routes))
```

## Try it

**Data.** Three model files from Zenodo records 7797465 and 7341155, CC-BY-4.0, about
112 MB, no account. Confirmed reachable and md5-matched 2026-10-22. The stock is
generated inline: four common reagents written as InChIKeys, so the run depends on no
third-party catalogue and no catalogue licence. The target is paracetamol, whose
one-step acetylation is solvable from that stock on the first iteration.

**Run.** In a fresh empty directory, with `uv` on the path. This provisions everything it
uses. The download is the slow part; the search itself takes well under a minute on CPU.

```bash
set -e
uv venv -q -p 3.11 .venv
. .venv/bin/activate
uv pip install -q aizynthfinder==4.4.1 pyarrow==25.0.1
python - <<'FETCH'
import hashlib, os, shutil, sys, time
import requests
DEST = "aizynth-data"
FILES = [
    ("https://zenodo.org/records/7797465/files/uspto_model.onnx",
     "uspto_model.onnx", 91518243, "b466a436b6a8eceaba8c14ef5e2a88c8"),
    ("https://zenodo.org/records/7341155/files/uspto_unique_templates.csv.gz",
     "uspto_templates.csv.gz", 3313598, "e8fb29d4dcd54073658000e212b7845a"),
    ("https://zenodo.org/records/7797465/files/uspto_filter_model.onnx",
     "uspto_filter_model.onnx", 16788859, "ab0df54b62a0aeceecd68051f8dc3f2e"),
]
MIN_BYTES_PER_S, WINDOW_S, MAX_STALLS = 50_000, 20, 5
CHUNK, MAX_RETRY_AFTER_S = 1 << 16, 60
os.makedirs(DEST, exist_ok=True)
need = sum(f[2] for f in FILES) + 50_000_000
free = shutil.disk_usage(DEST).free
if not isinstance(free, int) or free < need:
    sys.exit(f"refusing to download: need {need} bytes free, found {free!r}")

class Stalled(Exception):
    pass

for url, name, size, md5 in FILES:
    path = os.path.join(DEST, name)
    stalls = 0
    for attempt in range(1, 31):
        have = os.path.getsize(path) if os.path.exists(path) else 0
        if have == size:
            break
        if have > size:
            os.remove(path)
            have = 0
        try:
            headers = {"Range": f"bytes={have}-"} if have else {}
            with requests.get(url, headers=headers, stream=True, timeout=60) as r:
                if have and r.status_code != 206:
                    have = 0
                r.raise_for_status()
                started, moved = time.monotonic(), 0
                with open(path, "ab" if have else "wb") as fh:
                    for chunk in r.iter_content(CHUNK):
                        fh.write(chunk)
                        moved += len(chunk)
                        window = time.monotonic() - started
                        if window >= WINDOW_S:
                            if moved / window < MIN_BYTES_PER_S:
                                raise Stalled(f"{moved / window / 1000:.0f} kB/s")
                            started, moved = time.monotonic(), 0
        except Stalled as err:
            stalls += 1
            if stalls > MAX_STALLS:
                sys.exit(f"{name}: stayed under {MIN_BYTES_PER_S // 1000} kB/s across "
                         f"{MAX_STALLS} reconnects; re-run later or use a faster link")
            print(f"{name}: stalled at {err}, reconnecting ({stalls} of {MAX_STALLS})")
        except requests.HTTPError as err:
            code = err.response.status_code if err.response is not None else 0
            if code != 429 and code < 500:
                sys.exit(f"{name}: server returned HTTP {code}")
            wait = min(30, 2 * attempt)
            after = err.response.headers.get("Retry-After", "") if err.response is not None else ""
            if after.strip().isdigit():
                wait = min(MAX_RETRY_AFTER_S, int(after.strip()))
            print(f"{name}: HTTP {code} at attempt {attempt}, retrying in {wait}s")
            time.sleep(wait)
        except (requests.ConnectionError, requests.Timeout,
                requests.exceptions.ChunkedEncodingError):
            time.sleep(min(30, 2 * attempt))
    if not os.path.exists(path) or os.path.getsize(path) != size:
        sys.exit(f"{name}: incomplete after 30 attempts")
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    if h.hexdigest() != md5:
        os.remove(path)
        sys.exit(f"{name}: md5 mismatch, file removed")
FETCH
python - <<'CHECK'
import json, os, sys
from rdkit import Chem
from aizynthfinder.aizynthfinder import AiZynthFinder
from aizynthfinder.chem import Molecule
from aizynthfinder.reactiontree import ReactionTree

def require(cond, msg):
    if not cond:
        sys.exit("FAIL: " + msg)

TARGET = "CC(=O)Nc1ccc(O)cc1"
BLOCKS = ["Nc1ccc(O)cc1", "CC(=O)OC(C)=O", "CC(=O)Cl", "CC(=O)O"]
keys = {Chem.MolToInchiKey(Chem.MolFromSmiles(s)) for s in BLOCKS}
with open("stock_inchikeys.txt", "w") as fh:
    fh.write("\n".join(sorted(keys)) + "\n")
with open("stock_smiles.txt", "w") as fh:
    fh.write("\n".join(BLOCKS) + "\n")

def make_finder(stock_file):
    f = AiZynthFinder(configdict={
        "expansion": {"uspto": ["aizynth-data/uspto_model.onnx",
                                "aizynth-data/uspto_templates.csv.gz"]},
        "filter": {"uspto": "aizynth-data/uspto_filter_model.onnx"},
        "stock": {"demo": stock_file},
        "search": {"iteration_limit": 100, "time_limit": 120, "max_transforms": 6}})
    f.expansion_policy.select("uspto")
    f.filter_policy.select("uspto")
    f.stock.select("demo")
    return f

probe = Molecule(smiles=BLOCKS[0])
wrong = make_finder("stock_smiles.txt")
require(len(wrong.stock) == 4 and probe not in wrong.stock,
        "a SMILES stock file should load four entries and match nothing")

finder = make_finder("stock_inchikeys.txt")
require(probe in finder.stock, "InChIKey stock must contain 4-aminophenol")
finder.target_smiles = TARGET
finder.tree_search()
finder.build_routes()
stats = finder.extract_statistics()
with open("routes.json", "w") as fh:
    json.dump(finder.routes.dict_with_scores(), fh)

# invariants: properties of the method and the files; a failure here means the skill is wrong
require(os.path.getsize("routes.json") > 0, "routes.json written")
routes = json.load(open("routes.json"))
require(len(routes) >= 1, "at least one route tree returned")
target_key = Chem.MolToInchiKey(Chem.MolFromSmiles(TARGET))
require(all(Chem.MolToInchiKey(Chem.MolFromSmiles(r["smiles"])) == target_key for r in routes),
        "every route is rooted at the target")
n_solved = 0
for d in routes:
    tree = ReactionTree.from_dict(d)
    leaf_keys = {Chem.MolToInchiKey(Chem.MolFromSmiles(l.smiles)) for l in tree.leafs()}
    require(target_key not in leaf_keys or len(list(tree.reactions())) == 0,
            "the target is never one of its own precursors")
    if tree.is_solved:
        n_solved += 1
        require(leaf_keys <= keys, "every leaf of a solved route is in the stock")
        require(len(list(tree.reactions())) >= 1, "a solved route has at least one reaction")
    else:
        require(not leaf_keys <= keys, "an unsolved route has a leaf outside the stock")
require(stats["is_solved"] == ReactionTree.from_dict(routes[0]).is_solved,
        "the summary is_solved describes the top-ranked route")
require(n_solved <= stats["number_of_solved_routes"],
        "returned solved routes never exceed the search's solved count")

# observed values: aizynthfinder 4.4.1, Zenodo models as md5-pinned above, 2026-10-22.
# These depend on how far the time-bounded search got; a change is drift to look at, not a failure.
top = ReactionTree.from_dict(routes[0])
print("solved:", stats["is_solved"], "| solved routes returned:", n_solved,
      "| routes returned:", len(routes))
print("top route leaves:", sorted(l.smiles for l in top.leafs()))
print("first solution at iteration:", stats["first_solution_iteration"])
print("OK")
CHECK
```

**Expect.** No `FAIL:` line. The fetcher may print a `stalled at … kB/s, reconnecting` or
`HTTP 5xx … retrying` line or two while downloading, which is normal, and then:

```text
solved: True | solved routes returned: 3 | routes returned: 7
top route leaves: ['CC(=O)OC(C)=O', 'Nc1ccc(O)cc1']
first solution at iteration: 1
OK
```

The checks are split. The **invariants** are what the skill claims and hold whatever the
search does: a SMILES stock file loads and matches nothing while the InChIKey one matches;
`routes.json` is written and every route is rooted at the target; every leaf of a solved
route is in the stock, every unsolved route has a leaf that is not, and the target is
never its own precursor. The **observed values** printed after them, recorded with
aizynthfinder 4.4.1 and the md5-pinned models on 2026-10-22, depend on a time-bounded
search: whether this target solves, how many routes come back (seven here, from ties at the
cutoff), which tied route is listed first, and the iteration of the first solution. If those
move while the invariants pass, record the new values rather than editing the skill.

## When not to use it

- **To decide what to make.** A solved route does not make a molecule easy to make, and an
  unsolved one does not make it hard; both depend on the stock and the search budget.
- **For stereochemistry-critical steps without checking them.** Templates carry
  stereocentres where the patent data recorded them, but nothing checks stereochemical
  outcome or selectivity.
- **As a source of conditions.** For reagents, solvents and yields, go to the literature
  or a reaction database for each step of a shortlisted route.
- **As a stand-in for a supplier check.** A stock is a snapshot. Confirm availability and
  price with the supplier before ordering; the 2020 ZINC snapshot in particular is years
  old.

To turn a target name into a SMILES first, `chembl` returns canonical structures for
known compounds, and `datamol` covers standardisation before the search.
