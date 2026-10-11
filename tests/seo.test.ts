import {describe,it,expect} from 'vitest';
import {seoForPath,canonicalUrl} from '../src/lib/seo';
describe('route-specific SEO rules',()=>{
 it('indexes only public pages',()=>{expect(seoForPath('/').indexable).toBe(true);expect(seoForPath('/menu').indexable).toBe(true);for(const path of ['/admin','/cart','/checkout','/account','/track','/auth/callback','/does-not-exist'])expect(seoForPath(path).indexable).toBe(false);});
 it('canonicalizes duplicate menu routes and strips private query info',()=>{expect(canonicalUrl('https://chap-khana.vercel.app','/menu')).toBe('https://chap-khana.vercel.app/');expect(canonicalUrl('https://chap-khana.vercel.app','/track')).not.toContain('token');});
});
