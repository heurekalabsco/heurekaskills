---
name: clinvar
description: Look up variant classifications in NCBI ClinVar — E-utilities search with the field tags that actually filter, review-status stars, per-submitter calls behind an aggregate, and the weekly variant_summary file to annotate your own variant list or pull a gene. Germline, somatic and oncogenicity kept apart.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, human-genetics, variant-effect]
covers: [clinvar, ncbi, variant classification, clinical significance, pathogenic, likely pathogenic, benign, vus, uncertain significance, conflicting, review status, expert panel, acmg, germline, somatic, oncogenicity, brca1, mlh1, cftr, apoe, braf, rsid, vcf annotation, variant annotation, grch38, e-utilities, hereditary cancer, rare disease, genetic testing, missense]
papers: [PMID:39578691, PMID:29165669, PMID:26582918, PMID:24234437]
access: [open]
datasets: ["https://eutils.ncbi.nlm.nih.gov/entrez/eutils/einfo.fcgi?db=clinvar&retmode=json", "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=17677&retmode=json", "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=clinvar&id=17864&rettype=vcv&is_variationid=true", "https://ftp.ncbi.nlm.nih.gov/pub/clinvar/tab_delimited/variant_summary.txt.gz.md5", "https://ftp.ncbi.nlm.nih.gov/pub/clinvar/vcf_GRCh38/clinvar.vcf.gz.md5"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: ClinVar Entrez build Build261101-1245.1 (4,708,791 records) and the variant_summary.txt.gz of 2026-11-01 (md5 d7e0d7e581e220100fc84ca64fe953ba) / GRCh38 VCF of 2026-11-01 / Python 3.9.6 and 3.12.2 standard library only / curl 8.7 / macOS arm64, no API key
  executed: 7
  unverified: 0
---

# ClinVar — variant classifications and the evidence behind them

ClinVar is NCBI's public archive of what clinical laboratories, expert panels and
researchers have concluded about human genetic variants. Each submitter's conclusion is
kept as its own record, and ClinVar computes an aggregate per variant. About 4.7 million
variants were in it on 2026-11-01.

What a reader usually wants is a simple answer to "is this variant pathogenic?" ClinVar
holds something more specific: a set of claims, each with a submitter, a date, a condition
and a level of review, plus an aggregate computed by rules that favor some claims over
others. This skill reads the aggregate correctly, gets the claims behind it when they
matter, and ends with files on disk: a per-gene table, or your own variant list annotated.

**What you need: nothing.** The E-utilities API and the FTP site are anonymous. A free NCBI
API key is optional; it raises the rate limit from 3 to 10 requests per second (see below).

**Not for clinical decisions on its own.** ClinVar states that its content is not meant for
diagnosis or medical decisions without review by a genetics professional. A classification
is a submitter's assertion, not a validated result. Report it with its review status and
date, never as a bare label.

## Terms of use

ClinVar is covered by NCBI's general data policy. NCBI puts no restrictions of its own on
using or redistributing the data, so commercial use is fine. Two caveats from that policy:
some submitters may claim rights in what they submitted, and NCBI does not judge those
claims. ClinVar asks that anyone who copies or redistributes its data cite ClinVar as the
source. The usual citation is the 2018 database paper (PMID 29165669), and the 2025 paper
(PMID 39578691) describes the somatic classifications. Cite the release date too. The data
changes weekly. (NCBI's documentation pages put a browser check in front of scripted
clients, so the policy was confirmed on 2026-11-06 from NCBI's published data-usage
statement as quoted by downstream projects, not fetched directly. Read
<https://www.ncbi.nlm.nih.gov/home/about/policies/> in a browser if the exact wording
matters to you.)

This page is original text, CC-BY-4.0, by Heureka Labs.

## The data model in five lines

- **VCV** (`VCV000017677`): one variant, or one haplotype or genotype. Its number is the
  **VariationID**, and the esummary UID is that same number.
- **RCV** (`RCV000019246`): one variant paired with one condition. A variant has many.
- **SCV** (`SCV000212010`): one submitter's classification. This is the primary evidence.
- **AlleleID**: a separate number for the allele itself. The tab-delimited files are keyed
  on it. Don't mix it up with the VariationID; on BRCA1 c.5266dup they are 17677 and 32716.
- **Three classification types, never to be pooled.** *Germline* (Pathogenic … Benign, the
  ACMG/AMP scale), *somatic clinical impact* (AMP/ASCO/CAP tiers, `Tier I - Strong` …) and
  *oncogenicity* (`Oncogenic` … `Benign`). BRAF V600E (VCV000013961) shows why. On
  2026-11-06 its germline aggregate was *Conflicting classifications of pathogenicity*,
  while its somatic impact was *Tier I - Strong* and its oncogenicity *Oncogenic*. Taking
  the germline column for a tumor question gives exactly the wrong answer.

## Review status and stars

Every aggregate has a review status. The ClinVar web pages show it as stars, and only the
stars say how much the aggregate is worth:

| review status | stars |
|---|---|
| practice guideline | 4 |
| reviewed by expert panel | 3 |
| criteria provided, multiple submitters, no conflicts | 2 |
| criteria provided, conflicting classifications | 1 |
| criteria provided, single submitter | 1 |
| no assertion criteria provided | 0 |
| no classification provided / no classification for the single variant / no classifications from unflagged records | 0 |

Counts across GRCh38 rows of the 2026-11-01 file: single submitter 3,303,135; multiple
submitters 766,045; no status (`-`, mostly variants with no germline call) 244,654;
conflicting 183,309; no assertion criteria 111,292; expert panel 22,853; practice guideline
54. **Most of ClinVar is one lab's opinion.** A two-star floor is a common choice for
analysis. Say which floor you used.

**The aggregate is not a vote.** When an expert panel or practice guideline has spoken, its
call becomes the aggregate and the other submissions stop counting. On BRCA1 c.5266dup, 1
of 101 SCVs contributes to the aggregate. The other 96 *Pathogenic* calls are kept but not
counted. Without such a panel, submissions with assertion criteria outrank those without.
`ClinSigSimple` in the tab file ignores all of this (see below).

## E-utilities: searching ClinVar

Base: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`, with `db=clinvar`. `esearch` turns a
query into IDs (or a history-server handle), `esummary` returns JSON summaries, and
`efetch` returns the full XML record. **Rate limit: 3 requests per second without a key, 10
with one.** Going over returns HTTP 429. To use a key, create an NCBI account, generate the
key under account settings, and `export NCBI_API_KEY=...`. NCBI also asks scripts to send
`tool` and `email` parameters.

The query fields that matter, checked against `einfo` on 2026-11-06:

| want | write |
|---|---|
| a gene | `BRCA1[gene]` |
| only variants inside one gene (drops large CNVs) | `AND "single gene"[prop]` |
| aggregate germline Pathogenic (includes Pathogenic/Likely pathogenic) | `clinsig_pathogenic[prop]` |
| aggregate Likely pathogenic (also includes P/LP) | `clinsig_likely_pathogenic[prop]` |
| aggregate VUS | `clinsig_vus[prop]` |
| a review status | `"reviewed by expert panel"[RVST]` |
| a VariationID / an rsID | `17677[VID]` / `80357906[VRID]` or `rs80357906` |
| allele origin | `"germline"[ORIG]` |
| a condition | `"Lynch syndrome"[DIS]` |

The `clinsig_` properties filter the **germline aggregate only**. On 2026-11-06,
`13961[VID] AND clinsig_pathogenic[prop]` returned 0 for BRAF V600E. For somatic and
oncogenicity calls, use the tab file or the VCV XML.

**Entrez fails in two opposite, silent ways.**

- **An unknown field tag** becomes `[All Fields]`, a free-text match. On 2026-11-06,
  `BRCA1[gene] AND "pathogenic"[Germline classification]` returned 14,329 records, against
  4,393 for the correct `clinsig_pathogenic[prop]`. The only sign is the
  `querytranslation` in the response.
- **An unknown property** (`clinsig_conflicting[prop]`) returns **0** and lists the term
  under `errorlist.phrasesnotfound`. That looks exactly like "no such variants".

HGVS typed as free text is split into words, so `NM_007294.4(BRCA1):c.5266dup` matched 10
records. Search by rsID or VariationID, or by position against the tab file. `BRCA1[gene]`
also matches multi-gene CNVs: 16,166 records against 14,132 with `"single gene"[prop]`.

This helper refuses both silent failures, keeps under the rate limit, and pages through
the history server. Later blocks import it, so run them from the same directory:

```bash
cat > clinvar_eutils.py <<'PY'
"""ClinVar through NCBI E-utilities: search, page through the history server, summarize."""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
API_KEY = os.environ.get("NCBI_API_KEY")          # optional; raises the limit from 3 to 10 requests/s
EMAIL = os.environ.get("NCBI_EMAIL", "")
PAUSE = 0.11 if API_KEY else 0.34
_last = [0.0]


def call(tool, **params):
    params = {**params, "db": "clinvar", "retmode": "json", "tool": "clinvar-skill"}
    if EMAIL:
        params["email"] = EMAIL
    if API_KEY:
        params["api_key"] = API_KEY
    body = urllib.parse.urlencode(params).encode()
    for attempt in range(5):
        wait = PAUSE - (time.time() - _last[0])
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        try:
            req = urllib.request.Request(f"{EUTILS}/{tool}.fcgi", data=body)   # POST: no URL length limit
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503) or attempt == 4:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 4:
                raise
        time.sleep(2 * (attempt + 1))


def search(term):
    """Count, translation and a history-server handle for an Entrez query. Fails on an ignored field."""
    r = call("esearch", term=term, usehistory="y", retmax=0)["esearchresult"]
    if "ERROR" in r:
        raise SystemExit(f"esearch error: {r['ERROR']}")
    missing = (r.get("errorlist") or {}).get("phrasesnotfound") or []
    fields = (r.get("errorlist") or {}).get("fieldsnotfound") or []
    if missing or fields:
        raise SystemExit(f"query terms not understood: {missing + fields}; translation was {r.get('querytranslation')}")
    if "[All Fields]" in r.get("querytranslation", "") and "[All Fields]" not in term:
        raise SystemExit(f"a field tag was not recognised and became [All Fields]: {r['querytranslation']}")
    return int(r["count"]), r["querytranslation"], r["webenv"], r["querykey"]


def summaries(term, max_records=20000, batch=500):
    """Every esummary record for a query, paged off the history server."""
    count, translation, webenv, key = search(term)
    if count > max_records:
        raise SystemExit(f"refusing: {count:,} records for {translation!r}, over max_records {max_records:,}")
    out = []
    for start in range(0, count, batch):
        res = call("esummary", WebEnv=webenv, query_key=key, retstart=start, retmax=batch)["result"]
        out += [res[u] for u in res["uids"]]
    if len(out) != count:
        raise SystemExit(f"received {len(out)} summaries, esearch reported {count}")
    return out
PY
python3 -c "
from clinvar_eutils import search
for t in ['BRCA1[gene] AND \"pathogenic\"[Germline classification]', 'BRCA1[gene] AND clinsig_conflicting[prop]']:
    try:
        search(t)
    except SystemExit as e:
        print(e)
"
```

Printed on 2026-11-06:

```
a field tag was not recognised and became [All Fields]: BRCA1[gene] AND "pathogenic"[All Fields]
query terms not understood: ['clinsig_conflicting[prop]']; translation was BRCA1[gene] AND clinsig_conflicting[prop]
```

### Pathogenic and likely pathogenic variants in a gene, with stars

```python
from collections import Counter
from clinvar_eutils import summaries

STARS = {"practice guideline": 4, "reviewed by expert panel": 3,
         "criteria provided, multiple submitters, no conflicts": 2,
         "criteria provided, conflicting classifications": 1,
         "criteria provided, single submitter": 1}

term = '(clinsig_pathogenic[prop] OR clinsig_likely_pathogenic[prop]) AND MLH1[gene] AND "single gene"[prop]'
recs = summaries(term)
rows = []
for r in recs:
    g = r["germline_classification"]
    loc = next((l for l in r["variation_set"][0]["variation_loc"] if l["assembly_name"] == "GRCh38"), {})
    rows.append((r["accession"], r["title"], g["description"], g["review_status"],
                 STARS.get(g["review_status"], 0), loc.get("chr"), loc.get("start")))
print(len(rows), "records")
print(Counter(x[2] for x in rows))
print("stars:", dict(sorted(Counter(x[4] for x in rows).items(), reverse=True)))
print(rows[0])
```

On 2026-11-06 this took about 20 seconds without a key and printed:

```
2082 records
Counter({'Pathogenic': 1559, 'Likely pathogenic': 357, 'Pathogenic/Likely pathogenic': 166})
stars: {3: 593, 2: 521, 1: 912, 0: 56}
```

Then one tuple per record, in the order esearch returned them. Points from the summary
JSON that bite:

- **`variation_set[0]["variation_loc"]` is a list, one entry per assembly.** Pick GRCh38
  by `assembly_name` rather than by index. A haplotype has several `variation_set` entries.
- **An empty classification is not `null`.** `clinical_impact_classification` and
  `oncogenicity_classification` are always present. When there is no call, `description` is
  `""` and `last_evaluated` is the sentinel `1/01/01 00:00`. Test the description.
- `germline_classification.last_evaluated` is the newest evaluation date among the
  contributing submissions. It says nothing about the other submissions.
- `supporting_submissions.scv` lists every SCV, counted or not.

### The submissions behind one aggregate

When the aggregate is *Conflicting*, or rests on one submitter, or is old, read the SCVs.
`efetch` with `rettype=vcv&is_variationid=true` returns the full VCV XML. In it, each
`ClinicalAssertion` carries `ContributesToAggregateClassification`:

```bash
cat > clinvar_scvs.py <<'PY'
import sys
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter

VID = sys.argv[1]
URL = ("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
       f"?db=clinvar&id={VID}&rettype=vcv&is_variationid=true&tool=clinvar-skill")
with urllib.request.urlopen(URL, timeout=120) as r:
    root = ET.fromstring(r.read())
va = root.find("VariationArchive")
if va is None:
    raise SystemExit(f"no VariationArchive for VariationID {VID}")
print(va.get("Accession"), "v" + va.get("Version"), va.get("VariationName"))
KINDS = ("GermlineClassification", "SomaticClinicalImpact", "OncogenicityClassification")
for kind in KINDS:
    agg = va.find(f"./ClassifiedRecord/Classifications/{kind}")
    if agg is not None:
        print(f"  aggregate {kind}: {agg.findtext('Description')} ({agg.findtext('ReviewStatus')})")

tally = Counter()
for ca in va.iter("ClinicalAssertion"):
    acc, cls = ca.find("ClinVarAccession"), ca.find("Classification")
    kind, call = next(((c.tag, c.text) for c in cls if c.tag in KINDS), ("", None))
    counted = ca.get("ContributesToAggregateClassification") == "true"
    tally[(kind, (call or "").lower(), counted)] += 1
    print(f"  {acc.get('Accession')}  {call!s:24} {cls.findtext('ReviewStatus')!s:38} "
          f"{cls.get('DateLastEvaluated') or '-':10}  counted={counted!s:5}  {acc.get('SubmitterName')[:40]}")
print("by (type, call, counted):")
for k, n in tally.most_common():
    print(f"  {n:4d}  {k}")
PY
python3 clinvar_scvs.py 17864 | tail -9
python3 clinvar_scvs.py 17677 | tail -6
```

On 2026-11-06, APOE c.388T>C (the ε4 allele, VCV000017864) had 19 SCVs and a germline aggregate
of *Conflicting classifications of pathogenicity; other; risk factor*. BRCA1 c.5266dup
showed the expert-panel effect:

```
by (type, call, counted):
    96  ('GermlineClassification', 'pathogenic', False)
     2  ('GermlineClassification', 'not provided', False)
     1  ('GermlineClassification', 'pathogenic', True)
     1  ('GermlineClassification', 'risk factor', False)
     1  ('GermlineClassification', 'uncertain significance', False)
```

Submitters spell terms inconsistently (`Pathogenic`, `pathogenic`), which is why the tally
lower-cases them. A VariationID that does not exist returns an empty result set, and the
script says so rather than printing nothing. The XML for a heavily submitted variant runs
to several hundred kilobytes. Fetch one record at a time, and keep under the rate limit.

## Get the files

### variant_summary.txt.gz — one row per variant per assembly

Use the weekly tab file, not the API, for a whole gene, a whole panel, or any join against
your own data. It is about 460 MB compressed. It is regenerated weekly, usually on Mondays,
and archived monthly. Download it, check it against its published md5, and resume if
interrupted:

```bash
BASE=https://ftp.ncbi.nlm.nih.gov/pub/clinvar/tab_delimited
FILE=variant_summary.txt.gz                    # about 460 MB, replaced every week
curl -fsS -O "$BASE/$FILE.md5"
want=$(awk '{print $1}' "$FILE.md5")
have=$( (md5sum "$FILE" 2>/dev/null || md5 -r "$FILE" 2>/dev/null) | awk '{print $1}')
if [ "$have" != "$want" ]; then
  curl -fS -C - -O "$BASE/$FILE" || { rm -f "$FILE"; curl -fS -O "$BASE/$FILE"; }
  have=$( (md5sum "$FILE" 2>/dev/null || md5 -r "$FILE") | awk '{print $1}')
fi
[ "$have" = "$want" ] && echo "$FILE OK ($want)" || { echo "checksum mismatch: delete $FILE and rerun" >&2; exit 1; }
gzip -dc "$FILE" | head -1 | tr '\t' '\n' | head -3
```

Prints `variant_summary.txt.gz OK (<md5>)`, then `#AlleleID`, `Type`, `Name`. A partial file
from an earlier run is resumed. If the file was replaced upstream between the two runs,
the checksum fails and the message says to start over. For a reproducible analysis, take a
dated copy from `tab_delimited/archive/` instead.

What the README does not warn you about, all seen in the 2026-11-01 file:

- **The first column header is `#AlleleID`**, with the hash. A naive reader names it that.
- **Every variant appears once per assembly.** 9,345,867 rows: GRCh37 4,692,274, GRCh38
  4,639,270, plus NCBI36 and `na`. Filter on `Assembly` before counting anything.
- **Pseudoautosomal variants appear twice on GRCh38**, once on X and once on Y, with the
  same VariationID (2,417 of them). Deduplicate on VariationID.
- **`GeneSymbol` is separated by `;`**, although the README says comma. Large CNVs read
  `subset of 54 genes: BRCA1:...`.
- **`ReferenceAllele`/`AlternateAllele` are `na`** on almost every GRCh38 row. Use
  `PositionVCF`, `ReferenceAlleleVCF` and `AlternateAlleleVCF`. Those are left-normalized,
  as VCF expects. 20,623 GRCh38 rows have `PositionVCF` of `-1`, mostly CNVs with no VCF
  representation.
- **`ClinicalSignificance` is the germline aggregate. `ClinSigSimple` is not a summary of
  it.** `ClinSigSimple` is 1 if *any* current submission says P, LP, risk allele or similar,
  regardless of assertion criteria. THBD c.1688dup (VariationID 12716) reads *Uncertain
  significance* with `ClinSigSimple` 1. Filter on `ClinicalSignificance` and `ReviewStatus`.
- `ClinicalSignificance` holds more than the five ACMG terms: `drug response`, `risk
  factor`, `Affects`, combinations such as `Pathogenic; other`, and the newer `VUS-high`
  and `VUS-mid`. `-` means no germline call. That is usually a somatic-only record, or an
  "included" variant known only as part of a haplotype (`ClinSigSimple` -1).
- Somatic calls are in `SomaticClinicalImpact` and `Oncogenicity`, each with its own review
  status column.

### A per-gene table

Run in the directory holding `variant_summary.txt.gz`. This writes
`clinvar_<GENE>_GRCh38.tsv`, with stars added, and a `.summary.json` that records what was
counted and what was left out. It takes about 40 seconds and needs only the standard
library:

```bash
cat > clinvar_gene.py <<'PY'
import csv
import gzip
import json
import sys
from collections import Counter

GENE, ASSEMBLY = sys.argv[1], "GRCh38"
STARS = {"practice guideline": 4, "reviewed by expert panel": 3,
         "criteria provided, multiple submitters, no conflicts": 2,
         "criteria provided, conflicting classifications": 1,
         "criteria provided, single submitter": 1}
KEEP = ["VariationID", "AlleleID", "Name", "Type", "GeneSymbol", "ClinicalSignificance",
        "ClinSigSimple", "ReviewStatus", "NumberSubmitters", "LastEvaluated", "RS# (dbSNP)",
        "Chromosome", "PositionVCF", "ReferenceAlleleVCF", "AlternateAlleleVCF", "OriginSimple",
        "Oncogenicity", "SomaticClinicalImpact", "PhenotypeList", "RCVaccession"]

rows, multi, large_cnv, seen = [], 0, 0, set()
with gzip.open("variant_summary.txt.gz", "rt", newline="") as fh:
    rd = csv.reader(fh, delimiter="\t")
    header = next(rd)
    header[0] = header[0].lstrip("#")                 # '#AlleleID'
    col = {n: i for i, n in enumerate(header)}
    for r in rd:
        if r[col["Assembly"]] != ASSEMBLY:
            continue
        genes = r[col["GeneSymbol"]].split(";")
        if GENE not in genes:
            # large CNVs read 'subset of 54 genes: BRCA1:...' and are left out of a per-gene table
            large_cnv += any(GENE in g.split(": ", 1)[-1].split(":") for g in genes if g.startswith("subset of"))
            continue
        if r[col["VariationID"]] in seen:              # pseudoautosomal variants appear on X and Y
            continue
        seen.add(r[col["VariationID"]])
        multi += len(genes) > 1
        row = {k: r[col[k]] for k in KEEP}
        row["stars"] = STARS.get(row["ReviewStatus"], 0)
        rows.append(row)

with open(f"clinvar_{GENE}_{ASSEMBLY}.tsv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=KEEP + ["stars"], delimiter="\t")
    w.writeheader()
    w.writerows(rows)
plp = [r for r in rows if r["ClinicalSignificance"] in
       ("Pathogenic", "Likely pathogenic", "Pathogenic/Likely pathogenic")]
summary = {"gene": GENE, "assembly": ASSEMBLY, "source": "ClinVar variant_summary.txt.gz",
           "variants": len(rows), "spanning_more_than_one_gene": multi,
           "large_cnvs_left_out": large_cnv,
           "germline_classification": dict(Counter(r["ClinicalSignificance"] for r in rows).most_common(12)),
           "plp_by_stars": dict(sorted(Counter(r["stars"] for r in plp).items(), reverse=True))}
with open(f"clinvar_{GENE}_{ASSEMBLY}.summary.json", "w") as fh:
    json.dump(summary, fh, indent=2)
print(json.dumps(summary, indent=2))
PY
python3 clinvar_gene.py BRCA1
```

On the 2026-11-01 file, BRCA1 gave 15,639 variants. 9 more spanned two genes and were kept. 7
large CNVs were left out. Germline aggregates: Pathogenic 3,803, Conflicting 2,932, Likely
benign 2,929, Uncertain significance 2,557, no germline call 2,008, Benign 734. The
P/LP set by stars: 3★ 2,286, 2★ 607, 1★ 1,261, 0★ 176. A third of BRCA1's records
are *Conflicting*, which says something about the gene, not about any one variant in it.

### Annotate your own variants

Put your variants in a TSV with columns `chrom pos ref alt`, on **GRCh38** and
**left-normalized** (run `bcftools norm -f GRCh38.fa` on a VCF first). A `chr` prefix is
fine. The script strips it, because ClinVar writes `17`, not `chr17`. Every input row comes
back, either matched or marked `not in ClinVar`:

```bash
printf "chrom\tpos\tref\talt\nchr17\t43057062\tT\tTG\nchr7\t117559590\tATCT\tA\nchr19\t44908684\tT\tC\nchrX\t1288857\tG\tA\nchr17\t43057062\tT\tA\nchr1\t1000000\tA\tT\n" > my_variants.tsv
cat > clinvar_annotate.py <<'PY'
import csv
import gzip
import sys

ASSEMBLY = "GRCh38"
STARS = {"practice guideline": 4, "reviewed by expert panel": 3,
         "criteria provided, multiple submitters, no conflicts": 2,
         "criteria provided, conflicting classifications": 1,
         "criteria provided, single submitter": 1}


def key(chrom, pos, ref, alt):
    chrom = chrom[3:] if chrom.lower().startswith("chr") else chrom
    return ("MT" if chrom == "M" else chrom, str(int(pos)), ref.upper(), alt.upper())


with open(sys.argv[1]) as fh:
    wanted = [key(r["chrom"], r["pos"], r["ref"], r["alt"]) for r in csv.DictReader(fh, delimiter="\t")]
want = set(wanted)
hits = {}
with gzip.open("variant_summary.txt.gz", "rt", newline="") as fh:
    rd = csv.reader(fh, delimiter="\t")
    header = next(rd)
    header[0] = header[0].lstrip("#")
    col = {n: i for i, n in enumerate(header)}
    for r in rd:
        if r[col["Assembly"]] != ASSEMBLY or r[col["PositionVCF"]] == "-1":
            continue
        k = key(r[col["Chromosome"]], r[col["PositionVCF"]], r[col["ReferenceAlleleVCF"]], r[col["AlternateAlleleVCF"]])
        if k in want:
            hits.setdefault(k, []).append(r)

out = csv.writer(sys.stdout, delimiter="\t")
fields = ["VariationID", "GeneSymbol", "ClinicalSignificance", "ReviewStatus", "NumberSubmitters",
          "LastEvaluated", "Oncogenicity", "SomaticClinicalImpact", "PhenotypeList", "Name"]
out.writerow(["chrom", "pos", "ref", "alt", "stars"] + fields)
for k in wanted:
    for r in hits.get(k) or [None]:
        if r is None:
            out.writerow([*k, "", "not in ClinVar"] + [""] * (len(fields) - 1))
        else:
            out.writerow([*k, STARS.get(r[col["ReviewStatus"]], 0)] + [r[col[f]] for f in fields])
PY
python3 clinvar_annotate.py my_variants.tsv > my_variants.clinvar.tsv
cut -f1-8 my_variants.clinvar.tsv
```

On the 2026-11-01 file, about 40 seconds:

```
chrom	pos	ref	alt	stars	VariationID	GeneSymbol	ClinicalSignificance
17	43057062	T	TG	3	17677	BRCA1	Pathogenic
7	117559590	ATCT	A	4	7105	CFTR	Pathogenic
19	44908684	T	C	1	17864	APOE	Conflicting classifications of pathogenicity; other; risk factor
X	1288857	G	A	1	1009889	CSF2RA	Uncertain significance
17	43057062	T	A	0	865219	BRCA1	-
1	1000000	A	T		not in ClinVar
```

Note the fifth row. A different allele at the same position is a different record, and it
has no germline call of its own: it is in ClinVar only as part of a haplotype. **Matching
on position alone would have handed it the pathogenic call of its neighbor.** Match on all
four fields. *Not in ClinVar* means no one has submitted the variant. It is not evidence
that the variant is benign.

### The VCF

`vcf_GRCh38/clinvar.vcf.gz` (192 MB, with `.md5` and `.tbi`) carries the same aggregates as
INFO fields: `CLNSIG`, `CLNREVSTAT`, `CLNSIGCONF`, `ONC`/`ONCREVSTAT`, `SCI`/`SCIREVSTAT`,
`GENEINFO`, `RS`. The ID column is the VariationID. Values use underscores for spaces
(`criteria_provided,_single_submitter`), and chromosomes have no `chr` prefix. Rename the
contigs before using it with a `chr`-style reference. `clinvar.vcf.error.txt` lists records
that could not be written. The tab file above is easier to filter in plain Python. The VCF is
the right input for `bcftools annotate` over a sample VCF.

## Try it

**Data.** The live ClinVar E-utilities endpoint. It is anonymous, needs no key, and is open
to commercial use under NCBI's data policy. The block checks the two silent query failures,
pages a 501-record expert-panel set for MLH1 through the history server, and reads one
known record (BRCA1 c.5266dup, VCV000017677). It prints counts and writes nothing.
Confirmed reachable on 2026-11-06. Python 3 standard library only.

**Run.** In an empty directory:

```bash
cat > clinvar_check.py <<'PY'
import json, time, urllib.parse, urllib.request
from collections import Counter

E = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

def call(tool, **p):
    time.sleep(0.34)                                   # 3 requests per second without an API key
    body = urllib.parse.urlencode({**p, "db": "clinvar", "retmode": "json", "tool": "clinvar-check"}).encode()
    with urllib.request.urlopen(urllib.request.Request(f"{E}/{tool}.fcgi", data=body), timeout=120) as r:
        return json.load(r)

info = call("einfo")["einforesult"]["dbinfo"][0]

# 1. A field tag Entrez does not know is not an error: it silently becomes [All Fields].
bad = call("esearch", term='MLH1[gene] AND "pathogenic"[Germline classification]', retmax=0)["esearchresult"]
assert "[All Fields]" in bad["querytranslation"], bad["querytranslation"]
# ...and an unknown property returns zero hits, which reads like "no such variants".
nil = call("esearch", term="MLH1[gene] AND clinsig_conflicting[prop]", retmax=0)["esearchresult"]
assert nil["count"] == "0" and nil["errorlist"]["phrasesnotfound"], nil

# 2. The real filter, paged off the history server in batches of 500.
term = 'MLH1[gene] AND clinsig_pathogenic[prop] AND "reviewed by expert panel"[RVST]'
s = call("esearch", term=term, usehistory="y", retmax=0)["esearchresult"]
count = int(s["count"])
recs = []
for start in range(0, count, 500):
    res = call("esummary", WebEnv=s["webenv"], query_key=s["querykey"], retstart=start, retmax=500)["result"]
    recs += [res[u] for u in res["uids"]]
assert len(recs) == count == len({r["uid"] for r in recs})
assert count > 500                                     # so the paging was exercised
germ = Counter(r["germline_classification"]["description"] for r in recs)
assert set(germ) <= {"Pathogenic", "Pathogenic/Likely pathogenic"}, germ
assert {r["germline_classification"]["review_status"] for r in recs} == {"reviewed by expert panel"}

# 3. One record by VariationID: the esummary UID is the VariationID.
r = call("esummary", id="17677")["result"]["17677"]
assert r["accession"] == "VCV000017677"
loc = {l["assembly_name"]: l for l in r["variation_set"][0]["variation_loc"]}
empty = r["clinical_impact_classification"]
assert empty["description"] == "" and empty["last_evaluated"].startswith("1/01/01")   # 'no value' sentinel

print(f"ClinVar {info['dbbuild']} (updated {info['lastupdate']}): {int(info['count']):,} records")
print(f"ignored field became: {bad['querytranslation']} -> {int(bad['count']):,} hits")
print(f"{term}: {count} records, {dict(germ)}")
print(f"{r['accession_version']} {r['title']}: {r['germline_classification']['description']} "
      f"({r['germline_classification']['review_status']}); GRCh38 chr{loc['GRCh38']['chr']}:{loc['GRCh38']['start']}, "
      f"GRCh37 chr{loc['GRCh37']['chr']}:{loc['GRCh37']['start']}; {len(r['supporting_submissions']['scv'])} SCVs")
PY
python3 clinvar_check.py
```

**Expect.** Run cold on 2026-11-06, in about 10 seconds:

```
ClinVar Build261101-1245.1 (updated 2026/11/01 16:09): 4,708,791 records
ignored field became: MLH1[gene] AND "pathogenic"[All Fields] -> 3,756 hits
MLH1[gene] AND clinsig_pathogenic[prop] AND "reviewed by expert panel"[RVST]: 501 records, {'Pathogenic': 501}
VCV000017677.176 NM_007294.4(BRCA1):c.5266dup (p.Gln1756fs): Pathogenic (reviewed by expert panel); GRCh38 chr17:43057062, GRCh37 chr17:41209079; 101 SCVs
```

*Invariants*, asserted, so a failure means the skill is wrong:

- An unknown field tag is rewritten to `[All Fields]`.
- An unknown property returns zero hits and is listed in `phrasesnotfound`.
- History-server paging returns every record exactly once, matching the count.
- `clinsig_pathogenic[prop]` returns only Pathogenic or Pathogenic/Likely pathogenic
  germline aggregates.
- The esummary UID is the VariationID.
- An absent classification is an empty description with the `1/01/01` date.

*Observed values, 2026-11-06*. These move weekly, so a mismatch is drift to investigate:

- 4,708,791 records.
- 3,756 hits for the misspelled query.
- 501 expert-panel pathogenic MLH1 records.
- VCV version 176.
- 101 SCVs.

The other blocks were also run on BRCA1, MLH1 and CSF2RA, a pseudoautosomal gene, through
the per-gene table. The annotator was run on BRCA1, CFTR, APOE, THBD and CSF2RA variants
plus an absent one. The SCV reader was run on APOE, BRCA1 and BRAF.

## Sources

- ClinVar — <https://www.ncbi.nlm.nih.gov/clinvar/>
- FTP site and README files (`README.txt`, `tab_delimited/README`, `README_VCF.txt`) —
  <https://ftp.ncbi.nlm.nih.gov/pub/clinvar/>
- E-utilities documentation — <https://www.ncbi.nlm.nih.gov/books/NBK25499/>
- Review status and stars — <https://www.ncbi.nlm.nih.gov/clinvar/docs/review_status/>
- NCBI website and data usage policies — <https://www.ncbi.nlm.nih.gov/home/about/policies/>
- Landrum MJ, et al. ClinVar: improving access to variant interpretations and supporting
  evidence. *Nucleic Acids Res.* 2018;46(D1):D1062–D1067. PMID 29165669
- Landrum MJ, et al. ClinVar: updates to support classifications of both germline and
  somatic variants. *Nucleic Acids Res.* 2025;53(D1):D1313–D1321. PMID 39578691
