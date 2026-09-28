#!/usr/bin/env node
// Corroborate two dataset-liveness reports taken from different networks.
//
// A dataset is dead only when two independent vantages AGREE it is dead. Either one alone is
// `inconclusive`, because a single vantage cannot tell "this resource is gone" from "my network
// cannot reach it", and we have measured both automated vantages failing in opposite directions
// on the same day:
//
//   2026-09-28, same URL, same User-Agent
//     public.api.researchallofus.org  GitHub Actions: HTML interstitial · sandbox + laptop: 200 JSON
//     HuggingFace Xet CDN             GitHub Actions: reachable        · sandbox: 403 at the hop
//
// The only vantage that saw both correctly is a laptop, which nothing runs from. So there is no
// network to move validation to; there is only agreement, and disagreement is the most useful
// signal either run produces. This is `check-egress.js --classify` reasoning one level up: that
// refuses to believe a report whose failures cluster suspiciously WITHIN a run; this refuses to
// believe one vantage ACROSS runs.
//
// Usage:
//   node scripts/corroborate.js --ours <report.json> --theirs <report.json> [--json]
//   node scripts/corroborate.js --ours - --theirs ci.json          # `-` reads stdin
//
// Exit 0 nothing corroborated dead · 1 at least one corroborated dead · 2 refused to run.
import fs from 'node:fs';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1] ?? null;
};
const JSON_OUT = process.argv.includes('--json');

// How old the other vantage's report may be. An hour apart is the designed cadence (CI at 07:00,
// the sweep at 08:00); a day allows for a missed CI run without silently vouching with a report
// from last week, which is the failure this whole file exists to prevent one layer down.
const MAX_AGE_HOURS = Number(process.env.CORROBORATE_MAX_AGE_HOURS || 24);

function die(msg) {
  console.error(`corroborate: ${msg}`);
  process.exit(2);
}

function load(flag, label) {
  const path = arg(flag);
  if (!path) die(`${flag} <report.json> is required — refusing to run. Corroboration with one report is not corroboration.`);
  let raw;
  try {
    raw = path === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path, 'utf8');
  } catch (e) {
    die(`cannot read ${label} report at ${path}: ${e.message}`);
  }
  let report;
  try {
    report = JSON.parse(raw);
  } catch (e) {
    die(`${label} report at ${path} is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(report.dead)) {
    die(`${label} report has no dead[] array — that is not a check-datasets.js --json report`);
  }
  return report;
}

// Positive integers only, and NaN must not degrade to "no limit". Same rule as check-egress.js:
// a guard that silently becomes a no-op on a bad value is worse than no guard.
if (!Number.isFinite(MAX_AGE_HOURS) || MAX_AGE_HOURS <= 0) {
  die(`CORROBORATE_MAX_AGE_HOURS must be a positive number; got "${process.env.CORROBORATE_MAX_AGE_HOURS}"`);
}

const ours = load('--ours', 'ours');
const theirs = load('--theirs', 'theirs');

// A report with no timestamp cannot be aged, and an un-ageable corroborator is exactly the thing
// that vouches for a network it never measured. Refuse rather than assume it is fresh.
const stamp = Date.parse(theirs.checkedAt ?? '');
if (!Number.isFinite(stamp)) {
  die('the other vantage\'s report has no readable checkedAt — refusing to corroborate against a report of unknown age');
}
const ageHours = (Date.now() - stamp) / 3_600_000;
if (ageHours > MAX_AGE_HOURS) {
  die(`the other vantage's report is ${ageHours.toFixed(1)}h old (limit ${MAX_AGE_HOURS}h) — refusing. A stale corroborator vouches for a network nobody measured today.`);
}
// A report from the future is a clock problem, and a clock problem is exactly what makes an age
// check meaningless. Allow a few minutes of skew and refuse beyond it.
if (ageHours < -0.25) {
  die(`the other vantage's report is dated ${Math.abs(ageHours).toFixed(1)}h in the future — refusing on a clock mismatch`);
}

const byUrl = (report) => new Map((report.dead || []).map((d) => [d.url, d]));
const theirDead = byUrl(theirs);
// Every URL the other vantage looked at and did NOT call dead. Needed to tell "they saw it and it
// was fine" from "they never saw it at all" — those are different, and only the first is evidence.
const theirSeen = new Set([
  ...(theirs.dead || []).map((d) => d.url),
  ...(theirs.inconclusive || []).map((d) => d.url),
  ...(theirs.okUrls || []),
]);
const theyProbed = typeof theirs.datasets === 'number' ? theirs.datasets : null;

const confirmed = [];
const downgraded = [];

for (const d of ours.dead || []) {
  const match = theirDead.get(d.url);
  if (match) {
    confirmed.push({ ...d, alsoDeadAt: { checkedAt: theirs.checkedAt, status: match.status ?? null, reason: match.reason ?? null } });
    continue;
  }
  // They probed this URL and did not call it dead — a real disagreement, and the case this exists
  // for. Downgrade and say who saw what, so a human can tell which network to distrust.
  if (theirSeen.has(d.url) || (theyProbed !== null && theyProbed > 0)) {
    downgraded.push({
      ...d,
      state: 'inconclusive',
      reason: `${d.reason} — but the other vantage did not find it dead (checked ${theirs.checkedAt}); two networks disagree, so this is not knowledge`,
      disagreement: { oursSaid: d.reason ?? null, theirsSaid: theirSeen.has(d.url) ? 'not dead' : 'not in their report' },
    });
    continue;
  }
  downgraded.push({
    ...d,
    state: 'inconclusive',
    reason: `${d.reason} — the other vantage did not probe this URL, so nothing corroborates it`,
    disagreement: { oursSaid: d.reason ?? null, theirsSaid: 'not probed' },
  });
}

const out = {
  ...ours,
  corroboration: {
    ourCheckedAt: ours.checkedAt ?? null,
    theirCheckedAt: theirs.checkedAt,
    theirAgeHours: Number(ageHours.toFixed(2)),
    ourDead: (ours.dead || []).length,
    theirDead: theirDead.size,
    confirmedDead: confirmed.length,
    downgraded: downgraded.length,
  },
  dead: confirmed,
  inconclusive: [...(ours.inconclusive || []), ...downgraded],
};
out.ok = confirmed.length === 0 && (out.unprobed || []).length === 0;

if (JSON_OUT) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`Corroborated ${(ours.dead || []).length} dead result(s) against a vantage checked ${theirs.checkedAt} (${ageHours.toFixed(1)}h ago).`);
  for (const d of confirmed) console.log(`  ✗ ${d.slug}: ${d.url} — ${d.reason} · BOTH vantages agree`);
  for (const d of downgraded) console.log(`  ? ${d.slug}: ${d.url} — ${d.reason}`);
  if (!confirmed.length && !downgraded.length) console.log('  ✓ neither vantage reported a dead dataset');
  else if (!confirmed.length) console.log(`  ✓ nothing survives corroboration — ${downgraded.length} downgraded to inconclusive`);
}

process.exitCode = (confirmed.length || (out.unprobed || []).length) ? 1 : 0;
