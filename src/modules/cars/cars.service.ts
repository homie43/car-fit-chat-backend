import { prisma } from '@/shared/utils/prisma';
import { logger } from '@/shared/utils/logger';
import type { SearchResultForContext } from '@/modules/ai/ai.types';
import { normalizeBrandName } from '@/modules/ai/brand-aliases';

/**
 * Map English bodyType values (from LLM prompts) to Russian DB values.
 * DB stores: "Седан", "Внедорожник 5 дв.", "Хэтчбек 5 дв.", etc.
 * Search uses `contains` + insensitive, so Russian substrings match.
 */
const BODY_TYPE_EN_TO_DB: Record<string, string> = {
  sedan: 'Седан',
  hatchback: 'Хэтчбек',
  suv: 'Внедорожник',
  coupe: 'Купе',
  wagon: 'Универсал',
  minivan: 'Минивэн',
  pickup: 'Пикап',
  cabriolet: 'Кабриолет',
  liftback: 'Лифтбек',
};

function normalizeBodyType(bodyType: string): string {
  return BODY_TYPE_EN_TO_DB[bodyType.toLowerCase()] || bodyType;
}

export interface SearchCarsParams {
  marka?: string; // brand name or code
  model?: string; // model name
  yearFrom?: number;
  yearTo?: number;
  power?: string; // e.g., "177 л.с."
  kpp?: string; // e.g., "AT", "MT"
  bodyType?: string;
  descriptionKeywords?: string[]; // keywords to search in description text
  limit?: number;
  offset?: number;
}

export class CarsService {
  /**
   * Get all brands
   */
  async getBrands() {
    const brands = await prisma.carBrand.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        _count: {
          select: { models: true },
        },
      },
    });

    return brands;
  }

  /**
   * Get models by brand
   */
  async getModelsByBrand(brandIdOrCode: string) {
    // Find brand by ID or code
    const brand = await prisma.carBrand.findFirst({
      where: {
        OR: [{ id: brandIdOrCode }, { code: brandIdOrCode }, { name: brandIdOrCode }],
      },
    });

    if (!brand) {
      return [];
    }

    const models = await prisma.carModel.findMany({
      where: { brandId: brand.id },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: {
          select: { variants: true },
        },
      },
    });

    return models;
  }

  /**
   * Search cars with flexible filters
   */
  async searchCars(params: SearchCarsParams) {
    const {
      marka,
      model,
      yearFrom,
      yearTo,
      power,
      kpp,
      bodyType,
      limit = 50,
      offset = 0,
    } = params;

    logger.debug({ params }, 'Searching cars');

    // Build where clause
    const where: any = {};

    // Filter by brand (name or code)
    if (marka) {
      where.model = {
        brand: {
          OR: [
            { name: { contains: marka, mode: 'insensitive' } },
            { code: { contains: marka, mode: 'insensitive' } },
          ],
        },
      };
    }

    // Filter by model name
    if (model) {
      if (!where.model) {
        where.model = {};
      }
      where.model.name = { contains: model, mode: 'insensitive' };
    }

    // Filter by year range
    if (yearFrom || yearTo) {
      where.AND = [];

      if (yearFrom) {
        where.AND.push({
          OR: [{ yearTo: { gte: yearFrom } }, { yearTo: null }],
        });
      }

      if (yearTo) {
        where.AND.push({
          yearFrom: { lte: yearTo },
        });
      }
    }

    // Filter by power (simple text match)
    if (power) {
      where.powerText = { contains: power, mode: 'insensitive' };
    }

    // Filter by transmission type
    if (kpp) {
      where.kppText = { contains: kpp, mode: 'insensitive' };
    }

    // Filter by body type
    if (bodyType) {
      where.bodyType = { contains: bodyType, mode: 'insensitive' };
    }

    // Execute query
    const variants = await prisma.carVariant.findMany({
      where,
      orderBy: [{ model: { brand: { name: 'asc' } } }, { model: { name: 'asc' } }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        name: true,
        bodyType: true,
        yearFrom: true,
        yearTo: true,
        powerText: true,
        kppText: true,
        model: {
          select: {
            id: true,
            name: true,
            brand: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
    });

    // Transform to grouped by model format
    const groupedResults = this.groupVariantsByModel(variants);

    logger.debug({ count: groupedResults.length }, 'Search results');

    return groupedResults;
  }

  /**
   * Group variants by model for cleaner response
   */
  private groupVariantsByModel(variants: any[]) {
    const modelsMap = new Map<string, any>();

    for (const variant of variants) {
      const modelId = variant.model.id;

      if (!modelsMap.has(modelId)) {
        modelsMap.set(modelId, {
          brand: variant.model.brand,
          model: {
            id: variant.model.id,
            name: variant.model.name,
          },
          yearFrom: variant.yearFrom,
          yearTo: variant.yearTo,
          variants: [],
        });
      }

      const modelData = modelsMap.get(modelId);

      // Update year range (expand to include all variants)
      if (
        variant.yearFrom &&
        (!modelData.yearFrom || variant.yearFrom < modelData.yearFrom)
      ) {
        modelData.yearFrom = variant.yearFrom;
      }

      if (
        variant.yearTo &&
        (!modelData.yearTo || variant.yearTo > modelData.yearTo)
      ) {
        modelData.yearTo = variant.yearTo;
      }

      // Add variant
      modelData.variants.push({
        id: variant.id,
        name: variant.name,
        bodyType: variant.bodyType,
        yearFrom: variant.yearFrom,
        yearTo: variant.yearTo,
        powerText: variant.powerText,
        kppText: variant.kppText,
      });
    }

    return Array.from(modelsMap.values());
  }

  /**
   * Get variant by ID with all details
   */
  async getVariantById(id: string) {
    const variant = await prisma.carVariant.findUnique({
      where: { id },
      include: {
        model: {
          include: {
            brand: true,
          },
        },
      },
    });

    return variant;
  }

  /**
   * Search cars for RAG context
   * Returns only cars WITH descriptions, formatted for LLM prompt
   */
  async searchCarsForRAG(params: SearchCarsParams): Promise<SearchResultForContext[]> {
    const {
      marka,
      model,
      yearFrom,
      yearTo,
      power,
      kpp,
      bodyType,
      descriptionKeywords,
      limit = 10, // Default limit for RAG context
      offset = 0,
    } = params;

    logger.debug({ params }, 'Searching cars for RAG');

    // Normalize brand name (Cyrillic -> Latin)
    const normalizedMarka = marka ? normalizeBrandName(marka) : undefined;

    // Build structural where clause
    const where: any = {};

    // Filter by brand (name or code)
    if (normalizedMarka) {
      where.model = {
        brand: {
          OR: [
            { name: { contains: normalizedMarka, mode: 'insensitive' } },
            { code: { contains: normalizedMarka, mode: 'insensitive' } },
          ],
        },
      };
    }

    // Filter by model name
    if (model) {
      if (!where.model) {
        where.model = {};
      }
      where.model.name = { contains: model, mode: 'insensitive' };
    }

    // Filter by year range
    if (yearFrom || yearTo) {
      where.AND = [];

      if (yearFrom) {
        where.AND.push({
          OR: [{ yearTo: { gte: yearFrom } }, { yearTo: null }],
        });
      }

      if (yearTo) {
        where.AND.push({
          yearFrom: { lte: yearTo },
        });
      }
    }

    // Filter by power (simple text match)
    if (power) {
      where.powerText = { contains: power, mode: 'insensitive' };
    }

    // Filter by transmission type
    if (kpp) {
      where.kppText = { contains: kpp, mode: 'insensitive' };
    }

    // Filter by body type (normalize English -> Russian DB values)
    if (bodyType) {
      const normalizedBodyType = normalizeBodyType(bodyType);
      where.bodyType = { contains: normalizedBodyType, mode: 'insensitive' };
    }

    const selectFields = {
      name: true,
      bodyType: true,
      yearFrom: true,
      yearTo: true,
      powerText: true,
      kppText: true,
      description: true,
      model: {
        select: {
          name: true,
          brand: {
            select: {
              name: true,
            },
          },
        },
      },
      complectations: {
        select: {
          complectation: {
            select: { name: true },
          },
        },
      },
    };

    const toResult = (variant: any): SearchResultForContext => ({
      brand: variant.model.brand.name,
      model: variant.model.name,
      variant: variant.name,
      description: variant.description,
      yearFrom: variant.yearFrom,
      yearTo: variant.yearTo,
      powerText: variant.powerText,
      kppText: variant.kppText,
      bodyType: variant.bodyType,
      complectations: variant.complectations?.length
        ? variant.complectations.map((c: any) => c.complectation.name)
        : undefined,
    });

    // === Two-pass search ===
    // Pass 1: Description keyword search (if keywords provided)
    // Finds variants where description contains any of the keywords
    let keywordResults: SearchResultForContext[] = [];

    if (descriptionKeywords && descriptionKeywords.length > 0) {
      const keywordWhere = {
        ...JSON.parse(JSON.stringify(where)), // deep clone structural filters
        AND: [
          ...(where.AND || []),
          {
            description: { not: null },
          },
          {
            OR: descriptionKeywords.map((kw) => ({
              description: { contains: kw, mode: 'insensitive' },
            })),
          },
        ],
      };

      const keywordVariants = await prisma.carVariant.findMany({
        where: keywordWhere,
        orderBy: [{ model: { brand: { name: 'asc' } } }, { model: { name: 'asc' } }],
        take: limit,
        skip: offset,
        select: selectFields,
      });

      keywordResults = keywordVariants.map(toResult);
      logger.debug(
        { count: keywordResults.length, keywords: descriptionKeywords },
        'RAG description keyword search results',
      );
    }

    // Pass 2: Structural search (existing behavior)
    const fetchLimit = limit * 2;
    const variants = await prisma.carVariant.findMany({
      where,
      orderBy: [{ model: { brand: { name: 'asc' } } }, { model: { name: 'asc' } }],
      take: fetchLimit,
      skip: offset,
      select: selectFields,
    });

    let structuralResults: SearchResultForContext[] = variants.map(toResult);

    // Prioritize variants WITH descriptions
    structuralResults.sort((a, b) => {
      const aHas = a.description ? 0 : 1;
      const bHas = b.description ? 0 : 1;
      return aHas - bHas;
    });

    // === Merge: keyword results first, then unique structural results ===
    const seen = new Set<string>();
    const results: SearchResultForContext[] = [];

    // Add keyword-matched results first (most relevant)
    for (const r of keywordResults) {
      const key = `${r.brand}|${r.model}|${r.variant}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(r);
      }
    }

    // Fill remaining slots with structural results
    for (const r of structuralResults) {
      if (results.length >= limit) break;
      const key = `${r.brand}|${r.model}|${r.variant}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(r);
      }
    }

    logger.debug({ count: results.length }, 'RAG search results');

    return results;
  }
}

// Export singleton instance
export const carsService = new CarsService();
