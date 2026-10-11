/** Only publicly browsable pages should appear in search results. */
export type PageSeo = { title: string; description: string; indexable: boolean; canonicalPath: string };
const BRAND = 'Chap Khana';
export function seoForPath(path: string): PageSeo {
  if (path === '/' || path === '/menu') return {
    title: path === '/menu' ? `Food Menu | ${BRAND} — Khilkhet, Dhaka` : `${BRAND} | Restaurant in Khilkhet, Dhaka`,
    description: 'Explore Chap Khana’s menu, opening hours and contact details in Khilkhet, Dhaka. Photos are illustrative; confirm availability and prices before ordering.',
    indexable: true,
    // /menu and / both render the same Home component: canonicalize duplicates.
    canonicalPath: '/'
  };
  const sections: Record<string, string> = {
    '/cart':'Your Cart', '/checkout':'Checkout', '/account':'Your Account',
    '/track':'Order Tracking', '/admin':'Staff Dashboard', '/auth/callback':'Signing In'
  };
  return {
    title: `${sections[path] || 'Page'} | ${BRAND}`,
    description: 'Chap Khana customer services.', indexable: false, canonicalPath: '/'
  };
}
/** Only the domain, not query strings or private route tokens, is used for canonical links. */
export function canonicalUrl(origin: string, path: string): string {
  return `${new URL(origin).origin}${seoForPath(path).canonicalPath}`;
}
