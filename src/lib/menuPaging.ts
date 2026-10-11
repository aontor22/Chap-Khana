/** Client-side progressive rendering; the full catalog remains searchable. */
export const MENU_PAGE_SIZE = 12;
export function visibleMenuCount(total: number, requested: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const safeRequested = Number.isFinite(requested) ? Math.max(MENU_PAGE_SIZE, Math.floor(requested)) : MENU_PAGE_SIZE;
  return Math.min(Math.floor(total), safeRequested);
}
export function nextMenuCount(total: number, current: number): number {
  return visibleMenuCount(total, current + MENU_PAGE_SIZE);
}
