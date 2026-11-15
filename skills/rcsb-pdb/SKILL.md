---
name: rcsb-pdb
description: Find and download experimentally determined structures from the RCSB Protein Data Bank — search by UniProt accession or attributes, keep computed models out, read method and resolution correctly, map author and label chains and numbering to UniProt, and catch removed entries that still download.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, protein-structure, crystal-structure, uniprot]
covers: [pdb, rcsb, protein data bank, wwpdb, experimental structure, x-ray crystallography, cryo-em, electron microscopy, nmr, neutron diffraction, integrative structure, resolution, mmcif, bcif, pdb format, chain id, author chain, label asym id, residue numbering, sifts, uniprot mapping, mutant structure, ligand complex, obsolete entry, superseded entry, graphql, search api, sequence search, human, all organisms]
papers: [PMID:39607707, PMID:36420884]
access: [open]
datasets: ["https://data.rcsb.org/rest/v1/core/entry/1TUP", "https://data.rcsb.org/rest/v1/holdings/status/116L", "https://files.rcsb.org/download/1TUP.cif.gz", "https://rest.uniprot.org/uniprotkb/P04637.fasta"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: RCSB PDB weekly update 2026_44 (Search API v2, Data API REST and GraphQL, files.rcsb.org; wwPDB archive files dated 2026-10-31) / UniProt REST 2026_04 for reference sequences / Python 3.12.9 standard library only / curl 8 / macOS arm64
  executed: 7
  unverified: 0
---

# RCSB PDB — experimentally determined structures

The Protein Data Bank is the single worldwide archive of experimentally determined
macromolecular structures, run by the wwPDB partners. RCSB PDB (the US partner) serves it
through the APIs used here. On 2026-11-06 the archive held 262,922 current entries, 6,140
removed ones and 35,705 awaiting release.

This skill covers **experimental structures only**: X-ray, cryo-EM, NMR, neutron and the
integrative entries the archive now includes. RCSB also indexes over a million **computed**
structure models from AlphaFold DB and ModelArchive alongside them. The blocks below keep
those out explicitly. For predicted structures and their confidence metrics, use the
`alphafold` skill.

**What you need: nothing.** All three services are anonymous:

- **Search API** — `https://search.rcsb.org/rcsbsearch/v2/query`, a JSON query that returns
  identifiers.
- **Data API** — `https://data.rcsb.org/`: REST (`/rest/v1/core/entry/1TUP`) and GraphQL
  (`/graphql`), returning entry, entity and instance records.
- **Files** — `https://files.rcsb.org/download/{id}.cif.gz` and the wwPDB archive at
  `https://files.wwpdb.org/pub/pdb/`.

## Licence

From <https://www.rcsb.org/pages/usage-policy>, checked 2026-11-06: "The wwPDB policy states
that data files contained in the PDB archive are available under the CC0 1.0 Universal (CC0
1.0) Public Domain Dedication. All data provided by RCSB PDB programmatic APIs are available
under the same license." Commercial use needs no permission. RCSB encourages attributing "the
original authors of the PDB structure data", so cite each entry's primary citation.

This page is original text, CC-BY-4.0, by Heureka Labs.

## Which data you are reading

The archive updates weekly. Every holdings record carries an `update_id` (`2026_44` on
2026-11-06); record it with your results. Entries are also versioned individually
(`rcsb_accession_info.major_revision`/`minor_revision`, `revision_date`), and a re-refined
entry keeps its id. PDB ids are case-insensitive (`1tup` and `1TUP` fetch the same file), and
the extended form `pdb_00001tup` already works on the file server.

## The helper

The later blocks import this module, so run them from the directory you write it into.

```bash
cat > rcsb.py <<'PY'
"""A small RCSB PDB client: Search API, GraphQL Data API, holdings. Standard library only."""
import json
import time
import urllib.error
import urllib.request

SEARCH = "https://search.rcsb.org/rcsbsearch/v2/query"
GRAPHQL = "https://data.rcsb.org/graphql"
HOLDINGS = "https://data.rcsb.org/rest/v1/holdings/status"


def _post(url, payload, tries=4):
    data = json.dumps(payload).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as r:
                body = r.read()
                return r.status, (json.loads(body) if body.strip() else None)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and i < tries - 1:
                time.sleep(5 * (i + 1))
                continue
            raise RuntimeError(f"HTTP {e.code} from {url}: {e.read()[:300]!r}") from None


def search(query, return_type="entry", experimental_only=True):
    """Every hit of a Search API query. An empty result is HTTP 204 with no body, not [].

    Experimental structures only, unless asked otherwise: computed models (AlphaFold DB and
    ModelArchive) are in the same index and join the results when 'computational' is set."""
    content = ["experimental"] if experimental_only else ["experimental", "computational"]
    status, body = _post(SEARCH, {"query": query, "return_type": return_type,
                                  "request_options": {"return_all_hits": True,
                                                      "results_content_type": content}})
    if status == 204 or body is None:
        return []
    hits = [h["identifier"] for h in body["result_set"]]
    if len(hits) != body["total_count"]:
        raise RuntimeError(f"got {len(hits)} hits, total_count says {body['total_count']}")
    return hits


def by_uniprot(accession):
    """Query object: polymer entities whose SIFTS reference is this UniProt accession."""
    attr = "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers"
    return {"type": "group", "logical_operator": "and", "nodes": [
        {"type": "terminal", "service": "text", "parameters": {
            "attribute": f"{attr}.database_accession", "operator": "exact_match", "value": accession}},
        {"type": "terminal", "service": "text", "parameters": {
            "attribute": f"{attr}.database_name", "operator": "exact_match", "value": "UniProt"}}]}


def graphql(query, variables):
    _, body = _post(GRAPHQL, {"query": query, "variables": variables})
    if body.get("errors"):
        raise RuntimeError(body["errors"][0]["message"])
    return body["data"]


ENTRY_FIELDS = """query($ids: [String!]!) { entries(entry_ids: $ids) {
  rcsb_id exptl { method }
  rcsb_entry_info { experimental_method resolution_combined deposited_atom_count }
  rcsb_accession_info { initial_release_date }
  polymer_entities { rcsb_id
    entity_poly { rcsb_entity_polymer_type pdbx_seq_one_letter_code_can }
    rcsb_polymer_entity_align { reference_database_name reference_database_accession
      aligned_regions { entity_beg_seq_id ref_beg_seq_id length } }
    polymer_entity_instances { rcsb_polymer_entity_instance_container_identifiers {
      asym_id auth_asym_id } } } } }"""


def entries(ids, chunk=100):
    out = []
    for i in range(0, len(ids), chunk):
        out += graphql(ENTRY_FIELDS, {"ids": ids[i:i + chunk]})["entries"]
    return out


def status(entry_id):
    """CURRENT, or REMOVED with its replacement. One id per call: the batch form of this
    endpoint answers 500 for the whole batch when any one id is unknown."""
    try:
        with urllib.request.urlopen(f"{HOLDINGS}/{entry_id}", timeout=60) as r:
            h = json.loads(r.read())["rcsb_repository_holdings_combined"]
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"status": "UNKNOWN"}
        raise
    return {"status": h["status"], "replaced_by": h.get("id_code_replaced_by_latest")}
PY
python3 - <<'EOF'
from rcsb import by_uniprot, search, status
exp = search(by_uniprot("P04637"))
both = search(by_uniprot("P04637"), experimental_only=False)
print("P04637:", len(exp), "experimental entries;", len(both) - len(exp), "computed model(s) besides:",
      sorted(set(both) - set(exp)))
print("Q15086 (secondary accession):", search(by_uniprot("Q15086")))
for pid in ("1TUP", "116L", "0ZZZ"):
    print(pid, status(pid))
EOF
```

On 2026-11-06:

```
P04637: 323 experimental entries; 1 computed model(s) besides: ['AF_AFP04637F1']
Q15086 (secondary accession): []
1TUP {'status': 'CURRENT', 'replaced_by': None}
116L {'status': 'REMOVED', 'replaced_by': '216L'}
0ZZZ {'status': 'UNKNOWN'}
```

## Searching

Queries are JSON trees of `terminal` nodes (one service, one condition) joined by `group`
nodes. The services are `text` (structured attributes, the workhorse), `full_text`, `sequence`
(MMseqs2), `seqmotif`, `structure` and `chemical`. The attribute names are listed at
`https://search.rcsb.org/rcsbsearch/v2/metadata/schema`. What to know:

| behaviour (2026-11-06) | consequence |
|---|---|
| `results_content_type` defaults to `["experimental"]`; adding `"computational"` mixes in computed models with ids like `AF_AFP04637F1` | set it explicitly, so the query says what it returns; a 4-character id is an experimental entry |
| **No hits is HTTP 204 with an empty body**, not a JSON object with zero results | `json.loads` raises on it; test the status first |
| Results are paged (10 by default) unless `return_all_hits` is set; `total_count` is always reported | compare the hit count with `total_count` |
| UniProt matching uses SIFTS mappings on polymer entities, and only primary accessions: the secondary `Q15086` returns nothing | resolve accessions in UniProtKB before searching |
| UniProt's own cross-references disagree with this search. For TP53, 323 entries here and 318 in UniProt: 6 only here, 1 only there | treat the PDB side (SIFTS) as authoritative for structures, and expect lag between the two |

## Method, resolution and what an entry actually contains

Fetch entry details by GraphQL, one round trip for up to a few hundred entries (the helper
asks 100 at a time). Three things in the answer need care:

- **Method.** `rcsb_entry_info.experimental_method` is always set (`X-ray`, `EM`, `NMR`,
  `Neutron`, `Multiple methods`, `Integrative`). The `exptl` list it is derived from is
  **null for integrative entries**, so code that iterates `exptl` raises a `TypeError` on them;
  two TP53 entries, `8ZZN` and `9A9W`, are integrative. Integrative models combine several
  kinds of data and are partly modelled, so decide on purpose whether they count as
  experimental for your question.
- **Resolution.** `resolution_combined` is a list, and it is empty for NMR and integrative
  entries. Lower is better, but only within a method: a 3 Å cryo-EM map and a 3 Å crystal
  structure are not equivalent, and NMR has no resolution at all.
- **Coverage.** An entry "of TP53" can be a 12-residue peptide bound to another protein. The
  three best-resolved TP53 crystal structures are two peptides and one DNA-binding domain.
  Read how much of your protein each entity covers (`rcsb_polymer_entity_align`) before
  ranking by resolution.

```python
from collections import Counter
from rcsb import by_uniprot, entries, search

ids = search(by_uniprot("P04637"))
info = entries(ids)
# rcsb_entry_info.experimental_method is always set; exptl is null for integrative entries.
print(f"{len(info)} entries:", dict(Counter(e["rcsb_entry_info"]["experimental_method"] for e in info)))
odd = [e["rcsb_id"] for e in info if e["exptl"] is None]
no_res = [e["rcsb_id"] for e in info if not e["rcsb_entry_info"]["resolution_combined"]]
print(f"exptl is null for {odd}; {len(no_res)} entries have no resolution, e.g. {no_res[:4]}")


def tp53_residues(e):
    """UniProt residues of TP53 aligned in the entry, over all its TP53 entities."""
    return sum(r["length"] for p in e["polymer_entities"]
               for a in (p["rcsb_polymer_entity_align"] or [])
               if a["reference_database_accession"] == "P04637"
               for r in a["aligned_regions"])


xray = [e for e in info if e["rcsb_entry_info"]["experimental_method"] == "X-ray"]
for e in sorted(xray, key=lambda e: e["rcsb_entry_info"]["resolution_combined"][0])[:3]:
    print(f"  {e['rcsb_id']}  {e['rcsb_entry_info']['resolution_combined'][0]:.2f} Å  "
          f"TP53 residues aligned: {tp53_residues(e)}")
short = [e["rcsb_id"] for e in info if tp53_residues(e) < 30]
print(f"{len(short)} entries hold fewer than 30 TP53 residues — a peptide bound to another protein")
```

On 2026-11-06:

```
323 entries: {'NMR': 30, 'X-ray': 275, 'EM': 16, 'Integrative': 2}
exptl is null for ['8ZZN', '9A9W']; 32 entries have no resolution, e.g. ['1A1U', '1DT7', '1HS5', '1JSP']
  9C5S  1.01 Å  TP53 residues aligned: 14
  3D06  1.20 Å  TP53 residues aligned: 200
  5MHC  1.20 Å  TP53 residues aligned: 12
89 entries hold fewer than 30 TP53 residues — a peptide bound to another protein
```

The same code ran without change on EGFR (394 entries), SARS-CoV-2 spike (2,276; 1,665 of
them cryo-EM), haemoglobin alpha (357, including neutron structures), hen lysozyme (1,401,
including `Multiple methods`) and *E. coli* ribosomal protein S2 (562).

## Chains and numbering

A structure has two sets of chain ids and two residue numberings, and they do not agree:

- **Author** ids (`auth_asym_id`, `auth_seq_id`) are what the depositors chose, what legacy
  PDB files show and what papers cite.
- **Label** ids (`asym_id`/`label_asym_id`, `label_seq_id`) are assigned by the archive.
  `label_seq_id` counts from 1 along the **entity** sequence.

In `1TUP` the TP53 chains are author `A`, `B`, `C` and label `C`, `D`, `E`, while the DNA is
author `E` and `F` and label `A` and `B`. Label `C` and author `C` are different molecules.
Pair the two through `polymer_entity_instances`, which gives both ids on one record. The
entity-level `auth_asym_ids` and `asym_ids` are two separate lists with no documented
pairing, so do not zip them.

To reach UniProt numbering, use `rcsb_polymer_entity_align`: each aligned region maps
`entity_beg_seq_id` to `ref_beg_seq_id` over a length. Entity residue 1 of `1TUP` is TP53
residue 94. **An alignment is not an identity.** Engineered mutants align to the wild-type
accession: `6FF9` is TP53 R280K, and the check below finds the substitution by comparing the
entity sequence with UniProt's across the aligned region.

```python
import json
import urllib.request
from rcsb import entries

with urllib.request.urlopen("https://rest.uniprot.org/uniprotkb/P04637.fasta", timeout=60) as r:
    ref = "".join(r.read().decode().splitlines()[1:])

for e in entries(["1TUP", "2OCJ", "6FF9", "3D06"]):
    for p in e["polymer_entities"]:
        aligns = [a for a in (p["rcsb_polymer_entity_align"] or [])
                  if a["reference_database_accession"] == "P04637"]
        if not aligns:
            continue
        seq = p["entity_poly"]["pdbx_seq_one_letter_code_can"]
        chains = [(i["rcsb_polymer_entity_instance_container_identifiers"]["auth_asym_id"],
                   i["rcsb_polymer_entity_instance_container_identifiers"]["asym_id"])
                  for i in p["polymer_entity_instances"]]
        diffs = []
        for reg in aligns[0]["aligned_regions"]:
            for k in range(reg["length"]):
                s, u = reg["entity_beg_seq_id"] + k, reg["ref_beg_seq_id"] + k   # both 1-based
                if seq[s - 1] != ref[u - 1]:
                    diffs.append(f"{ref[u - 1]}{u}{seq[s - 1]}")
        reg = aligns[0]["aligned_regions"][0]
        print(f"{p['rcsb_id']}: entity residue {reg['entity_beg_seq_id']} = UniProt "
              f"{reg['ref_beg_seq_id']}; chains (author, label) {chains}; differs from UniProt at {diffs}")
```

On 2026-11-06:

```
1TUP_3: entity residue 1 = UniProt 94; chains (author, label) [('A', 'C'), ('B', 'D'), ('C', 'E')]; differs from UniProt at []
2OCJ_1: entity residue 1 = UniProt 94; chains (author, label) [('A', 'A'), ('B', 'B'), ('C', 'C'), ('D', 'D')]; differs from UniProt at []
6FF9_1: entity residue 1 = UniProt 97; chains (author, label) [('A', 'A'), ('B', 'B'), ('C', 'C'), ('D', 'D')]; differs from UniProt at ['R280K']
3D06_1: entity residue 1 = UniProt 94; chains (author, label) [('A', 'A')]; differs from UniProt at ['R249S']
```

The sequence compared is the deposited **entity** sequence, not the residues with
coordinates. Disordered residues are in the entity but missing from the model, so check the
coordinates before claiming that a residue was observed.

## Get the files

Download mmCIF (`.cif.gz`), the archive's format. The legacy PDB format does not exist for
entries with more than 99,999 atoms or with multi-character chain ids, such as the ribosome
`4V6X` (its author chains include `Ad` and `A8`).

**Removed entries still download.** `116L` was removed in 1994 and replaced by `216L`. The
Data API answers 404 for it, the holdings service says `REMOVED`, and `files.rcsb.org` still
returns its mmCIF with HTTP 200. A pipeline that only downloads will quietly use an obsolete
structure, so the block checks holdings first, records the replacement, and does not fetch
the removed file. Check one id per holdings call: the batch form,
`/holdings/status?ids=…`, answered HTTP 500 for the whole batch when one id was unknown.

```python
import gzip
import json
import os
import time
import urllib.error
import urllib.request
from rcsb import status

WANTED = ["1TUP", "6FF9", "116L", "4V6X"]
os.makedirs("structures", exist_ok=True)
manifest = []
for pid in WANTED:
    st = status(pid)
    row = {"asked": pid, "status": st["status"]}
    if st["status"] == "REMOVED":
        # files.rcsb.org still serves removed entries, so the file would download without error
        row["replaced_by"] = st["replaced_by"]
        manifest.append(row)
        continue
    url = f"https://files.rcsb.org/download/{pid}.cif.gz"
    with urllib.request.urlopen(url, timeout=300) as r:
        blob = r.read()
    text = gzip.decompress(blob).decode()
    if not text.startswith(f"data_{pid}"):
        raise SystemExit(f"{pid}: file does not start with data_{pid}")
    path = f"structures/{pid}.cif.gz"
    with open(path, "wb") as fh:
        fh.write(blob)
    try:
        urllib.request.urlopen(urllib.request.Request(
            f"https://files.rcsb.org/download/{pid}.pdb", method="HEAD"), timeout=60)
        legacy = True
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        legacy = False                    # no .pdb file: two-character chains or too many atoms
    row.update(file=path, bytes=len(blob), legacy_pdb_format=legacy)
    manifest.append(row)

with open("structures/manifest.json", "w") as fh:
    json.dump({"source": "RCSB PDB files.rcsb.org (mmCIF)", "entries": manifest,
               "downloaded": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "licence": "CC0 1.0 (wwPDB); cite the primary citation of each entry"}, fh, indent=2)
for row in manifest:
    print(row)
```

On 2026-11-06:

```
{'asked': '1TUP', 'status': 'CURRENT', 'file': 'structures/1TUP.cif.gz', 'bytes': 165320, 'legacy_pdb_format': True}
{'asked': '6FF9', 'status': 'CURRENT', 'file': 'structures/6FF9.cif.gz', 'bytes': 171989, 'legacy_pdb_format': True}
{'asked': '116L', 'status': 'REMOVED', 'replaced_by': '216L'}
{'asked': '4V6X', 'status': 'CURRENT', 'file': 'structures/4V6X.cif.gz', 'bytes': 5692366, 'legacy_pdb_format': False}
```

Reading a downloaded file shows both numberings side by side. Every line of these mmCIF files
ends in a space, so strip lines before comparing them:

```python
import gzip
import shlex

lines = [ln.rstrip() for ln in gzip.open("structures/1TUP.cif.gz", "rt")]   # lines end in a space
start = lines.index("_atom_site.group_PDB")
cols = []
for ln in lines[start:]:
    if not ln.startswith("_atom_site."):
        break
    cols.append(ln.split(".", 1)[1].strip())
rows = []
for ln in lines[start + len(cols):]:
    if ln.startswith("#") or ln.startswith("loop_") or ln.startswith("_"):
        break
    rows.append(dict(zip(cols, shlex.split(ln))))
ca = [r for r in rows if r["label_atom_id"] == "CA" and r["group_PDB"] == "ATOM"]
first = {}
for r in ca:
    first.setdefault(r["auth_asym_id"], r)
for chain, r in sorted(first.items()):
    print(f"author chain {chain} = label chain {r['label_asym_id']}; first CA: label_seq_id "
          f"{r['label_seq_id']}, auth_seq_id {r['auth_seq_id']} ({r['label_comp_id']})")
```

On 2026-11-06:

```
author chain A = label chain C; first CA: label_seq_id 1, auth_seq_id 94 (SER)
author chain B = label chain D; first CA: label_seq_id 3, auth_seq_id 96 (SER)
author chain C = label chain E; first CA: label_seq_id 2, auth_seq_id 95 (SER)
```

In `1TUP` the authors numbered residues as in TP53 itself, so `auth_seq_id` equals the UniProt
position here. That is a convention some depositors follow, not a rule; use the alignment
when it matters. The three copies also start at different residues, because the first few are
disordered in two of them.

**The whole archive.** For bulk work use the wwPDB archive, which is large and weekly-updated.
Size what you need with `HEAD`, and look inside with ranged reads:

```bash
ARCH=https://files.wwpdb.org/pub/pdb
for f in derived_data/pdb_seqres.txt.gz holdings/current_file_holdings.json.gz \
         holdings/all_removed_entries.json.gz data/structures/divided/mmCIF/tu/1tup.cif.gz; do
  curl -fsSI "$ARCH/$f" | tr -d '\r' |
    awk -v f="$f" 'tolower($1)=="content-length:"{l=$2} tolower($1)=="last-modified:"{$1=""; m=$0}
                   END{ if (!l) { print "refusing: no Content-Length for " f > "/dev/stderr"; exit 1 }
                        printf "%9.1f MB %s |%s\n", l/1e6, f, m }' || exit 1
done
# first 4 kB of the sequence file, decompressed as far as it goes
curl -fsS -r 0-4095 "$ARCH/derived_data/pdb_seqres.txt.gz" |
  python3 -c "import sys, zlib; print(*zlib.decompressobj(31).decompress(sys.stdin.buffer.read()).decode().splitlines()[:2], sep='\n')"
```

On 2026-11-06:

```
     68.2 MB derived_data/pdb_seqres.txt.gz | Sat, 31 Oct 2026 11:57:36 GMT
     16.7 MB holdings/current_file_holdings.json.gz | Sat, 31 Oct 2026 11:57:37 GMT
      0.6 MB holdings/all_removed_entries.json.gz | Sat, 31 Oct 2026 11:57:37 GMT
      0.2 MB data/structures/divided/mmCIF/tu/1tup.cif.gz | Mon, 22 Sep 2025 00:37:46 GMT
>100d_A mol:na length:10  DNA/RNA (5'-R(*CP*)-D(*CP*GP*GP*CP*GP*CP*CP*GP*)-R(*G)-3')
CCGGCGCCGG
```

`pdb_seqres.txt` lists every polymer chain by lower-case id and **author** chain, with the
full deposited sequence. The divided mmCIF tree files each entry under the middle two
characters of its id (`tu/1tup.cif.gz`). For mirroring the whole tree, wwPDB documents
rsync; size it before starting.

## Try it

**Data.** The live RCSB Search and Data APIs and file server, centred on TP53 (`P04637`), the
TP53–DNA complex `1TUP`, the R280K mutant `6FF9`, the integrative entry `8ZZN`, the removed
entry `116L` and the ribosome `4V6X`; and the TP53 reference sequence from UniProt. CC0 (PDB)
and CC BY 4.0 (UniProt), no account. All reachable on 2026-11-06.

**Run.** Self-contained; Python 3.9+ standard library only.

```python
import json
import urllib.error
import urllib.request


def post(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        body = r.read()
        return r.status, (json.loads(body) if body.strip() else None)


def head(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def by_uniprot(acc, content):
    attr = "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers"
    return {"query": {"type": "group", "logical_operator": "and", "nodes": [
        {"type": "terminal", "service": "text", "parameters": {
            "attribute": f"{attr}.database_accession", "operator": "exact_match", "value": acc}},
        {"type": "terminal", "service": "text", "parameters": {
            "attribute": f"{attr}.database_name", "operator": "exact_match", "value": "UniProt"}}]},
        "return_type": "entry",
        "request_options": {"return_all_hits": True, "results_content_type": content}}


SEARCH = "https://search.rcsb.org/rcsbsearch/v2/query"

# 1. experimental only vs. computed models in the same index
_, exp = post(SEARCH, by_uniprot("P04637", ["experimental"]))
_, both = post(SEARCH, by_uniprot("P04637", ["experimental", "computational"]))
e_ids = {h["identifier"] for h in exp["result_set"]}
extra = {h["identifier"] for h in both["result_set"]} - e_ids
assert all(len(i) == 4 for i in e_ids) and extra and all(i.startswith("AF_") for i in extra)
print("P04637 experimental:", exp["total_count"], "| computed models added by 'computational':", sorted(extra))

# 2. no hits is HTTP 204 with an empty body
code, body = post(SEARCH, by_uniprot("Q15086", ["experimental"]))
assert code == 204 and body is None
print("Q15086 (secondary) :", code, "empty body")

# 3. a removed entry: holdings knows, the Data API 404s, the file server still serves it
with urllib.request.urlopen("https://data.rcsb.org/rest/v1/holdings/status/116L", timeout=60) as r:
    h = json.loads(r.read())["rcsb_repository_holdings_combined"]
assert h["status"] == "REMOVED" and h["id_code_replaced_by_latest"] == "216L"
assert head("https://data.rcsb.org/rest/v1/core/entry/116L") == 404
assert head("https://files.rcsb.org/download/116L.cif") == 200
print("116L               : REMOVED -> 216L; Data API 404; file still downloadable (200)")

# 4. author and label chain ids differ, and numbering is offset from UniProt
q = """{ entries(entry_ids: ["1TUP", "6FF9", "8ZZN"]) { rcsb_id exptl { method }
  rcsb_entry_info { experimental_method }
  polymer_entities { entity_poly { pdbx_seq_one_letter_code_can }
    rcsb_polymer_entity_align { reference_database_accession aligned_regions {
      entity_beg_seq_id ref_beg_seq_id length } }
    polymer_entity_instances { rcsb_polymer_entity_instance_container_identifiers {
      asym_id auth_asym_id } } } } }"""
_, data = post("https://data.rcsb.org/graphql", {"query": q})
E = {e["rcsb_id"]: e for e in data["data"]["entries"]}
p53 = [p for p in E["1TUP"]["polymer_entities"] if p["rcsb_polymer_entity_align"]][0]
pairs = {i["rcsb_polymer_entity_instance_container_identifiers"]["auth_asym_id"]:
         i["rcsb_polymer_entity_instance_container_identifiers"]["asym_id"]
         for i in p53["polymer_entity_instances"]}
reg = p53["rcsb_polymer_entity_align"][0]["aligned_regions"][0]
assert pairs["A"] == "C" and reg["entity_beg_seq_id"] == 1 and reg["ref_beg_seq_id"] == 94
print("1TUP TP53 entity   : author->label", dict(sorted(pairs.items())), "| entity residue 1 = UniProt", reg["ref_beg_seq_id"])

with urllib.request.urlopen("https://rest.uniprot.org/uniprotkb/P04637.fasta", timeout=60) as r:
    ref = "".join(r.read().decode().splitlines()[1:])
mut = E["6FF9"]["polymer_entities"][0]
reg = mut["rcsb_polymer_entity_align"][0]["aligned_regions"][0]
seq = mut["entity_poly"]["pdbx_seq_one_letter_code_can"]
diffs = [f"{ref[reg['ref_beg_seq_id'] + k - 1]}{reg['ref_beg_seq_id'] + k}{seq[reg['entity_beg_seq_id'] + k - 1]}"
         for k in range(reg["length"])
         if seq[reg["entity_beg_seq_id"] + k - 1] != ref[reg["ref_beg_seq_id"] + k - 1]]
assert diffs
print("6FF9 vs UniProt    :", diffs, "inside the aligned region")

# 5. integrative entries have no exptl block; experimental_method is always there
assert E["8ZZN"]["exptl"] is None and E["8ZZN"]["rcsb_entry_info"]["experimental_method"] == "Integrative"
print("8ZZN               : exptl null, experimental_method", E["8ZZN"]["rcsb_entry_info"]["experimental_method"])

# 6. large entries have no legacy PDB-format file
assert head("https://files.rcsb.org/download/4V6X.pdb") == 404
assert head("https://files.rcsb.org/download/4V6X.cif.gz") == 200
print("4V6X               : .pdb 404, .cif.gz 200")
```

**Expect**

Invariants — a failure means the skill is wrong:

- With `"computational"` added, the extra hits are all `AF_…` computed models, and every
  experimental id has four characters.
- A search with no hits returns **204** and an empty body.
- `116L` is `REMOVED`, replaced by `216L`; the Data API gives **404** and the file server
  **200**.
- In `1TUP`, author chain `A` is label chain `C`, and entity residue 1 aligns to UniProt
  residue 94.
- `6FF9` differs from the UniProt sequence inside its aligned region.
- `8ZZN` has a null `exptl` and `experimental_method` `Integrative`.
- `4V6X` has no `.pdb` file and does have `.cif.gz`.

Observed on 2026-11-06 at update 2026_44 — counts grow every week, so a mismatch is drift to
investigate:

```
P04637 experimental: 323 | computed models added by 'computational': ['AF_AFP04637F1']
Q15086 (secondary) : 204 empty body
116L               : REMOVED -> 216L; Data API 404; file still downloadable (200)
1TUP TP53 entity   : author->label {'A': 'C', 'B': 'D', 'C': 'E'} | entity residue 1 = UniProt 94
6FF9 vs UniProt    : ['R280K'] inside the aligned region
8ZZN               : exptl null, experimental_method Integrative
4V6X               : .pdb 404, .cif.gz 200
```

## Sources

- RCSB PDB — https://www.rcsb.org/ ; Search API — https://search.rcsb.org/ ; Data API —
  https://data.rcsb.org/
- Usage policy — https://www.rcsb.org/pages/usage-policy
- wwPDB archive — https://files.wwpdb.org/pub/pdb/
- Burley et al. (2025) Updated resources for exploring experimentally-determined PDB
  structures and Computed Structure Models at the RCSB Protein Data Bank. *Nucleic Acids
  Research* 53, D564–D574 — https://doi.org/10.1093/nar/gkae1091
- Burley et al. (2023) RCSB Protein Data Bank (RCSB.org): delivery of experimentally-determined
  PDB structures alongside one million computed structure models of proteins from artificial
  intelligence/machine learning. *Nucleic Acids Research* 51, D488–D508 —
  https://doi.org/10.1093/nar/gkac1077
