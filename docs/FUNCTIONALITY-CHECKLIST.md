# Functionality reference

Trove's implemented product flows and their main authority boundaries.

| Area              | Behavior                                                                                                                                         | Verification                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Family accounts   | Separate guardian/learner credentials, opaque sessions, single-use invitations, and persistent family scope.                                     | Account, API, and browser suites.                                |
| Portfolio         | Cash, shares, cost basis, return, daily marks, and historical reconstruction.                                                                    | Accounting and market suites.                                    |
| Market data       | Shared immutable USD daily snapshots, validation, dated quotes, adjusted trends, and freshness enforcement.                                      | Provider adapter and market tests.                               |
| Corporate actions | Automatic forward/reverse splits, dividend credits, share-precision cash remainders, stable event identities, and basis preservation.            | Corporate ledger and Move suites; actual Testnet reconciliation. |
| Orders            | Short-lived version-bound reviews, deterministic rounding, buy/sell execution, and one-time consumption.                                         | Accounting, API, Move, and browser suites.                       |
| Guardian controls | Per-trade/daily limits, pause, exact exceptions, and role-specific signatures.                                                                   | Authority, API, Move, and browser suites.                        |
| Chain lifecycle   | Wallet challenges, fixed sponsored calls, durable signed bytes, leased recovery, confirmed receipt/object validation, and idempotent projection. | Chain tests and actual Testnet transactions.                     |
| Learning journal  | Reasons, reflections, corrections, supersession, withdrawal, and immutable publication records.                                                  | Memory and API suites.                                           |
| Walrus Memory     | Consent-gated Mainnet publication, durable operation identity, blob confirmation, scoped recall, and correction filtering.                       | Outbox/recall tests and confirmed Mainnet learning records.      |
| Guide             | Bounded verified context, structured output, citations, caching, persistent cost reservations, and request limits.                               | Coach tests and the 32-case model evaluation.                    |
| Exercises         | Eight foundation concepts and distinct transfer scenarios with versioned deterministic scoring.                                                  | Learning evaluation and browser journeys.                        |
| Replay            | Equal capital, aligned adjusted prices, integer allocation, and residual cash.                                                                   | Accounting and browser suites.                                   |
| Production server | Same-origin built frontend/API, SPA routing, health, origin checks, secure cookies, and restart persistence.                                     | Production-server smoke suite.                                   |
| Delivery          | Docker Web Service, Render Blueprint, persistent disk, environment mapping, and dashboard instructions.                                          | [Deployment guide](RENDER-DEPLOY.md).                            |

For technical implementation, see [architecture](ARCHITECTURE.md), [Sui practice](SUI-PRACTICE.md), and [learning evaluation](LEARNING-EVALUATION.md).
