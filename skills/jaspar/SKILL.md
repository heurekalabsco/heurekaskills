---
name: jaspar
description: Get transcription-factor binding profiles (PFMs) from JASPAR — pinned release files, the SQLite-syntax database dump and the REST API — with versioned matrix ids, CORE vs UNVALIDATED, the 1000-row page cap and UniProt joins.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, chip-seq, chromatin, uniprot]
covers: [jaspar, transcription factor, tf, tf binding site, tfbs, motif, position frequency matrix, pfm, pwm, position weight matrix, sequence logo, meme format, transfac, ht-selex, selex, chip-seq, pbm, matrix id, unvalidated, non-redundant, tffm, uniprot, ctcf, tp53, human, mouse, plants, insects, fungi, vertebrates]
papers: [PMID:41325984, PMID:37962376]
access: [open]
datasets: [https://jaspar.elixir.no/download/data/2026/CORE/JASPAR2026_CORE_redundant_pfms_jaspar.txt, https://jaspar.elixir.no/download/data/2026/CORE/JASPAR2026_CORE_non-redundant_pfms_jaspar.txt, https://jaspar.elixir.no/download/data/2026/collections/JASPAR2026_UNVALIDATED_non-redundant_pfms_jaspar.txt, https://jaspar.elixir.no/download/database/JASPAR2026.sql.gz, "https://jaspar.elixir.no/api/v1/matrix/MA0106.3/?format=json"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-19
  against: JASPAR 2026 (11th release, PMID 41325984) at jaspar.elixir.no live 2026-11-19 / JASPAR 2024 release files and dump for the pinning check / Python 3.12 standard library only / curl 8 / macOS arm64
  executed: 5
  unverified: 0
---

# JASPAR — transcription-factor binding profiles

JASPAR is an open, curated collection of transcription-factor binding profiles: each profile is a
**position frequency matrix** (PFM, counts of A/C/G/T at each motif position) with the TF name, its
UniProt accession(s), species, structural class and family, and the experiment it came from
(ChIP-seq, HT-SELEX, PBM and others). A new release appears every two years; the 11th, **JASPAR
2026**, is the one the site and API serve today.

This skill gets profiles onto disk from a **pinned release**, reads the REST API without its silent
traps, and joins profiles to proteins on **UniProt accession**, never on TF name.

Neighbours: `uniprot` resolves the accessions JASPAR carries; `encode` has the TF ChIP-seq peaks
you would scan these motifs against; `biopython` parses the `jaspar`, `meme`, `transfac` and `pfm`
formats with `Bio.motifs` and builds PWMs and scores from them.

## Licence and access

From every page footer of <https://jaspar.elixir.no/about/>, read 2026-11-19:

> JASPAR is brought to you by a collaborative effort of several research labs and it is licensed
> under the Creative Commons Attribution 4.0 International License.

No account or key. Cite the release paper for the release you used (2026: PMID 41325984; 2024:
PMID 37962376) and name the release year. The old host `jaspar.genereg.net` answers `301` to
`jaspar.elixir.no`.

## Identifiers: a matrix id has a version, and the version is the profile

A JASPAR profile id is `BASE.VERSION` — `MA0106.3` is version 3 of base id `MA0106` (TP53).
Versions are different matrices, often from different experiments, and sometimes **different
proteins**:

- `MA0002.1` is human RUNX1 (UniProt `Q01196`); `MA0002.2` and `MA0002.3` are mouse Runx1
  (`Q03347`). `MA0659.1`/`.2` are human MAFG (`O15525`); `.3`/`.4` are mouse Mafg (`O54790`). In
  JASPAR 2026, 113 of 1,832 multi-version base ids change UniProt accession across versions and 119
  change species. JASPAR's documentation recommends using every profile for the taxon rather than
  only the species of interest, so this is by design — but it means a base id is not a protein.
- A **bare base id is a moving pointer**. `/api/v1/matrix/MA0106/` answers 200 with whatever version
  is newest today (`MA0106.3`), so a table keyed on base id silently changes meaning at the next
  release. Store and join on the full versioned id.
- Ids can disappear: 64 ids are `removed` in 2026 (e.g. `MA0553.1`, `MA1006.2`) and answer `404`;
  `matrix-history` records them. Ids are case-sensitive (`ma0106.3` is `404`).
- The name under one id can change between releases while the counts stay identical: `MA0089.*`
  was `MAFG::NFE2L1` in 2024 and is `MAFG::NRF1` in 2026; `MA1540.3` went `NR5A1` → `Nr5a1`.

**Collections.** `CORE` (ids `MA…`) is the curated set. `UNVALIDATED` (ids `UN…`, introduced in
2020) holds profiles the curators found no orthogonal literature support for; JASPAR's own docs say to
use them with caution. The API's matrix list
**mixes both unless you pass `collection=CORE`**: 5,935 matrices unfiltered, 4,572 CORE.

**Redundant vs non-redundant.** The release files come in two cuts. *Redundant* is every version of
every base id (CORE 2026: 4,572 matrices over 2,633 base ids). *Non-redundant* is exactly the
highest version of each base id (2,633) — it does **not** collapse different base ids for the same
TF: CTCF has three CORE base ids (`MA0139`, `MA1929`, `MA1930`), and 71 names sit on more than one
base id in the 2026 non-redundant CORE file.

## Pin the release

Release files and the database dump live under a year-stamped path and stay downloadable for older
releases (2022, 2024 and 2026 all answered 200 on 2026-11-19). The REST API does **not** pin: it
serves the newest release, and its `release=` parameter only knows 2020 and 2022 — `release=2024`
and `release=1999` silently return 2026 data. So: pin with the files, use the API for lookups.

```bash
curl -s "https://jaspar.elixir.no/api/v1/releases/?format=json&page_size=3" | python3 -c "
import json, sys
for r in json.load(sys.stdin)['results']: print(r['year'], r['release_number'], 'PMID', r['pubmed_id'])"
```

On 2026-11-19:

```
2026 11 PMID 41325984
2024 10 PMID 37962376
2022 9 PMID 34850907
```

File timestamps are not release dates. The 2024 and 2026 PFM text files both carry
`Last-Modified: 18 Aug 2025`, and both years' SQL dumps were regenerated on 30 Oct 2026 — the 2024
dump's content differs from what a 2024 download would have held (see the UniProt note below).
Record a SHA-256 of what you downloaded; the Get the files block writes one.

## The REST API

Base `https://jaspar.elixir.no/api/v1/`. Add `?format=json` (or `jaspar`, `meme`, `transfac`,
`pfm`, `yaml`). Useful routes:

| route | returns |
|---|---|
| `matrix/{BASE.VERSION}/` | one profile: `pfm`, `name`, `collection`, `uniprot_ids`, `species`, `class`, `family`, `type`, `tax_group`, `pubmed_ids` |
| `matrix/{BASE}/versions/` | every version of a base id |
| `matrix/?collection=CORE&tax_id=9606&version=latest` | filtered list (no `pfm`, no UniProt) |
| `matrix-history/?release=2026&change_status=removed` | `new` / `updated` / `unchanged` / `removed` per release |
| `releases/`, `collections/`, `taxon/`, `species/` | catalogues |

One profile in MEME format, ready for a motif scanner:

```bash
curl -s "https://jaspar.elixir.no/api/v1/matrix/MA0106.3/?format=meme" | head -12
```

```
MEME version 4

ALPHABET= ACGT

strands: + -

Background letter frequencies
A 0.25 C 0.25 G 0.25 T 0.25

MOTIF MA0106.3 TP53
letter-probability matrix: alength= 4 w= 18 nsites= 17412 E= 0
 0.433264  0.059557  0.376924  0.130255
```

### Paging: `page_size` is capped at 1000, silently

`page_size=5000` returns 1,000 rows and a `next` link; nothing says the request was cut. Walk `next`
and check the total against `count`:

```python
import json, time, urllib.error, urllib.request

def get_json(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=300) as r:
                return json.loads(r.read())
        except (urllib.error.URLError, json.JSONDecodeError) as e:   # transient 5xx / HTML bodies happen
            if getattr(e, "code", 500) < 500 or i == tries - 1:
                raise
            time.sleep(5 * (i + 1))

def walk(path, **params):
    q = "&".join(f"{k}={v}" for k, v in {"format": "json", "page_size": 1000, **params}.items())
    url, rows, count = f"https://jaspar.elixir.no/api/v1/{path}?{q}", [], None
    while url:
        d = get_json(url)
        count = d["count"] if count is None else count
        rows += d["results"]
        url = d["next"]
    assert len(rows) == count, (len(rows), count)        # a short walk is a silent truncation
    return rows

core = walk("matrix/", collection="CORE")
ids = [r["matrix_id"] for r in core]
assert len(set(ids)) == len(ids)
print(len(ids), "CORE matrices,", len({r["base_id"] for r in core}), "base ids")
```

`4572 CORE matrices, 2633 base ids` on 2026-11-19, in about 12 seconds. A 404 (`HTTPError`) raises at
once; one non-JSON response to a valid `matrix-history` query was seen and did not repeat, which is
what the retry is for.

### Filters that do not do what they say

- `version=latest` combined with `tax_id` returns the newest version **for that species**, not the
  newest version: `collection=CORE&tax_id=9606&version=latest` gives 892 matrices, 35 of which
  (e.g. `MA0002.1`, human RUNX1) are superseded in the non-redundant release file by a mouse
  version. Neither list is wrong; know which one you asked for.
- `name=` is documented as case-sensitive and is not: `name=tp53` and `name=Tp53` both return
  `MA0106.*`, and `name=MAFG` returns human `MAFG` and mouse `Mafg`. `search=` is a substring
  search across fields (`search=TP53` also returns TP63).
- There is **no UniProt filter on the list**: `search=P04637` returns 0. UniProt accessions are
  only on the per-matrix record — or in the database dump, which is the practical route.
- Some per-matrix fields are absent rather than empty: `MA0659.3` has no `type` key. Use `.get()`.

## Joining to proteins: UniProt accession, from the database dump

TF names in JASPAR are free text with species-specific case (`RUNX1` human, `Runx1` mouse), dimers
written `A::B`, and renames between releases. Matching a gene symbol against them goes wrong in a
specific way: case-folded, 47 names in the 2026 non-redundant CORE file map to more than one set of
UniProt accessions. The worked case: looking up human RUNX1 by name in the non-redundant file finds `MA0002.3`,
which is **mouse** Runx1 (`Q03347`); the only matrix carrying the human accession `Q01196` is the
older `MA0002.1`. A name join hands you the wrong species; an accession join finds the right matrix
and tells you it is not the newest one.

`download/database/JASPAR<year>.sql.gz` is written in SQLite syntax (`PRAGMA`, `AUTOINCREMENT`) and
loads into Python's `sqlite3` with nothing installed. Tables: `MATRIX` (id, collection, base id,
version, name), `MATRIX_DATA` (the counts, `row` = base, `col` = position), `MATRIX_PROTEIN`
(UniProt `ACC`), `MATRIX_SPECIES` (`TAX_ID`, stored as text), `MATRIX_ANNOTATION` (tag/value:
class, family, type, source, medline…), `MATRIX_HISTORY`, `TFFM`. Things to handle:

- **Empty-string accessions.** 262 matrices have `ACC = ''` (the API shows `uniprot_ids: [""]`),
  148 of them plant and 107 urochordate profiles; 32 more (31 plant) have no protein row at all. In
  the 2026 non-redundant CORE set, 156 of 2,633 matrices have no usable accession. Drop `''`
  before joining or every one of them joins to every other.
- **Dimers carry two accessions** (85 non-redundant CORE matrices), one carries three; one accession
  can sit on several base ids (126 accessions in 2026 non-redundant CORE, e.g. CTCF `P49711` on
  three).
- **Accessions are corrected between releases.** In the 2024 dump, mouse `MA0002.2` and `MA0002.3`
  carry the human accession `Q01196`; the 2026 dump gives them mouse `Q03347`. Join against the dump
  of the release you pinned, and resolve accessions with `uniprot` if the release is old.

## Reading the counts

- The `jaspar`-format text files print **rounded integer counts**. 275 matrices hold fractional
  counts (e.g. `MA1153.1` A at position 1 is `88.235` in the API and the dump, `88` in the file).
  For exact values, read `pfm` from the API or `MATRIX_DATA` from the dump. Across all 5,935
  matrices the text files and the dump differ in exactly those 275, each within rounding (some are
  float noise, `MA1930.1` holds `293.000000000001`, so compare with a tolerance); the API
  matched the dump on a 22-matrix sample (oldest, widest, narrowest, largest, multi-species,
  three-accession, random).
- Column totals are not constant: 2,497 of 5,935 matrices have column sums that vary by more
  than half a count across positions (`MA0139.1` runs 908–913). Normalise each column by its own sum when you build a
  probability matrix. MEME output does this; its `nsites` equals the first column's sum for 1,014 of
  the 1,019 vertebrate motifs, so do not read it as a site count for every position.
- Matrices run from 4 (`MA2557.1`) to 35 positions (`MA1930.1`).

## Get the files

Downloads one release's CORE files and database dump, records a SHA-256 manifest, loads the dump, and
writes a matrix × UniProt table keyed on the versioned id. Pass the release year; it ran for `2026`
and `2024`.

```python
import csv, gzip, hashlib, json, os, sqlite3, sys, urllib.request

REL = sys.argv[1] if len(sys.argv) > 1 else "2026"      # the release year you pin
OUT = f"Data/jaspar/{REL}"
SITE = "https://jaspar.elixir.no"
WANT = [
    f"download/data/{REL}/CORE/JASPAR{REL}_CORE_redundant_pfms_jaspar.txt",
    f"download/data/{REL}/CORE/JASPAR{REL}_CORE_non-redundant_pfms_jaspar.txt",
    f"download/data/{REL}/CORE/JASPAR{REL}_CORE_vertebrates_non-redundant_pfms_meme.txt",
    f"download/database/JASPAR{REL}.sql.gz",
]
os.makedirs(OUT, exist_ok=True)

manifest = []
for path in WANT:
    dest = os.path.join(OUT, path.rsplit("/", 1)[1])
    with urllib.request.urlopen(f"{SITE}/{path}", timeout=300) as r:
        body = r.read()
        modified = r.headers.get("Last-Modified")
    open(dest, "wb").write(body)
    manifest.append({"url": f"{SITE}/{path}", "path": dest, "bytes": len(body),
                     "sha256": hashlib.sha256(body).hexdigest(), "last_modified": modified})
    print(f"{len(body):>10,}  {dest}")

# the SQL dump is SQLite syntax: load it, then export one row per matrix x protein
db_path = os.path.join(OUT, f"JASPAR{REL}.sqlite")
if os.path.exists(db_path):
    os.remove(db_path)
db = sqlite3.connect(db_path)
db.executescript(gzip.open(os.path.join(OUT, f"JASPAR{REL}.sql.gz"), "rt", encoding="utf-8").read())
db.commit()
rows = db.execute("""
    SELECT m.BASE_ID || '.' || m.VERSION, m.BASE_ID, m.VERSION, m.COLLECTION, m.NAME,
           COALESCE(NULLIF(p.ACC, ''), ''),
           (SELECT group_concat(TAX_ID, ',') FROM MATRIX_SPECIES s WHERE s.ID = m.ID),
           m.VERSION = (SELECT MAX(VERSION) FROM MATRIX x WHERE x.BASE_ID = m.BASE_ID)
    FROM MATRIX m LEFT JOIN MATRIX_PROTEIN p ON p.ID = m.ID
    ORDER BY m.BASE_ID, m.VERSION, p.ACC""").fetchall()
tsv = os.path.join(OUT, f"JASPAR{REL}_matrix_uniprot.tsv")
with open(tsv, "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["matrix_id", "base_id", "version", "collection", "name", "uniprot", "tax_ids", "latest"])
    w.writerows(rows)
n_matrix = db.execute("SELECT COUNT(*) FROM MATRIX").fetchone()[0]
print(f"{len(rows):,} rows for {n_matrix:,} matrices -> {tsv}")

json.dump({"jaspar_release": REL, "files": manifest, "matrices_in_sql": n_matrix},
          open(os.path.join(OUT, "manifest.json"), "w"), indent=2)
```

On 2026-11-19, `2026`: four files (1.59 MB, 818 kB, 552 kB, 2.23 MB), `6,573 rows for 5,935
matrices`. `2024`: `5,591 rows for 5,278 matrices`. The dump covers CORE and UNVALIDATED; filter
`collection` in the TSV. An empty `uniprot` cell means JASPAR has no accession for that matrix.

Other files on the downloads page, same year-stamped layout: per-taxon CORE cuts
(`JASPAR2026_CORE_<taxon>_{redundant,non-redundant}_pfms_{jaspar,meme,transfac}.txt`, also `.zip`),
UNVALIDATED under `collections/`, binding sites `sites.tar.gz` (300 MB) and `bed.tar.gz` (298 MB),
`centrality.tar.gz` (90 MB), `TFFM.tar.gz`, and all logos as `download/data/all/sequence_logos_svg.tar.gz`.

## What does not work

| what | what happens | instead |
|---|---|---|
| `release=2024` (or any year but 2020/2022) on API routes | silently returns 2026 data | pin with the year-stamped files and dump |
| `page_size` above 1000 | 1,000 rows, no warning | walk `next`, assert against `count` |
| a bare base id, `matrix/MA0106/` | 200, newest version today | always store `BASE.VERSION` |
| `matrix/` without `collection=` | CORE and UNVALIDATED mixed | `collection=CORE` |
| `search=<UniProt accession>` on the list | 0 hits | the dump's `MATRIX_PROTEIN`, or per-matrix `uniprot_ids` |
| `sites/{matrix_id}/` | 200 with every field `null` for all 5 matrices tried | `sites.tar.gz` / `bed.tar.gz` |
| `?format=bed` on a matrix | `404` | the bed tarball |
| `download/data/2026/TFFM_table.csv` (linked from the downloads page) | `404` | `TFFM` table in the dump, or `TFFM.tar.gz` |
| `jaspar`-format text for exact counts | rounded to integers for 275 matrices | API `pfm` or the dump's `MATRIX_DATA` |
| a removed id such as `MA0553.1` | `404` | `matrix-history/?base_id=MA0553` |

## Try it

**Data.** JASPAR 2026 (CC BY 4.0) from `jaspar.elixir.no`: the CORE redundant and non-redundant PFM
files, the UNVALIDATED non-redundant file, the 2.2 MB database dump, and live API calls. No account.
Confirmed reachable 2026-11-19.

**Run.** In a fresh directory; standard library only; about 3–4 minutes, most of it the API's
1,000-row page.

```python
import gzip, json, os, sqlite3, urllib.error, urllib.request
from collections import defaultdict

REL = "2026"
SITE = "https://jaspar.elixir.no"
API = f"{SITE}/api/v1"
FILES = {
    "core_all": f"{SITE}/download/data/{REL}/CORE/JASPAR{REL}_CORE_redundant_pfms_jaspar.txt",
    "core_nr": f"{SITE}/download/data/{REL}/CORE/JASPAR{REL}_CORE_non-redundant_pfms_jaspar.txt",
    "unval_nr": f"{SITE}/download/data/{REL}/collections/JASPAR{REL}_UNVALIDATED_non-redundant_pfms_jaspar.txt",
    "sql": f"{SITE}/download/database/JASPAR{REL}.sql.gz",
}

def get(url):
    try:
        with urllib.request.urlopen(url, timeout=300) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()

def api(path, **p):
    q = "&".join(f"{k}={v}" for k, v in {"format": "json", **p}.items())
    code, body = get(f"{API}/{path}?{q}")
    return code, json.loads(body)

def fetch(url):
    name = url.rsplit("/", 1)[1]
    if not os.path.exists(name):
        code, body = get(url)
        assert code == 200, (url, code)
        open(name, "wb").write(body)
    return name

def read_jaspar(path):                       # {matrix_id: (name, {base: [counts]})}
    out, cur = {}, None
    for line in open(path, encoding="utf-8"):
        if line.startswith(">"):
            mid, name = line[1:].rstrip("\n").split("\t")
            cur = out[mid] = (name, {})
        elif line.strip():
            base, rest = line.split("[")
            cur[1][base.strip()] = [float(x) for x in rest.split("]")[0].split()]
    return out

# 1. release files: ids are versioned, non-redundant = highest version of every base id
core_all = read_jaspar(fetch(FILES["core_all"]))
core_nr = read_jaspar(fetch(FILES["core_nr"]))
unval_nr = read_jaspar(fetch(FILES["unval_nr"]))
top = {}
for mid in core_all:
    b, v = mid.split(".")
    top[b] = max(top.get(b, 0), int(v))
assert set(core_nr) == {f"{b}.{v}" for b, v in top.items()}
assert all(m.startswith("MA") for m in core_all) and all(m.startswith("UN") for m in unval_nr)
print(f"JASPAR {REL} files: CORE {len(core_all)} matrices / {len(core_nr)} base ids; UNVALIDATED nr {len(unval_nr)}")

# 2. the REST API serves the newest release only; page_size is capped at 1000
code, rel = api("releases/")
print("API newest release:", rel["results"][0]["year"], "| total", rel["count"])
code, d = api("matrix/", collection="CORE", page_size=5000)
assert d["count"] == len(core_all) and len(d["results"]) == 1000 and d["next"]
code, d24 = api("matrix/", collection="CORE", release=2024, page_size=1)
assert d24["count"] == len(core_all)          # release=2024 is silently ignored
code, dall = api("matrix/", page_size=1)
print("API matrix count: CORE", d["count"], "| no collection filter", dall["count"], "(CORE + UNVALIDATED)")

# 3. a bare base id resolves to whatever is newest today
code, bare = api("matrix/MA0106/")
assert bare["matrix_id"] in core_nr and bare["matrix_id"].startswith("MA0106.")
print("MA0106 ->", bare["matrix_id"])

# 4. API counts equal the release file for the same versioned id
for mid in ["MA0106.3", "MA0002.1", "MA0001.1", next(iter(unval_nr))]:
    code, m = api(f"matrix/{mid}/")
    src = core_all.get(mid) or unval_nr[mid]
    assert code == 200 and m["pfm"] == src[1], mid
code, m = api("matrix/MA1153.1/")                  # fractional counts: the text file rounds them
assert m["pfm"]["A"][0] == 88.235 and core_all["MA1153.1"][1]["A"][0] == 88.0

# 5. UniProt joins from the SQL dump (SQLite syntax, loads with the standard library)
if not os.path.exists("jaspar.sqlite"):
    db = sqlite3.connect("jaspar.sqlite")
    db.executescript(gzip.open(fetch(FILES["sql"]), "rt", encoding="utf-8").read())
    db.commit()
db = sqlite3.connect("jaspar.sqlite")
acc = defaultdict(set)
for b, v, a in db.execute("SELECT m.BASE_ID, m.VERSION, p.ACC FROM MATRIX m JOIN MATRIX_PROTEIN p ON p.ID = m.ID"):
    if a:                                     # empty-string accessions exist; drop them
        acc[a].add(f"{b}.{v}")
empty = db.execute("SELECT COUNT(DISTINCT ID) FROM MATRIX_PROTEIN WHERE ACC = ''").fetchone()[0]
none = db.execute("SELECT COUNT(*) FROM MATRIX m WHERE NOT EXISTS "
                  "(SELECT 1 FROM MATRIX_PROTEIN p WHERE p.ID = m.ID)").fetchone()[0]
assert db.execute("SELECT COUNT(*) FROM MATRIX").fetchone()[0] == dall["count"]
print("matrices with an empty-string accession", empty, "| with no protein row", none)

human_runx1 = acc["Q01196"]                    # RUNX1, human
by_name = [m for m, (n, _) in core_nr.items() if n.upper() == "RUNX1"]
by_name_acc = {a for a, ms in acc.items() if set(by_name) & ms}
print("Q01196 ->", sorted(human_runx1), "| name RUNX1 in nr ->", by_name, "->", sorted(by_name_acc))
assert human_runx1 == {"MA0002.1"} and "Q01196" not in by_name_acc
assert acc["P04637"] & set(core_nr) == {"MA0106.3"}

# 6. API latest-per-species is not the non-redundant file
code, hs = api("matrix/", collection="CORE", tax_id=9606, version="latest", page_size=1000)
ids = {r["matrix_id"] for r in hs["results"]}
assert hs["count"] == len(ids) and "MA0002.1" in ids - set(core_nr)
print("API human latest", len(ids), "| of which superseded in the release file", len(ids - set(core_nr)))

# 7. removed ids: 404 from the API, listed by matrix-history
code, _ = api("matrix/MA0553.1/")
assert code == 404
code, rm = api("matrix-history/", release=REL, change_status="removed", page_size=1000)
assert "MA0553.1" in {r["matrix_id"] for r in rm["results"]}
print("removed in", REL, ":", rm["count"], "| MA0553.1 -> 404")
```

**Expect.**

*Invariants* — an assertion failing here means the skill is wrong: the non-redundant file is exactly
the highest version of each base id; CORE ids start `MA`, UNVALIDATED `UN`; the API caps a page at
1,000 rows and ignores `release=2024`; a bare base id resolves to a version in the non-redundant
file; API `pfm` equals the file for integer matrices and keeps the fraction the file rounds
(`MA1153.1`); the dump holds every matrix the API lists; in the 2026 dump human RUNX1 `Q01196` is
only on `MA0002.1` and a name lookup of `RUNX1` in the non-redundant file reaches a matrix without
it; the API's human-latest list contains `MA0002.1`, which the release file supersedes; `MA0553.1`
is `404` and listed as removed.

*Observed* on 2026-11-19, JASPAR 2026 — a mismatch is drift to investigate:

```
JASPAR 2026 files: CORE 4572 matrices / 2633 base ids; UNVALIDATED nr 1031
API newest release: 2026 | total 11
API matrix count: CORE 4572 | no collection filter 5935 (CORE + UNVALIDATED)
MA0106 -> MA0106.3
matrices with an empty-string accession 262 | with no protein row 32
Q01196 -> ['MA0002.1'] | name RUNX1 in nr -> ['MA0002.3'] -> ['Q03347']
API human latest 892 | of which superseded in the release file 35
removed in 2026 : 64 | MA0553.1 -> 404
```

When the next release ships, the API moves to it while `REL` stays 2026, so the assertions that
compare the live API with the pinned files (steps 2, 3 and 5) will fail. That failure is the signal: re-pin `REL` to the new year and re-take
the observed values.

## Sources

- JASPAR — https://jaspar.elixir.no/ ; downloads — https://jaspar.elixir.no/downloads/ ; REST API
  docs — https://jaspar.elixir.no/api/v1/docs/ ; licence — https://jaspar.elixir.no/about/
- Ovek Baydar et al. (2026) JASPAR 2026: expansion of transcription factor binding profiles and
  integration of deep learning models. *Nucleic Acids Research* 54, D184–D193 — PMID 41325984
- Rauluseviciute et al. (2024) JASPAR 2024: 20th anniversary of the open-access database of
  transcription factor binding profiles. *Nucleic Acids Research* 52, D174–D182 — PMID 37962376

Cite the release by year and its paper, e.g. "JASPAR 2026 CORE non-redundant, downloaded 2026-11-19".
