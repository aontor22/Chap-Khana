import { describe, expect, it } from 'vitest';
import { discountLabel, discountedUnitPrice, unitSavings, validateDiscount } from '../src/lib/discount';
import { demoMenu } from '../src/data/demo';

const base = { price: 200, discount_type: 'none' as const, discount_value: 0 };
describe('per-item discounts', () => {
  it('keeps the original price without a discount', () => expect(discountedUnitPrice(base)).toBe(200));
  it('applies a percentage correctly', () => expect(discountedUnitPrice({price: 200, discount_type: 'percent', discount_value: 15})).toBe(170));
  it('rounds half up to whole taka, matching PostgreSQL round()', () => expect(discountedUnitPrice({price: 99,discount_type:'percent',discount_value:50})).toBe(50));
  it('applies a fixed taka discount correctly', () => expect(discountedUnitPrice({price: 200,discount_type:'fixed',discount_value:25})).toBe(175));
  it('prevents free items after percent discount', () => expect(discountedUnitPrice({price: 1,discount_type:'percent',discount_value:99})).toBe(1));
  it('refuses discount on unpriced dishes', () => expect(validateDiscount({price:null,discount_type:'fixed',discount_value:10})).toMatch(/base price/));
  it('rejects invalid percentage', () => expect(validateDiscount({price:200,discount_type:'percent',discount_value:100})).toMatch(/99/));
  it('rejects fixed discounts equal to or above base price', () => expect(validateDiscount({price:200,discount_type:'fixed',discount_value:200})).toMatch(/less than/));
  it('rejects amount when type is none', () => expect(validateDiscount({price:200,discount_type:'none',discount_value:5})).toMatch(/Remove/));
  it('reports savings and label', () => { const item = {price:200,discount_type:'fixed' as const,discount_value:25};expect(unitSavings(item)).toBe(25);expect(discountLabel(item)).toBe('৳25 OFF'); });
  it('allows legacy menu rows without any discount fields', () => expect(discountedUnitPrice({price:200})).toBe(200));
  it('leaves catalog items unchanged unless staff explicitly applies a discount', () => expect(demoMenu.every(i => discountedUnitPrice(i) === i.price)).toBe(true));
});
