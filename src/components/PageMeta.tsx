import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {seoForPath, canonicalUrl} from '../lib/seo';

function setMeta(key: string, value: string, attribute: 'name' | 'property' = 'name') {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.content = value;
}

export default function PageMeta() {
  const {pathname} = useLocation();
  useEffect(() => {
    const seo = seoForPath(pathname);
    const siteOrigin = import.meta.env.VITE_PUBLIC_SITE_URL?.trim() || 'https://chap-khana.vercel.app';
    const canonical = canonicalUrl(siteOrigin, pathname);
    const isProductionOrigin = window.location.origin === new URL(siteOrigin).origin;
    document.title = seo.title;
    setMeta('description', seo.description);
    setMeta('robots', seo.indexable && isProductionOrigin ? 'index,follow' : 'noindex,nofollow,noarchive');
    setMeta('og:title', seo.title, 'property');
    setMeta('og:description', seo.description, 'property');
    setMeta('og:url', canonical, 'property');
    setMeta('twitter:title', seo.title);
    setMeta('twitter:description', seo.description);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel='canonical'; document.head.appendChild(link); }
    link.href = canonical;
  }, [pathname]);
  return null;
}
