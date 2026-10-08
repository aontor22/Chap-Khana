import type { Cart, CheckoutInfo, MenuItem, StoreSettings } from '../types';
export const money = (n: number) => `৳${Math.round(n).toLocaleString('en-BD')}`;
export const waitError = (value: unknown) => value instanceof Error ? value.message : 'Something went wrong. Please retry.';
export function fromStorage<T>(key: string, fallback: T): T { try { const str=localStorage.getItem(key); return str ? JSON.parse(str) as T : fallback; } catch { return fallback; } }
export function saveStorage<T>(key: string, val: T): void { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode */ } }
export const validImage = (s: string) => { try { return new URL(s).protocol === 'https:'; } catch { return false; } };
export const normalizePhone = (s: string) => s.replace(/[\s-]/g, '');
export function validateCheckout(info: CheckoutInfo, cart: Cart, menu: MenuItem[], settings: StoreSettings): string | null {
  if (!settings.accepting_orders) return 'Online ordering is currently closed.';
  if (info.name.trim().length < 2 || info.name.trim().length > 80) return 'Enter your name (2–80 characters).';
  if (!/^(\+?88)?01[3-9]\d{8}$/.test(normalizePhone(info.phone))) return 'Enter a valid Bangladeshi mobile number.';
  if (info.type === 'delivery' && (!settings.delivery_enabled || info.address.trim().length < 8 || info.address.trim().length > 350)) return 'Enter a valid delivery address (8–350 characters).';
  if (info.type === 'pickup' && !settings.pickup_enabled) return 'Pickup is currently unavailable.';
  if (info.notes.length > 500) return 'Notes must be 500 characters or less.';
  const lines=Object.entries(cart).filter(([,n])=>n>0);
  if (!lines.length || lines.length>25) return 'Add 1–25 dishes before ordering.';
  for (const [id,qty] of lines) {
    if (!Number.isInteger(qty) || qty<1 || qty>20) return 'Choose 1–20 portions per dish.';
    const item=menu.find(m=>m.id===id);
    if (!item || !item.active || !item.available || !item.price || item.price<1) return 'An item is unavailable. Refresh the menu.';
  }
  return null;
}
