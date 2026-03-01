import { UserPreferences } from './ai.types';
import { BRAND_ALIASES } from './brand-aliases';

const CYRILLIC_VOWELS = 'аеёиоуыэюя';

// ============================================
// TOKENIZER
// ============================================

/**
 * Tokenize text into lowercase words.
 * Splits on any non-letter/non-digit character (including hyphens, punctuation).
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^а-яёa-z0-9]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// ============================================
// WORD FORM GENERATION (Russian declensions)
// ============================================

/**
 * Generate valid word forms for a Russian or Latin word.
 * Covers common noun declension patterns for matching user input.
 *
 * Rules:
 * - Ends in "а": feminine → stem + [у, е, ой, ы]
 * - Ends in "я": feminine soft → stem + [ю, е, ей, и]
 * - Ends in other vowel (е, о, у, и, э, ё): indeclinable (купе, рено, порше)
 * - Ends in consonant, length > 3: masculine → word + [а, у, е, ом, ы, ов]
 * - Ends in consonant, length ≤ 3: abbreviation, indeclinable (бмв, ваз)
 * - Latin words: exact match only
 */
function generateWordForms(word: string): string[] {
  const forms = new Set<string>();
  forms.add(word);

  // Latin words: exact match only
  if (/^[a-z0-9]+$/i.test(word)) {
    return [word];
  }

  const lastChar = word[word.length - 1];

  if (lastChar === 'а') {
    // Feminine: тойота → тойоту, тойоте, тойотой, тойоты
    const stem = word.slice(0, -1);
    forms.add(stem + 'у');
    forms.add(stem + 'е');
    forms.add(stem + 'ой');
    forms.add(stem + 'ы');
  } else if (lastChar === 'я') {
    // Feminine soft: статья → статью, статье, статьей, статьи
    const stem = word.slice(0, -1);
    forms.add(stem + 'ю');
    forms.add(stem + 'е');
    forms.add(stem + 'ей');
    forms.add(stem + 'и');
  } else if (CYRILLIC_VOWELS.includes(lastChar)) {
    // Other vowels (е, о, у, и, э, ё): indeclinable
    // купе → only "купе", рено → only "рено"
  } else if (/[а-яё]/.test(word)) {
    // Consonant-ending Cyrillic words
    if (word.length <= 3) {
      // Short abbreviations: бмв, ваз, газ — indeclinable
    } else {
      // Masculine: седан → седана, седану, седане, седаном, седаны, седанов
      forms.add(word + 'а');
      forms.add(word + 'у');
      forms.add(word + 'е');
      forms.add(word + 'ом');
      forms.add(word + 'ы');
      forms.add(word + 'ов');
    }
  }

  return Array.from(forms);
}

// ============================================
// KEYWORD DATA
// ============================================

/**
 * Body type mappings: keyword -> DB bodyType substring
 * DB stores Russian values: "Седан", "Внедорожник 5 дв.", "Хэтчбек 5 дв.", etc.
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
 * Latin brand names for direct matching.
 * Multi-word brands listed first for priority matching.
 */
const LATIN_BRANDS = [
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

// ============================================
// LOOKUP TABLES (built once at module load)
// ============================================

interface MultiWordPattern {
  wordSets: Set<string>[]; // Each set contains valid forms for one word position
  value: string;
}

// Cyrillic brand lookups
const singleWordBrandLookup = new Map<string, string>();
const multiWordBrandPatterns: MultiWordPattern[] = [];

// Body type and KPP lookups
const bodyTypeWordForms = new Map<string, string>();
const kppWordForms = new Map<string, string>();

// Latin brand lookups
const singleWordLatinBrandLookup = new Map<string, string>();
const multiWordLatinBrandPatterns: MultiWordPattern[] = [];

// All known word forms — for extractDescriptionKeywords filtering
const allKnownWordForms = new Set<string>();

function buildLookups() {
  // --- Cyrillic brand aliases ---
  // Sort by length descending so longer aliases get priority
  const sortedAliases = Array.from(BRAND_ALIASES.entries()).sort(
    (a, b) => b[0].length - a[0].length,
  );

  for (const [alias, latinName] of sortedAliases) {
    const parts = alias.split(/[\s\-]+/);
    if (parts.length === 1) {
      for (const form of generateWordForms(parts[0])) {
        if (!singleWordBrandLookup.has(form)) {
          singleWordBrandLookup.set(form, latinName);
        }
        allKnownWordForms.add(form);
      }
    } else {
      const wordSets = parts.map((part) => {
        const forms = generateWordForms(part);
        forms.forEach((f) => allKnownWordForms.add(f));
        return new Set(forms);
      });
      multiWordBrandPatterns.push({ wordSets, value: latinName });
    }
  }

  // --- Body type lookups ---
  for (const [keyword, bodyType] of BODY_TYPE_KEYWORDS.entries()) {
    for (const form of generateWordForms(keyword)) {
      if (!bodyTypeWordForms.has(form)) {
        bodyTypeWordForms.set(form, bodyType);
      }
      allKnownWordForms.add(form);
    }
  }

  // --- KPP lookups ---
  for (const [keyword, kpp] of KPP_KEYWORDS.entries()) {
    for (const form of generateWordForms(keyword)) {
      if (!kppWordForms.has(form)) {
        kppWordForms.set(form, kpp);
      }
      allKnownWordForms.add(form);
    }
  }

  // --- Latin brand lookups ---
  // Sort by length descending for priority (multi-word first)
  const sortedLatinBrands = [...LATIN_BRANDS].sort((a, b) => b.length - a.length);
  for (const brand of sortedLatinBrands) {
    const parts = brand.toLowerCase().split(/[\s\-]+/);
    if (parts.length === 1) {
      if (!singleWordLatinBrandLookup.has(parts[0])) {
        singleWordLatinBrandLookup.set(parts[0], brand);
      }
      allKnownWordForms.add(parts[0]);
    } else {
      const wordSets = parts.map((part) => {
        allKnownWordForms.add(part);
        return new Set([part]);
      });
      multiWordLatinBrandPatterns.push({ wordSets, value: brand });
    }
  }
}

buildLookups();

// ============================================
// MULTI-WORD PATTERN MATCHING
// ============================================

/**
 * Check if consecutive tokens match a multi-word pattern.
 * Each position's token must be in the corresponding wordSet.
 */
function matchMultiWordPattern(tokens: string[], pattern: MultiWordPattern): boolean {
  const patternLen = pattern.wordSets.length;
  for (let i = 0; i <= tokens.length - patternLen; i++) {
    let match = true;
    for (let j = 0; j < patternLen; j++) {
      if (!pattern.wordSets[j].has(tokens[i + j])) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

// ============================================
// MAIN PARSER
// ============================================

/**
 * Parse user message to extract car preferences using token-based matching.
 * Runs BEFORE LLM call so preferences are available for RAG search immediately.
 *
 * Uses word tokenization + pre-built lookup Maps instead of regex/substring matching.
 * This prevents false positives like "Купер" → "Купе" or "Оксфорд" → "Ford".
 */
export function parseMessageForPreferences(message: string): UserPreferences {
  const preferences: UserPreferences = {};
  const tokens = tokenize(message);

  // 1. Brand detection — Cyrillic multi-word first (longer patterns first)
  for (const pattern of multiWordBrandPatterns) {
    if (matchMultiWordPattern(tokens, pattern)) {
      preferences.marka = pattern.value;
      break;
    }
  }

  // Cyrillic single-word brands
  if (!preferences.marka) {
    for (const token of tokens) {
      const brand = singleWordBrandLookup.get(token);
      if (brand) {
        preferences.marka = brand;
        break;
      }
    }
  }

  // Latin multi-word brands
  if (!preferences.marka) {
    for (const pattern of multiWordLatinBrandPatterns) {
      if (matchMultiWordPattern(tokens, pattern)) {
        preferences.marka = pattern.value;
        break;
      }
    }
  }

  // Latin single-word brands
  if (!preferences.marka) {
    for (const token of tokens) {
      const brand = singleWordLatinBrandLookup.get(token);
      if (brand) {
        preferences.marka = brand;
        break;
      }
    }
  }

  // 2. Body type detection — token lookup
  for (const token of tokens) {
    const bodyType = bodyTypeWordForms.get(token);
    if (bodyType) {
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

  // 4. Transmission detection — token lookup
  for (const token of tokens) {
    const kpp = kppWordForms.get(token);
    if (kpp) {
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

// ============================================
// DESCRIPTION KEYWORD EXTRACTION
// ============================================

/**
 * Russian stop words — common words that don't carry meaning for description search.
 */
const STOP_WORDS = new Set([
  // Pronouns & particles
  'этот', 'этой', 'этом', 'этих', 'этого', 'этому',
  'свой', 'свою', 'своё', 'своя', 'своем', 'своей', 'своих', 'своим',
  'который', 'которая', 'которое', 'которую', 'которых', 'которой', 'которого', 'которым',
  'какой', 'какая', 'какое', 'какую', 'каких', 'какие',
  'такой', 'такая', 'такое', 'такие', 'таких',
  'весь', 'всех', 'всем', 'всего', 'всей',
  'один', 'одна', 'одно', 'одной', 'одного',
  'себя', 'себе', 'собой',
  'него', 'неё', 'нему', 'ними',
  // Verbs (common)
  'быть', 'было', 'была', 'были', 'будет', 'будут',
  'есть', 'нету', 'стал', 'стала', 'стали',
  'может', 'могу', 'можно', 'можешь',
  'знаешь', 'знаете', 'знаю',
  'хочу', 'хочешь', 'хотел', 'хотела',
  'нужен', 'нужна', 'нужно', 'нужны', 'надо',
  'ищу', 'ищем', 'ищешь',
  'подбери', 'подобрать', 'подберите',
  'посоветуй', 'посоветуйте', 'расскажи', 'расскажите',
  'покажи', 'покажите', 'скажи', 'скажите',
  'получил', 'получила', 'получило', 'получили',
  // Nouns (generic / automotive-context)
  'машина', 'машину', 'машины', 'машине', 'машиной',
  'автомобиль', 'автомобили', 'автомобиля', 'автомобилей', 'автомобилю',
  'авто', 'тачка', 'тачку',
  'марка', 'марку', 'марки',
  'модель', 'модели', 'моделей',
  'класс', 'класса', 'классе', 'классу',
  'года', 'году', 'годов', 'годы',
  // Adjectives (generic)
  'лучший', 'лучшая', 'лучшее', 'лучшую', 'лучших', 'лучшие', 'лучшем',
  'хороший', 'хорошая', 'хорошее', 'хороших', 'хорошие',
  'самый', 'самая', 'самое', 'самую', 'самых', 'самые',
  'новый', 'новая', 'новое', 'новую', 'новых', 'новые',
  // Prepositions & conjunctions (4+ chars that pass length filter)
  'если', 'либо', 'тоже', 'также', 'чтобы', 'потому', 'более', 'менее',
  'между', 'через', 'после', 'перед', 'около',
]);

/**
 * Extract keywords from user message for description text search.
 * Removes known patterns (brands, body types, KPP, years, budgets)
 * and stop words, returning content words that might match descriptions.
 */
export function extractDescriptionKeywords(message: string): string[] {
  const tokens = tokenize(message);

  const keywords: string[] = [];
  const seen = new Set<string>();

  for (const word of tokens) {
    // Skip short words (< 4 chars) — filters most prepositions/particles
    if (word.length < 4) continue;

    // Skip numbers (years are parsed separately)
    if (/^\d+$/.test(word)) continue;

    // Skip known patterns (brand names, body types, KPP) — pre-built lookup
    if (allKnownWordForms.has(word)) continue;

    // Skip stop words
    if (STOP_WORDS.has(word)) continue;

    // Skip duplicates
    if (seen.has(word)) continue;
    seen.add(word);

    keywords.push(word);
  }

  // Return max 5 keywords
  return keywords.slice(0, 5);
}

// ============================================
// PREFERENCE MERGING
// ============================================

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
