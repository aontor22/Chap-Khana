# Chap Khana v3.7 — Real-time Order Alerts (Phase 2)

## What's included

- Admin Dashboard shows a visible alert when a **new order** is detected.
- Orders navigation shows an unread count. **View orders** / **Dismiss** clears it.
- **Enable sound** is an opt-in control (browser autoplay restrictions). Turning it on plays a short test chime. Sound starts OFF after reload.
- Authenticated staff receive Supabase `INSERT` / `UPDATE` order changes after SQL 09 is applied.
- A 20-second polling fallback runs even if Realtime isn't enabled, drops out, or is blocked.
- Staff subscriptions are cleaned up on logout, account changes, and navigation away from the dashboard.
- No additional payment permissions, public order SELECT grants, or credentials are introduced.

## Setup order

**You can safely merge, test, push, and deploy the v3.7 React code now without SQL 09.** In that state, the alert may arrive up to ~20 seconds after an order is placed (polling fallback).

1. First finish the pending `supabase/migrations/08_launch_security.sql` security migration in your Supabase project (ideally staging first).
2. Then run the new `supabase/migrations/09_admin_order_realtime.sql` in SQL Editor.
3. Confirm that the Realtime publication includes `public.orders`:

```sql
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'orders';
```

The expected result contains one row for `public.orders`. The SQL changes **only the publication**; it does not remove orders, change menu pricing, or alter RLS.

## QA after deployment

1. Log in using the approved staff Google account and open `/admin`.
2. Check that the status indicator says **Realtime channel connected** after SQL 09. This alone does not prove table events are reaching the browser; test an order.
3. Click **Enable sound** (hear a short test chime). Keep dashboard tab open.
4. Create a safe test order from a *separate browser* with ordering deliberately enabled in staging.
5. Verify new-order alert appears, unread counter increases, and sound plays; click **View orders**.
6. Refresh the dashboard: historical orders must **not** trigger a new alert.
7. Change an order status: it should refresh the list but should **not** trigger a 'new order' alert.
8. Turn off sound and place another test order: UI alert should work silently.
9. Turn off Realtime / temporarily delay SQL 09: polling should still detect new orders within about 20 seconds while the tab is active (browser background throttling can delay timers).
10. Sign out: the old admin orders and alert state must disappear. A regular customer cannot access admin dashboard (RLS must enforce this).

## Important limitations

- These are **in-app alerts** while the admin dashboard is open; not push notifications when the browser is closed.
- Sound is opt-in every page load because browsers block automatic playback until interaction.
- Each admin browser session maintains its own unread counter. No cross-device unread synchronization.
- Dashboard still loads a maximum of 100 most recent orders; searchable history/pagination is the next planned phase.
- All staff data access is subject to existing Supabase RLS; `orders` replication publishes changes only to clients allowed by RLS. Avoid broad public order-reading policies.
- No live Supabase integration test was possible without connecting the owner's project.

References:
- https://supabase.com/docs/guides/realtime/postgres-changes
- https://supabase.com/docs/guides/realtime/authorization
- https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume
