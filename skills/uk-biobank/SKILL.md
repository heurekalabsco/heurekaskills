---
name: uk-biobank
description: Search UK Biobank's openly published field catalogue — 11,821 variables in 410 categories with participant counts, units, the instanced/arrayed shape that decides how many columns a field becomes, and the 172 retired fields the website hides but the download still carries — and report what an access application requires, applications being paused as of August 2026. Never fetches participant data.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.1.0
tags: [uk-biobank, cohort, epidemiology, controlled-access, public-data]
covers: [uk biobank, biobank, cohort, nmr metabolomics, plasma proteomics, olink, ukb-ppp, gwas, imaging, brain mri, cardiac mri, abdominal mri, liver fat, dxa, accelerometer, spirometry, blood biochemistry, whole exome sequencing, whole genome sequencing, polygenic risk score, icd10, hospital inpatient records, cancer registry, death registry, type 2 diabetes, dementia, coronary artery disease, breast cancer, aging, data dictionary]
papers: [PMID:25826379, PMID:30305743, PMID:32457287, PMID:34662886, PMID:36737450, PMID:37794186, PMID:38057571]
access: [open, controlled]
datasets: [https://biobank.ndph.ox.ac.uk/showcase/scdown.cgi?fmt=txt&id=1]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-18
  against: Showcase schema 1 (field catalogue) max version 2025-09-20, 11,821 fields, 4,164,390 bytes / schema 3 (categories) 410 rows / schema 9 (instancing) 12 rows / coding 143 (Olink assays) 2,923 rows / shape arithmetic checked against the Showcase's own declared Instances, Array, Participants and Item count on 19 fields (23400 41270 30069 40000 40006 4079 6138 3166 30098 189 22201 33 1020204 2020204 30900 41001 21015 4229 5990) plus absent id 99999999 / retired-vs-listed checked against label.cgi on all 22 categories holding a retired field / Access Procedures v2.1 July 2022 PDF / fees and apply-for-access pages read 2026-08-18 in a browser, both Cloudflare-blocked to plain HTTP clients / Python 3.12.8, standard library only / curl 8.7.1
  executed: 7
  unverified: 0
---
# UK Biobank field catalogue

UK Biobank followed ~500,000 UK adults recruited 2006–2010, and has kept adding to
them: biochemistry, NMR metabolomics, Olink proteomics, exomes, genomes, imaging,
accelerometry, and linked hospital, cancer and death records.

**The whole data dictionary is an open download. No account, no application.** That
answers the question researchers actually ask *before* applying — *is what I need even
in there, and on how many people?* — in seconds rather than an afternoon of clicking a
web interface.

**This skill never touches participant data, and cannot get you any.** It reads the
catalogue: field names, units, categories, participant counts, dates, and the structural
metadata that says how a field is shaped. Individual-level values are controlled and
require an approved application, a signed material transfer agreement, and a fee — see
*Requesting access*, which describes that route and does not promise it.

## Read this before you plan a study

Two facts settle most triage questions, and both cut the opposite way from the usual
controlled-access resource:

- **Consent is broad, not disease-specific.** The Access Procedures state the resource
  is available to all bona fide researchers "for all types of health-related research
  that is in the public interest", with no preferential or exclusive access. There is no
  per-study consent restriction to check the way there is on a disease-specific cohort.
  What binds instead is *health-related* and *public interest*.
- **You do not need your own ethics approval for a data application.** UK Biobank is
  registered as a Research Tissue Bank and its clearance covers data and sample
  applications; the Access Procedures say separate REC or other ethical clearance "is not
  required nor needed". Re-contact applications are the exception and do need their own.

So the binding constraint here is usually not consent. It is whether the measurement
exists at a useful sample size — which is exactly what the catalogue answers for free.

## Downloading the catalogue

One CGI endpoint serves every schema table as TSV. Schema 1 is the field catalogue.

```bash
curl -sS "https://biobank.ndph.ox.ac.uk/showcase/scdown.cgi?fmt=txt&id=1" -o primary.tsv
curl -sS "https://biobank.ctsu.ox.ac.uk/crystal/scdown.cgi?fmt=txt&id=1" -o mirror.tsv
wc -c primary.tsv mirror.tsv
shasum -a 256 primary.tsv mirror.tsv
cut -f1,2,13,24 primary.tsv | head -3
```

Printed 2026-08-18:

```
 4164390 primary.tsv
 4164390 mirror.tsv
 8328780 total
2d7b5f394457002a5a41e278074d64c3b56811f4c50fd916599145aa10210cc6  primary.tsv
2d7b5f394457002a5a41e278074d64c3b56811f4c50fd916599145aa10210cc6  mirror.tsv
field_id	title	units	num_participants
3	Verbal interview duration	seconds	501109
4	Biometrics duration	seconds	497769
```

Same bytes, same digest, so the `crystal` mirror is a drop-in fallback when the primary
is down. A third path, `biobank.ndph.ox.ac.uk/ukb/scdown.cgi`, served the same file.

**`scdown.cgi` answers HTTP 200 with an HTML error page** when it does not recognise the
table id — `Content-Type: text/html`, body "Sorry, internal error prevents download of
schema". Fed to a TSV parser that trusts the status code, it yields ~40 rows whose sole
column is named `<!DOCTYPE HTML>`, with no exception raised. `codown.cgi` behaves the same
way. Every loader below checks the first bytes rather than the status.

The tables worth knowing, all at `scdown.cgi?fmt=txt&id=<n>`:

| id | table | rows on 2026-08-18 | why you want it |
|---|---|---|---|
| 1 | data field properties | 11,821 | the catalogue itself |
| 3 | categories | 410 | `main_category` is an integer — this names it |
| 9 | instancing dictionaries | 12 | what an instance index *means* for a field |
| 2 | encoding dictionaries | 858 | which coding a categorical field uses |
| 13 | category browse tree | 362 | parent/child, for walking a category subtree |

Individual codings come from a different script, `codown.cgi?id=<encoding_id>`, and the
full index of schema tables is listed at `showcase/schema.cgi`.

## The 29 columns, and the code tables

Schema 1's header is:

```
field_id title availability stability private value_type base_type item_type strata
instanced arrayed sexed units main_category encoding_id instance_id instance_min
instance_max array_min array_max notes debut version num_participants item_count
showcase_order cost_do cost_on cost_sc
```

Almost everything interesting is an integer code. The mappings **are** published, but
only as prose on `https://biobank.ndph.ox.ac.uk/showcase/schema.cgi?id=1` — there is no
machine-readable download of them, so hardcode the table and re-read that page when a
code you have never seen appears:

| column | codes |
|---|---|
| `availability` | 0 full · 1 view-only · 4 retired |
| `stability` | 0 complete · 1 updateable · 2 accruing · 3 variable |
| `private` | 0 public · 1 restricted |
| `value_type` | 11 integer · 21 categorical single · 22 categorical multiple · 31 continuous · 41 text · 51 date · 61 time · 101 compound · 201 blob |
| `base_type` | 0 see value type · 11 integer · 31 real · 41 string · 51 date |
| `item_type` | 0 data · 10 sample · 20 bulk · 30 record |
| `strata` | 0 primary · 2 auxiliary · 3 derived |
| `instanced` | 0 no · 1 defined · 2 variable |
| `arrayed` | 0 no · 1 yes |
| `sexed` | 0 unisex · 1 male · 2 female |

Three of those need more than a lookup:

**`value_type` is the shape of one value.** On the 2026-08-18 snapshot: 4,951 continuous,
3,698 categorical-single, 1,345 date, 1,008 integer, 533 text, 171 categorical-multiple,
85 time, 30 compound. No `201 blob` field existed, though the code is documented.

**`base_type` is only meaningful for categorical fields**, which the data proves rather
than the documentation. Cross-tabulating the two columns, `base_type` is `0` for every
one of the 7,952 non-categorical fields, and non-zero for exactly the 3,869 categorical
ones — 3,818 coded as integers and 51 as strings (single choice splits 3,664 integer /
34 string, multiple choice 154 / 17). So for a categorical field, `base_type` tells you
whether the codes behind the labels are integers or strings, which is what you need to
join against the coding in schema 2. For anything else it carries no information.

**`item_type` tells you whether the field is even a column in your extract**, and this
is the one that quietly breaks analysis plans. `0 data` (11,271 fields) lands in the
tabular dataset. `20 bulk` (424) is a separate per-participant file download — DICOMs,
VCFs, accelerometer records. `30 record` (112) lives in a Data Portal record table, not
in the tabular extract at all. `10 sample` (14) refers to physical material. A plan that
assumes every field is a column will mis-size 550 of them.

The last three columns are fee tiers, and only one of them is populated. `cost_do` is
`0` for all 11,821 fields. `cost_on` — the tier for analysis on the Research Analysis
Platform — is `1` for 11,266 fields, `2` for 413, `3` for 141, and `0` for exactly one,
field `33` Date of birth. The showcase page renders those as `o1`/`o2`/`o3` and the lone
zero as `oX`, so treat `0` as *no tier stated*, not as tier zero — mapping it to an
integer tier is how a one-field hole becomes a wrong fee. The rest tracks the published
three-tier fee structure: the 141 tier-3 fields are exome and whole-genome sequencing and
their QC metrics, and tier 2 is dominated by imaging-derived measures, polygenic risk
scores and cardiac monitoring. So the open catalogue tells you which fee tier your
shortlist sits in before you ask.
`cost_sc` renders as `s<N>` (and as `sX` when it is `0`), and **its definition is not
published in the schema documentation** — that page still documents a single `tier`
column where the file now has three. Do not infer a meaning for `cost_sc`; report the
raw value.

## Searching and grouping — the triage layer

Match on title *and* category name, group by category, lead with the participant count,
and **carry `availability`**. Grouping matters because a title search alone scatters
related fields, and the category is often where the useful name lives. Carrying
availability matters for the reason in the next section: the download contains 172
retired fields that the Showcase website does not show you.

```python
import csv, io, re, urllib.request
from collections import defaultdict

SHOWCASE = "https://biobank.ndph.ox.ac.uk/showcase"

def load(sid, encoding):
    raw = urllib.request.urlopen(f"{SHOWCASE}/scdown.cgi?fmt=txt&id={sid}", timeout=300).read()
    # scdown.cgi answers HTTP 200 with an HTML error page for an unknown table id.
    if raw.lstrip()[:9].lower().startswith(b"<!doctype"):
        raise SystemExit(f"schema {sid}: server returned HTML, not TSV — check the table id")
    return list(csv.DictReader(io.StringIO(raw.decode(encoding)),
                              delimiter="\t", quoting=csv.QUOTE_NONE))

fields = load(1, "utf-8")     # data-field properties
cats   = load(3, "cp1252")    # category id -> title
cat_name = {c["category_id"]: c["title"] for c in cats}
MARK = {"4": " RETIRED", "1": " view-only"}   # availability; "0" is full

def triage(query, min_n=0):
    """Fields whose title or category matches `query`, grouped by category, reporting the
    participant count that decides whether the study is powered — and whether the field is
    still live. Retired fields stay in the download but vanish from the Showcase website."""
    pat = re.compile(query, re.I)
    groups = defaultdict(list)
    for f in fields:
        cname = cat_name.get(f["main_category"], f"[{f['main_category']} unknown]")
        if pat.search(f["title"]) or pat.search(cname):
            n = int(f["num_participants"])
            if n >= min_n:                      # -1 and 0 fall out at min_n=1
                groups[(f["main_category"], cname)].append(
                    (f["field_id"], f["title"], n, f["availability"]))
    print(f"query {query!r}  min_n={min_n}")
    for (cid, cname), hits in sorted(groups.items(), key=lambda kv: -max(h[2] for h in kv[1])):
        ns = [h[2] for h in hits]
        dead = sum(1 for h in hits if h[3] == "4")
        print(f"  cat {cid:>6}  {cname[:38]:38} {len(hits):>4} fields  "
              f"n {min(ns):,}-{max(ns):,}" + (f"  [{dead} retired]" if dead else ""))
        for fid, title, n, avail in sorted(hits, key=lambda h: -h[2])[:3]:
            print(f"            {fid:>8}  {title[:44]:44} n={n:,}{MARK.get(avail, '')}")

triage(r"\bliver\b", min_n=10000)
print()
triage(r"liver iron|townsend")
```

Printed 2026-08-18:

```
query '\\bliver\\b'  min_n=10000
  cat   1039  Food (and other) preferences              1 fields  n 181,941-181,941
               20686  Liking for liver                             n=181,941
  cat    126  Liver MRI                                 7 fields  n 10,094-94,790
               20204  Liver Imaging - T1 ShMoLLI - DICOM           n=94,790
               20254  Liver imaging - IDEAL protocol - DICOM       n=86,699
               40063  Acquisition protocol                         n=41,641
  cat    149  Abdominal composition                     1 fields  n 47,036-47,036
               24352  FR liver PDFF mean                           n=47,036
  cat    158  Abdominal organ composition               5 fields  n 10,069-38,967
               21080  Liver volume                                 n=38,967
               21088  Liver PDFF (fat fraction)                    n=30,736
               21089  Liver iron                                   n=30,736
  cat   2411  Digestive system disorders                2 fields  n 17,707-17,707
              131670  Date K76 first reported (other diseases of l n=17,707
              131671  Source of report of K76 (other diseases of l n=17,707
  cat   1000  [1000 unknown]                            2 fields  n 15,112-15,116
             1020254  EMBARGOED UNLINKED : Liver imaging - IDEAL p n=15,116
             1020204  EMBARGOED UNLINKED : Liver Imaging - T1 ShMo n=15,112

query 'liver iron|townsend'  min_n=0
  cat 100094  Baseline characteristics                  2 fields  n 501,315-501,315  [1 retired]
                 189  Townsend deprivation index at recruitment    n=501,315 RETIRED
               22189  Townsend deprivation index at recruitment    n=501,315
  cat    126  Liver MRI                                 4 fields  n 1,110-40,354  [2 retired]
               40060  Liver iron (Fe)                              n=40,354
               40062  Liver iron corrected T1 (ct1)                n=34,291
               22417  Liver iron corrected T1 (ct1)                n=2,812 RETIRED
  cat    158  Abdominal organ composition               2 fields  n 10,069-30,736
               21089  Liver iron                                   n=30,736
               21093  Liver iron (Fe) - gradient echo              n=10,069
```

The first output is the whole point of the skill, and it also shows why you cannot rank by
`num_participants` alone: the largest hit is a food-preference questionnaire item. The
real answer — quantitative liver fat on ~30,700 people, liver volume on ~39,000, raw
imaging on ~95,000 — is three lines down. Read the titles.

The `[1000 unknown]` group is the orphan-category trap arriving unannounced: a
`main_category` that schema 3 does not define, so an inner join would have deleted those
two rows silently. All 126 fields in it are bulk items marked `private = 1`, so their
presence in a hit list is not the same as their being available. They split exactly in
half — **63 titled `EMBARGOED UNLINKED :` and 63 `EMBARGOED LINKED :`** — and that word is
the whole question for an imaging file, because it says whether the file can be joined to
a participant at all. Do not read the prefix off one of them and generalise.

## Retired fields are in the download and not on the website

This is the trap that survives a careless search, because nothing in the field's own
numbers looks wrong. `availability = 4` marks 172 fields as **retired**. They are still in
schema 1, with full titles, full participant counts and a live `field.cgi` page that says
"Field is currently retired" — but **the Showcase's category pages do not list them at
all**. So a shortlist built from the download does not match the website, and the
difference is silent.

The second `triage` output above is the counter-example. `189` and `22189` are both titled
`Townsend deprivation index at recruitment`, both report n=501,315, and `189` is retired.
Nothing but `availability` separates them. Eleven retired fields carry the exact title of a
live replacement, and three of those differ by an order of magnitude in n:

| retired | n | current | n | title |
|---|---|---|---|---|
| `22400` | 1,110 | `40060` | 40,354 | Liver iron (Fe) |
| `22402` | 4,609 | `40061` | 40,746 | Proton density fat fraction (PDFF) |
| `22417` | 2,812 | `40062` | 34,291 | Liver iron corrected T1 (ct1) |
| `189` | 501,315 | `22189` | 501,315 | Townsend deprivation index at recruitment |

Whole categories can be dead. Category `2000` "Hospital inpatient" holds 36 fields in
schema 1, with `num_participants` up to 413,163 — and **all 36 are retired, so its
Showcase page lists none of them**. A query on `hospital inpatient|episodes containing`
returns 86 fields of which 86 are retired. Categories `2002`–`2005` are largely the same
story: the summary-diagnosis and summary-operation fields were superseded by the
first-occurrence and record-level tables.

The ground truth is one HTTP request away, and it is worth making once for any category
you plan to build on: `label.cgi?id=<category_id>` lists the live fields, so
`fields in schema 1 − retired == fields the page lists`. It holds on all 22 categories that
contain a retired field. Category `126` Liver MRI is the compact case — 11 fields in the
download, 7 on the page, difference exactly the 4 retired ones.

Note how easily this hides. The `\bliver\b` search above uses `min_n=10000`, and all four
retired Liver MRI fields have n below 10,000, so they never appear. A threshold chosen for
a good reason silently suppressed the evidence.

Two more columns are easy to skip for the same kind of reason. `private = 1` (319 fields,
including `33` Date of birth and parents' months of birth) marks fields carrying
disclosure risk, not fields you can simply request. `availability = 1` (54 fields,
including per-chromosome genotype probabilities) is *view-only* — documented on the
showcase, not handed out. Filter on all three before you build a shortlist.

Two habits that make this reliable. Search the **category name** as well as the title,
because UK Biobank names the assay at the category level and the analyte at the field
level. And set `min_n` deliberately: the imaging sub-cohort is tens of thousands, not
half a million, so a `min_n` tuned to the full cohort silently hides every imaging field.

## `instanced` and `arrayed` — the part that trips people

These two columns are why UK Biobank fields are hard to reason about, and they are
independent of each other.

**`instanced`** means the field was captured more than once per participant, indexed by
an *instance*. The index does **not** universally mean "visit":

- `instanced = 0` (4,605 fields) — captured once, almost always at instance `0`. Two
  exceptions carry `instance_min = instance_max = 3`: `41000` and `41001`, the COVID-19
  re-imaging fields. Read the index off `instance_min`, not off the `instanced` flag —
  `field.cgi` calls both of them "Singular" and does not print an index at all.
- `instanced = 1` (7,198 fields) — a *defined* instancing scheme. `instance_id` points
  into schema 9, which says what the instances are. `instance_id = 2` is the common one:
  initial assessment centre plus later repeat visits.
- `instanced = 2` (18 fields) — *variable*. The index has no fixed meaning across
  participants. Field `40000` (Date of death) uses `instance_id 9000001`, "Death registry
  reports": instance 0 and 1 are two registry reports, not two visits. Treating a
  variable instance as a timepoint is a real analysis error, and it is only 18 fields, so
  it is easy to miss.

**`arrayed`** means one participant can have many values *at the same instance* —
a list, not a repeat measure. `arrayed = 1` on 550 fields.

Total columns a field becomes in a tabular extract is the product, named
`<field_id>-<instance>.<array>`:

```python
import csv, io, urllib.request

SHOWCASE = "https://biobank.ndph.ox.ac.uk/showcase"

def load(sid, encoding):
    raw = urllib.request.urlopen(f"{SHOWCASE}/scdown.cgi?fmt=txt&id={sid}", timeout=300).read()
    if raw.lstrip()[:9].lower().startswith(b"<!doctype"):   # HTTP 200 + HTML error page
        raise SystemExit(f"schema {sid}: server returned HTML, not TSV — check the table id")
    return list(csv.DictReader(io.StringIO(raw.decode(encoding)),
                              delimiter="\t", quoting=csv.QUOTE_NONE))

fields = {f["field_id"]: f for f in load(1, "utf-8")}
inst   = {i["instance_id"]: " ".join(i["descript"].split()) for i in load(9, "utf-8")}

def shape(field_id):
    f = fields[field_id]
    lo, hi = int(f["instance_min"]), int(f["instance_max"])
    alo, ahi = int(f["array_min"]), int(f["array_max"])
    n_inst = (hi - lo + 1) if f["instanced"] != "0" else 1
    n_arr  = (ahi - alo + 1) if f["arrayed"] == "1" else 1
    n, items = int(f["num_participants"]), int(f["item_count"])
    print(f"{field_id}  {f['title']}")
    print(f"  instanced={f['instanced']} arrayed={f['arrayed']}"
          f"  -> {n_inst} instance(s) x {n_arr} array slot(s) = {n_inst * n_arr} columns")
    print(f"  column names: {field_id}-{lo}.{alo} ... {field_id}-{hi}.{ahi}")
    if f["instanced"] != "0":
        print(f"  instance {f['instance_id']} means: {inst.get(f['instance_id'], '?')[:96]}")
    if n > 0:
        print(f"  participants {n:,}  item_count {items:,}"
              f"  -> {items / n:.2f} values per participant with data")
    else:
        print(f"  participants {n} (sentinel — not published)  item_count {items:,}")

for fid in ["23400", "41270", "40000", "30069"]:
    shape(fid); print()
```

Printed 2026-08-18:

```
23400  Total Cholesterol
  instanced=1 arrayed=0  -> 2 instance(s) x 1 array slot(s) = 2 columns
  column names: 23400-0.0 ... 23400-1.0
  instance 2 means: All participants attended an initial assessment centre. A proportion were invited several years
  participants 488,513  item_count 507,961  -> 1.04 values per participant with data

41270  Diagnoses - ICD10
  instanced=0 arrayed=1  -> 1 instance(s) x 259 array slot(s) = 259 columns
  column names: 41270-0.0 ... 41270-0.258
  participants 448,651  item_count 7,276,575  -> 16.22 values per participant with data

40000  Date of death
  instanced=2 arrayed=0  -> 2 instance(s) x 1 array slot(s) = 2 columns
  column names: 40000-0.0 ... 40000-1.0
  instance 9000001 means: Death registry reports
  participants 56,961  item_count 57,021  -> 1.00 values per participant with data

30069  Cell images
  instanced=2 arrayed=1  -> 16 instance(s) x 104 array slot(s) = 1664 columns
  column names: 30069-0.0 ... 30069-15.103
  instance 693 means: Used to group together items related to the same case report.
  participants 1,124  item_count 19,074  -> 16.97 values per participant with data
```

Read those four together and the whole model falls out. `23400` is one measurement
repeated at a second visit for a minority — 488,513 people, 507,961 values, so about
19,400 repeats. `41270` is not visit-indexed at all: a single instance slot holding up to
259 ICD-10 codes per person, 16 on average. `40000` is a *variable* instance, where the
index is a registry report. `30069` combines instancing and arraying and becomes 1,664
columns for 1,124 participants — which is what a wide extract of an arrayed, instanced
field looks like, and why you compute the column budget before requesting one.

`item_count / num_participants` is the cheapest sanity check available: near 1.0 means
one value per person, well above 1 means the field is genuinely multi-valued. Both columns
carry `-1` on the same 270 fields and `0` on the same 12, so the ratio never silently
divides by a fake count — but neither column can be summed.

The independent check on all of this is the field's own showcase page, which declares the
shape in its header table: `Instances` reads `Singular`, `Defined (N)` or `Variable (N)`
and `Array` reads `No` or `Yes (N)`, alongside `Participants` and `Item count`. Those four
were compared against this arithmetic on nineteen fields spanning every `value_type`, both
`item_type 20` bulk and `item_type 30` record, `array_min = 1`, the registry-indexed
instancing schemes and the retired and embargoed ends of the catalogue, and they agreed
every time. One nuance the arithmetic cannot see: declared slots are not populated slots.
`30900` declares `Defined (4)`, and its page then breaks out **3** instances, because
nobody was measured at instance 1. Four is still the right column budget; three is the
right number of timepoints.

## Resolving a field to its showcase page

`field.cgi?id=<field_id>` is the human-readable page. **It answers HTTP 200 for field
ids that do not exist**, so status code is not a validity test — validate against the
catalogue you already downloaded.

```python
import csv, io, urllib.request

SHOWCASE = "https://biobank.ndph.ox.ac.uk/showcase"

raw = urllib.request.urlopen(f"{SHOWCASE}/scdown.cgi?fmt=txt&id=1", timeout=300).read()
known = {f["field_id"]: f["title"] for f in
         csv.DictReader(io.StringIO(raw.decode("utf-8")), delimiter="\t",
                        quoting=csv.QUOTE_NONE)}

def resolve(field_id):
    """field.cgi answers HTTP 200 for ids that do not exist, so validate locally."""
    field_id = str(field_id)
    if field_id not in known:
        return None, f"field {field_id} is not in the catalogue"
    return f"{SHOWCASE}/field.cgi?id={field_id}", known[field_id]

for fid in ["23400", "30900", "41270", "99999999"]:
    url, note = resolve(fid)
    print(f"{fid:>9}  {note[:44]:44} {url or ''}")

for fid in ["23400", "99999999"]:
    body = urllib.request.urlopen(f"{SHOWCASE}/field.cgi?id={fid}", timeout=60).read().decode(
        "utf-8", "replace")
    print(f"  field.cgi?id={fid:<9} HTTP 200  "
          f"'Field is not in database' present: {'Field is not in database' in body}")
```

Printed 2026-08-18:

```
    23400  Total Cholesterol                            https://biobank.ndph.ox.ac.uk/showcase/field.cgi?id=23400
    30900  Number of proteins measured                  https://biobank.ndph.ox.ac.uk/showcase/field.cgi?id=30900
    41270  Diagnoses - ICD10                            https://biobank.ndph.ox.ac.uk/showcase/field.cgi?id=41270
 99999999  field 99999999 is not in the catalogue
  field.cgi?id=23400     HTTP 200  'Field is not in database' present: False
  field.cgi?id=99999999  HTTP 200  'Field is not in database' present: True
```

Nor is the body string a test. `field.cgi?id=99999999` does carry "Field is not in
database", but `field.cgi?id=0` and `field.cgi?id=abc` answer 200 *without* it. The local
membership check is the only reliable one, which is why it comes first.

Categories resolve the same way at `label.cgi?id=<category_id>` — and that page is also
the ground truth for which fields in a category are still live, since it omits retired
ones.

Field and category notes contain the showcase's own cross-reference markup:
`~F30900~` a field, `~C143~` a **coding** (not a category), `~L100116~` a label,
`~R4654~` a resource, `~P1874~` a publication, `~Ehttps://…~` an external link. `C`
meaning coding rather than category is a genuine ambiguity — coding 143 is the Olink
assay list, while *category* 143 is "Cannabis use".

## Traps confirmed on the live file

- **`num_participants` is a sentinel column, not a count.** 270 fields carry `-1` and
  12 carry `0` on the 2026-08-18 snapshot. `-1` means the count is not published — the
  showcase page renders those fields' participant count as the word `pending`, so it is
  not "nobody". `item_count` carries `-1` on exactly the same 270 rows. Summing or
  averaging either raw column silently subtracts.
- **172 fields are retired and the website does not show them.** `availability = 4`.
  They stay in the download with full counts; `label.cgi` omits them. Eleven of them
  carry the exact title of the live field that replaced them. See *Retired fields are in
  the download and not on the website* above — this is the single easiest way to size a
  study on a dead field id.
- **The download endpoints answer HTTP 200 with an HTML error page.** Both
  `scdown.cgi?id=<unknown>` and `codown.cgi?id=<unknown>` return status 200 and
  `Content-Type: text/html`. A TSV parser accepts the HTML without raising and hands back
  rows whose first column is named `<!DOCTYPE HTML>`. Check the leading bytes, not the
  status.
- **The two files disagree on text encoding.** Schema 1 is valid UTF-8. Schema 3
  (categories) is **cp1252** — decoding it as UTF-8 raises `UnicodeDecodeError` on byte
  `0x97` at offset 152,914, an em dash inside a category description. Decode each table
  with the encoding that table actually uses.
- **126 fields reference a category that does not exist.** Every field's
  `main_category` resolves against schema 3 except `1000`, which is absent from the
  category table entirely. All 126 are `item_type 20` bulk items with `private = 1`, and
  they split 63 `EMBARGOED UNLINKED : …` / 63 `EMBARGOED LINKED : …` — the two prefixes
  are field-id twins (`1020204` / `2020204`), so reading one and generalising gets the
  linkage backwards for half of them. An inner join on category drops all 126 without a
  word; use an outer join and label the orphan.
- **`availability = 7` is undocumented.** Three fields carry it (`12652`, `12663`,
  `12704`, all brain-MRI "reason not performed" fields) and the schema page documents
  only 0, 1 and 4. Pass unknown codes through as raw values rather than mapping them to
  a guess.
- **`codown.cgi` output has no trailing newline**, while `scdown.cgi` output does. So
  `wc -l` undercounts a coding file by one row. Use `grep -c ''`, or parse it.
- **Titles and notes contain literal double-quote characters** — 8,756 across schema 1,
  200 of them in titles, spread over 4,083 rows. On this snapshot they are all mid-field,
  so a default CSV parse and `quoting=QUOTE_NONE` give
  byte-identical results (checked with both `csv` and pandas 2.3.2). Pass `QUOTE_NONE`
  anyway; it costs nothing and removes the failure mode entirely.
- **The documented column list is stale.** `schema.cgi?id=1` ends its list with
  `showcase_order | tier`; the file ends with `showcase_order cost_do cost_on cost_sc`.
  Read the header row, never the documentation, to order columns.
- **What the catalogue does not contain**: any participant value, any per-field
  missingness pattern, which participants have data, or the distribution of a variable.
  `num_participants` is a headcount of people with at least one non-missing value across
  all instances — not the analysable n for a specific visit, and not a complete-case
  count for a model with covariates. Treat it as an upper bound.

## Two worked answers

Both of these are aging-project shaped questions, and the catalogue answers them in
opposite ways.

**NMR metabolomics — three categories, 512 fields, ~488,500 people.**

| category | title | fields | max `num_participants` |
|---|---|---|---|
| 220 | NMR metabolomics | 251 | 488,514 |
| 221 | NMR metabolomics QC indicators | 249 | 412,098 |
| 222 | NMR metabolomics processing | 12 | 488,521 |

Category 220 is the biomarker panel itself — field ids 20280–20281 and 23400–23648, all
`value_type 31` continuous, `instanced=1` with instances 0–1 (baseline and repeat), and
units 163 `mmol/l`, 77 `percent`, 4 `ratio`, 3 `nm`, 3 `g/l`, 1 `degree`. Representative
ids: `23400` Total Cholesterol (n=488,513), `23407` Total Triglycerides (488,513),
`23444` Omega-3 Fatty Acids (487,913), `23470` Glucose (487,597), `23478` Creatinine
(479,247), `23480` Glycoprotein Acetyls (488,514).

Note the number. The published NMR biomarker atlas is titled for 118,461 individuals; the
catalogue on 2026-08-18 reports ~488,500 for those same fields, roughly four times as
many. **The catalogue is the current answer and a paper is a historical one** — which is
exactly why you read `num_participants` rather than inheriting an n from the literature.
Category 221 is the paired QC layer — all 249 titles end `, QC Flag`, all are
`value_type 21` categorical, and 76 of them carry `num_participants = -1`. Budget for
them: a per-biomarker QC flag is how you exclude a bad spectrum, and it is a second
column per analyte.

**Olink proteomics — five fields, and not one protein among them.**

Category 1838 "Proteomics" has a single child, category 1839 "Protein biomarkers",
containing exactly five fields: `30900` Number of proteins measured (n=53,039),
`30901` Plate used for sample run (53,039), `30902` Well used for sample run (53,039),
`30903` UKB-PPP Consortium selected participant (6,230), `30904` Number of blind-spike
duplicates (1,318).

Searching the catalogue for a protein name finds nothing, and that is not a search
failure. `30900` has `item_type = 30` — *record* — meaning the normalised protein
expression values live in a Data Portal record table (`olink_data`), one row per
participant-instance-protein, **not** as thousands of tabular fields. Selecting `30900`
is what grants access to that table. Any plan that budgets "one column per protein" is
built on a shape that does not exist.

The assay list is open, though, which answers "is my protein on the panel?" without an
application. It is coding 143:

```bash
curl -sS "https://biobank.ndph.ox.ac.uk/showcase/codown.cgi?id=143" -o olink_assays.tsv
grep -c '' olink_assays.tsv
head -3 olink_assays.tsv
grep -E "^[0-9]+\s(GDF15|LEP|IL6|APOE);" olink_assays.tsv
```

Printed 2026-08-18 — 2,924 lines, so 2,923 assays:

```
2924
coding	meaning
1	A1BG;Alpha-1B-glycoprotein
2	AAMDC;Mth938 domain-containing protein
154	APOE;Apolipoprotein E
1137	GDF15;Growth/differentiation factor 15
1418	IL6;Interleukin-6
1572	LEP;Leptin
```

`meaning` is `GENE;description`, and the integer `coding` is the protein id used inside
the `olink_data` table. Split on `;` to get a gene-symbol lookup. For an organ-specific
proteomic clock this file plus `30900`'s n=53,039 is the complete feasibility answer:
which of your marker set is measurable, on how many people.

## Get the files

This writes **catalogue metadata** to disk as CSV — field descriptions, counts and
shapes. It does not download and cannot download participant data.

Set `QUERY` to a case-insensitive regular expression matched against field titles and
category names. Every code column is decoded to a label, `columns_in_extract` is
precomputed, the `-1` sentinel is preserved as a flag rather than coerced to a number,
and a manifest records the SHA-256 of each source file so a later rebuild is comparable.

```python
import csv, hashlib, io, json, os, re, urllib.request

SHOWCASE = "https://biobank.ndph.ox.ac.uk/showcase"
OUT      = "Data/ukb_catalogue"
QUERY    = r"nmr|olink|protein biomarker"   # case-insensitive, matched on title + category

VALUE_TYPE = {"11": "integer", "21": "categorical single", "22": "categorical multiple",
              "31": "continuous", "41": "text", "51": "date", "61": "time",
              "101": "compound", "201": "blob"}
ITEM_TYPE  = {"0": "data (tabular)", "10": "sample", "20": "bulk (files)",
              "30": "record (portal table)"}
STABILITY  = {"0": "complete", "1": "updateable", "2": "accruing", "3": "variable"}
INSTANCED  = {"0": "no", "1": "defined", "2": "variable"}
AVAILABLE  = {"0": "full", "1": "view-only", "4": "retired"}

os.makedirs(OUT, exist_ok=True)
manifest = {"source": SHOWCASE, "query": QUERY, "files": [], "downloads": []}

def fetch(url, dest, encoding):
    raw = urllib.request.urlopen(url, timeout=300).read()
    if raw.lstrip()[:9].lower().startswith(b"<!doctype"):   # HTTP 200 + HTML error page
        raise SystemExit(f"{url} returned HTML, not TSV — check the table id")
    with open(dest, "wb") as fh:
        fh.write(raw)
    manifest["downloads"].append({"url": url, "path": dest, "bytes": len(raw),
                                  "sha256": hashlib.sha256(raw).hexdigest(),
                                  "encoding": encoding})
    print(f"  {len(raw):>10,} bytes  {dest}")
    return list(csv.DictReader(io.StringIO(raw.decode(encoding)),
                              delimiter="\t", quoting=csv.QUOTE_NONE))

print("downloading:")
fields = fetch(f"{SHOWCASE}/scdown.cgi?fmt=txt&id=1", f"{OUT}/schema_1_fields.tsv", "utf-8")
cats   = fetch(f"{SHOWCASE}/scdown.cgi?fmt=txt&id=3", f"{OUT}/schema_3_categories.tsv", "cp1252")
insts  = fetch(f"{SHOWCASE}/scdown.cgi?fmt=txt&id=9", f"{OUT}/schema_9_instancing.tsv", "utf-8")

cat_name = {c["category_id"]: c["title"] for c in cats}
inst_txt = {i["instance_id"]: " ".join(i["descript"].split())[:120] for i in insts}
pat = re.compile(QUERY, re.I)

rows = []
for f in fields:
    cname = cat_name.get(f["main_category"], f"[category {f['main_category']} not in schema 3]")
    if not (pat.search(f["title"]) or pat.search(cname)):
        continue
    lo, hi = int(f["instance_min"]), int(f["instance_max"])
    n_inst = (hi - lo + 1) if f["instanced"] != "0" else 1
    alo, ahi = int(f["array_min"]), int(f["array_max"])
    n_arr = (ahi - alo + 1) if f["arrayed"] == "1" else 1
    n = int(f["num_participants"])
    rows.append({
        "field_id": f["field_id"],
        "title": f["title"],
        "category_id": f["main_category"],
        "category": cname,
        "num_participants": "" if n < 0 else n,   # -1 means "not published", not zero
        "n_is_sentinel": n < 0,
        "item_count": f["item_count"],
        "units": f["units"],
        "value_type": VALUE_TYPE.get(f["value_type"], f["value_type"]),
        "item_type": ITEM_TYPE.get(f["item_type"], f["item_type"]),
        "availability": AVAILABLE.get(f["availability"], f"code {f['availability']}"),
        "stability": STABILITY.get(f["stability"], f["stability"]),
        "instanced": INSTANCED.get(f["instanced"], f["instanced"]),
        "instances": n_inst,
        "instance_meaning": inst_txt.get(f["instance_id"], "") if f["instanced"] != "0" else "",
        "array_slots": n_arr,
        "columns_in_extract": n_inst * n_arr,
        "encoding_id": f["encoding_id"],
        "rap_cost_tier": f["cost_on"],
        "debut": f["debut"][:10],
        "version": f["version"][:10],
        "showcase_url": f"{SHOWCASE}/field.cgi?id={f['field_id']}",
    })

if not rows:
    raise SystemExit(f"no field matched /{QUERY}/ — widen it. Titles name measurements, "
                     "not constructs, so a derived quantity has no field to match")

rows.sort(key=lambda r: (r["category"], int(r["field_id"])))
csv_path = f"{OUT}/ukb_fields_filtered.csv"
with open(csv_path, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

manifest["files"].append({"path": csv_path, "rows": len(rows),
                          "bytes": os.path.getsize(csv_path)})
manifest["catalogue_version"] = max(f["version"] for f in fields)[:10]
manifest["fields_in_catalogue"] = len(fields)
manifest["contains"] = ("field-level metadata only — no participant data, "
                        "no individual-level values")
with open(f"{OUT}/manifest.json", "w") as fh:
    json.dump(manifest, fh, indent=2)

print(f"\n{len(rows)} fields matched /{QUERY}/ -> {csv_path}")
print("catalogue version:", manifest["catalogue_version"])
for cid, cname in sorted({(r['category_id'], r['category']) for r in rows},
                         key=lambda t: int(t[0])):
    sub = [r for r in rows if r["category_id"] == cid]
    ns = [r["num_participants"] for r in sub if r["num_participants"] != ""]
    cols = sum(r["columns_in_extract"] for r in sub)
    dead = sum(r["availability"] == "retired" for r in sub)
    print(f"  cat {cid:>5}  {cname[:34]:34} {len(sub):>4} fields  "
          f"max n {max(ns) if ns else 0:>7,}  {cols:>5} extract columns"
          + (f"  {dead} RETIRED" if dead else ""))
```

Printed 2026-08-18:

```
downloading:
   4,164,390 bytes  Data/ukb_catalogue/schema_1_fields.tsv
     176,100 bytes  Data/ukb_catalogue/schema_3_categories.tsv
       1,530 bytes  Data/ukb_catalogue/schema_9_instancing.tsv

517 fields matched /nmr|olink|protein biomarker/ -> Data/ukb_catalogue/ukb_fields_filtered.csv
catalogue version: 2025-09-20
  cat   220  NMR metabolomics                    251 fields  max n 488,514    502 extract columns
  cat   221  NMR metabolomics QC indicators      249 fields  max n 412,098    345 extract columns
  cat   222  NMR metabolomics processing          12 fields  max n 488,521     21 extract columns
  cat  1839  Protein biomarkers                    5 fields  max n  53,039     20 extract columns
```

Five files on disk: the three raw schema tables, the filtered CSV (517 rows, 187,261
bytes, 76 of them flagged `n_is_sentinel`), and `manifest.json`. Keep the raw TSVs — the
catalogue is rebuilt continuously and the `version` column moves per field, so a
checksummed copy is the only way to tell a real change from a mis-parse later.

The error path is worth exercising too. `QUERY = r"metabolomic aging clock"` exits 1 with
`no field matched …`, because titles name **measurements, not constructs** — a clock, a
risk score you intend to derive, or a phenotype definition has no field to match. Search
for the inputs instead. Conversely `QUERY = r"c-reactive protein"` returns 7 fields across
Blood biochemistry (n up to 469,326) and its processing category, so plenty of names you
would assume are absent are simply spelled UK Biobank's way.

The query above is a flattering one: all 517 of its fields are `availability = full`, so
it never exercises the retired path. Run it once on something that does, and read the
summary rather than the CSV:

```
86 fields matched /hospital inpatient|episodes containing/
  cat  2000  Hospital inpatient                   36 fields  max n 413,163     36 extract columns  36 RETIRED
  cat  2002  Summary Diagnoses                    10 fields  max n 409,809     10 extract columns  10 RETIRED
  cat  2003  Summary Maternity                    23 fields  max n 195,756     23 extract columns  23 RETIRED
  cat  2004  Summary Psychiatric                   6 fields  max n 365,945      6 extract columns  6 RETIRED
  cat  2005  Summary Operations                   11 fields  max n 409,747     11 extract columns  11 RETIRED
```

Eighty-six for eighty-six, at cohort-scale participant counts, and every one of those
categories shows an empty field list on the Showcase website. Without the `RETIRED` count
this reads as the richest result in the skill.

## Requesting access

**This skill cannot obtain access to UK Biobank data, and nothing in it should be read
as a promise of access.** What follows describes the published route so you can decide
whether to start it. The authoritative documents are the Access Procedures PDF and the
UK Biobank website, linked under *Sources*; where this section and those disagree, they
are right and this is stale.

**Applications are closed. Do not start this process expecting it to complete.** Two UK
Biobank pages said so on 2026-08-18, and they are the two a reader would land on:

- Access Management System login page: "We are currently not accepting new applications
  to UK Biobank, as the UKB-RAP remains closed. We will share an update via the Researcher
  Community as soon as new applications reopen."
- *Apply for access* (page's own stamp 1 July 2026): "Applications are currently paused
  whilst necessary changes are made to the UK Biobank Research Analysis Platform, and our
  priority is restoring access to compliant researchers on ongoing projects." followed by
  "**We intend to accept new applications in late 2026.**"

So there is a published intention but no open door and no committed date. Everything below
describes the route as published, for deciding whether to queue for it — re-read both
pages before planning a timeline. This is a dated observation of a state expected to
change, and the catalogue work above is the part you can do today regardless.

**Who may apply.** Any bona fide researcher, for health-related research in the public
interest, from academia, charity, government or commercial industry, in any country, all
under the same process and criteria. The legal counterparty is the **Applicant
Institution**, not the individual; the Applicant PI is named but carries no direct
contractual responsibility. Collaborating institutions can be added at any time, each
registering its researchers, executing the agreement, and paying an additional
institution fee.

**The published eight steps.** Register on AMS → registration reviewed (the Access Team
aims for 5 days) → complete the application form and select the data → application
reviewed by the Access Team and the Scientific Team → approved → fees and material
transfer agreement issued → payment and signatures returned → data released. Approval is
valid for **90 days**, within which the fee must be paid and the agreement signed.

**What the forms ask for.** Registration: name, address, email, a CV, a list of
peer-reviewed publications with links where possible, and the research department and
institutional website. The application: a short lay summary; every researcher and
institution involved; a summary scientific rationale — research question and aims,
background and any pilot data, a brief overview of planned methodology, and the expected
value and public health impact; contact details for a signatory authorised to sign the
agreement for each institution; and the selection of the data itself, which is where the
catalogue work above pays off.

Two things this list does *not* include, and it is worth knowing early: your own ethics
approval, and a hypothesis review. UK Biobank's Research Tissue Bank registration covers
data applications, and the Access Procedures state UK Biobank does not consider its remit
to be second-guessing the science "except in situations where the application is
potentially untenable, absurd or unethical".

**Duration and ongoing obligations.** Projects are granted a minimum three years,
extendable in one-year increments during the final year and cumulatively beyond that,
subject to fees and compliance. Annual report forms are required. Findings must be
published in a journal or an open-access site — the Access Procedures ask for reasonable
endeavours to do so within 6 months of the project completion date, and a commensurate
level of publication within the first three years — and results must be returned to UK
Biobank so other researchers can use them. Researchers agree not to attempt to identify
participants. UK Biobank does not approve publications, and makes no claim over
inventions developed using the resource.

**Fees.** Cost-recovery only; UK Biobank states it recovers the incremental cost of
servicing an application, not the cost of building the resource. The structure is **three
tiers** by dataset size, charged for an initial 3-year period and renewable, exclusive of
VAT, plus a per-additional-institution fee. Sample and re-contact applications are priced
case by case. **The tier amounts are on the fees page, not in the Access Procedures PDF.**
As that page carried them on 2026-08-18 (its own stamp: 14 April 2026):

| | first 3 years | per year extension | covers |
|---|---|---|---|
| Tier 1 | £3,000 | £1,000 | questionnaires, physical measures, health outcomes, linked health data |
| Tier 2 | £6,000 | £2,000 | plus assays, proteomics, measured and imputed genotypes |
| Tier 3 | £9,000 | £3,000 | plus imaging, large-scale assays, whole genome and exome sequence |
| additional institution | £1,000 | £500 | each institution added to an application |
| student / lower-income country | £500 | £175 | reduced access fee |

Two things that page says which are easy to get wrong from an older reading. **All tiers
now include access via the UKB-RAP only** — that is not a restriction peculiar to the
reduced-fee route; downloading fields at all is an exceptional-circumstances request
charged at the Tier 3 fee. And the tier boundaries are currently discounted: proteomics
sits under Tier 1 and imaging under Tier 2 "for a limited period", so a field's `cost_on`
value and the tier you are billed may not be the same thing this year. Read the fees page
rather than trusting any figure quoted anywhere else, this table included; the `cost_on`
column tells you which tier each field is *classified* in.

**What this skill will and will not do for you.** It will assemble your field shortlist
with participant counts and fee tiers, tell you which fields are tabular versus bulk
versus portal-table, draft a research question and methodology summary for you to edit,
and checklist what each form asks for. It will **not** fill in or draft any attestation —
data security arrangements, institutional or ethics status, non-re-identification
undertakings, or the signature of an authorised signatory. Those are legal claims made by
a named person on behalf of an institution, and they have to be written by that person.

## Try it

A self-contained check that the catalogue is reachable and still has the shape this skill
describes. Open data, no account, no key.

**Data** — UK Biobank Showcase schema 1, the data-field catalogue:

    https://biobank.ndph.ox.ac.uk/showcase/scdown.cgi?fmt=txt&id=1

Openly published field-level metadata for the whole resource — no participant data, no
account, no application. The Showcase publishes `wget` commands for these schema files on
its own schema pages, so retrieving them is what the endpoint is for. **They do not carry
an open-data licence**: the Showcase footer reserves reuse without a written licence from
UK Biobank, so treat the downloaded catalogue as reference material for your own planning
and do not republish or redistribute it. Last confirmed reachable 2026-08-18, together
with schema 3 (categories) from the same host.

```python
import csv, io, re, urllib.request
from collections import Counter

SHOWCASE = "https://biobank.ndph.ox.ac.uk/showcase"

def schema(sid, encoding):
    """Showcase schema tables are TSV. Encoding differs per table — see below."""
    raw = urllib.request.urlopen(f"{SHOWCASE}/scdown.cgi?fmt=txt&id={sid}", timeout=180).read()
    # scdown.cgi answers HTTP 200 with an HTML error page for a table id it does not know.
    assert not raw.lstrip()[:9].lower().startswith(b"<!doctype"), f"schema {sid}: HTML, not TSV"
    text = raw.decode(encoding)
    # QUOTE_NONE: 8,756 literal double-quote characters live inside titles and notes.
    return raw, list(csv.DictReader(io.StringIO(text), delimiter="\t", quoting=csv.QUOTE_NONE))

raw_fields, fields = schema(1, "utf-8")      # data-field properties — valid UTF-8
raw_cats,   cats   = schema(3, "cp1252")     # categories — NOT UTF-8, cp1252

COLUMNS = ["field_id", "title", "availability", "stability", "private", "value_type",
           "base_type", "item_type", "strata", "instanced", "arrayed", "sexed", "units",
           "main_category", "encoding_id", "instance_id", "instance_min", "instance_max",
           "array_min", "array_max", "notes", "debut", "version", "num_participants",
           "item_count", "showcase_order", "cost_do", "cost_on", "cost_sc"]
assert list(fields[0].keys()) == COLUMNS, list(fields[0].keys())

cat_name = {c["category_id"]: c["title"] for c in cats}

print("bytes (field catalogue) :", len(raw_fields))
print("fields                  :", len(fields))
print("categories              :", len(cats))
print("catalogue version (max) :", max(f["version"] for f in fields)[:10])

# num_participants is a SENTINEL field, not a plain count.
n = [int(f["num_participants"]) for f in fields]
print("num_participants == -1  :", sum(v == -1 for v in n), "(sentinel, not a count)")
print("num_participants ==  0  :", sum(v == 0 for v in n))
print("largest num_participants:", max(n))

# main_category is an integer id, and not every id used by a field exists in schema 3.
orphan = sorted({f["main_category"] for f in fields} - set(cat_name))
print("main_category ids used but absent from schema 3:", orphan)

print("instanced:", dict(sorted(Counter(f["instanced"] for f in fields).items())),
      " arrayed:", dict(sorted(Counter(f["arrayed"] for f in fields).items())))

# The orphan category is half LINKED and half UNLINKED — the distinction that decides
# whether an imaging file can be joined to a participant at all.
orphans = [f for f in fields if f["main_category"] == "1000"]
print("category 1000 titles    :",
      dict(Counter(f["title"].split(":")[0].strip() for f in orphans)))
assert len(orphans) == 126 and len(set(Counter(
    f["title"].split(":")[0].strip() for f in orphans).values())) == 1

# RETIRED FIELDS ARE IN THE DOWNLOAD AND NOT ON THE WEBSITE. A search that ignores
# `availability` silently offers dead field ids, sometimes under the live field's own title.
retired = [f for f in fields if f["availability"] == "4"]
live_titles = {f["title"] for f in fields if f["availability"] != "4"}
shadowed = sorted((f["field_id"] for f in retired if f["title"] in live_titles), key=int)
print("availability            :", dict(sorted(Counter(f["availability"] for f in fields).items())))
print("retired fields          :", len(retired))
print("retired under a live field's exact title:", len(shadowed), shadowed[:4], "...")
assert shadowed, "no superseded titles — re-check availability before trusting a shortlist"
assert "189" in shadowed                       # 189 and 22189 are both 'Townsend deprivation
assert "22189" not in shadowed                 # index at recruitment', both n=501,315

# Ground truth for that: the Showcase's own category page lists live fields only.
page = urllib.request.urlopen(f"{SHOWCASE}/label.cgi?id=126", timeout=180).read().decode(
    "utf-8", "replace")
listed = {m for m in re.findall(r"field\.cgi\?id=(\d+)", page)}
in_cat = [f for f in fields if f["main_category"] == "126"]
dead = [f for f in in_cat if f["availability"] == "4"]
print(f"category 126 Liver MRI  : schema 1 has {len(in_cat)}, its Showcase page lists "
      f"{len(listed)}, difference {len(dead)} retired")
assert len(in_cat) - len(dead) == len(listed), (len(in_cat), len(dead), len(listed))

# scdown.cgi is an HTTP-200-with-an-error-body endpoint. The status code proves nothing.
bad = urllib.request.urlopen(f"{SHOWCASE}/scdown.cgi?fmt=txt&id=9999", timeout=60)
body = bad.read()
header = csv.DictReader(io.StringIO(body.decode()), delimiter="\t").fieldnames
print(f"scdown.cgi?id=9999      : HTTP {bad.status}, {bad.headers.get('Content-Type')}, "
      f"parses as {len(header)} column named {header[0]!r}")
assert bad.status == 200 and body.lstrip()[:9].lower().startswith(b"<!doctype")

# The two deliverables: where NMR metabolomics and Olink proteomics actually live.
for probe in ("NMR metabolomics", "Protein biomarkers"):
    ids = [cid for cid, t in cat_name.items() if t == probe]
    hits = [f for f in fields if f["main_category"] in ids]
    best = max(hits, key=lambda f: int(f["num_participants"]))
    print(f"{probe:20} category {ids} | {len(hits):4} fields | "
          f"max n = {int(best['num_participants']):,} (field {best['field_id']})")
```

**Expect**

Invariants — these hold across rebuilds, and a failure means this skill is wrong:

- Schema 1 parses as TSV with **exactly the 29 columns** in `COLUMNS`, in that order.
  The assertion is the test; the documentation still lists a 28th column named `tier`.
- Schema 1 decodes as UTF-8 and schema 3 **does not** — swap the two encodings and the
  `cp1252` line raises `UnicodeDecodeError`. This is the trap the block exists to pin.
- `num_participants` contains negative values, so it is a sentinel column. Its maximum is
  above 400,000, because some field covers nearly the whole cohort — a maximum well below
  that means the file is truncated or the columns are mis-aligned.
- `orphan` is non-empty: at least one `main_category` used by a field is absent from
  schema 3, so a category join must tolerate misses.
- `instanced` takes values `0`, `1`, `2` and `arrayed` takes `0`, `1` — never anything
  else, and they vary independently.
- **Category 1000 splits evenly between `EMBARGOED UNLINKED` and `EMBARGOED LINKED`.**
  The assertion is the test. An earlier version of this skill said all 126 were unlinked,
  which reversed the linkage claim for 63 imaging fields.
- **`shadowed` is non-empty, contains `189`, and does not contain `22189`.** Retired
  fields sit in the download under the live field's own title, and `189`/`22189` are the
  pair that proves it — same title, same n=501,315, one of them dead. If this list ever
  empties, do not assume the problem went away; check `availability` before believing it.
- **Category 126's field count in schema 1 minus its retired fields equals what
  `label.cgi?id=126` lists.** 11 − 4 = 7. This is the ground truth that the Showcase
  website hides retired fields and the download does not, and it holds on all 22
  categories that contain one.
- **`scdown.cgi?fmt=txt&id=9999` returns HTTP 200 with HTML**, and a TSV parser turns it
  into a one-column table named `<!DOCTYPE HTML>` without raising. Status codes are not a
  validity test on this host, for the schema download any more than for `field.cgi`.
- NMR metabolomics and Protein biomarkers each resolve to exactly one category id, and
  Protein biomarkers holds fewer than 10 fields — the Olink values are a portal record
  table, not per-protein fields.

Observed 2026-08-18 against catalogue version **2025-09-20** — these move whenever UK
Biobank rebuilds, so a mismatch is drift to investigate, not a failure:

```
bytes (field catalogue) : 4164390
fields                  : 11821
categories              : 410
catalogue version (max) : 2025-09-20
num_participants == -1  : 270 (sentinel, not a count)
num_participants ==  0  : 12
largest num_participants: 501938
main_category ids used but absent from schema 3: ['1000']
instanced: {'0': 4605, '1': 7198, '2': 18}  arrayed: {'0': 11271, '1': 550}
category 1000 titles    : {'EMBARGOED UNLINKED': 63, 'EMBARGOED LINKED': 63}
availability            : {'0': 11592, '1': 54, '4': 172, '7': 3}
retired fields          : 172
retired under a live field's exact title: 11 ['189', '20033', '20034', '20074'] ...
category 126 Liver MRI  : schema 1 has 11, its Showcase page lists 7, difference 4 retired
scdown.cgi?id=9999      : HTTP 200, text/html, parses as 1 column named '<!DOCTYPE HTML>'
NMR metabolomics     category ['220'] |  251 fields | max n = 488,514 (field 23480)
Protein biomarkers   category ['1839'] |    5 fields | max n = 53,039 (field 30900)
```

## Sources

- Showcase — https://biobank.ndph.ox.ac.uk/showcase/
- Schema index (every downloadable table and its column definitions) — https://biobank.ndph.ox.ac.uk/showcase/schema.cgi
- Schema 1 column definitions and code meanings — https://biobank.ndph.ox.ac.uk/showcase/schema.cgi?id=1
- Mirror — https://biobank.ctsu.ox.ac.uk/crystal/
- Access Procedures v2.1 (July 2022) — https://www.ukbiobank.ac.uk/wp-content/uploads/2026/05/Access-procedures.pdf
- Apply for access — https://www.ukbiobank.ac.uk/use-our-data/apply-for-access/
- Fees — https://www.ukbiobank.ac.uk/use-our-data/fees/
- Financial support — https://www.ukbiobank.ac.uk/use-our-data/fees/financial-support/
- Access Management System — https://ams.ukbiobank.ac.uk/ams/
- Researcher community — https://community.ukbiobank.ac.uk/hc/en-gb
- Sudlow et al. (2015) *PLoS Medicine* 12, e1001779 — https://doi.org/10.1371/journal.pmed.1001779
- Bycroft et al. (2018) *Nature* 562, 203-209 — https://doi.org/10.1038/s41586-018-0579-z
- Littlejohns et al. (2020) *Nature Communications* 11, 2624 — https://doi.org/10.1038/s41467-020-15948-9
- Backman et al. (2021) *Nature* 599, 628-634 — https://doi.org/10.1038/s41586-021-04103-z
- Julkunen et al. (2023) *Nature Communications* 14, 604 — https://doi.org/10.1038/s41467-023-36231-7
- Sun et al. (2023) *Nature* 622, 329-338 — https://doi.org/10.1038/s41586-023-06592-6
- Oh et al. (2023) *Nature* 624, 164-172 — https://doi.org/10.1038/s41586-023-06802-1

The field catalogue is published openly by UK Biobank and needs no account, but it is not
released under an open-data licence — the Showcase carries a legal notice reserving reuse
without a written licence. Download it, plan with it, and do not redistribute it.
Individual-level participant data is separate, controlled, and governed by the material
transfer agreement issued with an approved application. Cite the resource papers above and
your application reference in published work.
