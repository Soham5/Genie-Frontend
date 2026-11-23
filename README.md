# Genie Frontend

Quant-console dashboard for the [Genie](../Genie) paper-trading system. A static React + TypeScript SPA that ships to **GitHub Pages**; no backend required.

## How it works

`npm run data` parses Genie's structlog JSONL output into sanitized static JSON under `public/data`. The SPA renders those snapshots.

| Page | What it shows |
| --- | --- |
| Overview | KPIs, intraday equity, cycle throughput, component health |
| Trading | Open positions, blotter, cost waterfall, R-multiples, exit reasons |
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

1. Push to `main` in a repo named `Genie-Frontend` (or any name; the workflow sets `VITE_BASE` automatically).
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. [.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds and publishes. Routing uses `HashRouter`, so deep links work without 404 rewrites.

For a local build with a different base path: `$env:VITE_BASE="/"; npm run build`.

## Things to know

- **The site is public.** The data builder strips broker client IDs, raw positions, request IDs, IPs and stack traces (only the last line is kept). Review `public/data` before publishing.
- **Backtests are synthetic.** The report's Sharpe > 300 / 100% win-rate results are generator artefacts; the UI flags them as implausible or thin-sample.
- **No live marks.** Logs have no quotes, so unrealised P&L is not shown. "Open" means entered on the selected date and not exited; earlier entries without an exit are listed as unclosed.
- **Optional live API.** Settings can probe `<base>/api/v1/health/live`. GitHub Pages is HTTPS, so the API must also be HTTPS with CORS enabled; plain `http://` is blocked as mixed content.
