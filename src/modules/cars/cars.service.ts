import { prisma } from '@/shared/utils/prisma';
import { logger } from '@/shared/utils/logger';
import type { SearchResultForContext } from '@/modules/ai/ai.types';

export interface SearchCarsParams {
  marka?: string; // brand name or code
  model?: string; // model name
  yearFrom?: number;
  yearTo?: number;
  power?: string; // e.g., "177 л.с."
  kpp?: string; // e.g., "AT", "MT"
  bodyType?: string;
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
      limit = 10, // Default limit for RAG context
      offset = 0,
    } = params;

    logger.debug({ params }, 'Searching cars for RAG');

    // Build where clause
    const where: any = {
      // IMPORTANT: Only include cars WITH descriptions
      description: { not: null },
    };

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
      },
    });

    // Transform to SearchResultForContext format
    const results: SearchResultForContext[] = variants.map((variant) => ({
      brand: variant.model.brand.name,
      model: variant.model.name,
      variant: variant.name,
      description: variant.description,
      yearFrom: variant.yearFrom,
      yearTo: variant.yearTo,
      powerText: variant.powerText,
      kppText: variant.kppText,
      bodyType: variant.bodyType,
    }));

    logger.debug({ count: results.length }, 'RAG search results');

    return results;
  }
}

// Export singleton instance
export const carsService = new CarsService();
