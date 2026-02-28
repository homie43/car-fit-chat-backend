/**
 * Manual test script for RAG functionality
 * Tests search with and without results
 */

import { prisma } from '../shared/utils/prisma';
import { carsService } from '../modules/cars/cars.service';

async function testRAG() {
  console.log('🧪 Testing RAG Functionality\n');
  console.log('=' .repeat(60));

  try {
    // Test 1: Search with results (AC, Abarth brands we have descriptions for)
    console.log('\n📊 Test 1: Search for cars WITH descriptions (AC COBRA)');
    console.log('-'.repeat(60));

    const test1Results = await carsService.searchCarsForRAG({
      marka: 'AC',
      model: 'COBRA',
      limit: 3,
    });

    console.log(`✅ Found ${test1Results.length} cars`);
    if (test1Results.length > 0) {
      console.log('\nSample result:');
      const sample = test1Results[0];
      console.log(`  Brand: ${sample.brand}`);
      console.log(`  Model: ${sample.model}`);
      console.log(`  Variant: ${sample.variant}`);
      console.log(`  Years: ${sample.yearFrom}-${sample.yearTo || 'current'}`);
      console.log(`  Description: ${sample.description?.substring(0, 100)}...`);
    }

    // Test 2: Search with partial match (only brand)
    console.log('\n\n📊 Test 2: Search by brand only (Abarth)');
    console.log('-'.repeat(60));

    const test2Results = await carsService.searchCarsForRAG({
      marka: 'Abarth',
      limit: 5,
    });

    console.log(`✅ Found ${test2Results.length} cars`);
    test2Results.forEach((car, i) => {
      console.log(`  ${i + 1}. ${car.brand} ${car.model} ${car.variant}`);
    });

    // Test 3: Search with NO results (brand not in database)
    console.log('\n\n📊 Test 3: Search for cars NOT in database (Ferrari)');
    console.log('-'.repeat(60));

    const test3Results = await carsService.searchCarsForRAG({
      marka: 'Ferrari',
      limit: 5,
    });

    console.log(`✅ Found ${test3Results.length} cars`);
    if (test3Results.length === 0) {
      console.log('  ℹ️  No results - LLM should say "no data in database"');
    }

    // Test 4: Search with filters (year + transmission)
    console.log('\n\n📊 Test 4: Search with filters (AT transmission, 2010+)');
    console.log('-'.repeat(60));

    const test4Results = await carsService.searchCarsForRAG({
      kpp: 'AT',
      yearFrom: 2010,
      limit: 5,
    });

    console.log(`✅ Found ${test4Results.length} cars with AT transmission from 2010+`);

    // Test 5: Check total cars with descriptions
    console.log('\n\n📊 Test 5: Database statistics');
    console.log('-'.repeat(60));

    const totalWithDesc = await prisma.carVariant.count({
      where: { description: { not: null } },
    });
    const totalCars = await prisma.carVariant.count();

    console.log(`  Total cars in database: ${totalCars}`);
    console.log(`  Cars with descriptions: ${totalWithDesc}`);
    console.log(`  Coverage: ${((totalWithDesc / totalCars) * 100).toFixed(2)}%`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ RAG Testing Complete!\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testRAG().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
