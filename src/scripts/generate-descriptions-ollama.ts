/**
 * Generate car descriptions using local Ollama model
 * Usage: npm run generate:descriptions -- --batch 100
 */

import { prisma } from '../shared/utils/prisma';
import { fetch } from 'undici';

// Configuration
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const MODEL = 'qwen3:8b';
const BATCH_SIZE = 100; // Default batch size

// Graceful shutdown handler
let shouldStop = false;
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Stopping gracefully... (progress is saved)');
  shouldStop = true;
});

interface CarVariant {
  id: string;
  name: string;
  bodyType: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  powerText: string | null;
  kppText: string | null;
  model: {
    name: string;
    brand: {
      name: string;
    };
  };
}

/**
 * Generate description for a car using Ollama
 */
async function generateDescription(car: CarVariant): Promise<string> {
  const brand = car.model.brand.name;
  const model = car.model.name;
  const variant = car.name;
  const years = car.yearFrom && car.yearTo
    ? `${car.yearFrom}-${car.yearTo}`
    : car.yearFrom
    ? `${car.yearFrom}+`
    : '';
  const bodyType = car.bodyType || '';
  const power = car.powerText || '';
  const kpp = car.kppText || '';

  const prompt = `Придумай короткое интересное описание для автомобиля:
Марка: ${brand}
Модель: ${model}
Вариант: ${variant}
Годы: ${years}
Тип кузова: ${bodyType}
Мощность: ${power}
КПП: ${kpp}

Требования:
- 2-3 предложения (до 200 символов)
- Упомяни ключевые преимущества (надежность, комфорт, экономичность, динамика и т.д.)
- Добавь один интересный факт или деталь (может быть вымышленный, но правдоподобный)
- Пиши живым языком, без штампов
- Только текст описания, без заголовков и пояснений

Пример: "Надежный городской седан с экономичным двигателем. Идеален для ежедневных поездок и семейных путешествий. В 2018 году эта модель получила награду за лучшее соотношение цена-качество."`;

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.8,
          top_p: 0.9,
          max_tokens: 200,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json() as { response: string };
    return data.response.trim();
  } catch (error) {
    console.error('❌ Error generating description:', error);
    throw error;
  }
}

/**
 * Process batch of cars
 * @param priorityBrands — if set, only process these brands
 */
async function processBatch(batchSize: number, priorityBrands?: string[]): Promise<void> {
  console.log('\n🔍 Fetching cars without descriptions...');
  if (priorityBrands) {
    console.log(`   Filtering by brands: ${priorityBrands.join(', ')}`);
  }

  // Get cars without descriptions
  const cars = await prisma.carVariant.findMany({
    where: {
      description: null,
      ...(priorityBrands
        ? { model: { brand: { name: { in: priorityBrands } } } }
        : {}),
    },
    take: batchSize,
    orderBy: [
      { model: { brand: { name: 'asc' } } },
      { model: { name: 'asc' } },
    ],
    include: {
      model: {
        include: {
          brand: true,
        },
      },
    },
  });

  if (cars.length === 0) {
    console.log('✅ All cars already have descriptions!');
    return;
  }

  console.log(`📊 Found ${cars.length} cars without descriptions\n`);
  console.log(`🎯 Generating descriptions (batch size: ${batchSize})`);
  console.log(`⚠️  Press Ctrl+C to stop gracefully\n`);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  const startTime = Date.now();

  for (const car of cars) {
    if (shouldStop) {
      console.log('\n⚠️  Stopped by user');
      break;
    }

    processed++;
    const brand = car.model.brand.name;
    const model = car.model.name;

    try {
      // Generate description
      const description = await generateDescription(car);

      // Save to database
      await prisma.carVariant.update({
        where: { id: car.id },
        data: { description },
      });

      succeeded++;

      // Show progress
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const rate = processed / elapsed;
      const remaining = cars.length - processed;
      const eta = Math.ceil(remaining / rate);

      const progressBar = createProgressBar(processed, cars.length, 30);
      process.stdout.write(
        `\r${progressBar} ${processed}/${cars.length} | ` +
        `✅ ${succeeded} | ❌ ${failed} | ` +
        `${brand} ${model} | ` +
        `ETA: ${formatTime(eta)}`
      );
    } catch (error) {
      failed++;
      process.stdout.write(
        `\r❌ Failed: ${brand} ${model} - ${error instanceof Error ? error.message : 'Unknown error'}\n`
      );
    }
  }

  const duration = Math.floor((Date.now() - startTime) / 1000);
  console.log('\n');
  console.log('─'.repeat(80));
  console.log(`✅ Batch completed!`);
  console.log(`   Processed: ${processed}/${cars.length}`);
  console.log(`   Succeeded: ${succeeded}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Duration: ${formatTime(duration)}`);
  console.log('─'.repeat(80));
}

/**
 * Create ASCII progress bar
 */
function createProgressBar(current: number, total: number, width: number): string {
  const percentage = current / total;
  const filled = Math.floor(percentage * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${Math.floor(percentage * 100)}%`;
}

/**
 * Format seconds to human readable time
 */
function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Car Description Generator (Ollama)\n');
  console.log(`Model: ${MODEL}`);
  console.log(`Ollama URL: ${OLLAMA_URL}\n`);

  // Parse command line args
  const args = process.argv.slice(2);

  const batchIndex = args.indexOf('--batch');
  const batchSize = batchIndex >= 0 && args[batchIndex + 1]
    ? parseInt(args[batchIndex + 1], 10)
    : BATCH_SIZE;

  if (isNaN(batchSize) || batchSize <= 0) {
    console.error('❌ Invalid batch size');
    process.exit(1);
  }

  // Parse --brands flag (comma-separated list)
  const brandsIndex = args.indexOf('--brands');
  const priorityBrands = brandsIndex >= 0 && args[brandsIndex + 1]
    ? args[brandsIndex + 1].split(',').map((b) => b.trim())
    : undefined;

  if (priorityBrands) {
    console.log(`Priority brands: ${priorityBrands.join(', ')}`);
  }

  // Check Ollama connection
  console.log('🔌 Checking Ollama connection...');
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      throw new Error('Ollama not responding');
    }
    console.log('✅ Ollama is running\n');
  } catch (error) {
    console.error('❌ Cannot connect to Ollama. Make sure it is running.');
    console.error('   Start with: ollama serve');
    process.exit(1);
  }

  try {
    await processBatch(batchSize, priorityBrands);

    // Check if there are more cars to process
    const remaining = await prisma.carVariant.count({
      where: { description: null },
    });

    if (remaining > 0 && !shouldStop) {
      console.log(`\n💡 ${remaining} cars remaining without descriptions`);
      console.log(`   Run again to continue: npm run generate:descriptions -- --batch ${batchSize}`);
    } else if (remaining === 0) {
      console.log('\n🎉 All done! All cars have descriptions.');
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
