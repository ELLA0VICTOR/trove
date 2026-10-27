# Integration setup

Trove uses server-side adapters for Tatum, Walrus Memory, Marketstack, and OpenAI. Start with [account setup](ACCOUNT-SETUP.md) for provider dashboard links, then fill in the ignored `.env.local` using `.env.example`.

## Service configuration

| Service           | Required configuration                              | Runtime use                                                                                 |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Tatum             | `TATUM_API_KEY`                                     | Sui Testnet native TLS gRPC, execution, receipts, and BCS account reads.                    |
| Marketstack       | `MARKETSTACK_API_KEY`                               | Shared immutable USD daily-close snapshots, adjusted prices, splits, and dividends.         |
| Walrus Memory     | `MEMWAL_ACCOUNT_ID`, `MEMWAL_PRIVATE_KEY`           | Consented Mainnet learning records, confirmation polling, and scoped recall.                |
| OpenAI            | `OPENAI_API_KEY`, `COACH_MODEL`, `COACH_BUDGET_USD` | Structured, cited learning explanations with persistent cost accounting.                    |
| Sui signers       | `SUI_TESTNET_SPONSOR_KEY`, `SUI_QUOTE_ATTESTOR_KEY` | Sponsored gas and bounded quote/corporate-event attestations.                               |
| Contract identity | `SUI_PACKAGE_ID`, `SUI_ORIGINAL_PACKAGE_ID`         | Current callable package and original account type; the bundled manifest supplies defaults. |

`MEMWAL_SERVER_URL` defaults to `https://relayer.memory.walrus.xyz`. The memory credential is a delegate key. Administrative memory-owner credentials remain outside the application runtime.

The Sui setup helper creates local signers in ignored `.trove/sui-testnet-keys.json`. Production reads signer keys from the host environment. Preserve the deployed attestor identity when moving existing accounts.

SQLite is supplied by Node 24. `TROVE_DATA_DIR` selects its persistent directory. Conventional family credentials and Wallet Standard provide account access and signing; the reserved PostgreSQL, Enoki, and Google fields can remain blank.

## Preflight

```sh
npm run setup:check
npm run check:integrations -- --service tatum
npm run check:integrations -- --service walrus
npm run check:integrations -- --service market
npm run check:integrations -- --service coach
npm run sui:setup
```

The setup check is offline and prints configuration status. Selected integration checks make scoped provider requests. The coach check reads model metadata; `--model-call` explicitly enables generation. A memory diagnostic write requires `--write-memory`.

Read provider diagnostics locally. Server credentials stay outside browser bundles and `VITE_` variables.

## Market import

One private import serves every family. The four-day reservation persists across restarts and keeps twelve symbols near 96 symbol-requests per 31 days. Each symbol counts against the provider allowance. The worker validates USD currency and observation consistency, aligns chart dates, and retains unaligned corporate-event dates.

The dataset hash freezes each portfolio's price basis. Splits, reverse splits, fractional remainders, and dividends post automatically before an affected portfolio adopts the next snapshot. Daily close freshness is checked before orders. Guests and signed-in families receive market prices once a fresh snapshot is available; earlier sample portfolios are archived before changing basis.

Check the market-data account's display and redistribution entitlements when selecting a public hosting plan.

## Memory and learning

Guardian consent gates eligible records. The worker uses stable operation keys, persisted acceptance IDs, leases, cooldowns, and confirmation polling. The guide uses confirmed active records, validates citations, and respects corrections.

`COACH_BUDGET_USD=1.00` sets the local lifetime estimated allowance. The usage ledger persists under `TROVE_DATA_DIR`. Each installation has its own ledger; preserve it during migration and account for separate installations when budgeting.

```sh
npm run eval:learning
npm run eval:learning -- --live
```

The first command describes the suite. The second makes metered requests through the shared allowance. See [learning evaluation](LEARNING-EVALUATION.md).

## Hosted configuration

Use the [Render dashboard guide](RENDER-DEPLOY.md). Configure one Docker Web Service with a persistent disk, copy the server credentials, and use the same sponsor and attestor identities. Render's external URL supplies the trusted origin; custom domains use `PUBLIC_ORIGIN`.

For account continuity, migrate a consistent database backup along with the usage ledger. A fresh database creates new family accounts.
