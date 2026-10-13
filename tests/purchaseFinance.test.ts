import {describe,it,expect} from 'vitest';
import {getPurchaseBalance,remainingReturnQuantity,validateSupplierPayment,validateGoodsReturn,
 type PurchaseReceipt,type PurchaseOrder,type PurchaseReturn,type PurchasePayment} from '../src/lib/purchasing';
const orderLine='b1111111-1111-4111-8111-111111111111';
const ingredient='a1111111-1111-4111-8111-111111111111';
const rec:PurchaseReceipt={id:'receipt',order_id:'po',request_id:'initial',received_at:'2026-10-12',purchase_receipt_lines:[{receipt_id:'receipt',order_line_id:orderLine,quantity:10,unit_cost_snapshot:200}]};
const po:PurchaseOrder={id:'po',supplier_id:'supplier',status:'received',notes:'',created_at:'2026-10-12',purchase_order_lines:[{id:orderLine,order_id:'po',ingredient_id:ingredient,quantity:10,received_qty:10,unit_cost:200}]};
const ret:PurchaseReturn={id:'return',order_id:'po',receipt_id:'receipt',request_id:'return-1',reason:'Expired goods',created_at:'2026-10-12',purchase_return_lines:[{receipt_id:'receipt',order_line_id:orderLine,quantity:3,unit_cost_snapshot:200}]};
const pay:PurchasePayment={id:'payment',order_id:'po',request_id:'pay-1',amount:500,payment_method:'cash',reference:'receipt',notes:'',paid_on:'2026-10-12',created_at:'2026-10-12'};
describe('purchasing financial journal',()=>{
 it('tracks outstanding received quantity',()=>expect(remainingReturnQuantity(rec.purchase_receipt_lines[0],[ret])).toBe(7));
 it('does not allow returns over received minus prior returns',()=>expect(validateGoodsReturn(rec,[{order_line_id:orderLine,quantity:8}],[ret],new Map([[ingredient,'kg']]),po)).toMatch(/exceeds/));
 it('accepts valid returns',()=>expect(validateGoodsReturn(rec,[{order_line_id:orderLine,quantity:2}],[ret],new Map([[ingredient,'kg']]),po)).toBeNull());
 it('rejects duplicate return lines',()=>expect(validateGoodsReturn(rec,[{order_line_id:orderLine,quantity:1},{order_line_id:orderLine,quantity:1}],[],new Map([[ingredient,'kg']]),po)).toMatch(/Duplicate/));
 it('rejects fractional pieces',()=>expect(validateGoodsReturn(rec,[{order_line_id:orderLine,quantity:0.5}],[],new Map([[ingredient,'piece']]),po)).toMatch(/Invalid/));
 it('separates gross receipts, returns, paid cash, and payable',()=>expect(getPurchaseBalance('po',[rec],[ret],[pay])).toEqual({order_id:'po',received_value:2000,returned_value:600,paid_value:500,outstanding_value:900,supplier_credit:0}));
 it('captures vendor credit created by returns after payment',()=>expect(getPurchaseBalance('po',[rec],[ret],[{...pay,amount:1600}]).supplier_credit).toBe(200));
 it('rejects overpayment',()=>expect(validateSupplierPayment(1500,'cash','','',900)).toMatch(/exceeds/));
 it('accepts normal recorded payment',()=>expect(validateSupplierPayment(900,'bank','BANK-123','',900)).toBeNull());
 it('rejects unsupported payment method',()=>expect(validateSupplierPayment(100,'crypto','','',900)).toMatch(/method/));
 it('rejects money over two decimals',()=>expect(validateSupplierPayment(10.001,'cash','','',900)).toMatch(/valid/));
});
