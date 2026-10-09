# Chap Khana — Per-item discount (v3.3.0)

## কী পাওয়া যাবে
- Admin > Menu > Edit থেকে প্রতিটি খাবারে আলাদাভাবে **No discount / Percentage (%) / Fixed discount (৳)** সেট করা যাবে।
- আগে থেকে থাকা price-ই **base price**; discount ওই দাম থেকে বাদ যাবে। একেবারে ০ টাকা করা যাবে না।
- Customer-কে menu, cart, checkout-এ original price, savings এবং discounted subtotal দেখাবে।
- Order submit করলে browser দাম পাঠায় না; Supabase নিজের `menu_items` row থেকে discount হিসাব করে।
- `order_items.unit_price` হল **paid discounted price**। `original_unit_price` ও `discount_unit_amount` snapshot থাকে। পুরোনো order হিসাব অপরিবর্তিত।

## প্রয়োজনীয় Supabase SQL
আপনার পুরোনো 01, 03, 04 এবং প্রয়োজনে 05 migration আগে করা থাকলে Supabase SQL Editor-এ **শুধু**:

`supabase/migrations/06_item_discounts.sql`

run করুন। SQL success না হওয়া পর্যন্ত নতুন frontend deploy করবেন না; তা না হলে discount save ব্যর্থ হতে পারে।

## ব্যবহার
1. Vercel নতুন version-এ deploy করার আগে `06_item_discounts.sql` চালান।
2. `/admin`-এ Google/staff account দিয়ে login করুন।
3. **Menu → Edit → Item discount**: percentage/fixed select করুন এবং মান দিন।
4. Preview ও crossed-out price দেখে **Save dish** চাপুন।
5. Website refresh করে menu → cart → checkout-এ একই amount দেখুন।
6. Settings-এ ordering active থাকলে **সাবধানে TEST order** করে Supabase `orders` ও `order_items` inspect করুন।

## Verification SQL
```sql
SELECT id,name,price,discount_type,discount_value
FROM public.menu_items WHERE discount_type <> 'none'
ORDER BY name;

SELECT o.code, o.subtotal, o.delivery_fee, o.total,
       i.item_name, i.original_unit_price, i.discount_unit_amount,
       i.unit_price, i.qty, i.line_total
FROM public.orders o JOIN public.order_items i ON i.order_id=o.id
ORDER BY o.created_at DESC LIMIT 20;
```

## Notes
- Discount only applies to **newly placed orders**. Previously saved orders never recalculate.
- Percentage price is rounded to the nearest whole taka (minimum ৳1).
- Fixed discount must be strictly below the original price.
- Customer cart may be briefly stale while staff edits a price. Database is the final authority at checkout.
- This release does not add timed promotions, coupons or site-wide discounts.
- Existing v3.2.2 npm security warnings are a separate task; this feature does not claim they are resolved.
