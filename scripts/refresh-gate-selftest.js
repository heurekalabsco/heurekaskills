#!/usr/bin/env node
// Exercise the autonomous-merge gate against every diff that has ever beaten it, plus the one it
// must still accept.
//
// This decides whether content reaches a public registry with no human review, so "the suite is
// green" is not the bar. Three things earlier versions of this file got wrong, each of which let
// a green suite sit on top of a broken gate:
//
//   It asserted only a non-zero exit. When the gate was rebuilt, all eighteen cases still
//   reported ok — twelve because their hand-written hunk headers did not match their bodies, so
//   a header-integrity check fired before the rule under test ever ran.
//
//   It then asserted ONE reason substring. That let a case be refused for a bundled, unrelated
//   reason: `R1-real-combined` named two files that do not exist in the tree and carried a
//   SKILL.md hunk expecting a shell line at line 1, and passed because
//   `reasons.some(includes('refuses a file-mode change'))` matched a different file's header.
//   So every case now asserts its FULL reason set, in order.
//
//   And a gate that refuses everything satisfies every negative. PASS-frontmatter-refresh is the
//   case that fails when the gate stops being useful; it has already caught one over-correction.
//
// Usage:  node scripts/refresh-gate-selftest.js
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const FIX = '.github/fixtures/refresh-gate';
// The gate reads the base tree the fixtures were generated against, which is the frozen copy
// under tree/ rather than the live skills. A refresh of a source skill used to break this suite
// twice over — see the header of make-refresh-fixtures.js — and the rules under test here do not
// depend on which version a live skill currently carries.
const TREE = `${FIX}/tree`;
const manifest = JSON.parse(fs.readFileSync(`${FIX}/manifest.json`, 'utf8'));

function run(fixture) {
  try {
    const out = execFileSync('node', ['scripts/is-verification-refresh.js',
      '--diff', `${FIX}/${fixture}`, '--base-dir', TREE, '--json'], { encoding: 'utf8' });
    return { code: 0, verdict: JSON.parse(out) };
  } catch (e) {
    if (e.status === 1) return { code: 1, verdict: JSON.parse(e.stdout) };
    return { code: e.status ?? -1, error: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

let failed = 0;
const bad = (name, msg) => { console.log(`  FAIL ${name.padEnd(38)} ${msg}`); failed = 1; };

console.log('refresh-gate selftest');
for (const c of manifest.cases) {
  const r = run(c.fixture);
  if (r.code === -1 || r.error) { bad(c.fixture, `gate refused to decide (exit ${r.code}): ${(r.error || '').trim().slice(0, 90)}`); continue; }

  if (c.expect === 'accept') {
    if (r.verdict.refresh) console.log(`  ok   ${c.fixture.padEnd(38)} accepted`);
    else bad(c.fixture, `REJECTED — the gate can no longer fire at all:\n       · ${r.verdict.reasons.join('\n       · ')}`);
    continue;
  }

  if (r.verdict.refresh) { bad(c.fixture, `ACCEPTED — ${c.what}`); continue; }

  // The FULL reason set, in order. A case that also refuses for some unrelated reason is a case
  // whose own rule may no longer be firing, and that must be visible rather than absorbed.
  const got = r.verdict.reasons;
  const want = c.because;
  const ok = got.length === want.length && want.every((w, i) => got[i].includes(w));
  if (ok) console.log(`  ok   ${c.fixture.padEnd(38)} ${want.join(' + ').slice(0, 76)}`);
  else bad(c.fixture, `refused, but not with the expected reason set.\n`
    + `       wanted ${want.length}: ${want.map((w) => `\n         · ${w}`).join('')}\n`
    + `       got    ${got.length}: ${got.map((w) => `\n         · ${w}`).join('')}`);
}

// The fixtures must match what the generator produces from the FROZEN tree. A re-seed can make a
// case vacuous — the line its exploit targets no longer exists in the re-copied file — and a stale
// fixture would keep passing while testing nothing. A refresh of a live skill cannot do that any
// more, which is the point of the freeze; a re-seed still can, which is why this check stays.
try {
  execFileSync('node', ['scripts/make-refresh-fixtures.js', '--check'], { encoding: 'utf8', stdio: 'pipe' });
  console.log(`  ok   ${'fixtures match the generator'.padEnd(38)} regenerating changes nothing`);
} catch (e) {
  // Both streams, joined. `stdout || stderr` short-circuits on the generator's own summary line
  // ("checked N cases — WITH FAILURES"), which swallowed the part that names the case and its
  // zero-match anchor. That diagnostic is now the sole vacuity tripwire, so it has to survive.
  bad('fixtures-are-current', `stale — run: node scripts/make-refresh-fixtures.js\n`
    + [e.stdout, e.stderr].filter(Boolean).join('\n').trim());
}

// Drift between the frozen tree and the live skills is REPORTED, never failed on. The coupling
// this suite used to have made drift loud by breaking CI, and the cure for too-loud is not
// silence: without this line the only prompt to re-seed is somebody remembering. A drifted copy
// is not a defect — it is a frozen fixture doing its job — but an unreported one eventually means
// the suite is testing shapes the registry no longer has.
// Walk what the frozen tree ACTUALLY holds rather than the filenames it is expected to hold. A
// reporter that looks for names it assumes exist goes quiet exactly when its assumption breaks:
// the first version of this check skipped any file whose live counterpart was missing, so a
// DELETED or retired skill read as "no drift" — the one case where the frozen copy is testing a
// shape the registry no longer has at all, and so the one a reader most needs told. It also
// compared a hardcoded pair of filenames, which silently ignored any other file a later re-seed
// might pull in.
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);

const missing = [];
const differs = [];
for (const frozen of walk(`${TREE}/skills`)) {
  const rel = frozen.slice(`${TREE}/`.length);
  if (!fs.existsSync(rel)) { missing.push(rel); continue; }
  if (fs.readFileSync(frozen, 'utf8') !== fs.readFileSync(rel, 'utf8')) differs.push(rel);
}
if (missing.length) {
  console.log(`  note ${'frozen file missing from live'.padEnd(38)} ${missing.length}: ${missing.join(', ')}`);
}
if (differs.length) {
  console.log(`  note ${'frozen tree differs from live'.padEnd(38)} ${differs.length} file(s): ${differs.join(', ')}`);
}
if (!missing.length && !differs.length) {
  console.log(`  ok   ${'frozen tree matches live skills'.padEnd(38)} no drift`);
}

console.log(failed ? '  SELFTEST FAILED' : `  all ${manifest.cases.length} cases pass`);
process.exit(failed);
