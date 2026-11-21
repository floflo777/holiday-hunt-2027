#!/usr/bin/env node
/*
 * Build hunt-data.js from the private config.
 *
 *   node tools/build-hunt.mjs [config=hunt.config.json] [out=hunt-data.js]
 *
 * The config holds the seed words and the answers in plaintext. It is
 * git-ignored and must never be committed; the build refuses to run if git
 * tracks it. The output holds only salts and ciphertexts and is safe to
 * commit. After writing, the build re-solves every puzzle through the exact
 * code the browser runs (hunt-core.js) and fails if anything does not match.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
createRequire(import.meta.url)(resolve(ROOT, 'hunt-core.js'));
const core = globalThis.HuntCore;

const PUZZLE_COUNT = 12;
const DEFAULT_ITERATIONS = 150_000;

function fail(msg) {
  console.error(`build-hunt: ${msg}`);
  process.exit(1);
}

function refuseIfTracked(path) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', path], { cwd: ROOT, stdio: 'ignore' });
  } catch (_) {
    return; // not tracked (or not a git checkout): fine
  }
  fail(`${path} is tracked by git. It contains the seed words — untrack it and rotate the seed.`);
}

function loadConfig(path) {
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  const puzzles = [...cfg.puzzles].sort((a, b) => a.n - b.n);
  if (puzzles.length !== PUZZLE_COUNT || puzzles.some((p, i) => p.n !== i + 1)) {
    fail(`config must define puzzles 1..${PUZZLE_COUNT} exactly once`);
  }
  for (const p of puzzles) {
    if (!/^[a-z]+$/.test(p.word ?? '')) fail(`puzzle ${p.n}: "word" must be one lowercase seed word`);
    if (!Array.isArray(p.answers)) fail(`puzzle ${p.n}: "answers" must be an array of groups ([] for a skill game)`);
    for (const group of p.answers) {
      if (!Array.isArray(group) || !group.length || group.some((a) => !core.normalize(a))) {
        fail(`puzzle ${p.n}: every answer group must be a non-empty list of non-empty strings`);
      }
    }
  }
  return { id: cfg.id, iterations: cfg.iterations ?? DEFAULT_ITERATIONS, puzzles };
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function build(cfg) {
  const id = cfg.id ?? Buffer.from(crypto.getRandomValues(new Uint8Array(8))).toString('hex');
  const data = { v: 1, id, iterations: cfg.iterations, puzzles: {} };
  let chain = await core.startChain(id);

  for (const p of cfg.puzzles) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const groups = [];
    const shares = [];

    for (const [g, spellings] of p.answers.entries()) {
      const share = crypto.getRandomValues(new Uint8Array(32));
      shares.push(share);
      const variants = [...new Set(spellings.map(core.normalize))];
      const boxes = [];
      for (const v of variants) {
        const key = await core.tokenKey(v, salt, cfg.iterations);
        boxes.push(await core.seal(key, share, core.aad.share(id, p.n, g)));
      }
      groups.push(shuffle(boxes));
    }

    const secret = shares.length ? await core.sha256(core.concat(...shares)) : new Uint8Array(0);
    chain = await core.nextChain(id, p.n, chain, secret, salt);
    const key = await core.payloadKey(id, p.n, chain, salt);
    const payload = await core.seal(key, new TextEncoder().encode(JSON.stringify({ word: p.word })),
      core.aad.payload(id, p.n));

    data.puzzles[p.n] = { salt: core.toB64(salt), groups, payload };
  }
  return data;
}

/* Structural guarantee: the output contains nothing but base64 blobs and numbers. */
function assertNoPlaintext(data) {
  const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
  const check = (box, where) => {
    const keys = Object.keys(box).sort().join(',');
    if (keys !== 'ct,iv' || !B64.test(box.iv) || !B64.test(box.ct)) fail(`unexpected field in ${where}`);
  };
  if (!/^[0-9a-f]+$/i.test(data.id)) fail('hunt id must be hex');
  for (const [n, p] of Object.entries(data.puzzles)) {
    if (Object.keys(p).sort().join(',') !== 'groups,payload,salt' || !B64.test(p.salt)) fail(`puzzle ${n}: bad shape`);
    p.groups.forEach((g, i) => g.forEach((b) => check(b, `puzzle ${n} group ${i}`)));
    check(p.payload, `puzzle ${n} payload`);
  }
}

/* Replay the hunt the way a player would, with the browser's code. */
async function selfTest(data, cfg) {
  let chain = await core.startChain(data.id);
  for (const p of cfg.puzzles) {
    const fields = p.answers.map((group) => group[0]);
    const secret = await core.recoverSecret(data, p.n, fields, Boolean(p.split));
    if (!secret) fail(`self-test: puzzle ${p.n} rejects its own answer`);
    if (p.answers.length && await core.recoverSecret(data, p.n, ['definitely not it'], false)) {
      fail(`self-test: puzzle ${p.n} accepts a wrong answer`);
    }
    chain = await core.nextChain(data.id, p.n, chain, secret, core.fromB64(data.puzzles[p.n].salt));
    if (await core.revealWord(data, p.n, chain) !== p.word) fail(`self-test: puzzle ${p.n} reveals the wrong word`);
  }
  const forged = await core.nextChain(data.id, 1, await core.startChain(data.id), new Uint8Array(0),
    core.fromB64(data.puzzles[1].salt));
  if (cfg.puzzles[0].answers.length && await core.revealWord(data, 1, forged)) {
    fail('self-test: puzzle 1 opens without its answer');
  }
}

const [configArg = 'hunt.config.json', outArg = 'hunt-data.js'] = process.argv.slice(2);
const configPath = resolve(ROOT, configArg);
const outPath = resolve(ROOT, outArg);

if (configArg === 'hunt.config.json') refuseIfTracked(configArg);
const cfg = loadConfig(configPath);
const data = await build(cfg);
assertNoPlaintext(data);
await selfTest(data, cfg);

writeFileSync(outPath,
  '/* Generated by tools/build-hunt.mjs — do not edit by hand.\n'
  + ' * Salts and AES-GCM ciphertexts only: no answer or seed word appears here. */\n'
  + `window.HUNT_DATA = ${JSON.stringify(data, null, 1)};\n`);

const typed = cfg.puzzles.filter((p) => p.answers.length).length;
console.log(`build-hunt: wrote ${outArg} (hunt ${data.id}, ${typed} answer-protected puzzles, `
  + `${PUZZLE_COUNT - typed} skill games, PBKDF2 x${cfg.iterations}). Self-test passed.`);
