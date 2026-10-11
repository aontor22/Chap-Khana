import {describe,it,expect} from 'vitest';
import {MENU_PAGE_SIZE, visibleMenuCount, nextMenuCount} from '../src/lib/menuPaging';
describe('progressive menu rendering',()=>{
 it('starts with at most 12 results',()=>{expect(MENU_PAGE_SIZE).toBe(12);expect(visibleMenuCount(56,12)).toBe(12);expect(visibleMenuCount(5,12)).toBe(5);});
 it('loads a page without overshooting',()=>{expect(nextMenuCount(56,12)).toBe(24);expect(nextMenuCount(17,12)).toBe(17);});
 it('handles empty and malformed counts',()=>{expect(visibleMenuCount(0,12)).toBe(0);expect(visibleMenuCount(56,-12)).toBe(12);expect(visibleMenuCount(56,Infinity)).toBe(12);});
});
