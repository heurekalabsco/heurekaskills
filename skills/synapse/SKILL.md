---
name: synapse
description: Find and retrieve consortium datasets from Synapse (Sage Bionetworks) — resolve a syn id to entity metadata and annotations, walk a project's folders, and read an entity's access tier before attempting a download. Covers AMP-AD, the AD Knowledge Portal, PsychENCODE and HTAN. Most Synapse files need a free account; some need an approved data use certificate.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [synapse, public-data, controlled-access, alzheimers, consortium-data]
covers: [synapse, sage bionetworks, syn id, amp-ad, ad knowledge portal, agora, alzheimers, dementia, neurodegeneration, aging, rosmap, mount sinai brain bank, mayo rnaseq, psychencode, htan, dorsolateral prefrontal cortex, superior temporal gyrus, hippocampus, cerebellum, amygdala, plasma proteomics, brain proteomics, tmt, rna-seq, methylation, metabolomics, gwas, human, mouse, data use certificate]
papers: [PMID:24071850, PMID:26853544, PMID:33085189, PMID:30084846, PMID:29865057, PMID:30204156, PMID:27727239, PMID:35115731, PMID:32302568]
access: [open, registered, controlled]
platform: synapse
datasets: [https://repo-prod.prod.sagebase.org/repo/v1/entity/syn9890650, https://repo-prod.prod.sagebase.org/repo/v1/entity/syn3219045/accessRequirement, https://repo-prod.prod.sagebase.org/repo/v1/entity/syn3157322, https://repo-prod.prod.sagebase.org/repo/v1/entity/syn17083367, https://repo-prod.prod.sagebase.org/repo/v1/entity/syn32140646, https://repo-prod.prod.sagebase.org/repo/v1/entity/syn13363290/version]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-08-18
  against: Synapse stack 601.0-20-g9b3fa3d75e / repo REST v1 / Python 3.12.8 (stdlib only)
  executed: 14
  unverified: 0
---
# Synapse — Sage Bionetworks

Synapse hosts a large share of consortium human data in aging and neurodegeneration —
AMP-AD and the AD Knowledge Portal, PsychENCODE, MODEL-AD, HTAN, the NF portals — and it
is the named deposit target for papers that say "data are available on Synapse" and give
no other route. Everything is addressed by a `syn` id.

**The one thing that makes Synapse different from GEO or Zenodo: three access tiers share
one namespace, and the id looks identical in all three.** `syn9890650` downloads with no
credential. `syn3219045` needs a free account and a click-through licence. `syn3157322`
needs a data use certificate co-signed by an institutional official and approved by a
human committee. Nothing in the identifier says which.

So the order of operations is not optional. **Read the entity's access requirements, report
them, and only then transfer bytes.** Get this backwards and a permissions refusal arrives
disguised as a missing file — and on one route it arrives disguised as success.

Every call below runs anonymously against the production API. No key, no account.

```bash
curl -s "https://repo-prod.prod.sagebase.org/repo/v1/version"
# {"version":"601.0-20-g9b3fa3d75e","stackInstance":"601"}
```

Two services on one host, and the split matters: `/repo/v1` serves metadata, annotations
and access requirements; `/file/v1` serves bytes. Anonymous callers get a lot of the first
and almost none of the second.

## Check the tier before you transfer anything

`POST /repo/v1/entity/{id}/bundle2` returns the entity, its annotations, the caller's
permissions, the folder path and the restriction state in one request. Use it as the
pre-flight.

```python
import json, urllib.error, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"


def _post(path, body, timeout=60):
    req = urllib.request.Request(
        REPO + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def preflight(syn_id):
    """Entity + annotations + permissions + tier in one call. Never downloads."""
    b = _post(f"/entity/{syn_id}/bundle2", {
        "includeEntity": True, "includeAnnotations": True,
        "includeRestrictionInformation": True, "includeEntityPath": True})
    ri = b["restrictionInformation"]
    perm = ri["userEntityPermissions"]

    # restrictionLevel alone is NOT the answer: a nonexistent or private id also
    # answers 200 with restrictionLevel OPEN. canView is what separates them.
    if not perm["canView"]:
        tier = "invisible"          # private, or the id does not exist
    elif perm["canDownload"]:
        tier = "open"               # this caller may actually transfer the bytes
    elif ri["restrictionLevel"] == "OPEN":
        tier = "registered"         # no access requirement, but a login is needed
    elif ri["restrictionLevel"] == "RESTRICTED_BY_TERMS_OF_USE":
        tier = "registered+terms"
    else:                            # CONTROLLED_BY_ACT
        tier = "controlled"

    return {
        "id": syn_id,
        "name": b["entity"].get("name"),
        "type": b.get("entityType"),
        "tier": tier,
        "restrictionLevel": ri["restrictionLevel"],
        "canView": perm["canView"],
        "canDownload": perm["canDownload"],
        "openData": perm["isEntityOpenData"],
        "requirementIds": [d["accessRequirementId"] for d in ri["restrictionDetails"]],
        "path": " / ".join(p["name"] for p in b["path"]["path"][1:]),
        # A Link's own tier is not its target's. When this is set, the answer you
        # actually want is preflight(linksTo).
        "linksTo": (b["entity"].get("linksTo") or {}).get("targetId"),
        "annotations": {k: v["value"] for k, v in b["annotations"]["annotations"].items()},
    }


for sid in ("syn9890650", "syn3219045", "syn3157322", "syn3381264", "syn2344867",
            "syn23448901", "syn999999999"):
    try:
        r = preflight(sid)
        print(f"{r['id']:14} {r['tier']:16} {r['restrictionLevel']:26} "
              f"AR={str(r['requirementIds']):24} link->{str(r['linksTo']):11} "
              f"{str(r['name'])[:34]}")
    except urllib.error.HTTPError as e:
        print(f"{sid:14} HTTP {e.code}  {json.loads(e.read())['reason']}")
```

Run 2026-08-18, anonymous:

```
syn9890650     open             OPEN                       AR=[]                       link->None        AMP-AD Knowledge Portal-Controlled
syn3219045     registered+terms RESTRICTED_BY_TERMS_OF_USE AR=[5592528]                link->None        ROSMAP
syn3157322     controlled       CONTROLLED_BY_ACT          AR=[5592528, 9603055]       link->None        Metadata
syn3381264     registered       OPEN                       AR=[]                       link->syn2344867  AIR Data
syn2344867     controlled       CONTROLLED_BY_ACT          AR=[3522647, 3522654]       link->None        AIR Data
syn23448901    HTTP 403  You lack READ access to the requested entity.
syn999999999   HTTP 404  Resource: 'syn999999999' does not exist
```

Seven ids, six different answers, and five of them are AD Knowledge Portal content sitting in
the same tree. `syn3157322` is the ROSMAP metadata folder, two levels below the ROSMAP study
folder `syn3219045` — and one tier stricter than it. **Restriction is inherited from a
benefactor and tightens as you descend**, so a tier read at the project is not the tier of
the file you want. Check the leaf.

The last pair is the case that catches tooling. `syn3381264` is a `Link`, and it reports
`OPEN`, no access requirement, tier *registered*. The folder it points at, `syn2344867`, is
`CONTROLLED_BY_ACT` behind two requirements. **A Link carries its own restriction, never its
target's**, so whenever `linksTo` is set, the answer you want is `preflight` of the target.

`restrictionLevel` takes exactly three values — `OPEN`, `RESTRICTED_BY_TERMS_OF_USE`,
`CONTROLLED_BY_ACT` — and `OPEN` is the one that misleads. It means "no access requirement
is attached", not "you can download this". Read `canDownload` — and note that the reverse
also holds for tables and views, where `canDownload: false` still permits a full SQL read.

## Trap — `restrictionInformation` reports an id that does not exist as OPEN

`POST /repo/v1/restrictionInformation` is the endpoint the tier lives on, and called on its
own it will cheerfully describe entities that are private, or that were never created:

```bash
curl -s -X POST "https://repo-prod.prod.sagebase.org/repo/v1/restrictionInformation" \
  -H "Content-Type: application/json" \
  -d '{"objectId":"syn999999999","restrictableObjectType":"ENTITY"}'
```

```
{"objectId":999999999,"restrictionLevel":"OPEN","hasUnmetAccessRequirement":false,
 "userEntityPermissions":{"canView":false, ... "canDownload":false, ...},
 "restrictionDetails":[]}
```

HTTP 200. `restrictionLevel: OPEN`. `restrictionDetails: []`. A pre-flight that reads only
those three fields reports "openly available, no requirements" for an id that does not
exist — and reports the same for a private project you have no right to see. The tell is
`canView: false`, and the fix is to route the pre-flight through `bundle2`, which returns
404 and 403 for those two cases respectively. Keep the `canView` guard anyway; it costs
nothing and it is the field that carries the truth.

## Resolving a syn id

```bash
curl -s "https://repo-prod.prod.sagebase.org/repo/v1/entity/syn3219045"
# {"name":"ROSMAP","id":"syn3219045", ... "parentId":"syn5550382",
#  "concreteType":"org.sagebionetworks.repo.model.Folder"}
```

Identifier handling is lenient in ways worth knowing: `3219045`, `syn3219045` and
`SYN3219045` all resolve to the same entity. A non-identifier is a 400 with a specific
reason (`TP53 is not a valid Synapse ID.`), and a well-formed id that was never created is
a 404 (`Resource: 'syn999999999' does not exist`). Those are different problems — 400 means
fix the string, 404 means the deposit is not there, 403 means it exists and is not yours.

`concreteType` decides what you can do next, and there are six kinds worth branching on —
not the two a folder-walker assumes:

| `concreteType` | how you get its contents |
|---|---|
| `Project`, `Folder` | list children, then recurse — the tree is deep |
| `FileEntity` | has `dataFileHandleId` and bytes; children are `[]` |
| `TableEntity`, `EntityView` | SQL over an async job; children are `[]` |
| `Dataset`, `DatasetCollection` | SQL **and** an `items` array on the entity; children are `[]` |
| `Link` | a pointer — `linksTo.targetId` is the entity that actually holds the data |

Asking for the children of any of the non-container types returns `{"page":[]}` rather than
an error, so branch on the type instead of inferring it from an empty listing. `Dataset` is
the one that punishes the assumption hardest: `syn32140646` is a Dataset holding **3,849
items**, and `POST /entity/children` on it returns zero.

**A `Link` carries its own restriction, not its target's.** `syn3381264` reports
`restrictionLevel: OPEN`; the folder it points at, `syn2344867`, is `CONTROLLED_BY_ACT`.
Sampling 19 link entities on 2026-08-18, **8 disagreed with their target** — in both
directions, and three pointed at ids that 403 or 404. Follow `linksTo.targetId` and
pre-flight *that*, or you will promise a reader open data that needs a committee.

## Walking a container

```python
import json, urllib.request
from collections import Counter

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"

# Every child type the endpoint knows. It has no default: a type you leave out is
# a set of children that silently does not exist.
CHILD_TYPES = ["project", "folder", "file", "table", "link", "entityview", "dockerrepo",
               "dataset", "datasetcollection", "materializedview", "virtualtable"]


def _post(path, body, timeout=60):
    req = urllib.request.Request(
        REPO + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def children(parent_id, types=CHILD_TYPES):
    """Immediate children of one container. Pages at 50 and never reports a total.

    Refusals raise (403/404), so an empty list from this call means the container
    is empty — never that you were not allowed to see inside it."""
    token, out = None, []
    while True:
        body = {"parentId": parent_id, "includeTypes": list(types),
                "sortBy": "NAME", "sortDirection": "ASC"}
        if token:
            body["nextPageToken"] = token
        page = _post("/entity/children", body)
        out.extend(page["page"])
        token = page.get("nextPageToken")
        if not token:
            return out


def descend(root_id, types=CHILD_TYPES):
    """Every descendant, not only the first level. Synapse study trees are deep."""
    out, stack = [], [(root_id, 1)]
    while stack:
        pid, depth = stack.pop()
        for c in children(pid, types):
            kind = c["type"].rsplit(".", 1)[-1]
            out.append({"id": c["id"], "kind": kind, "name": c["name"], "depth": depth})
            if kind in ("Folder", "Project"):
                stack.append((c["id"], depth + 1))
    return out


for sid, label in (("syn2580853", "AD Knowledge Portal backend (Project)"),
                   ("syn4921369", "PsychENCODE Knowledge Portal (Project)"),
                   ("syn5759376", "ACT study (Folder)")):
    every = children(sid)
    naive = children(sid, types=("folder", "file"))
    print(f"{sid}  {label}")
    print(f"   folder+file only {len(naive):4}   all types {len(every):4}   "
          f"{dict(Counter(c['type'].rsplit('.', 1)[-1] for c in every))}")

tree = descend("syn5759376")
print(f"\nsyn5759376  immediate {len(children('syn5759376'))}, "
      f"descendants {len(tree)} over {max(t['depth'] for t in tree)} levels  "
      f"{dict(Counter(t['kind'] for t in tree))}")

# A Dataset is a container whose contents are NOT children.
ds = _post("/entity/syn32140646/bundle2", {"includeEntity": True})["entity"]
print(f"syn32140646 Dataset  children() {len(children('syn32140646'))}  "
      f"items declared {len(ds['items'])}")
```

Run 2026-08-18:

```
syn2580853  AD Knowledge Portal backend (Project)
   folder+file only   11   all types  141   {'Folder': 11, 'Dataset': 69, 'EntityView': 36, 'DatasetCollection': 2, 'TableEntity': 23}
syn4921369  PsychENCODE Knowledge Portal (Project)
   folder+file only   11   all types   69   {'EntityView': 27, 'Dataset': 26, 'Folder': 11, 'TableEntity': 5}
syn5759376  ACT study (Folder)
   folder+file only    2   all types    2   {'Folder': 2}

syn5759376  immediate 2, descendants 80 over 5 levels  {'Folder': 8, 'FileEntity': 72}
syn32140646 Dataset  children() 0  items declared 3849
```

Four things about listing, and three of them are ways to be handed a fraction of a portal
without noticing.

- **`includeTypes` has no default, and folder-plus-file is the wrong one.** On the AD
  Knowledge Portal's backend project that pair returns **11 of 141** children — every
  Dataset, EntityView, TableEntity and DatasetCollection is dropped, which on this portal
  is where the curated catalogues live. PsychENCODE's project: 11 of 69.
- **One call is one level.** `children("syn3219045")` on the ROSMAP study folder returns
  **2**. `descend` on the same id returns **33,694** entities — 184 folders and 33,510 files
  — over 8 levels. A technique that lists immediate children and reports the count has
  described 0.006% of that study.
- **`POST /repo/v1/entity/children` pages at 50** with a `nextPageToken` and never reports a
  total, so a single call on a folder of 104 silently gives you the first 50. Loop until the
  token is absent.
- **An empty list is a type answer, never an access answer.** The endpoint raises 403 (`You
  lack READ access to the requested entity.`) and 404 for refusal and for a missing id, so
  do not catch those into an empty result — but it returns `[]` for files, tables, views and
  Datasets, which are not empty, just not listable this way.

Ancestry does not imply readability either. Of the 196 studies in the portal's own catalogue
table, **8 answer 403** to an anonymous caller on their study folder — `syn38190930`
(ABC-DS) among them. A study being in the catalogue is not a promise that its tree is
readable.

`descend` is breadth without bound: on a large consortium project it will make thousands of
requests and take minutes. Scope it to the study folder you actually want, and prefer the
portal's file view when one exists.

## Annotations, and the shape they come back in

Annotations are where the science metadata lives — study, species, assay, tissue, diagnosis.
They come back wrapped in a type descriptor, and **every value is a list**, including
scalars and booleans:

```python
import json, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"


def _post(path, body, timeout=60):
    req = urllib.request.Request(
        REPO + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


ann = _post("/entity/syn3219045/bundle2", {"includeAnnotations": True})["annotations"]
print("annotations on syn3219045:")
for k, v in list(ann["annotations"].items())[:5]:
    print(f"  {k:20} {v['type']:8} {v['value']}")
```

Run 2026-08-18:

```
annotations on syn3219045:
  study                STRING   ['ROSMAP']
  species              STRING   ['Human']
  studyName            STRING   ['The Religious Orders Study and Memory and Aging Project Study']
  studyType            STRING   ['Individual']
  consortium           STRING   ['AMP-AD']
```

Annotations are a flat map on the entity and are **not** inherited, so a file often carries
far less than the study folder above it — read both.

The type wrapper is worth respecting rather than flattening blindly. A `BOOLEAN` annotation
arrives as `{"type": "BOOLEAN", "value": ["TRUE"]}` — the string `"TRUE"` inside a list, not
`true`. Coercing with `bool(value)` makes every boolean annotation true, including the false
ones.

## Reading the requirement in detail

`GET /repo/v1/entity/{id}/accessRequirement` returns every requirement standing between the
caller and the bytes, including ones inherited from ancestors. The `concreteType` is what
tells a reader what the tier will cost them.

```python
import json, re, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"

# What each requirement type costs the reader, in the order Synapse escalates.
KIND = {
    "TermsOfUseAccessRequirement": "click-through terms — accept once, in the browser",
    "SelfSignAccessRequirement": "self-signed — you attest, no committee reviews it",
    "ManagedACTAccessRequirement": "ACT review — an application a human approves",
    "LockAccessRequirement": "locked — contact the ACT, no self-service route",
}


def requirements(syn_id):
    """Every access requirement standing between you and this entity's bytes."""
    d = json.loads(urllib.request.urlopen(
        f"{REPO}/entity/{syn_id}/accessRequirement", timeout=60).read())
    out = []
    for ar in d["results"]:
        kind = ar["concreteType"].rsplit(".", 1)[-1]
        rec = {"id": ar["id"], "name": ar["name"], "kind": kind,
               "means": KIND.get(kind, "unknown requirement type"),
               "accessType": ar["accessType"],
               # subjectIds is every entity this requirement covers — hundreds of ids
               # you did not ask for. Count it and throw it away.
               "coversEntities": len(ar.get("subjectIds") or [])}
        if ar.get("termsOfUse"):
            rec["terms"] = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", ar["termsOfUse"])).strip()
        for flag in ("isCertifiedUserRequired", "isValidatedProfileRequired",
                     "isDUCRequired", "isIRBApprovalRequired", "isIDURequired",
                     "isIDUPublic", "isTwoFaRequired", "areOtherAttachmentsRequired"):
            if flag in ar:
                rec[flag] = ar[flag]
        if ar.get("expirationPeriod"):
            rec["accessExpiresAfterDays"] = ar["expirationPeriod"] // 86_400_000
        out.append(rec)
    return out


for sid in ("syn3219045", "syn3157322", "syn9890650"):
    print("=" * 72)
    reqs = requirements(sid)
    print(sid, "—", len(reqs), "requirement(s)")
    for r in reqs:
        print(json.dumps(r, indent=2)[:1100])
```

For the ROSMAP metadata folder this prints two requirements — the portal-wide click-wrap,
and the committee-reviewed one (2026-08-17):

```
{
  "id": 9603055,
  "name": "AD Knowledge Portal",
  "kind": "ManagedACTAccessRequirement",
  "means": "ACT review — an application a human approves",
  "accessType": "DOWNLOAD",
  "coversEntities": 277,
  "isCertifiedUserRequired": false,
  "isValidatedProfileRequired": false,
  "isDUCRequired": true,
  "isIRBApprovalRequired": false,
  "isIDURequired": true,
  "isIDUPublic": true,
  "isTwoFaRequired": false,
  "areOtherAttachmentsRequired": false,
  "accessExpiresAfterDays": 365
}
```

Those flags are the application, machine-readable, before anyone fills anything in — a data
use certificate is required, an intended-data-use statement is required and will be
published, an IRB approval is not required, and access lapses after a year. That is enough
to tell a reader what they are in for without them opening a browser.

`subjectIds` is the trap in this response. It lists every entity the requirement governs —
191 for the click-wrap, 277 for the ACT requirement — so the payload is tens of kilobytes of
identifiers unrelated to the question. Take its length and discard it.

Note also that `accessType` is `DOWNLOAD` on all of these. A requirement gates *transfer*,
not *reading*: metadata and annotations for a controlled study are public, which is exactly
what makes "does a cohort like this exist, and what would using it require" an answerable
question with no application at all.

## Downloading, and what a refusal looks like

Two routes, and they fail in completely different ways.

**Single file.** `GET /repo/v1/entity/{id}/file` 307-redirects to a pre-signed URL;
`?redirect=false` hands back the same URL as plain text so the fetch stays a separate,
inspectable step. This route fails loudly. Anonymous, 2026-08-17:

```bash
curl -s "https://repo-prod.prod.sagebase.org/repo/v1/entity/syn13363290/file?redirect=false"
# HTTP 403 {"reason":"Anonymous users have only READ access permission."}

curl -s "https://repo-prod.prod.sagebase.org/repo/v1/entity/syn21088596/file?redirect=false"
# HTTP 403 {"reason":"There are unmet access requirements that must be met to read
#            content in the requested container."}
```

Both are 403 and the two reasons mean different things. The first says *log in*. The second
says *apply*. Report the reason string, not the status code.

**Bulk.** `POST /file/v1/file/bulk/async/start` then poll `/file/bulk/async/get/{token}`.
This is the route multi-file tooling uses, and **it reports refusal as a success status with
the error buried in the body**:

```python
import json, time, urllib.request

FILESVC = "https://repo-prod.prod.sagebase.org/file/v1"
SID, FH = "syn13363290", "175408255"     # Agora data_manifest.csv


def _post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    r = urllib.request.urlopen(req, timeout=90)
    return r.status, json.loads(r.read())


status, tok = _post(f"{FILESVC}/file/bulk/async/start", {"requestedFiles": [
    {"fileHandleId": FH, "associateObjectId": SID, "associateObjectType": "FileEntity"}]})
print("start   HTTP", status, tok)

while True:
    r = urllib.request.urlopen(f"{FILESVC}/file/bulk/async/get/{tok['token']}", timeout=90)
    if r.status != 202:
        res = json.loads(r.read())
        break
    time.sleep(2)

print("get     HTTP", r.status, "<- not an error status")
for f in res["fileSummary"]:
    print(f"  {f['associateObjectId']}  status={f['status']}  "
          f"code={f.get('failureCode')}  {f.get('failureMessage')}")
print("zip file handle:", res.get("resultZipFileHandleId"))

failed = [f for f in res["fileSummary"] if f["status"] != "SUCCESS"]
if failed:
    raise SystemExit(f"{len(failed)} of {len(res['fileSummary'])} refused — "
                     "the HTTP status said nothing about it")
```

```
start   HTTP 201 {'token': '99974057'}
get     HTTP 201 <- not an error status
  syn13363290  status=FAILURE  code=UNAUTHORIZED  Anonymous users have only READ access permission.
zip file handle: None
1 of 1 refused — the HTTP status said nothing about it
```

That block exits non-zero on purpose — the `SystemExit` is the failure the transport layer
declined to raise.

**HTTP 201 on both calls.** `raise_for_status()` passes. There is no exception to catch. The
refusal lives in `fileSummary[].status`, `failureCode` and `failureMessage`, and
`resultZipFileHandleId` is `None` where the archive would have been. A caller that checks
only the status code concludes the download succeeded and then reports the absent files as
missing data. **Iterate `fileSummary` and fail on any entry that is not `SUCCESS`** — and
note the summary is per-file, so a mixed request partially succeeds and needs both branches
handled.

**Anonymous download is the rare exception, not the norm.** A registered account is required
to transfer bytes at all, whatever the restriction level says. The exception is an entity a
curator has flagged as Open Data, which shows up as `isEntityOpenData: true` and
`canDownload: true` for an anonymous caller. Sweeping 1,236 publicly readable file entities
across the repository on 2026-08-17 found 4 — so treat `canDownload: true` while
unauthenticated as a happy accident you check for, never as the expected state.

## Get the files

The pre-flight and the transfer belong in one loop, so a refusal is recorded as a
requirement with a route rather than surfacing later as an empty directory.

```python
import hashlib, json, os, urllib.error, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"
OUT = "Data/synapse"
WANT = ["syn9890650",   # openly downloadable — AD Knowledge Portal DUC template
        "syn21088596",  # ROSMAP RNA-seq assay metadata — behind the ACT
        "syn13363290"]  # Agora data_manifest.csv — no requirement, still needs a login


def _post(path, body, timeout=90):
    req = urllib.request.Request(REPO + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def _get(path, timeout=90):
    return urllib.request.urlopen(REPO + path, timeout=timeout).read()


os.makedirs(OUT, exist_ok=True)
got, blocked = [], []

for sid in WANT:
    b = _post(f"/entity/{sid}/bundle2",
              {"includeEntity": True, "includeRestrictionInformation": True})
    ri, ent = b["restrictionInformation"], b["entity"]

    # PRE-FLIGHT. Ask before transferring, so a refusal is reported as a requirement
    # rather than surfacing later as a missing file.
    if not ri["userEntityPermissions"]["canDownload"]:
        reqs = json.loads(_get(f"/entity/{sid}/accessRequirement"))["results"]
        blocked.append({
            "id": sid, "name": ent.get("name"),
            "restrictionLevel": ri["restrictionLevel"],
            "needs": [{"id": r["id"], "name": r["name"],
                       "kind": r["concreteType"].rsplit(".", 1)[-1]} for r in reqs]
            or [{"kind": "SynapseLogin",
                 "name": "no access requirement — but anonymous callers cannot download"}],
            "url": f"https://www.synapse.org/Synapse:{sid}"})
        print(f"BLOCKED {sid}  {ri['restrictionLevel']:26} {str(ent.get('name'))[:40]}")
        continue

    # The file handle carries the real filename, media type and checksum. The entity
    # name is a label a curator typed and is often neither the filename nor suffixed.
    fh = json.loads(_get(f"/entity/{sid}/filehandles"))["list"][0]

    # ?redirect=false hands back the signed URL as plain text, keeping the fetch of the
    # bytes a separate, inspectable step.
    url = _get(f"/entity/{sid}/file?redirect=false").decode()
    try:
        blob = urllib.request.urlopen(url, timeout=300).read()
    except urllib.error.HTTPError:
        # The CDN returns a transient 403 on a freshly signed URL often enough to
        # matter — roughly one run in four here. Re-sign and retry once.
        url = _get(f"/entity/{sid}/file?redirect=false").decode()
        blob = urllib.request.urlopen(url, timeout=300).read()

    dest = os.path.join(OUT, f"{sid}_{fh['fileName'].replace(' ', '_')}")
    with open(dest, "wb") as out:
        out.write(blob)
    md5 = hashlib.md5(blob).hexdigest()
    got.append({"id": sid, "path": dest, "bytes": len(blob),
                "version": ent["versionNumber"], "contentType": fh["contentType"],
                "md5": md5, "md5Matches": md5 == fh["contentMd5"],
                # contentSize is an int here and a *string* in /version — coerce both.
                "sizeMatches": len(blob) == int(fh["contentSize"])})
    print(f"WROTE   {sid}  {len(blob):>9,} B  v{ent['versionNumber']}  "
          f"md5 ok={got[-1]['md5Matches']}  -> {dest}")

with open(os.path.join(OUT, "manifest.json"), "w") as fh:
    json.dump({"source": "Synapse (Sage Bionetworks)", "endpoint": REPO,
               "credential": "anonymous", "downloaded": got, "blocked": blocked},
              fh, indent=2)

print(f"\n{len(got)} file(s) on disk, {len(blocked)} blocked — see {OUT}/manifest.json")
for b in blocked:
    print(f"  {b['id']} needs: " + ", ".join(n["kind"] for n in b["needs"]))
```

Run 2026-08-17, anonymous:

```
WROTE   syn9890650    117,501 B  v8  md5 ok=True  -> Data/synapse/syn9890650_AMP-AD_Knowledge_Portal-Controlled_Accees_DUC-v6.pdf
BLOCKED syn21088596  CONTROLLED_BY_ACT          ROSMAP_assay_RNAseq_metadata.csv
BLOCKED syn13363290  OPEN                       data_manifest.csv

1 file(s) on disk, 2 blocked — see Data/synapse/manifest.json
  syn21088596 needs: TermsOfUseAccessRequirement, ManagedACTAccessRequirement
  syn13363290 needs: SynapseLogin
```

One file, two documented refusals, and a manifest a reader can act on. To run it as a
registered user, add `Authorization: Bearer <personal access token>` to every request and
change nothing else — a token is issued from account settings on the Synapse website. The
ACT-gated id will still be refused until an application is approved; no header substitutes
for that. **Everything shown in this skill was executed anonymously, so the authenticated
path is documented from the API's own contract rather than exercised.**

Four details in there are load-bearing:

- **Take the filename from the file handle.** The entity is named "AMP-AD Knowledge
  Portal-Controlled Access Data Use Certificate"; the file is
  `AMP-AD Knowledge Portal-Controlled Accees DUC-v6.pdf`. They differ in wording, in
  spelling, and in whether there is a suffix at all. Naming files after entities produces a
  directory of extensionless files nothing will open.
- **Verify against `contentMd5`, and coerce `contentSize`.** The file handle gives
  `contentSize` as an integer; `GET /entity/{id}/version` gives the same number as the
  *string* `"117501"`. Comparing `len(blob)` to the version record without `int()` fails on
  every file, which looks exactly like corruption.
- **Pre-signed URLs are short-lived** — `X-Amz-Expires=900`, fifteen minutes. Fetch the bytes
  promptly rather than collecting URLs into a queue, and re-issue rather than retrying a
  stale one. Transient 403s from the CDN also happen; one retry is worth having.
- **Record the version.** Entities are versioned, and a bare `/entity/{id}` always hands back
  whichever revision is current. `syn9890650` is at `versionNumber` 8 with seven earlier
  revisions still addressable, each with its own size and checksum. A directory of Synapse
  files with no version stamped beside them cannot be compared against a later pull.

To pin a specific revision, request `/entity/{id}/version/{n}` rather than the entity —
otherwise you get whatever is current, which is not what the paper analysed.
`/entity/{id}/version/{n}/bundle2` takes the same body as the unversioned pre-flight.

### Listing the versions, and the count that is not a count

```python
import json, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"


def versions(syn_id, page=50):
    """Every retained revision. `totalNumberOfResults` is a has-more sentinel, not a count."""
    off, out = 0, []
    while True:
        d = json.loads(urllib.request.urlopen(
            f"{REPO}/entity/{syn_id}/version?offset={off}&limit={page}", timeout=60).read())
        out.extend(d["results"])
        if len(d["results"]) < page:
            return out
        off += len(d["results"])


for sid in ("syn13363290", "syn9890650"):
    bare = json.loads(urllib.request.urlopen(
        f"{REPO}/entity/{sid}/version", timeout=60).read())
    v = versions(sid)
    print(f"{sid}  bare GET /version -> {len(bare['results'])} rows, "
          f"totalNumberOfResults {bare['totalNumberOfResults']}   |   paged -> "
          f"{len(v)} versions, latest v{v[0]['versionNumber']}")

for v in versions("syn9890650"):
    print(f"  v{v['versionNumber']:<3} {v['contentSize']:>7} B  md5 {v['contentMd5'][:12]}")
```

Run 2026-08-18:

```
syn13363290  bare GET /version -> 10 rows, totalNumberOfResults 11   |   paged -> 115 versions, latest v119
syn9890650  bare GET /version -> 8 rows, totalNumberOfResults 8   |   paged -> 8 versions, latest v8
  v8    117501 B  md5 d92a09e437a4
  v7    121495 B  md5 40ebf75530e3
  v6    120809 B  md5 da11a6779509
  v5    170299 B  md5 f4c1e87630f7
  v4    172244 B  md5 434516519795
  v3    329400 B  md5 7a4760860b54
  v2    329400 B  md5 7a4760860b54
  v1    329400 B  md5 7a4760860b54
```

Two traps in nine lines of JSON. **`GET /entity/{id}/version` pages at 10** by default, and
**`totalNumberOfResults` is not the number of versions** — on a paginated Synapse response it
is `offset + returned + 1` whenever another page exists. For Agora's `data_manifest.csv`
(`syn13363290`) the bare call returns 10 rows and declares 11; paging finds **115 retained
revisions**, the newest labelled v119. Believing the declared total there understates the
file's history by a factor of ten.

That number is also why the version stamp matters: `syn9890650` v1 is 329,400 bytes and v8 is
117,501, so "the AD Knowledge Portal DUC" names two documents that are not the same document.
The rule generalises — treat `totalNumberOfResults` from any `/repo/v1` paginated endpoint as
"there is more", and page until a short page comes back.

## Finding data without a syn id

`POST /repo/v1/search` is a free-text index over everything the caller can read. It works
anonymously.

```python
import json, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"


def find(*terms, node_type=None, size=10):
    """Free-text search across everything the caller can read. No account needed."""
    body = {"queryTerm": list(terms), "size": size}
    if node_type:                     # project | folder | file | table | entityview | link
        body["booleanQuery"] = [{"key": "node_type", "value": node_type}]
    req = urllib.request.Request(REPO + "/search", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=90).read())


d = find("alzheimers", "proteomics", "brain", node_type="project", size=6)
print("matches:", d["found"], "— a union of the three terms, not an intersection")
for h in d["hits"]:
    print(f"  {h['id']:14} {h['name'][:78]}")

# Why the list above looks deceptively on-topic: ranking rewards documents matching
# more of the terms, while `found` counts every document matching any of them.
print()
for q in (("alzheimers",), ("proteomics",), ("brain",),
          ("alzheimers", "proteomics", "brain"),
          ("alzheimers", "proteomics", "brain", "zzzznotaword")):
    print(f"  found({' + '.join(q)}) = {find(*q, node_type='project', size=1)['found']}")
```

Run 2026-08-18:

```
matches: 516 — a union of the three terms, not an intersection
  syn73569657    BPSD brain proteomics
  syn20609824    Hales Proteomics Paper - Detergent-Insoluble Brain Proteome
  syn25006611    Consensus TMT Deep Proteomics of Human Brain in Alzheimer's Disease
  syn2790911     Alzheimers Disease - Community Portal
  syn51150434    The role of sex in brain protein expression and disease
  syn20933797    Consensus Brain Protein Coexpression Study

  found(alzheimers) = 36
  found(proteomics) = 153
  found(brain) = 391
  found(alzheimers + proteomics + brain) = 516
  found(alzheimers + proteomics + brain + zzzznotaword) = 516
```

**`queryTerm` is ORed, not ANDed, and adding terms makes the result set larger.** One term
matches 36 projects; the three together match 516, which is their union rather than any
intersection — and appending a word that matches nothing at all leaves the count unchanged,
which no conjunction would do. The top of the hit list still looks like a precise answer
because relevance ranking floats documents matching more of the terms, so the error is
invisible from the output and only shows up when someone counts. Treat `found` as "how big
is the union", never as "how many studies are like this", and re-filter the hits yourself —
`booleanQuery` narrows only on indexed facets such as `node_type`, not on free text.

`node_type` narrows to `project` for studies, `file` for individual deposits. Search does not
tell you the tier, so run every candidate through the pre-flight before promising anyone the
data. Search is also scoped to what the caller can read: an anonymous search will not surface
a private project, so an empty result is not proof the deposit does not exist.

## Querying tables and file views

Portals build curated `TableEntity` and `EntityView` catalogues over their files. Querying
one is SQL over an async job, and it is the fastest way to get from a research question to a
list of syn ids.

```python
import csv, json, os, time, urllib.error, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"
TABLE = "syn17083367"          # AD Knowledge Portal study catalogue


def _job(table_id, query, part_mask, timeout_s=300):
    body = {"concreteType": "org.sagebionetworks.repo.model.table.QueryBundleRequest",
            "entityId": table_id, "query": query, "partMask": part_mask}
    req = urllib.request.Request(
        f"{REPO}/entity/{table_id}/table/query/async/start",
        data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    token = json.loads(urllib.request.urlopen(req, timeout=60).read())["token"]

    deadline = time.time() + timeout_s
    while True:
        try:
            r = urllib.request.urlopen(
                f"{REPO}/entity/{table_id}/table/query/async/get/{token}", timeout=90)
        except urllib.error.HTTPError as e:
            # Bad SQL, an unknown column, and "Anonymous users have only READ access
            # permission" all surface here rather than at /start.
            raise ValueError(json.loads(e.read())["reason"]) from None
        if r.status != 202:
            return json.loads(r.read())
        if time.time() > deadline:
            raise TimeoutError(f"{table_id} index still building after {timeout_s}s")
        time.sleep(3)


def query_table(table_id, sql, timeout_s=300):
    """Every row, reconciled against the row count the service itself reports.

    One request returns one page of maxRowsPerPage rows — a figure the service derives
    from the row width, and which a LIMIT in the SQL cannot raise. Walk the offsets."""
    cols, rows, declared, offset = None, [], None, 0
    while True:
        res = _job(table_id, {"sql": sql, "offset": offset}, 0x1 | 0x2, timeout_s)
        qr = res["queryResult"]["queryResults"]
        if cols is None:
            cols, declared = [h["name"] for h in qr["headers"]], res.get("queryCount")
        page = [r["values"] for r in qr["rows"]]
        rows.extend(page)
        if not page or declared is None or len(rows) >= declared:
            break
        offset += len(page)
    if declared is not None and len(rows) != declared:
        raise RuntimeError(f"{table_id}: kept {len(rows)} rows, table reports {declared}")
    return cols, rows


# What a single unpaged request actually hands back, on three real portal tables.
for tid in (TABLE, "syn20448807", "syn9738945"):
    one = _job(tid, {"sql": f"SELECT * FROM {tid}"}, 0x1 | 0x2 | 0x8)
    print(f"{tid:12} one request {len(one['queryResult']['queryResults']['rows']):>6} rows"
          f"   table reports {one['queryCount']:>6}"
          f"   maxRowsPerPage {one['maxRowsPerPage']}")

os.makedirs("Data/synapse", exist_ok=True)
cols, rows = query_table(TABLE, f"SELECT * FROM {TABLE}")
with open("Data/synapse/adkp_studies.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(cols)
    w.writerows(rows)
print(f"\n{len(rows)} studies -> Data/synapse/adkp_studies.csv")

cols, rows = query_table(TABLE, f"""
    SELECT Study, Study_Abbreviation, Species, specimenType, studyFocus,
           DataType_All, accessReqs, DOI
    FROM {TABLE}
    WHERE Species HAS ('Human') AND studyFocus HAS ('Alzheimer Disease')
    ORDER BY Study_Abbreviation""")
print(f"{len(rows)} of them human Alzheimer studies")
for r in rows[:5]:
    print(f"  {r[0]:14} {str(r[1])[:26]:28} {str(r[5])[:44]}")
```

Run 2026-08-18:

```
syn17083367  one request    183 rows   table reports    196   maxRowsPerPage 183
syn20448807  one request    308 rows   table reports   5166   maxRowsPerPage 308
syn9738945   one request    351 rows   table reports  12282   maxRowsPerPage 351

196 studies -> Data/synapse/adkp_studies.csv
99 of them human Alzheimer studies
  syn70753079    None                         ["Epigenetics"]
  syn38190930    ABC-DS                       ["Gene Expression"]
  syn21680862    ACOM                         ["Gene Expression"]
  syn5759376     ACT                          ["Proteomics"]
  syn70781457    ADKP_Metadata_Harmonizatio   ["Harmonized Metadata"]
```

That is a catalogue of studies on disk without any credential, and the `Study` column is the
syn id to feed back into the pre-flight.

**One query is one page, and the page is not the table.** This is the single most expensive
mistake available here, because nothing in the response looks wrong: a query that returns
351 rows returns them cheerfully, with a 2xx and no warning. The service sizes
`maxRowsPerPage` from the row width, so a wide `SELECT *` gets a *smaller* page, and a
`LIMIT 500` on `syn17083367` still comes back with 183 — the cap wins over the LIMIT.
Measured anonymously on 2026-08-18:

| table | one request | the table's own `queryCount` | you would have had |
|---|---|---|---|
| `syn17083367` AD Knowledge Portal studies | 183 | 196 | 93% |
| `syn13897207` Portal - People | 343 | 539 | 64% |
| `syn20448807` Portal - Publications | 308 | 5,166 | 6% |
| `syn9738945` RNAseq_Reprocessing file view | 351 | 12,282 | **2.9%** |
| `syn32140646` Dataset, single-cell eQTL | 1,067 | 3,847 | 28% |

Request `partMask` bit `0x2` — the function above does — and **compare `queryCount` to what
you kept**. Paging on `query.offset` until the two agree recovered all 12,282 rows of
`syn9738945` in 131 s and all 5,166 of `syn20448807` in 54 s. A count you cannot reconcile is
a truncation you have not noticed yet.

The SQL dialect and the job have four more edges:

- **Multi-value columns need `HAS`, not `=`.** `Species`, `studyFocus` and `DataType_All`
  are `STRING_LIST` columns and come back as JSON-encoded strings such as `["Human"]`.
  `WHERE Species = 'Human'` matches nothing useful; `Species HAS ('Human')` is the operator.
- **Numeric-looking columns are frequently `STRING`.** In `syn21783965`,
  `numberOfIndividuals` is declared `STRING`, so `> 100` compares lexically and `299` sorts
  below `4`. Read `headers[].columnType` before writing a comparison, cast, or filter in
  Python.
- **Errors surface at `/get`, not `/start`.** `/start` returns 201 and a token for a query
  with a nonexistent column; the `/get` poll is where you learn `Unknown column id`.
- **Some tables refuse anonymous queries, and `canDownload` does not predict which.**
  `syn52656269` and `syn20968992` answer `Anonymous users have only READ access permission.`
  while `syn17083367`, `syn20448807`, `syn9738945` and the Dataset `syn32140646` all answer
  fine — and every one of those four except `syn17083367` reports `canDownload: false` to the
  same anonymous caller. Query permission and file-download permission are separate grants,
  so try the query rather than inferring the answer from the pre-flight, and handle the
  refusal as an access error rather than a bad query.
- **Large views can take minutes to build an index, or never finish.** The legacy view
  `syn11346063` returned `202 PROCESSING` with `Waiting for the table index to become
  available...` continuously for over eight minutes on 2026-08-17, and again on 2026-08-18.
  Bound the poll and treat the timeout as "use a smaller table", not as a bug in your SQL.

Portal catalogues are curated artifacts, so treat them as a fast index rather than the
authority: `syn21783965` and `syn17083367` are both AD Knowledge Portal study tables and hold
34 and 196 rows respectively, and 8 of those 196 studies are 403 to an anonymous caller.
Confirm what you find against the entity tree.

## Requesting access

**This skill cannot obtain access and does not promise it.** Every route below ends at an
application decided by people at Sage Bionetworks or a data contributor. What the skill can
do — entirely from public endpoints, with no account — is tell you which tier an id sits in,
what that tier requires, and whether the study's consent even permits your question. Do that
first. The binding constraint is usually not the paperwork.

### Lead with what the data may be used for

Consortium studies are consented for particular purposes, and that limit survives approval.
The AD Knowledge Portal's certificate requires agreement to "respect any research use
limitations identified by the Data Contributor(s) and indicated with the Data description" —
so a study collected under an Alzheimer's consent does not become usable for unrelated
research once a committee says yes. The public annotations name the study, the diagnosis and
the contributor before any application starts; read them, and read the study wiki, and decide
whether the cohort can answer your question at all. Sending someone through a months-long
process for data that cannot is the expensive mistake, and it is avoidable with two anonymous
API calls.

### Work out which tier your syn id is in

The requirement type is the answer, and it is machine-readable. Run the pre-flight, then
`GET /repo/v1/entity/{id}/accessRequirement` and read `concreteType`:

| what you observe | tier | what it costs |
|---|---|---|
| `canDownload: true` while unauthenticated (`isEntityOpenData: true`) | **open** | nothing |
| `restrictionLevel: OPEN`, no requirements, `canDownload: false` | **registered** | a free account, minutes |
| `TermsOfUseAccessRequirement` | **registered** | a free account plus one click-through |
| `SelfSignAccessRequirement` | **registered** | you attest; may also demand certification or a validated profile |
| `ManagedACTAccessRequirement` | **controlled** | an application a committee reviews |
| `LockAccessRequirement` | **controlled** | no self-service route — contact the ACT |
| `canView: false`, or 403 on the entity | not visible | ask the contributing group whether it is meant to be public |

Two flags on a `SelfSignAccessRequirement` or `ManagedACTAccessRequirement` change the answer
materially, so check them rather than assuming: `isCertifiedUserRequired` and
`isValidatedProfileRequired`. Also read `isDUCRequired`, `isIRBApprovalRequired`,
`isIDURequired`, `isTwoFaRequired` and `expirationPeriod` — that set is the whole application,
declared in advance.

**The table answers "can I get the bytes", not "can I get the data".** `canDownload: false`
does not mean the content is closed to you: `syn9738945`, `syn20448807` and the Dataset
`syn32140646` all report `canDownload: false` to an anonymous caller and all return their
full contents to an anonymous SQL query — 12,282, 5,166 and 3,847 rows respectively. Before
telling anyone a portal catalogue needs an account, try querying it. Two entity types make
the table read the wrong thing outright: a `Link` reports its own restriction rather than its
target's, and a `Dataset`'s tier says nothing about the tiers of the thousands of files it
lists, which live under their own benefactors.

### The registered tier — a free account, and possibly a quiz

Synapse has four account levels, and the jumps between them are the registered tier in
practice.

- **Anonymous** reads public metadata and, in rare Open Data cases, downloads. It cannot
  transfer ordinary files at all, which is what the 403 above is telling you.
- **Registered** is a free self-service signup. This is what most `restrictionLevel: OPEN`
  and `TermsOfUseAccessRequirement` content needs. Accepting a click-through requirement is
  done once, in the browser, on the entity's page at
  `https://www.synapse.org/Synapse:synNNNNNNN`.
- **Certified** requires passing a 15-question quiz on Synapse's data-sharing rules, which
  Sage estimates at 15-20 minutes. It gates uploading, and it gates download of anything with
  `isCertifiedUserRequired: true`. Free, immediate, and self-service — take it before you
  need it. The quiz is browser-only; the API endpoint answers
  `You need to login to take the Certification Quiz.`
- **Validated** is identity verification: a complete profile, a linked public ORCID, the
  Synapse Pledge, and one recent identity attestation — a letter from an institutional
  signing official, a notarised letter, or a professional licence. Required where
  `isValidatedProfileRequired: true`. You cannot be your own signing official.

For API work, a registered account issues a personal access token from its Synapse settings;
send it as `Authorization: Bearer <token>` on the same endpoints used above. Nothing in the
code changes but the header. Never commit the token.

### The controlled tier — what a `ManagedACTAccessRequirement` application asks

Requirements differ per study, so read the flags for *your* id. Taking the AD Knowledge
Portal's requirement 9603055 as the worked example, its own certificate — openly downloadable
at `syn9890650`, no account needed, and worth reading before you start — asks the requester
to:

1. **Hold an active Synapse account.**
2. **Write an intended data use statement**, 1-3 paragraphs in English covering the research
   objectives, the main testable hypothesis and the procedures. `isIDUPublic: true` here, so
   it is published on the portal's researcher community page with the lead investigator's name
   and affiliation. Write it as something you are content to have public.
3. **Submit the data use certificate co-signed by an authorised institutional signing
   official.** Not the requester. A signing official is the person at your institution
   empowered to bind it to the terms — usually in a research administration, sponsored
   programs or technology transfer office. This is the step with real calendar time in it, and
   the one to start early.
4. **List every collaborator** who will touch the data, with name, Synapse username and
   email. Collaborators at a different institution file their own request.

Access lasts one year (`expirationPeriod` 365 days) and renewal needs an annual progress
report of 1-3 paragraphs, an updated collaborator list and reconfirmation of the terms.
Sage does not publish a review turnaround, so plan on the signing official's schedule
dominating and do not promise anyone a date. The requirement's own terms also commit the
requester to keeping data confidential, not attempting re-identification, destroying local
copies at project end, and reporting any misuse to the Access and Compliance Team within
5 business days. Requests are filed from the entity's page in the browser; the ACT is
reachable at `act@sagebase.org`.

### Assist with the application; do not author it

Drafting an intended data use statement from the researcher's own aims is useful work, and so
is checklisting the requirements above, explaining what a signing official is, and tracking
the one-year expiry.

**Do not fill in attestations.** IRB or ethics approval status, data security arrangements,
the undertaking not to re-identify participants, the identity of a signing official — those
are legal claims published under a named person's name and countersigned by an institution.
An agent that makes them easy to produce makes them easy to produce carelessly. Surface each
one, say who must answer it, and stop. Do not sign, do not paste, do not guess a determination
number, and do not offer a workaround for a requirement someone cannot meet.

## When Synapse is not the answer

"Available on Synapse" is a claim in a paper, not a guarantee, and consortium papers are
routinely assumed to be on Synapse when they are not. Oh et al., *Nature* 2023
(`doi:10.1038/s41586-023-06802-1`), the organ-specific plasma-proteome aging clocks across
roughly 5,700 samples, is a clean example: searching Synapse for it returns nothing, and the
paper's own data availability statement routes each cohort elsewhere — a Stanford ADRC release
committee, two named principal investigators by email, NIAGADS study `ng00130` for the
Knight-ADRC samples, and the original publications for the rest, with age-association
statistics in a public web application. The models ship as a Python package instead.

Two lessons. Read the data availability statement before searching, because a repository
search cannot distinguish "not deposited" from "deposited privately". And when a paper names
several routes, the cheapest one is rarely Synapse — check whether summary statistics or a
released model answers your question before applying for individual-level data.

## Try it

A self-contained check that this skill still works. Public endpoints, no account, no key.

**Data** — three real Synapse entities that sit in three different access tiers inside the
AD Knowledge Portal namespace, one id that does not exist, and five entities of other types
that each break a plausible simplification:

    https://repo-prod.prod.sagebase.org/repo/v1/entity/syn9890650        Open Data, downloadable
    https://repo-prod.prod.sagebase.org/repo/v1/entity/syn3219045        ROSMAP — click-through terms
    https://repo-prod.prod.sagebase.org/repo/v1/entity/syn3157322        ROSMAP metadata — ACT controlled
    https://repo-prod.prod.sagebase.org/repo/v1/entity/syn17083367       study catalogue table, 196 rows
    https://repo-prod.prod.sagebase.org/repo/v1/entity/syn9738945        file view, 12,282 rows
    https://repo-prod.prod.sagebase.org/repo/v1/entity/syn32140646       Dataset, 3,849 items
    https://repo-prod.prod.sagebase.org/repo/v1/entity/syn3381264        Link into a controlled folder
    https://repo-prod.prod.sagebase.org/repo/v1/entity/syn13363290       Agora manifest, 115 versions

`syn9890650` is the AMP-AD Knowledge Portal controlled-access Data Use Certificate, a 4-page
PDF flagged as Open Data — it carries no access requirement of its own, which is why an
anonymous caller can read it. `syn3219045` and `syn3157322` are the ROSMAP study folder and
its metadata subfolder; their *metadata* is public, which is what makes them usable in a test
that needs no credential. The last five are queried or inspected, never downloaded — the
table, view and Dataset answer anonymous SQL in full, and `syn3381264` and `syn13363290` are
read for their restriction and version records only. The portal asks that publications using
AD Knowledge Portal data cite both the portal and the contributing groups. Last confirmed
reachable 2026-08-18.

Steps 6 to 10 are the counter-examples this skill was rewritten around — each one is a route
that returns a plausible answer that is not the whole answer, and each assertion fails if the
simplification is put back.

```python
import hashlib, json, time, urllib.error, urllib.request

REPO = "https://repo-prod.prod.sagebase.org/repo/v1"
FILESVC = "https://repo-prod.prod.sagebase.org/file/v1"


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    r = urllib.request.urlopen(req, timeout=90)
    return r.status, json.loads(r.read())


def get(url):
    return urllib.request.urlopen(url, timeout=90).read()


# 1. restrictionInformation on its own cannot tell "open" from "does not exist".
code, ghost = post(f"{REPO}/restrictionInformation",
                   {"objectId": "syn999999999", "restrictableObjectType": "ENTITY"})
print(f"1  syn999999999 restrictionInformation -> HTTP {code}, "
      f"restrictionLevel={ghost['restrictionLevel']}, "
      f"canView={ghost['userEntityPermissions']['canView']}")
assert code == 200 and ghost["restrictionLevel"] == "OPEN"
assert ghost["userEntityPermissions"]["canView"] is False

# 2. bundle2 on the same id is honest about it.
try:
    post(f"{REPO}/entity/syn999999999/bundle2", {"includeEntity": True})
    raise AssertionError("expected 404 from bundle2")
except urllib.error.HTTPError as e:
    print(f"2  syn999999999 bundle2 -> HTTP {e.code} {json.loads(e.read())['reason']}")
    assert e.code == 404

# 3. Three real ids in one namespace, three different tiers.
for sid, expect in (("syn9890650", "OPEN"),
                    ("syn3219045", "RESTRICTED_BY_TERMS_OF_USE"),
                    ("syn3157322", "CONTROLLED_BY_ACT")):
    _, b = post(f"{REPO}/entity/{sid}/bundle2",
                {"includeEntity": True, "includeRestrictionInformation": True})
    ri = b["restrictionInformation"]
    ars = json.loads(get(f"{REPO}/entity/{sid}/accessRequirement"))["results"]
    kinds = [a["concreteType"].rsplit(".", 1)[-1] for a in ars]
    print(f"3  {sid:12} {ri['restrictionLevel']:26} canDownload="
          f"{str(ri['userEntityPermissions']['canDownload']):5} "
          f"openData={str(ri['userEntityPermissions']['isEntityOpenData']):5} "
          f"{kinds}")
    assert ri["restrictionLevel"] == expect
    assert ri["userEntityPermissions"]["canView"] is True
    assert (len(ars) == 0) == (expect == "OPEN")
    assert ri["hasUnmetAccessRequirement"] == (expect != "OPEN")

# 4. The one that is genuinely open downloads with no credential, and the bytes
#    can be checked against the file handle rather than trusted.
fh = json.loads(get(f"{REPO}/entity/syn9890650/filehandles"))["list"][0]
url = get(f"{REPO}/entity/syn9890650/file?redirect=false").decode()
blob = get(url)
print(f"4  {fh['fileName']}  {len(blob):,} B  {fh['contentType']}  md5 ok="
      f"{hashlib.md5(blob).hexdigest() == fh['contentMd5']}")
assert hashlib.md5(blob).hexdigest() == fh["contentMd5"]
assert len(blob) == int(fh["contentSize"])       # str here, int there
assert url.startswith("https://")

# 5. The bulk route refuses the gated file with a 2xx and an error in the body.
_, tok = post(f"{FILESVC}/file/bulk/async/start", {"requestedFiles": [
    {"fileHandleId": "175408255", "associateObjectId": "syn13363290",
     "associateObjectType": "FileEntity"}]})
while True:
    r = urllib.request.urlopen(f"{FILESVC}/file/bulk/async/get/{tok['token']}", timeout=90)
    if r.status != 202:
        res = json.loads(r.read())
        break
    time.sleep(2)
summary = res["fileSummary"][0]
print(f"5  bulk download -> HTTP {r.status} but status={summary['status']} "
      f"code={summary.get('failureCode')}")
assert r.status < 300 and summary["status"] == "FAILURE"
assert summary["failureCode"] == "UNAUTHORIZED"
assert res.get("resultZipFileHandleId") is None


def table_job(tid, query, mask):
    _, t = post(f"{REPO}/entity/{tid}/table/query/async/start",
                {"concreteType": "org.sagebionetworks.repo.model.table."
                                 "QueryBundleRequest",
                 "entityId": tid, "query": query, "partMask": mask})
    while True:
        r = urllib.request.urlopen(
            f"{REPO}/entity/{tid}/table/query/async/get/{t['token']}", timeout=90)
        if r.status != 202:
            return json.loads(r.read())
        time.sleep(3)


# 6. One table query is one page, and the page is not the table. A LIMIT does not
#    lift the cap; only walking query.offset does.
one = table_job("syn9738945", {"sql": "SELECT * FROM syn9738945"}, 0x1 | 0x2)
kept, declared = len(one["queryResult"]["queryResults"]["rows"]), one["queryCount"]
print(f"6  syn9738945 one request -> {kept} rows, table reports {declared}")
assert kept < declared, "the view no longer paginates — re-verify the whole section"

rows, offset = [], 0
while True:
    page = table_job("syn17083367", {"sql": "SELECT * FROM syn17083367", "offset": offset},
                     0x1 | 0x2)
    got = page["queryResult"]["queryResults"]["rows"]
    rows += got
    if not got or len(rows) >= page["queryCount"]:
        total = page["queryCount"]
        break
    offset += len(got)
print(f"6  syn17083367 paged -> {len(rows)} rows, table reports {total}")
assert len(rows) == total

# 7. Free-text terms are ORed. Adding a term that matches nothing changes nothing.
def found(*terms):
    _, d = post(f"{REPO}/search", {"queryTerm": list(terms), "size": 1,
                                   "booleanQuery": [{"key": "node_type",
                                                     "value": "project"}]})
    return d["found"]


one_term, three, plus_junk = (found("alzheimers"),
                              found("alzheimers", "proteomics", "brain"),
                              found("alzheimers", "proteomics", "brain", "zzzznotaword"))
print(f"7  search found: 1 term {one_term}, 3 terms {three}, 3 terms + a non-word {plus_junk}")
assert three > one_term and plus_junk == three      # union, not intersection

# 8. includeTypes has no default, and a Dataset's contents are not children.
def kids(pid, types):
    token, out = None, []
    while True:                                     # the listing itself pages at 50
        body = {"parentId": pid, "includeTypes": list(types)}
        if token:
            body["nextPageToken"] = token
        _, d = post(f"{REPO}/entity/children", body)
        out += d["page"]
        token = d.get("nextPageToken")
        if not token:
            return out


naive = kids("syn2580853", ("folder", "file"))
every = kids("syn2580853", ("folder", "file", "table", "entityview", "dataset",
                            "datasetcollection", "link", "dockerrepo"))
_, ds = post(f"{REPO}/entity/syn32140646/bundle2", {"includeEntity": True})
ds_kids = kids("syn32140646", ("folder", "file", "table", "entityview", "dataset"))
print(f"8  syn2580853 children: folder+file {len(naive)}, all types {len(every)}  |  "
      f"syn32140646 Dataset: children {len(ds_kids)}, items {len(ds['entity']['items'])}")
assert len(every) > len(naive)
assert ds_kids == [] and len(ds["entity"]["items"]) > 1000

# 9. A Link reports its own tier, not its target's.
_, link = post(f"{REPO}/entity/syn3381264/bundle2",
               {"includeEntity": True, "includeRestrictionInformation": True})
tgt = link["entity"]["linksTo"]["targetId"]
_, target = post(f"{REPO}/entity/{tgt}/bundle2", {"includeRestrictionInformation": True})
print(f"9  link syn3381264 {link['restrictionInformation']['restrictionLevel']} "
      f"-> target {tgt} {target['restrictionInformation']['restrictionLevel']}")
assert (link["restrictionInformation"]["restrictionLevel"]
        != target["restrictionInformation"]["restrictionLevel"])

# 10. /version pages at 10, and totalNumberOfResults is a has-more sentinel.
bare = json.loads(get(f"{REPO}/entity/syn13363290/version"))
allv, off = [], 0
while True:
    d = json.loads(get(f"{REPO}/entity/syn13363290/version?offset={off}&limit=50"))
    allv += d["results"]
    if len(d["results"]) < 50:
        break
    off += len(d["results"])
print(f"10 syn13363290 versions: bare call {len(bare['results'])} rows declaring "
      f"{bare['totalNumberOfResults']}, paged {len(allv)}")
assert len(bare["results"]) == 10
assert len(allv) > bare["totalNumberOfResults"]

print("\nall assertions passed")
```

**Expect**

Invariants — these hold regardless of stack version, and a failure means the skill is wrong:

- `POST /restrictionInformation` answers **200** for `syn999999999`, with
  `restrictionLevel: OPEN` and `canView: false`. This is the whole reason the pre-flight
  cannot read `restrictionLevel` alone.
- `bundle2` on the same id answers **404**. The two endpoints disagree about the same entity
  by design, and the honest one is `bundle2`.
- The three real ids report three distinct `restrictionLevel` values, and
  `hasUnmetAccessRequirement` tracks it: false for `OPEN`, true for the other two.
- An entity with `restrictionLevel: OPEN` has **zero** access requirements; a gated one has
  at least one. Requirements are inherited, so the ACT-controlled folder carries both its own
  and its parent's click-wrap.
- `syn9890650` downloads with no credential, and the bytes match the file handle's
  `contentMd5` and `contentSize`. `contentSize` is an integer in the file handle and a string
  in `/entity/{id}/version` — the `int()` is not decoration.
- The bulk download route returns a **2xx** while refusing the file:
  `fileSummary[0].status == "FAILURE"`, `failureCode == "UNAUTHORIZED"`, and no
  `resultZipFileHandleId`. This is the trap the skill exists to teach.
- **A table query returns strictly fewer rows than the table's own `queryCount`** whenever the
  table is larger than one page, and paging on `query.offset` closes the gap exactly. A
  `LIMIT` above the page cap does not.
- **Free-text search is a union.** Three terms match more than one term, and adding a term
  that matches nothing leaves `found` unchanged. Any conjunction would drive it to zero.
- **`includeTypes` of folder-plus-file returns strictly fewer children** than the full type
  list on a portal project, and a `Dataset` reports zero children while declaring thousands
  of items.
- **A `Link`'s `restrictionLevel` differs from its target's.** Reading the tier off the link
  is reading the wrong entity.
- **`GET /entity/{id}/version` returns 10 rows** and declares a `totalNumberOfResults` smaller
  than the number of versions that actually exist.

Observed 2026-08-18 against stack **601.0-20-g9b3fa3d75e** — these move when Synapse
restacks or a portal recurates, so treat a mismatch as drift to investigate, not a failure:

```
1  syn999999999 restrictionInformation -> HTTP 200, restrictionLevel=OPEN, canView=False
2  syn999999999 bundle2 -> HTTP 404 Resource: 'syn999999999' does not exist
3  syn9890650   OPEN                       canDownload=True  openData=True  []
3  syn3219045   RESTRICTED_BY_TERMS_OF_USE canDownload=False openData=False ['TermsOfUseAccessRequirement']
3  syn3157322   CONTROLLED_BY_ACT          canDownload=False openData=False ['TermsOfUseAccessRequirement', 'ManagedACTAccessRequirement']
4  AMP-AD Knowledge Portal-Controlled Accees DUC-v6.pdf  117,501 B  application/pdf  md5 ok=True
5  bulk download -> HTTP 201 but status=FAILURE code=UNAUTHORIZED
6  syn9738945 one request -> 351 rows, table reports 12282
6  syn17083367 paged -> 196 rows, table reports 196
7  search found: 1 term 36, 3 terms 516, 3 terms + a non-word 516
8  syn2580853 children: folder+file 11, all types 141  |  syn32140646 Dataset: children 0, items 3849
9  link syn3381264 OPEN -> target syn2344867 CONTROLLED_BY_ACT
10 syn13363290 versions: bare call 10 rows declaring 11, paged 115

all assertions passed
```

`canDownload` is per-caller, so a reader who has already accepted the AD Knowledge Portal
click-wrap will see `True` on `syn3219045` in step 3 — that is correct behaviour, not drift.
The assertions deliberately test `restrictionLevel` and the requirement list, which do not
depend on who is asking. The counts in steps 6 to 10 are curation-dependent and will move; the
assertions test the *relations* between them — fewer than declared, union not intersection,
subset not superset — which do not.

## Sources

- Synapse — https://www.synapse.org/
- REST API reference — https://rest-docs.synapse.org/
- Synapse documentation, account types and governance — https://docs.synapse.org/
- AD Knowledge Portal — https://adknowledgeportal.synapse.org/
- Omberg et al. (2013) *Nature Genetics* 45, 1121-1126 — https://doi.org/10.1038/ng.2761
- Greenwood et al. (2020) *Current Protocols in Human Genetics* 108, e105 — https://doi.org/10.1002/cphg.105

Synapse content is licensed per project, not repository-wide. Read the entity's terms of use
before redistributing anything, cite the study and the contributing group as the portal's
acknowledgement statements require, and treat the Access and Compliance Team
(`act@sagebase.org`) as the authority on any question this skill leaves open.
