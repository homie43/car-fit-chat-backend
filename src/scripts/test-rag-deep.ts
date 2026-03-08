/**
 * Deep RAG pipeline test — checks real queries against DB
 */
import { prisma } from '../shared/utils/prisma';
import { carsService } from '../modules/cars/cars.service';
import { parseMessageForPreferences, extractDescriptionKeywords } from '../modules/ai/message-parser';

async function testRAGDeep() {
  console.log('=== Deep RAG Pipeline Test ===\n');

  const queries = [
    'Хочу тойоту седан 2020 на автомате',
    'Посоветуй бмв кроссовер',
    'Ищу Hyundai Tucson',
    'Нужен надежный седан',
    'Хочу купе от Порше',
    'Расскажи про AC Cobra',
    'Хочу Abarth 500',
    'Кроссовер от 2018 года на автомате',
    'Volkswagen Golf хэтчбек',
  ];

  let passCount = 0;
  let failCount = 0;

  for (const query of queries) {
    console.log(`--- Query: "${query}" ---`);

    const prefs = parseMessageForPreferences(query);
    console.log('  Parsed prefs:', JSON.stringify(prefs));

    const keywords = extractDescriptionKeywords(query);
    if (keywords.length > 0) {
      console.log('  Description keywords:', keywords);
    }

    const hasEnough = Boolean(
      prefs.marka || prefs.model || prefs.kpp || prefs.yearFrom || prefs.bodyType,
    );
    console.log('  Enough for search:', hasEnough);

    if (hasEnough) {
      const results = await carsService.searchCarsForRAG({
        marka: prefs.marka,
        model: prefs.model,
        yearFrom: prefs.yearFrom,
        yearTo: prefs.yearTo,
        kpp: prefs.kpp,
        bodyType: prefs.bodyType,
        descriptionKeywords: keywords.length > 0 ? keywords : undefined,
        limit: 5,
      });

      console.log(`  Results: ${results.length}`);
      const withDesc = results.filter((r) => r.description).length;
      const withoutDesc = results.length - withDesc;
      console.log(`  With description: ${withDesc}, Without: ${withoutDesc}`);

      results.forEach((r, i) => {
        const descStatus = r.description ? 'HAS desc' : 'NO desc';
        console.log(`    ${i + 1}. ${r.brand} ${r.model} | ${r.variant} [${descStatus}]`);
      });

      if (results.length > 0) {
        passCount++;
      } else {
        // Only fail if we'd expect results
        if (prefs.marka) {
          console.log('  WARNING: No results for a specific brand query');
          failCount++;
        } else {
          passCount++;
        }
      }
    } else {
      console.log('  -> Not enough preferences for DB search');
      passCount++;
    }

    console.log('');
  }

  // Summary stats
  console.log('=== Summary ===');
  console.log(`Queries tested: ${queries.length}`);
  console.log(`Pass: ${passCount}, Issues: ${failCount}`);

  // Check description coverage for popular brands
  console.log('\n=== Description Coverage ===');
  const popular = [
    'Toyota', 'BMW', 'Mercedes-Benz', 'Hyundai', 'Kia',
    'Volkswagen', 'Honda', 'Audi', 'Mazda', 'Nissan',
    'Ford', 'Chevrolet', 'Porsche', 'Volvo', 'Subaru',
  ];

  for (const brand of popular) {
    const totalForBrand = await prisma.carVariant.count({
      where: { model: { brand: { name: brand } } },
    });
    const withDescForBrand = await prisma.carVariant.count({
      where: { description: { not: null }, model: { brand: { name: brand } } },
    });
    const status = withDescForBrand > 0 ? 'OK' : 'MISSING';
    console.log(`  ${brand}: ${withDescForBrand}/${totalForBrand} descriptions [${status}]`);
  }

  // Brands that DO have descriptions
  console.log('\n=== Brands WITH descriptions ===');
  const brandsWithDesc = await prisma.$queryRaw<Array<{ name: string; cnt: bigint }>>`
    SELECT cb.name, COUNT(cv.id) as cnt
    FROM car_variants cv
    JOIN car_models cm ON cv."modelId" = cm.id
    JOIN car_brands cb ON cm."brandId" = cb.id
    WHERE cv.description IS NOT NULL
    GROUP BY cb.name
    ORDER BY cnt DESC
  `;
  brandsWithDesc.forEach((b) => {
    console.log(`  ${b.name}: ${b.cnt} variants with descriptions`);
  });

  await prisma.$disconnect();
}

testRAGDeep().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
