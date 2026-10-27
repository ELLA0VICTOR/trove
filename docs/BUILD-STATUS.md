# Verification record

Updated October 27, 2026. This record describes implementation checks and local integration evidence. Public deployment is configured through the [Vercel and Neon guide](VERCEL-DEPLOY.md).

## Financial ledger

Visitors can browse immutable Marketstack snapshots with a provider, closing date, retrieval timestamp, and dataset hash once a fresh import is available. Saved family portfolios start with a $1,000 market-price practice ledger. Earlier example portfolios are archived before changing the price basis. Offline development retains labelled authored observations. Orders bind the portfolio and snapshot, and stale closing prices pause new orders.

Automatic corporate entries cover forward/reverse splits, dividends, proportional basis release, and cash-in-lieu below share precision. Events are deduplicated by portfolio and provider identity. Historical observations preserve their original price basis; chart trends and replay use adjusted closes.

## Sui and Tatum

The current compatible package upgrade is recorded in [the deployment manifest](../contracts/practice/deployment.testnet.json). Existing accounts retain their original type identity. Separate guardian/learner wallets control their respective actions, with sponsored Testnet gas and attested market terms.

The live order flow created a practice account, updated policy, approved an exact exception, executed a learner order, and reconciled Tatum receipts and BCS object contents. Additional browser execution exercised wallet-standard signing.

An isolated synthetic corporate scenario executed against the upgraded package through Tatum. A 0.25-share position became 0.5 shares, a $1-per-share fixture credited $0.50 simulated cash, and cost basis, guardian policy, and daily spending stayed unchanged. Repeated reconciliation posted once. Receipt: `9YFKkonMm4PLMW5Px11YVx8bYwwGsULnH9xMnL3Sc6fE`.

Local sanitized evidence:

- `.artifacts/contracts/confirmed-chain-loop.json`
- `.artifacts/contracts/corporate-live-proof.json`

The corporate scenario used synthetic market events; the Testnet execution and Tatum confirmation were actual network operations.

## Memory and learning

Ten active synthetic learning records were confirmed on Walrus Mainnet, followed by correction-aware coaching and fresh-session retrieval. The separate corporate fixture keeps memory consent off.

The guide verifies active scoped records and confirmed blob evidence. Publication, corrections, pending jobs, restart recovery, and usage reservations have deterministic test coverage.

The 32-case real-model evaluation covered no-history, original-history, corrected-history, and injected-history inputs across eight concepts. Its mechanical grounding/citation checks passed. Estimated local model usage after that evaluation was $0.0023142 within the configured $1 allowance. See [learning evaluation](LEARNING-EVALUATION.md) for method and interpretation.

## Validation suites

- 118 Node tests: accounting, corporate actions, historical valuation, real-price guest entry and sample archival, family authority, durable memory, learning, cost control, market data, chain recovery, upgraded type identity, receipt validation, PostgreSQL transitions, repeatable hosted usage imports, guest access restrictions, email-first signup with deferred account creation, automatic and editable usernames, verified email identity, one-use password resets, session revocation, and guardian email recovery. Guest coach requests are rejected before generation; expired sessions cannot reach the coach. Deterministic lessons remain available without sign-in.
- 29 Move tests: signed financial transitions, authority, limits, one-time exceptions, replay/tampering, expiry, passive corporate entries, reverse-split remainders, and duplicate-event prevention.
- 20 browser journeys: navigation, responsive layout, portfolio interactions, public lessons, authenticated coaching access, decisions, guardian controls, returning family accounts, the product walkthrough, and email signup, username settings, and verification/reset screens.
- TypeScript production compilation and Oxlint.
- Production Node smoke checks: health, SPA deep links, built assets and caching, API errors, trusted origin, secure cookie attributes, cross-origin refusal, and restart persistence.

Runtime keys, private test identities, provider payloads, and generated artifacts remain in ignored storage.

## Deployment

Account verification and password-reset delivery use Resend with a verified sending domain. The implementation and simulated-delivery tests pass; actual inbox delivery remains to be checked after DNS verification and provider-key setup. See [email setup](EMAIL-SETUP.md).

The Vercel function entry point, same-origin rewrites, request-driven maintenance, Neon PostgreSQL adapter, environment export, and database preflight are implemented. Local PostgreSQL-engine checks cover stale writers, concurrent orders and invitations, cumulative budgets, immutable memories, and sessions across fresh function runtimes.

The actual Neon connection passed TLS, schema initialization, duplicate-order execution, stale-write refusal, shared budget reservations, and one-use invitations using two independent connection pools in an isolated temporary schema. Hosted preparation imported one market snapshot dated October 26, its refresh reservation, and 35 AI usage records. The private Vercel environment file was generated in ignored storage. These checks made no model calls or Mainnet writes. Public Vercel deployment and its HTTPS checks follow source publication.

The production Node process and its persistence checks also run locally. The optional Render configuration uses its Free service with external PostgreSQL; that service has an idle wake-up delay. The default delivery path uses Vercel and Neon.

## Practice refills

Parent funding, dated history, contribution-adjusted returns, idempotent retries, preserved controls, and shared-role balances have local and PostgreSQL coverage. Compatible Sui source adds configurable starting capital and single-use guardian refills. The package build passes 29 Move tests. Version 3 was published on Sui Testnet after operator approval. Tatum confirmed transaction `zmszkdfzbpfkZ5Bm7ZhUeyQFmB7QxMiscpi3f4G9xmN`; the deployed functions and bytecode match the local build, and runtime funding capability detection passes. The public deployment manifest and ignored Vercel environment export reference the new package. The hosted website uses it after its package setting and source are redeployed.
