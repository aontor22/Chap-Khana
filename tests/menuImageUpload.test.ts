import { describe, expect, it } from 'vitest';
import { isValidMenuItemId, managedMenuImagePath, photoDimensions, validateMenuImageFile } from '../src/lib/menuImageRules';
const origin='https://example.supabase.co';
const id='chicken-chap';
const uuid='aaaa1234-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const owned=`${origin}/storage/v1/object/public/chap-khana-menu-images/items/${id}/${uuid}.webp`;
describe('menu photo security and validation',()=>{
  it('accepts supported photos at the allowed source size',()=>{
    expect(validateMenuImageFile({type:'image/jpeg',size:1024})).toBeNull();
    expect(validateMenuImageFile({type:'image/png',size:6*1024*1024})).toBeNull();
    expect(validateMenuImageFile({type:'image/webp',size:950})).toBeNull();
  });
  it('rejects oversized, empty, HTML, SVG, GIF and unsupported files',()=>{
    for(const f of [{type:'image/svg+xml',size:500},{type:'text/html',size:5},{type:'image/gif',size:222},{type:'image/jpeg',size:0},{type:'image/png',size:7*1024*1024}])expect(validateMenuImageFile(f)).toBeTruthy();
  });
  it('rejects unsafe item IDs',()=>{
    expect(isValidMenuItemId('chicken-chap')).toBe(true);
    for(const value of ['','A','../admin','chicken/chop',' a','x--y'])expect(isValidMenuItemId(value)).toBe(false);
  });
  it('allows deleting only images from the correct menu item and own Supabase bucket',()=>{
    expect(managedMenuImagePath(owned,id,origin)).toBe(`items/${id}/${uuid}.webp`);
    expect(managedMenuImagePath(owned,'beef-chap',origin)).toBeNull();
    expect(managedMenuImagePath(owned,id,'https://other.supabase.co')).toBeNull();
    expect(managedMenuImagePath(owned.replace('/public/','/sign/'),id,origin)).toBeNull();
    expect(managedMenuImagePath(owned+'?download=1',id,origin)).toBeNull();
    expect(managedMenuImagePath('https://images.unsplash.com/photo-123',id,origin)).toBeNull();
  });
  it('scales down without stretching or enlarging',()=>{
    expect(photoDimensions(2800,1400)).toEqual({width:1400,height:700});
    expect(photoDimensions(900,600)).toEqual({width:900,height:600});
    expect(()=>photoDimensions(20000,20000)).toThrow();
  });
});
