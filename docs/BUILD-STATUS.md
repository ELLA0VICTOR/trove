# Trove build status

Updated October 26, 2026. This is the current implementation record; architecture/research documents also describe future production work.

## Working application

The approved landing design and white/forest-green consumer layout remain. Home, Learn, Explore, Decisions, Replay, Parent, and About this build work with practice funds and authored sample prices. Company logos and interactive portfolio charts remain intact.

The guest sample stays separate from saved accounts. Its preview role switch applies only to guest data and cannot enter an authenticated family's records. Existing guest history is never uploaded.

Saved families now have separate parent and learner usernames/passwords, salted scrypt password hashes, random HttpOnly SameSite sessions stored as hashes, seven-day session expiry, login/registration limits, logout invalidation, and hashed single-use 24-hour learner invitations. Roles come from membership, not a dropdown. The first version supports one parent and one learner per family. New families start with $1,000 practice cash and no preloaded positions.

Parent limits, pause/resume, stale-policy checks, exact one-time approvals, integer accounting, two-minute reviewed quotes, and duplicate execution protection remain enforced by the local API. These are not yet Sui contract permissions. Parents cannot execute learner choices; learners cannot edit parent controls or enable memory sharing.

## Connected memory and coaching

A parent explicitly enables remembering in Account settings. This covers that family's existing and new practice reasons, reflections, corrections and lesson results. The managed relayer processes plaintext before encrypted storage; namespaces and API authorization provide application isolation, not separate family-owned encryption keys. The operator holds the configured delegate.

Domain changes and memory jobs are persisted atomically. The worker uses stable operation keys, persisted accepted job IDs, leases with fencing, backoff, and confirmed blob IDs. Accepted jobs are not counted as confirmed. Guest jobs remain held. Removing/correcting a thought excludes it from future coaching; never-dispatched payloads are removed, while attempted/confirmed jobs retain withdrawal metadata. This is not remote erasure. Pausing prevents new submission requests and live coaching; already in-flight jobs can finish and are reconciled.

The live OpenAI guide retrieves from the authorized Walrus namespace, matches results against active canonical records and confirmed blob receipts, excludes superseded/removed/wrong-scope/changed records, and prioritizes the current correction. Pending thoughts block stale coaching. Citation and correction checks run before a reply is shown. Provider failure returns an explicit error rather than fabricated recall or a silent local substitute.

A durable five-minute reply cache avoids another model call for an unchanged question/context. Concurrent duplicates are coalesced by a persisted claim; changed thoughts invalidate results. Family/global request limits, bounded excerpts, 384 output tokens, no paid tools, no automatic model retries/fallbacks, and a persistent user-approved $1 allowance bound usage. This allowance estimates this adapter's usage, not all spending on the OpenAI key.

The API reads ignored .env.local through the development command. Adding keys alone does not upload guest records; authenticated membership and parent consent are required. TROVE_LIVE_SERVICES=0 disables live services for an offline run.

## Actual external validation

- Tatum Testnet and Mainnet checkpoint reads passed provider preflight.
- Marketstack returned 43 AAPL daily observations in a bounded history check. These observations are not yet the app's dataset.
- A non-personal demonstration ran through the actual account/domain API: four practice choices, two concept checks with initial mistakes and successful follow-ups, reflections, and a correction.
- **Ten distinct active learning records reached Walrus Mainnet done status with blob IDs.** These are explicitly synthetic demo practice activity over authored market observations, not real investment actions or measured human learning.
- OpenAI retrieved and cited the actual stored correction, then did so again after logout and a fresh authenticated session. Repeating the unchanged question used the cache.
- Total OpenAI ledger estimate at that checkpoint: **$0.0002884 across three generation requests**, including the earlier standalone preflight. No automatic retry made another model call.
- The first integrated guide attempt returned 503 before a generation request; a subsequent deliberate read/guide attempt succeeded without recreating any memory writes. This is observed behavior, not a claim of uninterrupted provider reliability.

Sanitized local proof is in .artifacts/integrations/confirmed-memory-loop-2026-10-26.json. Private generated demo credentials are in .trove/demo-access.json; both directories are ignored by Git. About this build reports the current family's actual confirmed count rather than a global hardcoded number.

## Verification

- 55 accounting, API, account, memory journal/worker, scoped learning and cost-control tests. Tests cover cross-family cookie/ID attempts, parent/learner authority, invitations, login/logout/expiry, consent, atomic rollback, immutable payloads, retries, stale leases, correction priority, missing memory, concurrent explanations, cache invalidation and budget persistence.
- 15 Chromium journeys, including family creation, an independent learner session, invitation redemption, role refusal, returning history, plus the existing portfolio/learning/approval/replay/mobile journeys.
- TypeScript and production build checks. These checks do not constitute a security audit or prove educational effectiveness.

## Remaining implementation

1. Import/cache entitled real market observations into the app, with consistent corporate-action handling, date alignment and explicit daily-price freshness. The current portfolio plot still values the current mix across a sample period, not a reconstructed transaction ledger.
2. Implement/test/deploy the Sui Testnet practice contract, genuine wallet-signing authority, exact approval and price-attestor boundaries, and Tatum reconciliation. Checkpoint preflight alone is not the final Tatum product integration.
3. Complete remote memory renewal/removal/expiry lifecycle, operational diagnostics and recovery, and broader multi-family isolation/failure evaluation. Account sharing currently has one parent and one learner.
4. Expand and evaluate the learning loop beyond the two implemented concepts. Run held-out history/no-history/correction and injection cases within the $1 allowance; report outcomes and failures honestly.
5. Prepare production storage, HTTPS/origin configuration, account recovery/password reset and deployment hardening. Username/password local sign-in works without Enoki/Google configuration; preferred wallet/Google login remains optional future work.
6. Finish the hosted demo, public sanitized repository, published blog and short video. No publishing, submission or winner claim has been made.

**Current demonstrated Mainnet learning records: 10. Sui practice transactions: 0. Real stock purchases: none.**
