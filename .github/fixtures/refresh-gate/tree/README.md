# Frozen base tree — test fixtures, not documentation

**Do not read the skill pages in here as guidance, and do not edit them by hand.** They are
point-in-time copies of real skills, kept only so the auto-merge gate's selftest has a base tree
that cannot move. The live, maintained versions are under `skills/` at the repository root.

`scripts/make-refresh-fixtures.js` generates every fixture in the parent directory by editing
copies of these files inside a throwaway git repo, and `scripts/refresh-gate-selftest.js` runs the
gate against this tree with `--base-dir`. The production path does not use any of it: the
auto-merge workflow judges a real PR against the real repository.

## Why it is frozen

The fixtures and the generator's anchors name exact values — a `version:`, a `verified.date`, a
whole `against:` line. When they read the live `skills/` tree, refreshing one of those skills broke
the selftest twice over: the committed fixture stopped applying to the changed base, and the
generator's anchor stopped matching anything. Six skills were unrefreshable by the routine whose
only job is to refresh them. What the suite tests is the gate's rules against diff shapes, and
those do not depend on which version a skill happens to carry today.

A case can no longer go vacuous either. The generator requires each anchor to match exactly once,
and it now checks that against a file nothing else writes to.

## Re-seeding

```
node scripts/make-refresh-fixtures.js --seed-tree   # re-copy from live skills/
node scripts/make-refresh-fixtures.js              # regenerate the fixtures
node scripts/refresh-gate-selftest.js              # confirm all cases still pass
```

Re-seed deliberately and review the resulting fixture diff, because a re-seed can change what a
case tests — an exploit's anchor line may have moved or gone. There is no routine need to do it:
these copies are a test harness, and they are not published, installed, or rendered anywhere.
