/**
 * Brand name aliases: Cyrillic -> Latin
 * Maps common Russian brand names to their database equivalents
 * Database stores brands as CarBrand.name (Latin, e.g., "Toyota", "BMW")
 */
export const BRAND_ALIASES: Map<string, string> = new Map([
  // Japanese
  ['тойота', 'Toyota'],
  ['хонда', 'Honda'],
  ['ниссан', 'Nissan'],
  ['мазда', 'Mazda'],
  ['субару', 'Subaru'],
  ['мицубиси', 'Mitsubishi'],
  ['митсубиши', 'Mitsubishi'],
  ['сузуки', 'Suzuki'],
  ['лексус', 'Lexus'],
  ['инфинити', 'Infiniti'],
  ['акура', 'Acura'],
  ['дайхатсу', 'Daihatsu'],
  ['исузу', 'Isuzu'],

  // German
  ['бмв', 'BMW'],
  ['мерседес', 'Mercedes-Benz'],
  ['мерс', 'Mercedes-Benz'],
  ['ауди', 'Audi'],
  ['фольксваген', 'Volkswagen'],
  ['порше', 'Porsche'],
  ['опель', 'Opel'],

  // Korean
  ['хендай', 'Hyundai'],
  ['хюндай', 'Hyundai'],
  ['хёндэ', 'Hyundai'],
  ['хендэ', 'Hyundai'],
  ['киа', 'Kia'],
  ['санг йонг', 'SsangYong'],
  ['ссангйонг', 'SsangYong'],

  // American
  ['форд', 'Ford'],
  ['шевроле', 'Chevrolet'],
  ['шеви', 'Chevrolet'],
  ['кадиллак', 'Cadillac'],
  ['крайслер', 'Chrysler'],
  ['джип', 'Jeep'],
  ['додж', 'Dodge'],
  ['тесла', 'Tesla'],
  ['линкольн', 'Lincoln'],
  ['бьюик', 'Buick'],
  ['понтиак', 'Pontiac'],

  // French
  ['рено', 'Renault'],
  ['пежо', 'Peugeot'],
  ['ситроен', 'Citroen'],

  // Italian
  ['фиат', 'Fiat'],
  ['альфа ромео', 'Alfa Romeo'],
  ['феррари', 'Ferrari'],
  ['ламборгини', 'Lamborghini'],
  ['мазерати', 'Maserati'],

  // Russian
  ['лада', 'LADA'],
  ['ваз', 'LADA'],
  ['уаз', 'UAZ'],
  ['газ', 'GAZ'],

  // Chinese
  ['чери', 'Chery'],
  ['хавал', 'Haval'],
  ['хавейл', 'Haval'],
  ['джили', 'Geely'],
  ['чанган', 'Changan'],
  ['грейт волл', 'Great Wall'],

  // British
  ['ленд ровер', 'Land Rover'],
  ['лэнд ровер', 'Land Rover'],
  ['ягуар', 'Jaguar'],
  ['бентли', 'Bentley'],
  ['роллс ройс', 'Rolls-Royce'],
  ['роллс-ройс', 'Rolls-Royce'],
  ['мини', 'MINI'],
  ['астон мартин', 'Aston Martin'],

  // Swedish
  ['вольво', 'Volvo'],
  ['сааб', 'Saab'],
]);

/**
 * Normalize brand name: if Cyrillic alias found, return Latin equivalent.
 * Otherwise return input as-is (already Latin or unknown).
 */
export function normalizeBrandName(input: string): string {
  const lower = input.toLowerCase().trim();
  return BRAND_ALIASES.get(lower) || input;
}
