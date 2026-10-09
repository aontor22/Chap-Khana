import catalog from './menu-catalog.json';

// Local catalog is an image fallback for old demo localStorage and unfilled Supabase rows.
// Custom staff-supplied image_url is preserved and takes precedence in DishImage.
const photoByItemId: Record<string, string> = Object.fromEntries(
  catalog.map(item => [item.id, item.image_url])
);

export function referenceImageFor(id: string): string {
  return photoByItemId[id] ?? '';
}
