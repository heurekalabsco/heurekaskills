---
name: huggingface-hub
description: Search Hugging Face for models, datasets and Spaces, then read a repo's gate, licence and sizes before any bytes move. The gate is tri-state, so a click-through repo is distinguishable from one an owner approves case by case. Download selectively.
category: data
license: CC-BY-4.0
author: Heureka Labs
version: 1.0.0
tags: [huggingface, model-weights, public-data, licensing]
covers: [hugging face, huggingface, hf hub, model hub, model weights, checkpoint, safetensors, pretrained model, model card, dataset card, parquet, spaces, gradio, mcp server, gated model, licence, license, snapshot download, cache, llama, gemma, esm2, protein language model, benchmark dataset, repo id, lfs, file size, access token, revision, commit hash]
access: [open, registered, controlled]
datasets: [https://huggingface.co/api/models/facebook/esm2_t6_8M_UR50D, https://huggingface.co/api/models/meta-llama/Llama-3.2-1B, https://huggingface.co/api/spaces/black-forest-labs/FLUX.1-Kontext-Dev, https://huggingface.co/facebook/esm2_t6_8M_UR50D/resolve/main/config.json]
allowed-tools: Read, Write, Edit, Bash
verified:
  date: 2026-09-30
  against: huggingface_hub 2.0.0 / Python 3.11.15 / Hub API at huggingface.co
  executed: 17
  unverified: 1
  unverified_reason: >-
    One block pulls an LFS-backed file, which the Hub serves by redirecting to an
    object-storage CDN that the validating environment's egress refuses. What it
    depends on was executed here — the same snapshot_download and allow_patterns
    filter against the non-LFS files of that same repo, and the HEAD that reports
    the LFS file's size and commit. Re-run it from a host that can reach the CDN
    the Hub redirects downloads to.
---
# Hugging Face Hub — read the gate and the licence before the bytes

A growing share of published models and benchmark datasets land here first, often before
any paper. The Hub is a generic repository, so its holdings are whatever people uploaded:
the terms change per repo, the terms are frequently absent, and the file you actually want
may be 30 kB or 300 GB. All three facts are legible over HTTPS *before* anything transfers,
which is what this skill is for.

**Requirements.** Python 3.10 or newer and `pip install huggingface_hub` — Apache-2.0, on
PyPI. **Public repos need no account and no token.** A token is needed only for gated repos
and is discussed under *Requesting access*; until then every call below runs anonymously.
Unauthenticated calls are rate-limited per IP and the library prints a one-line notice
saying so; it is a notice, not an error.

```bash
python3 -m pip install "huggingface_hub>=2.0"
```

Version 2.0.0 moved several things. Where this skill's shapes differ from older snippets you
may have seen, the shapes here are the ones that were executed — see *What 2.0 changed*.

## One id grammar, three repo types

Every repo is `owner/name`, and the type is not part of the id — you pass it separately, or
you call the typed accessor. `model_info`, `dataset_info` and `space_info` each return a
different class with overlapping attributes; `repo_info(..., repo_type=...)` is the generic
form.

```python
from huggingface_hub import HfApi
api = HfApi()

m = api.model_info("facebook/esm2_t6_8M_UR50D")     # ModelInfo
d = api.dataset_info("raycasterai/biopharma-bench")  # DatasetInfo
s = api.space_info("black-forest-labs/FLUX.1-Kontext-Dev")  # SpaceInfo

print(type(m).__name__, type(d).__name__, type(s).__name__)
print(api.repo_exists("facebook/esm2_t6_8M_UR50D"),
      api.repo_exists("heureka-labs/no-such-repo-xyz"))
print(api.file_exists("facebook/esm2_t6_8M_UR50D", "config.json"),
      api.file_exists("facebook/esm2_t6_8M_UR50D", "nope.json"))
```

`repo_exists` and `file_exists` return booleans rather than raising, which makes them the
right probes when a repo id came from somewhere you do not control.

## The gate is tri-state, and that is the whole access question

`info.gated` is **not** a boolean, even though one of its three values is `False`. Reading it
as truthy collapses the only distinction that matters to somebody deciding whether they can
use a model at all.

| `gated` | what a reader faces | practical reading |
|---|---|---|
| `False` | nothing | download anonymously |
| `'auto'` | accept the terms once, signed in; granted immediately | an ordinary requirement, like an account |
| `'manual'` | the repo owner reviews each request individually | nobody can promise you access |

`'auto'` and `'manual'` are both rendered as "gated" on the website, and the difference is
invisible there. It is in the API.

```python
from huggingface_hub import HfApi
api = HfApi()

for rid in ["facebook/esm2_t6_8M_UR50D", "pyannote/speaker-diarization-3.1",
            "meta-llama/Llama-3.2-1B", "google/gemma-2-2b"]:
    i = api.model_info(rid)
    print(f"{rid:38s} gated={i.gated!r}")
```

Observed 2026-09-30: `False`, `'auto'`, `'manual'`, `'manual'` respectively. The *values* are
the invariant; which repo carries which is an owner's setting and can change on any day.

**Metadata on a gated repo is public.** This is the fact that makes the whole
inspect-before-download pattern work, and it holds for `'manual'` repos too: `model_info`
returns the card, the licence, the full file list and the file sizes with no token at all.
Only touching the bytes raises. So you can answer "may I use this, and how big is it" for a
repo you have no access to — and answer it *before* asking anyone for anything.

```python
from huggingface_hub import HfApi, get_hf_file_metadata, hf_hub_url
from huggingface_hub.errors import GatedRepoError
api = HfApi()

G = "meta-llama/Llama-3.2-1B"
i = api.model_info(G)
print("metadata, no token :", i.gated, "|", len(i.siblings), "files",
      "| licence", i.cardData.license)

try:
    get_hf_file_metadata(hf_hub_url(G, "config.json"))
except GatedRepoError as e:
    print("bytes, no token    : GatedRepoError", str(e).splitlines()[0][:40])
```

Note what the second half means in practice: a `GatedRepoError` on a *metadata-looking* call
is still a gate, because `get_hf_file_metadata` is a request against the file. Use
`model_info` when you want facts, not `get_hf_file_metadata`.

You can also push the gate into the search itself, which is usually better than filtering
afterwards:

```python
from huggingface_hub import HfApi
api = HfApi()
ungated = [m.id for m in api.list_models(search="llama", gated=False, limit=5)]
gated   = [m.id for m in api.list_models(search="llama", gated=True,  limit=5)]
print("ungated:", len(ungated), "| gated:", len(gated))
```

The `gated=` filter is a boolean here even though `info.gated` is tri-state — `gated=True`
returns both `'auto'` and `'manual'` repos, so it narrows the field without answering the
question. Read `info.gated` on the candidates you keep.

## Where the licence actually lives, and when it is absent

Three places carry licence information and they are not equivalent.

- **`info.cardData.license`** — the declared identifier. This is the one to read.
- **`info.tags`** — carries a mirrored `license:<id>` entry, useful when scanning a search
  result page without a second request per repo.
- **`info.cardData.license_name` / `license_link`** — populated when `license` is the literal
  string `'other'`, which means *read the linked terms, there is no identifier for them*.

```python
from huggingface_hub import HfApi
api = HfApi()

for rid in ["facebook/esm2_t6_8M_UR50D", "meta-llama/Llama-3.2-1B",
            "google/gemma-2-2b", "openai/clip-vit-base-patch32"]:
    c = api.model_info(rid).cardData
    print(f"{rid:34s} license={c.license!r:12s} name={c.get('license_name')!r}")
```

Two things to expect from that output. **Identifiers are not restricted to SPDX** —
`'llama3.2'` and `'gemma'` are real values naming a bespoke licence, and neither is a
permissive licence you can assume anything about. And **`None` is common on serious repos**:
`openai/clip-vit-base-patch32` has been downloaded millions of times and its card states no
licence at all. Silence is not permission. Report the absence and let a human decide; do not
infer terms from a base model, from the organisation, or from the fact that the weights
download without complaint.

`cardData` is an object, not a dict — `ModelCardData`, `DatasetCardData`, `SpaceCardData`.
It supports attribute access, `.get()`, `[...]` and `.to_dict()`, but **not** `.keys()`, so
code written against an older dict-shaped card fails on the iteration rather than on the
lookup.

```python
from huggingface_hub import HfApi
c = HfApi().model_info("facebook/esm2_t6_8M_UR50D").cardData
print(type(c).__name__, "|", c.license, "|", c.get("license"), "|", c["license"])
print("to_dict keys:", sorted(c.to_dict().keys()))
try:
    c.keys()
except AttributeError as e:
    print("c.keys() ->", type(e).__name__)
```

## Sizes without downloading

Two ways, and the default is the trap.

`model_info(...).siblings` lists filenames with **`size=None`** unless you ask for metadata.
`list_repo_tree` returns sizes with no extra argument. If you are only after the manifest,
use the tree.

```python
from huggingface_hub import HfApi
api = HfApi()
R = "facebook/esm2_t6_8M_UR50D"

plain = api.model_info(R).siblings
print("siblings, default   :", [(s.rfilename, s.size) for s in plain][:2])

meta = api.model_info(R, files_metadata=True).siblings
print("siblings, metadata  :", [(s.rfilename, s.size) for s in meta][:2])

print("tree:")
for e in api.list_repo_tree(R, recursive=False):
    print(f"  {e.path:26s} {e.size:>10} lfs={bool(e.lfs)}")
print("total bytes:", sum(e.size for e in api.list_repo_tree(R, recursive=False)))
```

`lfs` is the flag that tells you which entries are the large ones, and it is what decides
whether a download is a metadata fetch or a transfer. For a single file, a HEAD gives size
and the resolved commit without transferring the body — and it works on LFS files:

```python
from huggingface_hub import get_hf_file_metadata, hf_hub_url
for fn in ["config.json", "model.safetensors"]:
    m = get_hf_file_metadata(hf_hub_url("facebook/esm2_t6_8M_UR50D", fn))
    print(f"{fn:20s} size={m.size:>10} commit={m.commit_hash[:8]}")
```

**Pin the commit.** `main` moves. `m.commit_hash` from that HEAD, or `info.sha`, is what to
record in a methods section and to pass back as `revision=` so a rerun reads the same bytes.

## Finding repos

```python
from huggingface_hub import HfApi
api = HfApi()

for m in api.list_models(search="esm2", sort="downloads", limit=3):
    lic = [t for t in (m.tags or []) if t.startswith("license:")]
    print(f"model   {m.id:44s} dl={m.downloads:>9} {lic}")

for d in api.list_datasets(search="protein", sort="downloads", limit=3):
    print(f"dataset {d.id:44s} dl={d.downloads}")
```

`sort="downloads"` is descending. There is **no `direction` argument in 2.0.0** — passing one
raises `TypeError`, which is the single most likely way an older snippet breaks here. `limit`
caps a lazy generator, so asking for 3 costs one page, not a crawl of the Hub.

## Spaces, and whether one is callable

A Space can expose itself as an MCP server, and two conditions have to hold together.
It must carry the `mcp-server` tag, **and** its runtime has to be up — a tagged Space that is
asleep or has crashed advertises an endpoint that will not answer.

```python
from huggingface_hub import HfApi
api = HfApi()
s = api.space_info("black-forest-labs/FLUX.1-Kontext-Dev")
callable_now = "mcp-server" in (s.tags or []) and s.runtime.stage == "RUNNING"
print("sdk       :", s.sdk)
print("tags      :", s.tags)
print("stage     :", s.runtime.stage)
print("host      :", s.host)
print("callable  :", callable_now)
```

`s.host` is the base URL the Space serves on. Treat the tag as the owner's claim rather than
a guarantee of a working schema, and `stage` as a reading taken at that moment — a
ZeroGPU Space sleeps on idle and wakes on request, so `SLEEPING` is not a fault.
`api.list_spaces(filter="mcp-server", sort="likes", limit=N)` enumerates them; the tag is
broadly adopted, so expect general-purpose image and video tools rather than a scientific
shortlist.

## Get the files

Two functions, and the choice between them is about how much of the repo you want.

`hf_hub_download` takes one file and returns its local path. It is the right call for a
config, a tokenizer, a README, or a single checkpoint you picked off the tree.

```python
from huggingface_hub import hf_hub_download
import os
p = hf_hub_download("facebook/esm2_t6_8M_UR50D", "config.json", cache_dir="./hfcache")
print(os.path.getsize(p), "bytes ->", p.split("snapshots/")[-1])
```

`snapshot_download` takes the repo, and **`allow_patterns` is what keeps it from taking
everything**. A bare `snapshot_download` on a multi-format repo pulls every serialization
of the same weights — the ESM-2 repo above ships `.safetensors`, `.bin` and `.h5`, roughly
92 MB for three copies of one 31 MB model.

```python
from huggingface_hub import snapshot_download
import os
d = snapshot_download("facebook/esm2_t6_8M_UR50D",
                      allow_patterns=["*.json", "*.txt"],
                      cache_dir="./hfcache")
print(sorted(os.listdir(d)))
```

Add `"*.safetensors"` to that list to bring the weights and still skip the duplicate
formats, and pin the commit while you are there. `ignore_patterns` is the complement when it
is easier to name what you do not want.

```python
from huggingface_hub import snapshot_download
d = snapshot_download("facebook/esm2_t6_8M_UR50D",
                      allow_patterns=["*.json", "*.txt", "*.safetensors"],
                      revision="c731040fcd8d73dceaa04b0a8e6329b345b0f5df",
                      cache_dir="./hfcache")
print(d)   # 31,384,292 bytes of weights, not the 93 MB the bare call would fetch
```

**That last block was not executed here**, and it is the only one in this skill that was not.
Pulling an LFS-backed file redirects to an object-storage CDN that the validating
environment's egress refuses, so the block above is documented rather than run. What it
depends on was checked from the same environment — `snapshot_download` and its
`allow_patterns` filter were executed against the non-LFS files of this exact repo, and the
HEAD reporting `model.safetensors` at 31,384,292 bytes on that commit succeeds from here.
The gap is the transfer hop, not the API or the call. Re-run it from a host that can reach
the CDN.

Never issue a bare `snapshot_download` on a repo you have not read the tree of. On this repo
it fetches `.safetensors`, `.bin` and `.h5` — three serializations of one 31 MB model.

### The cache is content-addressed, and shared on purpose

```python
from huggingface_hub import scan_cache_dir
c = scan_cache_dir("./hfcache")
print("on disk:", c.size_on_disk, "bytes across", len(c.repos), "repo(s)")
for r in c.repos:
    print(" ", r.repo_id, r.repo_type, r.nb_files, "files")
```

The layout under the cache root is `models--<owner>--<name>/` with three children: `blobs/`
named by content hash, `snapshots/<commit>/` holding links into them, and `refs/` mapping a
branch to a commit. So two revisions that share a file store it once, and an interrupted
transfer leaves a `.incomplete` blob that the next attempt resumes rather than restarts.
Point `cache_dir=` at project-local storage when a working directory is the unit that gets
archived or deleted; otherwise the default root applies and is shared across projects, which
is usually what you want for weights.

`HF_HOME` relocates the whole cache, and the CLI shipped as `hf` in 2.0.0 exposes
`hf cache ls` and related subcommands for inspecting and pruning it.

## Requesting access

Only for `gated == 'manual'`. Everything else on the Hub is either open or a click-through.

**Read the licence first, because it binds harder than the form does.** Bespoke model
licences — the `'llama3.2'` and `'gemma'` identifiers above are the common ones — carry
use restrictions, acceptable-use policies and sometimes field-of-use limits that survive
approval. A grant of access does not grant a use the terms exclude, so establish that the
intended use is permitted before spending anything on the request.

Then, mechanically: the request form is on the repo's own page on the website, it is answered
by **the repo owner rather than by Hugging Face**, and the grant is attached to your
account — not to an organisation, not to a token, and not transferable to a colleague. There
is no API call that submits one, and no published turnaround: some owners approve within
hours, others never respond. Plan for the request to be declined by silence.

**This skill cannot obtain access, and it cannot ask on your behalf.** Where a form asks for
your name, affiliation, country or intended use, those are representations made under your
own name — draft wording with them if it helps, and leave the submitting and the attesting
to the person whose name is on it.

Once granted, authenticate by exporting `HF_TOKEN` in the environment; the same variable
raises the anonymous rate limit on public repos. Read it from the environment, never inline
in a notebook or a committed file, and prefer a read-only token.

```bash
export HF_TOKEN="hf_..."   # from your account settings; never commit this
```

If the answer is no, or does not come, check for an ungated equivalent before giving up.
`list_models(search=..., gated=False)` is the fastest version of that question, and for
widely-used architectures a community mirror or a smaller sibling is common.

## Errors you will actually hit

| exception | means |
|---|---|
| `RepositoryNotFoundError` | no such repo — or it is private and your token cannot see it |
| `GatedRepoError` | the repo exists and you have not been granted access |
| `RemoteEntryNotFoundError` | the repo is fine, the filename is not |

**Import them from `huggingface_hub.errors`.** That module is the canonical home for all of
them; `huggingface_hub.utils` re-exports most of the set but **not**
`RemoteEntryNotFoundError`, so the `.utils` path raises `ImportError` on exactly the one you
reach for when a filename is wrong. `RemoteEntryNotFoundError` subclasses the older
`EntryNotFoundError`, so code catching that name keeps working.

The first two are indistinguishable by message alone when a token is involved, which is why
`repo_exists` is worth a call before concluding a repo is gone.

```python
from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.errors import RepositoryNotFoundError, RemoteEntryNotFoundError
api = HfApi()
try:
    api.model_info("heureka-labs/no-such-repo-xyz")
except RepositoryNotFoundError:
    print("missing repo -> RepositoryNotFoundError")
try:
    hf_hub_download("facebook/esm2_t6_8M_UR50D", "nope.json", cache_dir="./hfcache")
except RemoteEntryNotFoundError:
    print("missing file -> RemoteEntryNotFoundError")
```

## What 2.0 changed

Checked against 2.0.0 on 2026-09-30, because each of these silently breaks older code:

- `list_models` / `list_datasets` / `list_spaces` **dropped `direction`**. `sort=` alone,
  descending.
- `cardData` is a typed object, not a dict. `.keys()` is gone; `.to_dict()` replaces it.
- the missing-file exception is `RemoteEntryNotFoundError`, and it is importable from
  `huggingface_hub.errors` but **not** from `huggingface_hub.utils`.
- the command-line entry point is `hf`.
- the package requires Python 3.10 or newer.

## Try it

A self-contained check that this skill still works. Public repos, no account, no token.

**Data** — four Hub endpoints, all readable anonymously:

    https://huggingface.co/api/models/facebook/esm2_t6_8M_UR50D
    https://huggingface.co/api/models/meta-llama/Llama-3.2-1B
    https://huggingface.co/api/spaces/black-forest-labs/FLUX.1-Kontext-Dev
    https://huggingface.co/facebook/esm2_t6_8M_UR50D/resolve/main/config.json

`facebook/esm2_t6_8M_UR50D` is an ungated MIT protein language model, small enough that its
whole non-LFS surface transfers in under a second. `meta-llama/Llama-3.2-1B` is the
`'manual'` gate — present so the check proves metadata is readable without access rather
than assuming it. The Space is the `mcp-server` case. Last confirmed reachable 2026-09-30.

```bash
python3 -m venv .venv && ./.venv/bin/pip install -q "huggingface_hub>=2.0"
```

Save the block below to a file and run it with that interpreter.

```python
import os
from huggingface_hub import (HfApi, hf_hub_download, snapshot_download,
                             get_hf_file_metadata, hf_hub_url)
from huggingface_hub.errors import GatedRepoError, RemoteEntryNotFoundError
api = HfApi()
R, G = "facebook/esm2_t6_8M_UR50D", "meta-llama/Llama-3.2-1B"

# --- the gate is tri-state; False is one of three values, not a boolean ---
gates = {r: api.model_info(r).gated for r in
         [R, "pyannote/speaker-diarization-3.1", G, "google/gemma-2-2b"]}
print("gates          :", gates)
assert gates[R] is False
assert set(gates.values()) <= {False, "auto", "manual"}
assert gates[G] in ("auto", "manual")          # an owner may relax it; still gated

# --- metadata on a manual-gated repo is public; only the bytes are not ---
gi = api.model_info(G)
assert gi.cardData.license and len(gi.siblings) > 0
print("gated metadata :", gi.gated, "|", len(gi.siblings), "files |",
      gi.cardData.license)
try:
    get_hf_file_metadata(hf_hub_url(G, "config.json"))
    raise AssertionError("gate opened — re-read the access section")
except GatedRepoError:
    print("gated bytes    : GatedRepoError, as expected")

# --- cardData is an object: .get and [] work, .keys() does not ---
c = api.model_info(R).cardData
assert c.license == c.get("license") == c["license"] == "mit"
assert not hasattr(c, "keys")
print("cardData       :", type(c).__name__, "| license", c.license)

# --- sizes: siblings default to None, the tree does not ---
assert all(s.size is None for s in api.model_info(R).siblings)
tree = list(api.list_repo_tree(R, recursive=False))
assert all(e.size is not None for e in tree)
sizes = {e.path: e.size for e in tree}
lfs = {e.path: e.size for e in tree if e.lfs}
print("files / lfs    :", len(tree), "/", len(lfs), "| total",
      sum(e.size for e in tree), "bytes")
assert len(lfs) >= 1 and all(v > 10_000_000 for v in lfs.values())

# --- HEAD reports an LFS file's size and commit without transferring it ---
md = get_hf_file_metadata(hf_hub_url(R, "model.safetensors"))
assert md.size == sizes["model.safetensors"]
assert len(md.commit_hash) == 40
print("head on weights:", md.size, "bytes @", md.commit_hash[:8])

# --- download only what was asked for ---
p = hf_hub_download(R, "config.json", cache_dir="./hfcache")
assert os.path.getsize(p) == sizes["config.json"]
d = snapshot_download(R, allow_patterns=["*.json", "*.txt"], cache_dir="./hfcache")
got = sorted(os.listdir(d))
assert not any(f.endswith((".safetensors", ".bin", ".h5")) for f in got)
print("snapshot       :", got)

# --- error paths ---
for call, exc in [(lambda: api.model_info("heureka-labs/no-such-repo-xyz"), "RepositoryNotFoundError"),
                  (lambda: hf_hub_download(R, "nope.json", cache_dir="./hfcache"), "RemoteEntryNotFoundError")]:
    try:
        call()
        raise AssertionError("expected " + exc)
    except Exception as e:
        assert type(e).__name__ == exc, (type(e).__name__, exc)
print("errors         : RepositoryNotFoundError, RemoteEntryNotFoundError")

# --- no direction= in 2.0 ---
try:
    api.list_models(search="esm2", limit=1, direction=-1)
    raise AssertionError("direction= accepted — 2.0 note is stale")
except TypeError:
    print("direction=     : TypeError, as documented")
print("OK")
```

**Expect** — invariants, which hold across versions:

- `gated` takes only `False`, `'auto'`, `'manual'`; `facebook/esm2_t6_8M_UR50D` is `False`.
- a `'manual'` repo returns card, licence and file list anonymously, and raises
  `GatedRepoError` on any request against a file.
- `cardData` exposes `.license`, `.get()` and `[...]`, and has no `.keys()`.
- `siblings[].size` is `None` by default; `list_repo_tree` entries carry sizes.
- a HEAD returns an LFS file's size and a 40-character commit hash without the body.
- `allow_patterns` excludes what it does not name.
- `direction=` raises `TypeError`.

**Observed 2026-09-30**, against `huggingface_hub` 2.0.0 — a mismatch here is drift to
investigate, not a failure:

- gates — `False`, `'auto'`, `'manual'`, `'manual'`; licences `mit`, `mit`, `llama3.2`, `gemma`.
- `facebook/esm2_t6_8M_UR50D` — 9 files at commit `c731040f`, 3 LFS, 93,052,264 bytes total;
  `model.safetensors` 31,384,292; `config.json` 775.
- `snapshot_download` with `["*.json", "*.txt"]` returns `config.json`,
  `special_tokens_map.json`, `tokenizer_config.json`, `vocab.txt`.
- `meta-llama/Llama-3.2-1B` — 13 files listed anonymously.

## Sources

- `huggingface_hub` on PyPI — Apache-2.0, 2.0.0, requires Python 3.10 or newer.
- The Hub HTTP API at `https://huggingface.co/api/`, read anonymously for every shape
  asserted above.
