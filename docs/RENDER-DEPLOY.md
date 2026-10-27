# Optional Render deployment

The default setup is [Vercel with Neon](VERCEL-DEPLOY.md). Render can alternatively run the frontend and Node API together as a Docker Web Service, using the same Neon PostgreSQL database.

## Dashboard setup

1. Complete the Neon setup, database check, and environment preparation in the [Vercel guide](VERCEL-DEPLOY.md).
2. Make the prepared source available in your GitHub repository.
3. Open [Render Dashboard](https://dashboard.render.com/), choose **New > Web Service**, and connect `ELLA0VICTOR/trove`.
4. Select **Docker**, Dockerfile `./Dockerfile`, the **Free** instance type, and health check `/health`. Leave command overrides empty.
5. Import the server variables from the ignored `.artifacts/vercel.env`. They include `DATABASE_URL` and the provider credentials. Add `NODE_ENV=production`.
6. Deploy and open the generated HTTPS URL. Trove uses `RENDER_EXTERNAL_URL` as its trusted origin. Set `PUBLIC_ORIGIN` only for a custom domain.

`render.yaml` contains equivalent Free service settings for a Blueprint deployment. PostgreSQL holds accounts, portfolios, memory jobs, market snapshots, and cumulative AI usage; no hosting disk is required.

## Availability

Render Free services spin down after 15 minutes without inbound traffic and take about one minute to wake. This affects the first request after inactivity. See [Render's Free service limits](https://render.com/docs/free).

Use the external Neon database rather than Render's Free PostgreSQL offering, which expires after 30 days. Keep the database, signer identities, and usage ledger when redeploying.

## Deployment checks

- `/health` returns `{"status":"ok"}`.
- `/app/explore` loads directly and displays the market provider and closing date.
- Family sign-in, learner invitations, and practice choices survive a redeploy.
- Consented memories reach confirmation and signed Sui practice orders expose their Testnet receipts.

The PostgreSQL runtime performs bounded maintenance after requests. Saved jobs and transaction intents resume when activity returns.
