import { describe, expect, it } from 'vitest';
import {validPurchaseQuantity,validUnitCost,validatePurchaseLines,validateReceipt,outstanding,purchaseTotal,type PurchaseOrder} from '../src/lib/purchasing';
const ingredient='a1111111-1111-4111-8111-111111111111';
const lineId='b1111111-1111-4111-8111-111111111111';
const order:PurchaseOrder={id:'o',supplier_id:'s',status:'ordered',notes:'',created_at:'2026-10-12T00:00:00Z',purchase_order_lines:[{id:lineId,order_id:'o',ingredient_id:ingredient,quantity:10,received_qty:4,unit_cost:120}]};
describe('supplier purchase validation',()=>{
 it('supports decimals for weighed ingredients',()=>expect(validPurchaseQuantity(2.375,'kg')).toBe(true));
 it('requires whole pieces',()=>expect(validPurchaseQuantity(2.5,'piece')).toBe(false));
 it('rejects invalid currency precision',()=>expect(validUnitCost(12.345)).toBe(false));
 it('rejects duplicate purchased ingredients',()=>expect(validatePurchaseLines([{ingredient_id:ingredient,quantity:1,unit_cost:10},{ingredient_id:ingredient,quantity:2,unit_cost:20}],new Map([[ingredient,'kg']]))).toMatch(/once/));
 it('computes outstanding quantity',()=>expect(outstanding(order.purchase_order_lines[0])).toBe(6));
 it('rejects receiving more than outstanding',()=>expect(validateReceipt([{line_id:lineId,quantity:7}],order,new Map([[ingredient,'kg']]))).toMatch(/exceeds/));
 it('accepts partial receipt',()=>expect(validateReceipt([{line_id:lineId,quantity:3}],order,new Map([[ingredient,'kg']]))).toBeNull());
 it('calculates purchase commitment, not payment',()=>expect(purchaseTotal(order)).toBe(1200));
});
