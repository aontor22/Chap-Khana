/** Paths allowed as in-app OAuth destinations. Keep this list closed. */
const LOGIN_ROUTES = new Set(['/account','/admin','/cart','/checkout','/track']);

/** Staff who sign in through the regular Account screen land in the dashboard. */
export function postLoginPath(destination:string|null, authenticated:boolean, admin:boolean):string {
  if(!authenticated) return '/account';
  const safe = destination && LOGIN_ROUTES.has(destination) ? destination : '/account';
  return safe === '/account' && admin ? '/admin' : safe;
}
