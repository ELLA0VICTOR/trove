# Deploy Trove with Vercel and Neon

The hosted application uses Vercel for the React frontend and Node API functions, and Neon PostgreSQL for persistent data. Accounts, portfolios, transaction intents, memory jobs, market snapshots, and the AI usage ledger live in PostgreSQL.

The Vercel Hobby and Neon Free plans have usage quotas. This setup uses the non-commercial demo path and requires no persistent hosting disk. Keep the selected plans on Free/Hobby rather than starting a paid trial.

## 1. Create the Neon database

1. Open [Neon Console](https://console.neon.tech/) and sign up.
2. Create a project named **trove** on the **Free** plan.
3. Choose **AWS / US East (N. Virginia)** where available. Vercel's configured function region is `iad1`.
4. Keep the default PostgreSQL version and database. Trove handles its own account sign-in.
5. Open the project's dashboard and click **Connect**. Select **Connection string** and enable **Connection pooling**.
6. Copy the PostgreSQL URI. It starts with `postgresql://`; copy the URI rather than a surrounding `psql` command.
7. Save it as `DATABASE_URL=...` in the existing ignored `.env.local`.

The connection string contains a database password. Keep it in local/server configuration.

## 2. Prepare and check locally

From the Trove directory:

```sh
npm ci
npm run check:database
npm run deploy:prepare
```

On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

The database check uses a temporary PostgreSQL schema and two independent connection pools. It checks concurrent execution, stale-update protection, shared budget reservations, and one-use invitations, then removes the temporary schema. It makes no model calls or blockchain transactions.

The preparation command:

- Initializes the application schema in Neon.
- Copies cached market snapshots and their import reservation from local storage.
- Carries over the recorded AI usage without resetting its cumulative cost.
- Generates **`.artifacts/vercel.env`**, containing the server configuration for Vercel.
- Reports status without printing secret values.

Existing local family accounts stay in the local database. The hosted application starts new family sign-ins; its market cache and usage history are preserved by preparation.

The environment file is ignored by Git. Read it locally or import it directly into Vercel's environment-variable form.

## 3. Update the GitHub source

Commit and push the prepared code to the repository using your normal Git workflow. Include `vercel.json`, `api/`, the database/server changes, and `package-lock.json`.

Keep `.env.local`, `.trove/`, `.artifacts/`, and `.vercel/` excluded. A Vercel import builds the code in GitHub, so the deployment branch must include these changes.

## 4. Import through Vercel's website

1. Open [Vercel New Project](https://vercel.com/new).
2. Import **ELLA0VICTOR/trove**.
3. Use the **Hobby** account/plan for this non-commercial demo.
4. Select **Vite** as the framework preset.
5. Leave the root directory at the repository root.
6. Keep **Build Command** as `npm run build` and **Output Directory** as `dist`.
7. Use **Node.js 24.x**. The repository's package metadata specifies this version.
8. Under **Environment Variables**, import `.artifacts/vercel.env` where the form supports environment-file import, or add its variables individually.
9. Click **Deploy**.

The repository already defines API routing, SPA deep links, function duration, the function region, and inclusion of the public contract manifest.

## 5. Environment values

The preparation helper fills this list from local settings and the ignored Testnet key file.

| Variable                  | Source                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | Neon pooled PostgreSQL URI.                                                             |
| `RESEND_API_KEY`          | Account verification and password-reset sending key; see [email setup](EMAIL-SETUP.md). |
| `EMAIL_FROM`              | Verified sender, such as `Trove <accounts@dixmail.xyz>`.                                |
| `TATUM_API_KEY`           | Existing Tatum Testnet key.                                                             |
| `MARKETSTACK_API_KEY`     | Existing market-data key.                                                               |
| `MEMWAL_ACCOUNT_ID`       | Existing Walrus Memory account.                                                         |
| `MEMWAL_PRIVATE_KEY`      | Existing memory delegate key.                                                           |
| `MEMWAL_SERVER_URL`       | Existing relayer URL.                                                                   |
| `OPENAI_API_KEY`          | Existing OpenAI key.                                                                    |
| `COACH_MODEL`             | `gpt-6-luna`.                                                                           |
| `COACH_BUDGET_USD`        | Existing allowance, enforced against the hosted usage ledger.                           |
| `SUI_PACKAGE_ID`          | Current package from the deployment manifest.                                           |
| `SUI_ORIGINAL_PACKAGE_ID` | Original account type identity.                                                         |
| `SUI_TESTNET_SPONSOR_KEY` | Existing sponsor in `.trove/sui-testnet-keys.json`.                                     |
| `SUI_QUOTE_ATTESTOR_KEY`  | Existing attestor from that file.                                                       |

Vercel supplies its deployment host and production environment. The API derives its trusted HTTPS origin from those settings. Set `PUBLIC_ORIGIN` explicitly when using a custom domain.

`TROVE_DATA_DIR`, `PORT`, Enoki, and Google login values are unnecessary for this hosted configuration. Credentials are server-side variables.

## 6. Check the deployed application

1. Open the production URL in a private browser window.
2. Visit `/health`; it should return `{"status":"ok"}`.
3. Open `/app/explore` directly. Confirm the market provider and closing date.
4. Create a family, invite a learner in a separate session, and sign back in.
5. Make a practice choice and confirm it remains after a fresh session.
6. Enable remembering from the guardian account. Save a learner thought, open Saved thoughts, and wait for a confirmed memory.
7. Link the role-specific wallets to exercise Sui Testnet practice and inspect its confirmed receipt.
8. Redeploy once and confirm the saved account and portfolio remain.

## Request-driven work

Vercel functions run bounded tasks rather than permanent interval loops. Active requests schedule a maintenance cycle using `waitUntil`. PostgreSQL leases coordinate instances; pending memory work and transaction reconciliation resume from saved state when activity returns.

The market importer reserves its refresh interval in PostgreSQL. The AI budget uses transaction locks across instances. Sessions and family records persist independently of function restarts.

## Operating the free tiers

Keep the Neon project and Vercel deployment within their included usage. Check their dashboards for compute, storage, transfer, and function consumption. The application preserves import throttles, shared request limits, and the configured model allowance.

The demo's production URL should be publicly accessible. Test it in a signed-out/private browser before sharing it.

Official references: [Neon Free plan](https://neon.com/pricing), [Neon pooled connections](https://neon.com/docs/connect/connection-pooling), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Vercel function lifecycle](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil).

## Practice-account contract update

Sui Testnet version 4 lets the parent activate the portfolio before the learner connects. The learner later signs a one-time registration without further parent approval. Parent-signed practice refills and configurable starting capital remain available. The current package is recorded in [the deployment manifest](../contracts/practice/deployment.testnet.json). For an existing Vercel project, set **SUI_PACKAGE_ID** to `0xa5c023912b108572b7be4ca24b99f4999fec532d3d14552568cba298d231e4b3`, publish the latest repository changes, and redeploy. Keep **SUI_ORIGINAL_PACKAGE_ID** unchanged. The ignored `.artifacts/vercel.env` export also includes the current package IDs and configured email settings.

The API detects the configured package's funding and enrollment capabilities. Parent-first activation requires the current package and application code.
