# v3 — Brand and menu catalog update

- Added the logo recreation from the supplied printed menus to the navigation, footer, admin dashboard, item placeholders and favicon.
- Imported 56 visible public menu items and 37 hidden draft entries from historical/possibly other-branch menus.
- Introduced 12 compatible menu categories (10 with public items and 2 used by historical drafts), automatically hiding empty categories from customers.
- Preserved unknown/variable prices as null, blocking add-to-cart for those items.
- Added a Supabase migration that inserts catalog entries without deleting existing orders or overwriting existing non-null item prices.
- Updated demo menu storage key to v3 so previous 6-item demo catalog cache does not mask the new menu.
- Added built-in Node.js catalog tests and CI integration.
- Documented unclear prices, owner approvals, outstanding QA steps and build blocker.

**Status:** Catalog tests and TS/TSX syntax tests passed. Full npm build, browser E2E and live Supabase migration have not been verified in this environment.
