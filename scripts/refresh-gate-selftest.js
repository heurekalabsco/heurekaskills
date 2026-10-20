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
const manifest = JSON.parse(fs.readFileSync(`${FIX}/manifest.json`, 'utf8'));

function run(fixture) {
  try {
    const out = execFileSync('node', ['scripts/is-verification-refresh.js',
      '--diff', `${FIX}/${fixture}`, '--base-dir', '.', '--json'], { encoding: 'utf8' });
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

// The fixtures must match what the generator produces from the skills as they are NOW. A skill
// edited later can quietly make a case vacuous — the line its exploit targets no longer exists —
// and a stale fixture would keep passing while testing nothing.
try {
  execFileSync('node', ['scripts/make-refresh-fixtures.js', '--check'], { encoding: 'utf8', stdio: 'pipe' });
  console.log(`  ok   ${'fixtures match the generator'.padEnd(38)} regenerating changes nothing`);
} catch (e) {
  bad('fixtures-are-current', `stale — run: node scripts/make-refresh-fixtures.js\n${(e.stdout || e.stderr || '').trim()}`);
}

console.log(failed ? '  SELFTEST FAILED' : `  all ${manifest.cases.length} cases pass`);
process.exit(failed);
