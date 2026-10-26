# Trove build plan and verification

Prepared October 26, 2026. The user subsequently authorized implementation and requested continuing locally without provider accounts. This remains the complete live build plan; see [BUILD-STATUS.md](BUILD-STATUS.md) for the implemented local stage and actual verification. Unchecked stages below are not completion claims.

## Build strategy

Prove the whole decision-to-memory-to-next-lesson path early, then expand and polish it. The frontend is a major deliverable and must follow [the saved reference brief](FRONTEND-BRIEF.md); it should not hide missing integrations behind finished-looking screens. Carry the functional states into that design from the start.

### Stage 1: project foundation and a concrete visual shell

- Preserve Vite/React/TypeScript; configure Tailwind, routing, theme tokens, font loading, and the original sapling SVG.
- Build the reference-led landing structure and consumer app shell, with clearly labelled development data.
- Establish the Node API, shared schemas/domain functions, database migrations, local configuration example, and durable job structure.
- Complete the provider preflight described in [INTEGRATION-SETUP.md](INTEGRATION-SETUP.md) as credentials become available. Resolve the market-data and login/sponsorship entitlement questions before making final public-demo promises.

Exit: coherent Trove design in the browser, working local API/database, typed provider adapters, and recorded live preflight outcomes or clearly isolated missing setup. No dummy success badges.

### Stage 2: the narrow real integration slice

- A parent/learner pair and one practice account.
- One supported company and one reviewed practice buy with an optional stated reason.
- Contract-enforced standing policy, precise arithmetic, signed execution, and a Tatum-reconciled receipt.
- Immutable decision/snapshot envelope and commitment; durable memory job; actual Mainnet confirmation and blob handle.
- A fresh authenticated browser session retrieves that learner's context and receives a source-grounded follow-up.

Exit: the entire path works against real services with the correct network labels. An API restart does not duplicate the practice action or discard an accepted memory job. A wrong actor and an out-of-policy action are refused.

### Stage 3: complete the consumer learning loop

- Expand the validated catalog, company detail, holdings, buys/sells, and daily price presentation.
- Add the exact decision story, reflections, corrections, frozen replay, and a small curated exercise catalog.
- Add parent progress, policy revision/pause/expiry controls, and exact one-time approvals after standing limits are proven.
- Add a clearly marked historical journey so the demonstration can show outcomes without waiting days.
- Two synthetic learner histories lead to different evidence-grounded next exercises. Verify their isolation.

Exit: an understandable complete learner/parent experience. Corrections alter the next response; missing data/memory/model service does not create fabricated outcomes.

### Stage 4: visual and motion completion

- Finish the fullscreen glyph expansion/contraction, continuous handoff to the globe, pointer/touch response, scanning lines, and configurable word extraction.
- Finish pixel readouts, scroll reveals, signal strip, icon waves, hover response, theme switching, and cream/green contrast sections.
- Compare desktop/mobile captures with the saved reference at matching viewport/scale. Check the app pages as carefully as the landing.
- Verify keyboard navigation, reduced motion, pause/resume, focus restoration, readable charts, and narrow-screen layout.

Exit: the requested aesthetic works in motion, and every primary action has an appropriate functional state. Measure performance on the actual build; do not claim a target FPS was achieved merely because it was configured.

### Stage 5: evidence, delivery, and submission preparation

- Run targeted financial, contract, authorization, memory-recovery, provider-failure, and browser checks.
- Run the predeclared coaching/memory evaluation within an agreed API budget. Save case definitions, inputs, outputs, failures, and aggregate results.
- Prepare at least ten useful confirmed Mainnet records through actual demo activity. Count distinct records using confirmed evidence rather than fuzzy recall length.
- Produce a reviewer view, sanitized evidence manifest, setup guide, architecture notes, published-blog draft, and two-to-three-minute demonstration script/video.
- Review actual product claims, market-data permissions, repository visibility, and the live event checklist before any authorized public delivery.

Exit: repeatable end-to-end demo, inspectable real integrations, honest evaluation report, and all required artifacts ready. Optional bonus work must not delay this.

## High-value verification

Tests below are warranted because they protect accounting, permission boundaries, persistent state, and the central learning claim. Do not add tests that only mirror decorative implementation details.

### Financial calculations

Use independently calculated fixtures for microdollar/share-unit conversion, partial buys/sells, residual cash, cost basis, zero-unit rejection, bounded overflow, and repeated round trips. Compare TypeScript and Move results. Test split handling and data discontinuities. Compare both replay paths against the same frozen price/event sequence.

Required invariants include no negative cash or holdings, no value created by rounding a buy/sell loop, consistent closed-position cost basis, equal starting capital/assumptions for comparisons, and no result calculated from absent/future data.

### Authorization and concurrent execution

Exercise wrong parent, wrong learner, wrong family/account, missing capability, changed order, expired/consumed approval, paused account, stale revision, stale sequence, old quote, forbidden instrument, duplicate callback, and a concurrent policy change. Verify a second tab cannot spend the same balance or reuse an action's authority.

An API refusal is not enough: contract tests and Testnet calls must demonstrate the relevant invariant. A timed-out receipt remains unresolved until reconciliation establishes its outcome.

### Persistent memory and privacy

Exercise accepted-but-not-done jobs, worker restart, lost acceptance response, lost polling response, rate limits, duplicate operation keys, incompatible key reuse, wrong account/network, cross-learner queries, corrected/superseded memories, expiry metadata, and provider outage. Verify inventory pagination follows `has_more`, including empty filtered pages.

Verify the new-session experience has no browser-local transcript available. Record the Walrus memories actually used. Do not call a provider health response or a `MemWalAccount` object alone proof that ten useful memories were stored.

### Coach behavior and learning-loop evaluation

Prepare a held-out set of approximately 24 chronological cases spanning concentration, time horizon, short-term reactions, explicit corrections, uncertain/missing reasoning, and prompt-injection text inside recalled content. Separate the exercise/answer rubric from the material available to the coach.

Compare the same present decision under three controlled conditions:

1. Relevant, authorized, confirmed history.
2. Current-session information only.
3. Conflicting or superseded history passed through the same deterministic version filters.

Keep model/configuration, current market facts, financial guards, and task wording fixed. Declare any changed variable. This may require roughly 72 model calls plus development calls; set an explicit budget before running it. If using fewer cases or a different design, report that clearly.

Measure source-reference validity, numerical agreement with deterministic metrics, unsupported assertions, correction adherence, cross-user leakage, exercise-selection relevance, and refusal to follow injected instructions. Distinguish automated checks from human-reviewed usefulness. Do not report a single model's opinion as objective proof of learning.

The goal is zero financial/authorization/isolation violations in the tested set and useful personalization with memory. These are acceptance targets, not achieved results or production guarantees. Report denominators, failures, versions, latency, and cost. A short hackathon evaluation cannot establish long-term improvement in real investment outcomes.

### Browser journey

Verify landing -> Try now -> company -> practice decision -> receipt -> remembered decision -> replay -> new exercise, plus parent controls and a refused action. Include returning-session recovery, model/memory outage, theme persistence, narrow mobile layout, keyboard focus, and reduced motion.

## Demonstration story

1. Explain the consumer promise in one sentence and enter the app.
2. Show a clearly labelled historical practice decision and its original reason.
3. Advance the scenario and show an honestly calculated outcome/replay.
4. Open a fresh session and demonstrate coaching that recalls that reason and selects a different task.
5. Correct a mistaken interpretation and show that the next response respects the correction.
6. Show the parent's boundary and one successful/refused action.
7. Open reviewer evidence briefly: real confirmed Mainnet memory handles, real Tatum reads, and Sui Testnet receipts.

Condense this to the required video length without implying simulated market time is actual elapsed learning time. Provide a longer repeatable walkthrough in documentation.

## Claims we can make only after evidence exists

| Claim | Required evidence |
| --- | --- |
| Remembers between sessions | Fresh-session recall from real confirmed Walrus records with source handles. |
| Adapts the next lesson | Controlled histories yield relevant different interventions, with sources and failures reported. |
| Parent boundaries are enforced | Contract-level checks, wrong-actor/changed-action tests, and real deployment receipts. |
| Uses Tatum meaningfully | Account/receipt state is reconciled through authenticated Tatum calls; provider/network recorded. |
| Real market data | Entitled provider observations, timestamps, source, coverage checks, and permitted public use. |
| Faithful reference motion | Actual browser comparison, including intro-to-globe continuity and mobile/reduced-motion behavior. |
| At least ten Mainnet memories | Distinct confirmed valid records, blob IDs, network/account metadata, and appropriate chain evidence. |
| Ready to submit | Working public demo/repo, required blog/video, identifiers, and current checklist verified. |

No benchmark result, perfect score, unique-in-the-world claim, or win probability is established by this plan.
