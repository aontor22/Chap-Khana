export type Category = 'chap' | 'grill' | 'special' | 'sides';
export type Fulfillment = 'pickup' | 'delivery';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'completed' | 'cancelled';
export type Locale = 'en' | 'bn';
export interface MenuItem {
  id: string; category: Category; name: string; name_bn: string; description: string; description_bn: string;
  price: number | null; image_url: string; badge: string; sort_order: number; active: boolean; available: boolean;
}
export interface StoreSettings {
  id: number; accepting_orders: boolean; pickup_enabled: boolean; delivery_enabled: boolean;
  delivery_fee: number; updated_at?: string;
}
export interface OrderItem { id?: number; order_id?: string; menu_item_id?: string | null; item_name: string; unit_price: number; qty: number; line_total: number }
export interface Order {
  id: string; code: string; tracking_token: string; customer_user_id?: string | null; customer_name: string;
  customer_phone: string; fulfillment_type: Fulfillment; delivery_address: string; notes: string; status: OrderStatus;
  subtotal: number; delivery_fee: number; total: number; created_at: string; updated_at?: string; order_items?: OrderItem[];
}
export interface OrderReceipt { code: string; tracking_token: string; total: number; demo?: boolean }
export interface TrackingResult { code: string; status: OrderStatus; total: number; fulfillment_type: Fulfillment; created_at: string }
export interface CheckoutInfo { name: string; phone: string; type: Fulfillment; address: string; notes: string }
export type Cart = Record<string, number>;
