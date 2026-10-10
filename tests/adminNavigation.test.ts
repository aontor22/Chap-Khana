import { describe, expect, it } from 'vitest';
import { postLoginPath } from '../src/lib/adminNavigation';

describe('post-Google-login staff navigation', () => {
  it('sends authenticated staff from normal Google login directly to the admin dashboard', () => {
    expect(postLoginPath('/account', true, true)).toBe('/admin');
  });
  it('keeps regular customers on their account', () => {
    expect(postLoginPath('/account', true, false)).toBe('/account');
  });
  it('allows intentional checkout or tracking destinations even for staff', () => {
    expect(postLoginPath('/checkout', true, true)).toBe('/checkout');
    expect(postLoginPath('/track', true, true)).toBe('/track');
  });
  it('preserves a direct request for the admin dashboard', () => {
    expect(postLoginPath('/admin', true, false)).toBe('/admin'); // Route still checks Supabase staff membership.
  });
  it('disallows foreign, protocol-relative, query-bearing, or arbitrary redirect URLs', () => {
    for(const candidate of ['https://evil.example','//evil.example','/admin?token=foo','/unknown','javascript:alert(1)']){
      expect(postLoginPath(candidate, true, true)).toBe('/admin');
    }
  });
  it('never redirects an unauthenticated visitor to admin', () => {
    expect(postLoginPath('/admin', false, true)).toBe('/account');
  });
});
