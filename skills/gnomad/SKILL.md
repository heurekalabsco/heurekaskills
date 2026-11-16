---
name: gnomad
description: Get gnomAD allele frequencies by genetic ancestry group (exomes, genomes, joint), QC filters, coverage and LOEUF/pLI gene constraint from the GraphQL API and pinned v4 release files, without reading absence as AF 0.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [public-data, human-genetics, variant-effect, vcf]
covers: [gnomad, genome aggregation database, allele frequency, population frequency, minor allele frequency, genetic ancestry, exome, whole genome, joint frequency, filtering allele frequency, faf95, grpmax, popmax, loeuf, pli, gene constraint, loss of function, missense z, coverage, allele number, ac0, vqsr, segdup, rare variant, grch38, grch37, rsid, hemizygous, sites vcf, human]
papers: [PMID:38057664, PMID:32461654, PMID:27535533, PMID:34859531]
access: [open]
datasets: [https://gnomad.broadinstitute.org/api, https://storage.googleapis.com/gcp-public-data--gnomad/release/4.1.2/constraint/gnomad.v4.1.2.constraint_metrics.tsv.bgz, https://storage.googleapis.com/gcp-public-data--gnomad/release/4.1.1/vcf/exomes/gnomad.exomes.v4.1.1.sites.chr1.vcf.bgz.tbi]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-11-15
  against: gnomAD GraphQL API (variants v4.1.1 exomes and genomes, joint v4.1, constraint v4.1.2) / gcp-public-data--gnomad release 4.1, 4.1.1, 4.1.2 / Ensembl REST release 116 / Python 3.12.8 standard library / pysam 0.24.1 / curl 8.7 / macOS arm64
  executed: 11
  unverified: 0
---

# gnomAD — population allele frequencies and gene constraint

The Genome Aggregation Database (gnomAD, Broad Institute) aggregates exome and genome
sequencing from population and disease cohorts and publishes summary counts: how often each
variant was seen, in which genetic ancestry groups, how well each base was covered, and how
depleted each gene is of loss-of-function variation. v4 holds 730,947 exomes and 76,215
genomes on GRCh38. v2.1.1 (125,748 exomes, 15,708 genomes) is still served, on **GRCh37**.

This skill keys every lookup on a **variant id** (`chrom-pos-ref-alt`, GRCh38) or an
**Ensembl gene id**, reads the three frequency records (exomes, genomes, joint) separately,
and ends with files on disk: an annotated variant table, a gene constraint table, or a VCF
slice cut from the release files without downloading a chromosome.

**What you need: nothing.** The API and the release buckets are anonymous. There is no key,
and no key raises the limits.

**Not a frequency of zero.** The commonest misuse of gnomAD is reading "not in gnomAD" as
AF = 0. The API cannot tell an absent variant from a mistyped one, a wrong-build coordinate or
an indel spelled differently. See *Absence is not AF = 0*.

## Terms of use

From the gnomAD terms (<https://gnomad.broadinstitute.org/terms>, read 2026-11-15 from the
browser's source, since the page itself is rendered by JavaScript):

> The primary data from the gnomAD exomes and genomes are available free of restrictions
> under the Creative Commons Zero Public Domain Dedication.

So commercial use is fine. gnomAD asks for attribution anyway, and asks tool builders to say
"This tool includes data from the gnomAD v4.1 release" rather than putting "gnomAD" in a tool
name (it is a Broad trademark). Users "agree to not attempt to reidentify participants."

One carve-out matters for an agent: **some annotations are not CC0.** The terms name SpliceAI
scores, "provided with permission under a CC BY NC 4.0 license for academic and non-commercial
use." The API serves them through `in_silico_predictors`. This skill never requests that field;
if you add it, the output is no longer free for commercial use.

Cite the flagship paper (Chen et al. 2024, PMID 38057664) with the release, in gnomAD's own
format: `gnomAD (v4.1, 807,162 individuals, released on 04/19/2024)`. For constraint, also
cite Karczewski et al. 2020 (PMID 32461654).

This page is original text, CC-BY-4.0, by Heureka Labs.

## Pick the release and the build first

| `dataset` in the API | release | build | holds |
|---|---|---|---|
| `gnomad_r4` | v4.1.1 exomes + genomes, v4.1 joint | GRCh38 | exome, genome and joint records |
| `gnomad_r4_non_ukb` | v4 subset without UK Biobank | GRCh38 | for cohorts overlapping UKB |
| `gnomad_r3` (and `_non_*` subsets) | v3.1.2 | GRCh38 | genomes only (`exome` is null) |
| `gnomad_r2_1` (and `_controls`, `_non_*`) | v2.1.1 | **GRCh37** | exomes and genomes, no joint |
| `exac` | ExAC | GRCh37 | exomes only |

The build trap is silent. A GRCh37 coordinate sent to `gnomad_r4`, or a GRCh38 one sent to
`gnomad_r2_1`, returns **"Variant not found"**, which looks exactly like a real absence. APOE e4
is `19-44908684-T-C` on GRCh38 and `19-45411941-T-C` on GRCh37. The API's `liftover(source_variant_id:, reference_genome: GRCh37)`
query maps between the two for variants gnomAD lifted; for anything else use `ensembl`.

**The API does not report its own version.** `meta` holds only the ClinVar release date. What
it serves was checked on 2026-11-15 against the release files. For APOE e4 the exome counts
equal the v4.1 and v4.1.1 sites VCFs (identical for that variant) and the joint counts equal
the v4.1 joint VCF; one variant, so treat that as a spot check. Constraint equals the v4.1.2
file for 23 of 24 sampled genes, but TTN still returns v4.1 values. gnomAD's own browser
pipeline source names v4.1.1 variant tables, the v4.1 joint table and v4.1.2 constraint. For a
pinned analysis, use the files and record which ones.

## The API: limits that fail loudly, and some that do not

`POST https://gnomad.broadinstitute.org/api` with `{"query": ..., "variables": ...}`. Measured
2026-11-15:

| limit | what happens |
|---|---|
| 10 requests per IP per 60 s (gnomAD's stated limit, and what was measured) | 11th request gets **HTTP 429 with an HTML body** and no `Retry-After`. Cleared about 60 s after the first request. A cached answer (`x-cached: HIT`) was still served while uncached requests were refused. |
| query cost 25 | HTTP 400 `Query is too expensive (26). Maximum allowed cost is 25.` A variant lookup costs 1; a region coverage lookup costs 6 for one sequencing type and 11 for exome + genome. |
| variants in a region | HTTP 500 `This region has too many variants to display`. Count-based: 75 kb of chr19 (28,413 variants) passed, 100 kb failed; 100 kb of chr5 (26,380) passed. A 2.6 Mb span failed with `Select a smaller region` regardless of count. |
| variants in a gene | none seen: TTN returned 112,412 variants in one call (9 s). |
| server load | **HTTP 200** with the GraphQL error `Service overloaded`, which carries no `path` either. Seen once on 2026-11-15, on a four-alias batch. A reader that maps aliases by position and treats every null as absent writes that as "not found". `check_batch()` raises `Overloaded`, and `variants()` retries the batch three times, 30 s apart. |
| request body over about 10,240 bytes | **HTTP 200 with someone else's answer.** The body is answered from a cache (`X-Cached: HIT`) with one fixed 285,326-byte response: aliases `v0` to `v19` holding chr11 and chr12 variants (`v0` is `11-46320530-TG-T`), whatever was asked. A plain `GET /api` returns the same body. A one-alias query padded to 9,492 or 10,015 bytes came back `MISS` and correct; padded to 10,315 or 10,392 bytes it came back `HIT` with that body. In a separate audit, 10 of 10 bodies at or under 10,240 bytes were correct and 7 of 12 at or over 10,241 were wrong. The mechanism is not known. 25 variant lookups with this page's full field set make a body of about 10,450 bytes, so a full-cost batch can cross the line. |

The silent ones. **A lookup that fails, or an overloaded server, returns HTTP 200** with `"data": {"variant": null}` and an
`errors` list. In a batch, the error messages carry no `path`, so they cannot be matched to the
variant that failed. Match results by alias. And **an oversized body returns HTTP 200 with
another query's answer**, so a reader mapping aliases by position writes the wrong variant's
frequencies as present and real variants as absent. The helper below guards it twice: `gql()`
refuses to send a body over 9,500 bytes and `batches()` splits by measured size, and
`check_batch()` raises unless every record's `variant_id` is the id asked for under that alias.
The id check is the one that does not depend on knowing where the threshold sits.

So the throughput, with the full field set below, is about 22 SNV lookups per request (fewer
for long indels; a smaller field set fits up to the cost cap of 25), 10 requests a minute:
about 200 variants a minute. Past a few thousand variants, slice the release files instead.

One call from the shell, to see the shape:

```bash
curl -s https://gnomad.broadinstitute.org/api -H 'Content-Type: application/json' \
  -d '{"query":"{ variant(variantId: \"19-44908684-T-C\", dataset: gnomad_r4) { variant_id rsids joint { ac an filters } } }"}'
# {"data":{"variant":{"variant_id":"19-44908684-T-C","rsids":["rs429358"],"joint":{"ac":232864,"an":1567892,"filters":["discrepant_frequencies"]}}}}
```

### The request helper

Save it as `gnomad_api.py`; every Python block below imports it. Standard library only.

```python
"""gnomad_api.py — one throttled entry point for the gnomAD GraphQL API."""
import json, re, time, urllib.error, urllib.request

API = "https://gnomad.broadinstitute.org/api"
MIN_GAP = 6.5        # the API allows 10 requests per IP per 60 s
MAX_COST = 25        # one variant lookup costs 1; one region coverage lookup costs 11
MAX_BODY = 9500      # bytes; bodies over ~10,240 B can get another client's cached answer
_last = [0.0]
LAST = {"x_cached": None}   # X-Cached header of the last response (HIT or MISS)


class GnomadError(Exception):
    """An HTTP-level failure (400 too expensive, 500 region too large, repeated 429),
    a body too large to send safely, or an answer that is not to the question asked."""


class Overloaded(GnomadError):
    """HTTP 200 with the GraphQL error "Service overloaded": retry later, never read as absent."""


def encode(query, variables=None):
    return json.dumps({"query": query, "variables": variables or {}}).encode()


def gql(query, variables=None, tries=3):
    """POST one query. Returns the parsed body, which may hold `errors` beside `data`.
    Refuses to send a body over MAX_BODY bytes (see *What does not work*)."""
    body = encode(query, variables)
    if len(body) > MAX_BODY:
        raise GnomadError(f"request body is {len(body)} B, over {MAX_BODY} B: split the query")
    for _ in range(tries):
        wait = MIN_GAP - (time.monotonic() - _last[0])
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(API, data=body, headers={
            "Content-Type": "application/json", "User-Agent": "gnomad-skill (python urllib)"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                _last[0] = time.monotonic()
                LAST["x_cached"] = r.headers.get("X-Cached")
                return json.load(r)
        except urllib.error.HTTPError as e:
            _last[0] = time.monotonic()
            text = e.read().decode("utf-8", "replace")
            if e.code == 429:                    # an HTML page with no Retry-After header
                time.sleep(61)
                continue
            try:
                msg = "; ".join(x["message"] for x in json.loads(text)["errors"])
            except (ValueError, KeyError, TypeError):
                msg = text[:200]
            raise GnomadError(f"HTTP {e.code}: {msg}") from None
    raise GnomadError("still rate-limited after retries")


VARIANT_ID = re.compile(r"^(?:chr)?([1-9]|1[0-9]|2[0-2]|X|Y|MT?)-([1-9][0-9]*)-([ACGT]+)-([ACGT]+)$", re.I)


def norm_id(vid):
    """'chr19-44908684-t-c' -> '19-44908684-T-C'; 'MT-...' -> 'M-...'. Raises ValueError otherwise."""
    m = VARIANT_ID.match(vid.strip())
    if not m:
        raise ValueError(f"not a chrom-pos-ref-alt id (chromosome 1-22, X, Y or M/MT, "
                         f"position from 1 with no leading zero, REF and ALT in ACGT): {vid!r}")
    c, p, ref, alt = m.groups()
    if ref.upper() == alt.upper():
        raise ValueError(f"REF equals ALT, not a variant: {vid!r}")
    c = "M" if c.upper() == "MT" else c.upper()
    return f"{c}-{p}-{ref.upper()}-{alt.upper()}"


SEQ = "ac an filters populations { id ac an homozygote_count }"
FIELDS = f"""variant_id rsids flags
  exome {{ {SEQ} flags faf95 {{ popmax popmax_population }} }}
  genome {{ {SEQ} flags faf95 {{ popmax popmax_population }} }}
  joint {{ {SEQ} faf95 {{ popmax popmax_population }} }}"""


def variant_query(chunk, dataset, fields):
    return "query {" + " ".join(f'v{j}: variant(variantId: "{v}", dataset: {dataset}) {{ {fields} }}'
                                for j, v in enumerate(chunk)) + "}"


def batches(ids, dataset="gnomad_r4", fields=FIELDS):
    """Split ids into lists whose query costs at most MAX_COST and whose encoded body is
    at most MAX_BODY bytes. The size is measured, not assumed from an id count."""
    out = [[]]
    for v in ids:
        if out[-1] and (len(out[-1]) == MAX_COST or
                        len(encode(variant_query(out[-1] + [v], dataset, fields))) > MAX_BODY):
            out.append([])
        out[-1].append(v)
    return [c for c in out if c]


def check_batch(chunk, res):
    """Map one batch's response to {id: record or None}, or raise GnomadError.

    Every alias must be present and no other; every record's variant_id must be the id
    asked for under its alias; the only error accepted is "Variant not found", one per
    null record. The errors carry no path, so nothing is matched by error order."""
    data, errors = res.get("data"), res.get("errors") or []
    where = f"(X-Cached: {LAST['x_cached']})"
    if not isinstance(data, dict):
        raise GnomadError(f"no data in response {where}: {errors[:3]}")
    other = [e.get("message") for e in errors if e.get("message") != "Variant not found"]
    if "Service overloaded" in other:
        raise Overloaded(f"Service overloaded {where}")
    if other:
        raise GnomadError(f"unexpected errors {where}: {other[:3]}")
    if set(data) != {f"v{j}" for j in range(len(chunk))}:
        raise GnomadError(f"asked aliases v0..v{len(chunk) - 1}, response has {len(data)}: "
                          f"{sorted(data)[:5]} {where}")
    out = {}
    for j, v in enumerate(chunk):
        rec = data[f"v{j}"]
        if rec is not None and rec.get("variant_id") != v:
            raise GnomadError(f"asked {v} as v{j}, answer is for {rec.get('variant_id')} {where}")
        out[v] = rec
    if sum(r is None for r in out.values()) != len(errors):
        raise GnomadError(f"{len(errors)} 'Variant not found' errors for "
                          f"{sum(r is None for r in out.values())} null records {where}")
    return out


def variants(ids, dataset="gnomad_r4", fields=FIELDS):
    """{normalised id: record, or None when the API said "Variant not found"}.

    Sends as many batches as keep each body under MAX_BODY (about 22 SNVs with FIELDS)
    and checks every answer with check_batch(), which raises GnomadError on a record
    for the wrong variant, a missing or extra alias, or any other error. A batch
    answered "Service overloaded" is retried up to three times, 30 s apart."""
    if not re.search(r"\bvariant_id\b", fields):
        fields = "variant_id " + fields          # needed to check each answer
    ids = list(dict.fromkeys(norm_id(v) for v in ids))
    out = {}
    for chunk in batches(ids, dataset, fields):
        for attempt in range(4):
            try:
                out.update(check_batch(chunk, gql(variant_query(chunk, dataset, fields))))
                break
            except Overloaded:
                if attempt == 3:
                    raise
                time.sleep(30)
    return out


def groups(seq):
    """Genetic ancestry groups only. The list also holds XX/XY totals, sex splits
    (nfe_XX), HGDP and 1000 Genomes subsets (hgdp:han, 1kg:gbr) and, in joint, a
    row with an empty id plus a second copy of XX and XY."""
    return {p["id"]: p for p in (seq or {}).get("populations") or []
            if p["id"] and "_" not in p["id"] and ":" not in p["id"] and p["id"] not in ("XX", "XY")}


def af(seq):
    return seq["ac"] / seq["an"] if seq and seq["an"] else None


def coverage_at(chrom, pos, dataset="gnomad_r4", ref="GRCh38"):
    """Per-base coverage at one position. The region query pads the window, so the
    exact base is picked out. [] for exomes means outside the exome capture."""
    q = """query($c: String!, $p: Int!) { region(chrom: $c, start: $p, stop: $p, reference_genome: %s) {
      coverage(dataset: %s) { exome { pos mean median over_10 over_20 } genome { pos mean median over_10 over_20 } } } }""" % (ref, dataset)
    cov = gql(q, {"c": chrom, "p": pos})["data"]["region"]["coverage"]
    return {k: next((b for b in cov[k] if b["pos"] == pos), None) for k in ("exome", "genome")}
```

`variant()` also takes `rsid:`, but an rsid that names more than one allele returns
`Multiple variants found, query using variant ID to select one.` (`rs877973` names two). Use
`variant_search(query: "rs877973", dataset: gnomad_r4) { variant_id }` to list them, then
query by id.

## A variant: three records, and a population list that is not a list of groups

```python
from gnomad_api import variants, groups, af

rec = variants(["19-44908684-T-C"])["19-44908684-T-C"]          # APOE e4, rs429358
for kind in ("exome", "genome", "joint"):
    s = rec[kind]
    print(f"{kind:6} AC={s['ac']:>7} AN={s['an']:>8} AF={af(s):.4f} filters={s['filters']}")
    print("       ", {g: round(af(p), 3) for g, p in sorted(groups(s).items()) if p["an"]})
print("grpmax FAF95 (joint):", rec["joint"]["faf95"])
```

Printed on 2026-11-15:

```
exome  AC= 208931 AN= 1415800 AF=0.1476 filters=[]
        {'afr': 0.227, 'amr': 0.104, 'asj': 0.12, 'eas': 0.098, 'fin': 0.191, 'mid': 0.068, 'nfe': 0.151, 'remaining': 0.139, 'sas': 0.1}
genome AC=  23933 AN=  152092 AF=0.1574 filters=[]
        {'afr': 0.216, 'ami': 0.136, 'amr': 0.113, 'asj': 0.119, 'eas': 0.098, 'fin': 0.195, 'mid': 0.068, 'nfe': 0.138, 'remaining': 0.115, 'sas': 0.105}
joint  AC= 232864 AN= 1567892 AF=0.1485 filters=['discrepant_frequencies']
        {'afr': 0.22, 'ami': 0.136, 'amr': 0.107, 'asj': 0.12, 'eas': 0.098, 'fin': 0.192, 'mid': 0.068, 'nfe': 0.151, 'remaining': 0.138, 'sas': 0.101}
grpmax FAF95 (joint): {'popmax': 0.21762494000000002, 'popmax_population': 'afr'}
```

What to read off it:

- **Exomes, genomes and joint are separate records**, and any of them can be null. A variant
  outside the exome capture has `exome: null`; v3 has no exomes at all.
- **The joint record has no `af` field.** Compute `ac / an`. The exome and genome records do
  have `af`.
- **Joint AN can include alleles from a dataset whose record is null.** `19-44906030-C-G` (APOE
  intron) has `exome: null`, genome AC 1 of AN 151,854, and joint AC 1 of **AN 793,800**: the
  joint AN carries 641,946 alleles from the exomes, whose record is null, and the joint
  frequency is five times lower than the genome one. Report which record a frequency came from.
- **`populations` mixes four kinds of row**: ancestry groups (`afr`, `nfe`, `remaining`, ...),
  sex totals (`XX`, `XY`), sex splits (`nfe_XX`), and in genomes the HGDP and 1000 Genomes
  subsets (`hgdp:han`, `1kg:gbr`). The joint list also carried a row with an empty id and a
  duplicate `XX` and `XY`. Summing the raw list counts every allele several times. `groups()`
  keeps the ancestry groups, whose AC sums to the total.
- **`faf95` is the filtering allele frequency**: per group, a Poisson 95% bound below the
  observed AF, and here the maximum across groups. It is the number to compare against a
  maximum credible frequency for a disease allele. Its `popmax` field is the value and
  `popmax_population` the group. Only some groups get a FAF: the v4 exome VCF carries
  `faf95_` fields for `afr`, `amr`, `eas`, `mid`, `nfe` and `sas`, and none for `asj`, `fin`,
  `ami` or `remaining` (v2 and v3: `afr`, `amr`, `eas`, `nfe`, `sas`). A founder-population
  allele can be common in `asj` or `fin` and still have a low FAF, because those groups are not
  in the maximum.
- **`discrepant_frequencies`** in joint `filters` flags a variant whose exome and genome
  frequencies disagree; the joint record's `freq_comparison_stats` holds the tests behind it
  (contingency table and Cochran-Mantel-Haenszel). For G6PD A- (`X-154536002-C-T`) the genome
  AF is 0.0335 and the exome AF 0.0037. Compare the group-level frequencies before choosing
  which figure to quote, and never quote the joint figure alone for a flagged variant.
- On chrX outside the pseudoautosomal regions, XY samples contribute one allele: G6PD A-
  has exome AN 1,098,048 against about 1.46 million for an autosome, and
  `hemizygote_count` (1,071 in exomes) counts the XY carriers.

## Absence is not AF = 0

`variant()` returns null with `Variant not found` in four different situations, and only one
of them is "nobody in gnomAD carries it". Check the other three before saying it is absent.

```python
import urllib.request
from gnomad_api import variants, coverage_at

def reference(chrom, pos, length):
    """GRCh38 bases from Ensembl REST (grch37.rest.ensembl.org for GRCh37)."""
    url = f"https://rest.ensembl.org/sequence/region/human/{chrom}:{pos}..{pos + length - 1}:1?content-type=text/plain"
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read().decode().strip().upper()

def explain(vid, rec):
    chrom, pos, ref, alt = vid.split("-")
    pos = int(pos)
    if rec:
        return "present: " + str({k: rec[k] for k in ("exome", "genome")})
    if reference(chrom, pos, len(ref)) != ref:
        return f"not found, and REF is wrong: GRCh38 has {reference(chrom, pos, len(ref))} here"
    cov = coverage_at(chrom, pos)
    return "not found; fraction of samples at depth >= 20: " + str(
        {k: (round(v["over_20"], 3) if v else "no coverage row") for k, v in cov.items()})

ids = ["19-44908684-T-A",    # APOE exon 4, a base every exome captures
       "19-44905020-T-G",    # APOE intron 1, outside the exome capture
       "19-44905020-T-A",    # same base, a different allele
       "19-44908684-A-C"]    # wrong REF: the reference base here is T
found = variants(ids, fields="variant_id exome { ac an filters } genome { ac an filters }")
for vid, rec in found.items():
    print(vid, explain(vid, rec))
```

```
19-44908684-T-A not found; fraction of samples at depth >= 20: {'exome': 0.96, 'genome': 0.98}
19-44905020-T-G not found; fraction of samples at depth >= 20: {'exome': 'no coverage row', 'genome': 0.98}
19-44905020-T-A present: {'exome': None, 'genome': {'ac': 0, 'an': 152244, 'filters': ['AC0']}}
19-44908684-A-C not found, and REF is wrong: GRCh38 has T here
```

The four cases:

1. **Wrong REF** (typo, wrong strand, or a GRCh37 coordinate): not found. Check REF against
   the reference before anything else. `ensembl` covers the sequence endpoint.
2. **An indel written differently from gnomAD's form**: not found. gnomAD stores indels
   left-aligned and trimmed (VCF normalisation). CFTR F508del is `7-117559590-ATCT-A`; the
   same deletion written right-shifted, `7-117559591-TCTT-T`, has a correct REF and is not
   found. Normalise first (`bcftools norm -f GRCh38.fa`, or `normalise()` in *Get the files*).
3. **Not covered**: not found, and the coverage says why. An empty exome coverage list means
   the base is outside the exome capture, so the exomes say nothing about it; only the genomes'
   ~76,000 samples were looked at.
4. **Covered and genuinely unobserved**: the only case that supports "rare". Even then it is an
   upper bound, not zero. With about 1.4 million exome alleles at depth, "not seen" bounds the
   AF at roughly 3 / 1,400,000 (the rule of three). gnomAD publishes the exact AN at every
   callable base in the *allele number at all sites* files (see *Get the files*).

And a fifth state that is not absence: **a present row with AC 0** (`19-44905020-T-A` above).
`AC0` means the allele was called but no sample had a high-quality genotype for it. In v4
exomes these rows are common: 2,896 of 5,733 variants in a 5 kb APOE window, and 4,515 of
9,185 rows in the PCSK9 exome VCF slice, were AC0. Drop them before counting variants.

## Filters and flags

| where | value | meaning |
|---|---|---|
| `exome.filters`, `genome.filters` | `[]` | PASS |
| | `AC0` | no high-quality genotype carries the allele |
| | `AS_VQSR` | failed allele-specific VQSR (v3, v4) |
| | `RF` | failed the random-forest filter (v2 only; v2 has no `AS_VQSR`) |
| | `InbreedingCoeff` | excess heterozygotes (inbreeding coefficient below -0.3) |
| `joint.filters` (API) | `discrepant_frequencies`, `not_called_in_exomes`, `AC0` | the API's own values, **not** a union of the two filter lists |
| `flags` (variant level) | `lcr`, `segdup`, `lc_lof`, ... | low-complexity region, segmental duplication, low-confidence pLoF |
| `exome.flags`, `genome.flags` | `lcr`, `segdup` | same regions, per dataset |

Read `exome.filters` and `genome.filters`, never `joint.filters` alone. In the APOE window,
211 variants had `AC0` in `joint.filters` while their joint AC was above zero (the exome
record was AC0, the genome record carried the allele), and an `AS_VQSR` failure in exomes
did not appear in `joint.filters` at all.

In the release files the joint VCF spells this differently: the FILTER column is
`PASS`, `EXOMES_FILTERED`, `GENOMES_FILTERED` or `BOTH_FILTERED`, with the per-dataset values
in INFO `exomes_filters` and `genomes_filters`.

## Gene constraint

Constraint is per transcript and keyed on an **unversioned** Ensembl gene id. LOEUF is the
field `oe_lof_upper`; there is no field named `loeuf`. Lower is more constrained.

```python
from gnomad_api import gql

Q = """query($g: String!, $rg: ReferenceGenomeId!) { gene(gene_id: $g, reference_genome: $rg) {
  gene_id symbol mane_select_transcript { ensembl_id }
  gnomad_constraint { obs_lof exp_lof oe_lof oe_lof_upper oe_lof_percentile pLI mis_z flags } } }"""

for gid, build in [("ENSG00000136531", "GRCh38"),   # SCN2A
                   ("ENSG00000169174", "GRCh38"),   # PCSK9
                   ("ENSG00000169174", "GRCh37"),   # same gene, v2.1.1 constraint
                   ("ENSG00000169174.11", "GRCh38")]:
    res = gql(Q, {"g": gid, "rg": build})
    g = res["data"]["gene"]
    if g is None:
        print(gid, build, "->", res["errors"][0]["message"])
        continue
    c = g["gnomad_constraint"]
    print(f"{g['symbol']:6} {build}  LOEUF={c['oe_lof_upper']:.3f}  obs/exp pLoF={c['obs_lof']}/{c['exp_lof']:.1f}"
          f"  pLI={c['pLI']:.2g}  percentile={c['oe_lof_percentile']}  flags={c['flags']}")

# A symbol is not a key: gene_symbol silently picks one gene; gene_search shows there are two.
print(gql('{ gene(gene_symbol: "MATR3", reference_genome: GRCh38) { gene_id } }')["data"])
print(gql('{ gene_search(query: "MATR3", reference_genome: GRCh38) { ensembl_id symbol } }')["data"]["gene_search"][:2])
```

```
SCN2A  GRCh38  LOEUF=0.154  obs/exp pLoF=20/188.7  pLI=1  percentile=1  flags=[]
PCSK9  GRCh38  LOEUF=1.144  obs/exp pLoF=57/62.1  pLI=2.8e-18  percentile=71  flags=[]
PCSK9  GRCh37  LOEUF=1.341  obs/exp pLoF=26/26.9  pLI=2.7e-17  percentile=None  flags=[]
ENSG00000169174.11 GRCh38 -> Gene not found
{'gene': {'gene_id': 'ENSG00000015479'}}
[{'ensembl_id': 'ENSG00000015479', 'symbol': 'MATR3'}, {'ensembl_id': 'ENSG00000280987', 'symbol': 'MATR3'}]
```

- **`reference_genome` chooses the release.** GRCh38 gives v4 constraint (MANE Select
  transcript), GRCh37 gives v2.1.1 (canonical transcript). The numbers are not comparable:
  gnomAD notes that o/e is higher in v4 for all genes, so a v2 LOEUF cut-off selects a
  different number of genes in v4.
- **LOEUF changed definition at v4.1.1.** The v4.1 README defines it as the upper bound of a
  90% confidence interval; the v4.1.1 README and gnomAD's constraint help describe a gamma
  posterior bound, with allele number replacing coverage in the expected counts. PCSK9 LOEUF is 1.250 in the
  v4.1 file and 1.144 in v4.1.1 and v4.1.2. State the file version beside any LOEUF.
- **Do not use the v4.1.1 percentile columns.** v4.1.2 changed only the rank and bin columns
  (`lof.oe_ci.upper_bin_percentile` differs on 17,909 rows, `..._bin_decile` on 14,797); for
  FAM209B the percentile is 67 in v4.1.1 and 92 in v4.1.2. The API's `oe_lof_percentile`
  matched v4.1.2 for all 23 sampled genes.
- **`gnomad_constraint` can be null** (mitochondrial genes, `MT-ND1`) or present with nulls and a
  flag (`no_exp_lof` for PCDHB2). Read `flags` before the numbers: `outlier_syn` (TTN) marks a
  gene whose synonymous count is far from expectation, so its metrics are suspect, and a flag
  never means "constrained".
- **A symbol is not an id.** Six real symbols map to two Ensembl genes each in the v4.1.2 file
  (MATR3, MKKS, PINX1, POLR2J3, SIGLEC5, TBCE). `gene(gene_symbol: "MATR3")` returns
  ENSG00000015479, whose MANE LOEUF is 0.107; a symbol join against the file can hand back
  the other gene's rows. Join on `gene_id`.

## Field names that changed between versions

| concept | v2.1.1 (GRCh37) | v3.1.2 | v4.1 / v4.1.1 |
|---|---|---|---|
| catch-all group, VCF | `AF_oth` | `AF_oth` | `AF_remaining` |
| catch-all group, API `populations.id` | `oth` | `oth` | `remaining` |
| sex split, VCF | `AF_female`, `AF_nfe_female` | `AF_XX`, `AF_nfe_XX` | `AF_XX`, `AF_nfe_XX` |
| group with highest AF, VCF | `popmax`, `AF_popmax` | `popmax`, `AF_popmax` | `grpmax`, `AF_grpmax` |
| highest filtering AF, VCF | `faf95` plus per group (`faf95_nfe`), no max field | same as v2 | `fafmax_faf95_max`, `fafmax_faf95_max_gen_anc` |
| variant QC filter | `RF` | `AS_VQSR` | `AS_VQSR` |
| joint exome+genome | none | none | separate joint VCF: `AC_joint`, `AN_joint`, `AF_joint`, `grpmax_joint`, `exomes_filters`, `genomes_filters` |
| constraint file | `lof_metrics.by_gene.txt.bgz`: `oe_lof_upper`, `pLI`, `gene_id` (column 64) | none | `constraint_metrics.tsv(.bgz)`: `lof.oe_ci.upper`, `lof.pLI`, `gene_id` |

The API keeps the old names where the files changed them: `faf95 { popmax popmax_population }`
in every dataset, and `XX`/`XY` even for v2. v4.1.1 sites VCFs add only `VRS_*` fields to
v4.1 in the chr21 header; APOE e4 counts are identical in both.

## Get the files

The release files are on two public buckets. **Neither is requester-pays**: anonymous HTTPS
reads work with no project and no credentials (checked 2026-11-15).

- Google Cloud: `gs://gcp-public-data--gnomad`, over HTTPS at
  `https://storage.googleapis.com/gcp-public-data--gnomad/release/...`
- AWS: `s3://gnomad-public-us-east-1` (`aws s3 ls --no-sign-request`), over HTTPS at
  `https://gnomad-public-us-east-1.s3.amazonaws.com/release/...`
- The Azure mirror, `datasetgnomad.blob.core.windows.net`, no longer resolves (NXDOMAIN).

What the files cost to get (bytes from the GCS listing, 2026-11-15):

| file set | size |
|---|---|
| v4.1.1 exome sites VCFs, all chromosomes | 185.6 GiB (chr1 17.6 GiB) |
| v4.1.1 genome sites VCFs | 526.8 GiB (chr1 41.3 GiB) |
| v4.1 joint sites VCFs | 816.7 GiB (chr1 67.1 GiB) |
| v4.1 exome sites Hail Table | 259.8 GiB |
| v2.1.1 exome / genome sites VCFs (GRCh37) | 117.6 / 931.6 GiB |
| v4.1.2 constraint TSV (`.tsv.bgz`) | 548 MiB, 221,897 transcript rows |
| v4.1 allele number at all sites, exomes / genomes | 1.07 / 11.19 GiB |
| v4.0 exome coverage summary TSV | 3.77 GiB |
| v3.0.1 genome coverage summary TSV | 75.4 GiB |

Every VCF is bgzipped with a `.tbi` index beside it, so a region can be read **without
downloading the chromosome**.

### A gene's constraint, pinned and checksummed

```python
"""Download the pinned gnomAD gene constraint table, verify it, and keep one row per gene."""
import base64, csv, datetime, gzip, hashlib, json, os, urllib.parse, urllib.request

BUCKET, OBJ = "gcp-public-data--gnomad", "release/4.1.2/constraint/gnomad.v4.1.2.constraint_metrics.tsv.bgz"
URL = f"https://storage.googleapis.com/{BUCKET}/{OBJ}"
META = f"https://storage.googleapis.com/storage/v1/b/{BUCKET}/o/{urllib.parse.quote(OBJ, safe='')}"

meta = json.load(urllib.request.urlopen(META, timeout=60))     # size, md5Hash (base64), updated
local = os.path.basename(OBJ)
if not (os.path.exists(local) and os.path.getsize(local) == int(meta["size"])):
    with urllib.request.urlopen(URL, timeout=600) as r, open(local + ".part", "wb") as fh:
        while chunk := r.read(1 << 20):
            fh.write(chunk)
    os.replace(local + ".part", local)
md5 = hashlib.md5()
with open(local, "rb") as fh:
    while chunk := fh.read(1 << 20):
        md5.update(chunk)
assert base64.b64encode(md5.digest()).decode() == meta["md5Hash"], "checksum mismatch: re-download"

# One row per Ensembl gene: the MANE Select transcript. The file also carries every other
# transcript, and a RefSeq copy of each row whose gene_id is an NCBI Gene number.
keep = ["gene_id", "gene", "transcript", "lof.obs", "lof.exp", "lof.oe", "lof.oe_ci.upper",
        "lof.oe_ci.upper_bin_decile", "lof.pLI", "mis.z_score", "mis.oe", "syn.z_score", "constraint_flags"]
n = 0
with gzip.open(local, "rt") as src, open("gene_constraint.v4.1.2.mane.tsv", "w", newline="") as out:
    w = csv.writer(out, delimiter="\t")
    w.writerow(keep)
    for row in csv.DictReader(src, delimiter="\t"):
        if row["mane_select"] == "true" and row["transcript"].startswith("ENST"):
            w.writerow([row[k] for k in keep])
            n += 1
json.dump({"source": URL, "bytes": int(meta["size"]), "md5_base64": meta["md5Hash"],
           "bucket_updated": meta["updated"], "retrieved": datetime.date.today().isoformat(),
           "rows_written": n}, open("MANIFEST.json", "w"), indent=1)
print(n, "MANE Select genes ->", "gene_constraint.v4.1.2.mane.tsv")
```

On 2026-11-15 it printed `18411 MANE Select genes`, one row per `gene_id`, after a 548 MiB
download whose MD5 matched the bucket's (`7OxpdNkcb2DFQZ/Hcsl+5w==`); the download took 8 to
13 minutes on the verifying host. Three things in this file trip a reader:

- **Half the rows are RefSeq duplicates.** 115,252 of 221,897 rows have an `NM_`/`XM_`
  transcript, and on those rows `gene_id` is an NCBI Gene number (`255738` for PCSK9), not an
  Ensembl id. A join on `gene` (the symbol) picks up both copies.
- **561 Ensembl genes have the literal symbol `NA`** (12 of them in the MANE Select extract).
  pandas turns that into a missing value by default; read with `keep_default_na=False` or key
  on `gene_id`.
- **One gene, many transcripts.** Filter to `mane_select == "true"` (or `canonical`) before
  treating rows as genes.

### A region from the sites VCFs, without the chromosome

`pysam` reads a bgzipped VCF over HTTPS through its index, fetching only the blocks it needs.
It needs `pip install pysam` (Linux and macOS wheels). Save as `slice_vcf.py` and run it with
the Python that has pysam.

```python
"""Cut one gene's rows out of the gnomAD release VCFs without downloading the chromosome."""
import pysam

BUCKET = "https://storage.googleapis.com/gcp-public-data--gnomad/release"
FILES = {   # pinned: these are the files the browser and API were built from
    "exomes": BUCKET + "/4.1.1/vcf/exomes/gnomad.exomes.v4.1.1.sites.{c}.vcf.bgz",
    "genomes": BUCKET + "/4.1.1/vcf/genomes/gnomad.genomes.v4.1.1.sites.{c}.vcf.bgz",
    "joint": BUCKET + "/4.1/vcf/joint/gnomad.joint.v4.1.sites.{c}.vcf.bgz",
}

def slice_vcf(kind, chrom, start, end, out):
    """Write header + rows overlapping [start, end] (1-based, inclusive). Returns the row count."""
    tbx = pysam.TabixFile(FILES[kind].format(c=chrom))   # fetches the .tbi into the working directory
    n = 0
    with open(out, "w") as fh:
        fh.write("\n".join(tbx.header) + "\n")
        for line in tbx.fetch(chrom, start - 1, end):    # pysam takes 0-based, half-open
            fh.write(line + "\n")
            n += 1
    return n

# PCSK9, GRCh38 gene span from the API (gene ENSG00000169174)
for kind in ("exomes", "joint"):
    n = slice_vcf(kind, "chr1", 55039447, 55064852, f"PCSK9.{kind}.vcf")
    print(kind, n, "rows")
```

On 2026-11-15 this took 12 to 40 s and wrote 9,185 exome rows (81 MB) and 13,489 joint rows
(146 MB); the INFO column, with VEP annotations, is about 9 KB a row. Release VCFs use `chr1`;
the API uses `1`. Multi-allelic sites are **split, one ALT per row**: 2,639 positions in the
PCSK9 exome slice have more than one row, each with its own AC and AN, and an indel and an SNV
can start at the same position (`chr19 44908684 T C` and `TGCGGCC T`). Split and normalise
your own VCF the same way (`bcftools norm -m -any -f GRCh38.fa`) before matching. 3,709 rows
were `AC0`, 806 `AC0;AS_VQSR`, 234 `AS_VQSR`, 1 `AS_VQSR;InbreedingCoeff` and 4,435 `PASS`.

### Annotate a variant list

For up to a few thousand variants the API is simpler than any file (about 200 lookups a minute). This writes one TSV row
per input, with a `status` column saying *why* a variant has no frequency. Indels are
normalised against GRCh38 (from Ensembl REST) before lookup, which also checks REF. Save it as
`annotate.py` beside `gnomad_api.py`.

```python
"""annotate.py variants.txt out.tsv — gnomAD v4 frequencies for a list of GRCh38 chrom-pos-ref-alt ids."""
import csv, sys, urllib.error, urllib.request
from gnomad_api import variants, coverage_at, af, norm_id

def reference(chrom, start, end):
    """GRCh38 bases start..end (1-based, inclusive) from Ensembl REST."""
    url = f"https://rest.ensembl.org/sequence/region/human/{chrom}:{start}..{end}:1?content-type=text/plain"
    try:
        with urllib.request.urlopen(url, timeout=60) as r:
            return r.read().decode().strip().upper()
    except urllib.error.HTTPError as e:              # 400 for a chromosome or range GRCh38 lacks
        raise LookupError(f"Ensembl {e.code} for {chrom}:{start}-{end}") from None

def normalise(vid, window=200):
    """Check REF against GRCh38, then trim and left-align, as `bcftools norm -f` would.
    gnomAD stores indels left-aligned; any other spelling of the same indel is 'not found'."""
    chrom, pos, ref, alt = vid.split("-")
    pos = int(pos)
    start = max(1, pos - window)
    seq = reference(chrom, start, pos + len(ref) - 1)          # seq[i] is base start + i
    if seq[pos - start:] != ref:
        raise LookupError(f"REF {ref} != GRCh38 {seq[pos - start:]}")
    changed = True
    while changed:
        changed = False
        if ref and alt and ref[-1] == alt[-1]:
            ref, alt, changed = ref[:-1], alt[:-1], True
        if not ref or not alt:
            if pos - 1 < start:
                raise LookupError("indel shifts past the fetched window; widen it")
            base = seq[pos - 1 - start]
            pos, ref, alt, changed = pos - 1, base + ref, base + alt, True
    while len(ref) > 1 and len(alt) > 1 and ref[0] == alt[0]:
        ref, alt, pos = ref[1:], alt[1:], pos + 1
    return f"{chrom}-{pos}-{ref}-{alt}"

COLS = ["input", "variant_id", "status"] + [f"{k}_{f}" for k in ("exome", "genome", "joint")
        for f in ("ac", "an", "af", "filters")] + ["joint_faf95_grpmax", "joint_faf95_group", "flags",
        "exome_over20", "genome_over20"]

rows = []
for line in open(sys.argv[1]):
    v = line.strip()
    if not v or v.startswith("#"):
        continue
    row = {"input": v}
    try:
        row["variant_id"] = norm_id(v)
        if row["variant_id"].startswith("M-"):
            row["status"] = "chrM: use the mitochondrial_variant query"
        else:
            row["variant_id"] = normalise(row["variant_id"])
    except ValueError:
        row["status"] = "invalid_id"                  # rsids go through variant(rsid:) instead
    except LookupError as e:
        row["status"] = f"ref_mismatch: {e}"           # wrong build, wrong strand or a typo
    rows.append(row)

found = variants(r["variant_id"] for r in rows if "status" not in r)
for row in rows:
    if "status" in row:
        continue
    rec = found[row["variant_id"]]
    if rec is None:
        chrom, pos = row["variant_id"].split("-")[:2]
        cov = coverage_at(chrom, int(pos))            # 1 request per absent variant
        row.update(status="not_found",
                   exome_over20=cov["exome"]["over_20"] if cov["exome"] else "no_exome_coverage",
                   genome_over20=cov["genome"]["over_20"] if cov["genome"] else "no_genome_coverage")
        continue
    row["status"] = "present"
    for k in ("exome", "genome", "joint"):
        s = rec[k]
        if s:
            row.update({f"{k}_ac": s["ac"], f"{k}_an": s["an"], f"{k}_af": af(s),
                        f"{k}_filters": ";".join(s["filters"]) or "PASS"})
    if rec["joint"] and rec["joint"]["faf95"]:
        row["joint_faf95_grpmax"] = rec["joint"]["faf95"]["popmax"]
        row["joint_faf95_group"] = rec["joint"]["faf95"]["popmax_population"]
    row["flags"] = ";".join(rec["flags"])

with open(sys.argv[2], "w", newline="") as fh:
    w = csv.DictWriter(fh, COLS, delimiter="\t", extrasaction="ignore")
    w.writeheader()
    w.writerows(rows)
print(f"{len(rows)} rows -> {sys.argv[2]}")
```

```bash
printf '%s\n' 19-44908684-T-C 7-117559591-TCTT-T 19-45411941-T-C 19-44908684-T-A M-8993-T-G rs429358 > variants.txt
python3 annotate.py variants.txt variants.gnomad_v4.tsv
cut -f1-3 variants.gnomad_v4.tsv
```

```
input	variant_id	status
19-44908684-T-C	19-44908684-T-C	present
7-117559591-TCTT-T	7-117559590-ATCT-A	present
19-45411941-T-C	19-45411941-T-C	ref_mismatch: REF T != GRCh38 C
19-44908684-T-A	19-44908684-T-A	not_found
M-8993-T-G	M-8993-T-G	chrM: use the mitochondrial_variant query
rs429358		invalid_id
```

The right-shifted F508del resolves to gnomAD's id; the GRCh37 APOE e4 coordinate is caught
by its REF, not reported as absent. Mitochondrial variants are not in `variant()`: query
`mitochondrial_variant(variant_id: "M-8993-T-G", dataset: gnomad_r4) { ac_het ac_hom an }`,
which reports heteroplasmic and homoplasmic counts rather than AC.

**Summary to hand back with the table.** Say which release the frequencies came from
(API `gnomad_r4`: v4.1.1 exomes and genomes, v4.1 joint), the retrieval date, and count the
`status` values. Name every `not_found` row with its coverage, every `ref_mismatch` (likely a
build or strand problem, for the requester to resolve), and every row whose joint filters say
`discrepant_frequencies`, so the requester decides which frequency to use. Leave cells blank
where a record was null rather than writing 0.

### Allele number at every base

The definitive answer to "how many alleles were examined at a base where nothing was seen" is
the *allele number at all sites* TSV: one row per callable base, columns `locus`, `AN`, and
whether the base is outside each exome capture. It has no index, so a lookup streams the file:

```bash
curl -s https://storage.googleapis.com/gcp-public-data--gnomad/release/4.1/tsv/exomes/gnomad.exomes.v4.1.allele_number_all_sites.tsv.bgz \
  | gzip -dc | awk -F'\t' 'NR == 1 || $1 == "chr19:44908684" {print} $1 == "chr19:44908684" {exit}'
```

```
locus	AN	outside_broad_capture_region	outside_ukb_capture_region	outside_broad_calling_region	outside_ukb_calling_region
chr19:44908684	1415800	false	false	false	false
```

That took 15 minutes on 2026-11-15, most of it streaming chromosomes 1 to 18. AN 1,415,800 at
the base where `19-44908684-T-A` was not found: so the allele was absent from 707,900 exomes
with a usable genotype, not merely from the variant table. The same AN is the e4 variant's own
exome AN, as it should be. A base outside every calling region has no row at all:
`chr19:44905020` (APOE intron 1) is not in the exome file. For many positions, sort them and
make one pass; for genomes the file is 11.19 GiB.

## Try it

**Data.** The live gnomAD GraphQL API (`gnomad_r4` and `gnomad_r2_1`), CC0, anonymous, no
key. Six variants (APOE e4, CFTR F508del in two spellings, an absent allele, a wrong-REF id,
G6PD A-), the GRCh37 and GRCh38 spellings of APOE e4, coverage at one base, PCSK9 constraint
on both builds, three limits that must fail loudly, and a request-size guard checked without
sending anything. Seven requests, paced under the rate limit; about 45 seconds. Python 3 standard library only. Confirmed reachable on 2026-11-15.

**Run.** In an empty directory:

```bash
cat > gnomad_check.py <<'PY'
import json, time, urllib.error, urllib.request

API, last, sent = "https://gnomad.broadinstitute.org/api", [0.0], [0]
MAX_BODY = 9500     # bodies over ~10,240 B can be answered with another client's cached query

def gql(query, variables=None):
    body = json.dumps({"query": query, "variables": variables or {}}).encode()
    if len(body) > MAX_BODY:
        raise ValueError(f"body {len(body)} B > {MAX_BODY} B: not sent")
    time.sleep(max(0, 6.5 - (time.monotonic() - last[0])))      # 10 requests per IP per 60 s
    sent[0] += 1
    req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return 200, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    finally:
        last[0] = time.monotonic()

def batch(pairs, fields):
    q = "{" + " ".join(f'v{i}: variant(variantId: "{v}", dataset: {d}) {{ {fields} }}'
                       for i, (v, d) in enumerate(pairs)) + "}"
    code, body = gql(q)
    assert code == 200, (code, body)
    data, errs = body["data"], body.get("errors", [])
    assert set(data) == {f"v{i}" for i in range(len(pairs))}, sorted(data)[:5]   # no missing or extra alias
    for i, (v, _) in enumerate(pairs):                     # each answer is for the id asked
        assert data[f"v{i}"] is None or data[f"v{i}"]["variant_id"] == v, (v, data[f"v{i}"]["variant_id"])
    assert all(e["message"] == "Variant not found" for e in errs)
    assert len(errs) == sum(data[f"v{i}"] is None for i in range(len(pairs)))
    return [data[f"v{i}"] for i in range(len(pairs))], errs

SEQ = "ac an filters populations { id ac an }"
(e4, f508_shift, f508, absent, bad_ref, g6pd), errs = batch(
    [("19-44908684-T-C", "gnomad_r4"), ("7-117559591-TCTT-T", "gnomad_r4"), ("7-117559590-ATCT-A", "gnomad_r4"),
     ("19-44908684-T-A", "gnomad_r4"), ("19-44908684-A-C", "gnomad_r4"), ("X-154536002-C-T", "gnomad_r4")],
    f"variant_id exome {{ {SEQ} }} genome {{ {SEQ} }} joint {{ {SEQ} faf95 {{ popmax popmax_population }} }}")

# 1. Exomes, genomes and joint are three records. Joint sums the two here.
ex, ge, jo = e4["exome"], e4["genome"], e4["joint"]
assert jo["ac"] == ex["ac"] + ge["ac"] and jo["an"] == ex["an"] + ge["an"]
# 2. The population list is not a list of ancestry groups.
ids = [p["id"] for p in jo["populations"]]
assert "nfe_XX" in ids and "XX" in ids
grp = {p["id"]: p for p in jo["populations"] if p["id"] and "_" not in p["id"] and ":" not in p["id"] and p["id"] not in ("XX", "XY")}
assert sum(p["ac"] for p in grp.values()) == jo["ac"]
# 3. Absent, wrong-REF and right-shifted indels all come back as the same null.
assert absent is None and bad_ref is None and f508_shift is None and f508 is not None
assert len(errs) == 3
assert not any("path" in e for e in errs)          # so match results by alias, not by error order

# 4. Build: a GRCh37 id is not found in v4, and a GRCh38 id is not found in v2.
(v2_on_37, v4_on_37, v2_on_38), _ = batch(
    [("19-45411941-T-C", "gnomad_r2_1"), ("19-45411941-T-C", "gnomad_r4"), ("19-44908684-T-C", "gnomad_r2_1")],
    "variant_id exome { ac an }")
assert v2_on_37 and v4_on_37 is None and v2_on_38 is None

# 5. Not found is not AF = 0: ask how well the base was covered. The window comes back padded.
code, cov = gql('{ region(chrom: "19", start: 44908684, stop: 44908684, reference_genome: GRCh38) {'
                ' coverage(dataset: gnomad_r4) { exome { pos over_20 } genome { pos over_20 } } } }')
c = cov["data"]["region"]["coverage"]
assert len(c["exome"]) > 1
at = {k: next(b for b in c[k] if b["pos"] == 44908684)["over_20"] for k in ("exome", "genome")}
assert min(at.values()) > 0.9

# 6. Constraint is keyed on an unversioned Ensembl id, and the build picks the release.
code, g = gql("""{ a: gene(gene_id: "ENSG00000169174", reference_genome: GRCh38) { symbol gnomad_constraint { obs_lof oe_lof_upper pLI } }
                  b: gene(gene_id: "ENSG00000169174", reference_genome: GRCh37) { symbol gnomad_constraint { obs_lof oe_lof_upper pLI } }
                  c: gene(gene_id: "ENSG00000169174.11", reference_genome: GRCh38) { symbol } }""")
v4c, v2c = g["data"]["a"]["gnomad_constraint"], g["data"]["b"]["gnomad_constraint"]
assert g["data"]["c"] is None and v4c["oe_lof_upper"] != v2c["oe_lof_upper"]

# 7. The limits fail loudly: cost cap per request, variant count per region, one allele per rsid.
code, body = gql("{" + " ".join(f'v{i}: variant(variantId: "19-44908684-T-C", dataset: gnomad_r4) {{ variant_id }}' for i in range(26)) + "}")
assert code == 400 and "Maximum allowed cost is 25" in body
code, body = gql('{ region(chrom: "19", start: 44000000, stop: 44100000, reference_genome: GRCh38) { variants(dataset: gnomad_r4) { variant_id } } }')
assert code == 500 and "too many variants" in body
code, body = gql('{ variant(rsid: "rs877973", dataset: gnomad_r4) { variant_id } }')
assert body["data"]["variant"] is None and "Multiple variants" in body["errors"][0]["message"]

# 8. 25 lookups with the full field set make a body over the size at which the API answers
#    from a cache with another query's result; the guard refuses it before any request.
S2 = "ac an filters populations { id ac an homozygote_count }"      # FIELDS from the request helper
FULL = f"""variant_id rsids flags
  exome {{ {S2} flags faf95 {{ popmax popmax_population }} }}
  genome {{ {S2} flags faf95 {{ popmax popmax_population }} }}
  joint {{ {S2} faf95 {{ popmax popmax_population }} }}"""
big = "{" + " ".join(f'v{i}: variant(variantId: "X-{154536002 + i}-C-T", dataset: gnomad_r4) {{ {FULL} }}' for i in range(25)) + "}"
before = sent[0]
try:
    gql(big)
    raise AssertionError("an oversized body was sent")
except ValueError as e:
    assert len(json.dumps({"query": big, "variables": {}})) > 10240 and sent[0] == before, e

af = lambda s: s["ac"] / s["an"]
print(f"APOE e4  exome {af(ex):.4f} ({ex['ac']}/{ex['an']})  genome {af(ge):.4f}  joint {af(jo):.4f}  joint filters {jo['filters']}")
print(f"         groups: {len(grp)} of {len(ids)} population rows; joint FAF95 max {jo['faf95']['popmax']:.4f} ({jo['faf95']['popmax_population']})")
print(f"G6PD A-  exome {af(g6pd['exome']):.4f}  genome {af(g6pd['genome']):.4f}  joint filters {g6pd['joint']['filters']}")
print(f"F508del  {f508['variant_id']} found; 7-117559591-TCTT-T (same deletion, right-shifted) not found")
print(f"absent   19-44908684-T-A not found; depth>=20 in {at['exome']:.0%} of exomes, {at['genome']:.0%} of genomes")
print(f"PCSK9    LOEUF v4 {v4c['oe_lof_upper']:.3f} (obs {v4c['obs_lof']}) vs v2.1.1 {v2c['oe_lof_upper']:.3f} (obs {v2c['obs_lof']})")
print(f"guard    25 full lookups = {len(json.dumps({'query': big, 'variables': {}}))} B, refused unsent; {sent[0]} requests sent")
PY
python3 gnomad_check.py
```

**Expect.** Run cold on 2026-11-15, in 58 seconds:

```
APOE e4  exome 0.1476 (208931/1415800)  genome 0.1574  joint 0.1485  joint filters ['discrepant_frequencies']
         groups: 10 of 35 population rows; joint FAF95 max 0.2176 (afr)
G6PD A-  exome 0.0037  genome 0.0335  joint filters ['discrepant_frequencies']
F508del  7-117559590-ATCT-A found; 7-117559591-TCTT-T (same deletion, right-shifted) not found
absent   19-44908684-T-A not found; depth>=20 in 96% of exomes, 98% of genomes
PCSK9    LOEUF v4 1.144 (obs 57) vs v2.1.1 1.341 (obs 26)
guard    25 full lookups = 10446 B, refused unsent; 7 requests sent
```

*Invariants*, asserted, so a failure means the skill is wrong:

- The joint record's AC and AN are the sums of the exome and genome records for a variant in
  both.
- The raw `populations` list contains sex splits and sex totals; the ancestry groups alone
  sum to the record's AC.
- An absent allele, a wrong REF and a right-shifted indel all return null with
  `Variant not found`, and the errors carry no `path`.
- A GRCh37 id is not found in `gnomad_r4`; a GRCh38 id is not found in `gnomad_r2_1`.
- The coverage window is padded beyond the requested base.
- A versioned Ensembl id returns no gene; GRCh37 and GRCh38 give different constraint.
- 26 aliases in one query return HTTP 400 naming the cost cap of 25; a 100 kb chr19 region
  returns HTTP 500; a two-allele rsid returns `Multiple variants found`.
- Every batch answers exactly the aliases asked, each non-null record's `variant_id` is the
  id asked for under its alias, and the only errors are one `Variant not found` per null.
- 25 lookups with the full field set encode to more than 10,240 bytes, and the size guard
  refuses that body without sending it.

*Observed values, 2026-11-15* (they move with a new release, so a mismatch is drift to
investigate): APOE e4 exome AF 0.1476 (208,931 / 1,415,800), genome 0.1574, joint 0.1485 with
`discrepant_frequencies`; 10 ancestry groups among 35 joint population rows; joint FAF95 max
0.2176 (afr); G6PD A- exome 0.0037 against genome 0.0335; 96% of exomes and 98% of genomes at
depth 20 or more at 19:44908684; PCSK9 LOEUF 1.144 (57 observed pLoF) in v4 against 1.341
(26) in v2.1.1; 25 full-field lookups encode to 10,446 bytes.

Beyond this block, the annotator was run on 13 inputs (APOE e4, F508del in two spellings plus
a genuinely different 2 bp deletion beside it, G6PD A- on chrX, the GRCh37 APOE coordinate,
an AC0 row, a genome-only intronic singleton, an absent allele, chrM, an rsid, a deletion
sharing a position with an SNV, and a malformed id), the batch checker was run against a
captured oversize-body response (it raised on the wrong `variant_id` where alias-position
mapping returned `11-46320530-TG-T`'s record as APOE e4), constraint was compared against the
v4.1, v4.1.1 and v4.1.2 files for 25 genes, and the VCF slicer was run on PCSK9 and APOE.

## Related skills

- `clinvar` — clinical classifications for the same variant ids.
- `ensembl` — reference sequence, VEP consequences, GRCh37/GRCh38 coordinates, gene ids.
- `gwas-catalog` — association results; gnomAD gives the frequencies behind them.
- `mavedb` — measured functional effects, often joined to gnomAD frequency.

## Sources

- gnomAD browser and API — <https://gnomad.broadinstitute.org/> ; <https://gnomad.broadinstitute.org/api>
- Terms, citation and data pages — <https://gnomad.broadinstitute.org/terms>, <https://gnomad.broadinstitute.org/data>
- Help: constraint, variant QC, coverage — <https://gnomad.broadinstitute.org/help>
- Release buckets — `gs://gcp-public-data--gnomad`, `s3://gnomad-public-us-east-1`
- Chen S, et al. A genomic mutational constraint map using variation in 76,156 human genomes.
  *Nature* 2024;625:92–100. PMID 38057664 (the gnomAD flagship citation)
- Karczewski KJ, et al. The mutational constraint spectrum quantified from variation in
  141,456 humans. *Nature* 2020;581:434–443. PMID 32461654
- Lek M, et al. Analysis of protein-coding genetic variation in 60,706 humans. *Nature*
  2016;536:285–291. PMID 27535533
- Gudmundsson S, et al. Variant interpretation using population databases: lessons from
  gnomAD. *Hum Mutat* 2022;43:1012–1030. PMID 34859531
