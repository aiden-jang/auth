import defaultWords from './words.json';

// The drawing word list. (The old node:fs / env-var overrides are gone — there's no filesystem
// on Workers, and the bundled list is the source of truth.)
export const WORDS: string[] = defaultWords as string[];

export function randomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)]!;
}
