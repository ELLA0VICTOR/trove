# Deploy Trove through Render's website

Trove needs one **Web Service** running the Dockerfile and a **persistent disk**. The frontend and API run together on the same URL. A Static Site cannot run this backend. Render requires a paid service for persistent disks; no paid service has been created by this agent. See [Render's disk documentation](https://render.com/docs/disks).

## Dashboard setup

1. Commit and push the reviewed code to your GitHub repository when you are ready. No push or deployment was performed during this implementation.
2. Open [Render Dashboard](https://dashboard.render.com/), choose **New → Web Service**, and connect `ELLA0VICTOR/trove`.
3. Choose the branch containing these changes. Set **Language/Runtime: Docker**, **Dockerfile Path: ./Dockerfile**, and **Health Check Path: /health**. The Dockerfile builds the frontend and starts the Node API; leave command overrides empty.
4. Add a **1 GB persistent disk**, mounted at **/data**. Keep **one instance**. Both application state and the AI usage ledger live on this disk.
5. Add the variables below under **Environment**. Render supports **Add from .env**; select only the required server values and override the deployment-specific settings. Do not put secret values into `VITE_` variables.
6. Create/deploy the service. Open its generated `https://…onrender.com` URL and `/health`. The app uses Render's `RENDER_EXTERNAL_URL` for its trusted HTTPS origin; set `PUBLIC_ORIGIN` only if using your own domain.

`render.yaml` contains equivalent Blueprint settings if you prefer **New → Blueprint**. Review the paid service/disk selection before creating it.

## Environment values

| Variable                  | Value/source                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | `production`                                                                                    |
| `TROVE_DATA_DIR`          | `/data`                                                                                         |
| `PORT`                    | Render supplies it; leave it alone                                                              |
| `PUBLIC_ORIGIN`           | Optional custom HTTPS origin; omit to use Render's URL                                          |
| `TATUM_API_KEY`           | Existing Testnet key in your local environment                                                  |
| `MARKETSTACK_API_KEY`     | Existing market-data key; confirm your plan permits the intended hosted display                 |
| `MEMWAL_ACCOUNT_ID`       | Existing Mainnet memory account ID                                                              |
| `MEMWAL_PRIVATE_KEY`      | Existing memory delegate key                                                                    |
| `MEMWAL_SERVER_URL`       | `https://relayer.memory.walrus.xyz`                                                             |
| `OPENAI_API_KEY`          | Existing OpenAI key                                                                             |
| `COACH_MODEL`             | `gpt-6-luna`                                                                                    |
| `COACH_BUDGET_USD`        | `0.99` for a fresh hosted ledger; this leaves room for the roughly $0.0023 already used locally |
| `SUI_PACKAGE_ID`          | `packageId` from `contracts/practice/deployment.testnet.json`                                   |
| `SUI_ORIGINAL_PACKAGE_ID` | `originalPackageId` from that manifest; optional when using the bundled package                 |
| `SUI_TESTNET_SPONSOR_KEY` | `sponsorKey` from ignored `.trove/sui-testnet-keys.json`                                        |
| `SUI_QUOTE_ATTESTOR_KEY`  | `attestorKey` from that same ignored file                                                       |

Keep the sponsor and attestor keys unchanged when moving this deployment: existing contract accounts pin the attestor. These keys are for Testnet only. The sponsor was funded with free faucet SUI; no Mainnet funds are required. `DATABASE_URL`, Enoki, and Google login settings are unused by this version.

The AI allowance is enforced by a database ledger, not by the OpenAI account. A fresh hosted database and a local database are separate ledgers. Stop local paid coaching once the hosted version is in use; do not delete/recreate the production ledger to reset its allowance. For continuity of existing accounts and usage, migrate a consistent SQLite backup rather than copying an active database without its WAL. An ordinary fresh Render deployment starts with new family accounts; it does not automatically copy local demo history.

## Check the deployed result

- `/health` returns `{"status":"ok"}` and `/app/explore` loads directly.
- Open Explore as a guest and confirm the provider/date and real closing prices after the first market import. Create a family and invite a learner in a separate session; saved accounts use the same market snapshots.
- Enable remembering as the parent only after reading the storage notice. Save a learner reason and wait for an actual Mainnet blob confirmation.
- Link separate parent/learner Sui wallets through Account settings. As the parent, start Sui practice; this archives the previous practice balance and begins with $1,000 simulated cash.
- Review and sign an order as the learner. An above-limit request requires the parent's signed one-time approval. Decisions exposes the confirmed Testnet receipt.
- Redeploy and sign in again to confirm the mounted disk retained state. Check the usage ledger was retained too.

No hosted URL has been verified yet. Container execution could not be tested on this Windows machine because Docker/WSL virtualization is disabled; the built production Node server is tested separately. The first Render build and HTTPS smoke check remain the deployment confirmation.
