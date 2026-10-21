---
name: sabdab
description: Query SAbDab2, the weekly-curated database of every antibody, nanobody and antibody–antigen structure in the PDB — search by antigen, sequence, CDR or species and download IMGT-numbered structures and summary CSVs.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [antibody, nanobody, protein-structure, imgt, public-data]
covers: [sabdab, sabdab2, structural antibody database, opig, antibody structure, antibody-antigen complex, epitope, paratope, nanobody, vhh, single-domain antibody, vnar, scfv, fab, cdr, cdr-h3, imgt, v gene, germline, pdb, crystal structure, cryo-em, therapeutic antibody, her2, trastuzumab, human, mouse, llama, camelid, machine learning training data]
papers: [doi:10.64898/2026.06.16.732554, PMID:24214988, PMID:34986602]
access: [open]
datasets: ["https://sabdab.opig.stats.ox.ac.uk/api/pdb/pdb_00001n8z", "https://sabdab.opig.stats.ox.ac.uk/api/antibody-instance/pdb_00001dzb-A1-A2", "https://sabdab.opig.stats.ox.ac.uk/api/stats/summary"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-10-21
  against: SAbDab2 API 2.1.5 / UI 2.1.3 / data stamp Thu 15 Oct 2026 / Python 3.12.8 standard library only
  executed: 8
  unverified: 0
---
# SAbDab2 — the Structural Antibody Database

SAbDab collects every antibody structure deposited in the PDB, pairs heavy with light
chains, pairs antibodies with the antigens they contact, numbers every variable domain in
IMGT, and calls V and J genes. The Oxford Protein Informatics Group (OPIG) maintains it and
adds new PDB releases weekly. It was rebuilt as **SAbDab2** in 2026, with a new site, a new
identifier scheme and a JSON API.

Use it to answer *which structures exist* for an antigen, a sequence, a CDR or a species, and
to get those structures as files cropped to one antibody, with or without its antigen.

It is not a predictor. For a sequence with no deposited structure, model it instead; the
registry's `immunebuilder` skill covers antibody, nanobody and TCR models. To number a
sequence that is not in SAbDab, use `antibody-numbering`. SAbDab2 already ships IMGT
numbering and CDRs for everything it holds, so you do not need to renumber its own entries.

## Access and licence

Nothing to obtain. The API is public and unauthenticated, with no key and no account.
OPIG releases the data under **CC-BY 4.0**. The home page says so, and the API states it in
its own `info.license`. Credit SAbDab2 (Capel et al. 2026, bioRxiv) when you publish.
The coordinates inside are PDB depositions, which wwPDB releases as CC0.

No rate limit is published. Several calls take 2–15 s server-side, so run searches one at a
time and do not fan them out in parallel.

## The site moved, and old URLs fail quietly

The service now lives at `https://sabdab.opig.stats.ox.ac.uk`, and the API is under `/api`.
The preprint links `sabdab2.opig.stats.ox.ac.uk`, which is an alias that 301s to the same
host. A GET follows it, but a POST does not survive the redirect (it comes back `405`), so
script against the `sabdab.` host.
The old addresses under `opig.stats.ox.ac.uk/webapps/sabdab-sabpred/sabdab/…` (and
`/webapps/newsabdab/…`) **301 to the new host and then return `200 text/html`**. That is the
page shell of the single-page app, not a TSV or a structure. So a script written against
the old SAbDab (`…/sabdab/summary/all/`, `…/sabdab/pdb/1ahw/`) gets no error. It gets an
HTML page with an OK status.

The same happens on the new host. Any path outside `/api` returns the HTML shell with
`200`, while an unknown path *inside* `/api` returns `404` JSON. So **always build URLs from
the `/api` base, and check `Content-Type` before you parse.** That includes error responses.
During a maintenance window every `/api` path answers with an HTML `404` page from the web
server. An HTML 404 under `/api` means the service is down, not that the entry is missing.

```bash
curl -s https://sabdab.opig.stats.ox.ac.uk/api/stats/summary
# {"antibody_instances":22671,"PDB_entries":11724,"SAbDab2_entries":6953,
#  "with_antigen":20230,"last_update":"Thu 15 Oct 2026 09:39:31", ...}
```

`last_update` is the date of the data, and it is worth recording beside anything you
download.

## Identifiers — three kinds, and the PDB one is not what you expect

| identifier | example | what it names |
|---|---|---|
| PDB entry | `pdb_00001n8z` | a PDB deposition, in the **extended wwPDB format**: lower-case, `pdb_` plus eight characters |
| antibody instance | `pdb_00001n8z-B-A` | one antibody in one entry: `<entry>-<heavy chain>-<light chain>`; a single domain has one chain, `pdb_000010zo-A` |
| SAbDab2 antibody | `sabdab2_H0013L0013` | one unique antibody across every structure of it. `H0013`/`L0013` are its canonical heavy and light segments; `L0000` means no light chain |

**The four-character code returns 404.** `/api/pdb/1N8Z`, `/api/pdb/1n8z` and even
`/api/pdb/pdb_00001N8Z` all answer `404 No PDB entry found`, and only `pdb_00001n8z`
works. Filter parameters behave the same way: `pdb_entry=1n8z` matches nothing, with no
error. Convert first.

**Chain IDs are SAbDab's, not always the PDB's.** When the heavy and light domains share one
PDB chain, as in an scFv, SAbDab splits it into two chains. The scFv in `1DZB` is PDB chain
`A`, and SAbDab calls it `A1` (heavy) and `A2` (light). Those IDs appear in the instance ID, in
the summary CSV and in SAbDab's own structure files, but **not** in the file you get from the
RCSB. About one antibody in eleven is affected (1,964 of the 22,548 rows in
`/api/rcsb-pdb-annotations` on 2026-10-20). Take chains and coordinates from the same source.

```python
import json, time, urllib.request, urllib.error, urllib.parse

API = "https://sabdab.opig.stats.ox.ac.uk/api"

def pdb_id(code):
    """'1N8Z' -> 'pdb_00001n8z'; extended IDs pass through, lower-cased."""
    code = code.strip().lower()
    return code if code.startswith("pdb_") else "pdb_" + code.rjust(8, "0")

class ServiceUnavailable(RuntimeError):
    """The API answered with something other than JSON — usually a maintenance page."""

def get(path, timeout=120, **params):
    """GET a JSON route. Raises LookupError on a JSON 404, ValueError on 422,
    and ServiceUnavailable whenever the answer, error or not, is not JSON."""
    q = urllib.parse.urlencode(params, doseq=True)
    url = f"{API}{path}" + (f"?{q}" if q else "")
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            if "json" not in r.headers.get("Content-Type", ""):
                raise ServiceUnavailable(f"{url}: {r.status} {r.headers.get('Content-Type')} — "
                                         "not the API")
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        ctype = e.headers.get("Content-Type", "")
        if "json" not in ctype:
            raise ServiceUnavailable(f"{url}: {e.code} {ctype} — the service is down, "
                                     "not a missing entry") from None
        detail = json.loads(e.read() or b"{}").get("detail")
        if e.code == 404:
            raise LookupError(detail) from None
        if e.code == 422:
            raise ValueError(detail) from None
        raise

def page_all(path, limit=500, **filters):
    """Walk a paginated list route. limit is capped at 500 server-side."""
    out, offset = [], 0
    while True:
        p = get(path, limit=limit, offset=offset, **filters)
        out += p["results"]
        offset += limit
        if offset >= p["total"]:
            return out

entry = get(f"/pdb/{pdb_id('1N8Z')}")
print(entry["id"], "|", entry["name"][:60], "|", entry["resolution"], "Å")
print([a["id"] for a in entry["antibody_instances"]], [a["id"] for a in entry["antibodies"]])
try:
    get("/pdb/1N8Z")
except LookupError as e:
    print("four-character code:", e)
```

## What the API serves

Every route below was called on 2026-10-20 and answered as described. Paths are relative to
`https://sabdab.opig.stats.ox.ac.uk/api`. The OpenAPI document at `/api/openapi.json`
(Swagger UI at `/api/docs`) now declares all 38 of them. Release 2.1.4 declared only one, so
older notes about undocumented routes are out of date.

| route | returns |
|---|---|
| `GET /antibody-instances` | paginated instances with numbered segments, antigen bindings and the PDB entry. **The main search** |
| `GET /antibody-instance/{id}` | one instance in full |
| `GET /antibodies`, `GET /antibody/{sabdab2_id}` | unique antibodies; the single record lists every instance and PDB entry |
| `GET /pdb`, `GET /pdb/{pdb_id}` | PDB entries, with polymer chains and instances |
| `GET /antigen-instances`, `GET /antigen-instance/{id}` | antigen chains and the antibodies bound to them |
| `GET /canonical-segment/{H0013}`, `GET /numerable-segment/{int}`, `GET /numerable-segments` | numbered variable domains |
| `POST /sequence-similarity-search` | instances ranked by identity to a query sequence |
| `POST /sequence-nonredundant-search` | a non-redundant representative set |
| `POST /download/search-summary`, `POST /download/summary` | summary CSV for a search, or for listed instance IDs |
| `GET /download/all-summary` (also `all-single-domain-summary`, `all-sd-h-summary`) | the whole database as CSV |
| `POST /download/search-structures/jobs` → `GET …/jobs/{id}` → `GET …/jobs/{id}/file` | structure archive for a search, built asynchronously |
| `POST /download/structures` | structures for listed entries/instances, returned directly |
| `GET /download/all-structures` (also `all-single-domain-structures`, `all-sd-h-structures`) | starts a job for every structure |
| `GET /antibody-types`, `/construct-types`, `/antigen-types`, `/light-chain-types`, `/organisms`, `/determination-methods` | filter vocabularies |
| `GET /stats/summary`, `GET /stats/plots/{antigen,numbers,constructs,species}` | counts and data date; plots are PNG |
| `GET /rcsb-pdb-annotations` | one row per antibody with PDB-to-SAbDab chain mapping (570 kB, ~25 s) |
| `GET /frontend/…` | the web app's own views. Use the routes above instead |

List routes take `limit` (1–500, default 50) and `offset`, and return
`{"total", "limit", "offset", "results"}`. Bad values return `422` with a `detail` list
naming the parameter. A bad enum value lists the allowed values. `antibody_type` accepts
`FV*`, which `/antibody-types` does not list, and `/antigen-types` returns `true` and
`false` alongside its names, so `antigen_type=false` selects instances with no antigen.

The useful filters on `/antibody-instances`:

| filter | matches |
|---|---|
| `binds_to_antigen` | substring of the antigen's **deposited name** or ID, max 25 characters |
| `antibody_type` | `FAB`, `FV`, `FAB+FC`, `SD-H` (VHH), `SD-L`, `VNAR`; repeat the parameter for several |
| `construct_type` | `SCFV`, `DIABODY`, `DVD`, `SCDB`, `CODV`, `FULLAB`, `OTHER`, or `NO_CONSTRUCT` |
| `antigen_type` | `PROTEIN`, `PEPTIDE`, `HAPTEN`, `SUGAR`, `ION`, `DNA`, `RNA`, `NUCLEOTIDE`, `OTHER`, `false` |
| `heavy_chain_contains_seq`, `light_chain_contains_seq` | exact substring of the chain |
| `cdr_type` + `cdr_sequence` / `cdr_length` | exact IMGT CDR (`H1`–`H3`, `L1`–`L3`, or `ALL`) |
| `residue_at_position` | a residue at an IMGT position, e.g. `H52A` |
| `organism_scientific` | substring of either chain's source organism |
| `resolution`, `rfactor` | at this value or better |
| `experimental_method` | a value from `/determination-methods` |
| `deposited_after`/`_before`, `released_after`/`_before` | ISO dates |
| `antibody_id`, `pdb_entry` | a SAbDab2 ID, an extended PDB ID |

There is **no affinity data** in SAbDab2. No route, filter, schema or CSV column carries a
K<sub>D</sub> or ΔG, so do not promise a search by affinity. The *legacy* SAbDab did carry
literature affinity values for a subset of entries (its summary TSV had `affinity`,
`delta_g`, `affinity_method`, `temperature` and `pmid` columns, filled for 1,311 of 18,684
rows in a March 2025 capture). That feature did not carry over, so do not go looking for it
in the new API.

## Searching by antigen — the name is whatever the depositor typed

`binds_to_antigen` matches the antigen chain's name as deposited, and depositors name the
same protein differently. For HER2, `HER2`, `her2` and `erbB2` all return **0**, while
`erbB-2` returns 31 instances (2026-10-20). Matching ignores case but treats the hyphen as
a character.

A sequence does not depend on naming, but it has its own blind spot: it finds only
structures whose construct contains that stretch. Run both searches and take the union.
Search antigen chains by a fragment of the antigen's sequence and follow each one's
`antibody_bindings`, then add the name matches:

```python
def instances_binding(antigen_fragment):
    """Antibody instances bound to any antigen chain containing this sequence."""
    ags = page_all("/antigen-instances", sequence=antigen_fragment)
    ids = {b["antibody_instance_id"] for ag in ags for b in ag["antibody_bindings"]}
    names = sorted({(ag.get("polymer_instance") or {}).get("name") for ag in ags} - {None})
    return ids, names

by_seq, names = instances_binding("GSCTLVCPLHNQEVTAEDGTQRCEKC")  # from the HER2 extracellular domain
by_name = {r["id"] for r in page_all("/antibody-instances", binds_to_antigen="erbB-2")}
print("binds_to_antigen=HER2  :", get("/antibody-instances", limit=1, binds_to_antigen="HER2")["total"])
print("binds_to_antigen=erbB-2:", len(by_name))
print("by antigen sequence    :", len(by_seq), "| names seen:", names)
print("sequence only:", sorted(by_seq - by_name), "| name only:", len(by_name - by_seq))
print("union:", len(by_seq | by_name))
```

On 2026-10-20 the name found 31 instances and the fragment found 26. The fragment caught
`pdb_00009mtx-A`, a nanobody whose antigen was deposited as plain `receptor protein-tyrosine
kinase`, which no name search for HER2 reaches. The name caught 6 whose HER2 constructs lack
the fragment. The union is 32. The deposited names also vary in word order
(`Receptor protein-tyrosine kinase erbB-2` against `Receptor tyrosine-protein kinase erbB-2`).
For a multi-domain antigen, repeat the sequence search with a fragment from each domain.

Two more things about antigens:

- **"Antigen" means any chain the antibody contacts.** It includes haptens, ions and sugars
  (`with_antigen` in `/stats/summary` counts all of them). It also includes crystallisation
  chaperones: trastuzumab's antibody record lists protein A from `4HKZ` among its antigen
  instances. Filter on `antigen_type=PROTEIN` and read the antigen name before calling
  something an epitope.
- `antigen-instances?antigen_name=` matches the antigen instance **ID**, not its name,
  whatever the parameter name suggests. `antigen_name=erbB` returns 0. Use
  `binds_to_antigen` on `/antibody-instances`, or `sequence`.

## Searching by antibody sequence

Exact matches go through filters: `heavy_chain_contains_seq`, or `cdr_type=H3` with
`cdr_sequence`. For anything fuzzier, use the similarity search:

```python
def similar(heavy="", light="", region="Full variable region", threshold=70, n=10):
    req = urllib.request.Request(
        f"{API}/sequence-similarity-search",
        data=json.dumps({"heavy_seq": heavy, "light_seq": light, "region": region,
                         "threshold": threshold, "n": n}).encode(),
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())["results"]
    except urllib.error.HTTPError as e:
        if "json" not in e.headers.get("Content-Type", ""):
            raise ServiceUnavailable(f"similarity search: {e.code}, not JSON") from None
        raise ValueError(json.loads(e.read())["detail"]) from None

VH = ("EVQLVESGGGLVQPGGSLRLSCAASGFNIKDTYIHWVRQAPGKGLEWVARIYPTNGYTRYADSVKGRFTISADTSKNTAYLQ"
      "MNSLRAEDTAVYYCSRWGGDGFYAMDYWGQGTLVTVSS")                 # trastuzumab VH
hits = similar(heavy=VH, region="VH", threshold=90, n=50)
per_antibody = {}
for h in hits:                                  # n counts instances, not antibodies
    per_antibody.setdefault(h["antibody_id"], h)
print(len(hits), "instances ->", len(per_antibody), "antibodies")
for ab, h in list(per_antibody.items())[:5]:
    print(f"  {ab}  {h['score']:5.1f}  e.g. {h['antibody_instance_id']}")
try:
    similar(heavy="ACDEFGHIKLMNPQRSTVWY", region="VH")
except ValueError as e:
    print("not an antibody:", e)
```

Behaviour to know:

- **`n` caps instances, not antibodies.** Searched with both chains, the top 5 for
  trastuzumab are five instances of one antibody, spread over four PDB entries. Ask for
  more and collapse on `antibody_id`.
- `region` is one of `Full variable region` (the default, which needs **both** chains),
  `VH`, `VL`, `Framework`, `CDRs`, `CDRH1`…`CDRL3`, and `-only` variants. Sending one chain
  with the default region gives `400`.
- A sequence the server cannot number returns `400 VH search can not be performed when
  heavy sequence not provided`. The message says the sequence is *missing*, but the real
  cause is that the sequence is not an antibody domain.
- Each result also carries `target_numbering`, the IMGT numbering of your query.

## Non-redundant sets

`POST /sequence-nonredundant-search` returns one representative per cluster, as a dict keyed
by instance ID with type, antigen types, resolution and R-factor. It takes 10–15 s.

```python
req = urllib.request.Request(
    f"{API}/sequence-nonredundant-search",
    data=json.dumps({"threshold": 90, "paired_only": True,
                     "in_complex": "Bound to Protein only",
                     "resolution_cutoff": 3.0}).encode(),
    headers={"Content-Type": "application/json"})
reps = json.loads(urllib.request.urlopen(req, timeout=300).read())["results"]
print(len(reps), "representatives; e.g.", next(iter(reps.items())))
```

`in_complex` is `All`, `Bound only`, `Bound to Protein only` or `Unbound only`.
`threshold` is a percent identity (0–100, default 70). The API does not say which region
the identity is computed over, so state your parameters rather than calling the set
"non-redundant at 90%". The keys are instance IDs, which feed straight into
`POST /download/summary` and `POST /download/structures`.

For a model training set, OPIG also publishes train/test splits on Zenodo as versioned
releases, planned every six months (so far 2026-05-08, 2026-08-20 and 2026-10-13; concept DOI
`10.5281/zenodo.20083994`). v0.3.0 is one 958,679,981-byte `splits.tar.gz`, CC-BY 4.0. Use those rather than building your own split
from the live database, which changes weekly.

## Get the files

Two things go on disk for any search: the **summary CSV** (one row per antibody instance,
with chains, IMGT CDRs, antigen, species, method and resolution) and the **structures**. Both
take the same filters as `GET /antibody-instances`, sent as a JSON body.

Structure archives are built asynchronously. The jobs route always answers `202` with a
job, which you poll. Two traps sit in that job record:

- `status_url` and `download_url` are relative to **`/api`**, not to the site root. Joined to
  the root, they return the HTML shell with `200` (see *The site moved* above).
- A search that matches nothing is still accepted with `202`. The job then ends
  `"status": "failed"` and gives the reason in `error`. The summary route answers the same
  search with `404 No antibody instances matched`.

Three options shape the archive. `full_structure` (default `true`) gives one
`full_structures/<entry>_sabdab.cif.gz` per PDB entry. `antibody_instance_crops` gives one
`instance_structures/<entry>_<H>_<L>_ab.cif.gz` per antibody. A missing chain is written `+`:
`pdb_000010zo_A_+_…` for a VHH and `pdb_00001efq_+_A_…` for a light-chain-only domain.
`include_antigen` adds the bound antigen and changes the suffix to `_abag`, but only for
instances that have an antigen. Antigen-free instances in the same archive stay `_ab`. So
match files on `<entry>_<H or +>_<L or +>_`, which you can build from the summary's `PDB`,
`Hchain` and `Lchain` columns. Every archive also carries its own `SAbDab_summary.csv`.

```python
import csv, io, json, os, shutil, tarfile, time, urllib.request, urllib.error

API = "https://sabdab.opig.stats.ox.ac.uk/api"
OUT = "Data/sabdab_her2"
FILTERS = {"binds_to_antigen": "erbB-2", "antigen_type": "PROTEIN"}
OPTIONS = {"full_structure": False, "antibody_instance_crops": True, "include_antigen": True}

class ServiceUnavailable(RuntimeError):
    """An /api route answered with HTML: the service is down, or the URL left /api."""

def fetch(req, timeout):
    """urlopen that turns an HTML answer (success or error) into ServiceUnavailable."""
    url = req if isinstance(req, str) else req.full_url
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        ctype = e.headers.get("Content-Type", "")
        if "json" not in ctype:
            raise ServiceUnavailable(f"{url}: {e.code} {ctype}") from None
        raise LookupError(f"{url}: {e.code} {e.read()[:200]!r}") from None
    if r.headers.get("Content-Type", "").startswith("text/html"):
        r.close()
        raise ServiceUnavailable(f"{url}: {r.status} text/html, not data")
    return r

def post(path, body, timeout=300):
    return fetch(urllib.request.Request(API + path, data=json.dumps(body).encode(),
                                        headers={"Content-Type": "application/json"}), timeout)

def getj(path):
    with fetch(API + path, 120) as r:
        return json.loads(r.read())

os.makedirs(OUT, exist_ok=True)
stats = getj("/stats/summary")

# 1. summary table
summary_path = os.path.join(OUT, "summary.csv")
with post("/download/search-summary", FILTERS) as r, open(summary_path, "wb") as fh:
    shutil.copyfileobj(r, fh)
rows = list(csv.DictReader(open(summary_path, newline="")))

# 2. structures: start a job, poll it (URLs are relative to /api), stream the archive
job = json.loads(post("/download/search-structures/jobs", {**FILTERS, **OPTIONS}).read())
deadline = time.time() + 1800
while job["status"] in ("queued", "running"):
    if time.time() > deadline:
        raise TimeoutError(f"job {job['job_id']} still {job['status']}")
    time.sleep(5)
    job = getj(job["status_url"])
if job["status"] != "completed":
    raise RuntimeError(f"job {job['job_id']} {job['status']}: {job['error']}")
tar_path = os.path.join(OUT, job["archive_filename"])
with fetch(API + job["download_url"], 1800) as r:
    if not r.headers.get("Content-Length"):    # fail closed: no size, no space check
        raise OSError("archive sent no Content-Length, so free space cannot be checked")
    size = int(r.headers["Content-Length"])
    free = shutil.disk_usage(OUT).free
    if 2 * size > free:                        # the archive, plus about as much again extracted
        raise OSError(f"need ~{2 * size:,} bytes free in {OUT}, have {free:,}")
    with open(tar_path, "wb") as fh:
        shutil.copyfileobj(r, fh)
with tarfile.open(tar_path) as tf:
    members = [m for m in tf.getmembers() if m.isfile()]
    tf.extractall(OUT, members=members, filter="data")
cifs = sorted(m.name for m in members if m.name.endswith(".cif.gz"))

# 3. every summary row has its file, and the manifest records where it all came from
def stem(r):                                   # '+' stands in for a missing chain
    return f"instance_structures/{r['PDB']}_{r['Hchain'] or '+'}_{r['Lchain'] or '+'}_"
missing = [r["INSTANCE"] for r in rows if not any(c.startswith(stem(r)) for c in cifs)]
assert not missing, f"summary rows with no structure file: {missing[:5]}"
manifest = {"source": API, "data_last_update": stats["last_update"], "filters": FILTERS,
            "options": OPTIONS, "job_id": job["job_id"], "summary_rows": len(rows),
            "files": [{"path": os.path.join(OUT, c),
                       "bytes": os.path.getsize(os.path.join(OUT, c))} for c in cifs]}
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=2)
print(f"{len(rows)} instances, {len(cifs)} structure files, "
      f"{sum(f['bytes'] for f in manifest['files']):,} bytes; data of {stats['last_update']}")
```

Run on 2026-10-21, this wrote 31 instance files for 31 summary rows, 4,310,946 bytes in
total, and finished in about 25 s.

`extractall(..., filter="data")` needs Python 3.12 or later, or a 3.8–3.11 security release
that backported it (3.8.17, 3.9.17, 3.10.12, 3.11.4 or newer). On an older interpreter the
call fails on the unknown `filter` argument; upgrade rather than drop the filter.

**`POST /download/search-structures`** (no `/jobs`) runs the same search but returns the tar
directly with `200` *or* a job with `202`, depending on size: the 91 VNAR instances came back
inline after 50 s, and 2,120 llama instances came back as a job. Code that handles only one
of the two breaks on the other, so the jobs route is the one to script against.
**`POST /download/structures`** takes a list such as
`{"structures": [{"pdb_id": "pdb_00001n8z", "antibody_instances": [{"heavy_chain": "B",
"light_chain": "A", "include_antigen": true}]}]}` and returns the tar directly, which suits a
handful of known instances.

**Everything at once.** `GET /download/all-summary` is the whole database as one CSV
(17,519,967 bytes, 22,671 rows, about a minute on 2026-10-20). `GET /download/all-structures`
starts a job like the one above: 11,725 files (one per PDB entry, plus the summary) in a
2,849,177,600-byte tar (`Content-Range` of the finished archive). The block above checks free
space against twice the archive's `Content-Length` before writing, and streams it to disk.
It fails closed: if the server sends no `Content-Length`, it stops with an error rather than
download blind. Do the same here, and never read it into memory.

## Reading the structures — IMGT numbering is in the coordinates

SAbDab renumbers the variable domains of its own files in **IMGT**. Gaps are real: a heavy
chain with an 8-residue CDR-H1 has no residues 31–34. Insertions use insertion codes, and IMGT
places them symmetrically about the middle of CDR3. Residues run `111, 111A, 111B …` and then
`… 112B, 112A, 112`, so **sorting on (number, insertion code) scrambles every CDR-H3 longer
than 13 residues**. After position 128 the constant domain continues with plain sequential
numbers. Files from the RCSB keep the depositors' numbering, so do not mix the two.

```python
import csv, glob, gzip, os

OUT = "Data/sabdab_her2"
AA = dict(ALA="A", ARG="R", ASN="N", ASP="D", CYS="C", GLN="Q", GLU="E", GLY="G", HIS="H",
          ILE="I", LEU="L", LYS="K", MET="M", PHE="F", PRO="P", SER="S", THR="T", TRP="W",
          TYR="Y", VAL="V", MSE="M")                 # selenomethionine reads as Met

def ca_residues(cif_gz, chain):
    """{(number, insertion code): one-letter residue} for a chain's CA atoms.
    Modified residues are HETATM records inside the polymer, so keep HETATM lines that
    have a label_seq_id; ions and waters have '.' there and are skipped."""
    cols, out = [], {}
    for line in gzip.open(cif_gz, "rt"):
        if line.startswith("_atom_site."):
            cols.append(line.split(".", 1)[1].strip())
        elif line.startswith(("ATOM", "HETATM")):
            f, ix = line.split(), {c: i for i, c in enumerate(cols)}
            if f[ix["label_seq_id"]] == ".":
                continue
            if f[ix["auth_asym_id"]] == chain and f[ix["label_atom_id"]] == "CA":
                ins = f[ix["pdbx_PDB_ins_code"]]
                out[(int(f[ix["auth_seq_id"]]), "" if ins in "?." else ins)] = AA.get(
                    f[ix["label_comp_id"]], "X")
    return out

def imgt_key(pos):
    n, ins = pos
    return (n, -ord(ins) if (n == 112 and ins) else (ord(ins) if ins else 0))

def imgt_cdr3(res):
    return "".join(res[k] for k in sorted((k for k in res if 105 <= k[0] <= 117), key=imgt_key))

rows = {r["INSTANCE"]: r for r in csv.DictReader(open(os.path.join(OUT, "summary.csv")))}
checked = 0
for inst, r in rows.items():
    if not r["Hchain"]:
        continue                                    # light-chain-only domain
    stem = f"{r['PDB']}_{r['Hchain']}_{r['Lchain'] or '+'}_"
    path, = glob.glob(os.path.join(OUT, "instance_structures", stem + "*.cif.gz"))
    h = ca_residues(path, r["Hchain"])
    assert imgt_cdr3(h) == r["CDR-H3"], (inst, imgt_cdr3(h), r["CDR-H3"])
    naive = "".join(h[k] for k in sorted(k for k in h if 105 <= k[0] <= 117))
    checked += 1
    if naive != r["CDR-H3"]:
        print(f"{inst}: IMGT order {r['CDR-H3']}  vs naive sort {naive}")
print(checked, "heavy chains: CDR-H3 from coordinates matches the summary CSV")
```

On the HER2 set above, all 31 heavy chains matched the CSV in IMGT order. A plain sort
scrambled 6 of them, which are exactly the 6 with a CDR-H3 of 14 residues or more. One was
`ARPPVYYDSAWFAY`, which came out as `ARPPVYYSDAWFAY`: same length, same composition, wrong
sequence.

The summary CSV is one row per instance. `antigen_chain`, `antigen_type` and `antigen_name`
are `|`-joined when an antibody touches several chains, and the order is not fixed
(`PROTEIN|SUGAR` and `SUGAR|PROTEIN` both occur), so split before you compare. `date` is the
PDB deposition date as `YYYY/MM/DD`, and `SABDABdepo_date`/`SABDABupdate_date` are SAbDab's
own `YYYYMMDD`. Single-domain rows leave the light-chain columns empty.

## Try it

A self-contained check that the skill still holds. Public data, no account, no key, Python
standard library only.

**Data**: PDB entry `1N8Z`, trastuzumab Fab bound to the HER2 extracellular domain
(Cho et al. 2003), served as `https://sabdab.opig.stats.ox.ac.uk/api/pdb/pdb_00001n8z`. Also
the scFv in `1DZB`, which is the split-chain case. SAbDab2 data is CC-BY 4.0. Both were
last confirmed reachable on 2026-10-21.

```python
import gzip, io, json, tarfile, urllib.request, urllib.error

API = "https://sabdab.opig.stats.ox.ac.uk/api"

def call(path, body=None):
    req = urllib.request.Request(API + path, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"} if body else {})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, r.headers.get("Content-Type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), e.read()

code, ctype, body = call("/stats/summary")
assert code == 200 and "json" in ctype, f"service unavailable: {code} {ctype}"
stats = json.loads(body)
print("data of", stats["last_update"], "|", stats["antibody_instances"], "instances,",
      stats["PDB_entries"], "entries,", stats["SAbDab2_entries"], "antibodies")

# 1. the four-character PDB code is a JSON 404 (an HTML 404 would mean an outage); the extended ID works
code, ctype, body = call("/pdb/1n8z")
assert code == 404 and "json" in ctype, (code, ctype)
code, ctype, body = call("/pdb/pdb_00001n8z")
assert code == 200 and "json" in ctype
entry = json.loads(body)
assert [a["id"] for a in entry["antibody_instances"]] == ["pdb_00001n8z-B-A"]

# 2. IMGT CDRs as served
inst = json.loads(call("/antibody-instance/pdb_00001n8z-B-A")[2])
H, L = inst["heavy_like_segment"], inst["light_like_segment"]
print("CDR-H1/2/3:", H["cdr1"], H["cdr2"], H["cdr3"], "| CDR-L3:", L["cdr3"])
assert (H["cdr1"], H["cdr2"], H["cdr3"]) == ("GFNIKDTY", "IYPTNGYT", "SRWGGDGFYAMDY")
assert inst["antibody_id"] == "sabdab2_H0013L0013"
assert [b["antigen_instance_id"] for b in inst["antigen_bindings"]] == ["pdb_00001n8z-C"]

# 3. the structure file is IMGT-numbered: CDR-H1 gap at 31-34, CDR-H3 at 105-117
req = {"structures": [{"pdb_id": "pdb_00001n8z", "antibody_instances": [
    {"heavy_chain": "B", "light_chain": "A", "include_antigen": True}]}]}
code, ctype, body = call("/download/structures", req)
assert code == 200 and ctype.startswith("application/x-tar")
tf = tarfile.open(fileobj=io.BytesIO(body))
print("archive:", tf.getnames())
cif = gzip.decompress(tf.extractfile("instance_structures/pdb_00001n8z_B_A_abag.cif.gz").read()).decode()
cols = [l.split(".", 1)[1].strip() for l in cif.splitlines() if l.startswith("_atom_site.")]
ix = {c: i for i, c in enumerate(cols)}
ca = {}
for l in cif.splitlines():
    if l.startswith("ATOM"):
        f = l.split()
        if f[ix["label_atom_id"]] == "CA":
            ca.setdefault(f[ix["auth_asym_id"]], {})[int(f[ix["auth_seq_id"]])] = f[ix["label_comp_id"]]
three = dict(ALA="A", ARG="R", ASN="N", ASP="D", CYS="C", GLN="Q", GLU="E", GLY="G", HIS="H", ILE="I",
             LEU="L", LYS="K", MET="M", PHE="F", PRO="P", SER="S", THR="T", TRP="W", TYR="Y", VAL="V")
assert sorted(ca) == ["A", "B", "C"]                      # light, heavy, antigen
assert not any(n in ca["B"] for n in (31, 32, 33, 34))
assert "".join(three[ca["B"][n]] for n in range(105, 118)) == H["cdr3"]
assert ca["B"][104] == "CYS" and ca["B"][118] == "TRP"    # IMGT anchors
print("heavy chain residues:", len(ca["B"]), "| IMGT 31-34 absent | 105-117 =", H["cdr3"])

# 4. split chains: the 1DZB scFv is PDB chain A, SAbDab chains A1 (heavy) and A2 (light)
sc = json.loads(call("/antibody-instance/pdb_00001dzb-A1-A2")[2])
assert sc["heavy_like_segment"]["sabdab_auth_asym_id"] == "A1"
assert sc["antibody_construct"]["construct_type"] == "SCFV"
print("1DZB:", sc["id"], sc["type"], sc["antibody_construct"]["construct_type"])

# 5. antigen names are as deposited (observed, not asserted: depends on future depositors)
for term in ("HER2", "erbB-2"):
    n = json.loads(call(f"/antibody-instances?limit=1&binds_to_antigen={term}")[2])["total"]
    print(f"binds_to_antigen={term!r}: {n}")

# 6. legacy paths (observed: depends on upstream server configuration)
old = urllib.request.urlopen(
    "https://opig.stats.ox.ac.uk/webapps/sabdab-sabpred/sabdab/summary/all/", timeout=60)
print("legacy summary URL:", old.status, old.headers.get("Content-Type"))
```

**Expect**

Invariants. These hold however the database grows, and a failure means the skill is wrong:

- `/api/pdb/1n8z` is a JSON `404`; `/api/pdb/pdb_00001n8z` is `200` JSON. If the first
  call fails with an HTML response instead, the service is down; that is not a failure of
  the skill, so retry later.
- Trastuzumab's IMGT CDR-H1/H2/H3 are `GFNIKDTY` / `IYPTNGYT` / `SRWGGDGFYAMDY`. These are
  the same IMGT CDRs that `antibody-numbering` gives for this chain, so the two skills agree.
- In the SAbDab structure file the heavy chain has no residues 31–34. Residues 105–117 spell
  CDR-H3, with Cys at 104 and Trp at 118. That confirms the coordinates themselves are
  IMGT-numbered.
- The 1DZB scFv's heavy chain is `A1` and its construct is `SCFV`.

Observed on 2026-10-21 against API 2.1.5 and the data of Thu 15 Oct 2026. These move
weekly, or with upstream configuration, so a mismatch means drift to investigate, not a
failure. On that date `binds_to_antigen=HER2` matched nothing while `erbB-2` matched 31, so
naming rather than absence decided the antigen search; and the legacy summary URL still
answered `200 text/html` rather than data:

```
data of Thu 15 Oct 2026 09:39:31 | 22671 instances, 11724 entries, 6953 antibodies
CDR-H1/2/3: GFNIKDTY IYPTNGYT SRWGGDGFYAMDY | CDR-L3: QQHYTTPPT
archive: ['SAbDab_summary.csv', 'instance_structures/pdb_00001n8z_B_A_abag.cif.gz']
heavy chain residues: 220 | IMGT 31-34 absent | 105-117 = SRWGGDGFYAMDY
1DZB: pdb_00001dzb-A1-A2 FV SCFV
binds_to_antigen='HER2': 0
binds_to_antigen='erbB-2': 31
legacy summary URL: 200 text/html; charset=utf-8
```

## Sources

- SAbDab2: https://sabdab.opig.stats.ox.ac.uk — API docs at `/api/docs`
- Capel, Vavourakis, Williams, Taylor & Deane (2026) SAbDab2: the structural antibody database
  in the age of machine learning. *bioRxiv* 2026.06.16.732554 —
  https://doi.org/10.64898/2026.06.16.732554
- Dunbar et al. (2014) SAbDab: the structural antibody database. *Nucleic Acids Research* 42,
  D1140–D1146 — https://doi.org/10.1093/nar/gkt1043
- Schneider et al. (2022) SAbDab in the age of biotherapeutics. *Nucleic Acids Research* 50,
  D1368–D1372 — https://doi.org/10.1093/nar/gkab1050
- SAbDab2 machine-learning splits: https://doi.org/10.5281/zenodo.20083994
