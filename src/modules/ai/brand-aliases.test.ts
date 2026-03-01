import { describe, it, expect } from 'vitest';
import { normalizeBrandName } from './brand-aliases';

describe('normalizeBrandName', () => {
  it('should convert Cyrillic brand names to Latin', () => {
    expect(normalizeBrandName('тойота')).toBe('Toyota');
    expect(normalizeBrandName('бмв')).toBe('BMW');
    expect(normalizeBrandName('мерседес')).toBe('Mercedes-Benz');
    expect(normalizeBrandName('хендай')).toBe('Hyundai');
    expect(normalizeBrandName('киа')).toBe('Kia');
    expect(normalizeBrandName('форд')).toBe('Ford');
  });

  it('should be case-insensitive', () => {
    expect(normalizeBrandName('Тойота')).toBe('Toyota');
    expect(normalizeBrandName('БМВ')).toBe('BMW');
    expect(normalizeBrandName('АУДИ')).toBe('Audi');
  });

  it('should return Latin names unchanged', () => {
    expect(normalizeBrandName('Toyota')).toBe('Toyota');
    expect(normalizeBrandName('BMW')).toBe('BMW');
    expect(normalizeBrandName('Mercedes-Benz')).toBe('Mercedes-Benz');
  });

  it('should return unknown brands unchanged', () => {
    expect(normalizeBrandName('UnknownBrand')).toBe('UnknownBrand');
    expect(normalizeBrandName('НеизвестнаяМарка')).toBe('НеизвестнаяМарка');
  });

  it('should handle multiple Cyrillic variants for same brand', () => {
    expect(normalizeBrandName('хендай')).toBe('Hyundai');
    expect(normalizeBrandName('хюндай')).toBe('Hyundai');
    expect(normalizeBrandName('хёндэ')).toBe('Hyundai');
    expect(normalizeBrandName('хендэ')).toBe('Hyundai');
  });

  it('should handle short slang aliases', () => {
    expect(normalizeBrandName('мерс')).toBe('Mercedes-Benz');
    expect(normalizeBrandName('шеви')).toBe('Chevrolet');
  });

  it('should handle multi-word brands', () => {
    expect(normalizeBrandName('ленд ровер')).toBe('Land Rover');
    expect(normalizeBrandName('альфа ромео')).toBe('Alfa Romeo');
    expect(normalizeBrandName('роллс ройс')).toBe('Rolls-Royce');
    expect(normalizeBrandName('астон мартин')).toBe('Aston Martin');
  });

  it('should trim whitespace', () => {
    expect(normalizeBrandName('  тойота  ')).toBe('Toyota');
    expect(normalizeBrandName(' бмв ')).toBe('BMW');
  });

  it('should handle Russian car brands', () => {
    expect(normalizeBrandName('лада')).toBe('LADA');
    expect(normalizeBrandName('ваз')).toBe('LADA');
    expect(normalizeBrandName('уаз')).toBe('UAZ');
  });
});
