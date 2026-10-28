# Trove: Helping Children Learn to Invest, One Remembered Decision at a Time

Children recognise companies long before they understand investing. They know the products, hear about share prices, and form opinions about which businesses might do well. Learning how to explain a choice, recognise shared risks, and respond to a loss takes practice.

Parents and guardians need a way to give children that room to practise while keeping clear boundaries around their decisions.

That is why I built **Trove**: a family investing simulator with real market prices, guardian-set limits, and a learning guide that remembers how a learner's understanding changes.

**[Try Trove](https://trove-x.vercel.app/) · [Explore the source](https://github.com/ELLA0VICTOR/trove)**

## One family, two roles

A parent creates a family account, verifies their email, and invites a learner. They have separate sign-ins and share one practice portfolio.

The parent sets a limit for each investment and a daily buying allowance. They can pause practice, add practice funds, and enable remembered learning. The learner explores companies, explains their choices, and signs their own practice actions with a Sui wallet.

The demo follows Edward and Eddie Junior. Edward allows $50 per investment and $200 per day. Eddie can practise buying $25 of Apple within those limits. A $75 Microsoft choice becomes a specific request for Edward to review. Approval applies to that choice, and the original $50 limit remains in place.

Each family starts with $1,000 in practice funds. Refills preserve its holdings, learning history, and spending controls. Trove tracks contributed capital separately when calculating investment returns.

## Real prices make the outcome meaningful

Trove uses Alpaca's IEX feed for stock and ETF prices. A shared server cache imports prices about once a minute, and visible app screens refresh every thirty seconds. Each asset carries its source timestamp. Outside active trading, the latest available prices remain visible.

Holdings are valued from their share quantities and the current imported price. That feeds the holding's gain or loss, the portfolio's total value, and the chart. Timestamped observations let the chart begin on the first day. Cash additions are accounted for separately from investment gains.

Historical comparisons use adjusted prices. The accounting flow also handles supported splits and dividends, with recorded adjustments linking the earlier and later price snapshots.

## Remembering the reasoning

An investment outcome tells part of the story. A learner's explanation shows what they understood when they made the choice.

With guardian-enabled remembering, Trove stores investment reasons, reflections, corrections, and learning checks through **Walrus Memory on Mainnet**. The demo account has more than ten confirmed Mainnet learning records.

Consider Eddie's first thesis:

> I think owning Apple and Microsoft means I have spread my risk because they have different company names.

When Eddie asks whether he has spread his risk, Ask Trove retrieves relevant learning records from Walrus Memory. The application checks those results against the family's active records and confirmed blob evidence. The guide's answer includes references to the saved thoughts it used.

Eddie can then correct his thesis:

> I now understand that different company names can share the same industry risk. I need to look at what the companies have in common.

The correction links to the original record and becomes the active understanding. Once it confirms, a follow-up question can use that updated context. Returning in another session preserves the learning history.

This is the learning loop at the centre of Trove: make a choice, explain it, revisit the explanation, and carry a better understanding into the next decision.

## How the Walrus integration works

Each learning event has an immutable identity and a family-scoped memory namespace. A durable outbox publishes eligible records using idempotency keys, stores the relayer's acceptance ID, and checks for a confirmed Mainnet blob ID.

The UI updates memory progress in the background. A question entered while a correction is syncing stays queued and continues after confirmation, keeping the conversation on screen.

Recall results must match the active record's identity, content, scope, and blob evidence before they can enter the guide's context. Corrections take precedence over superseded records. The model returns structured answers with references that the application validates before displaying or caching them.

Guardian consent controls publication. Learners can correct their thoughts or remove them from the coaching context. These controls shape which learning records the guide uses.

## Tatum and Sui enforce the practice actions

Trove uses **Tatum's Sui Mainnet gRPC endpoints** for transaction execution, receipt reads, and account-object verification. Its [published Mainnet contract](https://suiscan.xyz/mainnet/tx/GtWEPwq845cEHQ1NCwviHRFF4GWBgKdPqvW9tHT1JYsu) contains the practice-account rules.

Its Move contract enforces available cash and shares, permitted assets, guardian limits, daily buying allowance, pause state, and one-time approvals. A signed price quote binds the action to a specific portfolio, market snapshot, policy revision, sequence, and expiry.

After a wallet signs an action, Trove checks the resulting transaction and account state through Tatum before updating the application ledger. Funding and execution receipts must match the expected account, amounts, counters, and authorities. Persisted transaction intents let interrupted confirmations resume, and duplicate receipts credit or debit the portfolio once.

The guardian activates the portfolio first. The learner can connect and register their own wallet when ready to practise. Trove sponsors transaction gas so family members can sign without holding SUI for fees.

The [Mainnet verification record](https://github.com/ELLA0VICTOR/trove/blob/main/docs/evidence/sui-mainnet.json) includes confirmed activation, refills, guardian controls, learner registration, purchases, an approved exception, and a sale. A repeated receipt leaves the recorded balance unchanged.

## Built around a learner's next choice

Trove's frontend uses React, TypeScript, Vite, and Tailwind CSS. A Hono API runs on Vercel with Neon PostgreSQL. OpenAI powers the remembered explanations with bounded context, request limits, reply caching, and a persistent usage budget.

The product brings together financial practice, family guidance, and a record of changing understanding. Edward keeps the boundaries. Eddie makes the choices, explains his thinking, and learns from the results.

**[Open Trove](https://trove-x.vercel.app/) · [Read the code and technical documentation](https://github.com/ELLA0VICTOR/trove)**

Built for **Total Recall**, the Tatum × Walrus Memory hackathon, in the **Consumer Finance Apps** track.
