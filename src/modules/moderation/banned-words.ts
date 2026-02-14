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
 * Check if text contains banned words
 * Handles single words, phrases, and variations with different spacing
 */
export function containsBannedWords(text: string): {
  hasBanned: boolean;
  found: string[];
} {
  // Normalize text: lowercase and collapse multiple spaces
  const normalizedText = text.toLowerCase().replace(/\s+/g, ' ').trim();
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
