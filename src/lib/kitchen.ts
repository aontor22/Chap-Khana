import type { Fulfillment, Order, OrderStatus } from '../types';

export const KITCHEN_ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'] as const;
export type KitchenColumn = 'pending'|'confirmed'|'preparing'|'handoff';
export const KITCHEN_COLUMNS: {key:KitchenColumn; title:string; subtitle:string}[] = [
  {key:'pending', title:'New orders', subtitle:'Awaiting confirmation'},
  {key:'confirmed', title:'Confirmed', subtitle:'Waiting to start cooking'},
  {key:'preparing', title:'Preparing', subtitle:'In the kitchen'},
  {key:'handoff', title:'Ready / delivery', subtitle:'Handoff and completion'},
];
export type KitchenOrder = Pick<Order,'id'|'code'|'status'|'fulfillment_type'|'created_at'|'updated_at'|'notes'|'order_items'>;

export function kitchenColumn(status:OrderStatus):KitchenColumn|null {
  if(status==='ready'||status==='out_for_delivery')return 'handoff';
  if(status==='pending'||status==='confirmed'||status==='preparing')return status;
  return null;
}
export function kitchenNext(status:OrderStatus, fulfillment:Fulfillment):OrderStatus|null {
  switch(status) {
    case 'pending':return 'confirmed';
    case 'confirmed':return 'preparing';
    case 'preparing':return 'ready';
    case 'ready':return fulfillment==='delivery'?'out_for_delivery':'completed';
    case 'out_for_delivery':return 'completed';
    default:return null;
  }
}
export const KITCHEN_ACTION_LABEL:Partial<Record<OrderStatus,string>>={
  confirmed:'Confirm order',preparing:'Start cooking',ready:'Mark ready',
  out_for_delivery:'Hand over to rider', completed:'Complete order',
};
export function queueMinutes(createdAt:string,now=Date.now()):number {
  const timestamp=Date.parse(createdAt);
  return Number.isFinite(timestamp)?Math.max(0,Math.floor((now-timestamp)/60000)):0;
}
export function groupKitchenOrders(orders:readonly KitchenOrder[]):Record<KitchenColumn,KitchenOrder[]> {
  const grouped:Record<KitchenColumn,KitchenOrder[]>={pending:[],confirmed:[],preparing:[],handoff:[]};
  for(const order of orders){const column=kitchenColumn(order.status);if(column)grouped[column].push(order);}
  for(const column of KITCHEN_COLUMNS)grouped[column.key].sort((a,b)=>a.created_at.localeCompare(b.created_at));
  return grouped;
}
export function kitchenUrgency(minutes:number):'normal'|'watch'|'late' {
  return minutes>=30?'late':minutes>=15?'watch':'normal';
}
