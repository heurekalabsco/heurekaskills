---
name: cbioportal
description: Fetch cBioPortal cancer genomics by study — mutations, GISTIC copy number, mRNA z-scores and clinical data keyed on Entrez id, with alteration frequency over profiled samples only and a per-study licence check.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [cbioportal, cancer, multi-omics, entrez, public-data]
covers: [cbioportal, tcga, pancancer atlas, firehose legacy, msk-impact, targeted panel, gene panel, somatic mutation, maf, copy number, gistic, amplification, deep deletion, mrna expression, z-score, rppa, clinical data, survival, tumour, tumor, oncotree, alteration frequency, lung adenocarcinoma, breast, glioblastoma, cancer cell line, ccle, datahub, odbl, human]
papers: [PMID:22588877, PMID:23550210, PMID:37668528, PMID:28481359, PMID:29625048]
access: [open]
datasets: [https://www.cbioportal.org/api/studies/luad_tcga_pan_can_atlas_2018, https://www.cbioportal.org/api/studies/luad_tcga, https://www.cbioportal.org/api/studies/msk_impact_2017, https://www.cbioportal.org/api/gene-panels/IMPACT410, https://raw.githubusercontent.com/cBioPortal/datahub/582e2862e963f6f13840625dfbdaa09e7dcca560/public/msk_impact_2017/LICENSE, https://raw.githubusercontent.com/cBioPortal/datahub/582e2862e963f6f13840625dfbdaa09e7dcca560/public/msk_impact_2017/data_gene_panel_matrix.txt]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-15
  against: cBioPortal public instance portalVersion v7.2.3 / dbVersion 3.1.0 / geneTableVersion hgnc_v7_2025.10.7 / datahub commits 582e2862 (msk_impact_2017) and dda83289 (luad_tcga_pan_can_atlas_2018) / Python 3.12 standard library only / curl 8.7.1
  executed: 9
  unverified: 0
---
# cBioPortal — cancer genomics by study

cBioPortal, an open-source cancer genomics portal, serves somatic mutations, copy number, expression, protein and clinical data for roughly 550 public
cancer studies — TCGA in three different processings, MSK-IMPACT clinical sequencing, cell-line
panels and hundreds of published cohorts. It has a public REST API at
`https://www.cbioportal.org/api` and a git repository of the study files behind it, the
*datahub*. No account, no key.

This skill is about getting numbers out of it that mean what you think they mean. Four
things go wrong silently, and each section below is one of them:

1. **The licence is per study.** Most data are ODbL; nine studies are CC BY-NC-ND, and the
   two places that say so disagree with each other.
2. **The API keys on Entrez gene ids.** Gene symbols that HGNC has since renamed are dropped
   from a lookup without an error — 11 of 13 in the example below.
3. **Not every sample was measured for every gene.** On targeted panels, and in older TCGA
   releases, the right denominator for "altered in X%" is the set of samples *profiled* for that
   gene. The API returns a `0` copy-number value for samples whose panel never covered the gene.
4. **The same tumour type is several studies.** TCGA lung adenocarcinoma is four studies with
   different sample sets, callers, reference genomes and profile names.

Neighbours: `depmap` owns cancer cell-line dependency data and its release pinning (cBioPortal
also carries CCLE mutation and copy-number studies, but not the CRISPR screens). `ncbi-gene`
resolves symbols, aliases and Entrez ids outside cBioPortal. `dbgap` covers the controlled
individual-level tiers — TCGA germline calls and raw reads are there, not here. The NCI Genomic
Data Commons is the upstream source for the `*_tcga_gdc` studies.

## Terms — read them per study, before you use the data

The portal-wide statement, from the cBioPortal FAQ
(https://docs.cbioportal.org/user-guide/faq/, read 2026-11-15):

> Unless otherwise noted, data in cBioPortal are available under the ODC Open Database License
> with no restrictions on the use of the data, as long as you properly give attribution to the
> original studies. There are some studies that restrict the commercial use of the data, but
> that will be explicitly mentioned in the study information.

The datahub README (https://github.com/cBioPortal/datahub) says the same in licence terms: ODbL,
which permits commercial use but is **share-alike** — a public derived database must be offered
under ODbL too. TCGA study folders carry their own `LICENSE` naming the "Broad Institute GDAC
TCGA Analysis Pipeline License" and warning that the data are preliminary.

"Explicitly mentioned in the study information" turned out to need checking. Across all 552
public studies on 2026-11-15:

| where the notice lives | studies |
|---|---|
| study description says CC BY-NC-ND **and** datahub `LICENSE` says CC BY-NC-ND | 1 (`msk_chord_2024`) |
| description says CC BY-NC-ND, datahub folder has **no** `LICENSE` | 7 (`asclc_msk_2024`, `hcc_msk_2024`, `msk_ctdna_vte_2024`, `msk_impact_50k_2026`, `pancreas_msk_2024`, `panet_msk_2018`, `prostate_msk_2024`) |
| description says CC BY-NC-ND, datahub `LICENSE` says **ODbL** | 1 (`msk_met_2021`) |
| datahub `LICENSE` ODbL / TCGA GDAC / CC-BY-4.0, no notice in description | 282 / 89 / 1 |
| neither — the FAQ's ODbL default applies | 171 |

So a check that reads only the `LICENSE` file misses eight of the nine non-commercial studies,
and on `msk_met_2021` reads the opposite of the description. Read both; when either says
non-commercial, treat the study as non-commercial and contact the data owner (the descriptions
name `datarequests@mskcc.org`) before any commercial use. For an ODbL study the reader route is
open to everyone, academic and commercial; for the nine, it is open for non-commercial use only.

## The API in one screen

Every resource answers `GET`; anything that takes a list of genes or samples is a `POST` to a
path ending in `/fetch` with a JSON body. The GET forms take **one** gene per request and most
require a `sampleListId`; the POST forms take lists and do not.

```bash
# What is being served right now -- record this with any result.
curl -s https://www.cbioportal.org/api/info | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['portalVersion'], d['dbVersion'], d['geneTableVersion'])"

# GET: one gene, sample list required (without it: 400 'Request parameter is missing: sampleListId')
curl -s "https://www.cbioportal.org/api/molecular-profiles/luad_tcga_pan_can_atlas_2018_mutations/mutations?sampleListId=luad_tcga_pan_can_atlas_2018_all&entrezGeneId=3845" \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)), 'KRAS mutation rows')"

# POST: many genes, profile id instead of a sample list
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"molecularProfileIds":["luad_tcga_pan_can_atlas_2018_mutations"],"entrezGeneIds":[7157,1956,3845]}' \
  https://www.cbioportal.org/api/mutations/fetch \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)), 'TP53+EGFR+KRAS mutation rows')"

# projection=META returns no body and puts the count in a header
curl -s -D - -o /dev/null "https://www.cbioportal.org/api/molecular-profiles/luad_tcga_pan_can_atlas_2018_mutations/mutations?sampleListId=luad_tcga_pan_can_atlas_2018_all&entrezGeneId=7157&projection=META" \
  | grep -i total-count
```

```
v7.2.3 3.1.0 hgnc_v7_2025.10.7
172 KRAS mutation rows
572 TP53+EGFR+KRAS mutation rows
total-count: 314
```

What the responses mean, measured 2026-11-15:

| request | answer | read it as |
|---|---|---|
| unknown study or profile | `404 {"message":"Study not found: …"}` | a real error |
| GET on a POST-only path, or the reverse | `405` | wrong verb |
| `pageSize` above 10,000,000 | `400 pageSize must be less than or equal to 10000000` | the only page cap |
| **misspelt `sampleListId`** in a POST body | **`200 []`** | not "no mutations" — check the list exists first (`GET /api/sample-lists/{id}` 404s honestly) |
| **unknown Entrez id** | **`200 []`** | same — resolve genes before fetching |
| `/mutations/fetch` with no `molecularProfileIds` | `400 interceptedMutationMultipleStudyFilter must be true` | name the profile |

**Size, not paging, is the limit.** The default `pageSize` is 10,000,000, so one call returns
everything: all 157,142 mutations of `luad_tcga_pan_can_atlas_2018` came back as 122 MB in 21 s,
and all 478,790 of `msk_impact_50k_2026` as 359 MB in 53 s. `pageSize`/`pageNumber` work on the
POST endpoints (ten pages of 1,000 reproduced a 9,192-row single call exactly), but for a whole
study the datahub file is the better route — see *Get the files*.

The default `projection=SUMMARY` row carries `entrezGeneId` and **no gene symbol**. Ask for
`projection=DETAILED` if you want the symbol echoed, or join on the id yourself.

## Helpers

Every Python block below imports from this file. Save it as `cbio.py` in the working directory.
Standard library only.

```python
"""Minimal cBioPortal client: standard library only, keyed on Entrez gene ids."""
import json, re, urllib.error, urllib.parse, urllib.request

API = "https://www.cbioportal.org/api"
RAW = "https://raw.githubusercontent.com/cBioPortal/datahub"
HDR = {"Content-Type": "application/json", "Accept": "application/json",
       "User-Agent": "cbioportal-skill"}


def api(path, body=None, **params):
    """GET when body is None, POST otherwise. Raises on any non-2xx, with the
    server's message -- but a 200 with [] is NOT an error here, and the API
    returns exactly that for a misspelt sample list or gene id."""
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=HDR,
                                 method="GET" if body is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=300) as fh:
            raw = fh.read()
    except urllib.error.HTTPError as e:
        msg = e.read()[:200].decode(errors="replace")
        raise RuntimeError(f"HTTP {e.code} {path}: {msg}") from None
    return json.loads(raw) if raw else None


def resolve_genes(symbols):
    """Symbol -> Entrez id. /genes/fetch drops unknown symbols without a word,
    so every symbol it did not return is retried as an alias, and anything
    still unresolved or ambiguous is raised rather than skipped."""
    found = {g["hugoGeneSymbol"]: g["entrezGeneId"]
             for g in api("/genes/fetch", list(symbols), geneIdType="HUGO_GENE_SYMBOL")}
    out, renamed, problems = {}, {}, {}
    for s in symbols:
        if s in found:
            out[s] = found[s]
            continue
        hits = api("/genes", alias=s)
        if len(hits) == 1:
            out[s] = hits[0]["entrezGeneId"]
            renamed[s] = hits[0]["hugoGeneSymbol"]
        else:
            problems[s] = [(h["entrezGeneId"], h["hugoGeneSymbol"]) for h in hits]
    if problems:
        raise LookupError(f"unresolved or ambiguous symbols: {problems}")
    return out, renamed


def pick_profile(study_id, alteration, datatype, contains=None):
    """Exactly one molecular profile, or an error naming the candidates.
    Taking the first match is how a z-score reference or a CNA caller gets
    chosen by accident."""
    hits = [p["molecularProfileId"] for p in api(f"/studies/{study_id}/molecular-profiles")
            if p["molecularAlterationType"] == alteration and p["datatype"] == datatype
            and (contains is None or p["molecularProfileId"].endswith(contains))]
    if len(hits) != 1:
        raise LookupError(f"{study_id}: {len(hits)} {alteration}/{datatype} profiles "
                          f"{hits} -- name one explicitly")
    return hits[0]


def profiled_samples(profile_id, entrez_ids):
    """Samples actually profiled for each gene in this profile. A sample on a
    targeted panel is profiled only for the genes on that panel; a sample with
    no panel id and profiled=True was assayed genome-wide."""
    rows = api("/gene-panel-data/fetch", {"molecularProfileIds": [profile_id]})
    panels = {pid: {g["entrezGeneId"] for g in api(f"/gene-panels/{pid}")["genes"]}
              for pid in {r["genePanelId"] for r in rows if r.get("genePanelId")}}
    return {e: {r["sampleId"] for r in rows if r["profiled"] and
                (r.get("genePanelId") is None or e in panels[r["genePanelId"]])}
            for e in entrez_ids}, len(rows), sorted(panels)


def study_terms(study_id, commit=None):
    """What governs this study's data. Two sources, because neither is complete
    on its own: the portal's study description carries most non-commercial
    notices, and the datahub folder may carry a LICENSE file. They can disagree;
    when either says non-commercial, that is the verdict."""
    st = api(f"/studies/{study_id}")
    desc = re.sub(r"<[^>]+>", "", st.get("description", ""))
    m = re.search(r".{0,160}(licen[cs]e|non-?commercial).{0,120}", desc, re.I | re.S)
    notice = m.group(0).strip() if m else None
    try:
        url = f"{RAW}/{commit or 'master'}/public/{study_id}/LICENSE"
        with urllib.request.urlopen(url, timeout=60) as fh:
            lic = fh.read().decode("utf-8", "replace").strip()
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        lic = None
    nc = re.compile(r"NonCommercial|non-?commercial|BY-NC", re.I)
    desc_nc, file_nc = bool(notice and nc.search(notice)), bool(lic and nc.search(lic))
    if desc_nc or file_nc:
        verdict = "NON-COMMERCIAL"
        if lic and desc_nc != file_nc:
            verdict += " (description and LICENSE file disagree)"
    elif notice or lic:
        verdict = "stated"
    else:
        verdict = "nothing study-specific: ODbL default per the cBioPortal FAQ"
    return {"studyId": study_id, "importDate": st.get("importDate"),
            "description_notice": notice,
            "license_file": lic.splitlines()[0][:120] if lic else None,
            "verdict": verdict}


def alteration_frequency(entrez_ids, mut_profile, cna_profile=None):
    """Per gene: altered / profiled, never altered / all samples. A gene with no
    profiled sample gets None, not 0.0 -- 0 of 0 is not a frequency.
    CNA counts deep deletion (-2) and amplification (+2) only. 'any' is over
    samples profiled by BOTH profiles for that gene."""
    ids = list(entrez_ids)
    mprof, _, _ = profiled_samples(mut_profile, ids)
    muts = api("/mutations/fetch", {"molecularProfileIds": [mut_profile], "entrezGeneIds": ids})
    cprof, cna = ({e: set() for e in ids}, [])
    if cna_profile:
        cprof, _, _ = profiled_samples(cna_profile, ids)
        cna = api("/molecular-data/fetch", {"molecularProfileIds": [cna_profile],
                                            "entrezGeneIds": ids})
    frac = lambda a, b: round(len(a) / len(b), 4) if b else None
    out = []
    for e in ids:
        mut = {m["sampleId"] for m in muts if m["entrezGeneId"] == e} & mprof[e]
        amp = {c["sampleId"] for c in cna if c["entrezGeneId"] == e and c["value"] == 2} & cprof[e]
        dele = {c["sampleId"] for c in cna if c["entrezGeneId"] == e and c["value"] == -2} & cprof[e]
        both = mprof[e] & cprof[e]
        out.append({"entrezGeneId": e,
                    "mutated": len(mut), "mut_profiled": len(mprof[e]),
                    "mut_freq": frac(mut, mprof[e]),
                    "amp": len(amp), "homdel": len(dele), "cna_profiled": len(cprof[e]),
                    "cna_freq": frac(amp | dele, cprof[e]) if cna_profile else None,
                    "any_altered": len((mut | amp | dele) & both) if cna_profile else None,
                    "any_profiled": len(both) if cna_profile else None,
                    "any_freq": frac((mut | amp | dele) & both, both) if cna_profile else None})
    return out
```

Check the licence of every study you are about to use:

```python
from cbio import study_terms

for s in ["luad_tcga_pan_can_atlas_2018", "msk_impact_2017", "msk_chord_2024",
          "msk_met_2021", "luad_tcga_gdc"]:
    t = study_terms(s)
    print(f"{s:30} {t['verdict']}")
    print(f"{'':30} file: {t['license_file'] and t['license_file'][:70]}")
```

```
luad_tcga_pan_can_atlas_2018   stated
                               file: TCGA data are available under Broad Institute GDAC TCGA Analysis Pipel
msk_impact_2017                stated
                               file: The data are available under the ODC Open Database License (ODbL)(http
msk_chord_2024                 NON-COMMERCIAL
                               file: Attribution-NonCommercial-NoDerivatives 4.0 International
msk_met_2021                   NON-COMMERCIAL (description and LICENSE file disagree)
                               file: The data are available under the ODC Open Database License (ODbL)(http
luad_tcga_gdc                  nothing study-specific: ODbL default per the cBioPortal FAQ
                               file: None
```

## Genes: key on Entrez, and never trust a symbol lookup that did not complain

Every data endpoint takes `entrezGeneIds`. The way in from a symbol is `/genes/fetch` with
`geneIdType=HUGO_GENE_SYMBOL`, and it **returns only the symbols it recognises, in alphabetical
order, with no record of the rest**. The gene table is HGNC as of the `geneTableVersion` in
`/api/info`, so any gene list older than the last rename round loses genes:

```python
from cbio import api, resolve_genes

# A 2017-era cancer gene list, written the way that year's papers wrote it.
old = ["TP53", "KRAS", "MLL2", "MLL3", "FAM123B", "MRE11A", "FAM175A", "H3F3A",
       "WHSC1", "MYCL1", "PAK7", "FAM46C", "PARK2"]
got = api("/genes/fetch", old, geneIdType="HUGO_GENE_SYMBOL")
print(f"/genes/fetch: asked {len(old)}, got {len(got)}: {[g['hugoGeneSymbol'] for g in got]}")

ids, renamed = resolve_genes(old)
print(f"resolve_genes: {len(ids)} resolved, {len(renamed)} via alias")
for s, new in renamed.items():
    print(f"  {s:8} -> {new:9} Entrez {ids[s]}")
```

```
/genes/fetch: asked 13, got 2: ['KRAS', 'TP53']
resolve_genes: 13 resolved, 11 via alias
  MLL2     -> KMT2D     Entrez 8085
  MLL3     -> KMT2C     Entrez 58508
  FAM123B  -> AMER1     Entrez 139285
  MRE11A   -> MRE11     Entrez 4361
  FAM175A  -> ABRAXAS1  Entrez 84142
  H3F3A    -> H3-3A     Entrez 3020
  WHSC1    -> NSD2      Entrez 7468
  MYCL1    -> MYCL      Entrez 4610
  PAK7     -> PAK5      Entrez 57144
  FAM46C   -> TENT5C    Entrez 54855
  PARK2    -> PRKN      Entrez 5071
```

Alias resolution is a repair, not a guarantee. **`MLL2` is the worked hazard.** In human HGNC
history it is KMT2D, and cBioPortal's alias table says so. But the numbering was used both ways
in the literature, and in mouse it is worse: NCBI Gene lists `Mll2` as an alias of *both* mouse
`Kmt2b` (Gene 75410) and mouse `Kmt2d` (Gene 381022), and `Kmt2d` also carries `Mll4` and
`KMT2B` as aliases (read 2026-11-15). A gene list that came from a mouse paper, or a paper that
followed the other numbering, resolves cleanly to the wrong gene. When `resolve_genes` reports a
rename, read what the source meant; `ncbi-gene` is the place to inspect a symbol's history.

The datahub files carry both `Hugo_Symbol` and `Entrez_Gene_Id` in every MAF. Join on the
second. In `msk_impact_2017`'s MAF (datahub commit `582e2862`, 78,220 rows) each Entrez id maps
to exactly one symbol, all already the current ones — so a 2017 symbol list matched against that
file by text finds **zero** `MLL2`, `FAM123B` or `H3F3A` rows, where an Entrez join finds 1,210,
233 and 29.

## Studies, profiles and sample lists

A **study** (`luad_tcga_pan_can_atlas_2018`) holds **molecular profiles** — one per data type and
processing (`…_mutations`, `…_gistic`, `…_rna_seq_v2_mrna_median_all_sample_Zscores`) — and
**sample lists** (`…_all`, `…_sequenced`, `…_cna`, `…_3way_complete`). Pick profiles by
`molecularAlterationType` and `datatype`, and always by name when more than one matches:

```python
from cbio import api, pick_profile

S = "luad_tcga_pan_can_atlas_2018"
for p in api(f"/studies/{S}/molecular-profiles"):
    print(f"  {p['molecularAlterationType']:24} {p['datatype']:12} {p['molecularProfileId'][len(S)+1:]}")
print()
for sl in api(f"/studies/{S}/sample-lists", projection="DETAILED"):
    print(f"  {sl['sampleListId'][len(S)+1:]:16} {sl['sampleCount']:4}  {sl['name']}")

for args in [("MRNA_EXPRESSION", "Z-SCORE"), ("COPY_NUMBER_ALTERATION", "DISCRETE")]:
    for study in (S, "gbm_tcga_pub"):
        try:
            print(f"{study}: {pick_profile(study, *args)}")
        except LookupError as e:
            print(f"refused -> {e}")
```

```
  GENERIC_ASSAY            CATEGORICAL  armlevel_cna
  GENERIC_ASSAY            LIMIT-VALUE  genetic_ancestry
  COPY_NUMBER_ALTERATION   DISCRETE     gistic
  COPY_NUMBER_ALTERATION   LOG2-VALUE   log2CNA
  GENERIC_ASSAY            LIMIT-VALUE  methylation_hm27_hm450_merge
  GENERIC_ASSAY            LIMIT-VALUE  methylation_hm450
  MUTATION_EXTENDED        MAF          mutations
  MRNA_EXPRESSION          CONTINUOUS   rna_seq_v2_mrna
  MRNA_EXPRESSION          Z-SCORE      rna_seq_v2_mrna_median_Zscores
  MRNA_EXPRESSION          Z-SCORE      rna_seq_v2_mrna_median_all_sample_Zscores
  MRNA_EXPRESSION          Z-SCORE      rna_seq_v2_mrna_median_all_sample_ref_normal_Zscores
  PROTEIN_LEVEL            LOG2-VALUE   rppa
  PROTEIN_LEVEL            Z-SCORE      rppa_Zscores
  STRUCTURAL_VARIANT       SV           structural_variants

  3way_complete     503  Complete samples
  all               566  All samples
  cna               511  Samples with CNA data
  cnaseq            507  Samples with mutation and CNA data
  log2CNA           511  Samples with log2 copy-number data
  methylation_all   562  Samples with methylation data
  methylation_hm450  456  Samples with methylation data (HM450)
  rna_seq_v2_mrna   510  Samples with mRNA data (RNA Seq V2)
  rppa              360  Samples with protein data (RPPA)
  sequenced         566  Samples with mutation data
  sv                510  Samples with SV data
refused -> luad_tcga_pan_can_atlas_2018: 3 MRNA_EXPRESSION/Z-SCORE profiles ['luad_tcga_pan_can_atlas_2018_rna_seq_v2_mrna_median_Zscores', 'luad_tcga_pan_can_atlas_2018_rna_seq_v2_mrna_median_all_sample_Zscores', 'luad_tcga_pan_can_atlas_2018_rna_seq_v2_mrna_median_all_sample_ref_normal_Zscores'] -- name one explicitly
refused -> gbm_tcga_pub: 4 MRNA_EXPRESSION/Z-SCORE profiles ['gbm_tcga_pub_mirna_median_Zscores', 'gbm_tcga_pub_mrna_median_Zscores', 'gbm_tcga_pub_mrna_median_all_sample_Zscores', 'gbm_tcga_pub_mrna_merged_median_Zscores'] -- name one explicitly
luad_tcga_pan_can_atlas_2018: luad_tcga_pan_can_atlas_2018_gistic
refused -> gbm_tcga_pub: 2 COPY_NUMBER_ALTERATION/DISCRETE profiles ['gbm_tcga_pub_cna_consensus', 'gbm_tcga_pub_cna_rae'] -- name one explicitly
```

Both refusals are the point:

- **Three z-score references.** `…_median_Zscores` is relative to *diploid* tumours (the id does
  not say so; the profile name does), `…_all_sample_Zscores` to all tumours, `…_ref_normal_…` to
  normal tissue. "EGFR z > 2" in this study is **82, 12 or 67 of 510** samples depending on which
  you opened; for ERBB2 it is **55, 7 or 271**. State the reference beside every z-score threshold.
  Older studies add more: `gbm_tcga_pub` has four, one of them microRNA filed under
  `MRNA_EXPRESSION`.
- **Two discrete CNA callers.** `gbm_tcga_pub` has a consensus and an RAE profile. CDKN2A deep
  deletion is 114 samples in one, 95 in the other, and the portal's study summary shows **118** —
  their union. Taking the first match silently picks one of three answers.

Discrete copy number is GISTIC-style: `-2` deep deletion, `-1` shallow loss, `0` diploid, `1`
gain, `2` amplification. Alteration counts conventionally use `±2` only — which is also the
default of `/molecular-profiles/{id}/discrete-copy-number/fetch` (`HOMDEL_AND_AMP`); pass
`discreteCopyNumberEventType=ALL` to get the rest. `/molecular-data/fetch` returns every value.

Clinical data come back in long form — one row per sample (or patient) per attribute, values
always strings — from `/studies/{id}/clinical-data?clinicalDataType=SAMPLE` or `=PATIENT`.
`AGE`, `SEX` and `OS_MONTHS` are patient attributes; join them to samples through `patientId`. A
sample with no row for an attribute has no value; there is no explicit NA.

## One tumour type, several studies

TCGA lung adenocarcinoma, 2026-11-15, KRAS mutation per the portal's own counts:

| study | name | genome | samples | KRAS altered / profiled | ÷ all samples |
|---|---|---|---|---|---|
| `luad_tcga_pan_can_atlas_2018` | PanCancer Atlas | hg19 | 566 | 168 / 566 = **29.7%** | 29.7% |
| `luad_tcga` | Firehose Legacy | hg19 | 586 | 75 / 230 = **32.6%** | **12.8%** |
| `luad_tcga_pub` | Nature 2014 | hg19 | 230 | 75 / 230 = **32.6%** | 32.6% |
| `luad_tcga_gdc` | TCGA GDC, 2025 | hg38 | 571 | 149 / 559 = **26.7%** | 26.1% |

These are not interchangeable copies. PanCancer Atlas has whole-exome mutation calls for all 566
of its samples, made uniformly across the 33 PanCancer tumour types; Firehose Legacy has more
samples but mutation calls for only 230 — exactly the 230 sequenced samples of the 2014 paper; the
GDC study is re-processed on hg38 with a different profile vocabulary (`…_cna`, not `…_gistic`;
`…_mrna_seq_tpm_Zscores`, not `…_rna_seq_v2_…`). 564 sample ids are shared between PanCancer
Atlas and Firehose Legacy, 22 are Legacy-only and 2 are PanCan-only. Use PanCancer Atlas for
cross-tumour TCGA work unless you have a reason not to, name the study id in every figure, and
never pool two of these — the shared sample ids would be counted twice.

## Alteration frequency: the denominator is the profiled samples

"Altered in X% of samples" divides by the samples **measured for that gene**, which is often
fewer than the samples in the study:

- **Targeted panels.** `msk_impact_2017` sequenced 2,809 samples on IMPACT341 and 8,136 on
  IMPACT410. The 69 genes added in IMPACT410 — `CXCR4`, `CALR`, `ANKRD11` among them — were not
  measured in the first 2,809.
- **Unsequenced samples.** `luad_tcga` has 586 samples and mutation data for 230. Dividing KRAS by
  586 gives 12.8% for a gene mutated in about a third of lung adenocarcinomas.
- **Copy number reports 0 for unmeasured genes.** `/molecular-data/fetch` on `msk_impact_2017_cna`
  returns a row for all 10,945 samples for CXCR4, and the 2,809 IMPACT341 samples carry the value
  `0` — "diploid" for a gene nobody measured.
- **Off-panel calls exist.** One ANKRD11 missense (`P-0003054-T01-IM3`, D1295N) sits in an
  IMPACT341 sample. The portal counts it in `numberOfAlteredCases` (212) and excludes it from
  `numberOfAlteredCasesOnPanel` (211). `alteration_frequency` uses the on-panel count, so numerator
  and denominator describe the same samples.

`/gene-panel-data/fetch` says which panel each sample was run on (`genePanelId`, or none for
whole-exome) and whether it was profiled at all; `/gene-panels/{id}` lists the panel's genes. The
portal's study summary endpoints compute the same thing server-side, which makes them the check:

```python
from cbio import api, alteration_frequency

for study, genes in [("msk_impact_2017", {7852: "CXCR4", 7157: "TP53", 29123: "ANKRD11"}),
                     ("luad_tcga", {3845: "KRAS"})]:
    n_all = api(f"/studies/{study}")["allSampleCount"]
    server = {g["entrezGeneId"]: g for g in api("/mutated-genes/fetch", {"studyIds": [study]})}
    rows = alteration_frequency(genes, f"{study}_mutations")
    for r in rows:
        s = server[r["entrezGeneId"]]
        assert r["mut_profiled"] == s["numberOfProfiledCases"], (r, s)
        assert r["mutated"] == s["numberOfAlteredCasesOnPanel"], (r, s)
        print(f"{study:16} {genes[r['entrezGeneId']]:8} {r['mutated']:5} / {r['mut_profiled']:5}"
              f" = {r['mut_freq']:.2%}   (÷ all {n_all}: {r['mutated'] / n_all:.2%})")

# A gene no sample was profiled for has no frequency.
print(alteration_frequency([29123], "gbm_tcga_pub_mutations", "gbm_tcga_pub_cna_rae")[0])
```

```
msk_impact_2017  CXCR4       38 /  8136 = 0.47%   (÷ all 10945: 0.35%)
msk_impact_2017  TP53      4538 / 10945 = 41.46%   (÷ all 10945: 41.46%)
msk_impact_2017  ANKRD11    211 /  8136 = 2.59%   (÷ all 10945: 1.93%)
luad_tcga        KRAS        75 /   230 = 32.61%   (÷ all 586: 12.80%)
{'entrezGeneId': 29123, 'mutated': 0, 'mut_profiled': 0, 'mut_freq': None, 'amp': 0, 'homdel': 0, 'cna_profiled': 203, 'cna_freq': 0.0, 'any_altered': 0, 'any_profiled': 0, 'any_freq': None}
```

The same comparison — panel-aware profiled count and on-panel altered count against
`/mutated-genes/fetch`, and CNA ±2 against `/cna-genes/fetch` — agreed exactly for seven genes in
seven studies on 2026-11-15: both TCGA LUAD processings above plus `luad_tcga_gdc`,
`msk_impact_2017`, `msk_impact_50k_2026` (four IMPACT panels, 54,331 samples), `ccle_broad_2019`
(cell lines, 1,570 of 1,739 sequenced) and `gbm_tcga_pub` (Nature 2008, a 600-gene targeted panel, 91 of
206 sequenced). The one disagreement was the two-caller CNA case above, which `pick_profile`
refuses.

## Pinning: the portal serves only its latest import

The API has no version parameter. What it serves for a study is whatever was last imported, and
`importDate` on `/api/studies/{id}` is the only stamp — `luad_tcga_pan_can_atlas_2018` was
re-imported on 2026-06-04. Record it, with `portalVersion` and `geneTableVersion` from
`/api/info`, beside every number.

The datahub is the version-controlled copy. A **commit SHA** pins every file of a study, and the
data files are git-LFS objects whose pointer records a sha256 and a size — so a download can be
verified byte for byte. The two are not guaranteed to agree: the latest datahub commit touching
`luad_tcga_pan_can_atlas_2018` (2026-10-23, resource-table metadata) post-dates the portal's
import. And 57 portal studies have **no datahub folder** at all — 49 `*_tcga_gdc` studies plus 8
recent ones (`brca_msk_2025`, `paad_msk_2025`, `pancan_hcmi_2025`, …); for those the API and
`importDate` are the only pin.

## Get the files

Two routes, both ending in files on disk with a manifest that says what they are.

**Route 1 — a gene-set slice from the API.** Mutations, discrete copy number, one named z-score
profile, clinical data and the frequency table for a handful of genes in one study. Under a
minute:

```python
import csv, json, os
from cbio import api, resolve_genes, pick_profile, study_terms, alteration_frequency

STUDY = "luad_tcga_pan_can_atlas_2018"
GENES = ["KRAS", "EGFR", "STK11", "KEAP1", "TP53", "CDKN2A"]
Z_REF = "_rna_seq_v2_mrna_median_all_sample_Zscores"     # z relative to all tumours
OUT = f"Data/cbioportal/{STUDY}"
os.makedirs(OUT, exist_ok=True)

terms = study_terms(STUDY)
if terms["verdict"].startswith("NON-COMMERCIAL"):
    print(f"NOTE {STUDY} is non-commercial: {terms['description_notice']}")
ids, renamed = resolve_genes(GENES)
sym = {v: k for k, v in ids.items()}
mut_p = pick_profile(STUDY, "MUTATION_EXTENDED", "MAF")
cna_p = pick_profile(STUDY, "COPY_NUMBER_ALTERATION", "DISCRETE")
z_p = pick_profile(STUDY, "MRNA_EXPRESSION", "Z-SCORE", contains=Z_REF)
E = sorted(ids.values())


def write(name, header, rows):
    with open(f"{OUT}/{name}", "w", newline="") as fh:
        w = csv.writer(fh, delimiter="\t")
        w.writerow(header)
        w.writerows(rows)
    return len(rows)


MUT_COLS = ["sampleId", "patientId", "entrezGeneId", "proteinChange", "mutationType",
            "variantType", "chr", "startPosition", "endPosition", "referenceAllele",
            "variantAllele", "tumorAltCount", "tumorRefCount", "ncbiBuild"]
muts = api("/mutations/fetch", {"molecularProfileIds": [mut_p], "entrezGeneIds": E})
n_mut = write("mutations.tsv", MUT_COLS + ["symbol"],
              [[m.get(c) for c in MUT_COLS] + [sym[m["entrezGeneId"]]] for m in muts])

for name, prof in [("cna.tsv", cna_p), ("mrna_z.tsv", z_p)]:
    vals = api("/molecular-data/fetch", {"molecularProfileIds": [prof], "entrezGeneIds": E})
    n = write(name, ["sampleId", "entrezGeneId", "symbol", "value"],
              [[v["sampleId"], v["entrezGeneId"], sym[v["entrezGeneId"]], v["value"]] for v in vals])
    print(f"{name:14} {n:6} rows  {prof}")

for kind in ("SAMPLE", "PATIENT"):
    rows = api(f"/studies/{STUDY}/clinical-data", clinicalDataType=kind)
    key = "sampleId" if kind == "SAMPLE" else "patientId"
    n = write(f"clinical_{kind.lower()}.tsv", [key, "attribute", "value"],
              [[r[key], r["clinicalAttributeId"], r["value"]] for r in rows])
    print(f"clinical_{kind.lower()}.tsv {n:6} rows (long form)")

freq = alteration_frequency(E, mut_p, cna_p)
write("frequency.tsv", ["symbol"] + list(freq[0]), [[sym[f["entrezGeneId"]]] + list(f.values()) for f in freq])
print(f"mutations.tsv  {n_mut:6} rows  {mut_p}")

info = api("/info")
manifest = {"study": STUDY, "importDate": terms["importDate"], "terms": terms,
            "portalVersion": info["portalVersion"], "dbVersion": info["dbVersion"],
            "geneTableVersion": info["geneTableVersion"],
            "profiles": {"mutations": mut_p, "cna": cna_p, "mrna_z": z_p},
            "genes": {s: ids[s] for s in GENES}, "renamed_on_resolution": renamed,
            "frequency_rule": "altered / samples profiled for the gene; CNA = +2 or -2 only"}
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=2)

print()
for f in freq:
    print(f"  {sym[f['entrezGeneId']]:7} mut {f['mutated']:3}/{f['mut_profiled']}  "
          f"cna {f['amp'] + f['homdel']:3}/{f['cna_profiled']}  any {f['any_freq']:.1%} of {f['any_profiled']}")
```

```
cna.tsv          3066 rows  luad_tcga_pan_can_atlas_2018_gistic
mrna_z.tsv       3060 rows  luad_tcga_pan_can_atlas_2018_rna_seq_v2_mrna_median_all_sample_Zscores
clinical_sample.tsv   9831 rows (long form)
clinical_patient.tsv  19125 rows (long form)
mutations.tsv     785 rows  luad_tcga_pan_can_atlas_2018_mutations

  CDKN2A  mut  25/566  cna  86/511  any 20.5% of 511
  EGFR    mut  70/566  cna  29/511  any 15.5% of 511
  KRAS    mut 168/566  cna  29/511  any 33.1% of 511
  STK11   mut  75/566  cna   3/511  any 15.3% of 511
  TP53    mut 295/566  cna   6/511  any 51.7% of 511
  KEAP1   mut 102/566  cna   4/511  any 19.4% of 511
```

`cna.tsv` and `mrna_z.tsv` hold only the samples the API returned for each profile — here 511 and
510 of 566, and on a panel study the CNA file also holds `0` for genes off a sample's panel; the
frequency table already accounts for both, a downstream reader of the TSV has to.

The "any" denominator is 511 — samples profiled by both profiles according to
`/gene-panel-data/fetch`. The study's curated `cnaseq` sample list ("mutation and CNA data") has
507: four samples with both data types (`TCGA-64-1678-01`, `TCGA-69-8453-01`, `TCGA-78-7143-01`,
`TCGA-86-A4D0-01`) are missing from it. Sample lists are files someone wrote; gene-panel data is
what the portal's own counts use, and what they matched above.

**Route 2 — whole study files from the datahub, pinned to a commit.** For a whole study, or for
files the API does not expose, fetch the staging files at a commit SHA. The repository stores
`data*.txt` as git-LFS pointers; the object store's address is in the repository's own
`.lfsconfig`, which this reads rather than hard-coding, then verifies sha256 and size:

```python
import hashlib, json, os, urllib.request

STUDY, COMMIT = "msk_impact_2017", "582e2862e963f6f13840625dfbdaa09e7dcca560"
FILES = ["meta_study.txt", "LICENSE", "data_gene_panel_matrix.txt", "data_clinical_sample.txt"]
RAW = f"https://raw.githubusercontent.com/cBioPortal/datahub/{COMMIT}"
OUT = f"Data/cbioportal/datahub/{STUDY}"
os.makedirs(OUT, exist_ok=True)


def fetch(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=600) as fh:
        return fh.read()


lfs_url = next(line.split("=", 1)[1].strip() for line in
               fetch(f"{RAW}/.lfsconfig").decode().splitlines()
               if line.strip().startswith("url")).rstrip("/")
manifest = {"study": STUDY, "commit": COMMIT, "files": {}}
for name in FILES:
    body = fetch(f"{RAW}/public/{STUDY}/{name}")
    if body.startswith(b"version https://git-lfs.github.com/spec/v1"):
        ptr = dict(line.split(" ", 1) for line in body.decode().strip().splitlines())
        oid, size = ptr["oid"].split(":", 1)[1], int(ptr["size"])
        batch = json.loads(fetch(f"{lfs_url}/objects/batch",
            json.dumps({"operation": "download", "transfers": ["basic"],
                        "objects": [{"oid": oid, "size": size}]}).encode(),
            {"Accept": "application/vnd.git-lfs+json", "Content-Type": "application/vnd.git-lfs+json"}))
        body = fetch(batch["objects"][0]["actions"]["download"]["href"])
        if len(body) != size or hashlib.sha256(body).hexdigest() != oid:
            raise RuntimeError(f"{name}: download does not match its LFS pointer")
    open(f"{OUT}/{name}", "wb").write(body)
    manifest["files"][name] = {"bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
    print(f"  {len(body):>9,} B  {name}")
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=2)

# Cross-check the pinned files against what the portal serves today.
rows = [r for r in open(f"{OUT}/data_gene_panel_matrix.txt").read().splitlines()[1:] if r]
served = json.loads(fetch(f"https://www.cbioportal.org/api/studies/{STUDY}"))["allSampleCount"]
print(f"gene panel matrix: {len(rows)} samples at {COMMIT[:8]}; portal serves {served}")
```

```
        300 B  meta_study.txt
        455 B  LICENSE
    525,403 B  data_gene_panel_matrix.txt
  1,915,057 B  data_clinical_sample.txt
gene panel matrix: 10945 samples at 582e2862; portal serves 10945
```

To find the commit for a study: `https://api.github.com/repos/cBioPortal/datahub/commits?path=public/<study>&per_page=1`
(unauthenticated GitHub API, 60 requests an hour). Whole-study mutation files are large —
232 MB for `luad_tcga_pan_can_atlas_2018`, 20 MB for `msk_impact_2017` — and the same loop fetches
them. The datasets page's per-study `.tar.gz` (`https://datahub.assets.cbioportal.org/<study>.tar.gz`,
934 MB for LUAD PanCan) is convenient but unpinned: its name carries no version.

## What does not work

Checked 2026-11-15; each cost time the first time.

- **`https://www.cbioportal.org/webservice.do`** — the old pre-REST web service that early R and
  MATLAB clients called: `404`.
- **`/api/timestamps`** — listed in the API spec, answers `500`. Use `importDate` per study.
- **`media.githubusercontent.com/media/cBioPortal/datahub/...`** — GitHub's LFS media URL
  served `luad_tcga_pan_can_atlas_2018/data_clinical_patient.txt` but `404`s with an empty body for
  `msk_impact_2017/data_mutations.txt`. The datahub's LFS objects live in its own store, so use
  the batch call in Route 2.
- **The older `cbioportal-datahub` S3 bucket address** that some tutorials use for study
  tarballs: `403`. `datahub.assets.cbioportal.org` serves the same tarballs.
- **`raw.githubusercontent.com` on a `data*.txt` file** returns the ~130-byte LFS pointer, not the
  data — with HTTP 200. Check the first line before parsing.
- **`/api/swagger-ui.html`** — `404`; the interactive docs are at `/api/swagger-ui/index.html`,
  the machine spec at `/api/v3/api-docs` (OpenAPI 3) or `/api/v2/api-docs` (Swagger 2).

## Try it

A cold check that this skill still holds. Public data, no account, no key, Python standard
library only. Runs in an empty directory in about a minute and does not need `cbio.py`.

**Data** — the cBioPortal public instance's REST API (study metadata, gene panels, mutation,
copy-number and gene-panel endpoints for `msk_impact_2017` under ODbL, `luad_tcga` under the TCGA
GDAC licence, `gbm_tcga_pub` and `msk_met_2021`), plus the `msk_impact_2017` `LICENSE` and gene
panel matrix from the datahub at commit `582e2862e963f6f13840625dfbdaa09e7dcca560`. No CC BY-NC-ND
data is downloaded; `msk_met_2021` is read for its description and licence only. Last confirmed
reachable 2026-11-15.

```python
import hashlib, json, re, urllib.error, urllib.parse, urllib.request

API = "https://www.cbioportal.org/api"
COMMIT = "582e2862e963f6f13840625dfbdaa09e7dcca560"
RAW = f"https://raw.githubusercontent.com/cBioPortal/datahub/{COMMIT}"
H = {"Content-Type": "application/json", "User-Agent": "cbioportal-skill"}


def call(path, body=None, **q):
    url = API + path + ("?" + urllib.parse.urlencode(q) if q else "")
    req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(),
                                 headers=H, method="GET" if body is None else "POST")
    try:
        with urllib.request.urlopen(req, timeout=300) as fh:
            return fh.status, json.loads(fh.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:200].decode()


def raw(url):
    with urllib.request.urlopen(url, timeout=120) as fh:
        return fh.read()


info = call("/info")[1]
print(f"serving              : {info['portalVersion']}, genes {info['geneTableVersion']}")

# 1. INVARIANT. Symbol lookup drops renamed genes silently; the alias route recovers them.
_, got = call("/genes/fetch", ["TP53", "MLL2", "FAM123B"], geneIdType="HUGO_GENE_SYMBOL")
assert [g["hugoGeneSymbol"] for g in got] == ["TP53"], got
_, alias = call("/genes", alias="FAM123B")
assert [(g["entrezGeneId"], g["hugoGeneSymbol"]) for g in alias] == [(139285, "AMER1")], alias
print(f"symbol lookup        : 3 asked, {len(got)} returned; FAM123B -> AMER1 by alias")

# 2. INVARIANT. Silent empties versus honest errors.
assert call("/studies/luad_tcga_pancan")[0] == 404
s, body = call("/molecular-profiles/msk_impact_2017_mutations/mutations/fetch",
               {"sampleListId": "msk_impact_all", "entrezGeneIds": [7157]})
assert (s, body) == (200, []), (s, body)
assert call("/sample-lists/msk_impact_all")[0] == 404
print("bad sample list      : 200 [] on fetch, 404 on direct lookup")

# 3. INVARIANT. Panel-aware denominator equals the portal's own, and is below the study size.
S, CXCR4 = "msk_impact_2017", 7852
gpd = call("/gene-panel-data/fetch", {"molecularProfileIds": [f"{S}_mutations"]})[1]
panels = {p: {g["entrezGeneId"] for g in call(f"/gene-panels/{p}")[1]["genes"]}
          for p in {r["genePanelId"] for r in gpd if r.get("genePanelId")}}
prof = {r["sampleId"] for r in gpd if r["profiled"]
        and (r.get("genePanelId") is None or CXCR4 in panels[r["genePanelId"]])}
muts = call("/mutations/fetch", {"molecularProfileIds": [f"{S}_mutations"], "entrezGeneIds": [CXCR4]})[1]
mutated = {m["sampleId"] for m in muts} & prof
srv = next(g for g in call("/mutated-genes/fetch", {"studyIds": [S]})[1] if g["entrezGeneId"] == CXCR4)
n_all = call(f"/studies/{S}")[1]["allSampleCount"]
assert len(prof) == srv["numberOfProfiledCases"] < n_all, (len(prof), srv, n_all)
assert len(mutated) == srv["numberOfAlteredCasesOnPanel"], (len(mutated), srv)
print(f"CXCR4 in {S}: {len(mutated)} / {len(prof)} profiled (study has {n_all}); "
      f"panels {sorted(panels)}")

# 4. INVARIANT. The CNA matrix carries 0 for samples whose panel never covered the gene.
cna = call("/molecular-data/fetch", {"molecularProfileIds": [f"{S}_cna"], "entrezGeneIds": [CXCR4]})[1]
off = [c["value"] for c in cna if c["sampleId"] not in prof]
assert off and set(off) == {0}, set(off)
print(f"CNA off-panel rows   : {len(off)} samples report 0 for a gene they were not tested for")

# 5. INVARIANT. Firehose Legacy LUAD: fewer samples sequenced than in the study.
st = call("/studies/luad_tcga")[1]
kras = next(g for g in call("/mutated-genes/fetch", {"studyIds": ["luad_tcga"]})[1] if g["entrezGeneId"] == 3845)
assert kras["numberOfProfiledCases"] < st["allSampleCount"], (kras, st["allSampleCount"])
print(f"luad_tcga KRAS       : {kras['numberOfAlteredCases']}/{kras['numberOfProfiledCases']} profiled "
      f"= {kras['numberOfAlteredCases'] / kras['numberOfProfiledCases']:.1%}; "
      f"÷ {st['allSampleCount']} would say {kras['numberOfAlteredCases'] / st['allSampleCount']:.1%}")

# 6. INVARIANT. More than one discrete CNA profile exists; "first match" is a choice.
cn = [p["molecularProfileId"] for p in call("/studies/gbm_tcga_pub/molecular-profiles")[1]
      if p["molecularAlterationType"] == "COPY_NUMBER_ALTERATION" and p["datatype"] == "DISCRETE"]
assert len(cn) > 1, cn
print(f"gbm_tcga_pub         : {len(cn)} DISCRETE CNA profiles {cn}")

# 7. INVARIANT. Licence: the description and the datahub LICENSE can disagree.
desc = call("/studies/msk_met_2021")[1]["description"]
assert re.search(r"BY-NC", desc), desc[-200:]
lic = raw(f"https://raw.githubusercontent.com/cBioPortal/datahub/master/public/msk_met_2021/LICENSE").decode()
assert "ODbL" in lic and "NonCommercial" not in lic, lic[:120]
lic17 = raw(f"{RAW}/public/{S}/LICENSE").decode()
assert lic17.startswith("The data are available under the ODC Open Database License"), lic17[:80]
print("msk_met_2021 terms   : description CC BY-NC-ND, datahub LICENSE ODbL -- read both")

# 8. INVARIANT. A pinned datahub file is an LFS pointer; the object verifies against it,
#    and its sample count matches what the API serves.
ptr = raw(f"{RAW}/public/{S}/data_gene_panel_matrix.txt").decode()
assert ptr.startswith("version https://git-lfs.github.com/spec/v1"), ptr[:60]
p = dict(line.split(" ", 1) for line in ptr.strip().splitlines())
oid, size = p["oid"].split(":")[1], int(p["size"])
lfs = next(l.split("=", 1)[1].strip() for l in raw(f"{RAW}/.lfsconfig").decode().splitlines()
           if l.strip().startswith("url")).rstrip("/")
req = urllib.request.Request(f"{lfs}/objects/batch", method="POST",
    data=json.dumps({"operation": "download", "transfers": ["basic"],
                     "objects": [{"oid": oid, "size": size}]}).encode(),
    headers={"Accept": "application/vnd.git-lfs+json", "Content-Type": "application/vnd.git-lfs+json"})
href = json.loads(urllib.request.urlopen(req, timeout=60).read())["objects"][0]["actions"]["download"]["href"]
data = raw(href)
assert len(data) == size and hashlib.sha256(data).hexdigest() == oid
n_rows = len([r for r in data.decode().splitlines()[1:] if r])
assert n_rows == len(gpd), (n_rows, len(gpd))
print(f"datahub {COMMIT[:8]}    : gene panel matrix {size:,} B, sha256 ok, {n_rows} samples = API")
```

**Expect.** Invariants first — a failure in any of these means the skill is wrong, not that
upstream moved:

- `/genes/fetch` returns **only `TP53`** for `TP53`, `MLL2`, `FAM123B`, and the alias route maps
  `FAM123B` to Entrez `139285` / `AMER1`.
- An unknown study is `404`; a misspelt sample list is `200 []` on a fetch and `404` on direct
  lookup.
- For CXCR4 in `msk_impact_2017`, the panel-aware profiled count equals the portal's
  `numberOfProfiledCases` and is **smaller than the study**; the on-panel mutated count equals
  `numberOfAlteredCasesOnPanel`.
- Every CNA row for a sample not profiled for CXCR4 has the value `0`, and there is at least one.
- `luad_tcga` KRAS profiled count is smaller than its sample count.
- `gbm_tcga_pub` has more than one discrete CNA profile.
- `msk_met_2021`'s description says BY-NC while its datahub `LICENSE` says ODbL; the pinned
  `msk_impact_2017` `LICENSE` is ODbL.
- The pinned gene panel matrix is an LFS pointer, the object matches its sha256 and size, and its
  sample count equals the API's gene-panel-data row count.

Observed values, read 2026-11-15 — a mismatch here is drift to investigate, not a bug:

```
serving              : v7.2.3, genes hgnc_v7_2025.10.7
symbol lookup        : 3 asked, 1 returned; FAM123B -> AMER1 by alias
bad sample list      : 200 [] on fetch, 404 on direct lookup
CXCR4 in msk_impact_2017: 38 / 8136 profiled (study has 10945); panels ['IMPACT341', 'IMPACT410']
CNA off-panel rows   : 2809 samples report 0 for a gene they were not tested for
luad_tcga KRAS       : 75/230 profiled = 32.6%; ÷ 586 would say 12.8%
gbm_tcga_pub         : 2 DISCRETE CNA profiles ['gbm_tcga_pub_cna_consensus', 'gbm_tcga_pub_cna_rae']
msk_met_2021 terms   : description CC BY-NC-ND, datahub LICENSE ODbL -- read both
datahub 582e2862    : gene panel matrix 525,403 B, sha256 ok, 10945 samples = API
```

If invariant 7 fails because the two now agree, the conflict was fixed upstream — rewrite the
licence table, do not loosen `study_terms`.

## Citing it

Cite the portal — Cerami et al., *Cancer Discovery* 2012 (PMID 22588877); Gao et al., *Science
Signaling* 2013 (PMID 23550210); de Bruijn et al., *Cancer Research* 2023 (PMID 37668528) — **and**
the study's own paper, which `/api/studies/{id}` gives as `citation` and `pmid` (`msk_impact_2017`:
Zehir et al., *Nat Med* 2017, PMID 28481359; TCGA PanCancer Atlas: PMID 29625048 and the companion
papers its `pmid` field lists). Beside each number: the study id, its `importDate` or datahub
commit, the molecular profile id, and the denominator rule. ODbL asks for attribution on any
public use and share-alike on a public derived database; CC BY-NC-ND studies forbid commercial use
and redistribution of adapted data.
