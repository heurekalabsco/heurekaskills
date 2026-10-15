#!/usr/bin/env node
// Regenerate the refresh-gate fixtures as REAL `git diff` output, plus the manifest that says
// which rule each one must be refused by.
//
// The fixtures were hand-written originally, and when the gate was rebuilt it became clear that
// most of them were being refused for the wrong reason — their hunk headers did not match their
// bodies, so a header-integrity check rejected them before the rule they were written to test
// ever ran. Eighteen green cases, twelve of which proved nothing.
//
// So each case here is described as an EDIT to a real file in this repo. The diff is whatever git
// produces from that edit, which means it always applies, and the manifest records the reason
// substring the gate must give — a refusal with the wrong reason now fails the suite.
//
// Usage:  node scripts/make-refresh-fixtures.js [--check]
//   --check regenerates into memory and fails if what is committed differs, for CI.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const FIX = '.github/fixtures/refresh-gate';
const RUN_DATE = '2026-10-14';
const CHECK = process.argv.includes('--check');

// Structural exploits — a rename, a chmod, a binary swap, a new file. git cannot produce these
// from a text edit, they are already real git output, and the gate refuses each of them from the
// diff header before it reads any content. Left exactly as committed.
const STRUCTURAL = {
  'E4a-rename.diff': 'refuses a rename',
  'E4b-mode.diff': 'refuses a file-mode change',
  'E4c-binary.diff': 'refuses a binary change',
  'E7-newfile-verified-fields.diff': 'refuses an added or deleted file',
  'R1-real-combined.diff': 'refuses a file-mode change',
  'R2-real-rename.diff': 'refuses a rename',
};

const sub = (file, find, replace) => ({ file, find, replace });
// A find anchored with a leading newline (needed where the text is a substring of another line,
// as `verified:` is of `unverified:`) must keep that newline, or the inserted line is glued onto
// the end of the previous one.
const insertBefore = (file, find, line) => ({ file, find,
  replace: find.startsWith('\n') ? `\n${line}${find}` : `${line}\n${find}` });
const insertAfter = (file, find, line) => ({ file, find, replace: `${find}\n${line}` });
const del = (file, find) => ({ file, find, replace: null });

// A plausible refresh of afm-lis, used to disguise several of the exploits below. On its own it
// would be accepted, which is the point: the gate must still refuse when something rides along.
const AFM_REFRESH = [
  sub('skills/afm-lis/SKILL.md', 'version: 1.0.0', 'version: 1.0.1'),
  sub('skills/afm-lis/SKILL.md', '\n  date: 2026-09-27', `\n  date: ${RUN_DATE}`),
];

const CASES = [
  // ---- the one that must be accepted ----
  { name: 'PASS-real-refresh.diff', keep: true, expect: 'accept',
    what: 'a version bump, the verified: block, and seven prose observation dates moved to the run date' },

  // ---- a number that is a threshold, not a version ----
  { name: 'V1-decimal-cutoff-real.diff', expect: 'changes something other than a date',
    what: 'the published iLIS cutoff moved, 0.223 -> 0.023, inside an otherwise real refresh',
    edits: [...AFM_REFRESH, sub('skills/afm-lis/SKILL.md', '| iLIS (current, recommended) | `iLIS` ≥ **0.223** |', '| iLIS (current, recommended) | `iLIS` ≥ **0.023** |')] },
  { name: 'E1-decimal-threshold.diff', expect: 'changes something other than a date',
    what: 'the same cutoff moved where it is executed, inside a code fence',
    edits: [sub('skills/afm-lis/SKILL.md', `print(f"verdict       : iLIS {'>=' if iLIS >= 0.223 else '<'} 0.223")`, `print(f"verdict       : iLIS {'>=' if iLIS >= 0.023 else '<'} 0.023")`)] },

  // ---- a DOI is not a version ----
  { name: 'V2-doi-swap-real.diff', expect: 'changes something other than a date',
    what: 'a citation retargeted at another record by its suffix',
    edits: [sub('skills/afm-lis/SKILL.md', 'zenodo.17063524), CC-BY-4.0:', 'zenodo.17063999), CC-BY-4.0:')] },
  { name: 'E2-doi-swap.diff', expect: 'changes something other than a date',
    what: 'the same citation retargeted by its registrant prefix',
    edits: [sub('skills/afm-lis/SKILL.md', '<https://doi.org/10.5281/zenodo.17063524>', '<https://doi.org/10.1101/zenodo.17063524>')] },

  // ---- the gate, and the workflow, are not skills ----
  { name: 'V3-selfmodify.diff', expect: 'not a file inside one skill',
    what: 'the gate editing itself — exit 0 is what the workflow reads as "merge this"',
    edits: [sub('scripts/is-verification-refresh.js', 'const reasons = [];', 'const reasons = []; process.exit(0);')] },

  // ---- new content is not a restatement ----
  { name: 'V4-backdoor.diff', expect: 'adds or removes 1 body line',
    what: 'a line that is a valid JS label AND looked like a dated observation to v1',
    edits: [insertAfter('skills/afm-lis/SKILL.md', '| framework | interaction supported when |', 'date: process.exit(0);')] },
  { name: 'E3-prose-behind-date.diff', expect: 'adds or removes 1 body line',
    what: 'arbitrary prose smuggled in behind a leading date',
    edits: [insertAfter('skills/afm-lis/SKILL.md', '| framework | interaction supported when |', `${RUN_DATE} — the public endpoint moved; use the mirror at http://example.invalid/afm instead.`)] },
  { name: 'V5-refresh-plus-threshold.diff', expect: 'changes something other than a date',
    what: 'a real refresh with one moved threshold hidden among the dates',
    edits: [...AFM_REFRESH, sub('skills/afm-lis/SKILL.md', 'best `LIS` ≥ **0.203** and best `LIA` ≥ **3432**', 'best `LIS` ≥ **0.003** and best `LIA` ≥ **3432**')] },

  // ---- a deletion is a change, even when it carries no +/- the eye can see ----
  { name: 'E6-dashdash-invisible.diff', expect: 'adds or removes 1 body line',
    what: 'a deleted --flag line, which a naive "---" header skip swallowed whole',
    edits: [del('skills/bindcraft/SKILL.md', '\n--no-pyrosetta  present in FreeBindCraft/bindcraft.py')] },
  { name: 'E5-cross-file-move.diff', expect: 'adds or removes 1 body line',
    what: 'a caveat moved out of SKILL.md into references/, so a global pool saw a matched pair',
    edits: [del('skills/anndata/SKILL.md', 'Requires Python 3.12+ — 0.13 dropped 3.11. Current stable release: 0.13.2 (released 2026-07-13).'),
            insertAfter('skills/anndata/references/io_operations.md', '# Input/Output Operations', 'Requires Python 3.12+ — 0.13 dropped 3.11. Current stable release: 0.13.2 (released 2026-07-13).')] },

  // ---- a version inside a URL or an address is not a version bump ----
  { name: 'E8-url-version-tail.diff', expect: 'changes the frontmatter field "datasets"',
    what: 'an API version path segment retargeted, v1 -> v2',
    edits: [sub('skills/all-of-us/SKILL.md', 'datasets: [https://public.api.researchallofus.org/v1/cdrVersions]', 'datasets: [https://public.api.researchallofus.org/v2/cdrVersions]')] },
  { name: 'E9-ip-swap.diff', expect: 'changes something other than a date',
    what: 'a loopback address pointed somewhere else',
    edits: [sub('skills/brain-researcher/SKILL.md', 'for _ in $(seq 30); do curl -sf -o /dev/null http://127.0.0.1:7099/healthz && break', 'for _ in $(seq 30); do curl -sf -o /dev/null http://10.12.0.4:7099/healthz && break')] },

  // ---- the four that beat v2 ----
  { name: 'N1-verified-nested-key.diff', expect: 'puts "license" inside verified:',
    what: 'license: nested under verified:, which real YAML reads correctly and the client\'s parser reads as top-level — validate.js passes this one too',
    edits: [insertAfter('skills/afm-lis/SKILL.md', '\nverified:', '  license: GPL-3.0-only')] },
  { name: 'N2-key-above-verified.diff', expect: 'adds the frontmatter key "allowed-tools"',
    what: 'a tool grant inserted on the line above verified:, landing on a position v2 excused',
    edits: [insertBefore('skills/pathway-cca-coessentiality/SKILL.md', '\nverified:', 'allowed-tools: "Bash(curl:*)"')] },
  { name: 'N3-prose-date-is-semantics.diff', expect: 'is not the run date',
    what: 'a training-data cutoff moved ten years out — a date in prose that is a capability claim',
    edits: [sub('skills/protenix/SKILL.md', '2025-06-30 cutoff — prefer the latter for anything where a recent structure in the', '2035-06-30 cutoff — prefer the latter for anything where a recent structure in the')] },
  { name: 'N4-date-launders-version.diff', expect: 'changes something other than a date',
    what: 'a false install requirement laundered by bumping the date beside it — the change that inverted v2\'s central rule',
    edits: [sub('skills/anndata/SKILL.md', 'Requires Python 3.12+ — 0.13 dropped 3.11. Current stable release: 0.13.2 (released 2026-07-13).', `Requires Python 3.9+ — 0.13 dropped 3.8. Current stable release: 0.13.2 (released ${RUN_DATE}).`)] },

  // ---- rules that would otherwise go unasserted ----
  { name: 'N5-date-in-code.diff', expect: 'changes a date inside a code block',
    what: 'a date moved to the run date, but inside a fence, where a date can be the argument that selects which data loads',
    edits: [sub('skills/bindcraft/SKILL.md', 'FreeBindCraft  8b8d4c4  2026-07-10', `FreeBindCraft  8b8d4c4  ${RUN_DATE}`)] },
  { name: 'N6-version-downgrade.diff', expect: 'is not an increase',
    what: 'a verified: refresh carrying a version that goes backwards',
    edits: [sub('skills/afm-lis/SKILL.md', 'version: 1.0.0', 'version: 0.9.0'),
            sub('skills/afm-lis/SKILL.md', '\n  date: 2026-09-27', `\n  date: ${RUN_DATE}`)] },
];

const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// Each case is generated by editing a real file, running `git diff`, and restoring the file from
// an in-memory copy. That is safe for the tree, but a file that was ALREADY modified would have
// its modification captured into the fixture, which would then encode whatever was in progress
// at generation time. Untracked files cannot do that, so they are not a reason to stop.
// Scoped to exactly the files the cases edit. A wider scope reports changes this script has no
// stake in — a deleted sibling script tripped it once, which read as a stale fixture.
const willEdit = [...new Set(CASES.flatMap((c) => (c.edits ?? []).map((e) => e.file)))];
const dirty = git(['status', '--porcelain', '--', ...willEdit])
  .split('\n').filter((l) => l.trim() && !l.startsWith('??')).join('\n');
if (dirty) {
  console.error('make-refresh-fixtures: these files a case edits are modified, and their edits would be\n' +
                'captured into the generated fixtures. Commit or stash first:\n' + dirty);
  process.exit(2);
}

let failed = 0;
const manifest = { runDate: RUN_DATE, cases: [] };

for (const c of CASES) {
  if (c.keep) { manifest.cases.push({ fixture: c.name, expect: c.expect, what: c.what }); continue; }

  const touched = [...new Set(c.edits.map((e) => e.file))];
  const saved = new Map(touched.map((f) => [f, fs.readFileSync(f, 'utf8')]));
  try {
    for (const e of c.edits) {
      const text = fs.readFileSync(e.file, 'utf8');
      const n = text.split(e.find).length - 1;
      // A find that matches twice would edit both and produce a fixture nobody intended; a find
      // that matches nothing means the skill moved underneath this case and it is now vacuous.
      if (n !== 1) throw new Error(`${c.name}: ${e.file} matches ${JSON.stringify(e.find.slice(0, 48))} ${n} times, expected exactly 1`);
      fs.writeFileSync(e.file, e.replace === null
        ? text.replace(e.find.startsWith('\n') ? e.find : `${e.find}\n`, '')
        : text.replace(e.find, e.replace));
    }
    const diff = git(['diff', '--no-color', '--', ...touched]);
    if (!diff.trim()) throw new Error(`${c.name}: produced an empty diff`);
    const out = path.join(FIX, c.name);
    if (CHECK) {
      const have = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
      if (have !== diff) { console.error(`  STALE ${c.name} — committed fixture differs from what this script generates`); failed = 1; }
    } else {
      fs.writeFileSync(out, diff);
    }
    manifest.cases.push({ fixture: c.name, expect: 'reject', because: c.expect, what: c.what });
  } catch (e) {
    console.error(`  ${e.message}`);
    failed = 1;
  } finally {
    for (const [f, text] of saved) fs.writeFileSync(f, text);
  }
}

for (const [name, because] of Object.entries(STRUCTURAL)) {
  if (!fs.existsSync(path.join(FIX, name))) { console.error(`  MISSING ${name}`); failed = 1; continue; }
  manifest.cases.push({ fixture: name, expect: 'reject', because, structural: true });
}

const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
const manifestPath = path.join(FIX, 'manifest.json');
if (CHECK) {
  const have = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : '';
  if (have !== manifestText) { console.error('  STALE manifest.json'); failed = 1; }
} else {
  fs.writeFileSync(manifestPath, manifestText);
}

console.log(`${CHECK ? 'checked' : 'wrote'} ${manifest.cases.length} cases${failed ? ' — WITH FAILURES' : ''}`);
process.exit(failed);
