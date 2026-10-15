# refresh-gate fixtures

Inputs for `scripts/is-verification-refresh.js`, the gate that decides whether a nightshift PR
may merge with **no human review**.

**Every `E*`, `V*` and `R*` file is an exploit that defeated an earlier version of the gate.**
They were produced by an adversarial review — Codex and a proactive audit, each briefed to
treat the gate as a security boundary and construct a passing malicious diff — and each was
confirmed by execution, not reasoned about. Seventeen of them got through v1.

Keep them. A gate is only known to reject what someone has watched it reject, and these are the
only record of what it has to keep rejecting.

| fixture | the change it smuggles |
|---|---|
| `PASS-real-refresh` | **the one that must be ACCEPTED** — version bump, `verified:` block, six prose observation dates |
| `V1`, `E1` | a decimal threshold: `FDR < 0.05` → `< 0.50`, and the `0.223` iLIS cutoff |
| `V2`, `E2` | a DOI retargeted at a different paper |
| `V3`, `V4` | the gate editing itself — `date: process.exit(0);` is a valid JS label *and* passes the old excusal |
| `V5` | a real refresh with one moved threshold hidden in it |
| `E3`, `E7` | arbitrary prose, and a whole new file, behind a `date:`/`verified:` prefix |
| `E4a/b/c`, `R1`, `R2` | rename, chmod, binary swap — diffs with no `+`/`-` lines at all |
| `E5` | a caveat moved out of `SKILL.md` into `references/`, so a global pool sees a matched pair |
| `E6` | deleting a `--flag` line, which a naive `---` header skip swallows |
| `E8`, `E9` | a URL version tail, and an IPv4 address, both read as version bumps |

Two things these taught, worth stating because they are not obvious from the code:

**Position is not enough.** `Accept hits with FDR < 0.05.` is prose, and `0.05` is a version to
any regex. When an incidental bug that had been rejecting `E1`/`E2` was fixed, both walked
straight back through.

**Rejection is not enough either.** A gate that refuses everything passes this whole suite.
`PASS-real-refresh` exists so the suite fails when the gate stops being useful, and it caught a
real over-correction: a frontmatter `version:` bump reads as "a version on a line with no date".
