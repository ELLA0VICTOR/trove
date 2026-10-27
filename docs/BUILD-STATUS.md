# Verification record

Updated October 27, 2026. This record describes implementation checks and local integration evidence. Public deployment is configured through the [Render dashboard guide](RENDER-DEPLOY.md).

## Financial ledger

Guest and saved family portfolios use private immutable Marketstack snapshots with a provider, closing date, retrieval timestamp, and dataset hash once a fresh import is available. Earlier example portfolios are archived before switching to a new $1,000 market-price practice ledger; personal journal entries are preserved. Offline development retains labelled authored observations. Orders bind the portfolio and snapshot, and stale closing prices pause new orders.

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

- 78 Node tests: accounting, corporate actions, historical valuation, real-price guest entry and sample archival, family authority, durable memory, learning, cost control, market data, chain recovery, upgraded type identity, and receipt validation.
- 21 Move tests: signed financial transitions, authority, limits, one-time exceptions, replay/tampering, expiry, passive corporate entries, reverse-split remainders, and duplicate-event prevention.
- 15 Chromium journeys: navigation, responsive layout, portfolio interactions, learning, decisions, guardian controls, and returning family accounts.
- TypeScript production compilation and Oxlint.
- Production Node smoke checks: health, SPA deep links, built assets and caching, API errors, trusted origin, secure cookie attributes, cross-origin refusal, and restart persistence.

Runtime keys, private test identities, provider payloads, and generated artifacts remain in ignored storage.

## Deployment

The Dockerfile and Render Blueprint run a single Web Service with a persistent disk. Render supplies the public HTTPS origin. The hosted build, public URL, and post-deploy smoke checks are completed when the service is deployed.

Local Docker execution is unavailable on this Windows machine because WSL virtualization is disabled. The production Node process and its persistence checks run locally. Provider display entitlements and the chosen Render service/disk plan are configured in their respective dashboards.
