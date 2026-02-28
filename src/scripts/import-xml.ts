/**
 * XML Import Script for Car Catalog (Batch version)
 * Uses createMany with skipDuplicates for fast bulk inserts
 * Usage: npm run import:xml
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { parseString } from 'xml2js';
import { promisify } from 'util';
import { prisma } from '../shared/utils/prisma';
import { logger } from '../shared/utils/logger';

const parseXml = promisify(parseString);

interface XmlComplectation {
  _: string;
  $: { id: string };
}

interface XmlModification {
  $: { name: string; id: string };
  mark_id: string[];
  folder_id: string[];
  modification_id: string[];
  configuration_id?: string[];
  tech_param_id?: string[];
  body_type?: string[];
  years?: string[];
  complectations?: Array<{ complectation?: XmlComplectation[] }>;
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

function getTextValue(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && '_' in value) return value._;
  return null;
}

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

function parsePowerAndKpp(name: string): {
  powerText: string | null;
  kppText: string | null;
} {
  const powerMatch = name.match(/\((\d+)\s*л\.с\.\)/);
  const powerText = powerMatch ? `${powerMatch[1]} л.с.` : null;

  const kppMatch = name.match(/\b(MT|AT|CVT|AMT|ROBOT)\b/i);
  const kppText = kppMatch ? kppMatch[1].toUpperCase() : null;

  return { powerText, kppText };
}

interface VariantData {
  brandName: string;
  modelName: string;
  name: string;
  bodyType: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  powerText: string | null;
  kppText: string | null;
  meta: object;
  complectations: Array<{ extId: string; name: string }>;
}

async function importCatalog() {
  const startTime = Date.now();
  logger.info('Starting batch XML import...');

  const xmlPath = process.env.XML_PATH || '/app/data/cars.xml';
  logger.info({ path: xmlPath }, 'Reading XML file');

  const xmlContent = readFileSync(xmlPath, 'utf-8');
  const parsedXml = (await parseXml(xmlContent)) as XmlCatalog;
  const marks = parsedXml.catalog.mark;

  // ─── Phase 1: Parse all XML data into memory ───
  const brandDataMap = new Map<string, string | null>(); // brandName → code
  const modelDataMap = new Map<string, string>(); // "brandName::modelName" → slug
  const variantDataList: VariantData[] = [];

  for (const mark of marks) {
    const brandName =
      mark.$?.name || (Array.isArray(mark.name) ? mark.name[0] : null);
    const brandCode = Array.isArray(mark.code) ? mark.code[0] : null;
    if (!brandName) continue;

    if (!brandDataMap.has(brandName)) {
      brandDataMap.set(brandName, brandCode);
    }

    if (!mark.folder || !Array.isArray(mark.folder)) continue;

    for (const folder of mark.folder) {
      const modelRaw = Array.isArray(folder.model) ? folder.model[0] : null;
      const modelName = getTextValue(modelRaw);
      if (!modelName) continue;

      const modelKey = `${brandName}::${modelName}`;
      if (!modelDataMap.has(modelKey)) {
        modelDataMap.set(
          modelKey,
          modelName.toLowerCase().replace(/\s+/g, '-')
        );
      }

      if (!folder.modification || !Array.isArray(folder.modification)) continue;

      for (const mod of folder.modification) {
        const variantName = mod.$.name;
        if (!variantName) continue;

        const yearsStr = Array.isArray(mod.years) ? mod.years[0] : '';
        const { yearFrom, yearTo } = parseYears(yearsStr);
        const { powerText, kppText } = parsePowerAndKpp(variantName);
        const bodyType = Array.isArray(mod.body_type)
          ? mod.body_type[0]
          : null;
        const meta = {
          configurationId: Array.isArray(mod.configuration_id)
            ? mod.configuration_id[0]
            : null,
          techParamId: Array.isArray(mod.tech_param_id)
            ? mod.tech_param_id[0]
            : null,
          modificationId: Array.isArray(mod.modification_id)
            ? mod.modification_id[0]
            : null,
        };

        // Parse complectations
        const complectations: Array<{ extId: string; name: string }> = [];
        const complNode = mod.complectations?.[0];
        if (complNode && typeof complNode === 'object' && complNode.complectation) {
          for (const c of complNode.complectation) {
            if (c.$ && c.$.id && c._) {
              complectations.push({ extId: c.$.id, name: c._.trim() });
            }
          }
        }

        variantDataList.push({
          brandName,
          modelName,
          name: variantName,
          bodyType,
          yearFrom,
          yearTo,
          powerText,
          kppText,
          meta,
          complectations,
        });
      }
    }
  }

  logger.info(
    {
      brands: brandDataMap.size,
      models: modelDataMap.size,
      variants: variantDataList.length,
    },
    'XML parsed into memory'
  );

  // ─── Phase 2: Insert brands ───
  const existingBrands = await prisma.carBrand.findMany();
  const existingBrandNames = new Set(existingBrands.map((b) => b.name));

  const newBrandData = Array.from(brandDataMap.entries())
    .filter(([name]) => !existingBrandNames.has(name))
    .map(([name, code]) => ({ name, code }));

  if (newBrandData.length > 0) {
    await prisma.carBrand.createMany({
      data: newBrandData,
      skipDuplicates: true,
    });
  }

  const allBrands = await prisma.carBrand.findMany();
  const brandIdByName = new Map(allBrands.map((b) => [b.name, b.id]));
  logger.info(
    {
      existing: existingBrands.length,
      new: newBrandData.length,
      total: allBrands.length,
    },
    'Brands complete'
  );

  // ─── Phase 3: Insert models ───
  const existingModels = await prisma.carModel.findMany();
  const existingModelKeys = new Set(
    existingModels.map((m) => `${m.brandId}::${m.name}`)
  );

  const newModelData: Array<{ brandId: string; name: string; slug: string }> =
    [];
  for (const [key, slug] of modelDataMap) {
    const sepIdx = key.indexOf('::');
    const brandName = key.substring(0, sepIdx);
    const modelName = key.substring(sepIdx + 2);
    const brandId = brandIdByName.get(brandName);
    if (!brandId) continue;
    if (existingModelKeys.has(`${brandId}::${modelName}`)) continue;
    newModelData.push({ brandId, name: modelName, slug });
  }

  const MODEL_BATCH = 1000;
  for (let i = 0; i < newModelData.length; i += MODEL_BATCH) {
    const batch = newModelData.slice(i, i + MODEL_BATCH);
    await prisma.carModel.createMany({ data: batch, skipDuplicates: true });
    logger.info(
      {
        progress: `${Math.min(i + MODEL_BATCH, newModelData.length)}/${newModelData.length}`,
      },
      'Models batch'
    );
  }

  const allModels = await prisma.carModel.findMany();
  const brandNameById = new Map(allBrands.map((b) => [b.id, b.name]));
  const modelIdByKey = new Map(
    allModels.map((m) => [
      `${brandNameById.get(m.brandId)}::${m.name}`,
      m.id,
    ])
  );
  logger.info(
    {
      existing: existingModels.length,
      new: newModelData.length,
      total: allModels.length,
    },
    'Models complete'
  );

  // ─── Phase 4: Insert variants ───
  // Load existing variant keys for dedup (handles NULL year fields correctly)
  const existingVariants = await prisma.carVariant.findMany({
    select: { modelId: true, name: true, yearFrom: true, yearTo: true },
  });
  const existingVariantKeys = new Set(
    existingVariants.map(
      (v) => `${v.modelId}::${v.name}::${v.yearFrom}::${v.yearTo}`
    )
  );
  logger.info(
    { existing: existingVariants.length },
    'Loaded existing variants for dedup'
  );

  // Build insert list, deduplicating against both XML dupes and existing DB records
  const seenKeys = new Set<string>();
  const variantInserts: Array<{
    modelId: string;
    name: string;
    bodyType: string | null;
    yearFrom: number | null;
    yearTo: number | null;
    powerText: string | null;
    kppText: string | null;
    meta: object;
  }> = [];

  for (const v of variantDataList) {
    const modelKey = `${v.brandName}::${v.modelName}`;
    const modelId = modelIdByKey.get(modelKey);
    if (!modelId) continue;

    const key = `${modelId}::${v.name}::${v.yearFrom}::${v.yearTo}`;
    if (seenKeys.has(key) || existingVariantKeys.has(key)) continue;
    seenKeys.add(key);

    variantInserts.push({
      modelId,
      name: v.name,
      bodyType: v.bodyType,
      yearFrom: v.yearFrom,
      yearTo: v.yearTo,
      powerText: v.powerText,
      kppText: v.kppText,
      meta: v.meta,
    });
  }

  logger.info(
    {
      toInsert: variantInserts.length,
      skippedDupes: variantDataList.length - variantInserts.length,
    },
    'Variants prepared for batch insert'
  );

  const VARIANT_BATCH = 500;
  let totalInserted = 0;
  for (let i = 0; i < variantInserts.length; i += VARIANT_BATCH) {
    const batch = variantInserts.slice(i, i + VARIANT_BATCH);
    const result = await prisma.carVariant.createMany({
      data: batch,
      skipDuplicates: true,
    });
    totalInserted += result.count;

    if ((i / VARIANT_BATCH) % 20 === 0 || i + VARIANT_BATCH >= variantInserts.length) {
      logger.info(
        {
          progress: `${Math.min(i + VARIANT_BATCH, variantInserts.length)}/${variantInserts.length}`,
          totalInserted,
        },
        'Variant batch progress'
      );
    }
  }

  // ─── Phase 5: Insert complectations & variant-complectation links ───
  // Collect all unique complectations from XML
  const complectationMap = new Map<string, string>(); // extId → name
  const variantComplLinks: Array<{
    variantKey: string; // modelId::name::yearFrom::yearTo
    extId: string;
  }> = [];

  for (const v of variantDataList) {
    if (v.complectations.length === 0) continue;
    const modelId = modelIdByKey.get(`${v.brandName}::${v.modelName}`);
    if (!modelId) continue;
    const variantKey = `${modelId}::${v.name}::${v.yearFrom}::${v.yearTo}`;

    for (const c of v.complectations) {
      complectationMap.set(c.extId, c.name);
      variantComplLinks.push({ variantKey, extId: c.extId });
    }
  }

  logger.info(
    {
      uniqueComplectations: complectationMap.size,
      links: variantComplLinks.length,
    },
    'Complectations parsed'
  );

  // Insert complectations
  const existingCompl = await prisma.carComplectation.findMany();
  const existingComplExtIds = new Set(existingCompl.map((c) => c.extId));

  const newComplData = Array.from(complectationMap.entries())
    .filter(([extId]) => !existingComplExtIds.has(extId))
    .map(([extId, name]) => ({ extId, name }));

  if (newComplData.length > 0) {
    const COMPL_BATCH = 1000;
    for (let i = 0; i < newComplData.length; i += COMPL_BATCH) {
      const batch = newComplData.slice(i, i + COMPL_BATCH);
      await prisma.carComplectation.createMany({
        data: batch,
        skipDuplicates: true,
      });
    }
  }

  const allCompl = await prisma.carComplectation.findMany();
  const complIdByExtId = new Map(allCompl.map((c) => [c.extId, c.id]));
  logger.info(
    {
      existing: existingCompl.length,
      new: newComplData.length,
      total: allCompl.length,
    },
    'Complectations complete'
  );

  // Build variant ID lookup (fetch all variants with their keys)
  const allVariantsForLinks = await prisma.carVariant.findMany({
    select: { id: true, modelId: true, name: true, yearFrom: true, yearTo: true },
  });
  const variantIdByKey = new Map(
    allVariantsForLinks.map((v) => [
      `${v.modelId}::${v.name}::${v.yearFrom}::${v.yearTo}`,
      v.id,
    ])
  );

  // Insert variant-complectation links
  const existingLinks = await prisma.carVariantComplectation.findMany({
    select: { variantId: true, complectationId: true },
  });
  const existingLinkKeys = new Set(
    existingLinks.map((l) => `${l.variantId}::${l.complectationId}`)
  );

  const seenLinkKeys = new Set<string>();
  const linkInserts: Array<{ variantId: string; complectationId: string }> = [];

  for (const link of variantComplLinks) {
    const variantId = variantIdByKey.get(link.variantKey);
    const complectationId = complIdByExtId.get(link.extId);
    if (!variantId || !complectationId) continue;

    const linkKey = `${variantId}::${complectationId}`;
    if (seenLinkKeys.has(linkKey) || existingLinkKeys.has(linkKey)) continue;
    seenLinkKeys.add(linkKey);

    linkInserts.push({ variantId, complectationId });
  }

  const LINK_BATCH = 500;
  let totalLinksInserted = 0;
  for (let i = 0; i < linkInserts.length; i += LINK_BATCH) {
    const batch = linkInserts.slice(i, i + LINK_BATCH);
    const result = await prisma.carVariantComplectation.createMany({
      data: batch,
      skipDuplicates: true,
    });
    totalLinksInserted += result.count;
  }

  logger.info(
    {
      newLinks: totalLinksInserted,
      totalLinks: existingLinks.length + totalLinksInserted,
    },
    'Variant-complectation links complete'
  );

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  logger.info(
    {
      newBrands: newBrandData.length,
      newModels: newModelData.length,
      newVariants: totalInserted,
      newComplectations: newComplData.length,
      newLinks: totalLinksInserted,
      totalBrands: allBrands.length,
      totalModels: allModels.length,
      totalVariants: existingVariants.length + totalInserted,
      totalComplectations: allCompl.length,
      totalLinks: existingLinks.length + totalLinksInserted,
      durationSec: duration,
    },
    'Batch import completed successfully'
  );
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
