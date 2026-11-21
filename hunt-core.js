/*
 * hunt-core.js — crypto shared by the site and tools/build-hunt.mjs.
 *
 *   share      random 32 bytes per answer group, AES-GCM-encrypted under
 *              PBKDF2(normalize(answer)) for each accepted spelling
 *   secret_n   SHA-256(shares)            (empty for skill games)
 *   chain_n    HKDF(chain_{n-1} || secret_n)
 *   payload_n  AES-GCM(HKDF(chain_n), word_n)
 *
 * Word n can only be decrypted with the answers to puzzles 1..n.
 */
(function (root) {
  'use strict';

  const VERSION = 'v1';
  const subtle = root.crypto.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  /* ---------- encoding helpers ---------- */

  function toB64(bytes) {
    let s = '';
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s);
  }

  function fromB64(str) {
    return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  }

  function concat(...parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  /* ---------- answer normalisation ---------- */

  /** Case-, accent- and spacing-insensitive form of a player's answer. */
  function normalize(text) {
    return String(text)
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  /**
   * Candidate tokens for one free-text field. With `split`, a field such as
   * "two puppies" also yields "two", "puppies", "puppy", ..., so that
   * one accepted word anywhere in the field is enough (puzzle 6).
   */
  function tokensFor(field, split) {
    const whole = normalize(field);
    if (!whole) return [];
    const out = new Set([whole]);
    if (split) {
      for (const w of whole.split(' ')) {
        out.add(w);
        if (w.length > 4 && w.endsWith('ies')) out.add(w.slice(0, -3) + 'y');
        if (w.length > 3 && w.endsWith('es')) out.add(w.slice(0, -2));
        if (w.length > 2 && w.endsWith('s')) out.add(w.slice(0, -1));
      }
    }
    return [...out];
  }

  /* ---------- primitives ---------- */

  async function sha256(bytes) {
    return new Uint8Array(await subtle.digest('SHA-256', bytes));
  }

  async function hkdf(ikm, salt, info) {
    const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(info) }, key, 256);
    return new Uint8Array(bits);
  }

  async function aesKey(raw) {
    return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  async function tokenKey(token, salt, iterations) {
    const base = await subtle.importKey('raw', enc.encode(token), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
    return aesKey(new Uint8Array(bits));
  }

  async function seal(key, plaintext, aad) {
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, plaintext);
    return { iv: toB64(iv), ct: toB64(ct) };
  }

  /** Returns the plaintext bytes, or null if the key is wrong. */
  async function open(key, box, aad) {
    try {
      const pt = await subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(box.iv), additionalData: enc.encode(aad) },
        key, fromB64(box.ct));
      return new Uint8Array(pt);
    } catch (_) {
      return null;
    }
  }

  /* ---------- hunt-level derivations ---------- */

  const aad = {
    share: (id, n, g) => `hunt:${VERSION}:${id}:share:${n}:${g}`,
    payload: (id, n) => `hunt:${VERSION}:${id}:payload:${n}`,
  };

  async function startChain(id) {
    return sha256(enc.encode(`hunt:${VERSION}:${id}:start`));
  }

  async function nextChain(id, n, prevChain, secret, salt) {
    return hkdf(concat(prevChain, secret), salt, `hunt:${VERSION}:${id}:chain:${n}`);
  }

  async function payloadKey(id, n, chain, salt) {
    return aesKey(await hkdf(chain, salt, `hunt:${VERSION}:${id}:payload:${n}`));
  }

  /**
   * Try the player's fields against puzzle `n`. Returns secret_n (bytes) when
   * every answer group is satisfied, otherwise null. Puzzles without groups
   * (skill games) return an empty secret.
   */
  async function recoverSecret(data, n, fields, split) {
    const p = data.puzzles[n];
    if (!p.groups.length) return new Uint8Array(0);

    const salt = fromB64(p.salt);
    const tokens = [...new Set(fields.flatMap((f) => tokensFor(f, split)))];
    const keys = await Promise.all(tokens.map((t) => tokenKey(t, salt, data.iterations)));

    const shares = [];
    for (let g = 0; g < p.groups.length; g++) {
      let share = null;
      for (const key of keys) {
        for (const box of p.groups[g]) {
          share = await open(key, box, aad.share(data.id, n, g));
          if (share) break;
        }
        if (share) break;
      }
      if (!share) return null;
      shares.push(share);
    }
    return sha256(concat(...shares));
  }

  async function revealWord(data, n, chain) {
    const p = data.puzzles[n];
    const key = await payloadKey(data.id, n, chain, fromB64(p.salt));
    const pt = await open(key, p.payload, aad.payload(data.id, n));
    return pt ? JSON.parse(dec.decode(pt)).word : null;
  }

  root.HuntCore = {
    VERSION, toB64, fromB64, concat, normalize, tokensFor,
    sha256, tokenKey, seal, open, aesKey, aad,
    startChain, nextChain, payloadKey, recoverSecret, revealWord,
  };
})(typeof window !== 'undefined' ? window : globalThis);
