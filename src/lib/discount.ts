import type { DiscountType, MenuItem } from '../types';

/** Canonical UI/demo rounding rule: nearest whole taka; SQL migration matches it. */
export function discountedUnitPrice(item: Pick<MenuItem, 'price' | 'discount_type' | 'discount_value'>): number | null {
  const price = item.price;
  if (price === null || !Number.isSafeInteger(price) || price < 1) return null;
  const kind = item.discount_type ?? 'none';
  const value = item.discount_value ?? 0;
  if (kind === 'percent' && Number.isInteger(value) && value >= 1 && value <= 99) {
    return Math.max(1, Math.round(price * (100 - value) / 100));
  }
  if (kind === 'fixed' && Number.isInteger(value) && value >= 1 && value < price) {
    return price - value;
  }
  return price;
}
export function unitSavings(item: Pick<MenuItem, 'price' | 'discount_type' | 'discount_value'>): number {
  const finalPrice = discountedUnitPrice(item);
  return item.price !== null && finalPrice !== null ? Math.max(0, item.price - finalPrice) : 0;
}
export function discountLabel(item: Pick<MenuItem, 'price' | 'discount_type' | 'discount_value'>): string | null {
  if (!unitSavings(item)) return null;
  if (item.discount_type === 'percent') return `${item.discount_value}% OFF`;
  if (item.discount_type === 'fixed') return `৳${item.discount_value} OFF`;
  return null;
}
export function validateDiscount(item: Pick<MenuItem, 'price' | 'discount_type' | 'discount_value'>): string | null {
  const kind: DiscountType = item.discount_type ?? 'none';
  const value = item.discount_value ?? 0;
  if (kind === 'none') return value === 0 ? null : 'Remove discount amount when discount type is None.';
  if (item.price === null || !Number.isSafeInteger(item.price) || item.price < 1) return 'Set a base price before enabling a discount.';
  if (!Number.isSafeInteger(value)) return 'Discount must be a whole number.';
  if (kind === 'percent') return value >= 1 && value <= 99 ? null : 'Percentage must be between 1% and 99%.';
  if (kind === 'fixed') return value >= 1 && value < item.price ? null : 'Fixed discount must be at least ৳1 and less than the base price.';
  return 'Invalid discount type.';
}
