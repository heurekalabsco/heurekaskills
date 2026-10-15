#!/usr/bin/env node
// Decide whether a diff is a VERIFICATION REFRESH: a re-run of a skill that still works, which
// records when it was checked and what against, and changes nothing a reader acts on.
//
// This is the gate for autonomous merge on a public registry, so it is written to be defeated
// rather than to be right. Two earlier versions were, fifteen times between them, and every one
// of those diffs is committed under .github/fixtures/refresh-gate/.
//
// WHY THIS IS THE THIRD VERSION, AND WHAT IS DIFFERENT IN KIND
//
// v1 asked "does this line differ only in a date or a version?". v2 asked the same question but
// first resolved where the line sat. Both are the same question, and it is not answerable:
//
//   `Accept hits with FDR < 0.05`      — 0.05 is a version to a regex, a threshold to a reader
//   `training data cutoff 2025-06-30`  — a date to a regex, a capability claim to a reader
//   `Requires Python 3.12+`            — a version to a regex, an install requirement to a reader
//
// v2's central rule was "a version may change only on a line whose date also changed", on the
// reasoning that observations carry dates and thresholds do not. Seventy-seven prose lines in
// this registry carry both, so the rule inverted into a recipe: bump the date beside the
// threshold and it passed. Four bypasses were confirmed against v2 on real skills, one of which
// `validate.js` also passed — a nested `license:` under `verified:`, which the real YAML parser
// reads correctly and `parseFrontmatterNaive`, which is what the client reads, does not.
//
// So v3 does not classify tokens at all. It reconstructs the proposed file from the base file
// and the diff, refusing unless every context and removed line matches the base exactly, and
// then compares two whole documents:
//
//   FRONTMATTER is parsed as YAML, by the same parser the registry build uses. The top-level key
//   set must be identical; every key must be deep-equal except `verified` and `version`;
//   `version` may only increase; `verified`'s keys must come from a closed allowlist and none of
//   its values may be a map or a list.
//
//   BODY must be byte-identical except for ISO dates, and every date that changed must move
//   forward, must land on the run date, and must not sit in a code block.
//
// There is no pairing pool, no token classifier and no regex deciding what a number means. Every
// rule is a comparison with a provable answer, and anything unparseable, unreadable or unmatched
// refuses. Consent is positive: silence, novelty and confusion all mean no.
//
// Usage:
//   node scripts/is-verification-refresh.js --diff <unified.diff> --base-dir <repo>
//                                           --run-date <YYYY-MM-DD> [--json]
// Exit 0 it is a refresh · 1 it is not (with reasons) · 2 refused to decide.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? null : process.argv[i + 1] ?? null; };
const JSON_OUT = process.argv.includes('--json');
const die = (m) => { console.error(`is-verification-refresh: ${m}`); process.exit(2); };

const diffPath = arg('--diff');
if (!diffPath) die('--diff <file> is required. A gate that cannot read the diff must not say yes.');
// The base tree the diff applies to. Required, because the proposed file is reconstructed FROM it
// and every removed line is checked against it. The workflow passes a checkout of the base ref,
// never the pull request's own — v1 ran the gate from the PR's checkout and a one-line
// `date: process.exit(0);` label made it exit 0 unconditionally.
const baseDir = arg('--base-dir');
if (!baseDir) die('--base-dir <repo> is required: the proposed file is rebuilt from it and checked against it.');
// The date the run that wrote this diff believes it is. A refreshed observation is dated the day
// it was observed, so this is what every changed date must equal — the rule that stops a
// training-data cutoff being moved ten years into the future and called a refresh.
const runDate = arg('--run-date');
if (!runDate) die('--run-date <YYYY-MM-DD> is required: a date change is only a refresh if it lands on the day of the run.');
if (!/^\d{4}-\d{2}-\d{2}$/.test(runDate)) die(`--run-date must be YYYY-MM-DD, got ${JSON.stringify(runDate)}`);

// A run can start before midnight UTC and commit after it, so the day before the run date is
// accepted too. Two values, not a window that widens with argument.
const prev = new Date(`${runDate}T00:00:00Z`);
prev.setUTCDate(prev.getUTCDate() - 1);
const ACCEPTABLE_DATES = new Set([runDate, prev.toISOString().slice(0, 10)]);

// Closed allowlist for the one mapping a refresh may rewrite. Taken from what the registry
// actually uses; a new field here is a schema change and belongs in a reviewed pull request.
const VERIFIED_KEYS = new Set(['date', 'against', 'executed', 'unverified', 'unverified_reason', 'records']);

let raw;
try { raw = diffPath === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(diffPath, 'utf8'); }
catch (e) { die(`cannot read ${diffPath}: ${e.message}`); }

const reasons = [];
const refuse = (r) => { if (!reasons.includes(r)) reasons.push(r); };

// ---- parse the diff -------------------------------------------------------
// Only two things are taken from the diff: the structural changes it announces in its headers,
// and the hunks needed to rebuild each file. Nothing is inferred from the shape of a +/- line.
const files = new Map();   // path -> { hunks: [{ oldStart, ops: [[kind, text]] }] }
let cur = null;
let hunk = null;

for (const line of raw.split('\n')) {
  if (line.startsWith('diff --git ')) {
    const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    // An unparseable header is the one case where dropping a file silently would be worst: the
    // gate would judge the files it understood and consent to the one it did not.
    if (!m) { refuse(`cannot parse a diff header, so cannot know which file it changes — ${JSON.stringify(line.slice(0, 72))}`); cur = null; hunk = null; continue; }
    cur = m[2];
    if (!files.has(cur)) files.set(cur, { hunks: [] });
    hunk = null;
    continue;
  }
  const h = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
  if (h) {
    if (!cur) { refuse('a hunk appeared before any file header — refusing to guess which file it belongs to'); continue; }
    hunk = {
      oldStart: Number(h[1]),
      oldCount: h[2] === undefined ? 1 : Number(h[2]),
      newCount: h[4] === undefined ? 1 : Number(h[4]),
      oldSeen: 0, newSeen: 0, ops: [],
    };
    files.get(cur).hunks.push(hunk);
    continue;
  }
  if (!hunk) {
    // Header territory. Each of these announces a change that carries no +/- content at all, so
    // a gate that reads only +/- lines sees an empty diff and calls it harmless.
    if (/^(rename from|rename to) /.test(line)) refuse(`refuses a rename (${cur ?? 'unknown file'}) — a moved file changes what the site serves and shows no content diff`);
    else if (/^(old mode|new mode) /.test(line)) refuse(`refuses a file-mode change (${cur ?? 'unknown file'})`);
    else if (/^(new file mode|deleted file mode) /.test(line)) refuse(`refuses an added or deleted file (${cur ?? 'unknown file'})`);
    else if (/^Binary files .* differ$/.test(line)) refuse(`refuses a binary change (${cur ?? 'unknown file'})`);
    else if (/^GIT binary patch/.test(line)) refuse(`refuses a binary patch (${cur ?? 'unknown file'})`);
    continue;
  }
  if (line.startsWith('\\')) continue;                       // "\ No newline at end of file"
  // A hunk is exactly as long as its header says. Reading past that is how the trailing newline
  // of a diff file became a ninth context line in an eight-line hunk, and it is also how a
  // forged header could hide ops behind a short count.
  if (hunk.oldSeen >= hunk.oldCount && hunk.newSeen >= hunk.newCount) { hunk = null; continue; }
  const kind = line.startsWith('-') ? 'del'
             : line.startsWith('+') ? 'add'
             : line.startsWith(' ') || line === '' ? 'ctx'    // git writes an empty context as " "
             : null;
  if (kind === null) { hunk = null; continue; }               // anything else ends the hunk
  hunk.ops.push([kind, line === '' ? '' : line.slice(1)]);
  if (kind !== 'add') hunk.oldSeen++;
  if (kind !== 'del') hunk.newSeen++;
}

// A header that does not describe its own body means the diff was mis-parsed, and a mis-parsed
// diff must refuse rather than be judged on the part that happened to make sense.
for (const [f, { hunks }] of files) {
  for (const k of hunks) {
    if (k.oldSeen !== k.oldCount || k.newSeen !== k.newCount) {
      refuse(`${f}: the hunk at line ${k.oldStart} declares ${k.oldCount} old and ${k.newCount} new lines but carries ${k.oldSeen} and ${k.newSeen}`);
    }
  }
}

// ---- scope ----------------------------------------------------------------
const paths = [...files.keys()];
for (const f of paths) {
  const segs = f.split('/');
  if (segs.length < 3 || segs[0] !== 'skills' || segs.some((s) => s === '' || s === '.' || s === '..')) {
    refuse(`touches a path that is not a file inside one skill: ${JSON.stringify(f)}`);
  }
}
const slugs = new Set(paths.map((f) => (f.match(/^skills\/([^/]+)\//) || [])[1]).filter(Boolean));
if (slugs.size > 1) refuse(`touches ${slugs.size} skills (${[...slugs].join(', ')}) — a refresh is one skill`);
if (paths.length === 0) refuse('contains no file changes at all');

// ---- rebuild each proposed file from the base ------------------------------
// The diff is only believed if it applies: every context and removed line must match the base
// tree exactly. That single check retires a whole class of bypass in which a malformed diff
// walks the line counter off by one and lands a changed line on a position that excuses it.
function rebuild(baseLines, hunks, file) {
  const out = [];
  let cursor = 0;
  for (const h of hunks) {
    const start = h.oldStart - 1 + (h.oldCount === 0 ? 1 : 0);   // -N,0 inserts AFTER line N
    if (start < cursor) return `${file}: hunks overlap or run backwards at line ${h.oldStart}`;
    if (start > baseLines.length) return `${file}: hunk at line ${h.oldStart} starts past the end of the base file`;
    out.push(...baseLines.slice(cursor, start));
    cursor = start;
    for (const [kind, text] of h.ops) {
      if (kind === 'add') { out.push(text); continue; }
      if (baseLines[cursor] !== text) {
        return `${file}: the diff does not apply to the base tree — line ${cursor + 1} is ${JSON.stringify((baseLines[cursor] ?? '<past end of file>').slice(0, 48))}, the diff expects ${JSON.stringify(text.slice(0, 48))}`;
      }
      if (kind === 'ctx') out.push(text);
      cursor++;
    }
  }
  out.push(...baseLines.slice(cursor));
  return out;
}

// ---- compare two documents ------------------------------------------------
const FRONTMATTER = /^---\s*$/;
function split(text) {
  const lines = text.split('\n');
  if (!FRONTMATTER.test(lines[0] ?? '')) return { fm: null, body: lines, bodyFrom: 1 };
  for (let i = 1; i < lines.length; i++) {
    if (FRONTMATTER.test(lines[i])) {
      return { fm: lines.slice(1, i).join('\n'), body: lines.slice(i + 1), bodyFrom: i + 2 };
    }
  }
  return null;                              // opened frontmatter and never closed it
}

function eq(a, b) {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && eq(a[k], b[k]));
}

// A bare increase, digit group by digit group. Anything that does not clearly increase refuses,
// which is the safe direction: check-versions.js requires a bump, so no bump means no merge.
function versionIncreased(from, to) {
  const parts = (v) => String(v).split('.').map((x) => { const n = /^\d+/.exec(x); return n ? Number(n[0]) : 0; });
  const a = parts(from), b = parts(to);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (y !== x) return y > x;
  }
  return false;
}

// Conservative on purpose: a fenced block, and any line indented like a code block, counts as
// code. A date in prose is an observation; the same date in code can be an argument that selects
// which data loads — `open_soma(census_version="2026-08-01")` is real, and in this registry.
// Over-counting refuses a legitimate refresh, which a human then reviews. Under-counting ships.
function codeLines(lines) {
  const isCode = new Array(lines.length).fill(false);
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = l.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      if (fence && l.trim().startsWith(fence)) { isCode[i] = true; fence = null; continue; }
      if (!fence) { fence = m[1]; isCode[i] = true; continue; }
    }
    isCode[i] = fence !== null || /^(\t| {4,})\S/.test(l);
  }
  return isCode;
}

const DATE_G = /\b\d{4}-\d{2}-\d{2}\b/g;
const MASK = '\u0000D';

let changedFiles = 0;
for (const [file, { hunks }] of files) {
  if (!hunks.length) continue;

  const abs = path.join(baseDir, file);
  let baseText;
  try { baseText = fs.readFileSync(abs, 'utf8'); }
  catch { refuse(`cannot read ${file} in the base tree — refusing rather than judging a file it cannot see`); continue; }

  const baseLines = baseText.split('\n');
  const built = rebuild(baseLines, hunks, file);
  if (typeof built === 'string') { refuse(built); continue; }
  const headText = built.join('\n');
  if (headText === baseText) continue;      // this file is unchanged after all
  changedFiles++;

  const b = split(baseText), h = split(headText);
  if (!b || !h) { refuse(`${file} has frontmatter that opens and never closes — refusing to parse it`); continue; }
  if ((b.fm === null) !== (h.fm === null)) { refuse(`${file} gains or loses its frontmatter block`); continue; }

  // ---- frontmatter: structure, by the parser the registry build uses ----
  if (b.fm !== null && b.fm !== h.fm) {
    let bf, hf;
    try { bf = yaml.load(b.fm); hf = yaml.load(h.fm); }
    catch (e) { refuse(`${file} frontmatter is not parseable YAML (${e.message.split('\n')[0].slice(0, 72)})`); continue; }
    if (bf === null || typeof bf !== 'object' || hf === null || typeof hf !== 'object') {
      refuse(`${file} frontmatter is not a mapping`); continue;
    }
    const bk = Object.keys(bf), hk = Object.keys(hf);
    // A refresh may introduce `verified` and nothing else. Any other new, removed or renamed
    // top-level key is a schema change: this is what stops `allowed-tools:` being inserted on
    // the line above `verified:`, which v2 read as inside the block and waved through.
    const added = hk.filter((k) => !bk.includes(k));
    const gone = bk.filter((k) => !hk.includes(k));
    if (gone.length) refuse(`${file} removes the frontmatter key(s) ${gone.join(', ')}`);
    for (const k of added) if (k !== 'verified') refuse(`${file} adds the frontmatter key ${JSON.stringify(k)} — only verified: may appear`);

    for (const k of hk) {
      if (k === 'verified' || k === 'version' || added.includes(k)) continue;
      if (!eq(bf[k], hf[k])) refuse(`${file} changes the frontmatter field ${JSON.stringify(k)} — a refresh records what it checked, it does not restate the skill`);
    }
    if (Object.hasOwn(hf, 'version') && !eq(bf.version, hf.version)
        && !versionIncreased(bf.version, hf.version)) {
      refuse(`${file} version ${JSON.stringify(bf.version)} -> ${JSON.stringify(hf.version)} is not an increase`);
    }

    // `verified:` is the payload, and the only mapping a refresh rewrites freely — but only its
    // own fields, and only as scalars. A nested key here is read as a TOP-LEVEL field by
    // parseFrontmatterNaive, which is what the client displays, so `license:` nested under
    // `verified:` changed the licence the registry served while real YAML and validate.js both
    // saw the correct one.
    const v = hf.verified;
    if (v !== undefined && v !== null && typeof v === 'object' && !(v instanceof Date)) {
      if (Array.isArray(v)) refuse(`${file} makes verified: a list`);
      else for (const [k, val] of Object.entries(v)) {
        if (!VERIFIED_KEYS.has(k)) refuse(`${file} puts ${JSON.stringify(k)} inside verified:, which is not one of its fields (${[...VERIFIED_KEYS].join(', ')})`);
        else if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
          refuse(`${file} nests a mapping or list under verified.${k} — a nested key is read as a top-level field by the client's parser`);
        }
      }
    }
  }

  // ---- body: byte-identical but for dates ----
  if (b.body.length !== h.body.length) {
    refuse(`${file} adds or removes ${Math.abs(h.body.length - b.body.length)} body line(s) — a refresh restates what it checked, it does not rewrite the skill`);
    continue;
  }
  const isCode = codeLines(b.body);
  for (let i = 0; i < b.body.length; i++) {
    if (b.body[i] === h.body[i]) continue;
    const ln = b.bodyFrom + i;
    if (b.body[i].replace(DATE_G, MASK) !== h.body[i].replace(DATE_G, MASK)) {
      refuse(`${file}:${ln} changes something other than a date — ${JSON.stringify(b.body[i].trim().slice(0, 56))}`);
      continue;
    }
    if (isCode[i]) {
      refuse(`${file}:${ln} changes a date inside a code block, where a date can be an argument that selects which data loads`);
      continue;
    }
    const was = b.body[i].match(DATE_G) ?? [];
    const now = h.body[i].match(DATE_G) ?? [];
    for (let j = 0; j < now.length; j++) {
      if (was[j] === now[j]) continue;
      if (!ACCEPTABLE_DATES.has(now[j])) {
        refuse(`${file}:${ln} sets a date to ${now[j]}, which is not the run date (${runDate}) — a refresh is dated the day it ran`);
      } else if (now[j] <= was[j]) {
        refuse(`${file}:${ln} moves a date backwards, ${was[j]} -> ${now[j]}`);
      }
    }
  }
}

// A diff that changed nothing is not a harmless diff, it is a diff this gate did not read.
if (changedFiles === 0) refuse('no file content actually changed — nothing here was inspected, so consent cannot be given');

const verdict = { refresh: reasons.length === 0, skill: [...slugs][0] ?? null, files: paths, changedFiles, runDate, reasons };
if (JSON_OUT) console.log(JSON.stringify(verdict, null, 2));
else {
  console.log(verdict.refresh
    ? `✓ verification refresh — ${verdict.skill}: only verified:, a version bump and dated prose changed`
    : `✗ not a verification refresh${verdict.skill ? ` (${verdict.skill})` : ''}`);
  for (const r of reasons) console.log(`  · ${r}`);
}
process.exitCode = verdict.refresh ? 0 : 1;
