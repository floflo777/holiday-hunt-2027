/*
 * hunt.js — page-side glue between a puzzle page and HuntCore.
 *
 * Each puzzle page calls, once:
 *     Hunt.page(n)
 * then, when the player submits:
 *     const result = await Hunt.solve([...fields], { split })   // typed puzzles
 *     const result = await Hunt.complete()                       // skill games
 * where result is 'solved' | 'wrong' | 'locked'.
 *
 * Progress (the chain key of each solved puzzle, never the answers or words)
 * is kept in localStorage so players can close the tab and come back.
 */
(function () {
  'use strict';

  const data = window.HUNT_DATA;
  const core = window.HuntCore;
  let current = null;

  const storageKey = (n) => `hunt:${data.id}:chain:${n}`;

  function loadChain(n) {
    try {
      const v = localStorage.getItem(storageKey(n));
      return v ? core.fromB64(v) : null;
    } catch (_) {
      return null;
    }
  }

  function saveChain(n, chain) {
    try { localStorage.setItem(storageKey(n), core.toB64(chain)); } catch (_) { /* private mode */ }
  }

  async function previousChain(n) {
    return n === 1 ? core.startChain(data.id) : loadChain(n - 1);
  }

  function showWord(n, word) {
    const el = document.querySelector('.hidden-clue');
    if (el) el.textContent = `${n}. ${word}`;
  }

  function showLocked(n) {
    let banner = document.getElementById('hunt-locked');
    if (!banner) {
      banner = document.createElement('p');
      banner.id = 'hunt-locked';
      banner.className = 'error-msg hunt-locked';
      const prev = String(n - 1).padStart(2, '0');
      banner.innerHTML = `Solve <a class="highlight-link" href="puzzle-${prev}.html">puzzle ${n - 1}</a> first.`;
      const box = document.querySelector('.puzzle-box') || document.body;
      box.insertBefore(banner, box.children[1] || null);
    }
    banner.style.display = 'block';
  }

  async function finish(n, prev, secret) {
    const chain = await core.nextChain(data.id, n, prev, secret, core.fromB64(data.puzzles[n].salt));
    const word = await core.revealWord(data, n, chain);
    if (!word) return 'wrong';
    saveChain(n, chain);
    showWord(n, word);
    return 'solved';
  }

  async function busy(fn) {
    document.body.setAttribute('aria-busy', 'true');
    try { return await fn(); } finally { document.body.removeAttribute('aria-busy'); }
  }

  window.Hunt = {
    /** Register the current page and restore its word if already solved. */
    async page(n) {
      current = n;
      const solved = loadChain(n);
      if (solved) {
        const word = await core.revealWord(data, n, solved);
        if (word) showWord(n, word);
      } else if (!(await previousChain(n))) {
        showLocked(n);
      }
    },

    /** Typed puzzle: check the player's fields. */
    solve(fields, { split = false } = {}) {
      return busy(async () => {
        const n = current;
        const prev = await previousChain(n);
        if (!prev) { showLocked(n); return 'locked'; }
        const secret = await core.recoverSecret(data, n, fields, split);
        return secret ? finish(n, prev, secret) : 'wrong';
      });
    },

    /** Skill game: the win itself carries no secret, it extends the chain. */
    complete() {
      return busy(async () => {
        const n = current;
        const prev = await previousChain(n);
        if (!prev) { showLocked(n); return 'locked'; }
        return finish(n, prev, new Uint8Array(0));
      });
    },
  };
})();
