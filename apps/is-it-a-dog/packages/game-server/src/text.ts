// Generic text helpers for comparing guesses to words. Mode-agnostic and
// transport-agnostic so any mode (or the AI guess loop) can share one
// canonicalization rule rather than each rolling its own.

// Canonicalize a guess/word for comparison: lowercase, strip diacritics
// (café → cafe), drop punctuation, and collapse whitespace. This makes
// matching forgiving without accepting anything that isn't really the word.
export function normalizeGuess(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining accent marks
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation/symbols → space
    .replace(/\s+/g, " ")
    .trim();
}

// A guess is "close" when it's within one edit (insert/delete/substitute) of
// the answer — a single typo or missing letter. Gated to words of length >= 4
// so short words ("cat"/"hat") don't trigger a nudge on every near-miss, and
// the guess itself must have some length so empty/spam chat is ignored.
export function isClose(guess: string, word: string): boolean {
  if (guess === word) return false; // exact is a win, not "close"
  if (word.length < 4 || guess.length < 2) return false;
  return levenshtein(guess, word) === 1;
}

// Standard iterative Levenshtein edit distance (single-row, O(n) space).
function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + cost);
      diag = tmp;
    }
  }
  return prev[b.length]!;
}
