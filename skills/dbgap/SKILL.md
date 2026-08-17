---
name: dbgap
description: Find controlled-access human cohorts in the dbGaP study catalogue by disease, cohort name or assay, and build a table on disk of accessions, versions, study design, subject counts, consent codes and their data use limitations, and the access policy. Delivers study metadata only — the individual-level genotypes and phenotypes stay behind an application this skill cannot make.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [dbgap, controlled-access, gwas, human-genetics, public-data]
covers: [dbgap, phs accession, controlled access, data access committee, consent groups, GRU, HMB, data use limitation, data use certification, research use statement, genotype, phenotype, gwas, whole genome sequencing, whole exome sequencing, longitudinal cohort, case-control, aging, InCHIANTI, BLSA, SardiNIA, Framingham, Million Veteran Program, macular degeneration, cataract, Alzheimer disease, frailty, sarcopenia, DNA methylation, serum iron]
papers: [PMID:17898773, PMID:24297256, PMID:11129752, PMID:19880490, PMID:19303062, PMID:10588299]
access: [open, controlled]
datasets: [https://ftp.ncbi.nlm.nih.gov/dbgap/studies/phs000215/phs000215.v2.p1/GapExchange_phs000215.v2.p1.xml, https://ftp.ncbi.nlm.nih.gov/dbgap/studies/phs000001/phs000001.v3.p1/pheno_variable_summaries/phs000001.v3.pht002477.v1.p1.AREDS_Subject.var_report.xml]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-17
  against: dbGaP public study tree read 2026-08-17 (3253 study directories) / dbGaP FHIR API x1, FHIR 4.0.1 / dbGaPEx2.1.5 exchange schema / Python 3.12.8, standard library only / curl 8.7.1
  executed: 9
  unverified: 0
---
# dbGaP — the NCBI Database of Genotypes and Phenotypes

dbGaP holds individual-level human genotype and phenotype data — GWAS arrays, exomes,
genomes, methylation, and the deep phenotype tables that go with them — from 3,253 studies
with a public directory as of 2026-08-17. The individual-level files sit behind a written
application to a Data Access Committee. Aggregate genomic summary results are treated
separately by NIH policy and are not always gated the same way, but a study can be marked
GSR-restricted and some are, so do not assume either way from the accession.

**What this skill gets you is a catalogue, not data.** It reads the public study metadata
and puts a table on disk — what each study is, how many subjects, which consent groups
exist and what each one permits, which committee decides, and what an application would
commit you to. That is enough to decide whether a study can answer your question before
anyone spends a month on paperwork.

**This skill cannot obtain access and does not promise it.** It never requests a
controlled file. The application is made by a named person at an institution, and the
attestations in it are theirs — see *Requesting access* at the end for where the line sits.

**Read the consent groups before you read anything about applying.** The binding
constraint on a dbGaP study is almost never the committee; it is the consent the subjects
signed. A study consented for eye disease only cannot answer a question about metabolism
*after* access is granted. Getting that ordering backwards is how somebody spends three
months to reach data that was never eligible.

## Do not start with E-utilities — it lies quietly

dbGaP is **not** an E-utilities database. There is no `db=gap`. What makes this worth its
own section is the failure shape: the request returns **HTTP 200** and puts the error in
the body.

```bash
EU=https://eutils.ncbi.nlm.nih.gov/entrez/eutils

# HTTP 200 with the error in the BODY. A status-code check calls this a success.
curl -s -o /dev/null -w 'esearch db=gap -> HTTP %{http_code}\n' "$EU/esearch.fcgi?db=gap&term=aging"
curl -s "$EU/esearch.fcgi?db=gap&term=aging&retmode=json" | grep -o '"ERROR":"[^"]*"'

# ...because `gap` is not one of the databases E-utilities serves.
curl -s "$EU/einfo.fcgi?retmode=json" | python3 -c \
  "import json,sys; d=json.load(sys.stdin)['einforesult']['dblist']; print(len(d),'E-utilities databases; gap present:','gap' in d)"
```

Run 2026-08-17:

```
esearch db=gap -> HTTP 200
"ERROR":"Invalid db name specified: gap"
36 E-utilities databases; gap present: False
```

Any wrapper that checks `r.status_code == 200` and then looks for `esearchresult.idlist`
gets an empty list and reports "no matching studies". The study exists; the database does
not. **Whenever an NCBI JSON response could be empty, check for an `ERROR` key before you
trust the absence of results** — that is a house pattern, not a dbGaP quirk.

Two adjacent routes *do* work and are worth knowing:

- `db=bioproject` indexes many dbGaP studies and its records carry the `phs` accession, so
  a free-text search there is a decent way in when you only have a cohort's name.
- `db=pubmed` resolves the PMIDs a study lists (used below to confirm what a study is).

## The public study tree

The reliable, account-free route is plain HTTPS over the study directory tree.

```
https://ftp.ncbi.nlm.nih.gov/dbgap/studies/                                  all studies
https://ftp.ncbi.nlm.nih.gov/dbgap/studies/<phs>/                            its versions
https://ftp.ncbi.nlm.nih.gov/dbgap/studies/<phs>/<phs.vN.pM>/GapExchange_<phs.vN.pM>.xml
```

`GapExchange_*.xml` is the study's own metadata document, validated against the
`dbGaPEx2.1.5` schema published beside it. Alongside it, all public:

| sibling | what is in it |
|---|---|
| `pheno_variable_summaries/` | one `data_dict.xml` + one `var_report.xml` per dataset — variable names, definitions, and **N per consent group** |
| `manifest/` | a study report PDF, and one file manifest **per consent group** |
| `documents/` | a zip of the study's own documents, named by `phd` id — 48 files for `phs000001` (26 questionnaires, 11 protocols, 6 administration, 2 study descriptions, plus policy, analysis and QC). The XML's `Documents` block is what tells you which `phd` is which |
| `release_notes/` | what changed between versions |

Nothing in any of those is individual-level data. The individual-level files are not on
this tree at all.

Resolving "the current version of a study" has three traps in it, and all three bite:

```python
import re, urllib.error, urllib.request

FTP = "https://ftp.ncbi.nlm.nih.gov/dbgap/studies"

def versions(phs):
    """Every released version, oldest first. Sort NUMERICALLY, not as strings."""
    html = urllib.request.urlopen(f"{FTP}/{phs}/", timeout=60).read().decode("utf-8", "replace")
    # Inside a study directory the hrefs DO have a trailing slash. At /dbgap/studies/ they do NOT.
    vs = set(re.findall(r'href="' + phs + r'\.v(\d+)\.p(\d+)/"', html))
    return [f"{phs}.v{v}.p{p}" for v, p in sorted(vs, key=lambda t: (int(t[0]), int(t[1])))]

def metadata_url(phs):
    """Newest version that actually carries a GapExchange file.

    The newest version directory does not always have one — some hold only
    release_notes/ — so walk backwards instead of trusting the newest.
    """
    for ver in reversed(versions(phs)):
        url = f"{FTP}/{phs}/{ver}/GapExchange_{ver}.xml"
        try:
            urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60)
            return ver, url
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
    raise LookupError(f"{phs}: no GapExchange XML in any version directory")

for phs in ["phs000215", "phs000424", "phs001672"]:
    print(phs, len(versions(phs)), "versions ->", metadata_url(phs)[0])
```

Run 2026-08-17:

```
phs000215 2 versions -> phs000215.v2.p1
phs000424 11 versions -> phs000424.v11.p2
phs001672 14 versions -> phs001672.v13.p1
```

- **`phs000424` proves the sort.** Sorted as strings, `v11` lands before `v2` and you
  silently analyse a decade-old release.
- **`phs001672` proves the walk-back.** `phs001672.v14.p1/` exists and contains only
  `release_notes/`; the metadata you want is in `v13.p1`.
- **The trailing slash differs by level.** At `/dbgap/studies/` the links are
  `phs000001` with no slash; inside a study they are `phs000001.v3.p1/` with one. A single
  regex for both finds nothing at one of the two levels.

One more file will tempt you and should not: `Studies_Table_Of_Contents.xml` at the root of
the tree is **not** a study catalogue. It is a listing of every file on the whole dbGaP FTP
tree — 223 MB on 2026-08-17, with no study names in it. The `.zip` beside it is not a
compressed copy of the same thing either; on 2026-08-17 the XML was rebuilt that morning
and the zip was nine months old. Use the directory index instead.

## Triage — what may this data be used for

This is the section that decides whether an application is worth making, and it comes
first for that reason.

Every dbGaP study is split into one or more **consent groups**. A group is a set of
subjects whose consent form permits a particular class of research, and it is the unit
you apply for — not the study. The codes follow a grammar:

```
ROOT [ -DISEASE ] [ -MODIFIER ]...
```

Roots seen across the catalogue on 2026-08-17, with the number of consent groups carrying
each and the gloss taken from a real `UseLimitation` string rather than from memory:

| root | groups | what its own text says |
|---|---|---|
| `GRU` | 1833 | general research purposes |
| `DS` | 1241 | disease-specific; a disease token follows — `DS-CA`, `DS-BRCA`, `DS-T2D`, `DS-STK`, `DS-CRM` (cancer research and methods), `DS-OH` (oral health) |
| `HMB` | 936 | "limited to health/medical/biomedical purposes, does not include the study of population origins or ancestry" |
| `EA` | 120 | "Exchange Area" — a study-specific group; the terms exist only in that study's text |
| `CADM` | 24 | "Research related to adult diseases and methods" |
| `HMP` | 16 | "may be used only for studies related to the human microbiome" |
| `NRUP` | — | subjects who did not consent, present for pedigree structure or as genotype controls; never applied for |

and the modifiers that stack on a root, quoted from the studies they were read out of:

| modifier | groups | what its own text says |
|---|---|---|
| `IRB` | 898 | "Requestor must provide documentation of local IRB approval." |
| `NPU` | 681 | "Use of the data is limited to not-for-profit organizations." |
| `MDS` | 681 | "Use of the data **includes** methods development research (e.g., development of software or algorithms)." |
| `PUB` | 504 | "Requestor agrees to make results of studies using the data available to the larger scientific community." |
| `COL` | 286 | "Requestor must provide a letter of collaboration with the primary study investigator(s)." |
| `GSO` | 174 | "Use of the data is limited to genetic studies only." |

**`MDS` is the one to get right, and it is easy to get backwards.** It looks like a
restriction on methods work and it is the opposite — a *permission*. Verified 2026-08-17
against `phs000007` (`HMB-IRB-MDS`) and `phs001672` (`HMB-MDS`), both of which state that
use "includes methods development research". A triage note that reports `HMB-MDS` as
"no methods development allowed" rejects a study that would in fact have permitted the
work. Guessing from the letters is how that happens.

**Do not read a code and stop.** The authoritative text is the `UseLimitation` string in
the study's own XML and the Data Use Certification behind it, and the interesting terms are
routinely *not* in the code. `phs000007` adds, in prose only, that phenotype-only analyses
are prohibited and that the data may not be used to investigate pedigree structures. That
restriction has no letters in `HMB-IRB-MDS` at all.

Verified 2026-08-17 by sweeping the whole catalogue: **949 distinct consent codes across
3,216 studies.** This is not a short enumeration you can hardcode. 508 studies carry more
than one group, one carries 32, and 19 publish no code at all. The tail is study-specific
and gets stranger the further out you go — some codes end in the surname of the study's
principal investigator, and their `UseLimitation` requires a documented collaboration with
that person before a request will be considered. Parse the root and the modifiers you
recognise, and treat anything else as "read the text".

Now pull the actual terms for a study:

```python
import re, urllib.error, urllib.request, xml.etree.ElementTree as ET

FTP = "https://ftp.ncbi.nlm.nih.gov/dbgap/studies"

def metadata_url(phs):
    html = urllib.request.urlopen(f"{FTP}/{phs}/", timeout=60).read().decode("utf-8", "replace")
    vs = sorted(set(re.findall(r'href="' + phs + r'\.v(\d+)\.p(\d+)/"', html)),
                key=lambda t: (int(t[0]), int(t[1])))
    for v, p in reversed(vs):
        ver = f"{phs}.v{v}.p{p}"
        url = f"{FTP}/{phs}/{ver}/GapExchange_{ver}.xml"
        try:
            urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60)
            return ver, url
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
    raise LookupError(f"{phs}: no GapExchange XML in any version directory")

def triage(phs):
    ver, url = metadata_url(phs)
    study = ET.fromstring(urllib.request.urlopen(url, timeout=180).read()).find(".//Study")
    cfg, aa = study.find("Configuration"), study.find("AuthorizedAccess")

    # Consent groups appear in TWO places and EITHER can be missing. Merge them.
    groups = {}
    for cg in cfg.findall("./ConsentGroups/ConsentGroup"):
        groups[cg.get("groupNum")] = {"code": cg.get("shortName"),
                                      "name": cg.get("longName"), "limit": None, "irb": None}
    for ps in (aa.findall("./ConsentGroups/ParticipantSet") if aa is not None else []):
        g = groups.setdefault(ps.get("groupNum-REF"), {"code": None, "name": None})
        g["code"] = g["code"] or ps.findtext("ConsentAbbrev")
        g["limit"] = re.sub(r"\s+", " ", (ps.findtext("UseLimitation") or "").strip()) or None
        g["irb"] = ps.findtext("IrbRequired")

    pol = aa.find("Policy") if aa is not None else None
    return {
        "accession": ver,
        "name": cfg.findtext("StudyNameEntrez"),
        "types": [t.text for t in cfg.findall("./StudyTypes/StudyType")],
        "diseases": [d.get("vocab_term") for d in cfg.findall("./Diseases/Disease")],
        "dac": aa.findtext("./DacInfo/DacFullName") if aa is not None else None,
        "consent": [groups[k] for k in sorted(groups, key=int)],
        "policy": {k: pol.findtext(k) for k in ("YearsUntilRenewal", "WeeksCancelRequest",
                                                "EmbargoLength", "DisplayResearchStatement")}
                  if pol is not None else {},
        "duc": [d.get("FileName") for d in pol.iter("DataUseCertificate")] if pol is not None else [],
        "pmids": sorted({p.get("pmid") for p in cfg.iter("Pubmed") if p.get("pmid")}),
    }

for phs in ["phs000215", "phs000001", "phs001672"]:
    t = triage(phs)
    print(f"\n{t['accession']}  {t['name']}")
    print(f"  design   {', '.join(t['types']) or '-'}   diseases: {', '.join(t['diseases']) or '-'}")
    print(f"  DAC      {t['dac']}      linked PMIDs: {len(t['pmids'])}")
    for g in t["consent"]:
        print(f"  consent  {g['code'] or '?':8} IRB={g['irb'] or '-':4}"
              f"{(g['limit'] or g['name'] or '')[:64]}")
    print(f"  policy   {t['policy']}")
```

Run 2026-08-17:

```
phs000215.v2.p1  Genome-Wide Association Analysis of Biomarkers in the InCHIANTI and BLSA
  design   Population, Longitudinal   diseases: -
  DAC      NIA      linked PMIDs: 5
  consent  GRU      IRB=No  Summary level data available for use.
  policy   {'YearsUntilRenewal': '1', 'WeeksCancelRequest': '8', 'EmbargoLength': '0', 'DisplayResearchStatement': 'yes'}

phs000001.v3.p1  NEI Age-Related Eye Disease Study (AREDS)
  design   Case-Control   diseases: Cataract
  DAC      National Eye Institute      linked PMIDs: 26
  consent  NRUP     IRB=-   Subjects did not participate in the study, did not complete a co
  consent  EDO      IRB=No  For Use Eye Disease Research only
  consent  GRU      IRB=No  General research Purposes
  policy   {'YearsUntilRenewal': '1', 'WeeksCancelRequest': '8', 'EmbargoLength': '0', 'DisplayResearchStatement': 'yes'}

phs001672.v13.p1  Veterans Administration (VA) Million Veteran Program (MVP) Summary Results from Omics Studies
  design   Cohort, Electronic Medical Records, Longitudinal, Prospective   diseases: Kidney Diseases, Mental Disorders, Substance-Related Disorders, Eye Diseases, Risk Factors, Diabetes Mellitus, Persian Gulf Syndrome, Tinnitus, Brain Injuries, Traumatic, Arthritis, Lung Neoplasms, Breast Neoplasms, Multiple Myeloma, COVID-19
  DAC      National Heart, Lung, and Blood Institute DAC      linked PMIDs: 4
  consent  HMB-MDS  IRB=No  Use of this data is limited to health/medical/biomedical purpose
  policy   {'YearsUntilRenewal': '1', 'WeeksCancelRequest': '8', 'EmbargoLength': '0', 'DisplayResearchStatement': 'yes'}
```

**The two-places merge is not defensive coding, it is required.** `phs000001` populates
`Configuration/ConsentGroups` — that is where `EDO`'s long name comes from. `phs000215`
has no such element at all; its only record of `GRU` is under `AuthorizedAccess`. Read one
location and you will confidently report "no consent restrictions" for a controlled study.

Two other things in that output are worth reading twice. `AREDS` is the textbook case for
ordering: it has an `EDO` group that is eye-disease-only and a `GRU` group that is not, and
which of the two your question falls into changes the answer completely. And the `Policy`
block is study-specific — the schema constrains `YearsUntilRenewal` to 1–3,
`EmbargoLength` to 0–12 months, and `WeeksCancelRequest` to 1–8, so read them per study
rather than assuming the common values.

## How much of the cohort your question can actually reach

Consent groups are not just a permission; they are a **sample size**. A study's headline N
is the sum across groups, and you only ever get the groups you qualify for. That number is
public, per group, in the `var_report.xml` files.

```python
import re, urllib.request, xml.etree.ElementTree as ET

FTP = "https://ftp.ncbi.nlm.nih.gov/dbgap/studies"
get = lambda url: urllib.request.urlopen(url, timeout=180).read()

def reachable_subjects(phs, ver):
    """Subjects per consent group — the number that decides whether applying is worth it."""
    base = f"{FTP}/{phs}/{ver}"
    codes = {}
    gx = ET.fromstring(get(f"{base}/GapExchange_{ver}.xml"))
    for cg in gx.iter("ConsentGroup"):
        codes[cg.get("groupNum")] = cg.get("shortName")
    for ps in gx.iter("ParticipantSet"):
        codes.setdefault(ps.get("groupNum-REF"), ps.findtext("ConsentAbbrev"))

    listing = get(f"{base}/pheno_variable_summaries/").decode("utf-8", "replace")
    reports = re.findall(r'href="([^"]*var_report\.xml)"', listing)
    subj = [r for r in reports if "subject" in r.lower()] or reports
    tbl = ET.fromstring(get(f"{base}/pheno_variable_summaries/{subj[0]}"))
    print(f"{ver}  table={tbl.get('name')}  ({len(reports)} var_report files)")

    first = tbl.find("variable").get("var_name")
    for v in tbl.findall("variable"):
        if v.get("var_name") != first:
            continue
        # An id ending .c1 / .c2 is that consent group's slice; a bare id is the whole study.
        m = re.search(r"\.(c\d+)$", v.get("id"))
        n = int(v.find("./total/stats/stat").get("n"))
        cc = v.find("./total/subject_profile/case_control")
        label = "whole study" if not m else f"{codes.get(m.group(1)[1:], '?')} (group {m.group(1)[1:]})"
        extra = f"  cases {cc.findtext('case')} / controls {cc.findtext('control')}" if cc is not None else ""
        print(f"   {label:26} n = {n:>6,}{extra}")

reachable_subjects("phs000001", "phs000001.v3.p1")
reachable_subjects("phs000853", "phs000853.v2.p2")
```

Run 2026-08-17:

```
phs000001.v3.p1  table=AREDS_Subject  (17 var_report files)
   whole study                n =  4,757  cases 1458 / controls 808
   EDO (group 1)              n =    618  cases 170 / controls 105
   GRU (group 2)              n =  4,139  cases 1288 / controls 703
phs000853.v2.p2  table=Normative_Aging_Study_Subject  (3 var_report files)
   whole study                n =    777
```

That is the whole argument for putting consent first, in numbers. AREDS advertises 4,757
subjects. A question about eye disease can reach all of them; a question about anything
else can reach 4,139 and must leave the other 618 alone. Report the reachable N, never the
headline N, in a feasibility note or a power calculation.

The group figures sum to the whole-study figure — 618 + 4,139 = 4,757 — which is the check
worth asserting when you automate this. If they do not sum, you are reading a variable that
is not present in every group rather than the subject table's identifier.

`phs000853` shows the other case — a single group, so reachable equals headline, and no
`.cN` rows appear at all. Code that requires the `.cN` suffix to exist breaks on every
single-consent study, which is most of them.

## Counts, ancestry and design from the catalogue API

NCBI also publishes the study catalogue as a FHIR `ResearchStudy` service. It is the fast
way to get subject and sample counts, computed ancestry, assay types and titles without
downloading an XML per study — and it batches.

```python
import json, urllib.request

FHIR = "https://dbgap-api.ncbi.nlm.nih.gov/fhir/x1/ResearchStudy/"

def fhir_studies(phs_ids):
    """Batch-read catalogue records. 100 accessions per call keeps the URL sane."""
    out = {}
    for i in range(0, len(phs_ids), 100):
        url = FHIR + "?_count=100&_id=" + ",".join(phs_ids[i:i + 100])
        # The server declares charset=iso-8859-1 and means it. .decode("utf-8") raises
        # UnicodeDecodeError on any study whose text carries a Latin-1 byte.
        body = urllib.request.urlopen(url, timeout=180).read().decode("iso-8859-1")
        for entry in json.loads(body).get("entry", []):
            out[entry["resource"]["id"]] = entry["resource"]
    return out

def flatten(res):
    row = {"accession": (res.get("identifier") or [{}])[0].get("value"),
           "title": res.get("title", ""), "status": res.get("status"),
           "design": "; ".join(sorted({c.get("text", "") for c in res.get("category", [])})),
           "consent": [], "counts": {}, "molecular": [], "ancestry": {}}

    def walk(exts):
        for e in exts:
            tag = e["url"].rsplit("/", 1)[-1]
            if "extension" in e:
                if tag.endswith("AncestryCount"):
                    kids = {k["url"].rsplit("/", 1)[-1]: k for k in e["extension"]}
                    code = kids["ResearchStudy-ComputedAncestry-AncestryCount-Ancestry"]
                    n = kids["ResearchStudy-ComputedAncestry-AncestryCount-Count"]
                    row["ancestry"][code["valueCodeableConcept"]["coding"][0]["code"]] = \
                        n["valueCount"]["value"]
                    continue
                walk(e["extension"])
            elif tag.endswith("StudyConsents-StudyConsent"):
                row["consent"].append(e["valueCoding"]["display"])
            elif tag.startswith("ResearchStudy-Content-Num"):
                row["counts"][tag.replace("ResearchStudy-Content-Num", "")] = e["valueCount"]["value"]
            elif tag.endswith("MolecularDataType"):
                row["molecular"].append(e["valueCodeableConcept"]["coding"][0]["code"])
            elif tag == "ResearchStudy-ReleaseDate":
                row["released"] = e["valueDate"]
    walk(res.get("extension", []))
    return row

for phs, res in fhir_studies(["phs000215", "phs000001", "phs001672"]).items():
    r = flatten(res)
    print(f"\n{r['accession']}  {r['title'][:66]}")
    print(f"  released {r.get('released')}   design {r['design']}")
    print(f"  consent  {r['consent']}")
    print(f"  counts   {r['counts']}")
    print(f"  assays   {r['molecular']}   ancestry {r['ancestry']}")
```

Run 2026-08-17:

```
phs000001.v3.p1  NEI Age-Related Eye Disease Study (AREDS)
  released 2012-04-05   design Case-Control
  consent  ['EDO', 'GRU']
  counts   {'PhenotypeDatasets': 16, 'MolecularDatasets': 3, 'Variables': 635, 'Documents': 48, 'Analyses': 3, 'Subjects': 4757, 'Samples': 6962, 'SubStudies': 1}
  assays   ['SNP Genotypes (Array)']   ancestry {'EUR': 575, 'AFA': 11, 'LAC': 2, 'SAS': 2, 'OTR': 3}

phs000215.v2.p1  Genome-Wide Association Analysis of Biomarkers in the InCHIANTI an
  released 2013-09-27   design Prospective Longitudinal Cohort
  consent  ['GRU']
  counts   {'PhenotypeDatasets': 2, 'MolecularDatasets': 0, 'Variables': 23, 'Documents': 0, 'Analyses': 94, 'Subjects': 0, 'Samples': 0, 'SubStudies': 0}
  assays   []   ancestry {}

phs001672.v14.p1  Veterans Administration (VA) Million Veteran Program (MVP) Summary
  released None   design Prospective Longitudinal Cohort
  consent  []
  counts   {'PhenotypeDatasets': 0, 'MolecularDatasets': 0, 'Variables': 0, 'Documents': 0, 'Analyses': 335, 'Subjects': 0, 'Samples': 0, 'SubStudies': 0}
  assays   []   ancestry {}
```

Traps in this service, all confirmed 2026-08-17:

- **It is served as ISO-8859-1, and inconsistently.** The header says
  `charset=iso-8859-1`, and one study really does contain a Latin-1 `ü` in `Zürich` — so
  `.decode("utf-8")` raises. Others contain UTF-8 bytes that then render as mojibake when
  decoded as Latin-1. Decode `iso-8859-1` so it never raises, and treat non-ASCII prose
  from this API as unreliable. Accessions, codes and counts are ASCII and safe. Titles
  also arrive HTML-escaped — `Alzheimer&#39;s`.
- **Unimplemented search parameters return an empty result, not an error.** A nonsense
  parameter gets you an `OperationOutcome`, but `?title=<the exact title>` and
  `?_content=<a word in it>` return a well-formed `Bundle` with `"total": 0`. Same false
  green as `db=gap`, one layer down. `_id=` is the parameter that works.
- **`_count` caps at 250** whatever you ask for, and full pagination is not dependable:
  following the `next` link with its opaque `_getpages` cursor returned HTTP 400 at offset
  1500 on 2026-08-17. Enumerate from the FTP directory index and batch by `_id` instead.
- **The two routes disagree, and neither is a superset.** For `phs001672` the API reports
  version `.v14.p1` with an empty consent list while the XML at `.v13.p1` states
  `HMB-MDS`; for `phs000215` `NumSubjects` is 0 although the study has subjects; design
  vocabularies differ (`Population, Longitudinal` in the XML, `Prospective Longitudinal
  Cohort` in the API). **Take consent codes and policy from the XML; take counts and
  titles from the API; and never report a consent code from a route that can silently
  return an empty list.**

## Finding a study by cohort name

There is no free-text search over dbGaP that this skill can rely on, so build a local
index once and search it offline. One directory listing plus one batched API call per 100
studies. Roughly 90 seconds, then instant.

```python
import collections, csv, json, os, re, sys, time, urllib.request

OUT, INDEX = "Data/dbgap", "Data/dbgap/study_index.tsv"
FTP = "https://ftp.ncbi.nlm.nih.gov/dbgap/studies"
FHIR = "https://dbgap-api.ncbi.nlm.nih.gov/fhir/x1/ResearchStudy/"
os.makedirs(OUT, exist_ok=True)

def build():
    html = urllib.request.urlopen(f"{FTP}/", timeout=180).read().decode("utf-8", "replace")
    # At /dbgap/studies/ the hrefs carry NO trailing slash; inside a study they DO.
    ids = sorted(set(re.findall(r'href="(phs\d{6})"', html)))
    rows, absent = [], []
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        body = urllib.request.urlopen(FHIR + "?_count=100&_id=" + ",".join(chunk),
                                      timeout=240).read().decode("iso-8859-1")
        got = json.loads(body).get("entry", [])
        seen = set()
        for e in got:
            r = e["resource"]
            seen.add(r["id"])
            codes, subj, rel = [], "", ""

            def walk(x):
                nonlocal subj, rel
                for n in x:
                    t = n["url"].rsplit("/", 1)[-1]
                    if "extension" in n:
                        walk(n["extension"])
                    elif t.endswith("StudyConsents-StudyConsent"):
                        codes.append(n["valueCoding"]["display"])
                    elif t == "ResearchStudy-Content-NumSubjects":
                        subj = n["valueCount"]["value"] or ""
                    elif t == "ResearchStudy-ReleaseDate":
                        rel = n["valueDate"]
            walk(r.get("extension", []))
            rows.append([r["id"], (r.get("identifier") or [{}])[0].get("value") or "",
                         re.sub(r"\s+", " ", r.get("title", "")), r.get("status") or "",
                         "|".join(codes), subj, rel])
        absent += [c for c in chunk if c not in seen]
        print(f"\r  {len(rows)} indexed", end="", flush=True)
        time.sleep(0.34)
    with open(INDEX, "w", newline="") as fh:
        w = csv.writer(fh, delimiter="\t")
        w.writerow(["phs", "accession", "title", "status", "consent_codes", "subjects", "released"])
        w.writerows(sorted(rows))
    print(f"\n{len(ids)} study directories on the FTP tree; {len(rows)} carry a catalogue "
          f"record, {len(absent)} do not -> {INDEX}")

if not os.path.exists(INDEX) or "--refresh" in sys.argv:
    build()

rows = list(csv.DictReader(open(INDEX), delimiter="\t"))
terms = [t for t in sys.argv[1:] if not t.startswith("--")] or ["InCHIANTI", "BLSA", "SardiNIA", "Normative Aging"]
print(f"\nsearching {len(rows)} studies for {terms}")
for r in rows:
    if any(t.lower() in r["title"].lower() for t in terms):
        print(f"  {r['accession']:22} {r['consent_codes'] or '-':14} "
              f"n={r['subjects'] or '?':>6}  {r['title'][:60]}")

codes = collections.Counter(c for r in rows for c in r["consent_codes"].split("|") if c)
print(f"\n{len(codes)} distinct consent codes across {len(rows)} studies; "
      f"{sum(1 for r in rows if not r['consent_codes'])} publish none")
for c, n in codes.most_common(10):
    print(f"  {n:5d}  {c}")
roots = collections.Counter(c.split("-")[0] for r in rows
                            for c in r["consent_codes"].split("|") if c)
print("  root codes:", dict(roots.most_common(6)))
```

Run 2026-08-17, searching for the cohorts an aging project actually asks for:

```
  ... 3216 indexed
3253 study directories on the FTP tree; 3216 carry a catalogue record, 37 do not -> Data/dbgap/study_index.tsv

searching 3216 studies for ['InCHIANTI', 'BLSA', 'SardiNIA', 'Normative Aging']
  phs000215.v2.p1        GRU            n=     ?  Genome-Wide Association Analysis of Biomarkers in the InCHIA
  phs000313.v4.p2        GRU-IRB        n=  2105  SardiNIA Medical Sequencing Discovery Project
  phs000338.v1.p1        GRU            n=     ?  National Institute on Aging (NIA) SardiNIA Study
  phs000853.v2.p2        GRU            n=   777  Normative Aging Study (NAS)

949 distinct consent codes across 3216 studies; 19 publish none
   1250  GRU
    373  HMB
    143  GRU-IRB
    110  HMB-MDS
     90  GRU-IRB-PUB
     83  GRU-COL
     81  HMB-IRB
     80  GRU-NPU
     64  EA
     62  HMB-IRB-NPU
  root codes: {'GRU': 1833, 'DS': 1241, 'HMB': 936, 'EA': 120, 'CADM': 24, 'HMP': 16}
```

`n=?` in two of those rows is the API withholding a subject count, not a study with no
subjects — the per-consent-group numbers above are where that gets resolved. And
`phs000313` shows as `GRU-IRB` here while its XML also lists an `NRUP` group — the route
disagreement described in the previous section, seen in the wild.

**Two things a reader should take from that search rather than from a claim.** InCHIANTI
(the longitudinal Tuscany cohort) and BLSA (the Baltimore Longitudinal Study of Aging)
are both in dbGaP, but **only jointly, and only once** — `phs000215`, a biomarker GWAS
under a single `GRU` group, held by the NIA committee. Searching the 3,216 indexed titles
on 2026-08-17 for `InCHIANTI`, `BLSA`, `Baltimore`, `Chianti`, `Tuscany`, `frailty` and
`sarcopenia` returned no standalone deposit for either cohort. The deep longitudinal
phenotyping both are known for is not in dbGaP; what is there is the genotype-biomarker
association layer. If you need the phenotype series, the study contacts in
`GapExchange`'s attribution block are the route, not an application.

The index also records the studies the two routes disagree about: 3,253 directories exist
on the FTP tree and 3,216 have a catalogue record, so 37 are visible as files with no
record in the API. Search both if a study you know exists does not turn up.

## Get the files

The deliverable is a catalogue on disk — one row per study, the metadata XML it was
derived from, and a manifest recording where each came from. **Not the data.** Nothing
below requests a controlled file, and nothing below can.

Give it a shortlist from the search above.

```python
import csv, datetime, json, os, re, time, urllib.error, urllib.request
import xml.etree.ElementTree as ET

PHS = ["phs000215", "phs000313", "phs000338", "phs000853"]   # your shortlist
OUT = "Data/dbgap"
FTP = "https://ftp.ncbi.nlm.nih.gov/dbgap/studies"
FHIR = "https://dbgap-api.ncbi.nlm.nih.gov/fhir/x1/ResearchStudy/"
os.makedirs(f"{OUT}/xml", exist_ok=True)

def newest_metadata(phs):
    html = urllib.request.urlopen(f"{FTP}/{phs}/", timeout=90).read().decode("utf-8", "replace")
    vs = sorted(set(re.findall(r'href="' + phs + r'\.v(\d+)\.p(\d+)/"', html)),
                key=lambda t: (int(t[0]), int(t[1])))
    for v, p in reversed(vs):
        ver = f"{phs}.v{v}.p{p}"
        try:
            return ver, len(vs), urllib.request.urlopen(
                f"{FTP}/{phs}/{ver}/GapExchange_{ver}.xml", timeout=240).read()
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise
    raise LookupError(f"{phs}: no GapExchange XML under any version")

counts = {}
for i in range(0, len(PHS), 100):
    body = urllib.request.urlopen(FHIR + "?_count=100&_id=" + ",".join(PHS[i:i + 100]),
                                  timeout=240).read().decode("iso-8859-1")
    for e in json.loads(body).get("entry", []):
        r, c = e["resource"], {}
        def walk(x):
            for n in x:
                t = n["url"].rsplit("/", 1)[-1]
                if "extension" in n:
                    walk(n["extension"])
                elif t.startswith("ResearchStudy-Content-Num"):
                    c[t.replace("ResearchStudy-Content-Num", "")] = n["valueCount"]["value"]
        walk(r.get("extension", []))
        counts[r["id"]] = c

rows, manifest = [], []
for phs in PHS:
    ver, nver, xml = newest_metadata(phs)
    path = f"{OUT}/xml/GapExchange_{ver}.xml"
    open(path, "wb").write(xml)
    manifest.append({"phs": phs, "accession": ver, "versions_released": nver,
                     "url": f"{FTP}/{phs}/{ver}/GapExchange_{ver}.xml",
                     "path": path, "bytes": len(xml)})

    s = ET.fromstring(xml).find(".//Study")
    cfg, aa = s.find("Configuration"), s.find("AuthorizedAccess")
    pol = aa.find("Policy") if aa is not None else None

    groups = {c.get("groupNum"): [c.get("shortName"), None]
              for c in cfg.findall("./ConsentGroups/ConsentGroup")}
    for ps in (aa.findall("./ConsentGroups/ParticipantSet") if aa is not None else []):
        g = groups.setdefault(ps.get("groupNum-REF"), [None, None])
        g[0] = g[0] or ps.findtext("ConsentAbbrev")
        g[1] = re.sub(r"\s+", " ", (ps.findtext("UseLimitation") or "").strip()) or None
    ordered = [groups[k] for k in sorted(groups, key=int)]
    n = counts.get(phs, {})

    rows.append({
        "accession": ver,
        "versions_released": nver,
        "name": re.sub(r"\s+", " ", cfg.findtext("StudyNameEntrez") or ""),
        "study_types": "|".join(t.text for t in cfg.findall("./StudyTypes/StudyType")),
        "diseases": "|".join(d.get("vocab_term") or "" for d in cfg.findall("./Diseases/Disease")),
        "consent_codes": "|".join(c[0] or "?" for c in ordered),
        "use_limitations": " || ".join(f"{c[0]}: {c[1]}" for c in ordered if c[1]),
        "dac": aa.findtext("./DacInfo/DacFullName") if aa is not None else "",
        "subjects": n.get("Subjects", ""), "samples": n.get("Samples", ""),
        "variables": n.get("Variables", ""), "molecular_datasets": n.get("MolecularDatasets", ""),
        "years_until_renewal": pol.findtext("YearsUntilRenewal") if pol is not None else "",
        "weeks_cancel_request": pol.findtext("WeeksCancelRequest") if pol is not None else "",
        "embargo_months": pol.findtext("EmbargoLength") if pol is not None else "",
        "research_statement_public": pol.findtext("DisplayResearchStatement") if pol is not None else "",
        "duc_pdf": next((d.get("FilePath") for d in pol.iter("DataUseCertificate")), "")
                   if pol is not None else "",
        "pmids": "|".join(sorted({p.get("pmid") for p in cfg.iter("Pubmed") if p.get("pmid")})),
    })
    print(f"  {ver:22} {len(xml):>9,} B  consent={rows[-1]['consent_codes'] or '-'}")
    time.sleep(0.34)

cat = f"{OUT}/catalogue.tsv"
with open(cat, "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]), delimiter="\t")
    w.writeheader()
    w.writerows(rows)
json.dump({"retrieved_utc": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
           "catalogue": cat, "studies": manifest}, open(f"{OUT}/manifest.json", "w"), indent=2)

print(f"\n{len(rows)} studies -> {cat}")
print("NOTE: this is study metadata. No individual-level genotype or phenotype data was fetched.")
```

Run 2026-08-17:

```
  phs000215.v2.p1          111,142 B  consent=GRU
  phs000313.v4.p2           10,832 B  consent=NRUP|GRU-IRB
  phs000338.v1.p1          121,359 B  consent=GRU|Genotype_Analysis
  phs000853.v2.p2            5,717 B  consent=GRU

4 studies -> Data/dbgap/catalogue.tsv
NOTE: this is study metadata. No individual-level genotype or phenotype data was fetched.
```

Files on disk after that run:

```
Data/dbgap/catalogue.tsv                          17 columns x 4 rows
Data/dbgap/manifest.json                          source URL, byte count and version count per study
Data/dbgap/study_index.tsv                        3,216 rows, the searchable index
Data/dbgap/xml/GapExchange_phs000215.v2.p1.xml    111,142 B
Data/dbgap/xml/GapExchange_phs000313.v4.p2.xml     10,832 B
Data/dbgap/xml/GapExchange_phs000338.v1.p1.xml    121,359 B
Data/dbgap/xml/GapExchange_phs000853.v2.p2.xml      5,717 B
```

Keep the XML, not just the table. Studies get re-versioned and the `Policy` block changes
with them, so a catalogue row with no snapshot behind it cannot be re-checked later. The
manifest records which version each row came from, which is what makes the comparison
possible at all.

Two rows in that output are worth reading. `phs000313` needs `GRU-IRB` — general research
use, but documented local IRB approval must accompany the request. And `phs000338` carries
a group called `Genotype_Analysis` with no `UseLimitation` text at all, which is the case
where the code tells you nothing and the certification PDF is the only answer.

## Requesting access

Everything above is open to anyone. This section is about the part that is not, and about
where this skill stops.

**This skill cannot get you access.** It has no route to a controlled file, it makes no
request on anyone's behalf, and nothing in it should be read as a prediction that an
application will succeed. What it can do is make the decision cheap and the paperwork
legible.

**Who applies.** Not you personally unless you are eligible — a request is submitted by an
investigator at a research institution, through the NCBI Authorized Access system, and it
must be co-signed by that institution's **Institutional Signing Official**. The signing
official is the person authorised to bind the institution to the terms — usually in the
research administration or sponsored programs office, not in the lab. That countersignature
is the point of the whole structure: the commitments about data handling are the
institution's, not an individual's, which is why an unaffiliated researcher has no route
and why the lab cannot self-certify.

**Who decides.** The study's Data Access Committee, named in `DacInfo` in the XML —
`National Eye Institute` for `phs000001`, `NIA` for `phs000215`,
`National Heart, Lung, and Blood Institute DAC` for `phs001672`, and
`Joint Addiction, Aging, and Mental Health DAC` for `phs000338`. Studies in the same
shortlist routinely sit with different committees, which means different queues and
different correspondence.

**What the request asks for.** From the study's own `Policy` block and its Data Use
Certification, both public before you apply:

- The **consent group** you are requesting, by name. This is the choice the whole triage
  above exists to inform.
- A **research use statement** describing what you intend to do with the data. Where
  `DisplayResearchStatement` is `yes` — it is `yes` on every study checked here — that
  statement is **published on dbGaP under the applicant's name and institution**.
- A signed **Data Use Certification**, which is a legal attestation covering IRB status,
  local data security arrangements, non-re-identification, redistribution, and
  acknowledgement in publications.
- Whatever the consent code's modifiers add — `IRB` means documented local approval,
  `COL` means a letter of collaboration with the primary investigators, `PUB` means a
  commitment to share results. The `IrbRequired` element beside each consent group is the
  machine-readable form of the first of those, and it tracks the `IRB` modifier.

**What it costs in time.** Read these per study rather than assuming; they are in the XML
and the schema bounds them:

| `Policy` field | on all six studies read here | schema range |
|---|---|---|
| `YearsUntilRenewal` | 1 | 1–3 |
| `WeeksCancelRequest` | 8 | 1–8 |
| `EmbargoLength` | 0 | 0–12 months |
| `DisplayResearchStatement` | yes | yes / no |

An approval is not permanent. `YearsUntilRenewal` of 1 means the project is renewed or
closed out annually, and closeout has its own obligations about destroying local copies.
Committee turnaround is not published in the metadata and varies by committee, so do not
put a number on it — plan on weeks to months and check the committee's own page. The
timeline that actually sinks projects is the sum of institutional signature, committee
review, and annual renewal, not any one of them.

**Read the contract before you write anything.** The Data Use Certification and the
per-consent-group file manifests are public, so you can see the exact terms and the exact
file inventory you would be agreeing to.

```bash
ACC=phs000215.v2.p1
mkdir -p Data/dbgap/terms

# The Data Use Certification — the actual contract — is public before you apply.
curl -sL -o "Data/dbgap/terms/DUC_$ACC.pdf" \
  "https://dbgap.ncbi.nlm.nih.gov/aa/wga.cgi?page=DUC&view_pdf&stacc=$ACC"

# Per-consent-group file manifests and the study report, from the study's own directory.
BASE=https://ftp.ncbi.nlm.nih.gov/dbgap/studies/${ACC%%.*}/$ACC
curl -s "$BASE/manifest/" | grep -o 'href="[^"]*\.pdf"' | cut -d'"' -f2

wc -c "Data/dbgap/terms/DUC_$ACC.pdf"
```

Run 2026-08-17:

```
Study_Report.phs000215.Iron.v2.p1.MULTI.pdf
manifest_phs000215.Iron.v2.p1.c1.GRU.pdf
  727708 Data/dbgap/terms/DUC_phs000215.v2.p1.pdf
```

### Assist with the application; never author it

The boundary is not about effort, it is about who is making a claim.

**Reasonable to do here.** Assemble the checklist of what a given study requires. Extract
and tabulate the consent codes, use limitations, committee, and timelines. Draft a research
use statement for a human to edit, sharpen and take responsibility for — it is a
description of intended research, and a draft is a normal thing to hand a scientist.
Flag mismatches, loudly — a software or algorithm aim against a group whose text does
*not* permit methods development, an industry affiliation against `NPU`, a phenotype-only
analysis against a study that prohibits exactly that, a disease-specific group that does
not match the question. Quote the `UseLimitation` sentence you are flagging against so the
reader can check you rather than trust you.

**Never do here.** Do not fill in, draft, pre-populate or suggest wording for any
attestation. That means IRB status and approval numbers, local data security arrangements,
non-re-identification commitments, redistribution terms, and anything else in the Data Use
Certification. Those are statements of fact about an institution, signed by a named person,
and published. An agent that produces them fluently produces them carelessly, and the
failure mode is a real person attesting under their own name to something that is not true.
Say what the form asks and hand it back.

Do not attempt to obtain, reconstruct, join or infer individual-level data from any public
summary — `pheno_variable_summaries` are aggregates, and the certification's
non-re-identification term applies to anyone who reads them.

## Try it

A self-contained check that the routes this skill documents still behave as described.
Public metadata only, no account, no key.

**Data** — dbGaP study `phs000215`, the InCHIANTI + BLSA biomarker GWAS, and its metadata
document on the public study tree:

    https://ftp.ncbi.nlm.nih.gov/dbgap/studies/phs000215/phs000215.v2.p1/GapExchange_phs000215.v2.p1.xml

dbGaP **study metadata** is a work of the US federal government and carries no access
restriction — no account, no licence acceptance. The individual-level data the document
describes is controlled and is not touched here. This study is used because its consent
groups are recorded in only one of the two places they can appear, which is the trap most
likely to produce a confidently wrong answer. Last confirmed reachable 2026-08-17.

```python
import json, re, urllib.request, xml.etree.ElementTree as ET

PHS = "phs000215"          # InCHIANTI + BLSA biomarker GWAS
FTP = "https://ftp.ncbi.nlm.nih.gov/dbgap/studies"

# 1. Versions. Inside a study directory the hrefs DO carry a trailing slash, and the
#    version must be sorted numerically — v11 sorts before v2 as a string.
idx = urllib.request.urlopen(f"{FTP}/{PHS}/", timeout=60).read().decode("utf-8", "replace")
vs = sorted(set(re.findall(r'href="' + PHS + r'\.v(\d+)\.p(\d+)/"', idx)),
            key=lambda t: (int(t[0]), int(t[1])))
ver = "%s.v%s.p%s" % (PHS, *vs[-1])

# 2. Study metadata. Public, no account, no key.
gx = ET.fromstring(urllib.request.urlopen(
    f"{FTP}/{PHS}/{ver}/GapExchange_{ver}.xml", timeout=180).read())
study = gx.find(".//Study")
cfg, aa = study.find("Configuration"), study.find("AuthorizedAccess")

# 3. Consent codes live in TWO places. On this study the Configuration list is ABSENT
#    and only AuthorizedAccess carries the code — read one and you get nothing.
cfg_groups = [c.get("shortName") for c in cfg.findall("./ConsentGroups/ConsentGroup")]
aa_groups = [p.findtext("ConsentAbbrev") for p in aa.findall("./ConsentGroups/ParticipantSet")]
limits = [re.sub(r"\s+", " ", (p.findtext("UseLimitation") or "").strip())
          for p in aa.findall("./ConsentGroups/ParticipantSet")]
pol = aa.find("Policy")

# 4. The catalogue API, for counts. It declares charset=iso-8859-1 and means it —
#    .decode("utf-8") raises UnicodeDecodeError on studies containing a Latin-1 byte.
body = urllib.request.urlopen(
    "https://dbgap-api.ncbi.nlm.nih.gov/fhir/x1/ResearchStudy/?_id=" + PHS,
    timeout=180).read().decode("iso-8859-1")
res = json.loads(body)["entry"][0]["resource"]

fhir_consent = []
def scan(exts):
    for e in exts:
        if "extension" in e:
            scan(e["extension"])
        elif e["url"].endswith("StudyConsents-StudyConsent"):
            fhir_consent.append(e["valueCoding"]["display"])
scan(res.get("extension", []))

print("versions released :", ["v%s.p%s" % v for v in vs])
print("newest metadata   :", ver)
print("study name        :", cfg.findtext("StudyNameEntrez"))
print("study types       :", [t.text for t in cfg.findall("./StudyTypes/StudyType")])
print("DAC               :", aa.findtext("./DacInfo/DacFullName"))
print("consent  (Config) :", cfg_groups)
print("consent  (AuthAcc):", aa_groups, "->", limits)
print("consent  (FHIR)   :", fhir_consent)
print("renewal / cancel  :", pol.findtext("YearsUntilRenewal"), "yr /",
      pol.findtext("WeeksCancelRequest"), "wk")
print("embargo (months)  :", pol.findtext("EmbargoLength"))
print("statement public  :", pol.findtext("DisplayResearchStatement"))
print("DUC pdf           :", next(d.get("FileName") for d in pol.iter("DataUseCertificate")))
print("linked PMIDs      :", len({p.get('pmid') for p in cfg.iter('Pubmed') if p.get('pmid')}),
      "of", len(cfg.find("Publications")), "Publication entries")

assert not cfg_groups, "Configuration/ConsentGroups is empty here — AuthorizedAccess must be read too"
assert aa_groups == ["GRU"] == fhir_consent, (aa_groups, fhir_consent)
assert 1 <= int(pol.findtext("YearsUntilRenewal")) <= 3
assert 1 <= int(pol.findtext("WeeksCancelRequest")) <= 8
print("\nMetadata only. No individual-level genotype or phenotype data was requested.")
```

**Expect**

Invariants — true regardless of which version dbGaP has released, so a failure means this
skill is wrong about the source:

- The version directory listing parses, and sorting numerically picks the newest release.
- `Configuration/ConsentGroups` is **empty** for this study while `AuthorizedAccess`
  carries the code. This is the assertion that matters: it is what proves the two-location
  merge is necessary and not defensive padding.
- Every consent group has a `UseLimitation` string, and it is the authoritative text —
  never the code alone.
- `Policy` values stay inside the exchange schema's ranges — `YearsUntilRenewal` 1–3,
  `WeeksCancelRequest` 1–8, `EmbargoLength` 0–12.
- `DisplayResearchStatement` is present, because whether a research statement is published
  is a fact a reader must know before drafting one.
- Fewer `Pubmed` elements than `Publication` elements — most studies mix PMID references
  with free-text journal citations, so counting `Publication` overstates what you can
  resolve.
- Not one request in the block touches an individual-level file, and none can.

Observed 2026-08-17 against `phs000215.v2.p1` and dbGaP FHIR API `x1` — these move when
dbGaP re-versions a study, so a mismatch is drift to investigate, not a bug:

```
versions released : ['v1.p1', 'v2.p1']
newest metadata   : phs000215.v2.p1
study name        : Genome-Wide Association Analysis of Biomarkers in the InCHIANTI and BLSA
study types       : ['Population', 'Longitudinal']
DAC               : NIA
consent  (Config) : []
consent  (AuthAcc): ['GRU'] -> ['Summary level data available for use.']
consent  (FHIR)   : ['GRU']
renewal / cancel  : 1 yr / 8 wk
embargo (months)  : 0
statement public  : yes
DUC pdf           : BLSA_and_InCHIANTI_GWAS_Iron_Level_Study_DUC.pdf
linked PMIDs      : 5 of 6 Publication entries
```

## When not to use this

- **You need the data, and you have no institutional route to applying.** This skill will
  tell you precisely what you cannot have. That is genuinely useful for a feasibility memo
  and useless as a source of data.
- **You want open human genomic data now.** Aggregate allele frequencies, GWAS summary
  statistics and reference panels are published without an application by other resources.
  A summary-level question should not go through dbGaP's front door at all.
- **You want variable-level phenotype detail across many studies.** That lives in the
  `pheno_variable_summaries` data dictionaries, one file per dataset. This skill reads them
  for subject counts; harvesting thousands of them is a different job.
- **The cohort you want is not in dbGaP.** Confirmed above for InCHIANTI and BLSA as
  standalone deposits. Absence from the catalogue is a real answer and worth reporting as
  one, rather than substituting a study that merely sounds similar.

## Sources

- dbGaP — https://dbgap.ncbi.nlm.nih.gov/home
- Authorized Access system — https://dbgap.ncbi.nlm.nih.gov/aa/wga.cgi
- Public study tree — https://ftp.ncbi.nlm.nih.gov/dbgap/studies/
- Study catalogue API — https://dbgap-api.ncbi.nlm.nih.gov/fhir/x1/ResearchStudy/
- Exchange schema, published beside each study's XML — `dbGaPEx2.1.5.xsd`
- Mailman et al. (2007) *Nature Genetics* 39, 1181-1186 — https://doi.org/10.1038/ng1007-1181
- Tryka et al. (2014) *Nucleic Acids Research* 42, D975-D979 — https://doi.org/10.1093/nar/gkt1211

dbGaP study metadata is a work of the US federal government and is in the public domain.
The individual-level genotype and phenotype data it describes is not, and is governed by
each study's Data Use Certification.
