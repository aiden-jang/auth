import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesWord, phraseGuess } from "./aiGuessLoop.ts";

// ---- matchesWord: the lenient match the scoring path depends on ----

test("matchesWord accepts exact and case-insensitive matches", () => {
  assert.ok(matchesWord("dog", "dog"));
  assert.ok(matchesWord("DOG", "dog"));
  assert.ok(matchesWord("Dog", "DOG"));
});

test("matchesWord accepts the word inside a natural-language answer", () => {
  assert.ok(matchesWord("it's an elephant", "elephant"));
  assert.ok(matchesWord("a dog probably", "dog"));
});

test("matchesWord rejects unrelated guesses", () => {
  assert.ok(!matchesWord("cat", "dog"));
  assert.ok(!matchesWord("", "dog"));
});

test("matchesWord forgives accents and punctuation like a human guess", () => {
  assert.ok(matchesWord("It's a café!", "cafe"));
  assert.ok(matchesWord("ICE-CREAM", "ice cream"));
  assert.ok(matchesWord("a piñata 🎉", "pinata"));
});

// ---- phraseGuess: personality must never change what gets matched ----
// This is the invariant that lets the bot have a voice without affecting
// scoring: the displayed text is decorated, but matching runs on the raw
// guess. If someone later matches against the displayed text, these guard it.

test("phraseGuess always embeds the raw guess verbatim", () => {
  for (let i = 0; i < 200; i++) {
    const out = phraseGuess("elephant");
    assert.ok(out.includes("elephant"), `phrasing dropped the guess: "${out}"`);
  }
});

test("a phrased guess still matches the secret word", () => {
  // Whatever decoration we add, the raw guess remains matchable — proving
  // phrasing and matching are independent (we match on the raw guess, not
  // the decorated string, but this asserts the decoration can't *prevent* it).
  for (let i = 0; i < 200; i++) {
    const phrased = phraseGuess("dog");
    assert.ok(matchesWord(phrased, "dog"), `phrasing broke matching: "${phrased}"`);
  }
});
