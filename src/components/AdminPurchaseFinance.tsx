import {useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {ArrowDownLeft, CreditCard, RotateCcw} from 'lucide-react';
import {recordSupplierPayment,returnPurchaseGoods} from '../data/api';
import {getPurchaseBalance,remainingReturnQuantity,SUPPLIER_PAYMENT_METHODS,validateGoodsReturn,validateSupplierPayment,
 type PurchaseSnapshot,type PurchaseOrder,type SupplierPaymentMethod,type ReturnDraftLine} from '../lib/purchasing';
import type {InventorySnapshot} from '../lib/inventory';
import {waitError} from '../lib/utils';
const bdt=(n:number)=>`৳${Number(n).toLocaleString('en-BD',{maximumFractionDigits:2})}`;
const todayDhaka=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'});
export default function AdminPurchaseFinance({data,inventory,refresh,live}:{data:PurchaseSnapshot;inventory:InventorySnapshot;refresh:()=>Promise<void>;live:boolean}){
 const [orderId,setOrderId]=useState('');const [receiptId,setReceiptId]=useState('');
 const [reason,setReason]=useState('');const [quantities,setQuantities]=useState<Record<string,string>>({});
 const [amount,setAmount]=useState('');const [method,setMethod]=useState<SupplierPaymentMethod>('cash');
 const [reference,setReference]=useState('');const [notes,setNotes]=useState('');const [paidOn,setPaidOn]=useState(todayDhaka());
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const returnRequest=useRef('');const paymentRequest=useRef('');
 const setReturnDirty=()=>{returnRequest.current='';setNotice('');};
 const setPaymentDirty=()=>{paymentRequest.current='';setNotice('');};
 const order=useMemo(()=>data.orders.find(o=>o.id===orderId),[orderId,data.orders]);
 const receipts=useMemo(()=>data.receipts.filter(r=>r.order_id===orderId),[data.receipts,orderId]);
 const receipt=receipts.find(x=>x.id===receiptId);
 const balance=useMemo(()=>data.balances.find(x=>x.order_id===orderId)??(order?getPurchaseBalance(order.id,data.receipts,data.returns,data.payments):undefined),[data,orderId,order]);
 const units=useMemo(()=>new Map(inventory.ingredients.map(i=>[i.id,i.unit])),[inventory.ingredients]);
 const ingredient=(id:string)=>inventory.ingredients.find(i=>i.id===id)?.name||id;
 const supplier=(o:PurchaseOrder)=>data.suppliers.find(s=>s.id===o.supplier_id)?.name||'Supplier';
 const returnLines=receipt?.purchase_receipt_lines.filter(line=>remainingReturnQuantity(line,data.returns)>0)||[];
 const requestedLines:ReturnDraftLine[]=returnLines.filter(line=>Number(quantities[line.order_line_id])>0)
  .map(line=>({order_line_id:line.order_line_id,quantity:Number(quantities[line.order_line_id])}));
 const returnError=receipt&&order?validateGoodsReturn(receipt,requestedLines,data.returns,units,order):'Select a receipt.';
 const paymentError=validateSupplierPayment(Number(amount),method,reference,notes,Number(balance?.outstanding_value??0));
 useEffect(()=>{if(!orderId&&data.orders.length)setOrderId(data.orders[0].id);},[orderId,data.orders]);
 const selectOrder=(id:string)=>{setOrderId(id);setReceiptId('');setQuantities({});setReason('');setAmount('');setReturnDirty();setPaymentDirty();setError('');};
 const submitReturn=async(e:FormEvent)=>{e.preventDefault();if(busy||!order||!receipt)return;
  if(returnError){setError(returnError);return;}if(reason.trim().length<3){setError('Enter a return reason (at least 3 characters).');return;}
  setBusy(true);setError('');setNotice('');if(!returnRequest.current)returnRequest.current=crypto.randomUUID();
  try{await returnPurchaseGoods(receipt,order,returnRequest.current,reason,requestedLines,units);
   setNotice('Supplier return saved and ingredient stock deducted.');setQuantities({});setReason('');returnRequest.current='';await refresh();}
  catch(e){setError(waitError(e));}finally{setBusy(false);}
 };
 const submitPayment=async(e:FormEvent)=>{e.preventDefault();if(busy||!order)return;
  if(paymentError){setError(paymentError);return;}
  setBusy(true);setError('');setNotice('');if(!paymentRequest.current)paymentRequest.current=crypto.randomUUID();
  try{await recordSupplierPayment(order.id,paymentRequest.current,Number(amount),method,reference,notes,paidOn);
   setNotice('Supplier payment recorded. This is an accounting entry, not an automatic transfer.');
   paymentRequest.current='';setAmount('');setReference('');setNotes('');await refresh();}
  catch(e){setError(waitError(e));}finally{setBusy(false);}
 };
 if(!data.financeAvailable)return <section className="panel p-6 mt-5"><h3 className="font-bold text-xl">Supplier returns & payments</h3>
  <p className="notice mt-3" role="status">Migration 16 is not applied yet. Purchasing and goods receiving still work; apply <code>16_purchase_returns_payments.sql</code> to enable finance features.</p></section>;
 return <section className="space-y-5 mt-5" data-testid="supplier-finance">
  <div className="panel p-6 space-y-4"><h3 className="font-bold text-xl flex gap-2 items-center"><CreditCard size={20}/> Supplier accounting</h3>
   <p className="text-sm text-[#806d60]">Received goods create the payable amount. Returns create supplier credits. Payments must be recorded after actually paying your supplier.</p>
   {!live&&<div className="notice">Demo only: records are stored in this browser, not transferred to a supplier.</div>}
   <label className="field">Purchase order<select value={orderId} onChange={e=>selectOrder(e.target.value)}>
     <option value="">Select purchase order</option>{data.orders.map(o=><option value={o.id} key={o.id}>{supplier(o)} · {o.id.slice(0,8)} · {o.status}</option>)}
   </select></label>
   {order&&balance&&<div className="grid grid-cols-2 md:grid-cols-5 gap-2">{[
    ['Received value',balance.received_value],['Returned value',balance.returned_value],['Paid',balance.paid_value],
    ['Outstanding',balance.outstanding_value],['Supplier credit',balance.supplier_credit]
   ].map(([label,value])=><div key={label} className="bg-[#fff8ee] rounded-xl p-3"><span className="text-xs text-[#8b776c]">{label}</span><p className="font-bold mt-1">{bdt(Number(value))}</p></div>)}</div>}
   <p className="text-xs text-[#907d71]">Supplier credit is overpayment after goods returns. It is not a confirmed supplier refund; reconcile externally.</p>
   {error&&<p className="notice-error" role="alert">{error}</p>}
   {notice&&<p className="text-green-800 font-semibold" role="status">{notice}</p>}
  </div>
  {order&&<div className="grid lg:grid-cols-2 gap-5">
   <section className="panel p-6"><h3 className="font-bold text-xl flex items-center gap-2"><RotateCcw size={18}/> Return received goods</h3>
    <p className="text-xs text-[#8b766a] my-3">Choose a goods receipt and enter only quantities physically returned. Available ingredient stock must cover the return.</p>
    <form className="space-y-3" onSubmit={e=>void submitReturn(e)}><label className="field">Goods receipt<select value={receiptId} onChange={e=>{setReceiptId(e.target.value);setQuantities({});setReturnDirty();}}>
     <option value="">Select receipt</option>{receipts.map(r=><option key={r.id} value={r.id}>{new Date(r.received_at).toLocaleString('en-BD',{timeZone:'Asia/Dhaka'})} · {r.id.slice(0,8)}</option>)}
    </select></label>
    {receipt&&returnLines.map(line=>{const source=order.purchase_order_lines.find(l=>l.id===line.order_line_id);const left=remainingReturnQuantity(line,data.returns);return <label className="field" key={line.order_line_id}>
      {ingredient(source?.ingredient_id||'')} · Max {left} {units.get(source?.ingredient_id||'')||''} · {bdt(line.unit_cost_snapshot)}/unit
      <input type="number" min="0" max={left} step={units.get(source?.ingredient_id||'')==='piece'?'1':'0.001'} value={quantities[line.order_line_id]??''} placeholder="0"
       onChange={e=>{setQuantities(prev=>({...prev,[line.order_line_id]:e.target.value}));setReturnDirty();}}/>
    </label>})}
    {receipt&&!returnLines.length&&<p className="text-sm">This receipt has no remaining quantities eligible for return.</p>}
    <label className="field">Reason for return<input maxLength={300} required minLength={3} value={reason} placeholder="Damaged / supplier replacement"
      onChange={e=>{setReason(e.target.value);setReturnDirty();}}/></label>
    <button className="btn-primary" disabled={busy||!requestedLines.length||!reason.trim()}> <ArrowDownLeft size={16}/> Confirm goods return</button>
    </form></section>
   <section className="panel p-6"><h3 className="font-bold text-xl flex items-center gap-2"><CreditCard size={18}/> Record supplier payment</h3>
    <p className="text-xs text-[#8b766a] my-3">Enter payments made outside the website. This form does not send money.</p>
    <form className="space-y-3" onSubmit={e=>void submitPayment(e)}>
    <label className="field">Amount (BDT)<input type="number" required min="0.01" step="0.01" max={balance?.outstanding_value||0} value={amount} placeholder="0.00"
      onChange={e=>{setAmount(e.target.value);setPaymentDirty();}}/></label>
    <label className="field">Payment method<select value={method} onChange={e=>{setMethod(e.target.value as SupplierPaymentMethod);setPaymentDirty();}}>
      {SUPPLIER_PAYMENT_METHODS.map(m=><option key={m} value={m}>{m.toUpperCase()}</option>)}</select></label>
    <label className="field">Payment date<input type="date" required max={todayDhaka()} value={paidOn} onChange={e=>{setPaidOn(e.target.value);setPaymentDirty();}}/></label>
    <label className="field">Transaction reference (optional)<input maxLength={120} value={reference} onChange={e=>{setReference(e.target.value);setPaymentDirty();}}/></label>
    <label className="field">Notes<input maxLength={300} value={notes} onChange={e=>{setNotes(e.target.value);setPaymentDirty();}}/></label>
    <button className="btn-primary" disabled={busy||!(balance&&Number(balance.outstanding_value)>0)||!amount}>Record payment</button>
    </form></section>
   </div>}
  <div className="grid lg:grid-cols-2 gap-5">
   <section className="panel p-6 overflow-x-auto"><h3 className="text-lg font-bold mb-4">Recent supplier returns</h3>
    <table className="admin-table"><thead><tr><th>Date</th><th>Return</th><th>Credit</th></tr></thead><tbody>{data.returns.map(r=><tr key={r.id}>
     <td>{new Date(r.created_at).toLocaleDateString('en-BD',{timeZone:'Asia/Dhaka'})}</td><td><strong>{r.id.slice(0,8)}</strong><small className="block">{r.reason}</small></td>
     <td>{bdt(r.purchase_return_lines.reduce((s,l)=>s+l.quantity*l.unit_cost_snapshot,0))}</td></tr>)}</tbody></table>
    {!data.returns.length&&<p className="text-sm">No supplier returns recorded.</p>}
   </section>
   <section className="panel p-6 overflow-x-auto"><h3 className="text-lg font-bold mb-4">Recent supplier payments</h3>
    <table className="admin-table"><thead><tr><th>Date</th><th>Method</th><th>Amount</th></tr></thead><tbody>{data.payments.map(p=><tr key={p.id}>
     <td>{p.paid_on}</td><td>{p.payment_method.toUpperCase()}<small className="block">{p.reference}</small></td><td>{bdt(p.amount)}</td></tr>)}</tbody></table>
    {!data.payments.length&&<p className="text-sm">No supplier payments recorded.</p>}
   </section>
  </div>
 </section>;
}
