import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_WEEKLY_HOURS, WEEK_DAYS, formatHours, getConfiguredHoursStatus, normalizeStoreSettings, phoneHref, safeExternalUrl, validateRestaurantSettings, whatsappHref } from '../src/lib/storeProfile';

describe('restaurant contact and weekly hours settings',()=>{
  it('defaults to the public listing hours for all seven days',()=>{
    const settings=normalizeStoreSettings({});
    expect(WEEK_DAYS).toHaveLength(7);
    expect(settings.contact_phone).toBe(DEFAULT_PROFILE.contact_phone);
    expect(settings.facebook_url).toBe('https://www.facebook.com/chapkhana');
    for(const day of WEEK_DAYS)expect(formatHours(settings.weekly_hours[day])).toBe('11:59 AM – 11:59 PM');
  });
  it('allows an independent closure day without auto-changing ordering settings',()=>{
    const settings=normalizeStoreSettings({accepting_orders:true});
    settings.weekly_hours.saturday={open:'11:59',close:'23:59',closed:true};
    expect(validateRestaurantSettings(settings)).toBeNull();
    expect(settings.accepting_orders).toBe(true);
    expect(formatHours(settings.weekly_hours.saturday)).toBe('Closed');
  });
  it('validates URL schemes and prevents untrusted links',()=>{
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalUrl('http://example.com')).toBeNull();
    expect(safeExternalUrl('https://www.facebook.com/chapkhana')).toContain('facebook.com');
  });
  it('creates safe phone and WhatsApp actions',()=>{
    expect(phoneHref('01870-203065')).toBe('tel:01870203065');
    expect(whatsappHref('01870-203065')).toBe('https://wa.me/8801870203065');
    expect(whatsappHref('abcd')).toBeNull();
  });
  it('rejects invalid schedule and contact details',()=>{
    const settings=normalizeStoreSettings({});
    settings.weekly_hours.monday={open:'11:59',close:'11:59',closed:false};
    expect(validateRestaurantSettings(settings)).toMatch(/monday/i);
    settings.weekly_hours={...DEFAULT_WEEKLY_HOURS};
    settings.maps_url='file:///etc/passwd';
    expect(validateRestaurantSettings(settings)).toMatch(/Maps/);
  });
  it('shows open or closed from Asia/Dhaka local time independent of browser timezone',()=>{
    const settings=normalizeStoreSettings({});
    expect(getConfiguredHoursStatus(settings,new Date('2026-10-10T06:30:00Z')).openNow).toBe(true); // 12:30 in Dhaka
    expect(getConfiguredHoursStatus(settings,new Date('2026-10-10T04:00:00Z')).openNow).toBe(false); // 10:00 in Dhaka
  });
  it('supports overnight schedules crossing into the next local day',()=>{
    const settings=normalizeStoreSettings({});
    settings.weekly_hours.friday={open:'20:00',close:'02:00',closed:false};
    settings.weekly_hours.saturday={open:'11:59',close:'23:59',closed:false};
    expect(getConfiguredHoursStatus(settings,new Date('2026-10-09T19:00:00Z')).openNow).toBe(true); // Sat 01:00 local from Fri
  });
});
