# Trove integration setup

Prepared October 26, 2026. Checklist for implementation, not a request to paste secrets into chat or authorization to buy a subscription.

## Current state

The local React/Vite/Tailwind product and persistent API now work without provider accounts. The user explicitly requested continuing locally. Typed adapters and a durable memory outbox are prepared but inactive; no product integration has been exercised with credentials. See [BUILD-STATUS.md](BUILD-STATUS.md).

The expected credentials were absent when checked, and the user confirmed accounts were not ready. A blank `.env.example` is now provided; copy it to ignored `.env.local` when configuring the future live stage. Keep keys out of chat. This does not enable the live product automatically.

Run `npm run check:integrations` for the manual preflight. With no credentials it reports missing setup. With configured Tatum and Marketstack keys it attempts read-only checks. Add `-- --write-memory` only to explicitly request a Mainnet diagnostic write, or `-- --model-call` for a metered coach check. The diagnostic is not useful learner history and must not be counted toward the ten-memory requirement. Acceptance alone is not confirmed storage. The local app never invokes these adapters automatically.

## Required configuration

| Configuration | Purpose | Exposure |
| --- | --- | --- |
| `TATUM_API_KEY` | Sui Testnet practice reads and Mainnet memory-object evidence. Verify permitted networks/methods. | Server only |
| `MEMWAL_ACCOUNT_ID` | Mainnet `MemWalAccount` object ID for the configured account. | Identifier; keep configuration server-side |
| `MEMWAL_PRIVATE_KEY` | Registered memory delegate credential, not the owner wallet key. | Server secret |
| `MEMWAL_SERVER_URL` | `https://relayer.memory.walrus.xyz` for final Mainnet memory use. | Public endpoint |
| `ANTHROPIC_API_KEY` | Grounded coach generation and carefully budgeted evaluation. | Server secret |
| `COACH_MODEL` | An available model with the required structured-output capabilities. | Server configuration |
| `MARKETSTACK_API_KEY` | Initial real daily market-data adapter. | Server secret; redact query-string credentials in logs |
| `DATABASE_URL` | Durable PostgreSQL state and outbox. | Server secret |
| Session secrets/allowed origin | Session signing/encryption and request-origin validation. | Secrets server-side; allowed origin public |
| `VITE_ENOKI_PUBLIC_KEY` | Preferred provider-wallet login. | Deliberately public provider key |
| `VITE_GOOGLE_CLIENT_ID` | Configured OAuth client/origins for the chosen provider. | Public identifier |
| `ENOKI_SECRET_KEY` | Restricted sponsorship if the account plan permits it. | Server secret |
| Practice package/account IDs | Verified Testnet Move deployment and per-learner account mapping. | Public identifiers, typed by network |
| Quote-attestor credential | Issue constrained practice-price tickets. Cannot serve as parent authority. | Restricted server secret |

`MEMWAL_AGENT_ID` on the submission form is the delegate's **public key**. It is not `MEMWAL_PRIVATE_KEY`, the memory account object ID, or a practice-account ID. The Walrus account owner credential is kept outside the application server for administrative account/delegate lifecycle operations.

In a Vite project, variables prefixed `VITE_` are bundled into client code. Never prefix server secrets that way. Ignore actual environment files and supply a blank-value example when implementation starts.

## Cost and entitlement checks

| Service | Verified expectation | Check before live use |
| --- | --- | --- |
| Walrus managed memory relayer | Advertises sponsored WAL and SUI for relayed writes, subject to service limits. | Delegate/account works, allowed payloads/rate, confirmations, retention, account-creation requirements. |
| Sui practice execution | Target Testnet and test gas. | Toolchain, faucet availability, sponsor behavior, deployed package/objects. Test coins are not real practice money. |
| Tatum | An API key and appropriate provider access are needed. | Actual account plan, RPC/method/network availability, credit/rate limits. Do not assume all services are free. |
| Marketstack | Published Free is limited/non-commercial; Basic advertises $9.99/month and commercial use. | Exact plan, symbols, history, caching/public display/export rights, and overage cap. No purchase authorized. |
| Enoki | Free Sandbox is advertised; public/live usage and sponsorship depend on account entitlements. | Available networks, origins, allowed targets, credits, and whether any paid plan is required. No purchase authorized. |
| Coach provider | Model calls are metered. | Available model, account budget, per-user limits, and evaluation ceiling before running paid calls. |
| PostgreSQL/hosting | Can start locally; public hosting may have free or paid limits. | Durable storage, worker lifecycle, connection limits, sleep/expiry behavior, and an approved hosting choice. |

Do not interpret a general instruction to build as unlimited authority to purchase plans, top up real tokens, enable uncapped overages, or publish the app. Prepare the concrete integration and show the actual cost/remaining requirement when such a decision is needed. No account or plan changes were made during research.

## First credentialed preflight

1. Use a patched supported Node runtime and a pinned Sui Testnet CLI. Start local PostgreSQL or connect an explicitly configured development database.
2. Resolve/install compatible packages and lock versions. Run type checks on the actual client constructors and response types.
3. Call Tatum for a real checkpoint and known object; verify Testnet/Mainnet selection and native transport. Record method, network, timestamp, and sanitized response/digest.
4. With the configured Mainnet memory account/delegate, write a useful non-sensitive test record, persist its accepted job ID, wait for completion, and recall it from a fresh client. Capture its blob ID and Mainnet object evidence. A health check is not this test.
5. Confirm whether the deployed relayer supports the SDK's inventory methods. Exercise pagination/count semantics before relying on a memory counter.
6. Validate one permitted market symbol, a daily history page, latest observation, split/dividend fields, and timestamps. Establish the selected plan's public-demo permissions before public use.
7. Exercise Google/Enoki login and server signature verification on the target network. Exercise a restricted sponsored transaction or record the exact entitlement/budget needed. A conventional wallet can support explicit development testing while this is configured.
8. Make one bounded model call with real retrieved context and a validated response. Confirm failure handling and cost reporting before larger evaluations.
9. Deploy and test the narrow practice contract on Testnet once the implementation is ready. Confirm permitted action, refused action, stale revision, changed payload, and duplicate submission through actual receipts.

This preflight is part of the authorized build once the user says to start; it has not been run yet. Missing credentials do not prevent local UI/domain development, but they prevent claiming the corresponding live feature is complete.

## Public demo and submission gate

Before publishing, verify working authenticated consumer journeys, confirmed Mainnet memory count/evidence, actual Tatum use, data display rights, privacy settings, secret scanning, and accurate network/demo labels. Have the repository, blog draft, and two-to-three-minute video ready for review. Follow the user's existing publishing/spending instructions rather than inventing a new approval flow.
