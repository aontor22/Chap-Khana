import {describe,it,expect} from 'vitest';
import {journeySteps,orderStatusLabel,orderHelp,shouldPollOrder} from '../src/lib/orderJourney';
import {RECEIPT_TTL_MS,validSavedReceipt,privateTrackingPath} from '../src/lib/orderReceipt';
const uuid='6b6d5b30-e4b1-45f8-9374-582932b8a135';
const now=1_900_000_000_000;
const receipt={code:'CK-101',tracking_token:uuid,total:200,demo:false,type:'pickup' as const,lines:[{name:'Chicken Chap',qty:2}],savedAt:now-1000};
describe('order journey and confirmation privacy',()=>{
 it('shows delivery only for delivery, and correct progress',()=>{
  const pickup=journeySteps('ready','pickup','en');
  expect(pickup.map(s=>s.status)).not.toContain('out_for_delivery');
  expect(pickup.find(s=>s.status==='ready')?.current).toBe(true);
  expect(pickup.find(s=>s.status==='completed')?.reached).toBe(false);
  expect(journeySteps('out_for_delivery','delivery','en').find(s=>s.status==='out_for_delivery')?.current).toBe(true);
 });
 it('keeps cancelled separate from completed and stops terminal polling',()=>{
  expect(journeySteps('cancelled','pickup','en')).toEqual([]);
  expect(shouldPollOrder('cancelled')).toBe(false);
  expect(shouldPollOrder('completed')).toBe(false);
  expect(shouldPollOrder('pending')).toBe(true);
  expect(shouldPollOrder(null)).toBe(false);
 });
 it('supports Bangla status descriptions',()=>{
  expect(orderStatusLabel('pending','bn')).toContain('অপেক্ষায়');
  expect(orderHelp('ready','pickup','bn')).toContain('সংগ্রহ');
 });
 it('accepts only short-lived minimal order confirmation',()=>{
  expect(validSavedReceipt(receipt,now)).toBe(true);
  expect(validSavedReceipt({...receipt,savedAt:now-RECEIPT_TTL_MS},now)).toBe(false);
  expect(validSavedReceipt({...receipt,tracking_token:'ABC'},now)).toBe(false);
  expect(validSavedReceipt({...receipt,total:NaN},now)).toBe(false);
  expect(validSavedReceipt({...receipt,lines:[{name:'Dish',qty:21}]},now)).toBe(false);
 });
 it('encodes private tracking paths',()=>{
  expect(privateTrackingPath(uuid)).toBe(`/track?token=${uuid}`);
 });
});
