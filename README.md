# Genie Frontend

Quant-console dashboard for the [Genie](../Genie) paper-trading system. A static React + TypeScript SPA that ships to **GitHub Pages**; no backend required.

## How it works

`npm run data` parses Genie's structlog JSONL output into sanitized static JSON under `public/data`. The SPA renders those snapshots.

| Page | What it shows |
| --- | --- |
| Dashboard | Funds strip, KPIs, equity curve, cycle throughput, component health |
| Orders | Order book (executed / rejected) built from entry and exit events |
| Positions | Day / Net positions; F&O combos expand into legs with a payoff-at-expiry chart |
| P&L | Realised P&L, blotter, cost waterfall, R-multiples, exit reasons |
| Strategies | Per-strategy performance and catalog |
| Market | VIX, put/call ratio, chain snapshots, NSE reliability |
| Risk Gate | 7-stage control pipeline, blocks, kill-switch/reconciliation history |
| System Health | Component status, scheduler jobs, errors |
| Event Log | Filterable structured log feed |
| Backtest Lab | Leaderboard with quality flags |
| Settings & About | Theme, optional live API |

`Ctrl K` opens the command palette. The selected session is kept in the URL (`?d=YYYY-MM-DD`).

## Develop

```powershell
npm install
npm run dev        # http://localhost:5173/Genie-Frontend/
npm test
npm run build
```

## Refresh the data

```powershell
npm run data -- --logs C:\Projects\Genie\logs\ec2 --repo C:\Projects\Genie
```

Commit the regenerated `public/data` and push.

## Deploy to GitHub Pages

1. Push to `main`. The site is served from the custom domain in [public/CNAME](public/CNAME) (`genie.sohamsur.com`), so assets use base `/`.
2. Repo **Settings → Pages → Source: GitHub Actions**, custom domain `genie.sohamsur.com` (enable Enforce HTTPS once the certificate is issued).
3. [.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds and publishes. Routing uses `HashRouter`, so deep links work without 404 rewrites.

To deploy under `https://<user>.github.io/<repo>/` instead (no custom domain), remove `public/CNAME` and build with `$env:VITE_BASE="/<repo>/"`.

## Things to know

- **The site is public.** The data builder strips broker client IDs, raw positions, request IDs, IPs and stack traces (only the last line is kept). Review `public/data` before publishing.
- **Backtests are synthetic.** The report's Sharpe > 300 / 100% win-rate results are generator artefacts; the UI flags them as implausible or thin-sample.
- **Two data modes.** *Snapshot* (default) uses the log export: no quotes, so no live LTP or unrealised P&L. *Live* polls the Genie API every 4s and shows real leg LTPs and MTM P&L.
- **Leg provenance.** Logs record only truncated order metadata, so snapshot legs are tagged `logged`, `derived` (inferred from the strategy shape) or `not logged` (unknown strike). The payoff chart appears only when every leg has a strike and price; live legs are always complete.
- **Live API setup.** In Settings enter the API base URL and a **read-only** key, then Save. Calls use `GET /api/v1/papertrade/pnl`. The key is kept in sessionStorage unless "remember" is ticked (localStorage). GitHub Pages is HTTPS, so the API must be HTTPS with `CORS_ALLOW_ORIGINS` including your Pages origin; plain `http://` is blocked as mixed content.
- **Read-only.** There are no order-entry or control actions; the algo places every order.
- **Funds strip is derived** from Genie config and logs, not broker margin.
