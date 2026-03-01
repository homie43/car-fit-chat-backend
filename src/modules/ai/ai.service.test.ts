import { describe, it, expect } from 'vitest';
import { AIService } from './ai.service';
import type { UserPreferences, SearchResultForContext } from './ai.types';

// Access private methods for testing via type assertion
const service = new AIService();
const svc = () => service as any;

describe('AIService', () => {
  describe('hasEnoughPreferencesForSearch', () => {
    it('should return true with just marka', () => {
      const prefs: UserPreferences = { marka: 'Toyota' };
      expect(svc().hasEnoughPreferencesForSearch(prefs)).toBe(true);
    });

    it('should return true with just bodyType', () => {
      const prefs: UserPreferences = { bodyType: 'Седан' };
      expect(svc().hasEnoughPreferencesForSearch(prefs)).toBe(true);
    });

    it('should return true with just yearFrom', () => {
      const prefs: UserPreferences = { yearFrom: 2020 };
      expect(svc().hasEnoughPreferencesForSearch(prefs)).toBe(true);
    });

    it('should return true with multiple key fields', () => {
      const prefs: UserPreferences = { marka: 'BMW', bodyType: 'Седан', kpp: 'AT' };
      expect(svc().hasEnoughPreferencesForSearch(prefs)).toBe(true);
    });

    it('should return false with 0 key fields', () => {
      const prefs: UserPreferences = { color: 'red', budget: 1000000 };
      expect(svc().hasEnoughPreferencesForSearch(prefs)).toBe(false);
    });

    it('should return false with empty preferences', () => {
      expect(svc().hasEnoughPreferencesForSearch({})).toBe(false);
    });
  });

  describe('extractPreferences', () => {
    it('should parse valid PREFERENCES block', () => {
      const text =
        'Some text\n[PREFERENCES]\n{"marka":"Toyota","kpp":"AT"}\n[/PREFERENCES]';
      const prefs = svc().extractPreferences(text);
      expect(prefs.marka).toBe('Toyota');
      expect(prefs.kpp).toBe('AT');
    });

    it('should return empty object when no PREFERENCES block', () => {
      const prefs = svc().extractPreferences('Just a normal response');
      expect(Object.keys(prefs)).toHaveLength(0);
    });

    it('should handle malformed JSON gracefully', () => {
      const text = '[PREFERENCES]\n{invalid json}\n[/PREFERENCES]';
      const prefs = svc().extractPreferences(text);
      expect(Object.keys(prefs)).toHaveLength(0);
    });

    it('should clean and validate preference types', () => {
      const text =
        '[PREFERENCES]\n{"marka":"BMW","yearFrom":2020,"yearTo":"not_a_number"}\n[/PREFERENCES]';
      const prefs = svc().extractPreferences(text);
      expect(prefs.marka).toBe('BMW');
      expect(prefs.yearFrom).toBe(2020);
      expect(prefs.yearTo).toBeUndefined();
    });

    it('should extract all valid fields', () => {
      const json = JSON.stringify({
        marka: 'Toyota',
        model: 'Camry',
        country: 'Japan',
        color: 'white',
        power: '181 л.с.',
        kpp: 'AT',
        yearFrom: 2018,
        yearTo: 2023,
        bodyType: 'sedan',
        budget: 2500000,
      });
      const text = `Response text\n[PREFERENCES]\n${json}\n[/PREFERENCES]`;
      const prefs = svc().extractPreferences(text);

      expect(prefs.marka).toBe('Toyota');
      expect(prefs.model).toBe('Camry');
      expect(prefs.country).toBe('Japan');
      expect(prefs.color).toBe('white');
      expect(prefs.power).toBe('181 л.с.');
      expect(prefs.kpp).toBe('AT');
      expect(prefs.yearFrom).toBe(2018);
      expect(prefs.yearTo).toBe(2023);
      expect(prefs.bodyType).toBe('sedan');
      expect(prefs.budget).toBe(2500000);
    });

    it('should ignore unknown fields', () => {
      const text =
        '[PREFERENCES]\n{"marka":"BMW","unknownField":"value"}\n[/PREFERENCES]';
      const prefs = svc().extractPreferences(text);
      expect(prefs.marka).toBe('BMW');
      expect((prefs as any).unknownField).toBeUndefined();
    });
  });

  describe('formatSearchResultsForContext', () => {
    it('should format results with descriptions', () => {
      const results: SearchResultForContext[] = [
        {
          brand: 'Toyota',
          model: 'Camry',
          variant: '2.5 AT (181 л.с.)',
          description: 'Reliable sedan for daily commute.',
          yearFrom: 2018,
          yearTo: 2023,
          powerText: '181 л.с.',
          kppText: 'AT',
          bodyType: 'sedan',
        },
      ];
      const context = svc().formatSearchResultsForContext(results);

      expect(context).toContain('РЕЗУЛЬТАТЫ ПОИСКА ПО БАЗЕ ДАННЫХ');
      expect(context).toContain('Найдено автомобилей: 1');
      expect(context).toContain('Toyota Camry');
      expect(context).toContain('2.5 AT (181 л.с.)');
      expect(context).toContain('2018-2023');
      expect(context).toContain('Описание: Reliable sedan');
    });

    it('should format results without descriptions', () => {
      const results: SearchResultForContext[] = [
        {
          brand: 'BMW',
          model: '3 Series',
          variant: '320i AT',
          description: null,
          yearFrom: 2019,
          yearTo: 2023,
          powerText: '184 л.с.',
          kppText: 'AT',
          bodyType: 'sedan',
        },
      ];
      const context = svc().formatSearchResultsForContext(results);

      expect(context).toContain('BMW 3 Series');
      expect(context).toContain('320i AT');
      expect(context).not.toContain('Описание:');
    });

    it('should return empty string for empty results', () => {
      expect(svc().formatSearchResultsForContext([])).toBe('');
    });

    it('should format multiple results', () => {
      const results: SearchResultForContext[] = [
        {
          brand: 'Toyota',
          model: 'Camry',
          variant: '2.5 AT',
          description: 'Sedan',
          yearFrom: 2020,
          yearTo: 2023,
          powerText: '181 л.с.',
          kppText: 'AT',
          bodyType: 'sedan',
        },
        {
          brand: 'Honda',
          model: 'Accord',
          variant: '2.0 CVT',
          description: null,
          yearFrom: 2019,
          yearTo: 2022,
          powerText: '150 л.с.',
          kppText: 'CVT',
          bodyType: 'sedan',
        },
      ];
      const context = svc().formatSearchResultsForContext(results);

      expect(context).toContain('Найдено автомобилей: 2');
      expect(context).toContain('1. Toyota Camry');
      expect(context).toContain('2. Honda Accord');
    });

    it('should format results with complectations', () => {
      const results: SearchResultForContext[] = [
        {
          brand: 'Lada',
          model: 'Vesta',
          variant: '1.6 MT (106 л.с.)',
          description: null,
          yearFrom: 2015,
          yearTo: null,
          powerText: '106 л.с.',
          kppText: 'MT',
          bodyType: 'Седан',
          complectations: ['Comfort', 'Luxe', 'Luxe Multimedia'],
        },
      ];
      const context = svc().formatSearchResultsForContext(results);

      expect(context).toContain('Lada Vesta');
      expect(context).toContain('Комплектации: Comfort, Luxe, Luxe Multimedia');
    });

    it('should not show complectations line when empty', () => {
      const results: SearchResultForContext[] = [
        {
          brand: 'BMW',
          model: '3 Series',
          variant: '320i AT',
          description: null,
          yearFrom: 2019,
          yearTo: 2023,
          powerText: '184 л.с.',
          kppText: 'AT',
          bodyType: 'sedan',
          complectations: [],
        },
      ];
      const context = svc().formatSearchResultsForContext(results);

      expect(context).not.toContain('Комплектации');
    });

    it('should handle missing year and body type', () => {
      const results: SearchResultForContext[] = [
        {
          brand: 'Test',
          model: 'Car',
          variant: '1.0',
          description: null,
          yearFrom: null,
          yearTo: null,
          powerText: null,
          kppText: null,
          bodyType: null,
        },
      ];
      const context = svc().formatSearchResultsForContext(results);

      expect(context).toContain('Test Car');
      expect(context).toContain('н/д');
    });
  });
});
