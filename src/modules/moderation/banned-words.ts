/**
 * Banned words list for content moderation
 * For MVP - basic list, can be extended
 */

export const BANNED_WORDS: string[] = [
  // Explicit content (RU)
  'порнография',
  'секс',
  'наркотики',
  'оружие',

  // Explicit content (EN)
  'porn',
  'sex',
  'drugs',
  'weapon',
  'weapons',

  // Offensive language (RU) - EXPANDED
  'идиот',
  'дурак',
  'мудак',
  'тупой',
  'дебил',
  'долбоёб',
  'долбоеб',
  'урод',
  'уебок',
  'уёбок',
  'ублюдок',

  // Offensive language (EN) - EXPANDED
  'idiot',
  'stupid',
  'moron',
  'retard',
  'retarded',
  'dumbass',
  'dumbfuck',

  // Russian profanity (CRITICAL) - NEW
  'блять',
  'бля',
  'хуй',
  'хуя',
  'хуев',
  'хуевый',
  'хуёвый',
  'хер',
  'херня',
  'пизда',
  'пиздец',
  'пизд',
  'ебать',
  'ебал',
  'ебаный',
  'ебанный',
  'ебучий',
  'ебать',
  'ебань',
  'еби',
  'ёб',
  'ебт',
  'сука',
  'суки',
  'сучка',
  'говно',
  'гавно',
  'дерьмо',
  'жопа',
  'жоп',
  'пидор',
  'пидр',
  'пидар',

  // English profanity (CRITICAL) - NEW
  'fuck',
  'fucking',
  'fucked',
  'fucker',
  'fck',
  'fuk',
  'shit',
  'shitty',
  'bullshit',
  'ass',
  'asshole',
  'arse',
  'bitch',
  'bitches',
  'damn',
  'dammit',
  'damned',
  'crap',
  'crappy',
  'piss',
  'pissed',
  'bastard',
  'cock',
  'dick',
  'pussy',
  'whore',
  'slut',

  // Spam/scam
  'spam',
  'scam',
  'fraud',
  'мошенничество',
  'спам',

  // Illegal activities
  'hack',
  'взлом',
  'illegal',
  'незаконно',

  // Prompt injection patterns (CRITICAL) - NEW
  'ignore all previous instructions',
  'ignore previous instructions',
  'forget everything',
  'disregard the above',
  'new instructions',
  'you are now',
  'act as',
  'pretend you are',
  'system prompt',
  'системный промпт',
  'забудь всё',
  'игнорируй инструкции',

  // System information extraction attempts (CRITICAL) - NEW
  'внутренние данные сервиса',
  'системная информация',
  'системные данные',
  'выведи debug',
  'debug информация',
  'технические параметры',
  'internal data',
  'system information',
  'show debug',
  'debug info',
  'service internals',
  'technical parameters',
  'api credentials',
  'database schema',
  'конфигурация системы',
  'system configuration',
];

/**
 * Whitelist patterns that should NOT be flagged despite containing banned words
 * For car brands and automotive terms
 */
const WHITELIST_PATTERNS = [
  's-class', // Mercedes-Benz S-Class
  'c-class', // Mercedes-Benz C-Class
  'e-class', // Mercedes-Benz E-Class
  'g-class', // Mercedes-Benz G-Class
  'a-class', // Mercedes-Benz A-Class
  'b-class', // Mercedes-Benz B-Class
  'cla-class', // Mercedes-Benz CLA-Class
  'gla-class', // Mercedes-Benz GLA-Class
  'glc-class', // Mercedes-Benz GLC-Class
  'gle-class', // Mercedes-Benz GLE-Class
  'gls-class', // Mercedes-Benz GLS-Class
  'v-class', // Mercedes-Benz V-Class
  'x-class', // Mercedes-Benz X-Class
  'compass', // Jeep Compass
  'vesta cross', // Lada Vesta Cross
  'business class', // тип автомобиля
  'comfort class', // тип автомобиля
  'premium class', // тип автомобиля
  'economy class', // тип автомобиля
];

/**
 * Check if text contains banned words
 * Handles single words, phrases, and variations with different spacing
 */
export function containsBannedWords(text: string): {
  hasBanned: boolean;
  found: string[];
} {
  // Normalize text: lowercase and collapse multiple spaces
  let normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();

  // Remove whitelisted patterns before checking for banned words
  // This prevents false positives like "S-Class" triggering "ass"
  for (const pattern of WHITELIST_PATTERNS) {
    const patternRegex = new RegExp(`\\b${escapeRegex(pattern)}\\b`, 'gi');
    normalizedText = normalizedText.replace(patternRegex, ' ');
  }

  // Collapse multiple spaces again after removal
  normalizedText = normalizedText.replace(/\s+/g, ' ').trim();

  const found: string[] = [];

  for (const word of BANNED_WORDS) {
    const normalizedWord = word.toLowerCase();

    // For single words: use word boundary regex
    if (!normalizedWord.includes(' ')) {
      const regex = new RegExp(`\\b${escapeRegex(normalizedWord)}\\b`, 'i');
      if (regex.test(normalizedText)) {
        found.push(word);
        continue;
      }
    }

    // For phrases: check if phrase exists in normalized text
    if (normalizedText.includes(normalizedWord)) {
      found.push(word);
    }
  }

  return {
    hasBanned: found.length > 0,
    found,
  };
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
