# Trove build status

Updated October 26, 2026. The user authorized implementation, then confirmed: **“Not yet—continue the local build”** when asked about provider accounts. This is the current implementation record; the earlier research and architecture describe the intended live product.

## Working local product

Trove helps a young person understand their own investing decisions, with a parent setting practice boundaries. It includes:

- An original green sapling identity, NEAR-reference blue/cream themes, self-hosted IBM Plex Mono, fullscreen character introduction, rotating letter globe spelling GROWTH, pixel readouts/icons, scroll reveals, and responsive consumer pages.
- A persistent sample family, $1,000 initial practice capital, twelve instruments, authored daily observations, holdings, company search/detail, reviewed buys and sells, and original decision reasons.
- The updated app uses side navigation, simpler page headings, full-width company/industry search, filters, two-column horizontal company cards, and compact trend charts in exploration and holdings. Company marks are local assets sourced from official websites; fund tiles use their provider marks. Source URLs are recorded in `public/brands/sources.json`. The latest portfolio revision shows total value, invested value, cash, return, a full-width chart, and holdings without a large learning promotion. Desktop navigation can be hidden and restored, with its setting retained across reloads. The approved landing structure and motion remain; its palette follows the user's latest blue-theme instruction.
- Integer accounting, immutable two-minute quote previews, duplicate execution protection, policy revisions, daily gross-buy limits, pause controls, and exact one-time parent approvals. Reset invalidates earlier quotes.
- A deterministic local guide using active learning records; reflections and corrections remain distinct from original decision history. A correct concentration exercise advances to a time-horizon exercise without granting more financial authority.
- Two allocation paths compared over the same sample period and initial capital, including residual cash. Replay controls never transact or change actual holdings.
- An inspectable build-status page and explicit local/sample labels throughout the app.

The local API binds to loopback. A random HttpOnly SameSite cookie identifies a sample family; **the parent/learner switch is an explicit preview, not authentication**. The local database is `.trove/local.sqlite`. SQLite is used for this account-free local stage; the live architecture still calls for authenticated accounts, production persistence, and contract enforcement.

Prices are generated fixtures, not retrieved historical prices. Sample observations span July 6–September 25, 2026. Current practice actions record both their actual recording time and their sample market date. The holdings chart marks the current mix across the sample period; after a new action its footnote explicitly explains that it is not a reconstructed account ledger.

## Prepared, inactive provider infrastructure

| File                                 | Prepared behavior                                                                                                                                         | Actual validation                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `server/integrations/walrus.ts`      | Mainnet managed-relayer client, bounded typed records, server-derived learner scope, stable operation keys, job polling, blob confirmation, scoped recall | Compiles against installed SDK; no authenticated call                                                     |
| `server/jobs/memory-outbox.ts`       | Persisted payload/key, accepted job IDs, leases, retries, rate-limit cooldown, terminal failures, confirmed blob IDs                                      | Five deterministic failure/recovery tests; not attached to local sample activity or started automatically |
| `server/integrations/tatum.ts`       | Authenticated native Sui gRPC checkpoint, object, and receipt reads; explicit network                                                                     | Compiles against installed SDK; no authenticated call                                                     |
| `server/integrations/marketstack.ts` | Bounded daily-history import, consistency checks, timestamps, explicit raw-close basis                                                                    | Compiles; no credentialed import or data entitlement established                                          |
| `server/integrations/coach.ts`       | Structured educational response, untrusted-memory boundary, bounded timeout, cited-source validation                                                      | Compiles; no paid model calls or quality evaluation                                                       |
| `scripts/check-integrations.ts`      | Manual provider preflight, with explicit flags for memory writes/model calls                                                                              | Without credentials, correctly reports services as unconfigured/unexercised                               |

Adding keys does **not** automatically turn this sample into the live product. The adapters must be connected to genuine authenticated learner accounts, transaction receipts, and memory lifecycle rules, then validated together. Diagnostic memory writes are excluded from submission counts.

## Validation

- 26 accounting/API/outbox tests: exact parsing/rounding, 2,000 immediate round trips, replay assumptions, invalid inputs, stale/expired/duplicate orders, family scope, approvals, reset invalidation, learning and correction recency, honest integration status, and job recovery.
- Eleven Chromium browser journeys: first-session consistency, keyboard intro exit, persisted practice purchase, exact parent approval, learning progression, correction-aware guide, replay isolation, theme/reduced motion, mobile layout/runtime checks, company discovery with loaded brand assets and keyboard-accessible mobile navigation, and persistent desktop sidebar hiding/restoration with keyboard chart inspection.
- Desktop captures at 1440×1000 and mobile captures at 390×844 were inspected. Automated consumer layout checks also cover 360px width. Captures and raw results are in ignored `.artifacts/qa/`; Playwright failure traces belong in ignored `test-results/`.
- TypeScript project checks and the Vite production build. The provider SDKs are server-only; their credentials and clients do not enter the browser bundle.

These checks establish local behavior, not live provider reliability, production security, audited contracts, coach effectiveness, or measured learning outcomes. No target frame rate, perfect score, or winning outcome is claimed.

## Remaining live implementation

1. Provision the Tatum, Walrus account/delegate, market data, AI, and authenticated wallet/login configuration. Verify permitted usage, data rights, costs, and a patched supported Node runtime.
2. Implement and test the Sui practice contract and genuine parent/learner authority; deploy to Testnet, execute and reconcile through Tatum. No Move contract is included yet.
3. Connect confirmed decisions to the durable memory worker, establish actual Mainnet writes/recall, correction/version/deletion policy, authorized retrieval, and at least ten useful confirmed memories.
4. Connect real market observations with complete corporate-action handling and comparable replay assumptions; wire the live grounded coach and run the planned evaluation.
5. Finish genuine account persistence, fresh-session retrieval, recovery, and service failure tests.
6. Prepare the public repository, working hosted demo, published blog, and video; recheck the event checklist before any authorized publication or submission.

**Current confirmed Mainnet memories: 0. Live chain transactions: 0. Deployment/submission: none.**
