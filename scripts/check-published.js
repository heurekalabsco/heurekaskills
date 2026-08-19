// Compare what the live registry serves against what this repo contains.
//
// Merging is not publishing. The content repo fires a repository_dispatch on merge, the site
// rebuilds, and the result is what clients install — but every link after the merge is
// invisible from here. On 17-19 Aug 2026 that chain broke for two days: ten consecutive site
// deploys were refused at startup, the dispatch job reported success because sending the
// dispatch IS its job and it did that correctly, and heurekaskills.com kept serving a
// nine-skill-old registry. Nothing surfaced it. A user reported it.
//
// This is the assertion that would have caught it on day one, and it is deliberately the
// dumbest possible one: does the published set equal the committed set.
//
//   node scripts/check-published.js            # human-readable
//   node scripts/check-published.js --json     # machine-readable, for the nightshift
//
// Exits non-zero when the two disagree. A stale registry is not a queue, it is a break: the
// skills exist, review passed, and readers still cannot install them.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSkillDirs } from './lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SKILLS_DIR = process.env.SKILLS_DIR ? path.resolve(process.env.SKILLS_DIR) : path.join(ROOT, 'skills');
const REGISTRY_URL = process.env.REGISTRY_URL || 'https://heurekaskills.com/registry.json';
const JSON_OUT = process.argv.includes('--json');
const TIMEOUT_MS = Number(process.env.PUBLISHED_CHECK_TIMEOUT_MS || 30000);

// A published registry that cannot be fetched is its own failure — that is the same outage
// from the client's side, so it must not pass quietly.
async function fetchRegistry() {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(REGISTRY_URL, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return { error: `HTTP ${res.status} fetching ${REGISTRY_URL}` };
    const body = await res.json();
    if (!Array.isArray(body?.skills)) return { error: 'registry.json has no skills array' };
    return { body };
  } catch (e) {
    return { error: e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const local = listSkillDirs(SKILLS_DIR);
const { body, error } = await fetchRegistry();

if (error) {
  const out = { ok: false, reason: 'unreachable', error, localCount: local.length };
  console.error(JSON_OUT ? JSON.stringify(out, null, 2)
    : `✗ could not read the published registry: ${error}\n  ${local.length} skill(s) committed here; publication state unknown.`);
  process.exit(1);
}

const published = body.skills.map((s) => s.slug).sort();
const missing = local.filter((s) => !published.includes(s));   // merged but not serving
const extra = published.filter((s) => !local.includes(s));     // serving but not in the repo

const result = {
  ok: missing.length === 0 && extra.length === 0,
  registryUrl: REGISTRY_URL,
  generatedAt: body.generatedAt ?? null,
  localCount: local.length,
  publishedCount: published.length,
  missing,
  extra,
};

if (JSON_OUT) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log(`✓ published registry matches this repo — ${published.length} skill(s), generated ${body.generatedAt ?? 'unknown'}`);
} else {
  console.error(`✗ the published registry does not match this repo`);
  console.error(`  committed: ${local.length}   published: ${published.length}   generated: ${body.generatedAt ?? 'unknown'}`);
  if (missing.length) console.error(`  merged but NOT published (readers cannot install these): ${missing.join(', ')}`);
  if (extra.length) console.error(`  published but not in this repo: ${extra.join(', ')}`);
  console.error(`  the site rebuild is the usual cause — check its deploy, not this repo.`);
}
process.exit(result.ok ? 0 : 1);
