---
name: ncbi-datasets
description: Fetch genome assemblies and annotation packages (FASTA, GFF3, GTF, protein) and resolve NCBI taxonomy through NCBI Datasets v2 — page listings to completion, pin assembly versions, and map RefSeq GCF_ to GenBank GCA_ by sequence.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [entrez, public-data, sequences, genomic-intervals]
covers: [ncbi datasets, genome assembly, assembly accession, gcf, gca, refseq, genbank, grch38, grcm39, t2t-chm13, reference genome, genome fasta, gff3, gtf, protein fasta, cds fasta, annotation package, sequence report, chromosome names, assembly version, suppressed assembly, ncbi taxonomy, taxid, lineage, human, mouse, yeast, e. coli, bacteria, virus]
papers: [PMID:38969627]
access: [open]
datasets: [https://api.ncbi.nlm.nih.gov/datasets/v2/genome/accession/GCF_000005845.2/dataset_report, https://api.ncbi.nlm.nih.gov/datasets/v2/genome/accession/GCF_000001405.40/sequence_reports, https://api.ncbi.nlm.nih.gov/datasets/v2/taxonomy/taxon/Morus, https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/001/405/GCF_000001405.40_GRCh38.p14/md5checksums.txt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-19
  against: NCBI Datasets API v2 (x-datasets-version 18.41.1) / genomes FTP tree dated 2026-11-18 / Python 3.12.8 stdlib only / curl 8.15.0
  executed: 9
  unverified: 1
  unverified_reason: the datasets/dataformat CLI block was not executed because the binary could not be run in the build environment — running it with the CLI installed would unblock it; every REST call it wraps is executed above
---
# NCBI Datasets

NCBI Datasets v2 (`https://api.ncbi.nlm.nih.gov/datasets/v2`) is NCBI's current interface to
genome assemblies, their annotation, and the taxonomy that organises them. It returns JSON
reports and zip packages. This skill covers **assemblies, genome and annotation packages, and
taxonomy**.

Gene records, gene/transcript/protein packages and orthologs also live in Datasets, but they
belong to `ncbi-gene`, which covers them (including the `/gene/id/{id}/orthologs` endpoint
and the `gene_orthologs.gz` bulk file). Use that skill for anything keyed on a GeneID.
For the Ensembl side of the same genomes use `ensembl`.

Access is not the hard part. Four silent failures are:

- **An empty answer is HTTP 200 `{}`.** An unknown accession, an unknown taxon name, an
  old assembly version and a `GCF_`/`GCA_` prefix swap all look the same: no error, no
  `reports` key.
- **Taxon listings truncate.** `genome/taxon/{taxon}/dataset_report` returns 20 records
  unless you page it, and a `page_size` over 1000 is clamped to 1000 without a word. Other
  endpoints page differently (below), so page every one the same way.
- **RefSeq `GCF_` and GenBank `GCA_` are two records, not two spellings.** Their version
  numbers differ, their sequences are named differently, and they need not hold the same
  sequences.
- **A name is not a taxon.** `Morus` is a plant genus and a bird genus; a genome query by
  name quietly takes one.

## Before the first call

- **No account is needed.** Without a key the API allows **5 requests/s**
  (`x-ratelimit-limit: 5`); a free NCBI API key raises that to 10. Create one under
  *Account settings* at ncbi.nlm.nih.gov and export it as `NCBI_API_KEY`; it is sent as the
  `api-key` header. Over the limit you get `429`: fifteen parallel requests on 2026-11-19
  returned eight `429`s. The helper below spaces calls and backs off.
- **Terms.** NCBI's molecular data policy: "NCBI itself places no restrictions on the use or
  distribution of the data contained therein", while noting that original submitters may
  claim rights in some data (https://www.ncbi.nlm.nih.gov/home/about/policies/). The
  Datasets CLI is a US Government work in the public domain
  (https://github.com/ncbi/datasets/blob/master/LICENSE.md). Cite NCBI and the exact
  assembly accession, with its version.

## A stdlib helper

Save as `ncbi_datasets.py`; every later block imports it. Standard library only.

```python
"""Small stdlib client for NCBI Datasets v2: genomes, assemblies, taxonomy."""
import json, os, time, urllib.error, urllib.parse, urllib.request

BASE = "https://api.ncbi.nlm.nih.gov/datasets/v2"
API_KEY = os.environ.get("NCBI_API_KEY")       # optional; 5 -> 10 requests/s
GAP = 0.12 if API_KEY else 0.25                # seconds between calls
_last = [0.0]


def _open(req, timeout=120, tries=4):
    for attempt in range(tries):
        wait = _last[0] + GAP - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < tries - 1:
                time.sleep(2 ** attempt)
                continue
            body = e.read()[:300].decode("utf-8", "replace")
            raise RuntimeError(f"HTTP {e.code} from {req.full_url[:140]}: {body}") from None


def get(path, params=None, body=None, raw=False, timeout=120):
    """GET (or POST JSON when body is given). params may hold lists (repeated keys)."""
    url = f"{BASE}/{path.lstrip('/')}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    headers = {"Accept": "application/zip" if raw else "application/json"}
    if API_KEY:
        headers["api-key"] = API_KEY
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    blob = _open(urllib.request.Request(url, data=data, headers=headers), timeout=timeout)
    return blob if raw else json.loads(blob)


def paged(path, params=None, key="reports", page_size=1000):
    """Every record behind a paged endpoint. Refuses to return a short list.

    On taxon listings page_size above 1000 is clamped to 1000 without an error
    and an unpaged call returns 20 records, so a caller that ignores
    next_page_token keeps a fraction of the answer and sees nothing wrong.
    """
    params = dict(params or {}, page_size=page_size)
    out, total = [], None
    while True:
        r = get(path, params)
        if total is None:
            if r and "total_count" not in r:    # {} with HTTP 200 is the empty answer
                raise IOError(f"{path}: records but no total_count; cannot check completeness")
            total = r.get("total_count", 0)
        out.extend(r.get(key, []))
        tok = r.get("next_page_token")
        if not tok:
            break
        params["page_token"] = tok
    if len(out) < total:
        raise IOError(f"{path}: got {len(out)} of total_count {total}")
    return out


def assembly(accession, all_versions=True):
    """One assembly report, or None. Old versions are hidden unless all_versions."""
    p = {"filters.assembly_version": "all_assemblies"} if all_versions else {}
    reps = get(f"genome/accession/{accession}/dataset_report", p).get("reports", [])
    return reps[0] if reps else None
```

`paged` raises when it gets **fewer** records than `total_count`, and when an answer has
records but no `total_count` at all. Two limits on that guard:

- **On `sequence_reports` it cannot fire.** There `total_count` counts only the primary
  assembly plus organelles (191 for GRCh38.p14) while the endpoint returns every sequence
  including alt loci and patches (705), so the count is a floor, not a total. Check a
  sequence report against `assembly_stats` or the FTP `_assembly_report.txt` instead. (An
  equality check would fire on that correct answer, which is why the guard is `<`.)
- **Paging differs by endpoint.** Taxon listings return 20 unpaged and clamp `page_size` to
  1000. `sequence_reports` returned everything unpaged (705 for GRCh38.p14, 3,134 for
  `GCA_000002125.2`) and did not clamp `page_size=5000`. `annotation_report` for *E. coli*
  returned all 4,651 genes unpaged or at `page_size=5000`, and paged at 1000. Sending
  `page_size=1000` and following `next_page_token`, as `paged` does, works on all three.

## Pin the assembly, with its version

An assembly accession is `GC[AF]_` + nine digits + `.version`. `GCA_` is the GenBank
(submitter) record; `GCF_` is NCBI's RefSeq copy of it. Each revision (a GRCh38 patch, say)
gets a new version, and **only the current version is visible by default**:

```python
from ncbi_datasets import get, assembly

for acc in ["GCF_000001405.40", "GCF_000001405.39", "GCA_000001405.15",
            "GCF_000001405", "GCA_000001405.40", "notanaccession"]:
    hidden = assembly(acc, all_versions=False)
    a = assembly(acc)
    print(f"{acc:18} default={'found' if hidden else '{}':5}",
          "" if not a else (a["accession"], a["assembly_info"]["assembly_status"],
                            a["assembly_info"]["assembly_name"], "current:", a["current_accession"],
                            "paired:", a.get("paired_accession")))

hist = get("genome/accession/GCF_000001405.40/revision_history")["assembly_revisions"]
print(len(hist), "revisions;", [(h["refseq_accession"], h["genbank_accession"], h["assembly_name"])
                               for h in hist[:3]])
```

Observed 2026-11-19:

```
GCF_000001405.40   default=found ('GCF_000001405.40', 'current', 'GRCh38.p14', 'current:', 'GCF_000001405.40', 'paired:', 'GCA_000001405.29')
GCF_000001405.39   default={}    ('GCF_000001405.39', 'previous', 'GRCh38.p13', 'current:', 'GCF_000001405.40', 'paired:', 'GCA_000001405.28')
GCA_000001405.15   default={}    ('GCA_000001405.15', 'previous', 'GRCh38', 'current:', 'GCA_000001405.29', 'paired:', 'GCF_000001405.26')
GCF_000001405      default=found ('GCF_000001405.40', 'current', 'GRCh38.p14', 'current:', 'GCF_000001405.40', 'paired:', 'GCA_000001405.29')
GCA_000001405.40   default={}
notanaccession     default={}
34 revisions; [('GCF_000001405.40', 'GCA_000001405.29', 'GRCh38.p14'), ('GCF_000001405.39', 'GCA_000001405.28', 'GRCh38.p13'), ('GCF_000001405.38', 'GCA_000001405.27', 'GRCh38.p12')]
```

- **`GCA_000001405.15` is the GRCh38 that most alignment pipelines were built on**, and by
  default it returns `{}` as though it did not exist. Pass
  `filters.assembly_version=all_assemblies` (the helper does) and read `assembly_status`
  (`current`, `previous`, `suppressed`) and `current_accession`.
- **An unversioned accession silently means "the current version".** `GCF_000001405`
  answers as `.40`. Store the version you used; a rerun next year may get a different
  sequence set.
- **The download endpoints do serve old versions.** `download_summary` for
  `GCF_000001405.39` offers a 920 MB package. Only the reports hide them.
- **Suppressed is not replaced.** A `suppressed` record (for example the old RefSeq HuRef,
  `GCF_000002125.1`) has `current_accession` equal to itself: there is no successor to
  follow.

## RefSeq vs GenBank: join by sequence accession, never by rewriting the prefix

`GCF_000001405.40` is paired with `GCA_000001405.29`, not `GCA_000001405.40` (which does
not exist). The pair is in `paired_accession`; never construct it. And the two members of a
pair are different files:

```python
from ncbi_datasets import paged

f = paged("genome/accession/GCF_000001405.40/sequence_reports")
g = paged("genome/accession/GCA_000001405.29/sequence_reports")
print(len(f), len(g), "GenBank-only:", sorted({x["genbank_accession"] for x in g} -
                                              {x["genbank_accession"] for x in f}))
for x in f:
    if x["chr_name"] in ("1", "MT") and x["role"] == "assembled-molecule":
        print(x["chr_name"], x["refseq_accession"], x["genbank_accession"], x["ucsc_style_name"])

# the map to carry between a GCA-named file and a GCF-named one
gb_to_rs = {x["genbank_accession"]: x["refseq_accession"] for x in f}
print(gb_to_rs["CM000663.2"], gb_to_rs["J01415.2"])
```

```
705 709 GenBank-only: ['KI270721.1', 'KI270734.1', 'KI270752.1', 'KI270825.1']
1 NC_000001.11 CM000663.2 chr1
MT NC_012920.1 J01415.2 chrM
NC_000001.11 NC_012920.1
```

- **The same chromosome has three names**: `NC_000001.11` in GCF files, `CM000663.2` in GCA
  files, `chr1` in UCSC-style files (and `1` in Ensembl). A VCF or BED from one will not
  match a GFF from the other; nothing errors, the join simply comes back empty. Map with
  `sequence_reports` (fields `refseq_accession`, `genbank_accession`, `ucsc_style_name`,
  `chr_name`), keyed on the accession.
- **A pair need not hold the same sequences.** GRCh38's GCF drops four GenBank scaffolds
  (two judged contamination, two redundant); `assembly_info.paired_assembly.manual_diff`
  says so in prose and names their RefSeq copies (`KI270752.1/NT_187507.1`, for one). Those
  `NT_` records exist, but they are not part of `GCF_000001405.40`: they are missing from its
  sequence report, and the GCA report leaves their `refseq_accession` empty. So a join
  through the GCF sequence report finds nothing for them, which is the correct answer.
- **Protein ids differ too.** In *E. coli* K-12 MG1655 the GCF package's `protein.faa`
  starts `NP_414542.1` and the GCA package's starts `AAC73112.1`, for the same 4,300
  proteins over a byte-identical 4,641,652 bp chromosome (`NC_000913.3` vs `U00096.3`).
- A GenBank assembly may have no RefSeq partner (`paired_accession` absent, for example
  HuRef2.0 `GCA_059792245.1`), and RefSeq annotation exists only on the GCF side for many
  eukaryotes (`GCA_000001405.29` has no `annotation_info`).

## List the assemblies for an organism

`/genome/taxon/{taxon}/dataset_report` lists every current assembly under a taxon
(descendants included). Page it, and decide what you are counting:

```python
import collections
from ncbi_datasets import get, paged

one = get("genome/taxon/9606/dataset_report")
print("unpaged:", len(one["reports"]), "of", one["total_count"])
print("page_size=5000 ->", len(get("genome/taxon/9606/dataset_report", {"page_size": 5000})["reports"]))

reps = paged("genome/taxon/9606/dataset_report")
print("paged:", len(reps), collections.Counter(a["accession"][:3] for a in reps))
print("GCF status:", sorted((a["accession"], a["assembly_info"]["assembly_status"])
                            for a in reps if a["accession"].startswith("GCF")))
print("refseq filter:", get("genome/taxon/9606/dataset_report",
                            {"filters.assembly_source": "refseq"})["total_count"])
print("one per pair:", get("genome/taxon/9606/dataset_report",
                           {"filters.exclude_paired_reports": "true", "page_size": 1})["total_count"])
ref = get("genome/taxon/9606/dataset_report", {"filters.reference_only": "true"})["reports"]
print("reference:", [a["accession"] for a in ref])
```

```
unpaged: 20 of 2594
page_size=5000 -> 1000
paged: 2594 Counter({'GCA': 2589, 'GCF': 5})
GCF status: [('GCF_000001405.40', 'current'), ('GCF_000002125.1', 'suppressed'), ('GCF_000002135.2', 'suppressed'), ('GCF_000306695.2', 'suppressed'), ('GCF_009914755.1', 'current')]
refseq filter: 2
one per pair: 2589
reference: ['GCF_000001405.40']
```

- **2,594 is not the number of human genomes.** Paired assemblies are listed once per
  member, so GRCh38 and T2T-CHM13 each count twice. `filters.exclude_paired_reports=true`
  gives 2,589, which is also the `COUNT_TYPE_ASSEMBLY` figure on the taxonomy record.
- **The default listing includes suppressed RefSeq records** (three of the five `GCF_`
  here), while `filters.assembly_source=refseq` returns only the two current ones. Filter on
  `assembly_info.assembly_status == "current"` yourself rather than trusting a source filter
  to mean "RefSeq".
- `filters.reference_only=true` returns the RefSeq member of the reference pair only.
- A bad enum value (`filters.assembly_level=chromosomez`) is a proper `400` with a message;
  a bad taxon is `{}`.

## Resolve a taxon by id, not by name

Every genome and taxonomy endpoint accepts a name or a taxid. Names are ambiguous:

```python
import urllib.parse
from ncbi_datasets import get

def taxon(query):
    """Name or id -> exactly one taxid, or raise with the candidates."""
    nodes = get(f"taxonomy/taxon/{urllib.parse.quote(str(query))}")["taxonomy_nodes"]
    hits = [n["taxonomy"] for n in nodes if "taxonomy" in n]
    if not hits:
        raise LookupError(f"{query!r}: {nodes[0].get('errors')}")
    if len(hits) > 1:
        raise LookupError(f"{query!r} is ambiguous: "
                          f"{[(t['tax_id'], t['organism_name'], t['rank']) for t in hits]}")
    return hits[0]["tax_id"]

for q in ["human", "E. coli", "house mouse", "Morus", "notanorganism"]:
    try:
        print(f"{q:14}", taxon(q))
    except LookupError as e:
        print(f"{q:14} LookupError: {e}"[:160])

by_name = get("genome/taxon/Morus/dataset_report", {"page_size": 1})["total_count"]
plants = get("genome/taxon/3497/dataset_report", {"page_size": 1})["total_count"]
birds = get("genome/taxon/37577/dataset_report", {"page_size": 1})["total_count"]
print("genomes: by name", by_name, "| plant genus", plants, "| gannet genus", birds)

nodes = get("taxonomy/taxon/9606,10090")["taxonomy_nodes"]
print([(n["query"], n["taxonomy"]["tax_id"]) for n in nodes])
```

```
human          9606
E. coli        562
house mouse    10090
Morus          LookupError: 'Morus' is ambiguous: [(3497, 'Morus', 'GENUS'), (37577, 'Morus', 'GENUS')]
notanorganism  LookupError: 'notanorganism': [{'reason': 'The taxonomy name you specified (notanorganism) is not a recognized NCBI Taxonomy name.', 'invalid_ide
genomes: by name 9 | plant genus 9 | gannet genus 7
[(['10090'], 10090), (['9606'], 9606)]
```

- **`genome/taxon/Morus` silently takes the mulberry genus.** The seven gannet genomes
  vanish with no warning. Resolve to a taxid first and query by id.
- **Batch answers come back in their own order** (mouse before human above). Match each node
  by its `query` field, never by position.
- Species taxids include their subspecies: human 9606 has children 63221 (Neanderthal) and
  741158 (Denisovan). Bacterial and yeast genomes usually sit on a **strain** taxid (*E. coli*
  K-12 MG1655 is 511145, *S. cerevisiae* S288C is 559292), so a query on the species id
  finds them but `tax_exact_match=true` on the species does not: on 2026-11-19 *E. coli*
  (562) listed 506,523 assemblies, 493,175 with exact match, and the reference genome
  `GCF_000005845.2` is among the ones dropped. At 1,000 per page and 5 requests/s, paging
  all of *E. coli* is about 507 calls; narrow with filters before you page.
- `taxonomy/taxon/{id}/related_ids?ranks=SPECIES` lists descendant species ids;
  `taxonomy/taxon/{ids}/download` gives a zip with `taxonomy_report.jsonl` (lineage and
  classification). The JSONL in every package is **camelCase** (`taxId`, `assemblyInfo`)
  where the REST JSON is snake_case.

## The annotation as a table

`/genome/accession/{acc}/annotation_report` lists the annotated genes of one assembly, with
GeneID, locus tag, coordinates and protein accessions; `search_text` narrows it. It is the
assembly-side view; per-gene detail (transcripts, orthologs) belongs to `ncbi-gene`, keyed on
the `gene_id` this returns.

```python
import collections
from ncbi_datasets import get, paged

print(get("genome/accession/GCF_000005845.2/annotation_summary")["gene_types"])
genes = paged("genome/accession/GCF_000005845.2/annotation_report")
print(len(genes), collections.Counter(g["annotation"]["gene_type"] for g in genes).most_common(3))
hit = get("genome/accession/GCF_000005845.2/annotation_report", {"search_text": "lacZ"})["reports"]
a = hit[0]["annotation"]
print(a["symbol"], a["gene_id"], a["locus_tag"], a["genomic_regions"][0]["gene_range"]["range"][0],
      [p["accession_version"] for p in a.get("proteins", [])])
```

Observed 2026-11-19:

```
['ncRNA', 'other', 'protein-coding', 'pseudogene', 'rRNA', 'tRNA']
4651 [('protein-coding', 4290), ('pseudogene', 145), ('ncRNA', 107)]
lacZ 945006 b0344 {'begin': '363231', 'end': '366305', 'orientation': 'minus'} ['NP_414878.1']
```

Coordinates here are 1-based and inclusive, on the RefSeq sequence (`NC_000913.3`): a
GenBank-named file needs the sequence map above before these line up.

## Get the files

Two routes. The **Datasets package** for small and medium genomes, with a check that it
holds what you asked for; the **FTP directory** for large genomes, where a single
multi-gigabyte HTTP response is the wrong tool.

### A genome package

`include_annotation_type` takes `GENOME_FASTA`, `GENOME_GFF`, `GENOME_GTF`, `GENOME_GBFF`,
`RNA_FASTA`, `CDS_FASTA`, `PROT_FASTA`, `SEQUENCE_REPORT`. **An assembly with no annotation
returns HTTP 200 and a package with no GFF and no protein file**, so the function compares
the catalog against the request:

```python
import hashlib, json, pathlib, zipfile
from ncbi_datasets import get, assembly

FILETYPE = {"GENOME_FASTA": "GENOMIC_NUCLEOTIDE_FASTA", "GENOME_GFF": "GFF3",
            "GENOME_GTF": "GTF", "GENOME_GBFF": "GENBANK_FLAT_FILE", "RNA_FASTA": "RNA_NUCLEOTIDE_FASTA",
            "CDS_FASTA": "CDS_NUCLEOTIDE_FASTA", "PROT_FASTA": "PROTEIN_FASTA",
            "SEQUENCE_REPORT": "SEQUENCE_REPORT"}

def download_genome(accession, out_dir, include=("GENOME_FASTA", "GENOME_GFF", "PROT_FASTA",
                                                  "SEQUENCE_REPORT"), max_mb=2000):
    """Fetch one assembly package to out_dir. Returns {file_type: path}. Raises on any gap."""
    a = assembly(accession)
    if a is None:
        raise LookupError(f"{accession}: no such assembly (HTTP 200, empty report)")
    acc = a["accession"]                                    # versioned, even if you were not
    if a["assembly_info"]["assembly_status"] != "current":
        print(f"note: {acc} is {a['assembly_info']['assembly_status']}; "
              f"current is {a['current_accession']}")
    s = get(f"genome/accession/{acc}/download_summary", {"include_annotation_type": list(include)})
    mb = s.get("hydrated", {}).get("estimated_file_size_mb") or 0
    if mb > max_mb:
        raise ValueError(f"{acc}: ~{mb} MB; use the FTP route")
    out = pathlib.Path(out_dir) / acc
    out.mkdir(parents=True, exist_ok=True)
    zpath = out / f"{acc}.zip"
    zpath.write_bytes(get(f"genome/accession/{acc}/download",
                          {"include_annotation_type": list(include)}, raw=True, timeout=1800))
    with zipfile.ZipFile(zpath) as z:
        for line in z.read("md5sum.txt").decode().splitlines():
            md5, name = line.split(maxsplit=1)
            if hashlib.md5(z.read(name)).hexdigest() != md5:
                raise IOError(f"checksum mismatch in {name}")
        z.extractall(out)
    data = out / "ncbi_dataset" / "data"
    catalog = json.loads((data / "dataset_catalog.json").read_text())
    got = {f["fileType"]: data / f["filePath"]
           for blk in catalog["assemblies"] if blk.get("accession") == acc for f in blk["files"]}
    missing = [t for t in include if FILETYPE[t] not in got]
    if missing:
        raise IOError(f"{acc}: package lacks {missing}; annotation_info="
                      f"{bool(a.get('annotation_info'))}, paired={a.get('paired_accession')}")
    return got

files = download_genome("GCF_000005845", "genomes")
for t, p in sorted(files.items()):
    print(t, p.name, p.stat().st_size)
try:
    download_genome("GCA_059792245.1", "genomes", include=("GENOME_GFF",))
except (IOError, ValueError) as e:
    print(type(e).__name__, e)
```

```
GENOMIC_NUCLEOTIDE_FASTA GCF_000005845.2_ASM584v2_genomic.fna 4699745
GFF3 genomic.gff 2314238
PROTEIN_FASTA protein.faa 1750878
SEQUENCE_REPORT sequence_report.jsonl 311
OSError GCA_059792245.1: package lacks ['GENOME_GFF']; annotation_info=False, paired=None
```

The files land in `genomes/<accession>/ncbi_dataset/data/<accession>/`, with
`assembly_data_report.jsonl` (the camelCase report) beside them and the zip kept for its
`md5sum.txt`. The size guard runs on `download_summary`, which costs one small call:
GRCh38.p14 FASTA alone is estimated at 927 MB, GRCm39 with GFF at 837 MB, and bread wheat
(`GCA_018294505.1`) at 4,136 MB. Virus assemblies (SARS-CoV-2 `GCF_009858895.2`) return no
hydrated size estimate at all, which the guard treats as small.

### A large genome from the FTP tree

Every assembly has a directory under `https://ftp.ncbi.nlm.nih.gov/genomes/all/`, named
`GC[AF]/ddd/ddd/ddd/<accession>_<assembly name>/`. Get it from the `links` endpoint rather
than building it, then fetch with resumable transfers and check `md5checksums.txt`:

```bash
ACC=GCF_000001405.40
DIR=$(curl -s "https://api.ncbi.nlm.nih.gov/datasets/v2/genome/accession/$ACC/links" |
  python3 -c 'import json,sys; print(next(l["resource_link"] for l in json.load(sys.stdin)["assembly_links"] if l["assembly_link_type"]=="FTP_LINK"))')
echo "$DIR"
NAME=$(basename "$DIR")
mkdir -p "genomes/$NAME" && cd "genomes/$NAME"
curl -sS -O "${DIR}md5checksums.txt"
curl -sSI "${DIR}${NAME}_genomic.fna.gz" | tr -d '\r' | grep -iE '^(content-length|last-modified)'
# the transfer itself (~970 MB for the FASTA); -C - resumes an interrupted download
F="${NAME}_genomic.gtf.gz"
curl -sS -C - -O "${DIR}$F"
python3 - "$F" <<'PY'
import hashlib, sys
f = sys.argv[1]
want = next(l.split()[0] for l in open("md5checksums.txt") if l.split()[1] == f"./{f}")
h = hashlib.md5()
with open(f, "rb") as fh:
    for chunk in iter(lambda: fh.read(1 << 20), b""):
        h.update(chunk)
print(f, "OK" if h.hexdigest() == want else f"MISMATCH {h.hexdigest()} != {want}")
PY
```

```
https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/001/405/GCF_000001405.40_GRCh38.p14/
Last-Modified: Wed, 18 Nov 2026 14:00:47 GMT
Content-Length: 972898531
GCF_000001405.40_GRCh38.p14_genomic.gtf.gz OK
```

The block fetches the GTF (57 MB, and slow on a busy day) as the worked case; set `F` to `${NAME}_genomic.fna.gz`,
`_genomic.gff.gz` or `_protein.faa.gz` for the others. The directory also holds
`_assembly_report.txt`, the flat-file form of the sequence-name map above. Old versions
keep their own directories (`GCF_000001405.39_GRCh38.p13/` sits beside `.40`).

### The command-line tool

NCBI's `datasets` and `dataformat` binaries wrap the same API and handle very large
downloads with `--dehydrated` plus `rehydrate`. Each `download_summary` answer above carries
the matching command in `cli_download_command_line`. Install from
https://www.ncbi.nlm.nih.gov/datasets/docs/v2/command-line-tools/download-and-install/ or
conda-forge (`ncbi-datasets-cli`). Not executed for this skill:

```bash
datasets download genome accession GCF_000005845.2 --include genome,gff3,protein,seq-report \
  --filename ecoli.zip
datasets download genome accession GCF_000001405.40 --include genome --dehydrated --filename grch38.zip
unzip -q grch38.zip -d grch38 && datasets rehydrate --directory grch38
datasets summary genome taxon 9606 --as-json-lines |
  dataformat tsv genome --fields accession,assminfo-name,assminfo-status,assminfo-paired-assm-accession
```

The CLI calls the same API, so the `GCF_`/`GCA_` split and the rate limit apply to it too.
Its version default is not the REST one: per NCBI's `datasets summary genome` reference,
`--assembly-version current` (the default) returns "current assembly versions, plus previous
versions only if paired with a current version", and `--assembly-version all` adds every
previous version. None of this was tested here.

## What does not work (2026-11-19)

- **`annotation_report` and `annotation_summary` can fail transiently.** Both returned HTTP
  500 for every assembly tried during one session on 2026-11-19 and answered normally later
  the same day. The helper retries `500` three times; if it still fails, use the GFF3 from
  the package.
- **No error for anything that does not exist.** Unknown accession, unknown taxon name,
  prefix-swapped accession and old version without `all_assemblies` are all HTTP 200 `{}`.
  Check for the `reports` key, and compare what came back with what you sent.
- **`page_size` > 1000 is not an error** on taxon listings; it is 1000. Unpaged is 20 there.
- **Requesting annotation for an unannotated assembly is not an error**; the file is just
  absent from the zip.

## Try it

**Data.** NCBI Datasets records for GRCh38 (`GCF_000001405.40` / `GCA_000001405.29`, and the
original `GCA_000001405.15`), *E. coli* K-12 MG1655 (`GCF_000005845.2`), HuRef2.0
(`GCA_059792245.1`, GenBank-only, unannotated), and the taxa *Homo sapiens* and *Morus*.
All public, no account needed, confirmed reachable 2026-11-19. NCBI places no use
restrictions on this content.

**Run.** In a fresh directory with `ncbi_datasets.py` from above:

```python
import hashlib, io, json, zipfile
from ncbi_datasets import get, paged, assembly

# 1. versions: old GRCh38 hidden by default, found with all_assemblies, unversioned = current
assert assembly("GCA_000001405.15", all_versions=False) is None
old = assembly("GCA_000001405.15")
assert old["assembly_info"]["assembly_status"] == "previous" and old["assembly_info"]["assembly_name"] == "GRCh38"
cur = assembly("GCF_000001405")
assert cur["accession"].startswith("GCF_000001405.") and cur["assembly_info"]["assembly_status"] == "current"
assert assembly("notanaccession") is None
print("versions   :", old["accession"], "->", old["current_accession"], "| unversioned ->", cur["accession"])

# 2. GCF/GCA: the pair is read, never built, and the sequence names differ
pair = cur["paired_accession"]
assert pair.split(".")[1] != cur["accession"].split(".")[1]           # versions do not line up
f = paged(f"genome/accession/{cur['accession']}/sequence_reports")
g = paged(f"genome/accession/{pair}/sequence_reports")
chr1 = next(x for x in f if x["chr_name"] == "1" and x["role"] == "assembled-molecule")
assert chr1["refseq_accession"].startswith("NC_") and chr1["genbank_accession"].startswith("CM")
gb_only = {x["genbank_accession"] for x in g} - {x["genbank_accession"] for x in f}
assert all(not x.get("refseq_accession") for x in g if x["genbank_accession"] in gb_only)
print("pair       :", cur["accession"], pair, "| chr1", chr1["refseq_accession"], chr1["genbank_accession"],
      chr1["ucsc_style_name"], "| GenBank-only", len(gb_only), "| sequences", len(f), len(g))

# 3. paging: unpaged is 20, oversize is clamped, paged is complete
one = get("genome/taxon/9606/dataset_report")
assert len(one["reports"]) == 20 < one["total_count"]
assert len(get("genome/taxon/9606/dataset_report", {"page_size": 5000})["reports"]) == 1000
reps = paged("genome/taxon/9606/dataset_report")
assert len(reps) == one["total_count"] and len({a["accession"] for a in reps}) == len(reps)
unpaired = get("genome/taxon/9606/dataset_report",
               {"filters.exclude_paired_reports": "true", "page_size": 1})["total_count"]
assert unpaired < len(reps)
print("paging     :", len(reps), "records,", unpaired, "excluding pairs,",
      sum(a["assembly_info"]["assembly_status"] == "suppressed" for a in reps), "suppressed")

# 4. taxonomy: Morus is two genera; the name query takes one of them
morus = [n["taxonomy"]["tax_id"] for n in get("taxonomy/taxon/Morus")["taxonomy_nodes"]]
assert sorted(morus) == [3497, 37577]
n_name = get("genome/taxon/Morus/dataset_report", {"page_size": 1})["total_count"]
n_ids = [get(f"genome/taxon/{t}/dataset_report", {"page_size": 1})["total_count"] for t in (3497, 37577)]
assert n_name in n_ids and n_name < sum(n_ids)
print("taxonomy   : Morus ->", morus, "| by name", n_name, "| by id", n_ids)

# 5. a package: checksums hold, the GCF and GCA E. coli sequences are identical under two names
seqs = {}
for acc in ["GCF_000005845.2", "GCA_000005845.2"]:
    z = zipfile.ZipFile(io.BytesIO(get(f"genome/accession/{acc}/download",
                                       {"include_annotation_type": ["GENOME_FASTA"]}, raw=True)))
    for line in z.read("md5sum.txt").decode().splitlines():
        md5, name = line.split(maxsplit=1)
        assert hashlib.md5(z.read(name)).hexdigest() == md5, name
    fna = next(n for n in z.namelist() if n.endswith(".fna")).replace("\\", "/")
    text = z.read(fna).decode().split("\n")
    seqs[acc] = (text[0].split()[0][1:], hashlib.md5("".join(text[1:]).upper().encode()).hexdigest())
assert seqs["GCF_000005845.2"][0] != seqs["GCA_000005845.2"][0]
assert seqs["GCF_000005845.2"][1] == seqs["GCA_000005845.2"][1]
print("package    :", seqs)

# 6. an unannotated assembly: HTTP 200, no GFF in the zip
z = zipfile.ZipFile(io.BytesIO(get("genome/accession/GCA_059792245.1/download",
                                   {"include_annotation_type": ["GENOME_GFF"]}, raw=True)))
assert not any(n.endswith(".gff") for n in z.namelist()), z.namelist()
print("no-annot   : GCA_059792245.1 GFF requested ->", len(z.namelist()), "files, no genomic.gff")
```

**Expect.**

Invariants. These hold whatever NCBI rebuilds, so a failure means the skill is wrong:

- `GCA_000001405.15` (original GRCh38) is invisible without `all_assemblies` and `previous`
  with it. An unversioned accession resolves to a current, versioned one. An unknown
  accession is `None`, not an exception.
- The GRCh38 RefSeq/GenBank pair has different version numbers; chr1 is `NC_` on one side
  and `CM` on the other; every GenBank-only sequence has an empty `refseq_accession` in the
  GCA sequence report.
- An unpaged taxon listing returns 20 records; `page_size=5000` returns 1000; `paged` returns
  exactly `total_count` distinct accessions; excluding pairs gives fewer.
- `Morus` resolves to two taxids, and a genome query by the name returns one genus's count.
- Package checksums match; the *E. coli* GCF and GCA chromosomes have different names and
  identical sequence.
- Requesting a GFF for an unannotated assembly yields a package without one.

Observed 2026-11-19 (Datasets 18.41.1). These move with NCBI releases, so treat a mismatch as
drift to investigate:

```
versions   : GCA_000001405.15 -> GCA_000001405.29 | unversioned -> GCF_000001405.40
pair       : GCF_000001405.40 GCA_000001405.29 | chr1 NC_000001.11 CM000663.2 chr1 | GenBank-only 4 | sequences 705 709
paging     : 2594 records, 2589 excluding pairs, 3 suppressed
taxonomy   : Morus -> [3497, 37577] | by name 9 | by id [9, 7]
package    : {'GCF_000005845.2': ('NC_000913.3', '482a2b04485ec8c4b5f4eaba2c2002da'), 'GCA_000005845.2': ('U00096.3', '482a2b04485ec8c4b5f4eaba2c2002da')}
no-annot   : GCA_059792245.1 GFF requested -> 4 files, no genomic.gff
```

The method was also run on GRCm39 (`GCF_000001635.27`), *S. cerevisiae* R64
(`GCF_000146045.2`, strain taxid 559292), *Arabidopsis* TAIR10.1 (`GCF_000001735.4`),
SARS-CoV-2 (`GCF_009858895.2`, no size estimate), bread wheat (`GCA_018294505.1`, 4.1 GB,
annotation only on its GCF partner), suppressed RefSeq HuRef (`GCF_000002125.1`) and
T2T-CHM13 (`GCF_009914755.1`, paired with `GCA_009914755.4`). The `sequence_reports`
`total_count` mismatch (191 vs 705) came out of this pass and is why `paged` checks only for
a short answer.

## Sources

- NCBI Datasets v2 REST reference — https://www.ncbi.nlm.nih.gov/datasets/docs/v2/api/rest-api/
- OpenAPI specification — https://github.com/ncbi/datasets/blob/master/datasets.openapi.yaml
- Command-line tools — https://www.ncbi.nlm.nih.gov/datasets/docs/v2/command-line-tools/download-and-install/
- Genomes FTP — https://ftp.ncbi.nlm.nih.gov/genomes/all/
- NCBI data policies — https://www.ncbi.nlm.nih.gov/home/about/policies/
- O'Leary NA et al. (2024) Exploring and retrieving sequence and metadata for species across
  the tree of life with NCBI Datasets. *Scientific Data* 11, 732 —
  https://doi.org/10.1038/s41597-024-03571-y
