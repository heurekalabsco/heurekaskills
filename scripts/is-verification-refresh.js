#!/usr/bin/env node
// Decide whether a diff is a VERIFICATION REFRESH: a re-run of a skill that still works,
// which changes only when it was checked and what it was checked against.
//
// This is the gate for autonomous merge. It answers one question — "could a reader's
// behaviour change because of this diff?" — and it answers NO only when every changed line
// is a date or a version number. Anything that alters an instruction, a threshold, a URL, a
// claim or a licence is not a refresh, whatever the PR title says.
//
// The shape was derived from the real ones rather than assumed. The first version of this
// gate required the diff to touch only the frontmatter `verified:` block; measured against
// seven consecutive `change:update` PRs it would have fired ZERO times, because the dated
// observed values deliberately live in the body — `Last confirmed reachable 2026-08-14`,
// `Observed 2026-08-14 with scikit-image 0.26.0`. A gate that never fires is not a safe
// gate, it is a dead one.
//
// Usage:  node scripts/is-verification-refresh.js --diff <unified.diff> [--json]
// Exit 0 it is a refresh · 1 it is not (with reasons) · 2 refused to decide.
import fs from 'node:fs';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const JSON_OUT = process.argv.includes('--json');

const die = (m) => { console.error(`is-verification-refresh: ${m}`); process.exit(2); };

const path = arg('--diff');
if (!path) die('--diff <file> is required. Refusing: a gate that cannot read the diff must not say "yes".');
let raw;
try { raw = path === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path, 'utf8'); }
catch (e) { die(`cannot read ${path}: ${e.message}`); }

// A date in any form the registry uses, and a version-ish token. Both are deliberately
// narrow: `2026-08-14`, `0.26.0`, `v1.2.0`, `2026.7.31`. A bare integer is NOT a version —
// treating it as one would let `executed: 7` -> `executed: 70`, or a threshold, through.
const DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const VERSION = /\bv?\d+\.\d+(?:\.\d+)*(?:[-.][A-Za-z0-9]+)*\b/g;

// Replace every date and version with a placeholder. If two lines are identical afterwards,
// they differ ONLY in dates and versions.
const skeleton = (s) => s.replace(DATE, '\u0000D').replace(VERSION, '\u0000V');

const reasons = [];
const files = new Set();
let currentFile = null;
let inFrontmatter = false;     // inside the leading --- ... --- of a SKILL.md
let frontmatterFence = 0;
const added = [];
const removed = [];

for (const line of raw.split('\n')) {
  if (line.startsWith('diff --git ')) {
    const m = line.match(/ b\/(.+)$/);
    currentFile = m ? m[1] : null;
    if (currentFile) files.add(currentFile);
    inFrontmatter = false; frontmatterFence = 0;
    // flush: pairing is per-file
    continue;
  }
  if (line.startsWith('@@')) { inFrontmatter = false; frontmatterFence = 0; continue; }
  if (line.startsWith('+++') || line.startsWith('---')) continue;
  if (line.startsWith('+')) added.push({ file: currentFile, text: line.slice(1) });
  else if (line.startsWith('-')) removed.push({ file: currentFile, text: line.slice(1) });
}

// 1. One skill, and nothing outside it.
const offenders = [...files].filter((f) => !/^skills\/[^/]+\/.+$/.test(f));
if (offenders.length) reasons.push(`touches files outside a skill: ${offenders.join(', ')}`);
const slugs = new Set([...files].map((f) => (f.match(/^skills\/([^/]+)\//) || [])[1]).filter(Boolean));
if (slugs.size > 1) reasons.push(`touches ${slugs.size} skills (${[...slugs].join(', ')}) — a refresh is one skill`);
if (slugs.size === 0) reasons.push('touches no skill at all');

// 2. Every removed line must be matched by an added line that differs only in dates/versions.
//    Unmatched ADDITIONS are allowed only inside a `verified:` block, because a skill moving
//    off `verified: pending` genuinely gains lines there and nowhere else.
const pool = new Map();
for (const a of added) {
  const k = skeleton(a.text);
  pool.set(k, (pool.get(k) || 0) + 1);
}
const unmatchedRemovals = [];
for (const r of removed) {
  const k = skeleton(r.text);
  const n = pool.get(k) || 0;
  if (n > 0) pool.set(k, n - 1);
  else unmatchedRemovals.push(r.text);
}
const leftoverAdditions = [];
for (const [k, n] of pool) for (let i = 0; i < n; i++) leftoverAdditions.push(k);

// An addition is excusable only if it looks like part of a verified: block.
const VERIFIED_FIELD = /^\s{0,4}(verified:|date:|against:|executed:|unverified:|unverified_reason:|[>|]-?\s*$)/;
const inexcusable = leftoverAdditions.filter((l) => !VERIFIED_FIELD.test(l.replace(/\u0000[DV]/g, '0')) && l.trim() !== '');

if (unmatchedRemovals.length) {
  reasons.push(`${unmatchedRemovals.length} removed line(s) have no date/version-only counterpart — content changed, e.g. ${JSON.stringify(unmatchedRemovals[0].trim().slice(0, 70))}`);
}
if (inexcusable.length) {
  reasons.push(`${inexcusable.length} added line(s) are not dates, versions, or verified: fields — e.g. ${JSON.stringify(inexcusable[0].replace(/\u0000D/g, '<date>').replace(/\u0000V/g, '<version>').trim().slice(0, 70))}`);
}

const verdict = { refresh: reasons.length === 0, skill: [...slugs][0] ?? null, files: [...files], added: added.length, removed: removed.length, reasons };
if (JSON_OUT) console.log(JSON.stringify(verdict, null, 2));
else {
  console.log(verdict.refresh
    ? `✓ verification refresh — ${verdict.skill}: every changed line is a date, a version, or a verified: field`
    : `✗ not a verification refresh${verdict.skill ? ` (${verdict.skill})` : ''}`);
  for (const r of reasons) console.log(`  · ${r}`);
}
process.exitCode = verdict.refresh ? 0 : 1;
