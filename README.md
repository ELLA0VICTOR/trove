# Trove

Learn investing through your own decisions—and remember what they taught you.

Trove is a family practice-investing product for the Consumer Finance Apps track of Tatum × Walrus Total Recall. A young person makes practice choices, saves their reasons, revisits the same market period, and develops understanding inside parent-set boundaries.

**Current version: working local sample.** Practice funds, authored sample prices, a deterministic guide, and a clearly labelled parent preview work without provider accounts. Walrus Mainnet, Tatum/Sui, live market data, live AI, and real sign-in are not connected. [Exact implementation status](docs/BUILD-STATUS.md).

## Run locally

Use a supported patched Node 24 release and npm. The local persistence layer uses Node's built-in SQLite module. No API keys are needed for the sample.

```cmd
cd /d C:\Users\kolev\Desktop\trove
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. This command runs Vite on port 5173 and the local API on port 3001. Keep the terminal running; Ctrl+C stops both. In PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

The local database is created at `.trove/local.sqlite` and is ignored by Git. Your browser's HttpOnly cookie selects a sample family. A reload or API restart retains its choices. **About this build → Reset my local sample** restores that family's seed data. An incognito session gets a separate sample family.

`npm run preview` serves only the built frontend; the API must still run separately with `npm run dev:api`. The current application is for local preview and is not configured as a public production deployment.

## Try the learning loop

1. Open **Home** to see your portfolio and Maya's original five-company decision.
2. Make a practice investment with your own reason in **Explore**.
3. Visit **Your decisions**, compare allocations in **Replay**, and add or correct a remembered thought in the guide.
4. Complete a concept exercise; the next lesson changes while financial permission stays the same.
5. Request an above-limit action, approve it in the explicit **parent preview**, then return to Maya to execute that exact choice once.

See the [demo walkthrough](docs/DEMO-GUIDE.md) for a repeatable sequence.

## Checks

```cmd
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

Browser tests start the local services if needed and reuse an existing local dev server outside CI. Set `PLAYWRIGHT_CHROMIUM_PATH` to a compatible installed Chromium executable if using an existing browser installation. The production build checks frontend, API, shared domain code, adapters, scripts, and tests with TypeScript before bundling.

## Live integration preparation

`.env.example` documents the configuration names. Copy it to ignored `.env.local` when accounts are ready and keep server secrets outside `VITE_` variables. Merely adding credentials does not enable the live application; read [integration setup](docs/INTEGRATION-SETUP.md) and the [remaining work](docs/BUILD-STATUS.md#remaining-live-implementation).

```cmd
copy .env.example .env.local
npm run check:integrations
```

Without credentials, this command reports missing setup. With Tatum/market-data keys, it attempts their read-only preflight. Walrus diagnostic writes require the explicit `--write-memory` argument; metered model calls require `--model-call`. Neither runs by default. Diagnostic writes do not count as meaningful learner memories.

## Code map

| Location         | Purpose                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `src/pages`      | Landing, portfolio, exploration, decisions, guide, replay, parent preview, evidence          |
| `src/components` | Original letter-globe canvas, sapling/pixel graphics, charts, accessible controls            |
| `src/styles`     | Shared visual language and responsive layouts                                                |
| `shared`         | Integer accounting, frozen replay, sample observations, deterministic learning rules         |
| `server`         | Local Hono API, SQLite store, execution guards, inactive provider adapters and memory outbox |
| `tests`          | Accounting, API, job recovery, and browser journeys                                          |
| `docs`           | Product/design briefs, research, architecture, setup, build status, demo guide               |

The visual direction follows the user's [NEAR Hackathon reference](https://nearhackathon.com/), adapted to Trove's green identity and family learning product. The canvas, SVG sapling, pixel graphics, and application UI are implemented in this repository. IBM Plex Mono is self-hosted under its [SIL Open Font License](public/licenses/ibm-plex-mono.txt). This is not a NEAR hackathon submission.
