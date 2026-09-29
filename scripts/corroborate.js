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
// Exit 0 nothing to act on · 1 at least one corroborated dead, OR a declared dataset that was
// never probed · 2 refused to run.
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
// How far apart the two reports may be taken. An hour is the designed cadence; six allows a
// missed or delayed run without letting yesterday corroborate today.
const MAX_GAP_HOURS = Number(process.env.CORROBORATE_MAX_GAP_HOURS || 6);

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
  // Every array this file later spreads, not just dead[]. `|| []` defends against null and
  // undefined but NOT against a wrong type, so `inconclusive: {}` used to reach the spread and
  // throw an unhandled TypeError — which exits 1, and 1 is this script's "corroborated dead"
  // signal. A malformed report was indistinguishable from a real death to any caller reading the
  // exit code, which is the precise failure this file exists to prevent one layer down.
  for (const field of ['inconclusive', 'unprobed', 'okUrls']) {
    if (report[field] !== undefined && !Array.isArray(report[field])) {
      die(`${label} report has a ${field} that is not an array — refusing rather than guessing at a malformed report`);
    }
  }
  return report;
}

// Positive integers only, and NaN must not degrade to "no limit". Same rule as check-egress.js:
// a guard that silently becomes a no-op on a bad value is worse than no guard.
if (!Number.isFinite(MAX_AGE_HOURS) || MAX_AGE_HOURS <= 0) {
  die(`CORROBORATE_MAX_AGE_HOURS must be a positive number; got "${process.env.CORROBORATE_MAX_AGE_HOURS}"`);
}
if (!Number.isFinite(MAX_GAP_HOURS) || MAX_GAP_HOURS <= 0) {
  die(`CORROBORATE_MAX_GAP_HOURS must be a positive number; got "${process.env.CORROBORATE_MAX_GAP_HOURS}"`);
}

const ours = load('--ours', 'ours');
const theirs = load('--theirs', 'theirs');

// A report with no timestamp cannot be aged, and an un-ageable corroborator is exactly the thing
// that vouches for a network it never measured. Refuse rather than assume it is fresh.
// Both reports are aged, not just `theirs`. An earlier version checked only the corroborator,
// which had it exactly backwards: every confirmed-dead entry originates in `ours.dead`, so a
// stale `ours` produces stale *verdicts*, while a stale `theirs` only produces stale
// corroboration. A 40-day-old `ours` was accepted and issued verdicts.
const ageOf = (report, label) => {
  const stamp = Date.parse(report.checkedAt ?? '');
  if (!Number.isFinite(stamp)) {
    die(`the ${label} report has no readable checkedAt — refusing to reason about a report of unknown age`);
  }
  const hours = (Date.now() - stamp) / 3_600_000;
  if (hours > MAX_AGE_HOURS) {
    die(`the ${label} report is ${hours.toFixed(1)}h old (limit ${MAX_AGE_HOURS}h) — refusing. A stale report vouches for a network nobody measured today.`);
  }
  // A report from the future is a clock problem, and a clock problem is exactly what makes an
  // age check meaningless. Allow a few minutes of skew and refuse beyond it.
  if (hours < -0.25) {
    die(`the ${label} report is dated ${Math.abs(hours).toFixed(1)}h in the future — refusing on a clock mismatch`);
  }
  return hours;
};
const ourAgeHours = ageOf(ours, 'ours');
const ageHours = ageOf(theirs, "other vantage's");

// Two reports far apart in time are not two views of the same moment, and corroboration is a
// claim about a moment. The designed cadence is an hour (CI at 07:00, the sweep at 08:00);
// this bounds how far that may drift before the comparison stops meaning anything.
const gapHours = Math.abs(ourAgeHours - ageHours);
if (gapHours > MAX_GAP_HOURS) {
  die(`the two reports are ${gapHours.toFixed(1)}h apart (limit ${MAX_GAP_HOURS}h) — refusing. Corroboration is a claim about one moment, and these are two.`);
}

// Two identically-broken vantages used to confirm each other. Reproduced: three unrelated hosts,
// identical HTTP 403, both reports agreeing — three "BOTH vantages agree" verdicts, which is
// precisely the blanket-egress signature this whole file was written about. Agreement between two
// networks is only evidence if both were WORKING; two failures do not make a fact.
//
// Same test check-egress.js --classify applies within a run, and the same threshold: three or more
// unrelated hosts failing on one status is past coincidence. Unrelated operators do not fail in
// lockstep.
function blanketFailureSignature(report) {
  const byStatus = new Map();
  for (const d of report.dead || []) {
    const status = d.status ? `HTTP ${d.status}` : (d.reason || 'unknown');
    let host;
    try { host = new URL(d.url).host; } catch { host = String(d.url); }
    if (!byStatus.has(status)) byStatus.set(status, new Set());
    byStatus.get(status).add(host);
  }
  for (const [status, hosts] of byStatus) {
    if (hosts.size >= 3) return { status, hosts: [...hosts] };
  }
  return null;
}

for (const [report, label] of [[theirs, "the other vantage's"], [ours, 'the ours']]) {
  const blanket = blanketFailureSignature(report);
  if (blanket) {
    die(`${label} report has ${blanket.hosts.length} unrelated hosts (${blanket.hosts.join(', ')}) all failing with ${blanket.status} — that is the signature of that run's network, not of several datasets dying at once. Refusing: agreement between two networks is only evidence if both were working.`);
  }
}

const byUrl = (report) => new Map((report.dead || []).map((d) => [d.url, d]));
const theirDead = byUrl(theirs);
// Every URL the other vantage looked at and did NOT call dead. Needed to tell "they saw it and it
// was fine" from "they never saw it at all" — those are different, and only the first is evidence.
//
// `okUrls` is the load-bearing entry, and check-datasets.js only began emitting it alongside this
// file. Before that this set could hold nothing but dead-and-inconclusive URLs — the one category
// it exists to exclude — so a URL the other vantage had fetched successfully came back as "not in
// their report": the exact inverse of the truth, in the field a human uses to decide which network
// to distrust.
const theirSeen = new Set([
  ...(theirs.dead || []).map((d) => d.url),
  ...(theirs.inconclusive || []).map((d) => d.url),
  ...(theirs.okUrls || []),
]);
const theyProbed = typeof theirs.datasets === 'number' ? theirs.datasets : null;
// Whether the other report can speak to coverage at all. Without `okUrls` it cannot, and saying
// "they did not probe this" on that basis would be a guess dressed as a finding.
const theirCoverageKnown = Array.isArray(theirs.okUrls);

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
  if (theirSeen.has(d.url) || !theirCoverageKnown || (theyProbed !== null && theyProbed > 0)) {
    downgraded.push({
      ...d,
      state: 'inconclusive',
      reason: `${d.reason} — but the other vantage did not find it dead (checked ${theirs.checkedAt}); two networks disagree, so this is not knowledge`,
      disagreement: {
        oursSaid: d.reason ?? null,
        theirsSaid: theirSeen.has(d.url)
          ? 'reached it, or could not attribute a failure to it'
          : (theirCoverageKnown ? 'not in their report' : 'unknown — their report does not record which URLs answered'),
      },
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
    unprobed: (ours.unprobed || []).length,
    theirCoverageKnown,
    ourAgeHours: Number(ourAgeHours.toFixed(2)),
    gapHours: Number(gapHours.toFixed(2)),
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
  // `unprobed` also fails the run, and printing nothing for it produced a log that read ✓ on a
  // run exiting 1 — a false green in the surface a person actually reads, in a repo whose stated
  // rule is that a false green is far worse than a false red. Corroboration cannot speak to these
  // either way: a URL that was never probed has no second opinion to compare against.
  for (const u of ours.unprobed || []) {
    console.log(`  ✗ ${u.slug}: declared "${u.value}" — ${u.reason}, so it was never probed and cannot be corroborated`);
  }
  const unprobedCount = (ours.unprobed || []).length;
  if (!confirmed.length && !downgraded.length && !unprobedCount) {
    console.log('  ✓ neither vantage reported a dead dataset');
  } else if (!confirmed.length && !unprobedCount) {
    console.log(`  ✓ nothing survives corroboration — ${downgraded.length} downgraded to inconclusive`);
  } else if (!confirmed.length) {
    console.log(`  ✗ nothing survives corroboration, but ${unprobedCount} declared dataset(s) were never probed — that is its own failure`);
  }
}

process.exitCode = (confirmed.length || (out.unprobed || []).length) ? 1 : 0;
