// Probe every dataset a skill's `## Try it` declares, and report the ones a reader could
// no longer fetch. Run nightly by CI, and by the nightshift before it picks a target.
//
// Datasets decay independently of the tool they feed: URLs 404, accessions are withdrawn,
// hosts add a login. That is the same class of decay as an upstream API change, and this is
// what notices it.
//
//   node scripts/check-datasets.js            # human-readable
//   node scripts/check-datasets.js --json     # machine-readable, for the nightshift
//
// Exits non-zero when a dataset is DEAD or UNPROBED. Exits zero for inconclusive (transient)
// results and for skills still awaiting backfill — those are a queue, not a broken build.
//
// The rule governing every judgement call here: **a false green is far worse than a false
// red.** A checker that wrongly reports healthy certifies something nobody verified. A
// checker that cries wolf merely gets ignored. Both are bad; only the first is silent.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { listSkillDirs } from './lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// Resolve from the script, like validate.js, so it behaves identically run from anywhere —
// the nightshift is a stated external caller and invokes it by absolute path.
const SKILLS_DIR = process.env.SKILLS_DIR
  ? path.resolve(process.env.SKILLS_DIR)
  : path.join(ROOT, 'skills');

const JSON_OUT = process.argv.includes('--json');
const MAX_REDIRECTS = 5;
// A skill verified long enough ago has quietly become a claim about the past. This does not
// fail the build — staleness is a queue, not a break — but it must be visible, or "verified"
// decays into "was verified once, we think".
const STALE_AFTER_DAYS = Number(process.env.VERIFIED_STALE_DAYS || 90);
const RETRIES = 2;

// Some hosts block an unknown client outright: alphafold.ebi.ac.uk answers 403 to a bare
// Node fetch and 200 to the identical request with a UA set. Without this the check reports
// healthy datasets as dead. Do not remove it as noise.
const UA = process.env.DATASET_CHECK_UA
  || 'heurekaskills-dataset-check (+https://github.com/heurekalabsco/heurekaskills)';

// A dataset that quietly became account-gated fails the access test as hard as one that
// 404s, and is easier to miss. Cast wide: a false positive here costs a human glance; a miss
// leaves a skill telling readers to fetch something they cannot get.
const LOGIN_RE = /(^|\/)(login|signin|sign[-_]in|session\/new|auth|authorize|oauth\d?|sso|saml|shibboleth|cas|idp|accounts?\/login)(\/|$)/i;
const LOGIN_QUERY_RE = /(^|[?&])(redirect(_uri)?|returnto|return_to|next|service)=/i;

// An env var that silently becomes 0 or NaN turns the whole gate into a no-op that exits
// clean. Refuse to start instead.
function positiveInt(raw, fallback, name) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    console.error(`${name} must be a positive integer; got "${raw}". Refusing to run — a zero or NaN value would probe nothing and still exit 0.`);
    process.exit(2);
  }
  return n;
}

const TIMEOUT_MS = positiveInt(process.env.DATASET_CHECK_TIMEOUT_MS, 20000, 'DATASET_CHECK_TIMEOUT_MS');
const CONCURRENCY = positiveInt(process.env.DATASET_CHECK_CONCURRENCY, 8, 'DATASET_CHECK_CONCURRENCY');

function isPrivateAddress(host) {
  if (net.isIP(host) === 0) return false;
  if (net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || a === 127 || a === 0
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)             // link-local, incl. cloud metadata
      || (a === 100 && b >= 64 && b <= 127);  // CGNAT
  }
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd')
    || h.startsWith('fe80') || h.startsWith('::ffff:127.') || h.startsWith('::ffff:10.');
}

// `datasets:` is community-contributed input by construction, so treat every hop as
// attacker-chosen. Resolving the name and checking each returned address closes the
// public-hostname-pointing-at-localhost case a literal check alone misses.
async function rejectIfInternal(u) {
  if (u.protocol !== 'https:') return `refused: ${u.protocol}// is not allowed (https only)`;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return `refused: ${u.hostname} is an internal name`;
  }
  if (isPrivateAddress(host)) return `refused: ${u.hostname} is a private or link-local address`;
  try {
    for (const { address } of await dns.lookup(host, { all: true })) {
      if (isPrivateAddress(address)) return `refused: ${u.hostname} resolves to the private address ${address}`;
    }
  } catch (e) {
    return `DNS lookup failed: ${e.code || e.message}`;
  }
  return null;
}

function looksLikeLogin(u, contentType) {
  if (LOGIN_RE.test(u.pathname)) return `redirected to a login page (${u.href})`;
  if (LOGIN_QUERY_RE.test(u.search) && /log|auth|sign/i.test(u.href)) {
    return `redirected to what looks like a login flow (${u.href})`;
  }
  // The most common real form of gating: the portal adds a login and serves 200 HTML at the
  // same URL. Neither the status code nor the path reveals it.
  if (contentType && /^text\/html/i.test(contentType)) {
    return `returned HTML where data was expected (content-type: ${contentType}) — the host may now gate this behind a page`;
  }
  return null;
}

// Transient failures must not read as death: 429/5xx/network are retried, and a persistent
// one is reported inconclusive rather than failing the build. A nightly job that goes red on
// someone else's rate limit is a job people learn to ignore.
const isTransient = (status) => status === 429 || (status >= 500 && status < 600);

async function once(url, method) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const headers = { 'User-Agent': UA, Accept: '*/*' };
    if (method === 'GET') headers.Range = 'bytes=0-0';
    return await fetch(url, { method, redirect: 'manual', signal: ctl.signal, headers });
  } finally {
    clearTimeout(timer);
  }
}

async function probeOnce(startUrl) {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u;
    try { u = new URL(url); } catch { return { state: 'dead', reason: `not a valid URL: ${url}` }; }

    // Re-checked on every hop, not just the first — otherwise a public URL redirects inward.
    const refused = await rejectIfInternal(u);
    if (refused) return { state: 'dead', reason: refused };

    let res;
    try {
      res = await once(u.href, 'HEAD');
      // Plenty of hosts reject HEAD outright; a ranged GET is the cheap fallback.
      if ([403, 405, 501].includes(res.status)) res = await once(u.href, 'GET');
    } catch (e) {
      return {
        state: 'transient',
        status: 0,
        reason: e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : String(e.message || e),
      };
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return { state: 'dead', status: res.status, reason: `HTTP ${res.status} with no Location header` };
      url = new URL(loc, u).href;
      continue;
    }

    const gated = looksLikeLogin(u, res.headers.get('content-type'));
    if (gated) return { state: 'dead', status: res.status, reason: gated };
    if (isTransient(res.status)) return { state: 'transient', status: res.status, reason: `HTTP ${res.status}` };
    if (!res.ok) return { state: 'dead', status: res.status, reason: `HTTP ${res.status}` };
    return { state: 'ok', status: res.status };
  }
  return { state: 'dead', reason: `more than ${MAX_REDIRECTS} redirects` };
}

async function probe(url) {
  let last;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    last = await probeOnce(url);
    if (last.state !== 'transient') return last;
    if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  return { ...last, state: 'inconclusive' };
}

function collect() {
  const out = [];
  for (const slug of listSkillDirs(SKILLS_DIR)) {
    let raw;
    try { raw = fs.readFileSync(path.join(SKILLS_DIR, slug, 'SKILL.md'), 'utf8'); } catch { continue; }

    // Real YAML, read exactly as validate.js reads it. A hand-rolled parser here was the
    // original bug: it split flow lists on every comma, so a URL with commas in its query
    // string was probed at a different, healthier address than the one declared.
    let fm = {};
    let unparseable = false;
    try { fm = yaml.load(raw.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] ?? '') ?? {}; }
    catch { unparseable = true; }

    const present = Object.prototype.hasOwnProperty.call(fm, 'datasets');
    const declared = present ? (Array.isArray(fm.datasets) ? fm.datasets : [fm.datasets]) : [];
    const urls = [];
    const unusable = [];
    for (const d of declared) {
      const s = typeof d === 'string' ? d.trim() : '';
      if (/^https:\/\//i.test(s)) urls.push(s);
      else unusable.push(String(d));
    }

    // Verification age, for the re-audit queue.
    const V = fm.verified;
    let verifiedOn = null, verifiedPending = V === 'pending', coverage = null;
    if (V && typeof V === 'object' && !Array.isArray(V)) {
      verifiedOn = V.date instanceof Date
        ? V.date.toISOString().slice(0, 10)
        : (typeof V.date === 'string' ? V.date : null);
      const ran = Number(V.executed), skipped = Number(V.unverified ?? 0);
      if (Number.isFinite(ran) && Number.isFinite(skipped) && ran + skipped > 0) {
        coverage = ran / (ran + skipped);
      }
    }
    const ageDays = verifiedOn
      ? Math.floor((Date.now() - Date.parse(verifiedOn + 'T00:00:00Z')) / 86400000)
      : null;

    out.push({
      slug,
      verifiedOn, verifiedPending, coverage, ageDays,
      hasTryIt: /^##\s+Try it\s*$/m.test(raw),
      // A `data` skill exempted from `## Get the files` by `try-it: pending` is real work
      // owed, and it was invisible here — the routine that clears the backfill queue could
      // not see it. Same reasoning as withoutTryIt: an untracked queue is not a queue.
      isData: fm.category === 'data',
      hasGetFiles: /^##\s+Get the files\s*$/m.test(raw),
      present, urls, unusable, unparseable,
      // An explicit empty list is how a skill says "generated inline, nothing to fetch".
      intentionallyNone: present && Array.isArray(fm.datasets) && fm.datasets.length === 0,
    });
  }
  return out;
}

async function pool(items, n, fn) {
  const results = new Array(items.length).fill(null);
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      // A checker crash must not read as "all clear".
      try { results[idx] = await fn(items[idx]); }
      catch (e) { results[idx] = { ...items[idx], state: 'dead', reason: `checker error: ${e.message || e}` }; }
    }
  }));
  return results;
}

const skills = collect();
const jobs = skills.flatMap((s) => s.urls.map((url) => ({ slug: s.slug, url })));
const probed = await pool(jobs, CONCURRENCY, async (j) => ({ ...j, ...(await probe(j.url)) }));

const dead = probed.filter((r) => r.state === 'dead');
const inconclusive = probed.filter((r) => r.state === 'inconclusive');

// A declared dataset we could not even turn into a URL used to fall into no bucket at all:
// not dead, not missing, absent from the output entirely, exit 0. That is exactly the false
// green this script exists to prevent, so it is now a failure in its own right.
const unprobed = skills.flatMap((s) => [
  ...s.unusable.map((v) => ({ slug: s.slug, value: v, reason: 'not an https:// URL' })),
  ...(s.unparseable ? [{ slug: s.slug, value: '(frontmatter)', reason: 'frontmatter is not valid YAML' }] : []),
]);

const missing = skills.filter((s) => s.hasTryIt && !s.present);
const withoutTryIt = skills.filter((s) => !s.hasTryIt);
const withoutGetFiles = skills.filter((s) => s.isData && !s.hasGetFiles);
const inline = skills.filter((s) => s.intentionallyNone);
const staleVerify = skills
  .filter((s) => s.ageDays !== null && s.ageDays > STALE_AFTER_DAYS)
  .sort((a, b) => b.ageDays - a.ageDays);
const unverifiedYet = skills.filter((s) => s.verifiedPending);
const covered = skills.filter((s) => s.coverage !== null);
const meanCoverage = covered.length
  ? covered.reduce((t, s) => t + s.coverage, 0) / covered.length
  : null;
const failed = dead.length + unprobed.length;

if (JSON_OUT) {
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    skills: skills.length,
    datasets: jobs.length,
    dead,
    unprobed,
    inconclusive,
    verification: {
      staleAfterDays: STALE_AFTER_DAYS,
      stale: staleVerify.map((s) => ({ slug: s.slug, verifiedOn: s.verifiedOn, ageDays: s.ageDays })),
      awaitingFirstVerification: unverifiedYet.map((s) => s.slug),
      meanCoverage,
    },
    tryItWithoutDatasets: missing.map((s) => s.slug),
    withoutTryIt: withoutTryIt.map((s) => s.slug),
    withoutGetFiles: withoutGetFiles.map((s) => s.slug),
    inlineByDesign: inline.map((s) => s.slug),
    ok: failed === 0,
  }, null, 2));
} else {
  const declaring = skills.filter((s) => s.urls.length).length;
  console.log(`Probed ${jobs.length} dataset(s) declared by ${declaring} of ${skills.length} skill(s).`);
  for (const d of dead) console.log(`  ✗ ${d.slug}: ${d.url} — ${d.reason}`);
  for (const u of unprobed) console.log(`  ✗ ${u.slug}: declared "${u.value}" — ${u.reason}, so it was never checked`);
  for (const t of inconclusive) console.log(`  ? ${t.slug}: ${t.url} — ${t.reason} after ${RETRIES + 1} attempts (not counted as dead)`);
  for (const v of staleVerify) console.log(`  ⧗ ${v.slug}: last verified ${v.verifiedOn} (${v.ageDays}d ago) — past the ${STALE_AFTER_DAYS}d re-audit window`);
  if (unverifiedYet.length) console.log(`  · ${unverifiedYet.length} skill(s) awaiting first verification: ${unverifiedYet.map((s) => s.slug).join(', ')}`);
  if (meanCoverage !== null) console.log(`  · mean executed share across ${covered.length} verified skill(s): ${Math.round(meanCoverage * 100)}%`);
  if (missing.length) console.log(`  ! ${missing.length} skill(s) have "## Try it" but declare no datasets: ${missing.map((s) => s.slug).join(', ')}`);
  if (withoutTryIt.length) console.log(`  · ${withoutTryIt.length} skill(s) awaiting "## Try it": ${withoutTryIt.map((s) => s.slug).join(', ')}`);
  if (withoutGetFiles.length) console.log(`  · ${withoutGetFiles.length} data skill(s) awaiting "## Get the files": ${withoutGetFiles.map((s) => s.slug).join(', ')}`);
  if (inline.length) console.log(`  · ${inline.length} skill(s) generate their data inline, nothing to probe: ${inline.map((s) => s.slug).join(', ')}`);
  if (!failed) console.log(jobs.length ? '✓ every probed dataset is reachable' : '✓ nothing to probe');
}

// process.exitCode, not process.exit() — the latter can truncate piped stdout, and the
// nightshift consumes --json through a pipe.
process.exitCode = failed ? 1 : 0;
