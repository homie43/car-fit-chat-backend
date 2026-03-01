import { describe, it, expect } from 'vitest';
import { parseMessageForPreferences, mergePreferences, extractDescriptionKeywords } from './message-parser';
import type { UserPreferences } from './ai.types';

describe('parseMessageForPreferences', () => {
  describe('brand detection', () => {
    it('should detect Cyrillic brand names', () => {
      expect(parseMessageForPreferences('Хочу тойоту').marka).toBe('Toyota');
      expect(parseMessageForPreferences('Посоветуй бмв').marka).toBe('BMW');
      expect(parseMessageForPreferences('Ищу мерседес').marka).toBe('Mercedes-Benz');
      expect(parseMessageForPreferences('Нравится ауди').marka).toBe('Audi');
    });

    it('should detect Latin brand names', () => {
      expect(parseMessageForPreferences('I want a Toyota').marka).toBe('Toyota');
      expect(parseMessageForPreferences('Looking for BMW').marka).toBe('BMW');
      expect(parseMessageForPreferences('Show me Hyundai').marka).toBe('Hyundai');
    });

    it('should handle multi-word Cyrillic brands', () => {
      expect(parseMessageForPreferences('Хочу ленд ровер').marka).toBe('Land Rover');
      expect(parseMessageForPreferences('альфа ромео подойдет').marka).toBe('Alfa Romeo');
      expect(parseMessageForPreferences('астон мартин — мечта').marka).toBe('Aston Martin');
    });

    it('should handle multi-word Latin brands', () => {
      expect(parseMessageForPreferences('I like Land Rover').marka).toBe('Land Rover');
      expect(parseMessageForPreferences('Alfa Romeo is nice').marka).toBe('Alfa Romeo');
    });

    it('should return undefined marka when no brand found', () => {
      expect(parseMessageForPreferences('хочу машину').marka).toBeUndefined();
      expect(parseMessageForPreferences('посоветуй что-нибудь').marka).toBeUndefined();
    });
  });

  describe('body type detection', () => {
    it('should detect Russian body type keywords and map to DB values', () => {
      expect(parseMessageForPreferences('Хочу седан').bodyType).toBe('Седан');
      expect(parseMessageForPreferences('Нужен кроссовер').bodyType).toBe('Внедорожник');
      expect(parseMessageForPreferences('Ищу внедорожник').bodyType).toBe('Внедорожник');
      expect(parseMessageForPreferences('Подбери универсал').bodyType).toBe('Универсал');
      expect(parseMessageForPreferences('Хочу минивэн').bodyType).toBe('Минивэн');
      expect(parseMessageForPreferences('Нравится купе').bodyType).toBe('Купе');
    });

    it('should detect English body types and map to DB values', () => {
      expect(parseMessageForPreferences('I want an SUV').bodyType).toBe('Внедорожник');
      expect(parseMessageForPreferences('Looking for a sedan').bodyType).toBe('Седан');
    });

    it('should return undefined for no body type', () => {
      expect(parseMessageForPreferences('хочу машину').bodyType).toBeUndefined();
    });
  });

  describe('year detection', () => {
    it('should detect a single year as yearFrom', () => {
      const prefs = parseMessageForPreferences('Камри 2020');
      expect(prefs.yearFrom).toBe(2020);
      expect(prefs.yearTo).toBeUndefined();
    });

    it('should detect year range', () => {
      const prefs = parseMessageForPreferences('от 2018 до 2022');
      expect(prefs.yearFrom).toBe(2018);
      expect(prefs.yearTo).toBe(2022);
    });

    it('should detect "от YEAR" as yearFrom', () => {
      const prefs = parseMessageForPreferences('от 2018 года');
      expect(prefs.yearFrom).toBe(2018);
      expect(prefs.yearTo).toBeUndefined();
    });

    it('should detect "до YEAR" as yearTo', () => {
      const prefs = parseMessageForPreferences('до 2020 года');
      expect(prefs.yearTo).toBe(2020);
      expect(prefs.yearFrom).toBeUndefined();
    });

    it('should detect "после YEAR" as yearFrom', () => {
      const prefs = parseMessageForPreferences('после 2019');
      expect(prefs.yearFrom).toBe(2019);
    });

    it('should not match non-automotive year numbers', () => {
      const prefs = parseMessageForPreferences('бюджет 1500 тысяч');
      expect(prefs.yearFrom).toBeUndefined();
      expect(prefs.yearTo).toBeUndefined();
    });

    it('should not match years outside 1970-2030 range', () => {
      const prefs = parseMessageForPreferences('в 1960 году');
      expect(prefs.yearFrom).toBeUndefined();
    });
  });

  describe('transmission detection', () => {
    it('should detect Russian transmission keywords', () => {
      expect(parseMessageForPreferences('хочу на автомате').kpp).toBe('AT');
      expect(parseMessageForPreferences('только механика').kpp).toBe('MT');
      expect(parseMessageForPreferences('с вариатором').kpp).toBe('CVT');
      expect(parseMessageForPreferences('на роботе').kpp).toBe('Robot');
    });

    it('should detect abbreviations', () => {
      expect(parseMessageForPreferences('нужна акпп').kpp).toBe('AT');
      expect(parseMessageForPreferences('нужна мкпп').kpp).toBe('MT');
    });

    it('should detect English transmission keywords', () => {
      expect(parseMessageForPreferences('automatic transmission').kpp).toBe('AT');
      expect(parseMessageForPreferences('manual gearbox').kpp).toBe('MT');
    });
  });

  describe('budget detection', () => {
    it('should detect "млн" budget format', () => {
      expect(parseMessageForPreferences('бюджет 2.5 млн').budget).toBe(2_500_000);
      expect(parseMessageForPreferences('бюджет 1,5 млн').budget).toBe(1_500_000);
      expect(parseMessageForPreferences('3 млн рублей').budget).toBe(3_000_000);
    });

    it('should detect "тыс" budget format', () => {
      expect(parseMessageForPreferences('до 800 тысяч').budget).toBe(800_000);
      expect(parseMessageForPreferences('500 тыс руб').budget).toBe(500_000);
    });

    it('should detect plain number budget', () => {
      expect(parseMessageForPreferences('бюджет 1500000').budget).toBe(1_500_000);
      expect(parseMessageForPreferences('бюджет: 2000000').budget).toBe(2_000_000);
    });

    it('should return undefined for no budget', () => {
      expect(parseMessageForPreferences('хочу машину').budget).toBeUndefined();
    });
  });

  describe('combined extraction', () => {
    it('should extract multiple preferences from one message', () => {
      const prefs = parseMessageForPreferences(
        'Хочу тойоту седан 2020 на автомате бюджет 2 млн',
      );
      expect(prefs.marka).toBe('Toyota');
      expect(prefs.bodyType).toBe('Седан');
      expect(prefs.yearFrom).toBe(2020);
      expect(prefs.kpp).toBe('AT');
      expect(prefs.budget).toBe(2_000_000);
    });

    it('should extract brand + body type from simple request', () => {
      const prefs = parseMessageForPreferences('Ищу кроссовер Hyundai');
      expect(prefs.marka).toBe('Hyundai');
      expect(prefs.bodyType).toBe('Внедорожник');
    });

    it('should extract from Russian casual message', () => {
      const prefs = parseMessageForPreferences(
        'Посоветуй бмв универсал на механике от 2018',
      );
      expect(prefs.marka).toBe('BMW');
      expect(prefs.bodyType).toBe('Универсал');
      expect(prefs.kpp).toBe('MT');
      expect(prefs.yearFrom).toBe(2018);
    });
  });
});

describe('extractDescriptionKeywords', () => {
  it('should extract content keywords from safety award query', () => {
    const keywords = extractDescriptionKeywords(
      'А что знаешь про Машину, которая В 1983 году получила награду за лучшую безопасность в своем классе?',
    );
    expect(keywords).toContain('награду');
    expect(keywords).toContain('безопасность');
    // Stop words should be filtered out
    expect(keywords).not.toContain('которая');
    expect(keywords).not.toContain('машину');
    expect(keywords).not.toContain('знаешь');
    expect(keywords).not.toContain('году');
    expect(keywords).not.toContain('1983');
  });

  it('should filter out brand names', () => {
    const keywords = extractDescriptionKeywords('Расскажи про тойоту с полным приводом');
    expect(keywords).not.toContain('тойоту');
    expect(keywords).not.toContain('тойота');
    expect(keywords).toContain('полным');
    expect(keywords).toContain('приводом');
  });

  it('should filter out body type keywords', () => {
    const keywords = extractDescriptionKeywords('Ищу кроссовер с панорамной крышей');
    expect(keywords).not.toContain('кроссовер');
    expect(keywords).toContain('панорамной');
    expect(keywords).toContain('крышей');
  });

  it('should return empty array for simple preference queries', () => {
    const keywords = extractDescriptionKeywords('Хочу тойоту седан 2020');
    expect(keywords).toHaveLength(0);
  });

  it('should return max 5 keywords', () => {
    const keywords = extractDescriptionKeywords(
      'надежный экономичный просторный комфортный динамичный безопасный мощный',
    );
    expect(keywords.length).toBeLessThanOrEqual(5);
  });

  it('should handle English keywords', () => {
    const keywords = extractDescriptionKeywords('car with turbo engine and leather interior');
    expect(keywords).toContain('turbo');
    expect(keywords).toContain('engine');
    expect(keywords).toContain('leather');
    expect(keywords).toContain('interior');
  });

  it('should filter short words', () => {
    const keywords = extractDescriptionKeywords('я хочу это авто за 2 млн');
    // All words are either < 4 chars or stop words
    expect(keywords).toHaveLength(0);
  });
});

describe('mergePreferences', () => {
  it('should merge new preferences over old', () => {
    const old: UserPreferences = { marka: 'Toyota', kpp: 'AT' };
    const newer: UserPreferences = { marka: 'BMW', yearFrom: 2020 };
    const merged = mergePreferences(old, newer);

    expect(merged.marka).toBe('BMW');
    expect(merged.kpp).toBe('AT');
    expect(merged.yearFrom).toBe(2020);
  });

  it('should not clear old values with undefined new values', () => {
    const old: UserPreferences = { marka: 'Toyota', kpp: 'AT', yearFrom: 2018 };
    const newer: UserPreferences = { yearFrom: 2020 };
    const merged = mergePreferences(old, newer);

    expect(merged.marka).toBe('Toyota');
    expect(merged.kpp).toBe('AT');
    expect(merged.yearFrom).toBe(2020);
  });

  it('should handle empty old preferences', () => {
    const old: UserPreferences = {};
    const newer: UserPreferences = { marka: 'BMW', kpp: 'MT' };
    const merged = mergePreferences(old, newer);

    expect(merged.marka).toBe('BMW');
    expect(merged.kpp).toBe('MT');
  });

  it('should handle empty new preferences', () => {
    const old: UserPreferences = { marka: 'Toyota', kpp: 'AT' };
    const newer: UserPreferences = {};
    const merged = mergePreferences(old, newer);

    expect(merged.marka).toBe('Toyota');
    expect(merged.kpp).toBe('AT');
  });

  it('should not overwrite with empty string', () => {
    const old: UserPreferences = { marka: 'Toyota' };
    const newer: UserPreferences = { marka: '' as any };
    const merged = mergePreferences(old, newer);

    expect(merged.marka).toBe('Toyota');
  });

  it('should accumulate preferences across multiple merges', () => {
    let prefs: UserPreferences = {};
    prefs = mergePreferences(prefs, { marka: 'Toyota' });
    prefs = mergePreferences(prefs, { bodyType: 'Седан' });
    prefs = mergePreferences(prefs, { kpp: 'AT', yearFrom: 2020 });

    expect(prefs).toEqual({
      marka: 'Toyota',
      bodyType: 'Седан',
      kpp: 'AT',
      yearFrom: 2020,
    });
  });
});
