# Genie Frontend

Broker-style console for the [Genie](../Genie) algo-trading system. A static React + TypeScript SPA that ships to **GitHub Pages** and talks to the Genie app **only through its REST API** — it never reads logs or exported files. it never sends orders, starts the runner or flips the kill switch; the one thing it POSTs is the **Strategy Backtest** dry run in Backtest Lab, which saves nothing.

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
| Backtest Lab · Strategy Backtest tab | `/strategies` (picker), `POST /backtest/strategy-backtest` (dry run, nothing saved) |
| Backtest Lab · Stored Results tab | `/backtest/results`, `/backtest/results/{id}` (read-only) |
| Settings | API URL and key |

`Ctrl K` opens the command palette. The selected session is kept in the URL (`?d=YYYY-MM-DD`).

### Backtest Lab

Backtest Lab (under **More**) has two tabs. **Strategy Backtest** is the default and **Stored Results** shows the runs the Genie API has saved. Both stay mounted while you switch, so a form, a finished result or a run in flight is still there when you come back; a pulsing dot on the Strategy Backtest tab shows that a run is in progress.

#### Strategy Backtest tab

Modelled on the Algorooms strategy-backtest page. Pick up to 10 strategies, a range (1 / 3 / 6 months, 1 / 2 years or a custom range), a slippage assumption (the engine's default, none, % of price or points per fill) and an optional initial capital per strategy, then **Run Backtest**. The result is the headline P&L and max drawdown over an equity curve, summary cards, a per-strategy table with the approval gate, the best and worst days (Top 10 / 20 / 30 / All), a day-by-day calendar, and every simulated trade grouped by the day it closed. The **Download Trades** menu exports all trades or the daily P&L as CSV, and **Download CSV** in the transaction list exports the trades; **Download PDF** opens the browser's print dialog, where you choose "Save as PDF". The *Backtest this strategy* button in a strategy's detail drawer opens Backtest Lab with that strategy selected.

## Connect it to your Genie API

1. Open **Settings** (or the connect screen on first load), enter the API base URL and a **read-only** API key (`X-API-Key`) or JWT, then **Connect**.
2. The key lives in `sessionStorage`, or `localStorage` if you tick "remember".
3. Optionally preset the URL at build time with `VITE_API_BASE` (the deploy workflow reads the repository variable `GENIE_API_BASE`).

Requirements on the Genie side:

- **HTTPS.** GitHub Pages is HTTPS, so a plain `http://` API is blocked as mixed content.
- **CORS.** `CORS_ALLOW_ORIGINS` must include the origin the site is served from.
- **A read-only key is enough to browse.** The console never sends orders, starts the runner or flips the kill switch. The `/recon/*` endpoints and `POST /backtest/strategy-backtest` need the trader role: without it the Risk page shows "Not permitted" for that panel, and the Strategy Backtest tab reports that the key can't run backtests. A trader-role key can also start and stop trading, so use one only on a device you trust.
- **`GET /api/v1/console/trades`** (added to Genie in `app/api/routes/console.py`). Query: `from_date`, `to_date`, `strategy_id`, `deployment_mode`, `limit`. Returns closed trades, newest first. F&O combos carry one `legs` entry per contract (`symbol`, `expiry`, `strike`, `option_type`, `action`, `qty`, `lot_size`, `entry_price`, `exit_price`, `gross_pnl`, `charges`, `net_pnl`). Positions shows them as Avg., Exit and P&L; Orders expands each multi-leg order into its contracts.
- **`POST /api/v1/backtest/strategy-backtest`** (added to Genie in `app/api/routes/backtest.py`; trader role). Body: `strategy_ids` (1–10), `period` (`1M`, `3M`, `6M`, `1Y`, `2Y` or `custom` with `start_date` / `end_date`), `slippage` (`{ mode: default | none | percent | points, value }`), `initial_capital` (per strategy; `0` turns off capital-aware sizing and the risk stack), `risk_stack_enabled` and optional `symbols`. It is a dry run: nothing is saved and no strategy changes status. Returns `request`, `strategies[]` (metrics, approval gate and a per-strategy `error`), `summary`, `daily[]`, `monthly[]`, `trades[]`, `warnings[]` and `elapsed_seconds`. Win and loss are judged on net P&L, after slippage and brokerage.

## Known limits

- **Older closed trades lack detail.** Genie now stores side, legs, charges, exit time and stop/target on every closed trade. Trades closed before that change only carry net P&L, so the UI shows `n/a` for gross and costs rather than zeros, and shows no legs. Trades closed after legs were stored but before per-contract exit prices were, and any contract that had no quote at close, show the entry price only: Exit and P&L stay `—` and the position's own P&L is unaffected.
- **Contract P&L is a mark, not a fill.** A contract's exit price is the last price the engine had for it when the position closed, and its P&L is net of its share of costs. A position that exits at its stop or target price can therefore differ slightly from the sum of its contracts; the Positions page says so when it does.
- **No API, no widget.** The API has no source for event/log feeds, rejected orders, risk-block lists, error feeds, scan-cycle history or VIX history, so those views are not built.
- **The Stored Results tab** only shows what the read endpoints return; walk-forward results are POST-only.
- **Strategy Backtest runs are synchronous.** The request stays open until every strategy has been simulated (the client waits up to 10 minutes), so long ranges with many strategies can take minutes. **Cancel** only stops waiting; the server may still finish the run. There is no backtest-credit meter and no queue. Strategies with partial candle coverage or no data are listed in the result's warnings.
- **PDF export is the browser's print dialog** ("Save as PDF"), not a server-rendered file.

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
- Anyone with access to the browser profile can read a remembered key. Prefer a read-only key (a trader-role key can start and stop trading), and rotate it if a device is lost.
