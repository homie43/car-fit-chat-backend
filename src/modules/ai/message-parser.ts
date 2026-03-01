import { UserPreferences } from './ai.types';
import { BRAND_ALIASES } from './brand-aliases';

const CYRILLIC_VOWELS = 'аеёиоуыэюя';

/**
 * Check if text contains a Cyrillic word, accounting for Russian declensions.
 * For words ending in a vowel, matches by stem (drops last vowel + optional ending).
 * For consonant-ending words (бмв, ваз), uses exact substring match.
 */
function containsCyrillicWord(text: string, word: string): boolean {
  if (CYRILLIC_VOWELS.includes(word[word.length - 1])) {
    const stem = word.slice(0, -1);
    // stem + 0-3 Cyrillic chars, followed by non-Cyrillic or end of string
    const regex = new RegExp(stem + '[а-яё]{0,3}(?![а-яё])', 'i');
    return regex.test(text);
  }
  return text.includes(word);
}

/**
 * Check if text contains a Cyrillic phrase (possibly multi-word) with declension support.
 */
function containsCyrillicPhrase(text: string, phrase: string): boolean {
  const words = phrase.split(/\s+/);
  if (words.length === 1) {
    return containsCyrillicWord(text, words[0]);
  }
  return words.every((w) => containsCyrillicWord(text, w));
}

/**
 * Body type mappings: keyword -> DB bodyType substring
 * DB stores Russian values: "Седан", "Внедорожник 5 дв.", "Хэтчбек 5 дв.", etc.
 * Search uses `contains` + insensitive, so we map to Russian substrings.
 */
const BODY_TYPE_KEYWORDS: Map<string, string> = new Map([
  // Russian keywords
  ['седан', 'Седан'],
  ['хэтчбек', 'Хэтчбек'],
  ['хетчбек', 'Хэтчбек'],
  ['хетчбэк', 'Хэтчбек'],
  ['внедорожник', 'Внедорожник'],
  ['кроссовер', 'Внедорожник'],
  ['паркетник', 'Внедорожник'],
  ['купе', 'Купе'],
  ['купэ', 'Купе'],
  ['универсал', 'Универсал'],
  ['минивэн', 'Минивэн'],
  ['минивен', 'Минивэн'],
  ['пикап', 'Пикап'],
  ['кабриолет', 'Кабриолет'],
  ['лифтбек', 'Лифтбек'],
  ['лифтбэк', 'Лифтбек'],
  // English keywords -> Russian DB values
  ['sedan', 'Седан'],
  ['hatchback', 'Хэтчбек'],
  ['suv', 'Внедорожник'],
  ['coupe', 'Купе'],
  ['wagon', 'Универсал'],
  ['minivan', 'Минивэн'],
  ['pickup', 'Пикап'],
  ['cabriolet', 'Кабриолет'],
]);

/**
 * Transmission keywords: Russian/English -> DB kppText value
 * DB uses: "AT", "MT", "CVT", "Robot", "AMT"
 */
const KPP_KEYWORDS: Map<string, string> = new Map([
  ['автомат', 'AT'],
  ['акпп', 'AT'],
  ['автоматическая', 'AT'],
  ['механика', 'MT'],
  ['мкпп', 'MT'],
  ['механическая', 'MT'],
  ['ручная', 'MT'],
  ['вариатор', 'CVT'],
  ['робот', 'Robot'],
  ['роботизированная', 'Robot'],
  // English
  ['automatic', 'AT'],
  ['manual', 'MT'],
]);

/**
 * Parse user message to extract car preferences using regex/keyword matching.
 * Runs BEFORE LLM call so preferences are available for RAG search immediately.
 */
export function parseMessageForPreferences(message: string): UserPreferences {
  const preferences: UserPreferences = {};
  const lowerMessage = message.toLowerCase();

  // 1. Brand detection — check multi-word aliases first (longer first)
  //    Use stem matching for Cyrillic to handle Russian declensions
  const sortedAliases = Array.from(BRAND_ALIASES.entries()).sort(
    (a, b) => b[0].length - a[0].length,
  );

  for (const [alias, latin] of sortedAliases) {
    if (containsCyrillicPhrase(lowerMessage, alias)) {
      preferences.marka = latin;
      break;
    }
  }

  // Also check for Latin brand names directly if no Cyrillic alias found
  if (!preferences.marka) {
    const latinBrands = [
      'Land Rover', 'Alfa Romeo', 'Aston Martin', 'Rolls-Royce', 'Great Wall',
      'Mercedes-Benz', 'SsangYong',
      'Toyota', 'Honda', 'Nissan', 'BMW', 'Mercedes', 'Audi', 'Volkswagen',
      'Hyundai', 'Kia', 'Ford', 'Chevrolet', 'Mazda', 'Subaru', 'Lexus',
      'Porsche', 'Volvo', 'Skoda', 'Renault', 'Peugeot', 'Jeep',
      'Jaguar', 'Tesla', 'Mitsubishi', 'Suzuki',
      'Chery', 'Haval', 'Geely', 'LADA', 'UAZ',
      'Dodge', 'Chrysler', 'Cadillac', 'Buick', 'Lincoln',
      'Fiat', 'Ferrari', 'Lamborghini', 'Maserati',
      'Bentley', 'MINI', 'Saab',
      'Opel', 'Citroen', 'Infiniti', 'Acura',
      'AMC', 'Pontiac', 'Oldsmobile', 'Plymouth', 'Daihatsu', 'Isuzu',
      'Seat', 'Dacia', 'Lancia', 'Rover', 'MG',
    ];
    // Check longer names first
    const sorted = [...latinBrands].sort((a, b) => b.length - a.length);
    for (const brand of sorted) {
      if (lowerMessage.includes(brand.toLowerCase())) {
        preferences.marka = brand;
        break;
      }
    }
  }

  // 2. Body type detection (with Cyrillic declension support)
  for (const [keyword, bodyType] of BODY_TYPE_KEYWORDS.entries()) {
    if (containsCyrillicPhrase(lowerMessage, keyword)) {
      preferences.bodyType = bodyType;
      break;
    }
  }

  // 3. Year detection: 4-digit years in automotive range (1970-2030)
  const yearMatches = message.match(/\b(19[7-9]\d|20[0-3]\d)\b/g);
  if (yearMatches) {
    const years = yearMatches.map(Number).sort((a, b) => a - b);
    if (years.length >= 2) {
      preferences.yearFrom = years[0];
      preferences.yearTo = years[years.length - 1];
    } else {
      const year = years[0];
      const idx = message.indexOf(String(year));
      const beforeYear = message.substring(0, idx);
      if (/(?:от|с|после|новее|начиная)\s*$/i.test(beforeYear)) {
        preferences.yearFrom = year;
      } else if (/(?:до|раньше|старше)\s*$/i.test(beforeYear)) {
        preferences.yearTo = year;
      } else {
        preferences.yearFrom = year;
      }
    }
  }

  // 4. Transmission detection (with Cyrillic declension support)
  for (const [keyword, kpp] of KPP_KEYWORDS.entries()) {
    if (containsCyrillicPhrase(lowerMessage, keyword)) {
      preferences.kpp = kpp;
      break;
    }
  }

  // 5. Budget detection
  const budgetPatterns: Array<{ pattern: RegExp; multiplier: number }> = [
    { pattern: /(\d+(?:[.,]\d+)?)\s*млн/i, multiplier: 1_000_000 },
    { pattern: /(\d+)\s*(?:тыс|тысяч)/i, multiplier: 1_000 },
    { pattern: /бюджет[:\s]*(\d+)/i, multiplier: 1 },
    { pattern: /до\s*(\d{6,})\s*(?:руб|₽)?/i, multiplier: 1 },
  ];

  for (const { pattern, multiplier } of budgetPatterns) {
    const match = message.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      preferences.budget = Math.round(value * multiplier);
      break;
    }
  }

  return preferences;
}

/**
 * Merge two preference objects. New values override old, but
 * undefined/null/empty in newPrefs does NOT clear old values.
 */
export function mergePreferences(
  oldPrefs: UserPreferences,
  newPrefs: UserPreferences,
): UserPreferences {
  const merged: UserPreferences = { ...oldPrefs };

  for (const key of Object.keys(newPrefs) as Array<keyof UserPreferences>) {
    const newValue = newPrefs[key];
    if (newValue !== undefined && newValue !== null && newValue !== '') {
      (merged as any)[key] = newValue;
    }
  }

  return merged;
}
