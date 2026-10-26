# Trove functionality

Prepared October 26, 2026, Africa/Lagos. Target implementation specification, following the approved [product direction](PRODUCT-BRIEF.md). The user has since authorized the build and requested continuing locally without provider accounts. See [BUILD-STATUS.md](BUILD-STATUS.md) for current behavior and remaining live work.

## Product in one paragraph

Trove helps a young person learn investing through their own practice decisions. They explore real companies, make a practice investment, and optionally explain why. Later, Trove brings back that exact decision, shows what happened, lets them compare a different allocation over the same period, and checks whether they can apply the lesson in a new situation. A parent sets boundaries and sees useful learning progress. The coach remembers the learner; the financial calculations and permissions remain deterministic.

## Implementation decisions

These resolve previously open product choices so work can start without requiring the user to specify every detail.

| Area | Recommended first version |
| --- | --- |
| Learning audience | Teen-oriented language, approximately 13–17, with parent guidance. Hackathon testing uses synthetic learner profiles and adult reviewers. This is a product-language choice, not a determination of real-world onboarding eligibility. |
| Money | USD-denominated practice funds only; no deposits, withdrawals, real shares, or transferable investment tokens. |
| Starting balance | 1,000 practice dollars, identified as a demonstration default. Parent-controlled resets; no profit-based permission increases. |
| Markets | A small US stock/ETF catalog, initially around 12 instruments, enabled only after provider coverage and data checks pass. |
| Data frequency | Last available daily market observations, with market date and source shown. Real market data does not mean a live trading feed. |
| First lesson | Owning several technology-related companies can still leave shared exposure. Assess the reasoning independently of whether prices rose or fell. |
| Other initial concepts | Time horizon and reacting to a short-term price move. Keep the initial teaching catalog small and well designed. |
| Replay | Compare original and learner-selected alternative allocations over exactly the same frozen historical period. |
| Memory | Typed records persisted to Walrus Memory Mainnet; retrieval changes coaching and the next exercise. |
| Practice-account execution | A dedicated Sui Testnet Move account with contract-enforced rules, positions, and practice cash. Tatum reads verify it. |
| Familiar sign-in | Preferred Google sign-in through Enoki, with user-held transaction signing. Enoki entitlements and sponsorship require a credentialed setup check. |
| Technical evidence | A separate reviewer view with actual memory and transaction evidence, leaving normal consumer screens simple. |

All concrete default amounts, age language, supported symbols, and lesson copy remain easy to change during implementation. None are financial recommendations.

## Learner journey

### 1. Enter and understand the product

Try now opens the app. Offer an immediately understandable sample journey and a clear way to start a personal family account. A sample tour uses labelled synthetic history; it never signs transactions as a real parent or inherits another visitor's history.

Real learner/parent membership comes from authenticated identity and an explicit family invitation. Changing a visible profile is not sufficient to become a parent. An unlinked adult can create their own family; they cannot join or control someone else's family by choosing a role.

### 2. Explore a company

Show a small searchable catalog with plain descriptions, sector/context, a daily price chart, price date, and source. Prefer a useful explanation of what a company does over a wall of trading indicators. The app should explain what a fund represents without pretending it removes all concentration risk.

The candidate catalog includes five technology companies for the first lesson, other sectors, and one or two broad-market funds. Provider coverage must be checked before enabling a symbol. Dated, curated descriptions may be used; the coach must not invent current news, earnings, or historical facts.

### 3. Make a practice decision

Choose a dollar amount to buy, or a quantity to sell. Show the price used, its market date, estimated units, practice balance, and applicable boundary. The explanation is optional: "What made you choose this?" A missing reason stays missing; Trove cannot later present an inferred reason as the learner's words.

The confirmation preserves the reviewed action and optional explanation. Execute only the user's signed action. Show pending, successful, refused, cancelled, and unresolved states distinctly. A page refresh must recover a pending action without repeating it.

A quote is a paper execution at the displayed last available market observation. The UI must not describe it as an exchange fill or conceal its date. Buying and selling practice positions is allowed; leverage, shorting, derivatives, and automatic trading are outside the first version.

### 4. Return to a remembered choice

Show a dated, recognizable card: what the learner chose, what they actually said, and what happened afterwards. Explain why Trove brought it back. Include a human-readable source link to the original decision.

The first session does not have to wait weeks for an outcome. A guided historical practice journey can advance through a real past market period. It must clearly distinguish the historical market date from the actual date the user acted and the memory was written.

### 5. Replay and reflect

Open one focused comparison: original allocation and an alternative the learner selects. Show the same starting value, date range, market path, fees, cash treatment, and supported corporate-action assumptions. Include cash in both portfolio paths. Do not secretly optimize the alternative after seeing the result.

Use the resulting numbers even when the alternative performs worse. Reflection asks what the comparison teaches about the original reasoning, rather than treating the best-performing path as the right answer.

### 6. Apply the idea elsewhere

Choose a different task using the learner's history. For example, someone who still equates a greater number of holdings with diversification gets a new group of companies with shared exposures. Someone who already explained the concept correctly gets a different question rather than the same beginner lesson.

Store the response and the evidence of demonstrated understanding. Completing a lesson, earning profit, or receiving an AI assessment does not change spending permissions.

## Remembering coach

The coach can explain a decision, ask a focused question, point to a previous reflection, compare calculated scenarios, and recommend the next educational exercise from a curated catalog. It cannot execute trades, widen rules, approve its own requests, fabricate a past conversation, or use a memory as authoritative account state.

Each response has validated structure: explanation, relevant decision/source IDs, the concept being discussed, and an optional permitted next exercise. Numbers come from the calculation engine and are rendered from validated metric references. A valid JSON schema alone does not establish that an explanation is true.

Distinguish four categories in the records and response:

- A learner's direct statement.
- An observed action or measured outcome.
- A coach's tentative interpretation.
- A learner-confirmed correction or reflection.

The learner can inspect relevant memories, correct a statement, and request removal of supported stored records. A correction is immediately excluded from coaching's active context using deterministic version metadata, even while its replacement write is pending. Removal and storage expiry require actual provider lifecycle handling; do not promise instantaneous erasure from every copy.

When memory is unavailable, the interface says it cannot access earlier context. It can still explain the current decision, with narrower claims. When the model is unavailable, preserve the portfolio and provide the deterministic explanation/check that can be supported; do not label a scripted response as live AI.

## Parent journey

### Establish boundaries

The parent creates a family, links a learner identity, and signs the initial practice-account policy. The initial policy includes allowed assets, per-buy limit, gross daily buy allowance, expiry, pause status, and a monotonically increasing revision. A larger account balance is not itself permission to spend more.

Define the daily window as UTC days in the first contract. Display the actual reset time in the parent's locale. Selling a holding does not restore the gross daily buy allowance. Pause applies to execution; a future feature could separately distinguish pausing new buying from pausing every action.

### Respond at a boundary

Explain which rule prevented an action and allow an approval request. A parent can decline, approve one specifically described practice action, or explicitly change a standing policy. These are separate actions with separate review text.

A one-time approval binds the account, learner, side, asset, exact dollar budget or sell quantity, price/units bounds, current policy revision, and expiry. It can only bypass the named rule. It cannot bypass account membership, a paused account, insufficient practice cash/positions, the allowed global asset catalog, expired price data, or replay protection. Changed orders require new review.

Prioritize a correct standing-policy path first; implement exact one-time approval after that path is tested, before presenting the approval feature as functional.

### Follow progress

Show concepts attempted, supporting answers/reflections, next learning focus, and approval requests. Distinguish demonstrated understanding from an AI interpretation. Do not market an assessment as a certification of financial maturity.

A parent summary exposes defined progress records, not every private coach conversation. The sharing rules must be visible. The first build's server can process both kinds of records; it must not claim cryptographic separation between parent and learner when using an operator account.

## Memory that changes the product

Meaningful memory types:

| Type | Product use |
| --- | --- |
| Decision and stated reason | Bring back the learner's actual choice and words. |
| Outcome observation | Connect the later market path to the relevant decision and date. |
| Reflection | Preserve what the learner understood or still questioned. |
| Concept-check response | Select a useful next task using observable evidence. |
| Correction | Stop repeating a mistaken profile statement or interpretation. |
| Later transfer attempt | Show whether the concept was applied in a new situation. |
| Learning preference | Change explanation format when explicitly stated or confirmed. |
| Shared progress summary | Give the parent an appropriate summary with provenance. |

Do not write every token of a conversation or split a single fact into many records to inflate the count. A complete pair of guided journeys should naturally produce more than ten useful confirmed records.

The visible learning loop is more than remembering a name: two different histories should produce different, explainable follow-up tasks for an otherwise similar present decision. The source memories used must be inspectable, with permission.

## Core functional acceptance

1. A learner can explore, preview a buy, explain it, execute a permitted practice action, and see a receipt verified through Tatum.
2. A forbidden or stale action is refused by the Move contract even when the browser/API's normal flow is bypassed.
3. The action's original reason and relevant snapshot are preserved, linked to its receipt, and written to Walrus Mainnet.
4. A new authenticated session can recover the same learner's relevant learning context without browser-local history.
5. A replay calculates both paths reproducibly; the next exercise visibly depends on the learner's prior evidence.
6. A correction changes subsequent context and does not leak another learner's history.
7. A parent can inspect relevant progress and explicitly manage boundaries; the learner and coach cannot impersonate that authority.
8. The public demo distinguishes real market observations, historical exercises, synthetic histories, practice funds, Testnet execution, and Mainnet memories.
9. At least ten distinct valid Mainnet memories have confirmation records, blob handles, and relevant ownership/network evidence before submission.

## Explicit later scope

Real securities ownership, real-money funding, tax reporting, personalized trade recommendations, derivatives, social trading leaderboards, production onboarding of children, cross-chain bridges, and perpetual memory guarantees are separate product expansions. They do not belong in the first build's claims.

Agent payments and Tatum AI Builder are optional award paths, not required ingredients of the approved consumer experience. Add them only if they improve it after the main loop works.
