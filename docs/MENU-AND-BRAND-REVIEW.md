# Chap Khana menu / branding review (8–9 October 2026)

**Source:** Six screenshots/photographs supplied by the user in this chat. Photos were used as transcribing references, **not reproduced in the website**. Product illustrations are branded placeholders rather than inaccurate third-party food photos.

## What is included

- **56 public catalog entries:** 41 from the clearer Khilkhet/Namapara Bangla menu photo (including two shakes), plus **15 coffee items** from the Chap Khana coffee menu photo.
- **37 admin-only drafts:** older/possibly branch-specific black-background printed menu, including lunch, fish dishes, juices, borhani, desserts. Drafts have `active=false`, `available=false`. They do not show in the public catalog and cannot be ordered.
- Source of truth for this initial import: `src/data/menu-catalog.json`.
- Database sync: `supabase/migrations/04_brand_menu_catalog.sql`.

**Important:** Printed menu photos may be old and there are visible price conflicts between the black printed menus and the later beige Bangla menu. This project **does not** claim that any price is owner-confirmed. The online-ordering flag is not enabled by the import.

## Needs a price check before putting on sale

Nine published items have `price=null` to prevent accidental checkout at a guessed price:

1. Chicken Grill (Half)
2. Chicken Grill (Full)
3. Charcoal Grill (Half)
4. Charcoal Grill (Full)
5. Fresh Fruit Drink (small)
6. Fresh Fruit Drink (large)
7. Soft Drinks (MRP)
8. Mineral Water (MRP)
9. Chocolate Milk Shake

For these rows, the menu photos have two prices on one line, hard-to-read numbers or a market-price label. The admin should use the printed menu and staff to enter the **current final selling price** (or hide the item).

## Owner checklist

- [ ] Confirm the restaurant's right to use the Chap Khana name, logo and media.
- [ ] Obtain the original logo file, if available; replace `public/brand/chap-khana-logo.png`. Current asset is a **generated visual recreation** of the supplied menu design, not a pixel-identical/vector original.
- [ ] Confirm the Khilkhet branch is the right source for coffee items and all listed food.
- [ ] Review every unit price and ingredient/size variation, especially multiple serving sizes.
- [ ] Verify the nine ambiguous prices and all 37 older-menu items.
- [ ] Confirm restaurant phone/address, online-order service area, delivery fee, opening times, stock availability.
- [ ] Turn `accepting_orders` on only after these checks and live integration/abuse protection.

## SQL migration behavior

1. Run `01_fresh_schema.sql` for **new databases only**.
2. Run `03_production_hardening.sql` as instructed in the project's setup guide.
3. Run `04_brand_menu_catalog.sql` **once**. Re-running is idempotent.

The import inserts all 93 catalog rows. **Existing rows with non-null prices are never overwritten**, to preserve an owner's manual edits; rows with null prices may be upgraded from the original seed. It does not change any existing orders, checkout records, or order-acceptance settings. Original placeholder `grilled-chicken` is hidden only if its price is still unset.

**Changes to catalog data after you ran the SQL are not automatically synced.** For future menu updates, use the staff dashboard or a versioned migration. Do not run the entire fresh schema against a live project.
