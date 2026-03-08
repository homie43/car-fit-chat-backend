/**
 * Integration tests for RAG pipeline.
 * These tests hit the REAL database via Prisma.
 * Run: npm run test:integration
 */

import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '@/shared/utils/prisma';
import { carsService } from '@/modules/cars/cars.service';
import { parseMessageForPreferences, extractDescriptionKeywords } from '@/modules/ai/message-parser';
import { AIService } from '@/modules/ai/ai.service';

const aiService = new AIService();
const svc = () => aiService as any;

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Helper: run full RAG pipeline for a user message
 * (parse → search → format context)
 */
async function runRAGPipeline(message: string) {
  const prefs = parseMessageForPreferences(message);
  const keywords = extractDescriptionKeywords(message);

  const hasEnough = Boolean(
    prefs.marka || prefs.model || prefs.kpp || prefs.yearFrom || prefs.bodyType,
  );

  if (!hasEnough) {
    return { prefs, keywords, results: [], context: '', hasEnough: false };
  }

  const results = await carsService.searchCarsForRAG({
    marka: prefs.marka,
    model: prefs.model,
    yearFrom: prefs.yearFrom,
    yearTo: prefs.yearTo,
    kpp: prefs.kpp,
    bodyType: prefs.bodyType,
    descriptionKeywords: keywords.length > 0 ? keywords : undefined,
    limit: 10,
  });

  const context = results.length > 0
    ? svc().formatSearchResultsForContext(results)
    : '';

  return { prefs, keywords, results, context, hasEnough: true };
}

describe('RAG Pipeline Integration (real DB)', () => {
  describe('model name targeting', () => {
    it('"Hyundai Tucson" should return TUCSON variants, not random Hyundai', async () => {
      const { prefs, results } = await runRAGPipeline('Ищу Hyundai Tucson');

      expect(prefs.marka).toBe('Hyundai');
      expect(prefs.model).toBe('TUCSON');
      expect(results.length).toBeGreaterThan(0);

      const hasTucson = results.some((r) =>
        r.model.toUpperCase().includes('TUCSON'),
      );
      expect(hasTucson).toBe(true);
    });

    it('"Volkswagen Golf хэтчбек" should return GOLF, not BEETLE', async () => {
      const { prefs, results } = await runRAGPipeline('Volkswagen Golf хэтчбек');

      expect(prefs.marka).toBe('Volkswagen');
      expect(prefs.model).toBe('GOLF');
      expect(results.length).toBeGreaterThan(0);

      const hasGolf = results.some((r) =>
        r.model.toUpperCase().includes('GOLF'),
      );
      expect(hasGolf).toBe(true);
    });

    it('"BMW X5 кроссовер" should return X5 variants', async () => {
      const { prefs, results } = await runRAGPipeline('BMW X5 кроссовер');

      expect(prefs.marka).toBe('BMW');
      expect(prefs.model).toBe('X5');
      expect(results.length).toBeGreaterThan(0);

      const hasX5 = results.some((r) =>
        r.model.toUpperCase().includes('X5'),
      );
      expect(hasX5).toBe(true);
    });

    it('"тойота камри седан" should return CAMRY variants', async () => {
      const { prefs, results } = await runRAGPipeline('тойота камри седан');

      expect(prefs.marka).toBe('Toyota');
      expect(prefs.model).toBe('CAMRY');
      expect(prefs.bodyType).toBe('Седан');
      expect(results.length).toBeGreaterThan(0);

      const hasCamry = results.some((r) =>
        r.model.toUpperCase().includes('CAMRY'),
      );
      expect(hasCamry).toBe(true);
    });

    it('"Toyota Land Cruiser" should return LAND_CRUISER', async () => {
      const { prefs, results } = await runRAGPipeline('Toyota Land Cruiser');

      expect(prefs.marka).toBe('Toyota');
      expect(prefs.model).toBe('LAND_CRUISER');
      expect(results.length).toBeGreaterThan(0);

      const hasLC = results.some((r) =>
        r.model.toUpperCase().includes('LAND_CRUISER'),
      );
      expect(hasLC).toBe(true);
    });
  });

  describe('niche brands with descriptions', () => {
    it('"AC Cobra" should trigger search and find results', async () => {
      const { prefs, results, hasEnough } = await runRAGPipeline('Расскажи про AC Cobra');

      expect(prefs.marka).toBe('AC');
      expect(hasEnough).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      const hasCobra = results.some((r) =>
        r.model.toUpperCase().includes('COBRA'),
      );
      expect(hasCobra).toBe(true);
    });

    it('"Abarth" should trigger search', async () => {
      const { prefs, hasEnough, results } = await runRAGPipeline('Хочу Abarth');

      expect(prefs.marka).toBe('Abarth');
      expect(hasEnough).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('filter accuracy', () => {
    it('"Кроссовер от 2018 на автомате" should match bodyType and kpp', async () => {
      const { prefs, results } = await runRAGPipeline('Кроссовер от 2018 на автомате');

      expect(prefs.bodyType).toBe('Внедорожник');
      expect(prefs.yearFrom).toBe(2018);
      expect(prefs.kpp).toBe('AT');
      expect(results.length).toBeGreaterThan(0);
    });

    it('"Hyundai Tucson 2020 на автомате" full pipeline should work', async () => {
      const { prefs, results, context } = await runRAGPipeline(
        'Hyundai Tucson 2020 на автомате',
      );

      expect(prefs.marka).toBe('Hyundai');
      expect(prefs.model).toBe('TUCSON');
      expect(prefs.yearFrom).toBe(2020);
      expect(prefs.kpp).toBe('AT');
      expect(results.length).toBeGreaterThan(0);
      expect(context).toContain('РЕЗУЛЬТАТЫ ПОИСКА ПО БАЗЕ ДАННЫХ');
    });
  });

  describe('description coverage for popular brands', () => {
    const popularBrands = ['Toyota', 'BMW', 'Hyundai', 'Kia', 'Volkswagen'];

    for (const brand of popularBrands) {
      it(`"${brand}" search should include variants with descriptions`, async () => {
        const { results } = await runRAGPipeline(brand);

        expect(results.length).toBeGreaterThan(0);

        const withDesc = results.filter((r) => r.description);
        expect(withDesc.length).toBeGreaterThan(0);
      });
    }
  });

  describe('context formatting', () => {
    it('should produce non-empty context for popular brand query', async () => {
      const { context, results } = await runRAGPipeline('Toyota Camry');

      expect(results.length).toBeGreaterThan(0);
      expect(context).toContain('РЕЗУЛЬТАТЫ ПОИСКА ПО БАЗЕ ДАННЫХ');
      expect(context).toContain('Toyota');
      expect(context).toContain('CAMRY');
      expect(context).toContain('ВАЖНО: Используй ТОЛЬКО эти автомобили');
    });

    it('should include description text in context when available', async () => {
      const { context, results } = await runRAGPipeline('Toyota');

      const withDesc = results.find((r) => r.description);
      if (withDesc) {
        expect(context).toContain('Описание:');
      }
    });
  });

  describe('edge cases', () => {
    it('should NOT search when no preferences extracted', async () => {
      const { hasEnough } = await runRAGPipeline('Привет, как дела?');
      expect(hasEnough).toBe(false);
    });

    it('should handle brand with no cars in DB gracefully', async () => {
      const { results } = await runRAGPipeline('Bugatti Chiron');
      // Bugatti may not be in DB — should return empty results, not crash
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
