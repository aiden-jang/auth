import { DEFAULT_OCCASION } from './occasions'

// Example notes shown as the composer's placeholder, curated per occasion and
// flavored by mood. The goal is that picking "hbd" + "unserious" previews a
// funny birthday note, while "ty" + "soft" previews a heartfelt thank-you, so
// the empty field already suggests what to write.
//
// Every occasion has a `default` (used for "no vibe" and any mood without its
// own variant). Voice: lowercase, specific, warm, occasionally dry. No em dashes.

type MoodVariants = { default: string } & Partial<Record<string, string>>

const PLACEHOLDERS: Record<string, MoodVariants> = {
  'just-because': {
    default: 'no reason. just thinking about you and figured you should know.',
    playful: "you crossed my mind, so now you're getting a whole garden about it. deal with it.",
    tender: "thinking about you. nothing deep. just glad you're around, that's all.",
    wistful: "drove past our old spot today. anyway. hope you're good.",
    steady: "no occasion. just your reminder that i'm around if you need me.",
  },
  birthday: {
    default: 'happy birthday. glad you were born, etc etc.',
    playful: "another year, still can't parallel park, still my favorite. happy birthday.",
    tender: "happy birthday. you're a good one, don't let it go to your head.",
    celebratory: "happy birthday. we're making it a whole thing this year, sorry in advance.",
    wistful: "another one of these with you. not mad about it. happy birthday.",
  },
  'thank-you': {
    default: 'thanks for the other day. meant more than i said out loud, which was not much.',
    tender: 'you showed up without me having to ask. noted. thank you, genuinely.',
    playful: "you're in my will now. it's mostly snacks. thanks for everything.",
    steady: "thanks. you're the 2am call person, and that's not nothing.",
  },
  anniversary: {
    default: 'another year of you leaving every cabinet open. still in. happy anniversary.',
    tender: "i'd pick this again. obviously. happy anniversary.",
    playful: 'congrats to us for not losing it. mostly. love you.',
    wistful: 'remember that terrible first apartment. look at us now. anyway, love you.',
    celebratory: "cheers to us. more years, more nonsense. happy anniversary.",
  },
  congrats: {
    default: "you did the thing. knew you would. don't make it weird.",
    celebratory: 'you DID it. already telling everyone. congrats, seriously.',
    steady: 'never doubted it. you earned this. proud of you, quietly.',
    playful: 'big w. i want a shout-out in the speech. congrats.',
  },
  'get-well': {
    default: "rest up, don't rush it. the group chat's boring without you anyway.",
    tender: 'take it slow. sending good things while you heal.',
    playful: "doctor's orders (mine): bad tv, zero responsibilities, get better.",
    steady: "whatever you need while you're down, i've got it. just rest.",
  },
  sympathy: {
    default: "no words feel right, so i'll just say i'm around. whenever.",
    tender: "not going to try to fix it. just here, for whatever you need.",
    steady: "you don't have to do this alone. i'm not going anywhere.",
    wistful: 'thinking of you today. and of them. here if you want to talk.',
  },
}

/**
 * A curated example note for the chosen occasion + mood. Falls back to the
 * occasion's default variant, then to the default occasion, so any combination
 * returns something fitting.
 */
export function placeholderFor(occasion: string, mood: string): string {
  const set = PLACEHOLDERS[occasion] ?? PLACEHOLDERS[DEFAULT_OCCASION]!
  return set[mood] ?? set.default
}
