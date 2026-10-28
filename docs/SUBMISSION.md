# Trove — Total Recall submission

## Entry

| Field             | Value                                                    |
| ----------------- | -------------------------------------------------------- |
| Project           | Trove                                                    |
| Track             | Consumer Finance Apps                                    |
| Live app          | https://trove-x.vercel.app/                              |
| Public repository | https://github.com/ELLA0VICTOR/trove                     |
| Demo file         | `C:\Users\kolev\Desktop\yt-automation\trove demo.mp4`    |
| Demo duration     | 2 minutes 23 seconds; 1920 × 1080                        |
| Blog copy         | [Medium-ready article](BLOG-POST.md)                     |
| Submission form   | https://recall-tatum-walrus.vercel.app/ → Submit Project |
| Deadline          | November 10, 2026, 17:00 UTC / 18:00 Lagos               |

## Mainnet deployment

Walrus Memory is on Mainnet, with more than ten confirmed learning records. The Sui practice contract was published to Mainnet on October 28, 2026, through Tatum.

- [Mainnet publication receipt](https://suiscan.xyz/mainnet/tx/GtWEPwq845cEHQ1NCwviHRFF4GWBgKdPqvW9tHT1JYsu)
- [Deployment manifest](../contracts/practice/deployment.mainnet.json)
- [Migration and Vercel instructions](MAINNET-MIGRATION.md)

Before sending the entry, deploy the Mainnet application settings, activate the existing family on Mainnet, and capture updated Mainnet transaction footage for the video. Account identities and Walrus records remain unchanged.

## Project description

Trove helps children learn to invest with real market prices, practice funds, and a parent or guardian beside them. Parents set spending limits, pause practice, add funds, and review specific exceptions. Learners explore companies, explain their choices, sign practice trades, and see their holdings and returns change with market prices.

Walrus Memory stores the learner's reasons, reflections, corrections, and learning checks on Mainnet. Ask Trove retrieves confirmed, family-scoped memories and references the saved thoughts behind its explanations. When a learner corrects a thesis, the next explanation uses that updated understanding across sessions. The demo shows this change through Eddie Junior's Apple-and-Microsoft risk thesis.

Tatum Sui Mainnet gRPC powers transaction execution and receipt/account verification. A Move contract enforces balances, guardian limits, daily allowance, pause state, and exact one-time approvals. Trove validates confirmed results before updating its ledger. Its React and TypeScript app runs on Vercel with Neon PostgreSQL, Alpaca IEX prices, and a budget-controlled OpenAI learning guide.

Live app: https://trove-x.vercel.app/

## Additional documentation

Put the **published Medium article URL** in the form's **Additional documentation** field. The article links to the live product and public repository.

Architecture: https://github.com/ELLA0VICTOR/trove/blob/main/docs/ARCHITECTURE.md

Sui integration: https://github.com/ELLA0VICTOR/trove/blob/main/docs/SUI-PRACTICE.md

Memory integration: https://github.com/ELLA0VICTOR/trove#memory-and-learning

## Walrus experience

Walrus Memory made it possible to connect a learner's earlier reasoning to their next explanation across sessions. I used the SDK's managed relayer, family-scoped namespaces, immutable learning records, and confirmed Mainnet blob evidence. Corrections supersede earlier thoughts, and recalled records are validated before they reach the guide. The main implementation work was handling asynchronous publication, confirmation polling, idempotent retries, and keeping a conversation usable while a correction syncs.

## Tatum AI Builder experience

Tatum AI Builder was not used for this project. I built Trove with React, TypeScript, and Vite, and integrated Tatum directly through its Sui Mainnet gRPC endpoints for execution, receipt verification, and account-object reads.

## Specific Walrus friction

Memory publication returns a job before Mainnet confirmation is available, so the app needs durable job tracking and a clear transition from syncing to confirmed. Ready-made UI patterns for publication progress, corrections, and recall indexing would help builders deliver that experience faster.

## Short X announcement

I built Trove for Total Recall: a family investing simulator where children practise with real market prices, parents set limits, and Walrus Memory helps the guide remember how their understanding changes.

Try it: https://trove-x.vercel.app/

@Tatum_io @WalrusFoundation

Attach the demo video or add its hosted link. The published Medium article can be linked in a follow-up post.

## YouTube upload

**Title:** Trove — Family Investing That Remembers | Total Recall Demo

**Description:**

Trove helps children practise investing with real market prices and guidance from a parent or guardian. Parents set limits; learners make choices, explain their thinking, and build a learning history the app remembers.

This demo follows Edward and Eddie Junior through a practice investment, a guardian-approved exception, and a corrected investment thesis that changes the next explanation.

Live app: https://trove-x.vercel.app/

Source: https://github.com/ELLA0VICTOR/trove

Built with Walrus Memory on Mainnet, Tatum Sui Mainnet gRPC, a Sui Move practice contract, Alpaca IEX market data, and an OpenAI learning guide.

Total Recall — Consumer Finance Apps.

Use a **Public** or **Unlisted** video URL that opens without signing in.

## Complete the form

The live form asks for contact information, Tatum ID, SUI address, Account ID (SUI), MEMWAL_AGENT_ID, project description, demo URL, repository URL, integration feedback, and terms acceptance. Contact and eligibility answers should be completed by the participant.

- **Tatum ID:** the dashboard account ID saved locally as `TATUM_ACCOUNT_ID`.
- **Account ID (SUI):** the Walrus Memory account object ID saved as `MEMWAL_ACCOUNT_ID`.
- **MEMWAL_AGENT_ID:** the public key under Delegate keys in the Memory dashboard.
- **SUI address:** your participant wallet address. Confirm the intended wallet before submitting.
- **Additional documentation:** the published Medium article URL.
- **Social post links:** the published X or LinkedIn post URLs, if used.

The public delegate key differs from the delegate's private key. The private submission worksheet is stored in ignored `.artifacts/submission/`.

## Final links to collect

1. Hosted demo video URL.
2. Published Medium article URL.
3. Optional social post URL.

After submitting, retain the confirmation shown by the form and any confirmation email.

Sources: [official event page](https://recall-tatum-walrus.vercel.app/), [event rules](https://thewalrussessions.wal.app/tatum-total-recall).
