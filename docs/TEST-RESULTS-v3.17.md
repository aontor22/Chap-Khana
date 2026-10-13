# v3.17 validation record

- Starting source: `Chap-Khana-v3.16.0-Suppliers-Purchasing-Full.zip`.
- Node `npm run test:catalog`: 77/77 passed, including new finance-source regressions.
- TypeScript `transpileModule` parse: 80 TS/JS files parsed without syntax diagnostics.
- Standalone finance helper runtime smoke tests: 6/6 passed (return quantities, allowable stock returns, supplier balance and overpayment protection).
- Package integrity: ZIP integrity verified.
- **Not yet verified**: full `npm test`, `npm run build`, live PostgreSQL migration execution and competing transaction race behavior. Dependency install failed because local offline npm cache lacks `yallist@3.1.1`. Perform in Codespaces and staging before production.
