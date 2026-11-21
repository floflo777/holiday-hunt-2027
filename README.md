# Milo Fam Holiday Hunt

## Puzzle data

Answers and seed words are no longer part of the page source. Earlier versions
of the pages included them (file names, titles, `.hidden-clue`, char-code arrays),
and they remain in the git history, so the next edition needs a new wallet and
new answers.

### How it works

The repository contains no words and no answers, only ciphertexts in `hunt-data.js`.
Each seed word is encrypted with a key derived from the answers to puzzles 1..n
(details in `hunt-core.js`). Skill games (4, 5, 9, 11) have no answer, so their
words are protected by the answers that come before them.

### Limits

- A short answer (a small number, a name) can still be brute-forced offline.
  PBKDF2 slows that down, but only long or unguessable answers really protect the
  words. Use those for the last puzzles.
- An answer must not appear anywhere on the site. Today puzzle 4 ("Willow's Run")
  gives away puzzle 2, and puzzle 7 contains its answer as Morse, which is also
  puzzle 8's melody.

## Relaunch checklist

1. Create a new wallet offline and keep its 12 words.
2. `cp hunt.config.example.json hunt.config.json`, then fill in the words and new answers.
3. `node tools/build-hunt.mjs` writes `hunt-data.js` and checks every puzzle.
4. Set the new address in `treasure-status.js`, then fund it.
5. Commit `hunt-data.js`. Never commit `hunt.config.json` (it is git-ignored).

## Tests

```sh
pip install playwright && playwright install chromium
python3 tools/test/e2e.py
```

Plays the whole hunt in headless Chromium, with placeholder answers.
