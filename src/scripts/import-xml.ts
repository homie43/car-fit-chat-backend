/**
 * XML Import Script for Car Catalog
 * Usage: npm run import:xml
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { parseString } from 'xml2js';
import { promisify } from 'util';
import { prisma } from '../shared/utils/prisma';
import { logger } from '../shared/utils/logger';

const parseXml = promisify(parseString);

interface XmlModification {
  $: { name: string; id: string };
  mark_id: string[];
  folder_id: string[];
  modification_id: string[];
  configuration_id?: string[];
  tech_param_id?: string[];
  body_type?: string[];
  years?: string[];
  complectations?: string[];
}

interface XmlFolder {
  $: { name: string; id: string };
  model: string[];
  generation?: string[];
  modification: XmlModification[];
}

interface XmlMark {
  $?: { name?: string; id?: string };
  name?: string[];
  code?: string[];
  folder: XmlFolder[];
}

interface XmlCatalog {
  catalog: {
    mark: XmlMark[];
  };
}

/**
 * Extract text value from XML element (handles both string and object with attributes)
 * Examples:
 * - "TRANSFORMER" → "TRANSFORMER"
 * - { _: "B2", $: { id: "42245" } } → "B2"
 */
function getTextValue(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && '_' in value) return value._;
  return null;
}

/**
 * Parse years string to yearFrom and yearTo
 * Examples:
 * - "2019 - 2021" → { yearFrom: 2019, yearTo: 2021 }
 * - "2019 - по н.в." → { yearFrom: 2019, yearTo: null }
 */
function parseYears(yearsStr: string): {
  yearFrom: number | null;
  yearTo: number | null;
} {
  if (!yearsStr) {
    return { yearFrom: null, yearTo: null };
  }

  const parts = yearsStr.split('-').map((s) => s.trim());

  if (parts.length < 2) {
    return { yearFrom: null, yearTo: null };
  }

  const yearFrom = parseInt(parts[0]);
  const yearTo = parts[1] === 'по н.в.' ? null : parseInt(parts[1]);

  return {
    yearFrom: isNaN(yearFrom) ? null : yearFrom,
    yearTo: yearTo === null || isNaN(yearTo) ? null : yearTo,
  };
}

/**
 * Parse power and transmission from modification name
 * Example: "2.8d AT (177 л.с.) 4WD" → { power: "177 л.с.", kpp: "AT" }
 */
function parsePowerAndKpp(name: string): {
  powerText: string | null;
  kppText: string | null;
} {
  // Extract power (e.g., "177 л.с.")
  const powerMatch = name.match(/\((\d+)\s*л\.с\.\)/);
  const powerText = powerMatch ? `${powerMatch[1]} л.с.` : null;

  // Extract transmission (MT, AT, CVT, etc.)
  const kppMatch = name.match(/\b(MT|AT|CVT|AMT|ROBOT)\b/i);
  const kppText = kppMatch ? kppMatch[1].toUpperCase() : null;

  return { powerText, kppText };
}

async function importCatalog() {
  const startTime = Date.now();
  logger.info('Starting XML import...');

  try {
    // Read and parse XML file
    const xmlPath = process.env.XML_PATH || '/app/data/cars.xml';
    logger.info({ path: xmlPath }, 'Reading XML file');

    const xmlContent = readFileSync(xmlPath, 'utf-8');
    const parsedXml = (await parseXml(xmlContent)) as XmlCatalog;

    const marks = parsedXml.catalog.mark;
    logger.info({ count: marks.length }, 'Found marks in XML');

    let stats = {
      brands: 0,
      models: 0,
      variants: 0,
      complectations: 0,
      skipped: 0,
    };

    // Process each mark (brand)
    for (const mark of marks) {
      // Get brand name
      const brandName = mark.$?.name || (Array.isArray(mark.name) ? mark.name[0] : null);
      const brandCode = Array.isArray(mark.code) ? mark.code[0] : null;

      if (!brandName) {
        stats.skipped++;
        logger.warn({ mark }, 'Skipping mark without name');
        continue;
      }

      // Create or find brand
      let brand = await prisma.carBrand.findFirst({
        where: { name: brandName },
      });

      if (!brand) {
        brand = await prisma.carBrand.create({
          data: {
            name: brandName,
            code: brandCode,
          },
        });
        stats.brands++;
        logger.debug({ brandName, brandCode }, 'Created brand');
      }

      // Process folders (models)
      if (!mark.folder || !Array.isArray(mark.folder)) {
        continue;
      }

      for (const folder of mark.folder) {
        const modelRaw = Array.isArray(folder.model) ? folder.model[0] : null;
        const modelName = getTextValue(modelRaw);

        if (!modelName) {
          stats.skipped++;
          continue;
        }

        // Create or find model
        let model = await prisma.carModel.findFirst({
          where: {
            brandId: brand.id,
            name: modelName,
          },
        });

        if (!model) {
          model = await prisma.carModel.create({
            data: {
              brandId: brand.id,
              name: modelName,
              slug: modelName.toLowerCase().replace(/\s+/g, '-'),
            },
          });
          stats.models++;
          logger.debug({ brandName, modelName }, 'Created model');
        }

        // Process modifications (variants)
        if (!folder.modification || !Array.isArray(folder.modification)) {
          continue;
        }

        for (const modification of folder.modification) {
          const variantName = modification.$.name;

          if (!variantName) {
            stats.skipped++;
            continue;
          }

          // Parse years
          const yearsStr = Array.isArray(modification.years) ? modification.years[0] : '';
          const { yearFrom, yearTo } = parseYears(yearsStr);

          // Parse power and transmission
          const { powerText, kppText } = parsePowerAndKpp(variantName);

          // Get body type
          const bodyType = Array.isArray(modification.body_type)
            ? modification.body_type[0]
            : null;

          // Create variant metadata
          const meta = {
            configurationId: Array.isArray(modification.configuration_id)
              ? modification.configuration_id[0]
              : null,
            techParamId: Array.isArray(modification.tech_param_id)
              ? modification.tech_param_id[0]
              : null,
            modificationId: Array.isArray(modification.modification_id)
              ? modification.modification_id[0]
              : null,
          };

          // Check if variant already exists
          const existingVariant = await prisma.carVariant.findFirst({
            where: {
              modelId: model.id,
              name: variantName,
              yearFrom,
              yearTo,
            },
          });

          if (existingVariant) {
            // Skip if already exists
            continue;
          }

          // Create variant
          await prisma.carVariant.create({
            data: {
              modelId: model.id,
              name: variantName,
              bodyType,
              yearFrom,
              yearTo,
              powerText,
              kppText,
              meta,
            },
          });

          stats.variants++;

          if (stats.variants % 100 === 0) {
            logger.info({ ...stats }, 'Import progress');
          }
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(
      { ...stats, durationSec: duration },
      'XML import completed successfully'
    );
  } catch (error) {
    logger.error({ error }, 'XML import failed');
    throw error;
  }
}

// Run import
importCatalog()
  .catch((error) => {
    logger.error({ error }, 'Import script failed');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
