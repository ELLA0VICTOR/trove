# Trove build status

Updated October 26, 2026. The user authorized implementation, then confirmed: **“Not yet—continue the local build”** when asked about provider accounts. This is the current implementation record; the earlier research and architecture describe the intended live product.

## Working local product

Trove helps a young person understand their own investing decisions, with a parent setting practice boundaries. It includes:

- An original green sapling identity, one fixed white/forest-green palette with dark green-charcoal text, self-hosted IBM Plex Mono, fullscreen character introduction, rotating letter globe spelling GROWTH, pixel readouts/icons, scroll reveals, and responsive consumer pages.
- The app retains forest-green active navigation, filters, company-price, allocation, and status accents. Account metrics, lesson progress/rows, search, and parent controls stay white. Holdings rows now match Explore's pale-green hover/focus color with dark text, and the sidebar profile badge is removed. Charts and the decision orbit stay on white. Financial and learning behavior is unchanged.
- A persistent sample family, $1,000 initial practice capital, twelve instruments, authored daily observations, holdings, company search/detail, reviewed buys and sells, and original decision reasons.
- The portfolio chart uses separately loaded Lightweight Charts 5.2.1, with zoom/pan, crosshairs, date/value readings, a period-start reference line, area/line views, zoom/reset buttons, and 1W/1M/2M/All sample periods. Values remain the same authored sample series. Attribution and license notices are included; the library supplies rendering and interaction, not market data.
- The updated app uses side navigation, simpler page headings, full-width company/industry search, filters, two-column horizontal company cards, and compact trend charts in exploration and holdings. Company marks are local assets sourced from official websites; fund tiles use their provider marks. Source URLs are recorded in `public/brands/sources.json`. The latest portfolio revision shows total value, invested value, cash, return, a full-width chart, and holdings without a large learning promotion. Desktop navigation can be hidden and restored, with its setting retained across reloads. The approved landing structure and motion remain; its palette follows the user's latest white-and-green instruction. Theme switching and stored mode selection have been removed.
- Integer accounting, immutable two-minute quote previews, duplicate execution protection, policy revisions, daily gross-buy limits, pause controls, and exact one-time parent approvals. Reset invalidates earlier quotes.
- A deterministic local guide using active learning records; reflections and corrections remain distinct from original decision history. A correct concentration exercise advances to a time-horizon exercise without granting more financial authority.
- Local decision reasons, reflections, corrections, and lesson results now enter a held memory journal atomically with the state change. Sample seeds are excluded, repeated execution creates one record, and payloads cannot change under the same event ID. Corrected/deleted/reset local records are removed from this never-dispatched journal. `/api/memory/status` exposes family-scoped metadata without thought text. Uploads stay disabled and these records do not count toward the Mainnet requirement.
- Learn presents the two implemented lessons as progress-backed rows, with the sample guide under an Ask Trove tab. Decisions uses compact history rows and the company orbit directly on the page background. Parent is a primary navigation destination with requests, editable limits, and pause/resume. Decorative app headings, parent growth statistics, and the app's marketing footer have been removed. Decision reflections retain a link to the original choice.
- Two allocation paths compared over the same sample period and initial capital, including residual cash. Replay controls never transact or change actual holdings.
- An inspectable build-status page and explicit local/sample labels throughout the app.

The local API binds to loopback. A random HttpOnly SameSite cookie identifies a sample family; **the parent/learner switch is an explicit preview, not authentication**. The local database is `.trove/local.sqlite`. SQLite is used for this account-free local stage; the live architecture still calls for authenticated accounts, production persistence, and contract enforcement.

Prices are generated fixtures, not retrieved historical prices. Sample observations span July 6–September 25, 2026. Current practice actions record both their actual recording time and their sample market date. The holdings chart marks the current mix across the sample period; after a new action its footnote explicitly explains that it is not a reconstructed account ledger.

## Prepared, inactive provider infrastructure

| File                                 | Prepared behavior                                                                                                                                         | Actual validation                                                                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/integrations/walrus.ts`      | Mainnet managed-relayer client, bounded typed records, server-derived learner scope, stable operation keys, job polling, blob confirmation, scoped recall | Compiles against installed SDK; no authenticated call                                                                                                                   |
| `server/jobs/memory-outbox.ts`       | Persisted payload/key, held local records, accepted job IDs, leases, retries, rate-limit cooldown, terminal failures, confirmed blob IDs                  | Local activity attached transactionally in non-dispatchable held state; five worker recovery tests plus seven journal lifecycle/atomicity tests; no live worker started |
| `server/integrations/tatum.ts`       | Authenticated native Sui gRPC checkpoint, object, and receipt reads; explicit network                                                                     | Compiles against installed SDK; no authenticated call                                                                                                                   |
| `server/integrations/marketstack.ts` | Bounded daily-history import, consistency checks, timestamps, explicit raw-close basis                                                                    | Compiles; no credentialed import or data entitlement established                                                                                                        |
| `server/integrations/coach.ts`       | Structured educational response, untrusted-memory boundary, bounded timeout, cited-source validation                                                      | Compiles; no paid model calls or quality evaluation                                                                                                                     |
| `scripts/check-integrations.ts`      | Manual provider preflight, with explicit flags for memory writes/model calls                                                                              | Without credentials, correctly reports services as unconfigured/unexercised                                                                                             |

Adding keys does **not** automatically turn this sample into the live product. The adapters must be connected to genuine authenticated learner accounts, transaction receipts, and memory lifecycle rules, then validated together. Diagnostic memory writes are excluded from submission counts. The user requested private placeholder configuration and dashboard instructions; these are now in ignored `.env.local` and [ACCOUNT-SETUP.md](ACCOUNT-SETUP.md). `setup:check` is offline and never prints values; targeted provider preflight skips placeholders and supports separate Tatum network keys and authenticated Walrus recall. Credentials remain unconfigured.

## Validation

- 34 accounting/API/configuration/outbox/journal tests: exact parsing/rounding, 2,000 immediate round trips, replay assumptions, invalid inputs, stale/expired/duplicate orders, family scope, approvals, reset invalidation, learning and correction recency, honest integration status, job recovery, atomic journal failure rollback, immutable payload identity, correction association, deletion, real database reopen, held-record dispatch prevention, and secret-free setup output.
- Fourteen Chromium browser journeys: first-session consistency, keyboard intro exit, persisted practice purchase, exact parent approval, lesson progression, correction-aware guide, replay isolation, fixed palette/reduced motion, mobile layout/runtime checks, company discovery with loaded brand assets and keyboard-accessible mobile navigation, persistent desktop sidebar hiding/restoration with keyboard chart inspection, parent navigation/limit edits/pause/resume, a decision-linked reflection that preserves the original reason, and financial-chart keyboard/zoom/pan/style/date-range controls without account mutations.
- Desktop captures at 1440×1000 and mobile captures at 390×844 were inspected. Automated consumer layout checks also cover 360px width. Captures and raw results are in ignored `.artifacts/qa/`; Playwright failure traces belong in ignored `test-results/`.
- TypeScript project checks and the Vite production build. The provider SDKs are server-only; their credentials and clients do not enter the browser bundle.

These checks establish local behavior, not live provider reliability, production security, audited contracts, coach effectiveness, or measured learning outcomes. No target frame rate, perfect score, or winning outcome is claimed.

## Remaining live implementation

The audit, build order, actual data limitations, and judging evidence targets are recorded in [FUNCTIONALITY-CHECKLIST.md](FUNCTIONALITY-CHECKLIST.md).

1. Provision the Tatum, Walrus account/delegate, market data, AI, and authenticated wallet/login configuration. Verify permitted usage, data rights, costs, and a patched supported Node runtime.
2. Implement and test the Sui practice contract and genuine parent/learner authority; deploy to Testnet, execute and reconcile through Tatum. No Move contract is included yet.
3. Connect confirmed decisions to the durable memory worker, establish actual Mainnet writes/recall, correction/version/deletion policy, authorized retrieval, and at least ten useful confirmed memories.
4. Connect real market observations with complete corporate-action handling and comparable replay assumptions; wire the live grounded coach and run the planned evaluation.
5. Finish genuine account persistence, fresh-session retrieval, recovery, and service failure tests.
6. Prepare the public repository, working hosted demo, published blog, and video; recheck the event checklist before any authorized publication or submission.

**Current confirmed Mainnet memories: 0. Live chain transactions: 0. Deployment/submission: none.**
