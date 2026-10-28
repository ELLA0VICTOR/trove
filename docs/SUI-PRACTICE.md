# Sui practice accounts

The [deployment manifest](../contracts/practice/deployment.testnet.json) records the current package, original type identity, deployment receipt, bytecode hash, upgrade capability, and compiler release. Accounts track simulated USD and share quantities on Sui Testnet.

## Authority

Each shared `Account` fixes a guardian address and an Ed25519 attestor public key. The guardian can activate it before the learner connects, with the learner address initially unassigned. The authenticated learner then proves wallet ownership and signs a one-time `enroll` transaction. Its attested terms bind the original package, account, guardian, learner address, nonce, and a maximum two-minute expiry. Enrollment preserves funds and policy and permanently fixes the learner address. Accounts created with both addresses already linked retain their original fixed authorities. The guardian controls limits and pause/resume and signs exact one-time exceptions. The learner signs orders.

Wallet-link challenges establish control of the configured addresses. Family membership is self-service; each role uses separate credentials and a separate wallet.

The operator's attestor signs bounded market and corporate-event terms. The deployment retains a compatible-upgrade capability held by its deployer.

## Quotes and orders

Signed quotes bind the original package type identity, account, instrument, side, requested and debited amounts, integer units, price, market date, dataset hash, two-minute maximum expiry, policy revision, sequence, nonce, and a salted reasoning commitment.

The contract verifies the signature and arithmetic, then enforces cash, holdings, symbol allowlist, pause, limits, and exact one-time approval. Sales preserve the day's consumed gross-buy allowance. Pause, cash, and holdings checks apply to approved orders as well.

The API anchors expiration to Sui's consensus clock with a checkpoint-lag margin and rejects excessive clock skew.

## Automatic corporate actions

`adjust` applies a signed `CorporateTerms` record with its own `trove:corporate:v1` domain. Terms include the account, event identity, instrument, event date, action type, exact split ratio or distribution rate, event closing price, pre-adjustment units, sequence, revision, source and target snapshots, and expiry.

Forward and reverse splits preserve remaining basis and settle fractions below share precision as simulated cash. Dividends credit the held quantity at the per-share rate when the portfolio adopts the provider's event snapshot. Same-day splits precede dividends.

A dynamic-field marker keyed by event identity prevents repeated posting, including replay at a later sequence. Passive adjustments preserve policy and daily spending and remain available while new trading is paused.

The server batches the planned entries atomically, sponsors the transaction, and validates every `CorporateApplied` event against the ledger. It additionally checks final cash, positions, basis, sequence, and unchanged policy against the BCS account object. Snapshot advancement and the adjustment journal commit together after confirmation.

## Transaction lifecycle

The API constructs fixed practice calls and persists the exact bytes and digest before requesting the appropriate wallet signature. Gas sponsorship is restricted to those calls. One sponsored action is in flight at a time.

A durable dispatcher uses leases, cooldowns, and bounded retries of identical signed bytes. Uncertain outcomes remain pending until reconciled. Confirmed duplicate receipts leave balances, decisions, and memories unchanged.

Tatum supplies execution receipts and BCS objects over native TLS gRPC. The reconciler checks the current/original package identities, family authorities, attestor, quote or corporate terms, and counters before recording state. Events introduced by intermediate upgrades retain their defining package identity; the deployment manifest records these event-specific origins. Funding receipts accept only the configured `Funded` origin while retaining the executing-package, account, amount, balance, sequence, and policy checks. Active Sui accounts use chain execution for financial changes. Unsigned previews can be cancelled; submitted transactions are rechecked through reconciliation.

## Build and setup

Install the official **testnet-v1.82.2** Sui CLI or set `SUI_CLI` to its executable. The helper also detects the ignored Windows executable in `.artifacts/toolchain/`.

```sh
npm run sui:test
npm run sui:build
npm run sui:setup
```

The build runs Move tests and writes UTF-8 compiler output to ignored `.artifacts/contracts/build.json`. Setup generates separate ignored sponsor and attestor keys and checks the sponsor balance. Fund it through [the official Testnet faucet](https://faucet.sui.io/) when needed. The gateway supports address-balance and coin-object gas.

The fixture generator uses a fixed public test seed solely to create reproducible signature tests. Runtime signers are generated independently.

## Publish and upgrade

`npm run sui:publish` creates an initial deployment and refuses a duplicate publication when a manifest already exists. An interrupted publication resumes its saved transaction.

`npm run sui:upgrade` reads the compiler digest and owned upgrade capability, authorizes a compatible upgrade, publishes the new modules, and updates the public manifest. Saved upgrade intents retain the exact bytes and digest for recovery.

Existing account objects retain the original type identity. Calls target the current package; signatures and BCS type checks use `originalPackageId`. The corporate-action upgrade adds functions, structs, and dynamic-field markers while preserving the `Account` layout and existing function signatures.

## Validation

The Move suite covers genuine signature verification, role authority, arithmetic, limits, one-time approvals, replay, tampering, expiry, pause, cash, holdings, gross daily buying, forward/reverse splits, dividend credits, cash remainders, and event deduplication.

TypeScript tests cover wallet challenges, local bypass prevention, immutable transaction recovery, atomic ledger projection, original-package identity after upgrades, mismatched corporate receipts, final balance validation, and idempotent confirmation.

A synthetic corporate-event fixture was also executed against the deployed Testnet package through Tatum. The confirmed transaction doubled a 0.25-share position, credited a $0.50 simulated distribution, preserved cost basis and daily permission, and reconciled once. Its local sanitized receipt is `.artifacts/contracts/corporate-live-proof.json`.
