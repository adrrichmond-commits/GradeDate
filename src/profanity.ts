// Simple profanity / hate speech word blocklist for chat and profile moderation.
// This list is intentionally limited — it covers common slurs, hate speech terms,
// and explicit content to provide basic filtering. It is NOT comprehensive.

const BLOCKED_TERMS: string[] = [
  // Hate speech / slurs
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "retard",
  "tranny",
  "chink",
  "kike",
  "spic",
  "wetback",
  "gook",
  "raghead",
  "towelhead",
  "sandnigger",
  "coon",
  "jiggaboo",
  "heeb",
  "cracker",
  "honky",
  "zipperhead",
  "slant",
  "beaner",
  "dago",
  "wop",
  "guinea",
  "paki",
  "hajji",
  "cunt",
  "dyke",
  "shemale",
  // Sexual / explicit
  "dick",
  "cock",
  "pussy",
  "cumslut",
  "cumdump",
  "fucktard",
  "motherfucker",
  "dickhead",
  "shithead",
  "asshole",
  "dumbass",
  "jackass",
  "bastard",
  "slut",
  "whore",
  "bitch",
  "porn",
  "sex",
  "anal",
  "orgasm",
  "masturbat",
  "ejaculat",
  "penis",
  "vagina",
  "clit",
  "cum",
  "sperm",
  "incest",
  "pedo",
  "childporn",
  "rape",
  "molest",
  // Extreme hate / violence
  "kill yourself",
  "kys",
  "hang yourself",
  "suicide",
];

/**
 * Check if a message contains any blocked terms.
 * Returns null if the message is clean, or the matched blocked term if found.
 */
export function filterMessage(text: string): { blocked: boolean; matchedTerm?: string } {
  const lower = text.toLowerCase();

  for (const term of BLOCKED_TERMS) {
    // Use word boundary matching where possible to avoid false positives
    // (e.g., "class" matching "ass")
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(lower)) {
      return { blocked: true, matchedTerm: term };
    }
  }

  return { blocked: false };
}

/**
 * Sanitize a message by replacing blocked terms with asterisks.
 * Returns the sanitized text.
 */
export function sanitizeMessage(text: string): string {
  let result = text;
  const lower = text.toLowerCase();

  for (const term of BLOCKED_TERMS) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(lower)) {
      result = result.replace(regex, '*'.repeat(term.length));
    }
  }

  return result;
}
