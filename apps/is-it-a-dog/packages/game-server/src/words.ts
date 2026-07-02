import { readFileSync } from "node:fs";
import defaultWords from "./words.json" with { type: "json" };

// Word list, loaded once at startup. Operators can override it without a code
// change in two ways:
//   WORDS="cat,dog,tree"        → inline comma-separated list
//   WORDS_FILE=/path/words.json → JSON array file
function loadWords(): string[] {
  const inline = process.env.WORDS;
  if (inline) {
    const list = inline.split(",").map((w) => w.trim()).filter(Boolean);
    if (list.length) return list;
  }
  const file = process.env.WORDS_FILE;
  if (file) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (e) {
      console.error(`[words] failed to load WORDS_FILE=${file}:`, (e as Error).message);
    }
  }
  return defaultWords as string[];
}

export const WORDS: string[] = loadWords();

export function randomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}
