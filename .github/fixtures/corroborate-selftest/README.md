# corroborate selftest fixtures

Committed inputs for `scripts/corroborate.js`, exercised on every PR that touches it.

`__NOW__` and `__MINUS_1H__` are substituted at run time. The dates cannot be hardcoded: the
script refuses a report older than `CORROBORATE_MAX_AGE_HOURS`, so a fixed timestamp would
start passing for the wrong reason the day after it was written — the guard would fire before
the logic under test ever ran, and the selftest would go green on a refusal.

Each case pins a behaviour that was wrong in the first version of the script, found by audit:

| fixture pair | asserts | was |
|---|---|---|
| `agree-*` | a death both vantages see survives | correct |
| `disagree-*` | a death only one vantage sees is downgraded | correct |
| `blanket-*` | a corroborator whose failures span 3+ hosts on one status is refused | confirmed 3 false deaths |
| `badtype-*` | a wrong-typed `inconclusive` refuses (exit 2) | threw, exit 1 — which reads as "corroborated dead" |
| `stale-gap-*` | reports 13h apart are too far apart to corroborate | bound was 6h, which the real schedule could never meet |
