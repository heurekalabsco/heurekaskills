#!/usr/bin/env node
/**
 * Dataset liveness check.
 *
 * Every skill's `## Try it` section names the data it runs against, declared as a
 * `datasets:` list in frontmatter so this check never has to parse prose. Datasets decay
 * independently of the tool they feed: URLs 404, accessions are withdrawn, hosts add a
 * login. This is what notices.
 *
 * Deliberately deterministic and cheap — a HEAD (falling back to a ranged GET for hosts
 * that reject HEAD) per dataset, run concurrently. It does NOT execute any `Try it` block;
 * that costs orders of magnitude more and is triggered separately, on a failure here or
 * when a skill is edited for another reason.
 *
 *   node scripts/check-datasets.js            # human-readable, exit 1 if anything is dead
 *   node scripts/check-datasets.js --json     # machine-readable report
 *
 * A login redirect counts as dead. A dataset that silently became account-gated fails the
 * §3b access test just as hard as one that 404s, and is easier to miss.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const SKILLS_DIR = process.env.SKILLS_DIR || 'skills';
const CONCURRENCY = Number(process.env.DATASET_CHECK_CONCURRENCY || 16);
const TIMEOUT_MS = Number(process.env.DATASET_CHECK_TIMEOUT_MS || 20000);
const JSON_OUT = process.argv.includes('--json');

const UA = process.env.DATASET_CHECK_UA
  || 'heurekaskills-dataset-check (+https://github.com/heurekalabsco/heurekaskills)';

// A dataset that quietly became account-gated fails §3b as hard as one that 404s.
const LOGIN_HINTS = /\/(login|signin|sign-in|auth|accounts)\b/i;

function frontmatter(md) {
  const m = /^---\n([\s\S]*?)\n---/.exec(md);
  if (!m) return {};
  const fm = {};
  let key = null;
  for (const line of m[1].split('\n')) {
    const kv = /^([a-zA-Z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      const v = kv[2].trim();
      if (v === '') fm[key] = [];
      else if (v.startsWith('[') && v.endsWith(']')) {
        fm[key] = v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean);
      } else fm[key] = v;
      continue;
    }
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && key) {
      if (!Array.isArray(fm[key])) fm[key] = [];
      fm[key].push(item[1].trim());
    }
  }
  return fm;
}

function collect() {
  const out = [];
  for (const slug of readdirSync(SKILLS_DIR).sort()) {
    const p = path.join(SKILLS_DIR, slug, 'SKILL.md');
    let md;
    try {
      if (!statSync(p).isFile()) continue;
      md = readFileSync(p, 'utf8');
    } catch { continue; }
    const fm = frontmatter(md);
    const declared = Array.isArray(fm.datasets) ? fm.datasets : (fm.datasets ? [fm.datasets] : []);
    const urls = declared.map((d) => String(d).replace(/^['"]|['"]$/g, '')).filter((d) => /^https?:\/\//.test(d));
    out.push({
      slug,
      hasTryIt: /^##\s+Try it\s*$/m.test(md),
      declared: declared.length,
      urls,
    });
  }
  return out;
}

async function probe(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  // Always send a real User-Agent. Node's default is blocked outright by some hosts —
  // alphafold.ebi.ac.uk answers 403 to bare fetch and 200 to the identical request with a
  // UA set. Without this the check reports healthy datasets as dead, and a checker that
  // cries wolf nightly is one nobody reads.
  const headers = { 'User-Agent': UA };
  const attempt = async (method) => fetch(url, {
    method,
    redirect: 'follow',
    signal: ctl.signal,
    headers: method === 'GET' ? { ...headers, Range: 'bytes=0-0' } : headers,
  });
  try {
    let res = await attempt('HEAD');
    // Some hosts reject HEAD outright; a ranged GET is the cheap fallback.
    if (res.status === 405 || res.status === 501 || res.status === 403) res = await attempt('GET');
    const finalUrl = res.url || url;
    if (LOGIN_HINTS.test(new URL(finalUrl).pathname)) {
      return { ok: false, status: res.status, reason: `redirected to a login page (${finalUrl})` };
    }
    if (!res.ok) return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, reason: e.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }));
  return results;
}

const skills = collect();
const jobs = skills.flatMap((s) => s.urls.map((url) => ({ slug: s.slug, url })));
const probed = await pool(jobs, CONCURRENCY, async (j) => ({ ...j, ...(await probe(j.url)) }));

const dead = probed.filter((r) => !r.ok);
const missing = skills.filter((s) => s.hasTryIt && s.declared === 0);
const noTryIt = skills.filter((s) => !s.hasTryIt);

if (JSON_OUT) {
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    skills: skills.length,
    datasets: jobs.length,
    dead,
    tryItWithoutDatasets: missing.map((s) => s.slug),
    withoutTryIt: noTryIt.map((s) => s.slug),
  }, null, 2));
} else {
  console.log(`Checked ${jobs.length} dataset(s) across ${skills.length} skill(s).`);
  for (const d of dead) console.log(`  ✗ ${d.slug}: ${d.url} — ${d.reason}`);
  if (missing.length) console.log(`  ! ${missing.length} skill(s) have "## Try it" but declare no datasets: ${missing.map((s) => s.slug).join(', ')}`);
  if (noTryIt.length) console.log(`  · ${noTryIt.length} skill(s) still have no "## Try it": ${noTryIt.map((s) => s.slug).join(', ')}`);
  if (!dead.length) console.log('✓ every declared dataset is reachable');
}

// Only a dead dataset fails the run. A skill that has not been backfilled yet is the
// nightshift's queue, not a broken build.
process.exit(dead.length ? 1 : 0);
