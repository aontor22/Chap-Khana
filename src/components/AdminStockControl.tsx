import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, CalendarDays, ClipboardCheck, RefreshCw, Trash2 } from 'lucide-react';
import { getStockControlSnapshot, recordInventoryWaste, startInventoryStocktake, postInventoryStocktake, splitInventoryLot, tagInventoryLot } from '../data/api';
import { EMPTY_STOCK_CONTROL, batchExpiryStatus, stocktakeChanges, validateStocktakeCounts, validateWaste, validBatchAmount, type ExpiryLot, type StockControlSnapshot } from '../lib/stockControl';
import type { Ingredient, InventoryKind, MenuStock } from '../lib/inventory';
import type { MenuItem } from '../types';
import { waitError } from '../lib/utils';

type Panel='lots'|'waste'|'counts';
export default function AdminStockControl({live,ingredients,menuStock,dishes,onInventoryChange}:{live:boolean;ingredients:Ingredient[];menuStock:MenuStock[];dishes:MenuItem[];onInventoryChange:()=>Promise<void>}){
 const [data,setData]=useState<StockControlSnapshot>(EMPTY_STOCK_CONTROL);
 const [panel,setPanel]=useState<Panel>('lots');const [loading,setLoading]=useState(false);const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');const [message,setMessage]=useState('');
 const [lotId,setLotId]=useState('');const [batch,setBatch]=useState('');const [expiry,setExpiry]=useState('');
 const [splitQty,setSplitQty]=useState('');const [splitCode,setSplitCode]=useState('');const [splitExpiry,setSplitExpiry]=useState('');
 const [kind,setKind]=useState<InventoryKind>('ingredient');const [wasteId,setWasteId]=useState('');const [wasteQty,setWasteQty]=useState('');const [wasteReason,setWasteReason]=useState('');const [wasteLot,setWasteLot]=useState('');
 const [notes,setNotes]=useState('');const [counts,setCounts]=useState<Record<string,string>>({});
 const wasteRetry=useRef<{fingerprint:string;requestId:string}|null>(null);
 const refresh=useCallback(async()=>{if(!live)return;setLoading(true);try{setData(await getStockControlSnapshot());setError('');}catch(e){setError(waitError(e));}finally{setLoading(false);}},[live]);
 useEffect(()=>{void refresh();},[refresh]);
 const run=async(task:()=>Promise<unknown>,success:string)=>{if(busy)return false;setBusy(true);setError('');setMessage('');try{await task();await refresh();await onInventoryChange();setMessage(success);return true;}catch(e){setError(waitError(e));return false;}finally{setBusy(false);}};
 const chosenLot=data.lots.find(l=>l.id===lotId);
 const chosenIng=ingredients.find(i=>i.id===chosenLot?.ingredient_id);
 const expired=useMemo(()=>data.lots.filter(l=>l.remaining_qty>0&&batchExpiryStatus(l.expires_on)==='expired'),[data.lots]);
 const soon=useMemo(()=>data.lots.filter(l=>l.remaining_qty>0&&batchExpiryStatus(l.expires_on)==='soon'),[data.lots]);
 const unknown=useMemo(()=>data.lots.filter(l=>l.remaining_qty>0&&!l.expires_on),[data.lots]);
 const stocks=kind==='ingredient'?ingredients.map(i=>({id:i.id,name:i.name,qty:i.on_hand,unit:i.unit})):menuStock.map(i=>({id:i.menu_item_id,name:dishes.find(d=>d.id===i.menu_item_id)?.name||i.menu_item_id,qty:i.on_hand,unit:'servings'}));
 const wasteTarget=stocks.find(i=>i.id===wasteId);
 const eligibleLots=data.lots.filter(l=>kind==='ingredient'&&l.ingredient_id===wasteId&&l.remaining_qty>0);
 const chosenWasteLot=eligibleLots.find(l=>l.id===wasteLot);
 const selectedTake=data.stocktakes.find(t=>t.status==='draft');
 const lines=data.lines.filter(l=>l.stocktake_id===selectedTake?.id).sort((a,b)=>(ingredients.find(i=>i.id===a.ingredient_id)?.name||'').localeCompare(ingredients.find(i=>i.id===b.ingredient_id)?.name||''));
 const selectLot=(lot:ExpiryLot)=>{setLotId(lot.id);setBatch(lot.batch_code);setExpiry(lot.expires_on||'');setSplitQty('');setSplitCode('');setSplitExpiry('');};
 const saveLot=async(e:FormEvent)=>{e.preventDefault();if(!chosenLot)return;
  await run(()=>tagInventoryLot(chosenLot.id,batch.trim(),expiry||null),'Batch details saved. This does not add stock.');};
 const makeSplit=async(e:FormEvent)=>{e.preventDefault();if(!chosenLot||!chosenIng)return;
  const qty=Number(splitQty);
  if(!validBatchAmount(qty,chosenIng.unit)||qty>=chosenLot.remaining_qty){setError('Split a valid quantity, leaving some stock in the source batch.');return;}
  if(splitCode.length>80){setError('Batch code must be 80 characters or fewer.');return;}
  if(await run(()=>splitInventoryLot(chosenLot.id,qty,splitCode.trim(),splitExpiry||null),'Batch split: total ingredient stock unchanged.')){setLotId('');setSplitQty('');}};
 const makeWaste=async(e:FormEvent)=>{e.preventDefault();if(!wasteTarget)return;
  const qty=Number(wasteQty);const warning=validateWaste(qty,wasteTarget.unit as Ingredient['unit']|'servings',wasteReason,wasteLot&&chosenWasteLot?chosenWasteLot.remaining_qty:wasteTarget.qty);
  if(warning){setError(warning);return;}
  const fingerprint=JSON.stringify([kind,wasteId,qty,wasteReason.trim(),wasteLot||null]);
  if(wasteRetry.current?.fingerprint!==fingerprint)wasteRetry.current={fingerprint,requestId:crypto.randomUUID()};
  if(await run(()=>recordInventoryWaste(kind,wasteId,qty,wasteReason.trim(),wasteLot||null,wasteRetry.current!.requestId),'Waste recorded. Stock and batch quantities updated.')){wasteRetry.current=null;setWasteQty('');setWasteReason('');setWasteLot('');}};
 const createTake=async()=>{if(notes.length>300){setError('Stocktake notes must be within 300 characters.');return;}
  if(await run(()=>startInventoryStocktake(notes),'Stocktake started. Physically count every listed ingredient.')){setNotes('');setCounts({});setPanel('counts');}};
 const submitTake=async()=>{if(!selectedTake)return;const reason=validateStocktakeCounts(lines,counts,ingredients);if(reason){setError(reason);return;}
  const changes=stocktakeChanges(lines,counts);
  if(!window.confirm(`Post physical stock count for ${lines.length} ingredients? ${changes} balance(s) will change. This cannot be undone.`))return;
  const payload=lines.map(l=>({ingredient_id:l.ingredient_id,counted:Number(counts[l.ingredient_id])}));
  if(await run(()=>postInventoryStocktake(selectedTake.id,payload),'Physical stocktake posted and audited.'))setCounts({});};
 if(!live)return <section className="panel p-6" data-testid="stock-control"><h3 className="font-bold text-xl">Waste, expiry & stocktaking</h3><p className="notice mt-4">Available in connected Supabase staff mode after SQL migration 17. Browser demo cannot simulate live batch allocations.</p></section>;
 return <div className="space-y-5" data-testid="stock-control">
  <section className="panel p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-xl">Waste, expiry & physical counts</h3><p className="text-sm text-[#8c7569] mt-1">Batches follow earliest-expiry-first allocation; expired stock is excluded from new orders. Waste needs manual disposal.</p></div><button disabled={busy||loading} className="btn-secondary" onClick={()=>void refresh()}><RefreshCw size={16}/> Refresh</button></div>
   {error&&<p className="notice-error mt-4" role="alert">{error}{error.includes('inventory_expiry_lots')||error.includes('inventory_stocktakes')?' — Apply SQL migration 17 first.':''}</p>}
   {message&&<p className="text-green-800 font-semibold mt-3" role="status">{message}</p>}
   {!data.available&&!loading&&<p className="notice mt-3">SQL migration 17 is required before these controls can load.</p>}
   {data.available&&<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">{[['Batches',data.lots.length],['Expired lots',expired.length],['Expiring ≤7 days',soon.length],['Unknown expiry',unknown.length]].map(([title,n])=><div key={title} className="rounded-xl bg-[#fff8ee] p-3"><span className="text-xs text-[#927665]">{title}</span><strong className="block text-2xl mt-1">{n}</strong></div>)}</div>}
   {(expired.length>0||unknown.length>0)&&<p role="status" className="notice mt-4 flex gap-2"><AlertTriangle size={18}/> {expired.length} expired lot(s) unavailable for orders when enforcement is ON; {unknown.length} lot(s) have no expiry date and remain usable. Inspect and record waste as required.</p>}
  </section>
  <div className="flex flex-wrap gap-2" role="tablist">{(['lots','waste','counts'] as Panel[]).map(tab=><button role="tab" aria-selected={panel===tab} key={tab} className={`category-pill ${panel===tab?'selected':''}`} onClick={()=>{setPanel(tab);setError('');}}>{tab==='lots'?'Expiry batches':tab==='waste'?'Record waste':'Physical stocktake'}</button>)}</div>
  {panel==='lots'&&<><section className="panel p-6 overflow-x-auto"><h4 className="font-bold text-lg mb-3 flex items-center gap-2"><CalendarDays size={18}/> Expiry batches</h4><p className="text-sm text-[#897469] mb-4">Stock received through purchasing or adjustments creates an untagged batch automatically. Add its expiry date; split mixed deliveries into separate lots without changing stock.</p><table className="admin-table"><thead><tr><th>Ingredient</th><th>Batch</th><th>Remaining</th><th>Expiry</th><th>Action</th></tr></thead><tbody>{data.lots.filter(l=>l.remaining_qty>0).map(l=>{const status=batchExpiryStatus(l.expires_on);return <tr key={l.id}><td>{ingredients.find(i=>i.id===l.ingredient_id)?.name||l.ingredient_id}</td><td>{l.batch_code||'Untagged'}</td><td>{l.remaining_qty} {ingredients.find(i=>i.id===l.ingredient_id)?.unit}</td><td className={status==='expired'?'text-red-700 font-bold':status==='soon'?'text-amber-700 font-bold':''}>{l.expires_on||'Unknown'} ({status})</td><td><button type="button" className="btn-secondary !py-2" onClick={()=>selectLot(l)}>Manage</button></td></tr>;})}</tbody></table>{!data.lots.some(l=>l.remaining_qty>0)&&<p className="mt-3 text-sm">No available ingredient lots.</p>}</section>
   {chosenLot&&<section className="panel p-6 space-y-5"><h4 className="font-bold text-lg">Manage batch · {chosenIng?.name||'Ingredient'}</h4><p className="text-sm">Available: {chosenLot.remaining_qty} {chosenIng?.unit}. Tagging or splitting does not change the physical total.</p><form onSubmit={e=>void saveLot(e)} className="grid sm:grid-cols-3 gap-4"><label className="field">Batch / lot number<input maxLength={80} value={batch} onChange={e=>setBatch(e.target.value)}/></label><label className="field">Best-before / expiry<input type="date" min="2000-01-01" max="2100-12-31" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label><div className="flex items-end"><button disabled={busy} className="btn-primary w-full justify-center">Save batch</button></div></form>
    <form onSubmit={e=>void makeSplit(e)} className="grid sm:grid-cols-4 gap-4 pt-4 border-t border-[#eedac8]"><label className="field">Split amount ({chosenIng?.unit})<input required type="number" min="0.001" step={chosenIng?.unit==='piece'?'1':'0.001'} value={splitQty} onChange={e=>setSplitQty(e.target.value)}/></label><label className="field">New lot number<input maxLength={80} value={splitCode} onChange={e=>setSplitCode(e.target.value)}/></label><label className="field">New lot expiry<input type="date" min="2000-01-01" max="2100-12-31" value={splitExpiry} onChange={e=>setSplitExpiry(e.target.value)}/></label><div className="flex items-end"><button disabled={busy} className="btn-secondary w-full justify-center">Split batch</button></div></form>
    <button className="text-sm underline" onClick={()=>setLotId('')}>Close batch editor</button></section>}
  </>}
  {panel==='waste'&&<section className="panel p-6"><h4 className="font-bold text-lg flex items-center gap-2"><Trash2 size={18}/> Record waste / expired disposal</h4><p className="text-sm text-[#8d766d] mt-2">Always record actual discarded quantities, never expected losses. One submission creates an audited negative stock movement.</p><form onSubmit={e=>void makeWaste(e)} className="grid sm:grid-cols-2 gap-4 mt-5">
   <label className="field">Stock type<select value={kind} onChange={e=>{setKind(e.target.value as InventoryKind);setWasteId('');setWasteLot('');}}><option value="ingredient">Raw ingredient</option><option value="menu">Finished menu servings</option></select></label>
   <label className="field">Item<select required value={wasteId} onChange={e=>{setWasteId(e.target.value);setWasteLot('');}}><option value="">Choose stock</option>{stocks.filter(s=>s.qty>0).map(i=><option key={i.id} value={i.id}>{i.name} · {i.qty} {i.unit}</option>)}</select></label>
   {kind==='ingredient'&&<label className="field">Expiry lot (optional)<select value={wasteLot} onChange={e=>setWasteLot(e.target.value)}><option value="">Earliest expiry first</option>{eligibleLots.map(l=><option key={l.id} value={l.id}>{l.batch_code||'Untagged'} · {l.remaining_qty} · {l.expires_on||'unknown expiry'}</option>)}</select></label>}
   <label className="field">Quantity ({wasteTarget?.unit||'unit'})<input required type="number" min="0.001" step={wasteTarget?.unit==='piece'||wasteTarget?.unit==='servings'?'1':'0.001'} value={wasteQty} onChange={e=>setWasteQty(e.target.value)}/></label>
   <label className="field sm:col-span-2">Reason<input required minLength={2} maxLength={190} placeholder="Expired, damaged, spoiled, kitchen waste…" value={wasteReason} onChange={e=>setWasteReason(e.target.value)}/></label>
   <div className="sm:col-span-2"><button disabled={busy||!wasteTarget} className="btn-primary"><Trash2 size={16}/> Record waste</button></div>
  </form></section>}
  {panel==='counts'&&<section className="panel p-6"><h4 className="font-bold text-lg flex items-center gap-2"><ClipboardCheck size={19}/> Physical stocktake</h4><p className="text-sm text-[#8d766d] mt-2">Starts a snapshot of all tracked, active ingredients. Count them physically, including zero quantities. Posting fails safely if stock changed since the snapshot.</p>
    {!selectedTake?<div className="mt-5 space-y-3"><label className="field">Notes<input value={notes} maxLength={300} placeholder="End-of-day stock count" onChange={e=>setNotes(e.target.value)}/></label><button disabled={busy||!data.available} className="btn-primary" onClick={()=>void createTake()}>Start stocktake</button></div>:<div className="mt-5"><p className="font-semibold">Draft {selectedTake.id.slice(0,8)} · {lines.length} ingredients</p><div className="overflow-x-auto mt-3"><table className="admin-table"><thead><tr><th>Ingredient</th><th>System quantity</th><th>Physical count</th></tr></thead><tbody>{lines.map(line=>{const i=ingredients.find(x=>x.id===line.ingredient_id);return <tr key={line.ingredient_id}><td>{i?.name||line.ingredient_id}</td><td>{line.expected_qty} {i?.unit}</td><td><input className="min-w-28 max-w-40" aria-label={`Physical count for ${i?.name||line.ingredient_id}`} type="number" min="0" step={i?.unit==='piece'?'1':'0.001'} placeholder="Enter count" value={counts[line.ingredient_id]??''} onChange={e=>setCounts(prev=>({...prev,[line.ingredient_id]:e.target.value}))}/></td></tr>;})}</tbody></table></div><button disabled={busy||!lines.length} className="btn-primary mt-5" onClick={()=>void submitTake()}>Post verified counts</button><p className="mt-3 text-xs text-[#907d6d]">Never post estimates: every change adjusts stock and creates an inventory movement. If stock changed, start a fresh count after reviewing the discrepancy.</p></div>}
    {data.stocktakes.some(t=>t.status==='posted')&&<div className="mt-6 pt-4 border-t border-[#efdecd]"><strong className="text-sm">Recent posted stocktakes</strong>{data.stocktakes.filter(t=>t.status==='posted').slice(0,5).map(t=><p key={t.id} className="text-sm mt-2">{t.posted_at?.slice(0,16)} · {t.notes||t.id.slice(0,8)}</p>)}</div>}
  </section>}
 </div>;
}
