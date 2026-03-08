/**
 * Generate template-based car descriptions for popular brands.
 * No LLM required — creates informative descriptions from DB fields.
 *
 * Usage: npx tsx src/scripts/generate-descriptions-template.ts
 */

import { prisma } from '../shared/utils/prisma';

const PRIORITY_BRANDS = [
  'Toyota', 'BMW', 'Mercedes-Benz', 'Hyundai', 'Kia',
  'Volkswagen', 'Honda', 'Audi', 'Mazda', 'Nissan',
  'Ford', 'Chevrolet', 'Subaru', 'Volvo', 'Renault',
];

const VARIANTS_PER_BRAND = 35;

/** Brand-level characteristics for richer descriptions */
const BRAND_TRAITS: Record<string, string> = {
  'Toyota': 'Известна легендарной надёжностью и высокой остаточной стоимостью.',
  'BMW': 'Баварский производитель, славящийся спортивной управляемостью и инновациями.',
  'Mercedes-Benz': 'Флагман немецкого автопрома, синоним комфорта и престижа.',
  'Hyundai': 'Корейский бренд с отличным соотношением цена-качество и длинной гарантией.',
  'Kia': 'Динамично развивающийся корейский бренд с ярким дизайном.',
  'Volkswagen': 'Немецкое качество сборки и продуманная эргономика.',
  'Honda': 'Японская инженерная школа: надёжные моторы и экономичность.',
  'Audi': 'Прогрессивные технологии, полный привод Quattro и качественные интерьеры.',
  'Mazda': 'Японский бренд с фирменной технологией SkyActiv и драйверскими повадками.',
  'Nissan': 'Широкая модельная линейка от компактов до брутальных внедорожников.',
  'Ford': 'Американская классика с современными технологиями безопасности.',
  'Chevrolet': 'Один из крупнейших мировых автопроизводителей с разнообразным модельным рядом.',
  'Subaru': 'Полный привод и оппозитный двигатель — визитная карточка марки.',
  'Volvo': 'Шведский эталон безопасности и скандинавского дизайна.',
  'Renault': 'Французский шарм, экономичные двигатели и комфортная подвеска.',
};

/** Body type descriptors (Russian) */
const BODY_DESC: Record<string, string> = {
  'Седан': 'Классический седан',
  'Седан 2 дв.': 'Двухдверный седан',
  'Хэтчбек 3 дв.': 'Компактный трёхдверный хэтчбек',
  'Хэтчбек 5 дв.': 'Практичный пятидверный хэтчбек',
  'Внедорожник 5 дв.': 'Полноразмерный внедорожник',
  'Внедорожник 3 дв.': 'Трёхдверный внедорожник',
  'Универсал': 'Вместительный универсал',
  'Универсал 5 дв.': 'Вместительный пятидверный универсал',
  'Купе': 'Стильное купе',
  'Минивэн': 'Просторный минивэн',
  'Пикап': 'Утилитарный пикап',
  'Кабриолет': 'Кабриолет для открытых дорог',
  'Лифтбек': 'Элегантный лифтбек',
};

function getBodyDesc(bodyType: string | null): string {
  if (!bodyType) return 'Автомобиль';
  return BODY_DESC[bodyType] || bodyType;
}

function formatYears(yearFrom: number | null, yearTo: number | null): string {
  if (yearFrom && yearTo) return `выпуска ${yearFrom}–${yearTo} гг.`;
  if (yearFrom) return `выпускается с ${yearFrom} г.`;
  return '';
}

function formatPower(power: string | null): string {
  if (!power) return '';
  return `мощностью ${power}`;
}

function formatKpp(kpp: string | null): string {
  if (!kpp) return '';
  const map: Record<string, string> = {
    'AT': 'автоматическая коробка передач',
    'MT': 'механическая коробка передач',
    'CVT': 'вариатор',
    'Robot': 'роботизированная коробка',
    'AMT': 'автоматизированная механика',
  };
  return map[kpp] || kpp;
}

function generateDescription(
  brand: string,
  model: string,
  variant: string,
  bodyType: string | null,
  yearFrom: number | null,
  yearTo: number | null,
  power: string | null,
  kpp: string | null,
): string {
  const parts: string[] = [];

  // First sentence: body type + brand + model + years
  const body = getBodyDesc(bodyType);
  const years = formatYears(yearFrom, yearTo);
  parts.push(`${body} ${brand} ${model} ${years}`.trim() + '.');

  // Second sentence: power + transmission details
  const pwrStr = formatPower(power);
  const kppStr = formatKpp(kpp);
  if (pwrStr || kppStr) {
    const details = [pwrStr, kppStr].filter(Boolean).join(', ');
    parts.push(`Оснащается двигателем ${details}.`);
  }

  // Third sentence: brand trait
  const trait = BRAND_TRAITS[brand];
  if (trait) {
    parts.push(trait);
  }

  return parts.join(' ');
}

async function main() {
  console.log('=== Template Description Generator ===\n');

  let totalGenerated = 0;

  for (const brandName of PRIORITY_BRANDS) {
    // Find brand
    const brand = await prisma.carBrand.findFirst({
      where: { name: brandName },
    });

    if (!brand) {
      console.log(`  SKIP: ${brandName} — not found in DB`);
      continue;
    }

    // Get variants without descriptions, pick diverse models
    const variants = await prisma.carVariant.findMany({
      where: {
        description: null,
        model: { brandId: brand.id },
      },
      orderBy: [
        { model: { name: 'asc' } },
        { yearFrom: 'desc' },
      ],
      take: VARIANTS_PER_BRAND,
      include: {
        model: { include: { brand: true } },
      },
    });

    if (variants.length === 0) {
      console.log(`  ${brandName}: all variants already have descriptions`);
      continue;
    }

    let brandCount = 0;
    for (const v of variants) {
      const desc = generateDescription(
        v.model.brand.name,
        v.model.name,
        v.name,
        v.bodyType,
        v.yearFrom,
        v.yearTo,
        v.powerText,
        v.kppText,
      );

      await prisma.carVariant.update({
        where: { id: v.id },
        data: { description: desc },
      });

      brandCount++;
    }

    console.log(`  ${brandName}: ${brandCount} descriptions generated`);
    totalGenerated += brandCount;
  }

  // Stats
  const totalWithDesc = await prisma.carVariant.count({
    where: { description: { not: null } },
  });
  const totalCars = await prisma.carVariant.count();

  console.log(`\n=== Done ===`);
  console.log(`Generated: ${totalGenerated}`);
  console.log(`Total with descriptions: ${totalWithDesc}/${totalCars} (${(totalWithDesc / totalCars * 100).toFixed(2)}%)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
