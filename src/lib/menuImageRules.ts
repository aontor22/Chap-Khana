/** Pure validation helpers shared by upload UI and tests. */
export const MAX_SOURCE_IMAGE_BYTES = 6 * 1024 * 1024;
export const MAX_UPLOAD_IMAGE_BYTES = 3 * 1024 * 1024;
export const MENU_IMAGE_BUCKET = 'chap-khana-menu-images';
export const IMAGE_MIME_TYPES = ['image/jpeg','image/png','image/webp'] as const;

export function validateMenuImageFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!IMAGE_MIME_TYPES.includes(file.type as (typeof IMAGE_MIME_TYPES)[number]))
    return 'Choose a JPG, PNG, or WebP photo. SVG, GIF, and HEIC are not accepted.';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'The selected image is empty.';
  if (file.size > MAX_SOURCE_IMAGE_BYTES) return 'Choose a photo smaller than 6 MB.';
  return null;
}

export function isValidMenuItemId(id: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length <= 80;
}

/** Only URLs issued by our own public bucket, inside this item's folder, are removable. */
export function managedMenuImagePath(url: string, itemId: string, supabaseUrl: string): string | null {
  if (!isValidMenuItemId(itemId)) return null;
  try {
    const remote = new URL(url);
    const base = new URL(supabaseUrl);
    const prefix = `/storage/v1/object/public/${MENU_IMAGE_BUCKET}/`;
    if (remote.protocol !== 'https:' || remote.origin !== base.origin || !remote.pathname.startsWith(prefix) || remote.search || remote.hash) return null;
    const rawPath = remote.pathname.slice(prefix.length);
    if (!/^items\/[a-z0-9-]+\/[0-9a-f-]{36}\.webp$/.test(rawPath)) return null;
    if (!rawPath.startsWith(`items/${itemId}/`)) return null;
    return rawPath;
  } catch { return null; }
}

/** Keep a photo's original proportions; cards use object-fit:cover for display. */
export function photoDimensions(width: number, height: number): {width: number; height: number} {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width * height > 50_000_000)
    throw new Error('This picture has unsupported dimensions.');
  const scale = Math.min(1, 1400 / width, 1400 / height);
  return {width: Math.max(1,Math.round(width * scale)), height: Math.max(1,Math.round(height * scale))};
}
