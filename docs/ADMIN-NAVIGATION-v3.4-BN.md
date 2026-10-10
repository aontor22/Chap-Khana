# Chap Khana v3.4 — Admin access and navigation

## Root cause and changes

**Previous behavior**: `isStaff()` was called only after opening `/admin`. The site header and Account page never checked staff membership. The desktop header had no Admin shortcut; the mobile menu had a staff link for everyone.

**Updated behavior**: The shared ShopContext checks `public.admin_users` for the current authenticated Supabase user. The check is keyed to the user's UUID so a result from another session cannot be reused. Google profile email and metadata never grant admin access.

- Authorized staff: compact **Admin** button in the desktop/tablet header; Staff Dashboard item in mobile navigation; Account page's **Manage Chap Khana** shortcut; footer shortcut.
- After normal Google sign-in, authorized staff go to `/admin`, normal customers to `/account`.
- Non-staff visitors do not see staff shortcuts and cannot access the dashboard by typing `/admin` directly (the page also checks authorization). Supabase RLS remains the actual backend security boundary.
- If an administrator is newly approved while already signed in, use **Recheck staff access**. Login/logout/session switching re-evaluates access.
- On logout or role removal, old admin dashboard data is cleared from the React view. Transient membership-check errors show a retry action.
- English and Bangla labels included; no menu, discount, order or SQL changes.

## Do I need to run a new SQL migration?

**No.** This is a React/UX change. Keep migrations 01/03/04/05/06 as already installed. Do not rerun SQL or reset the database for this upgrade.

If the header Admin link is missing for an intended staff member:
1. Sign in with the intended Google account and open **My account**.
2. Select **Recheck staff access**, or sign out and sign in again.
3. In the Supabase Dashboard → Authentication → Users, confirm that account exists.
4. In Supabase SQL Editor, verify that the same user UUID appears in the `admin_users` allowlist:

```sql
SELECT u.email, u.id AS auth_user_id, (a.user_id IS NOT NULL) AS is_admin
FROM auth.users u
LEFT JOIN public.admin_users a ON a.user_id = u.id
WHERE lower(u.email) = lower('YOUR_ADMIN_EMAIL@gmail.com');
```

If `is_admin` is `false` and you are authorized to grant access, insert **only that account** from the Supabase SQL Editor:

```sql
INSERT INTO public.admin_users (user_id)
SELECT id FROM auth.users
WHERE lower(email) = lower('YOUR_ADMIN_EMAIL@gmail.com')
ON CONFLICT (user_id) DO NOTHING;
```

**Never** insert admin users from frontend JavaScript, trust Google `user_metadata.role`, or expose a service-role key in Vite/Vercel.

## Manual acceptance checklist

1. Authorized Google login from `/account` → `/auth/callback` → `/admin`.
2. Authorized staff visits `/` → Admin button shown in desktop and tablet header.
3. Authorized staff on small screen → Staff Dashboard link in mobile menu.
4. Authorized staff on `/account` → Manage Chap Khana card leads to `/admin`.
5. Customer Google login → `/account`; no Admin link in header, mobile menu, footer, or account card.
6. Customer manually enters `/admin` → access denied; cannot read or mutate staff data.
7. An approved user already logged in taps Recheck Staff Access → role updates without logout.
8. Authorized user logs out → admin navigation disappears and dashboard data is cleared.
9. Temporarily block role query (network offline) → retry message, no privileged dashboard.
10. Verify menu, order, cart and per-item discounts are unchanged.

## Codespaces commands

```bash
npm ci
npm run test:catalog
npm test
npm run typecheck
npm run build
```

If checks succeed, push to GitHub (`git add -A && git commit -m "Improve admin navigation and auth routing" && git push origin main`). Vercel will redeploy if linked.

Official docs:
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://reactrouter.com/start/declarative/navigating
