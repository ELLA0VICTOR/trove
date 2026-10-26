# Trove: agreed product direction and quality bar

Decision date: October 26, 2026 (Africa/Lagos).

## Current decision

The user approved the family investing-and-learning product described below. This is the current direction for the Consumer Finance Apps track of Tatum x Walrus Total Recall.

**Product name: Trove.** The user chose Trove over Rook. The active workspace is `C:\Users\kolev\Desktop\trove`. "First Portfolio" was an explanatory working label, not the product name.

The user wants exceptional integration depth, technical quality, creativity, and presentation. Do not reduce the work to satisfying the ten-memory checklist, or add technology without a useful product role. Aim for strong, independently inspectable evidence in every judging category; do not promise perfect scores or a win.

The user has authorized implementation and requested a local build while provider accounts are unavailable. A working React/TypeScript/Vite/Tailwind product and persistent local API now implement the sample learning journey. See [BUILD-STATUS.md](BUILD-STATUS.md) for tested behavior and remaining work. No authenticated provider integration, real transaction, paid model call, deployment, or submission has occurred.

This brief supersedes the broader apprenticeship alternatives in the Cresco assessment. NEAR work remains aborted. CommonFix, NoEcho, Latch, and the earlier conditional-booking concept are not active proposals.

Frontend direction is recorded in [FRONTEND-BRIEF.md](FRONTEND-BRIEF.md). Reference-site inspection is recorded in [DESIGN-REFERENCE.md](DESIGN-REFERENCE.md). Recommended functionality is in [FUNCTIONAL-SPEC.md](FUNCTIONAL-SPEC.md), with [architecture](ARCHITECTURE.md), [research](FUNCTIONALITY-RESEARCH.md), [setup requirements](INTEGRATION-SETUP.md), and [implementation plan](IMPLEMENTATION-PLAN.md). Current implementation evidence is separate from these design targets.

## Consumer promise

A young person learns to invest through their own decisions, supported by a coach that remembers their learning journey. A parent can follow progress and set explicit account boundaries.

The defining experience is:

**Make a decision -> observe the outcome -> replay and understand it -> apply the lesson in a different situation.**

The consumer comes to build a practice portfolio, understand decisions, and develop financial independence. The engineering serves that experience.

## Agreed initial scope

- A family investing-and-learning app inspired by Cresco's guided independence, with an original implementation and a distinct emphasis on personal decision replay.
- A learner explores companies using real market data and makes choices with practice funds.
- The learner may record a short explanation. The coach must distinguish a stated reason from a hypothesis about the learner's reasoning.
- The app connects decisions, explanations, market context, outcomes, corrections, and prior teaching across sessions.
- The learner can replay a past period with different example allocations, with the assumptions made explicit.
- Later exercises change the situation to test whether the learner can apply the underlying concept.
- A parent sees understandable progress and controls account boundaries.
- Approved rules are enforced in the Sui demonstration account; the browser is not the authority boundary.
- Walrus Memory writes are on Mainnet. Practice funds, demonstration transactions, and real market data are clearly distinguished.

The initial product does not claim stock ownership, live securities brokerage, or production trading by minors. Real stock purchasing, bank funding, and fiat payment access would be separate integrations if pursued later.

## Canonical example

A learner buys five technology companies and explains, "I bought five companies, so I have spread my risk." The app preserves the explanation and the information available at that time.

When the holdings subsequently move together, the coach revisits that specific decision and teaches the distinction between the number of holdings and shared exposures. A replay compares selected example allocations through the same specified period. It must show the actual calculated results, including cases where the alternative does worse; it must not manufacture a superior outcome.

A later exercise uses different companies or a different setting to test the underlying understanding. The next experience is chosen from the learner's recorded history rather than a generic lesson sequence.

Investment profit, a quiz score, a coach assessment, or lesson completion never automatically expands financial authority. Any standing-rule change requires the authorized human's explicit action.

## Roles of the stack

| Component | Product responsibility | Evidence needed |
| --- | --- | --- |
| Walrus Memory | Persist private learning context, decision reasoning, outcomes, corrections, and subsequent coaching context | Confirmed Mainnet writes, scoped retrieval, source references, and recovery in a fresh session |
| Tatum Sui RPC | Read authoritative demonstration-account state, approved permissions, transactions, and outcomes | Actual provider calls linked to the state and receipts displayed by the app |
| Sui Move | Enforce the approved demonstration-account boundaries and execution rules | Successful and refused execution paths, authorization tests, stale-permission and repeated-request tests |
| Market data adapter | Supply the market observations used in practice and replay | Provider attribution, observation timestamps, freshness handling, market-session and corporate-action treatment |
| Scenario and replay engine | Calculate comparable portfolio paths under explicit assumptions | Deterministic calculations, reproducible inputs, controlled comparisons, and no future-data leakage |
| Learning coach | Explain recorded decisions, retrieve relevant history, and select a later teaching intervention | Grounded outputs, appropriate uncertainty, explicit correction handling, and comparative evaluations |

Tatum is an infrastructure provider, not a separate blockchain or a replacement for a stock-market data feed. Provider selection, credentials, SDK versions, supported RPC transport, pricing, and market-data permissions still need verification during implementation planning.

Encryption and familiar login are supporting implementation choices. Sensitive memories need an explicit trust model; the default managed memory relayer sees plaintext. Private stored reasoning does not make public Sui transaction metadata private.

## Judging category: integration, 30%

The required integrations must participate in the learner's actual journey.

- Store useful memories for decisions, stated reasoning, context, observed outcomes, reflections, corrections, and later interventions. Avoid padding the count with arbitrary records.
- Confirm memory persistence before reporting success. An accepted asynchronous job is not proof of a completed Mainnet write.
- Retrieve the right learner's context at the point it affects coaching or the next exercise. Track the source memories used.
- Recover relevant history across sessions and devices, rather than relying on browser-local history to make the demo work.
- Use Tatum to reconcile the executed action and account state before recording an execution outcome as confirmed.
- Keep authoritative balances and positions in deterministic financial state. Semantic memory retrieval does not calculate or establish a balance.
- Link the chain receipt, decision record, market-data snapshot, replay, and follow-up intervention so a reviewer can inspect the full path.
- Demonstrate how missing, stale, conflicting, or unavailable data affects the experience without fabricated success.

## Judging category: technical quality, 30%

- Separate educational simulation, market observations, account authority, transaction lifecycle, and learning memories.
- Use explicit parent/learner roles. Every privileged operation must enforce the appropriate authority.
- Define limits precisely: permitted assets/actions, applicable per-action or period limits, expiry, pause/revocation, and policy revision where included.
- If exact one-time exceptions are included, bind them to the precise action and current policy, consume them safely, and reject alteration or replay.
- Prevent duplicate execution and inconsistent account state across concurrent tabs, retries, and delayed responses.
- Preserve submitted, pending, confirmed, refused, and unknown outcomes as distinct states.
- Specify arithmetic, rounding, fees, fractional holdings, and corporate-action behavior for supported assets. Avoid false precision or unsupported features.
- Store observation time separately from receipt time. A historical decision may use only the information available at that point.
- Make replay assumptions explicit, including timing, fees, and market-data treatment. Replays explain a scenario, not a guaranteed alternate life outcome.
- Isolate learners' memories and support explicit consent, correction, retention, and expiry handling.
- Treat retrieved documents and memories as data. Embedded instructions do not gain system authority or permission to transact.
- Test financial and authorization invariants and meaningful end-to-end failure paths. Publish failures and limitations alongside results.

## Judging category: creativity, 20%

The approved differentiator is personal decision replay connected to future learning. Additional depth should reinforce that experience.

Candidate refinements to validate and scope:

1. Preserve a dated decision explanation and its available evidence so later reflection cannot silently rewrite the original reason.
2. Let a learner compare an alternative allocation under the same declared market path and assumptions.
3. Separate outcome from decision process: a profitable result does not establish good reasoning, and a loss does not by itself establish a bad decision.
4. Test transfer of understanding in a changed situation rather than repeat the previous answer.
5. Tailor help to observed misunderstandings while preserving uncertainty and allowing the learner to correct the coach.
6. Provide a parent with a useful explanation of demonstrated learning without turning the app into a surveillance feed or an automated financial-maturity certification.

These refinements are proposed scope choices, not all promised features. Existing tutors, family finance apps, and Cresco's reflection features remain relevant comparisons; global novelty has not been established.

## Judging category: presentation, 20%

- Explain the user benefit before the stack.
- Show the learner and parent journeys in plain language.
- Tell one complete story: an understandable decision, its outcome, a replay, a later changed situation, and coaching informed by memory.
- Let a reviewer inspect relevant Mainnet memory evidence, Tatum-backed state, and Sui demonstration receipts.
- Clearly label real market data, historical scenarios, synthetic learner histories, practice funds, and network environments.
- Include successful, refused, and unresolved outcomes without misleading presentation.
- Provide a working public demo, public repo, setup instructions, and a short repeatable judge path.
- Publish the required blog and a two-to-three-minute video. Human review should catch misleading claims and demo/documentation mismatches before publication.

## Evidence and evaluation plan

No results have been measured yet. The following are intended checks, not benchmark claims:

- Deterministic portfolio and replay calculations against independently calculated fixtures.
- Parent/learner authorization, paused or expired authority, duplicate requests, stale rules, and concurrent execution cases.
- Source-supported coaching across corrected, missing, and contradictory memories.
- Equivalent chronological cases with relevant memory, current-session-only context, and stale or conflicting context. Keep financial safeguards identical across variants.
- Separate measures for factual/source accuracy, useful intervention selection, unnecessary questioning, incorrect assertions, and later application to a changed scenario.
- At least two learner histories leading to meaningfully different, explainable follow-up experiences.
- An unseen scenario set and explicit reporting of failures. A short prototype study cannot establish lifelong learning gains or future investment performance.

## Open decisions

The name is Trove and the dedicated workspace is `C:\Users\kolev\Desktop\trove`.

The recommended functionality/architecture documents now resolve the implementation direction: teen-oriented learning language, an explicit family model, concentration as the first journey, a small validated US catalog with daily observations, Testnet practice execution, and managed Mainnet typed memory. These are implementation recommendations within the user-delegated design scope.

Remaining external setup decisions are credentials, the selected market plan's coverage/display rights, and familiar-login/sponsorship entitlements. The exact enabled symbol set, historical dataset, permitted storage lifecycle, and compatible package versions require the initial integration checks. Optional award paths remain secondary to the complete product.

## Next step

Review the working local product, then follow the remaining live integration plan once accounts are configured: an enforced Sui practice action, Tatum verification, confirmed Mainnet Walrus memory, and history-informed coaching in an authenticated fresh session. Keep these external outcomes distinct from the working local demonstration.

## Supporting research

- [Verified event brief](HACKATHON-RESEARCH-2026-10-26.md).
- [Cresco reference repository](https://github.com/Faadil1/cresco).
- [Cresco's official Stocklana project and award listing](https://hackathons.solana.com/hackathons/stocklana/projects/2a02ceaa-17c7-45fa-a5a7-cfa6cd88b1c8).

The previously verified submission deadline is November 10, 2026, 17:00 UTC / 18:00 Lagos time. Recheck official event requirements before submission.
