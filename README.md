# Genie Frontend

Read-only broker-style console for the [Genie](../Genie) algo-trading system. A static React + TypeScript SPA that ships to **GitHub Pages** and talks to the Genie app **only through its REST API** — it never reads logs or exported files.

## Pages and the endpoints they use

All paths are under `/api/v1`.

| Page | Endpoints |
| --- | --- |
| Dashboard | `/risk/session`, `/risk/limits`, `/kill/status`, `/papertrade/runner`, `/health`, `/papertrade/pnl`, `/console/trades` |
| Orders | `/console/trades` (executed), `/papertrade/pnl` (open), `/live/orders` (broker book), `/approvals` |
| Positions | `/papertrade/pnl` (live legs and MTM), `/console/trades` (closed) |
| P&L | `/console/trades` |
| Strategies | `/console/trades`, `/papertrade/pnl` |
| Market | `/market/index-quote/{name}`, `/market/option-chain/{index}` |
| Risk | `/risk/session`, `/risk/limits`, `/risk/status`, `/papertrade/risk-config`, `/papertrade/risk-stack`, `/recon/status`, `/recon/discrepancies` |
| System | `/health`, `/health/websocket`, `/health/scheduler`, `/papertrade/runner`, `/live/runner` |
| Backtest Lab | Backtest endpoints (read-only) |
| Settings | API URL and key |

`Ctrl K` opens the command palette. The selected session is kept in the URL (`?d=YYYY-MM-DD`).

## Connect it to your Genie API

1. Open **Settings** (or the connect screen on first load), enter the API base URL and a **read-only** API key (`X-API-Key`) or JWT, then **Connect**.
2. The key lives in `sessionStorage`, or `localStorage` if you tick "remember".
3. Optionally preset the URL at build time with `VITE_API_BASE` (the deploy workflow reads the repository variable `GENIE_API_BASE`).

Requirements on the Genie side:

- **HTTPS.** GitHub Pages is HTTPS, so a plain `http://` API is blocked as mixed content.
- **CORS.** `CORS_ALLOW_ORIGINS` must include the origin the site is served from.
- **A read-only key.** The console never sends orders, starts the runner or flips the kill switch. The `/recon/*` endpoints need the trader role; without it the Risk page shows "Not permitted" for that panel.
- **`GET /api/v1/console/trades`** (added to Genie in `app/api/routes/console.py`). Query: `from_date`, `to_date`, `strategy_id`, `deployment_mode`, `limit`. Returns closed trades, newest first.

## Known limits

- **Older closed trades lack detail.** Genie now stores side, legs, charges, exit time and stop/target on every closed trade. Trades closed before that change only carry net P&L, so the UI shows `n/a` for gross and costs rather than zeros, and shows no legs.
- **No API, no widget.** The API has no source for event/log feeds, rejected orders, risk-block lists, error feeds, scan-cycle history or VIX history, so those views are not built.
- **Backtests** only show what the read endpoints return; walk-forward results are POST-only.

## Develop

```powershell
npm install
npm run dev        # http://localhost:5173/
npm test
npm run build
```

## Deploy to GitHub Pages

1. Push to `main`. The site is served from the custom domain in [public/CNAME](public/CNAME), so assets use base `/`.
2. Repo **Settings → Pages → Source: GitHub Actions**, and enable Enforce HTTPS once the certificate is issued.
3. [.github/workflows/deploy.yml](.github/workflows/deploy.yml) tests, builds and publishes. Routing uses `HashRouter`, so deep links need no 404 rewrites.

To deploy under `https://<user>.github.io/<repo>/` instead, remove `public/CNAME` and build with `$env:VITE_BASE="/<repo>/"`.

## Security notes

- The bundle contains no trading data; everything is fetched at runtime with your key.
- Anyone with access to the browser profile can read a remembered key. Use a read-only key and rotate it if a device is lost.
