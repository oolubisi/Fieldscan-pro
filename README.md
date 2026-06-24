# FieldScan Pro — Refactored Module Structure

Your monolithic `app.bundle.js` has been split into 17 focused, maintainable modules.

## Load Order (Dependency Chain)

Scripts must be loaded in this exact order in `index.html`:

| # | File | What it does | Depends on |
|---|------|--------------|------------|
| 1 | `config.js` | API endpoint, auth token, shared state sets | — |
| 2 | `utils.js` | DOM escaping, money math, GPS, image/PDF compression, toasts | `config.js` |
| 3 | `branding.js` | Logo, signature, footer helpers | `utils.js` |
| 4 | `db.js` | IndexedDB offline queue + snag photo storage | — |
| 5 | `backup.js` | `localStorage` cache backup, mutation map, stats | `utils.js` |
| 6 | `templates.js` | Master lists, built-in/custom templates, import/export | `utils.js`, `api.js`* |
| 7 | `api.js` | `callApi`, in-memory cache, sync engine, offline replay | `db.js`, `backup.js`, `utils.js` |
| 8 | `payment-helpers.js` | Payment staging, balance math, group data | `utils.js`, `api.js` |
| 9 | `workorder-helpers.js` | WO line items, total recalc, description formatter, WO detail report | `utils.js`, `api.js` |
| 10 | `reports.js` | All PDF/HTML report generators | `utils.js`, `api.js`, `payment-helpers.js`, `workorder-helpers.js` |
| 11 | `accounts.js` | Accounts view & project financial summary cards | `utils.js`, `api.js`, `payment-helpers.js` |
| 12 | `modals.js` | Every modal builder (project, take-off, vendor, WO, snag, payment) | `utils.js`, `api.js`, `payment-helpers.js`, `workorder-helpers.js`, `templates.js` |
| 13 | `dashboard.js` | Project list & vendor list rendering | `utils.js`, `api.js` |
| 14 | `console.js` | Project console hub + all segment loaders | `utils.js`, `api.js`, `templates.js`, `payment-helpers.js`, `modals.js` |
| 15 | `letterhead.js` | Letter editor, preview, PDF generation | `utils.js`, `api.js` |
| 16 | `variations.js` | Variation orders, PCR view, variation reports | `utils.js`, `api.js`, `reports.js`, `console.js` |
| 17 | `app.js` | Router (`showPage`), PWA install, service worker, init | **everything above** |

\* *Templates calls `api.js` functions only inside its own functions (runtime), so parse order is fine.*

## What Changed

- **No functional changes** — all logic, IDs, and behaviour are identical.
- **No new build step** — plain `<script>` tags, works exactly like before.
- **Easier debugging** — stack traces now point to specific files instead of a 280 KB bundle.
- **Easier collaboration** — multiple developers can work on different modules without constant merge conflicts.
- **Easier testing** — you can test `payment-helpers.js` or `reports.js` in isolation.

## Files in this package

```
fieldscan-refactor/
├── index.html          ← updated to load modules in order
├── config.js           ← constants & shared state
├── utils.js            ← pure helpers (escape, money, GPS, compression)
├── db.js               ← IndexedDB offline queue
├── backup.js           ← localStorage cache & mutation map
├── templates.js        ← take-off templates (built-in + custom)
├── api.js              ← GAS fetch, cache, sync engine
├── payment-helpers.js  ← payment staging & balance logic
├── workorder-helpers.js← WO line items & detail report
├── reports.js          ← all report generators
├── accounts.js         ← accounts view
├── modals.js           ← all modal builders
├── dashboard.js        ← project & vendor lists
├── console.js          ← project console segments
├── letterhead.js       ← letter editor & PDF
├── variations.js       ← variation orders & PCR
└── app.js              ← router, PWA, init
```

## Next Steps

1. Copy all `.js` files and the new `index.html` into your project root.
2. Delete (or archive) the old `app.bundle.js`.
3. Update `sw.js` cache version and replace `app.bundle.js` with the new module list if you want them cached offline.
4. Deploy and test — the app should behave identically.
