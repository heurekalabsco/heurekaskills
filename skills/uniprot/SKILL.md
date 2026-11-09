---
name: uniprot
description: Look up proteins in UniProtKB — fetch an entry, search by gene and organism, map identifiers, and stream a proteome to disk — with merged, demerged and deleted accessions, synonym collisions and release drift handled rather than silently passed through.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, uniprot, proteomics, sequences, fasta]
covers: [uniprot, uniprotkb, swiss-prot, trembl, reviewed, protein sequence, protein annotation, accession, isoform, gene symbol, gene name, id mapping, identifier mapping, ensembl, pdb cross-reference, alphafold cross-reference, proteome, reference proteome, human, mouse, e. coli, all organisms, fasta, tsv, post-translational modification, phosphorylation, subcellular location, protein function, embl-ebi, sib]
papers: [PMID:39552041]
access: [open]
datasets: ["https://rest.uniprot.org/uniprotkb/P04637.json", "https://rest.uniprot.org/uniprotkb/search?query=organism_id:9606%20AND%20reviewed:true&size=0"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: UniProt REST release 2026_04 (04-November-2026, API deployment 05-November-2026); FTP current_release 2026_03 / Python 3.12.9 standard library only / curl 8 / macOS arm64
  executed: 7
  unverified: 0
---

# UniProtKB — protein sequences, annotation and identifiers

UniProtKB is the protein knowledgebase run by the UniProt consortium (EMBL-EBI, SIB and PIR).
It has two halves, and almost every question starts by choosing between them:

- **Reviewed (Swiss-Prot)** — about 576,000 entries, each curated by hand from the literature.
  Roughly one per protein-coding gene in well-studied organisms: 20,429 human entries on
  2026-11-06.
- **Unreviewed (TrEMBL)** — about 149 million entries, annotated automatically. Many genes have
  dozens: the human gene TP53 has 113 unreviewed entries next to its one reviewed entry, most of
  them single-patient variant or fragment sequences submitted to the nucleotide archives.

This skill covers fetching entries, searching, mapping identifiers, reading feature
coordinates, and downloading sets of entries to disk. Most of it is about the places where the
service answers successfully with something other than what you asked for.

**What you need: nothing.** The REST API at `https://rest.uniprot.org` and the FTP mirror are
anonymous. No key, no account, no published rate limit; the helper below retries on 429 and 5xx.

## Licence

UniProt applies CC BY 4.0 "to all copyrightable parts of our databases"
(<https://www.uniprot.org/help/license>, page dated 2024-12-18, checked 2026-11-06). Commercial
use and redistribution are allowed with attribution; cite the current NAR paper (Sources). The
same page disclaims correctness and notes that some sequences may be covered by patents.

This page is original text, CC-BY-4.0, by Heureka Labs.

## Which release you are reading

UniProt releases about every eight weeks. Every REST response carries the release in its
headers — `X-UniProt-Release: 2026_04` and `X-UniProt-Release-Date: 04-November-2026` on
2026-11-06 — and nothing in the body says it. Record the header with anything you save.

**The REST API and the FTP files are not always on the same release.** On 2026-11-06 the API
served 2026_04 while `current_release/relnotes.txt` on the FTP site still read 2026_03. A
table built from the API and joined to a bulk file can therefore mix two releases, and an
accession merged in the newer one will join to nothing. Check both (the bulk-file block under
**Get the files** prints both).

## The helper

The later blocks import this module, so run them from the directory you write it into. It
uses the Python standard library only.

```bash
cat > uniprot_rest.py <<'PY'
"""A small UniProt REST client: one entry, a paged search, ID mapping. Standard library only."""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request

REST = "https://rest.uniprot.org"
ACCESSION = re.compile(r"(?:[OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9](?:[A-Z][A-Z0-9]{2}[0-9]){1,2})(?:-[0-9]+)?")


class _Stay(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None                         # hand the 303 back instead of following it


_STAY = urllib.request.build_opener(_Stay)
_FOLLOW = urllib.request.build_opener()


def call(path, params=None, data=None, follow=True, tries=4, timeout=300):
    """GET (or POST when data is given). Returns (status, headers, body bytes).

    Retries 429 and 5xx; returns 3xx unfollowed when follow=False; raises on any other 4xx
    with UniProt's own message, which names the bad field or value."""
    url = f"{REST}/{path}" + ("?" + urllib.parse.urlencode(params, safe=",:") if params else "")
    body = urllib.parse.urlencode(data).encode() if data else None
    for i in range(tries):
        try:
            with (_FOLLOW if follow else _STAY).open(urllib.request.Request(url, data=body),
                                                    timeout=timeout) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            if 300 <= e.code < 400:
                return e.code, e.headers, e.read()
            if e.code in (429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(5 * (i + 1))
                continue
            try:
                msg = "; ".join(json.loads(e.read())["messages"])
            except Exception:
                msg = e.reason
            raise RuntimeError(f"HTTP {e.code} from {url} — {msg}") from None
        except (urllib.error.URLError, TimeoutError):
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))


def get_entry(accession, fields=None):
    """One UniProtKB entry as a dict, with secondary accessions resolved and inactive ones refused.

    A merged accession answers 303, and the redirect drops `fields`, so it is re-asked here
    under the primary accession with the same fields. The result carries `_asked_for`."""
    if not ACCESSION.fullmatch(accession):
        raise ValueError(f"{accession!r} is not a UniProtKB accession (a gene symbol? see search)")
    params = {"fields": ",".join(fields)} if fields else None
    status, headers, body = call(f"uniprotkb/{accession}.json", params, follow=False)
    entry = json.loads(body) if body.strip() else {}
    if entry.get("entryType") == "Inactive":
        why = entry["inactiveReason"]
        kind, targets = why["inactiveReasonType"], why.get("mergeDemergeTo", [])
        if kind == "MERGED" and len(targets) == 1:
            entry = get_entry(targets[0], fields)
            entry["_asked_for"] = accession
            return entry
        if kind == "DEMERGED":
            raise LookupError(f"{accession} was split into {len(targets)} entries {targets}; "
                              "pick one by gene and organism — none of them is 'the' answer")
        raise LookupError(f"{accession} is inactive ({kind}: {why.get('deletedReason', targets)})")
    if status != 200:
        raise RuntimeError(f"{accession}: unexpected HTTP {status}")
    entry["_asked_for"] = accession
    return entry


def search(query, fields, page_size=500):
    """Every row of a UniProtKB search as TSV dicts, following the cursor in the Link header.

    Raises if the rows received differ from X-Total-Results, so a short read cannot pass."""
    params = {"query": query, "fields": ",".join(fields), "format": "tsv", "size": page_size}
    path, rows, total, header = "uniprotkb/search", [], None, None
    while True:
        status, headers, body = call(path, params)
        total = int(headers["X-Total-Results"]) if total is None else total
        lines = body.decode().splitlines()
        if lines:
            header = lines[0].split("\t")
            rows += [dict(zip(header, ln.split("\t"))) for ln in lines[1:]]
        nxt = re.search(r'<([^>]+)>;\s*rel="next"', headers.get("Link", ""))
        if not nxt:
            break
        path, params = nxt.group(1).removeprefix(REST + "/"), None
    if len(rows) != total:
        raise RuntimeError(f"{query!r}: received {len(rows)} rows, X-Total-Results said {total}")
    return rows


def map_ids(ids, from_db, to_db, taxon=None, fields=None, query=None, poll=3, wait=600):
    """Run one ID-mapping job. Returns (pairs, failed_ids).

    pairs is a list of (from, to-dict); one input can map to many targets, and the order is
    not the input order. Unmatched inputs are computed here, after any `query` filter."""
    data = {"ids": ",".join(ids), "from": from_db, "to": to_db}
    if taxon:
        data["taxId"] = str(taxon)
    _, _, body = call("idmapping/run", data=data)
    job = json.loads(body)["jobId"]
    deadline = time.time() + wait
    while True:
        status, headers, body = call(f"idmapping/status/{job}", follow=False)
        state = json.loads(body) if body.strip() else {}
        if status == 303 or state.get("jobStatus") == "FINISHED" or "results" in state:
            break
        if state.get("jobStatus") not in ("NEW", "RUNNING", None):
            raise RuntimeError(f"ID-mapping job {job}: {state}")
        if time.time() > deadline:
            raise TimeoutError(f"ID-mapping job {job} still running after {wait} s")
        time.sleep(poll)
    _, _, body = call(f"idmapping/details/{job}")
    target = json.loads(body)["redirectURL"].removeprefix(REST + "/")
    # .../uniprotkb/results/<job> streams at .../uniprotkb/results/stream/<job>, but a plain
    # .../results/<job> (Ensembl, PDB, ...) streams at .../stream/<job>.
    target = (target.replace("/results/", "/results/stream/", 1) if "/uniprotkb/" in target
              else target.replace("/results/", "/stream/", 1))
    params = {"format": "json"}
    if fields:
        params["fields"] = ",".join(fields)
    if query:
        params["query"] = query
    _, _, body = call(target, params)
    pairs = [(r["from"], r["to"]) for r in json.loads(body).get("results", [])]
    # The stream omits failedIds (the paged form carries it), and a `query` filter drops
    # inputs whose every target it removed. Either way: an input with no pair is unmatched.
    found = {f for f, _ in pairs}
    return pairs, [i for i in ids if i not in found]
PY
python3 - <<'EOF'
from uniprot_rest import get_entry
p53 = get_entry("P04637", fields=["accession", "gene_primary", "length", "sequence"])
print(p53["primaryAccession"], p53["genes"][0]["geneName"]["value"], p53["sequence"]["length"])
old = get_entry("Q15086", fields=["accession", "length"])
print("Q15086 ->", old["primaryAccession"], "| fields kept:", sorted(k for k in old if not k.startswith("_")))
iso = get_entry("P04637-2", fields=["accession", "length"])
print("isoform:", iso["primaryAccession"], iso["sequence"]["length"])
for bad in ("P62988", "A0A5S6R8N3", "TP53"):
    try:
        get_entry(bad)
    except (LookupError, ValueError) as e:
        print(type(e).__name__, "-", e)
EOF
```

On 2026-11-06 the check at the bottom printed:

```
P04637 TP53 393
Q15086 -> P04637 | fields kept: ['entryType', 'extraAttributes', 'primaryAccession', 'sequence']
isoform: P04637-2 341
LookupError - P62988 was split into 4 entries ['P0CG47', 'P0CG48', 'P62979', 'P62987']; pick one by gene and organism — none of them is 'the' answer
LookupError - A0A5S6R8N3 is inactive (DELETED: Not part of a reference proteome)
ValueError - 'TP53' is not a UniProtKB accession (a gene symbol? see search)
```

## Fetching one entry

`GET /uniprotkb/{accession}.json` (or `.fasta`, `.tsv`, `.txt`). `fields=` trims the JSON to
the parts you name; the full list of field names is at
`https://rest.uniprot.org/configure/uniprotkb/result-fields`, and an unknown name is a 400
(`Invalid fields parameter value 'bogus'`) rather than a silent drop.

An accession can be in five states, and only one of them is the plain case:

| state | HTTP | body | what to do |
|---|---|---|---|
| active | 200 | the entry | use it |
| **secondary** (merged into another entry) | **303**, `Location: /uniprotkb/P04637?from=Q15086` | `entryType: Inactive`, `inactiveReasonType: MERGED`, `mergeDemergeTo: [P04637]` | use the primary accession — and re-ask, see below |
| **demerged** (split into several entries) | 200 | `entryType: Inactive`, `DEMERGED`, `mergeDemergeTo` lists the successors | there is no single answer; choose by gene and organism |
| **deleted** | 200 | `entryType: Inactive`, `DELETED`, a `deletedReason` | the sequence left UniProtKB; the UniParc id in `extraAttributes` still finds it |
| absent or malformed | 404 `Resource not found` / 400 `invalid format` | an error message | a 400 is usually a gene symbol passed as an accession |

Two of these catch people:

- **Following the 303 drops your `fields`.** The `Location` header omits the query string, so
  an HTTP client that follows redirects (Python's `urllib` and `requests` both do by default)
  fetches the whole primary entry — 17 top-level keys for TP53, including all 1,520 features —
  while you asked for one field. It also silently replaces the accession you asked for. The
  helper stops at the 303, reads the target from the body, and asks again with the same fields.
- **Demerged and deleted entries answer 200.** A status check passes; only `entryType ==
  "Inactive"` tells you the body is not an entry. `P62988` (ubiquitin) was split into four
  human entries; `P02248` was split into more than twenty across species. And 335 million
  inactive accessions answer `active:false` searches, so they are not rare.

**Isoforms** have their own accessions, `P04637-2` and so on. They are fetchable and have
their own sequence (TP53 isoform 2 is 341 residues against the canonical 393), but features
and most annotation live on the canonical entry and use canonical numbering. `-1` is the
canonical isoform itself, and the bare accession means the same sequence.

## Searching

`GET /uniprotkb/search?query=…` uses a field-prefixed grammar: `organism_id:9606`,
`reviewed:true`, `gene_exact:TP53`, `length:[100 TO 200]`, `ec:2.7.11.1`, `xref:pdb-1TUP`,
`keyword:KW-0418`. The list of search fields is at
`https://rest.uniprot.org/configure/uniprotkb/search-fields`. Things that silently change the
answer:

- **Boolean operators must be upper case.** `organism_id:9606 and reviewed:true` returns
  20,365 rows where the `AND` form returns 20,429: the lower-case `and` becomes a search word.
  Nothing warns you.
- **`organism_id`, `taxonomy_id` and `proteome` are three different sets.** For reviewed human
  entries on 2026-11-06: `organism_id:9606` gave 20,429, `taxonomy_id:9606` gave 20,430 (it
  includes subtaxa) and `proteome:UP000005640` gave 20,414 (15 reviewed human entries are not
  in the reference proteome). Choose deliberately and record which.
- **`gene_exact` matches synonyms and former names, not only the official symbol.**
  `gene_exact:ARP1` in reviewed human returns four different proteins — ANGPTL1, ARFRP1, NR2F2
  and PITX2 — and none of them is currently called ARP1. `gene_exact:AIM1` returns three. There
  is no search field for the primary gene name alone, so request the `gene_primary` column and
  filter on it, as the block below does.
- **Results are ranked by score, and the first hit is not the reviewed one.** `gene:TP53`
  (no organism, no review filter) returned 580 hits, and the first was the unreviewed
  `A0A286XW13`. Never take `results[0]` as "the protein"; filter by `reviewed:true` and
  organism.
- **`size` is at most 500** (`'size' must be less than or equal to 500` above that). Further
  pages come from the `Link: <…>; rel="next"` header, a cursor URL; `X-Total-Results` gives the
  count. The helper's `search` follows the cursor and fails if the row count differs from the
  header.

```python
from uniprot_rest import search

def resolve_symbol(symbol, taxon=9606):
    """Reviewed entries whose PRIMARY gene name is `symbol`; synonyms reported, not returned."""
    rows = search(f"gene_exact:{symbol} AND organism_id:{taxon} AND reviewed:true",
                  ["accession", "gene_primary", "gene_synonym", "protein_name"])
    primary = [r for r in rows if r["Gene Names (primary)"] == symbol]
    synonym_only = [(r["Entry"], r["Gene Names (primary)"]) for r in rows if r not in primary]
    return primary, synonym_only

for sym in ("TP53", "ARP1", "AIM1", "P53"):
    hit, other = resolve_symbol(sym)
    print(f"{sym:5} primary={[r['Entry'] for r in hit]} synonym-only={other}")

rows = search("gene_exact:TP53 AND organism_id:9606", ["accession", "reviewed"], page_size=50)
print("TP53 human, any review status:", len(rows), "rows over",
      -(-len(rows) // 50), "pages;", sum(r["Reviewed"] == "reviewed" for r in rows), "reviewed")
```

On 2026-11-06:

```
TP53  primary=['P04637'] synonym-only=[]
ARP1  primary=[] synonym-only=[('Q13795', 'ARFRP1'), ('P24468', 'NR2F2'), ('Q99697', 'PITX2'), ('O95841', 'ANGPTL1')]
AIM1  primary=[] synonym-only=[('Q96GD4', 'AURKB'), ('Q9UMX9', 'SLC45A2'), ('Q9Y4K1', 'CRYBG1')]
P53   primary=[] synonym-only=[('P04637', 'TP53')]
TP53 human, any review status: 114 rows over 3 pages; 1 reviewed
```

An empty `primary` with a non-empty `synonym-only` list is the case to stop and report: the
symbol you were given is outdated or ambiguous, and choosing one of the candidates is a
decision for the person who supplied the symbol. `P53` resolving only through a synonym is the
benign version; `ARP1` is the dangerous one.

## Mapping identifiers

For lists of identifiers use the ID-mapping service rather than one search per id. It is a
job: `POST /idmapping/run` with `from`, `to`, `ids` (comma-separated, up to 100,000) and, for
gene names, `taxId`; then poll `/idmapping/status/{jobId}`; then read the results. The
database names (`Gene_Name`, `UniProtKB_AC-ID`, `UniProtKB`, `Ensembl`, `PDB`, `RefSeq_Protein`
and about a hundred more) are listed at `https://rest.uniprot.org/configure/idmapping/fields`.

What the helper's `map_ids` handles, each confirmed on 2026-11-06:

| behaviour | consequence |
|---|---|
| A finished job's status call answers **303** to the results URL | a client that follows redirects gets the first page of results back from a "status" call; poll without following |
| Results live at `/idmapping/uniprotkb/results/{job}` when the target is UniProtKB, at `/idmapping/results/{job}` otherwise; the `details` call gives the right one as `redirectURL` | do not build the URL yourself |
| The streamed form (`…/results/stream/…` or `/idmapping/stream/…`) **omits `failedIds`**; the paged form includes it | compute unmatched inputs yourself, as the helper does |
| `Gene_Name` matches synonyms, the same as `gene_exact` | `ARP1` maps to four reviewed proteins; `TP53` maps to 114 entries before filtering |
| `query=` on the results filters them (`reviewed:true`) | an input whose every target is filtered out becomes unmatched |
| Results come back grouped by target, not in input order | join on `from`, never by position |
| Mapping to Ensembl returns **versioned** gene ids (`ENSG00000141510.20`) | strip the version before joining to unversioned tables |

```python
from collections import Counter
from uniprot_rest import map_ids

ids = ["TP53", "EGFR", "KRAS", "ARP1", "NOTAGENE1"]
allpairs, failed = map_ids(ids, "Gene_Name", "UniProtKB", taxon=9606, fields=["accession"])
print("all entries     :", dict(Counter(f for f, _ in allpairs)), "failed:", failed)
pairs, failed = map_ids(ids, "Gene_Name", "UniProtKB", taxon=9606,
                        fields=["accession", "gene_primary"], query="reviewed:true")
for frm, to in pairs:
    print(f"  {frm:5} -> {to['primaryAccession']}  primary gene {to['genes'][0]['geneName']['value']}")

ens, failed = map_ids(["P04637", "P00533", "Q15086"], "UniProtKB_AC-ID", "Ensembl")
print("to Ensembl      :", dict(Counter(f for f, _ in ens)), "failed:", failed, "| e.g.", ens[0])
```

On 2026-11-06:

```
all entries     : {'TP53': 114, 'EGFR': 22, 'KRAS': 13, 'ARP1': 4} failed: ['NOTAGENE1']
  ARP1  -> O95841  primary gene ANGPTL1
  EGFR  -> P00533  primary gene EGFR
  KRAS  -> P01116  primary gene KRAS
  TP53  -> P04637  primary gene TP53
  ARP1  -> P24468  primary gene NR2F2
  ARP1  -> Q13795  primary gene ARFRP1
  ARP1  -> Q99697  primary gene PITX2
to Ensembl      : {'P04637': 1, 'P00533': 1, 'Q15086': 1} failed: [] | e.g. ('P04637', 'ENSG00000141510.20')
```

The secondary accession `Q15086` maps quietly, and it maps to the same gene as `P04637`; two
input rows that were one protein all along. Deduplicate on the primary accession after mapping.

## Positions, features and sequence versions

Feature positions in an entry are 1-based and refer to the **canonical** sequence **at its
current sequence version** (`entryAudit.sequenceVersion`, field `sequence_version`; TP53 is at
version 4, last changed 2009-11-24). Two consequences:

- A position recorded against an older version can point at a different residue today.
  Store the sequence version, or the sequence itself, next to any position you keep.
- Positions do not transfer to isoforms. A site on `P04637` is not at the same index in
  `P04637-2`.

Each end of a feature location carries a `modifier` (`EXACT`, `OUTSIDE`, `UNKNOWN`), and a
non-`EXACT` end can have no usable value. The block below checks every phosphoserine,
phosphothreonine and acetyl-lysine position against the residue the sequence actually has at
that index — a cheap guard against an off-by-one or a version mismatch in your own code.

```python
from collections import Counter
from uniprot_rest import get_entry

e = get_entry("P04637", fields=["accession", "sequence", "sequence_version", "ft_mod_res", "ft_dna_bind", "ft_variant"])
seq = e["sequence"]["value"]
print("sequence version", e["entryAudit"]["sequenceVersion"],
      "| length", len(seq))
loc = lambda f: (f["location"]["start"], f["location"]["end"])
odd = [f for f in e["features"] if any(p["modifier"] != "EXACT" for p in loc(f))]
print("features", len(e["features"]), dict(Counter(f["type"] for f in e["features"])),
      "| non-EXACT ends", len(odd))
residue = {"Phosphoserine": "S", "Phosphothreonine": "T", "N6-acetyllysine": "K"}
checked = 0
for f in e["features"]:
    if f["type"] != "Modified residue":
        continue
    kind = f["description"].split(";")[0]
    if kind in residue:
        pos = f["location"]["start"]["value"]                  # 1-based, on the canonical sequence
        assert seq[pos - 1] == residue[kind], (pos, kind, seq[pos - 1])
        checked += 1
dna = next(f for f in e["features"] if f["type"] == "DNA binding")
print("DNA binding", loc(dna)[0]["value"], "-", loc(dna)[1]["value"], "| modified residues checked", checked)
```

On 2026-11-06:

```
sequence version 4 | length 393
features 1394 {'DNA binding': 1, 'Modified residue': 30, 'Natural variant': 1363} | non-EXACT ends 0
DNA binding 102 - 292 | modified residues checked 19
```

## Get the files

**A set of entries, through the API.** `/uniprotkb/stream` returns every row of a query in one
response, with no paging and no `X-Total-Results` header, and `compressed=true` gzips it. A
dropped connection gives a short but well-formed file, so the block asks `search` for the
count first and refuses a file that does not match it. It also refuses if the release changes
between the count and the download.

```python
import gzip
import json
import time
from uniprot_rest import call

QUERY = "organism_id:9606 AND reviewed:true"
FIELDS = ["accession", "id", "gene_primary", "gene_synonym", "protein_name", "length",
          "sequence_version", "xref_pdb", "xref_alphafolddb", "xref_ensembl", "cc_subcellular_location"]

_, head, _ = call("uniprotkb/search", {"query": QUERY, "size": 0})
expected = int(head["X-Total-Results"])
release = head["X-UniProt-Release"], head["X-UniProt-Release-Date"]

written = {}
for fmt, name, extra in (("tsv", "human_reviewed.tsv.gz", {"fields": ",".join(FIELDS)}),
                         ("fasta", "human_reviewed.fasta.gz", {})):
    _, headers, body = call("uniprotkb/stream",
                            {"query": QUERY, "format": fmt, "compressed": "true", **extra})
    if (headers["X-UniProt-Release"], headers["X-UniProt-Release-Date"]) != release:
        raise SystemExit(f"release changed mid-download: {release} -> {headers['X-UniProt-Release']}")
    text = gzip.decompress(body).decode()
    n = text.count("\n>") + text.startswith(">") if fmt == "fasta" else text.count("\n") - 1
    if n != expected:
        raise SystemExit(f"{name}: {n} records, X-Total-Results said {expected} — truncated stream")
    with open(name, "wb") as fh:
        fh.write(body)
    written[name] = n

with open("human_reviewed.provenance.json", "w") as fh:
    json.dump({"source": "UniProtKB REST /uniprotkb/stream", "query": QUERY, "fields": FIELDS,
               "release": release[0], "release_date": release[1], "records": expected,
               "downloaded": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "licence": "CC BY 4.0 — cite UniProt (https://www.uniprot.org/help/publications)"},
              fh, indent=2)
print("release", *release, "|", written)
```

On 2026-11-06 this took about 40 seconds and printed:

```
release 2026_04 04-November-2026 | {'human_reviewed.tsv.gz': 20429, 'human_reviewed.fasta.gz': 20429}
```

It writes `human_reviewed.tsv.gz` (2.9 MB), `human_reviewed.fasta.gz` (7.5 MB) and
`human_reviewed.provenance.json` with the query, fields, release, record count, date and
licence. Change `QUERY` and `FIELDS` for other sets. Add `includeIsoform=true` to the FASTA call
to include isoform sequences; the check then needs the isoform count rather than the entry
count, so derive it from the downloaded file and say so in the provenance record.

**Whole databases, from the FTP site.** For all of Swiss-Prot, a whole TrEMBL taxon or the ID
mapping tables, use the release files under
`https://ftp.uniprot.org/pub/databases/uniprot/current_release/`. They are large — TrEMBL's
FASTA alone is 40.6 GB — so size them with `HEAD` before deciding, and read the release notes
with a ranged request rather than downloading anything blind:

```bash
FTP=https://ftp.uniprot.org/pub/databases/uniprot/current_release
for f in knowledgebase/complete/uniprot_sprot.fasta.gz \
         knowledgebase/complete/uniprot_sprot.dat.gz \
         knowledgebase/complete/uniprot_trembl.fasta.gz \
         knowledgebase/idmapping/by_organism/HUMAN_9606_idmapping_selected.tab.gz; do
  size=$(curl -fsSI "$FTP/$f" | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}')
  [ -n "$size" ] || { echo "refusing: no Content-Length for $f" >&2; exit 1; }
  printf '%8.1f MB  %s\n' "$(echo "$size / 1000000" | bc -l)" "$f"
done
curl -fsS -r 0-200 "$FTP/relnotes.txt" | head -1          # the release the bulk files belong to
curl -fsSI "https://rest.uniprot.org/uniprotkb/P04637.json" | tr -d '\r' | grep -i '^x-uniprot-release:'
```

On 2026-11-06:

```
    93.8 MB  knowledgebase/complete/uniprot_sprot.fasta.gz
   700.3 MB  knowledgebase/complete/uniprot_sprot.dat.gz
 40628.1 MB  knowledgebase/complete/uniprot_trembl.fasta.gz
    66.3 MB  knowledgebase/idmapping/by_organism/HUMAN_9606_idmapping_selected.tab.gz
UniProt Release 2026_03
x-uniprot-release: 2026_04
```

The last two lines are the release mismatch described above. If they differ and you are about
to join a bulk file to API results, either wait for the FTP site to catch up or take both from
the same source. The FTP site also serves `previous_releases/` for pinning an exact release.

## Try it

**Data.** UniProtKB entry `P04637` (cellular tumour antigen p53, human) and the reviewed human
set, read live from `https://rest.uniprot.org`. CC BY 4.0, no account. Reachable on 2026-11-06.

**Run.** Self-contained; Python 3.9+ standard library only. It walks through each trap above
and asserts the behaviour.

```python
import json
import urllib.error
import urllib.parse
import urllib.request

REST = "https://rest.uniprot.org"


class Stay(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def get(path, follow=True, **params):
    url = f"{REST}/{path}?" + urllib.parse.urlencode(params, safe=",:")
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(Stay)
    try:
        with opener.open(url, timeout=120) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def total(query):
    code, h, _ = get("uniprotkb/search", query=query, size=0)
    assert code == 200, (code, query)
    return int(h["X-Total-Results"])


# 1. one entry, and the release it came from
code, h, body = get("uniprotkb/P04637.json", fields="accession,gene_primary,length,sequence")
p53 = json.loads(body)
print("release        :", h["X-UniProt-Release"], h["X-UniProt-Release-Date"])
print("P04637         :", p53["genes"][0]["geneName"]["value"], p53["sequence"]["length"], "aa")
assert p53["sequence"]["length"] == len(p53["sequence"]["value"]) == 393

# 2. a secondary accession: 303, and following it silently drops `fields`
code, h, body = get("uniprotkb/Q15086.json", follow=False, fields="accession")
moved = json.loads(body)["inactiveReason"]
assert code == 303 and moved == {"inactiveReasonType": "MERGED", "mergeDemergeTo": ["P04637"]}
_, _, body = get("uniprotkb/Q15086.json", fields="accession")
followed = json.loads(body)
assert followed["primaryAccession"] == "P04637" and "comments" in followed
print("Q15086         : 303 ->", h["Location"], "| followed body has",
      len(followed), "top-level keys although fields=accession was asked")

# 3. demerged and deleted entries answer 200 with entryType Inactive
for acc in ("P62988", "A0A5S6R8N3"):
    code, _, body = get(f"uniprotkb/{acc}.json")
    e = json.loads(body)
    assert code == 200 and e["entryType"] == "Inactive"
    print(f"{acc:15}:", e["inactiveReason"]["inactiveReasonType"],
          e["inactiveReason"].get("mergeDemergeTo") or e["inactiveReason"].get("deletedReason"))

# 4. operators are case-sensitive; lowercase `and` is a search word
up, low = total("organism_id:9606 AND reviewed:true"), total("organism_id:9606 and reviewed:true")
print("AND vs and     :", up, "vs", low)
assert low != up

# 5. gene_exact matches synonyms: ARP1 is a former name of four different human proteins
code, _, body = get("uniprotkb/search", format="tsv", size=50, fields="accession,gene_primary",
                    query="gene_exact:ARP1 AND organism_id:9606 AND reviewed:true")
rows = [ln.split("\t") for ln in body.decode().splitlines()[1:]]
print("gene_exact:ARP1:", sorted(g for _, g in rows))
assert len(rows) > 1 and "ARP1" not in {g for _, g in rows}

# 6. the stream returns every record, and X-Total-Results is the check on it
q = "organism_id:9606 AND reviewed:true AND gene_exact:TP53"
_, _, body = get("uniprotkb/stream", query=q, format="fasta", includeIsoform="true")
records = [ln.split("|")[1] for ln in body.decode().splitlines() if ln.startswith(">")]
assert total(q) == 1 and records[0] == "P04637" and all(r.startswith("P04637") for r in records)
print("TP53 + isoforms:", len(records), "FASTA records:", records[:4], "...")

# 7. a malformed accession and a well-formed but absent one are different errors
for acc, want in (("TP53", 400), ("Q00000", 404)):
    code, _, body = get(f"uniprotkb/{acc}.json")
    assert code == want, (acc, code)
    print(f"{acc:15}: {code}", json.loads(body)["messages"][0])
```

**Expect**

Invariants — these hold across releases, and a failure means the skill is wrong:

- `P04637` has one sequence whose length equals `sequence.length`.
- `Q15086` answers **303** with a `MERGED` body naming `P04637`, and the followed redirect
  returns the full entry although only `accession` was requested.
- `P62988` and `A0A5S6R8N3` answer **200** with `entryType: Inactive`.
- The lower-case `and` query returns a different count from the `AND` query.
- `gene_exact:ARP1` returns more than one reviewed human protein, none with primary gene ARP1.
- The FASTA stream for reviewed human TP53 with isoforms has the canonical record first and
  only `P04637` accessions; the search count is 1.
- A gene symbol in the accession slot is a **400**; a well-formed absent accession is a **404**.

Observed on 2026-11-06 against release 2026_04 — these move with releases, so a mismatch is
drift to investigate:

```
release        : 2026_04 04-November-2026
P04637         : TP53 393 aa
Q15086         : 303 -> /uniprotkb/P04637?from=Q15086 | followed body has 17 top-level keys although fields=accession was asked
P62988         : DEMERGED ['P0CG47', 'P0CG48', 'P62979', 'P62987']
A0A5S6R8N3     : DELETED Not part of a reference proteome
AND vs and     : 20429 vs 20365
gene_exact:ARP1: ['ANGPTL1', 'ARFRP1', 'NR2F2', 'PITX2']
TP53 + isoforms: 9 FASTA records: ['P04637', 'P04637-2', 'P04637-3', 'P04637-4'] ...
TP53           : 400 The 'accession' value has invalid format. It should be a valid UniProtKB accession
Q00000         : 404 Resource not found
```

## Sources

- UniProt REST API — https://rest.uniprot.org/ ; help — https://www.uniprot.org/help/api
- Query syntax — https://www.uniprot.org/help/query-fields
- ID mapping — https://www.uniprot.org/help/id_mapping
- Licence — https://www.uniprot.org/help/license
- Release files — https://ftp.uniprot.org/pub/databases/uniprot/current_release/
- The UniProt Consortium (2025) UniProt: the Universal Protein Knowledgebase in 2025.
  *Nucleic Acids Research* 53, D609–D617 — https://doi.org/10.1093/nar/gkae1010

For predicted structures keyed by these accessions, see the `alphafold` skill; for measured
binding data keyed by them, `chembl` and `bindingdb`.
