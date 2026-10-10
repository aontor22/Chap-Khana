const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const rawKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
export const isConfigured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(rawUrl) && !rawUrl.toLowerCase().includes('your-') && !rawKey.toLowerCase().includes('replace') && (rawKey.startsWith('sb_publishable_') || rawKey.startsWith('eyJ'));
export const config = {
  supabaseUrl: rawUrl, supabaseKey: rawKey,
  name: 'Chap Khana',
};
