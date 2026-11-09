---
name: clinpgx
description: Pharmacogenomics from ClinPGx (formerly PharmGKB, now joined with CPIC) — turn diplotypes into CPIC phenotypes and every dosing recommendation they cover, pull clinical annotations by level of evidence, and download the current bulk files. Data is CC BY-SA 4.0 for research use; CPIC content is CC0.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, human-genetics, pharmacogenomics]
covers: [clinpgx, pharmgkb, cpic, pharmacogenomics, pharmacogenetics, pgx, diplotype, star allele, metabolizer phenotype, activity score, dosing guideline, drug-gene pair, clinical annotation, level of evidence, cyp2c19, cyp2d6, cyp2c9, cyp3a5, tpmt, nudt15, dpyd, slco1b1, ugt1a1, hla-b, vkorc1, clopidogrel, codeine, warfarin, tacrolimus, drug label]
papers: [PMID:34216021, PMID:22992668, PMID:21270786]
access: [open]
datasets: ["https://api.cpicpgx.org/v1/diplotype?genesymbol=eq.CYP2C19&diplotype=eq.*1/*2", "https://api.cpicpgx.org/v1/recommendation_view?drugname=eq.clopidogrel&select=population,classification,lookupkey", "https://api.clinpgx.org/v1/data/chemical?name=clopidogrel&view=min", "https://api.clinpgx.org/v1/report/stats", "https://s3.pgkb.org/data/summaryAnnotations.zip"]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-06
  against: CPIC database API (PostgREST 16.5) and ClinPGx API v1 live on 2026-11-06 / ClinPGx bulk files created 2026-11-05 / Python 3.12.2 standard library only / curl 8.7 / macOS arm64, no account
  executed: 5
  unverified: 0
---

# ClinPGx — pharmacogenomic evidence and CPIC dosing recommendations

ClinPGx is the Stanford-run resource that joined three pharmacogenomics projects under one
name:

- **PharmGKB**: curated gene–drug evidence. It holds clinical annotations graded by level
  of evidence, variant annotations from single papers, drug-label annotations and pathways.
- **CPIC**: peer-reviewed guidelines that turn a genotype into a prescribing action.
- **PharmCAT**: a tool that calls star-allele diplotypes from a VCF.

`cpicpgx.org` and `pharmgkb.org` now redirect into `clinpgx.org`. The CPIC database API
keeps its own host.

What a scientist usually needs is one of two answers. Either "for this genotype, what do
the guidelines say about these drugs?", which is CPIC, or "how good is the evidence that
this variant matters for this drug?", which is PharmGKB's levels of evidence. This skill
does both and ends with files on disk. It does not call diplotypes from sequencing data;
that is PharmCAT's job, and its output is the input here.

**What you need: no account and no key.** Both APIs are anonymous. **Send a User-Agent
header:** on 2026-11-06, `api.cpicpgx.org`, `api.clinpgx.org` and the download host
`s3.pgkb.org` all returned HTTP 403 to Python's default `Python-urllib` agent and 200 to
any descriptive one. curl's default agent was accepted. ClinPGx asks for **at most 2
requests per second** (429 if exceeded), and asks heavy users to tell them at
api@clinpgx.org. Its API page warns that parameters and responses may change before a
"final, stable" release.

**Not a clinical tool by itself.** Both projects say guidelines assist clinicians, are
limited in scope, and leave the decision to the clinician and patient. Treat a
recommendation as text to cite with its guideline, population and classification, never
as an instruction.

## Terms: two licenses, one of them share-alike

Read on 2026-11-06 from the Data Usage Policy (`api.clinpgx.org/v1/data/page/dataUsagePolicy`,
the source behind `clinpgx.org/page/dataUsagePolicy`) and from the `LICENSE.txt` inside every
download:

- **ClinPGx/PharmGKB data** (annotations, levels of evidence, variant annotations, labels,
  pathways) is **CC BY-SA 4.0**. Commercial organizations may use it. The obligations are:
  - **Attribution** to ClinPGx/PharmGKB, with a link to the license.
  - **Share-alike.** If you distribute something changed from it, distribute it under the
    same license. The download `LICENSE.txt` adds that recipients must first agree to that
    license, with proof available to ClinPGx.
  - **The policy's terms of use**, which by accessing the data you agree to: use it **for
    research purposes**, not offer any of it for sale as a commercial item, and accept that
    its accuracy is not guaranteed. "Research purposes" is not "non-commercial": industrial
    research is research. Reselling the data, or putting it behind a paywall, is what is
    excluded. If you are building a product on it, have counsel read those terms against CC
    BY-SA's own ban on adding restrictions.
- **CPIC guidelines and the CPIC database/API** are **CC0**, free of restriction. CPIC asks,
  without requiring it, for attribution that names ClinPGx as the primary source, cites the
  guideline, records the URL, access date and data version, and notes that content is
  updated. The CPIC name and logo may not be reused without permission.

So a table built from the CPIC API carries no obligations, while a table built from ClinPGx
annotations is CC BY-SA if you share it. The blocks below keep the two apart and copy
`LICENSE.txt` next to anything built from ClinPGx files.

This page is original text, CC-BY-4.0, by Heureka Labs.

## From genotype to CPIC recommendation

The CPIC API (`https://api.cpicpgx.org/v1/`) is PostgREST over the CPIC database. Filters are
`column=op.value` (`eq.`, `in.(a,b)`, `like.`, and for JSON columns `cs.` *contains* and `cd.`
*contained by*), and `select=` picks columns. The three tables that matter:

- `diplotype` maps a gene and diplotype to `generesult` (the phenotype), the activity score,
  and a **`lookupkey`**.
- `recommendation_view` holds one row per drug, phenotype combination and **population**,
  keyed by `lookupkey`.
- `pair_view` lists gene–drug pairs with CPIC level (A–D) and whether the gene is used for a
  recommendation.

```bash
CPIC=https://api.cpicpgx.org/v1
curl -s -G "$CPIC/diplotype" --data-urlencode "genesymbol=eq.CYP2C19" --data-urlencode "diplotype=eq.*1/*2" \
     --data-urlencode "select=diplotype,generesult,ehrpriority,lookupkey"
echo
curl -s -G "$CPIC/recommendation_view" --data-urlencode 'lookupkey=cd.{"CYP2C19":"Intermediate Metabolizer"}' \
     --data-urlencode "drugname=eq.clopidogrel" --data-urlencode "select=population,classification,drugrecommendation"
echo
```

On 2026-11-06 this printed the `*1/*2` row (`Intermediate Metabolizer`, lookup key
`{"CYP2C19" : "Intermediate Metabolizer"}`). Then came **three** clopidogrel
recommendations: `Strong` (avoid standard dose; use prasugrel or ticagrelor) for
cardiovascular ACS/PCI, `No Recommendation` for other cardiovascular indications, and
`Moderate` for neurovascular indications.

The traps, each seen on 2026-11-06:

- **Diplotype order matters.** `*1/*2` matches and `*2/*1` returns `[]`, with HTTP 200 and no
  error. Try both orders.
- **Activity-score genes look up by score.** CYP2D6 `*1/*4` is an Intermediate Metabolizer,
  but its lookup key is `{"CYP2D6": "1.0"}`, the activity score. The same holds for CYP2C9 and
  DPYD. Querying recommendations by phenotype name finds nothing for these genes. Always
  take the `lookupkey` from the `diplotype` row.
- **One phenotype, several recommendations.** Clopidogrel splits by indication. Others split
  by patient group (phenytoin "PHT naive" against "PHT use >3mos"). Taking the first row
  gives an arbitrary answer. Keep `population` with every recommendation.
- **Multi-gene drugs need every gene.** Phenytoin's rows are keyed on CYP2C9 *and* HLA-B.
  Use `cd.` (the recommendation's genes are contained in the patient's genotype) with the
  merged lookup keys of all genotyped genes. Then list drugs that need a gene you did not
  test, rather than silently dropping them.
- **Some guidelines have no lookup table.** Warfarin has CPIC level A pairs for CYP2C9, VKORC1
  and CYP4F2 but no rows in `recommendation_view`, because its guideline is a dosing
  algorithm. Report it as "read the guideline", not as "no recommendation".
- HLA genes are recorded as carrier states (`*15:02 negative`, `*57:01 positive`), not as
  diplotypes. DPYD diplotypes use variant names (`c.1905+1G>A (*2A)/Reference`).

The block below does all of that for a whole genotype. Input is a JSON object of gene to
diplotype. Output is `<stem>_recommendations.tsv`, every recommendation the genotype fully
covers, and `<stem>_summary.json`. The summary records how each diplotype was matched or
why it was not, the drugs needing another gene, and the guideline-only drugs.

```bash
cat > cpic_lookup.py <<'PY'
"""Diplotypes -> CPIC phenotypes -> every CPIC recommendation the genotype fully covers."""
import csv
import json
import sys
import time
import urllib.parse
import urllib.request

CPIC = "https://api.cpicpgx.org/v1"
UA = {"User-Agent": "cpic-lookup/1.0 (research script)"}   # the default Python agent gets HTTP 403


def get(table, **filters):
    time.sleep(0.2)
    url = f"{CPIC}/{table}?" + urllib.parse.urlencode(filters)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)


genotype = json.loads(sys.argv[1])          # {"CYP2C19": "*2/*1", "CYP2D6": "*1/*4", ...}
out_stem = sys.argv[2] if len(sys.argv) > 2 else "cpic"

calls, key = {}, {}
for gene, dip in genotype.items():
    rows = []
    for d in dict.fromkeys([dip, "/".join(reversed(dip.split("/")))]):   # the table stores one order
        rows = get("diplotype", genesymbol=f"eq.{gene}", diplotype=f"eq.{d}",
                   select="diplotype,generesult,totalactivityscore,ehrpriority,lookupkey")
        if rows:
            break
    if not rows:
        calls[gene] = {"input": dip, "status": "diplotype not in CPIC tables"}
        continue
    r = rows[0]
    calls[gene] = {"input": dip, "matched": r["diplotype"], "phenotype": r["generesult"],
                   "activity_score": r["totalactivityscore"], "lookup": r["lookupkey"][gene]}
    key.update(r["lookupkey"])

# Recommendations whose genes are all covered by this genotype ('contained by').
recs = get("recommendation_view", lookupkey=f"cd.{json.dumps(key)}",
           select="drugname,guidelinename,lookupkey,classification,drugrecommendation,population,guidelineurl")
# Drugs with a CPIC recommendation that also needs a gene you did not genotype.
pairs = get("pair_view", genesymbol=f"in.({','.join(key)})", usedforrecommendation="eq.Yes",
            select="drugname,genesymbol")
covered = {r["drugname"] for r in recs}
others = sorted({p["drugname"] for p in pairs} - covered)
needs, with_rows = {}, set()
for i in range(0, len(others), 40):
    for r in get("recommendation_view", drugname=f"in.({','.join(others[i:i + 40])})", select="drugname,lookupkey"):
        with_rows.add(r["drugname"])
        missing = sorted(set(r["lookupkey"]) - set(key))
        if missing:
            needs.setdefault(r["drugname"], set()).update(missing)
no_table = sorted(set(others) - with_rows)     # e.g. warfarin: a dosing algorithm, not a lookup table

with open(f"{out_stem}_recommendations.tsv", "w", newline="") as fh:
    w = csv.writer(fh, delimiter="\t")
    w.writerow(["drug", "population", "classification", "recommendation", "genes", "guideline_url"])
    for r in sorted(recs, key=lambda r: (r["drugname"], r["population"] or "")):
        w.writerow([r["drugname"], (r["population"] or "").strip(), r["classification"],
                    r["drugrecommendation"], ";".join(f"{g}={v}" for g, v in r["lookupkey"].items()),
                    r["guidelineurl"]])
summary = {"genotype": calls, "recommendations": len(recs), "drugs": len(covered),
           "drugs_needing_another_gene": {d: sorted(g) for d, g in sorted(needs.items())},
           "drugs_with_guideline_but_no_lookup_table": no_table,
           "source": "CPIC database API (CC0); see each guideline for context before use"}
with open(f"{out_stem}_summary.json", "w") as fh:
    json.dump(summary, fh, indent=2)
print(json.dumps(calls, indent=1))
print(f"{len(recs)} recommendations for {len(covered)} drugs; "
      f"{len(needs)} more drugs need another gene: {dict(list(summary['drugs_needing_another_gene'].items())[:4])}; "
      f"no lookup table, read the guideline: {no_table}")
PY
python3 cpic_lookup.py '{"CYP2C19": "*2/*1", "CYP2D6": "*1/*4", "CYP2C9": "*3/*3", "HLA-B": "*15:02 negative", "SLCO1B1": "*1/*99"}' patient1
awk -F'\t' '$1 == "clopidogrel"' patient1_recommendations.tsv | cut -f1-3
```

On 2026-11-06:

```
44 recommendations for 37 drugs; 3 more drugs need another gene: {'carbamazepine': ['HLA-A'], 'fluvastatin': ['SLCO1B1'], 'sertraline': ['CYP2B6']}; no lookup table, read the guideline: ['warfarin']
clopidogrel	CVI ACS PCI	Strong
clopidogrel	CVI non-ACS non-PCI	No Recommendation
clopidogrel	NVI	Moderate
```

The genotype printout above that line showed `*2/*1` matched as `*1/*2`. CYP2D6 and CYP2C9
were keyed by activity score (`1.0`, `0.0`). `SLCO1B1 *1/*99` came back as `diplotype not in
CPIC tables`, which is also why fluvastatin is listed as needing SLCO1B1. A second genotype
(TPMT `*3A/*1`, NUDT15 `*1/*1`, SLCO1B1 `*5/*1`, CYP3A5 `*3/*3`, UGT1A1 `*28/*28`, DPYD
`Reference/c.1905+1G>A (*2A)`) matched all six and gave 12 recommendations for 12 drugs,
among them azathioprine, capecitabine, fluorouracil, simvastatin and tacrolimus.

## Levels of evidence: PharmGKB clinical annotations

A clinical annotation summarizes all the published evidence for one variant or haplotype
and one drug, and ClinPGx grades it from a score built from that evidence:

| level | means |
|---|---|
| 1A, 1B | strongest. 1A is reserved for variant–drug pairs named in a clinical guideline or drug label |
| 2A, 2B | moderate. 2A is limited to very important pharmacogenes |
| 3 | a single study, little replication, or conflicting evidence |
| 4 | evidence against an association, or none supporting one |

The API calls them `summaryAnnotation`. **Most are level 3.** On 2026-11-06, ClinPGx-wide:
5,192 annotations, of which 1A 314, 1B 18, 2A 46, 2B 25, 3 4,479 and 4 310. A list of "PGx
variants for drug X" that does not filter on level is mostly single-study associations.

The ClinPGx API (`https://api.clinpgx.org/v1/`) behaves differently from CPIC's:

- Responses are `{"data": ..., "status": "success"}`.
- **An empty result is HTTP 404** with `"No results matching criteria."`, not an empty list.
- **A misspelled filter property is HTTP 400** (`No such property: 'relatedChemical'`). That
  is the safe kind of failure.
- Chemical names match exactly and are lower-case generics. `Clopidogrel` returns 404 and
  `clopidogrel` returns PA449053.
- `view=min`, `base` or `max` sets how much of each object comes back.

```bash
cat > clinpgx_annotations.py <<'PY'
"""ClinPGx clinical (summary) annotations for one drug, by level of evidence."""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter

API = "https://api.clinpgx.org/v1"
UA = {"User-Agent": "clinpgx-annotations/1.0 (research script)"}   # the default Python agent gets HTTP 403


def get(path, **params):
    time.sleep(0.5)                                   # ClinPGx asks for at most 2 requests per second
    url = f"{API}/{path}?" + urllib.parse.urlencode(params)
    for i in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return json.load(r)["data"]
        except urllib.error.HTTPError as e:
            body = json.loads(e.read() or b"{}")
            msg = "; ".join(x.get("message", "") for x in body.get("data", {}).get("errors", []))
            if e.code == 404 and "No results" in msg:
                return []                             # an empty answer is a 404, not an empty list
            if e.code == 429 and i < 3:
                time.sleep(5 * (i + 1))
                continue
            raise SystemExit(f"HTTP {e.code} for {url}: {msg}")


drug = sys.argv[1]
chem = get("data/chemical", name=drug, view="min")    # exact, case-sensitive name match
if not chem:
    raise SystemExit(f"no ClinPGx chemical named {drug!r}; names are lower-case generic names")
anns = get("data/summaryAnnotation", **{"relatedChemicals.accessionId": chem[0]["id"], "view": "base"})
levels = Counter(a["levelOfEvidence"]["term"] for a in anns)
print(f"{drug} = {chem[0]['id']}: {len(anns)} clinical annotations, levels {dict(sorted(levels.items()))}")
rows = []
for a in sorted(anns, key=lambda a: a["levelOfEvidence"]["term"]):
    genes = ",".join(g["symbol"] for g in a["location"].get("genes", []))
    rows.append({"id": a["accessionId"], "level": a["levelOfEvidence"]["term"], "genes": genes,
                 "variant": a["location"].get("displayName"), "types": a.get("types", []),
                 "score": a.get("score"), "name": a["name"],
                 "alleles": {p["allele"]: p["phenotype"] for p in a.get("allelePhenotypes", [])}})
with open(f"clinpgx_{drug}_annotations.json", "w") as fh:
    json.dump(rows, fh, indent=1)
for r in rows:
    if r["level"] in ("1A", "1B", "2A", "2B"):
        print(f"  {r['level']:3} {r['genes']:10} {r['variant'][:40]:40} {','.join(r['types'])}")
PY
python3 clinpgx_annotations.py clopidogrel
python3 clinpgx_annotations.py Clopidogrel
```

On 2026-11-06:

```
clopidogrel = PA449053: 51 clinical annotations, levels {'1A': 3, '2B': 2, '3': 40, '4': 6}
  1A  CYP2C19    CYP2C19*1, CYP2C19*2, CYP2C19*3, CYP2C19 Metabolism/PK
  1A  CYP2C19    CYP2C19*1, CYP2C19*2, CYP2C19*3, CYP2C19 Efficacy
  1A  CYP2C19    CYP2C19*1, CYP2C19*2, CYP2C19*3, CYP2C19 Efficacy,Toxicity
  2B  CES1       rs71647871                               Metabolism/PK
  2B  CES1       rs71647871                               Efficacy
no ClinPGx chemical named 'Clopidogrel'; names are lower-case generic names
```

The JSON file keeps every annotation, its score, and the per-allele or per-genotype
phenotype text (`allelePhenotypes`). That text is the curated statement of what carrying
each allele means for the drug. Other drugs tried: warfarin had 90 annotations (6 at 1A:
CYP2C9, VKORC1 and the intergenic rs12777823, which has no gene), codeine 12 (3 at 1A, all
CYP2D6), and tacrolimus 82 (1A on CYP3A5). The phenotype categories are Dosage, Efficacy,
Toxicity, Metabolism/PK and Other.

## Get the files

The CPIC and annotation blocks above write their tables to disk. For the whole knowledge
base, ClinPGx publishes zip files at `https://s3.pgkb.org/data/<name>.zip`, rebuilt regularly. The
ones read on 2026-11-06 were created 2026-11-05. Each holds TSVs, a `README.pdf`, `LICENSE.txt` and a `CREATED_<date>.txt` file.
Names seen on 2026-11-06: `summaryAnnotations`, `variantAnnotations`, `relationships`,
`drugLabels`, `guidelineAnnotations.json`, `clinicalVariants`, `genes`, `chemicals`,
`variants`, `phenotypes`, `pathways-tsv`, `occurrences`.

**Two files with the same content are not the same age.** `clinicalAnnotations.zip` is
still served, but it was frozen on 2025-07-05 when clinical annotations were renamed summary
annotations. The current file is `summaryAnnotations.zip`. The `CREATED_` file inside is the
only reliable date, so the block prints it:

```bash
mkdir -p clinpgx_data && cd clinpgx_data
for f in summaryAnnotations.zip clinicalAnnotations.zip; do
  curl -fsS -O "https://s3.pgkb.org/data/$f"
  unzip -o -q "$f" -d "${f%.zip}"
  echo "$f: $(ls ${f%.zip} | grep CREATED)"
done
cd ..
python3 - <<'PY'
import csv
from collections import Counter

src = "clinpgx_data/summaryAnnotations/summary_annotations.tsv"
with open(src, newline="", encoding="utf-8") as fh:
    rows = list(csv.DictReader(fh, delimiter="\t"))
print(len(rows), "summary annotations;", dict(sorted(Counter(r["Level of Evidence"] for r in rows).items())))
keep = [r for r in rows if r["Level of Evidence"] in {"1A", "1B", "2A", "2B"}]
with open("clinpgx_level1_2.tsv", "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]), delimiter="\t")
    w.writeheader()
    w.writerows(keep)
print(len(keep), "at level 1A-2B written to clinpgx_level1_2.tsv")
cyp = [r for r in keep if "CYP2C19" in r["Gene"].split(";")]       # genes and drugs are ;-separated
print("CYP2C19 drugs at 1A-2B:", sorted({d for r in cyp for d in r["Drug(s)"].split(";")})[:12])
PY
cp clinpgx_data/summaryAnnotations/LICENSE.txt clinpgx_LICENSE.txt
```

On 2026-11-06:

```
summaryAnnotations.zip: CREATED_2026-11-05.txt
clinicalAnnotations.zip: CREATED_2025-07-05.txt
5192 summary annotations; {'1A': 314, '1B': 18, '2A': 46, '2B': 25, '3': 4479, '4': 310}
403 at level 1A-2B written to clinpgx_level1_2.tsv
CYP2C19 drugs at 1A-2B: ['amitriptyline', 'citalopram', 'clobazam', 'clomipramine', 'clopidogrel', 'dexlansoprazole', 'doxepin', 'escitalopram', 'imipramine', 'lansoprazole', 'norclobazam', 'omeprazole']
```

`summary_annotations.tsv` has one row per annotation. The columns include `Variant/Haplotypes`,
`Gene`, `Level of Evidence`, `Score`, `Phenotype Category`, `Drug(s)`, `Phenotype(s)` and
`Specialty Population`. `summary_ann_alleles.tsv` holds the per-genotype text, and
`summary_ann_evidence.tsv` the supporting papers. **Multi-valued cells are separated by
`;`**, and `Drug(s)` mixes drugs with drug classes (`antidepressants`, `Ace Inhibitors,
Plain`, which has a comma inside a single entry). Split on `;` only. The derived TSV is CC BY-SA
4.0 like its source, which is why the block copies `LICENSE.txt` beside it.

## Try it

**Data.** The live CPIC API (CC0) and ClinPGx API (CC BY-SA 4.0, research use). Both are
anonymous. The block checks the User-Agent refusal, the diplotype-order trap, activity-score
lookup keys, one phenotype mapping to several recommendations, and the 404-for-empty
behavior. It prints results and writes nothing. Confirmed reachable on 2026-11-06. Python 3
standard library only.

**Run.** In an empty directory:

```bash
cat > clinpgx_check.py <<'PY'
import json, time, urllib.error, urllib.parse, urllib.request

CPIC, API = "https://api.cpicpgx.org/v1", "https://api.clinpgx.org/v1"
UA = {"User-Agent": "clinpgx-check/1.0 (research script)"}

def get(base, path, ua=True, **q):
    time.sleep(0.5)
    req = urllib.request.Request(f"{base}/{path}?" + urllib.parse.urlencode(q), headers=UA if ua else {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

# 1. Both hosts refuse Python's default User-Agent.
try:
    get(CPIC, "pair", ua=False, limit=1)
    raise AssertionError("expected HTTP 403 without a User-Agent")
except urllib.error.HTTPError as e:
    assert e.code == 403, e.code

# 2. CPIC stores each diplotype in one allele order only.
fwd = get(CPIC, "diplotype", genesymbol="eq.CYP2C19", diplotype="eq.*1/*2", select="generesult,lookupkey")
rev = get(CPIC, "diplotype", genesymbol="eq.CYP2C19", diplotype="eq.*2/*1", select="generesult,lookupkey")
assert rev == [] and fwd[0]["generesult"] == "Intermediate Metabolizer"

# 3. Activity-score genes are looked up by score, not by phenotype name.
d6 = get(CPIC, "diplotype", genesymbol="eq.CYP2D6", diplotype="eq.*1/*4", select="generesult,totalactivityscore,lookupkey")[0]
assert d6["lookupkey"]["CYP2D6"] == d6["totalactivityscore"] != d6["generesult"]

# 4. One phenotype, several recommendations: one per population.
recs = get(CPIC, "recommendation_view", lookupkey="cd." + json.dumps(fwd[0]["lookupkey"]),
           drugname="eq.clopidogrel", select="population,classification,lookupkey")
assert len(recs) > 1 and all(set(r["lookupkey"]) <= {"CYP2C19"} for r in recs)

# 5. ClinPGx: an empty result is HTTP 404, and most clinical annotations are level 3.
try:
    get(API, "data/chemical", name="Clopidogrel", view="min")       # names are lower case
    raise AssertionError("expected 404")
except urllib.error.HTTPError as e:
    assert e.code == 404
chem = get(API, "data/chemical", name="clopidogrel", view="min")["data"][0]
anns = get(API, "data/summaryAnnotation", **{"relatedChemicals.accessionId": chem["id"], "view": "base"})["data"]
top = [a for a in anns if a["levelOfEvidence"]["term"] == "1A"]
assert top and all(g["symbol"] == "CYP2C19" for a in top for g in a["location"]["genes"])
stats = get(API, "report/stats")

print(f"CYP2C19 *1/*2 -> {fwd[0]['generesult']}; *2/*1 -> {rev}")
print(f"CYP2D6 *1/*4 -> {d6['generesult']}, lookup key {d6['lookupkey']}")
print("clopidogrel, CYP2C19 IM:", [(r["population"].strip(), r["classification"]) for r in recs])
print(f"clopidogrel {chem['id']}: {len(anns)} clinical annotations, {len(top)} at level 1A (all CYP2C19); "
      f"ClinPGx-wide {stats['clinAnns']['count']} annotations, {stats['clinAnns3']['count']} at level 3")
PY
python3 clinpgx_check.py
```

**Expect.** Run cold on 2026-11-06, in about 6 seconds:

```
CYP2C19 *1/*2 -> Intermediate Metabolizer; *2/*1 -> []
CYP2D6 *1/*4 -> Intermediate Metabolizer, lookup key {'CYP2D6': '1.0'}
clopidogrel, CYP2C19 IM: [('CVI ACS PCI', 'Strong'), ('CVI non-ACS non-PCI', 'No Recommendation'), ('NVI', 'Moderate')]
clopidogrel PA449053: 51 clinical annotations, 3 at level 1A (all CYP2C19); ClinPGx-wide 5192 annotations, 4479 at level 3
```

*Invariants*, asserted, so a failure means the skill is wrong:

- A request without a User-Agent gets 403.
- The reversed diplotype returns nothing.
- CYP2D6's lookup key is its activity score, not its phenotype.
- Clopidogrel has more than one recommendation for one CYP2C19 phenotype, each keyed only on
  CYP2C19.
- A capitalized drug name is a 404.
- Clopidogrel's 1A annotations are all on CYP2C19.

*Observed values, 2026-11-06*. These move as guidelines and annotations are updated, so a
mismatch is drift:

- The three populations and their classifications.
- 51 clopidogrel annotations.
- 5,192 and 4,479 ClinPGx-wide.

## Sources

- ClinPGx — <https://www.clinpgx.org/>
- ClinPGx API and its OpenAPI description — <https://api.clinpgx.org/>
- CPIC database API — <https://api.cpicpgx.org/>
- Data Usage Policy — <https://www.clinpgx.org/page/dataUsagePolicy>
- CC BY-SA 4.0 — <https://creativecommons.org/licenses/by-sa/4.0/>
- Whirl-Carrillo M, et al. An evidence-based framework for evaluating pharmacogenomics
  knowledge for personalized medicine. *Clin Pharmacol Ther.* 2021;110(3):563–572. PMID 34216021
- Whirl-Carrillo M, et al. Pharmacogenomics knowledge for personalized medicine. *Clin
  Pharmacol Ther.* 2012;92(4):414–417. PMID 22992668
- Relling MV, Klein TE. CPIC: Clinical Pharmacogenetics Implementation Consortium of the
  Pharmacogenomics Research Network. *Clin Pharmacol Ther.* 2011;89(3):464–467. PMID 21270786
