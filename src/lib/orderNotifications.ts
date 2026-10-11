import type { Order } from '../types';

// Reconcile a server snapshot, never infer a new order from the first load.
// Compare database creation timestamps so older rows appearing in the 100-row
// window are not mistaken for newly placed orders.
export type OrderCursor = {
  initialized: boolean;
  knownIds: ReadonlySet<string>;
  latestCreatedAt: number | null;
};

export const emptyOrderCursor = (): OrderCursor => ({
  initialized: false,
  knownIds: new Set(),
  latestCreatedAt: null
});

export function reconcileOrderSnapshot(cursor: OrderCursor, next: readonly Order[]): {
  cursor: OrderCursor;
  newOrders: Order[];
} {
  const newest = next.reduce<number | null>((max, order) => {
    const timestamp = Date.parse(order.created_at);
    return Number.isFinite(timestamp) ? Math.max(max ?? timestamp, timestamp) : max;
  }, cursor.latestCreatedAt);

  const newOrders = cursor.initialized
    ? next.filter(order => {
        const created = Date.parse(order.created_at);
        return !cursor.knownIds.has(order.id) &&
          Number.isFinite(created) &&
          (cursor.latestCreatedAt === null || created >= cursor.latestCreatedAt);
      }).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    : [];

  return {
    cursor: {initialized: true, knownIds: new Set(next.map(o => o.id)), latestCreatedAt: newest},
    newOrders
  };
}
