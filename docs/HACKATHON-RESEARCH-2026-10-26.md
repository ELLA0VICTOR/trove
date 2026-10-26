# Total Recall: verified brief and track recommendation

Research date: October 26, 2026, Africa/Lagos (UTC+1).

Status: the user accepted Consumer Finance Apps and approved the family investing-and-learning product centered on personal decision replay. The name is **Trove**, in `C:\Users\kolev\Desktop\trove`. A local product has subsequently been implemented; see [build status](BUILD-STATUS.md), [the product brief](PRODUCT-BRIEF.md), and [frontend direction](FRONTEND-BRIEF.md). Live integrations, genuine accounts, transactions, deployment, and submission remain incomplete. The prior NEAR work was explicitly aborted. Its website is a visual reference only.

## Sources inspected

- [Official Tatum event page](https://tatum.io/hackathon/total-recall).
- [Live event application](https://recall-tatum-walrus.vercel.app/), embedded by Tatum. Its rendered HTML, public client bundle, built-in event rules, and submission field names were read. The browser research tool could not open this application directly; it was retrieved through a read-only Python HTTPS request instead. Nothing was submitted.
- [Walrus-hosted event rules](https://thewalrussessions.wal.app/tatum-total-recall).
- [Walrus Memory overview](https://docs.wal.app/walrus-memory/).
- [SDK operations](https://docs.wal.app/walrus-memory/sdk/usage/memwal).
- [Memory integration paths](https://docs.wal.app/walrus-memory/getting-started/choose-your-path).
- [Trust and security model](https://docs.wal.app/walrus-memory/fundamentals/architecture/data-flow-security-model).
- [Memory management](https://docs.wal.app/walrus-memory/guides/manage-your-memory).
- [Tatum Sui RPC reference](https://docs.tatum.io/reference/rpc-sui).
- [Tatum gRPC announcement](https://docs.tatum.io/changelog/sui-grpc-available-tatum).
- [Sui API documentation](https://docs.sui.io/references/sui-api).

## What the event asks for

An app whose persistent memory produces a visible difference in later sessions. Storing records is the entry requirement; using the remembered history to improve subsequent behavior is the product opportunity. The product needs an understandable consumer use case and a demonstrable result.

The user-provided brief, checked against the live event application, states:

1. Integrate Walrus Memory and write on Mainnet.
2. Have at least ten memories stored on Mainnet.
3. Use Tatum RPC for relevant onchain data.
4. Publish a blog explaining the product, the Tatum/Walrus integration, and how behavior changed over time.
5. Provide a working demo and a public repository.
6. Tatum AI Builder is optional; its dedicated award requires a product built primarily with that tool.

The rules also specify original or authorized work materially advanced during the build window, age eligibility, one submission per person, and a 2–3 minute demo video. The form asks for contact information, Tatum account ID, Sui address/account ID, and the memory agent identifier. The live form identifies MEMWAL_AGENT_ID as the public key under Delegate keys, not a private key. Confirm all actual identifiers against the dashboard before submission.

The form fields inspected include description, demoVideoUrl, repoUrl, additionalDocs, socialPosts, tatumAccountId, suiAddress, accountId, memwalAgentId, and consent. A named blog field was not visible among those names; the blog remains a checklist requirement. Supply a clearly labeled link in the appropriate documentation field and repository regardless.

## Dates

| Milestone | Published time | Lagos time |
| --- | --- | --- |
| Build starts | October 20, 2026 | Already started |
| Submission deadline | November 10, 2026, 17:00 UTC | November 10, 18:00 WAT |
| Judging | November 11–16 | Same dates |
| Winners | November 17 | Same date |

As of October 26, the deadline is about fifteen days away. Existing projects are allowed if the submitted progress is made during the event; there is no need to reuse the current ZTrace repository.

## Scoring and prizes

From the user-provided brief and live page:

| Criterion | Weight |
| --- | --- |
| Walrus and Tatum integration | 30% |
| Technical quality, including successful Tatum Sui RPC integration | 30% |
| Creativity | 20% |
| Presentation | 20% |

All three tracks have the same $1,000 allocation: $500 first, $300 second, $200 third. Additional $500 awards cover Walrus Memory, Tatum AI Builder, and agent payments using x402 or MPP settled on Sui. Awards may overlap as advertised, but do not assume one project is guaranteed eligibility for every award.

The Walrus-hosted rules still label the last award a mystery bounty. The live application's own Event Rules explicitly name the Agent Payments award, consistent with its prize cards and the user-provided brief. Treat that as the current advertised award and recheck official updates before choosing an integration specifically for a bonus.

A rules preamble refers to a feedback/form platform even though the event tracks describe prediction, agents, and consumer finance. This appears inconsistent with the operative track descriptions. Do not assume a feedback platform is required; confirm with organizers if this wording would affect submission eligibility. No organizer outreach has been performed.

## What the technology does and does not do

Walrus Memory provides storage and retrieval of context across sessions. Our app must decide what to save, how to handle corrections, and how recalled context changes behavior. Memory integration does not automatically train a model or establish that its contents are true.

The SDK's remember call initially accepts a background job; wait for completion and verify recall before treating a write as durable. The mainnet memory count must reflect stored records, not merely requests accepted by a queue.

The default managed relayer processes plaintext before encrypting for Walrus. Manual client encryption changes that trust boundary; embedding services and the application itself still need consideration. Do not market the default SDK as preventing its relayer operator from seeing data. Storage has an expiry and renewal lifecycle, so avoid promises of permanent, maintenance-free memory.

Tatum supplies blockchain access, including Sui balances, objects, transactions, and checkpoint streams. Tatum currently documents gRPC support. Sui's API docs say JSON-RPC on Foundation mainnet nodes is disabled; new work should use a supported modern transport and verify the chosen Tatum endpoint and SDK compatibility before implementation. No endpoint was authenticated or smoke-tested in this research.

For a finance product, authoritative monetary state should come from verified transactions and a deterministic ledger. Memory is appropriate for context such as user-confirmed commitments, exceptions, corrections, and reasons. Semantic recall alone must not determine whether a payment occurred or what a balance is.

## Recommended track: Consumer Finance Apps

This is a strategic recommendation, not a claim that its field is empty. No reliable public submission counts by track were found.

The opportunity is to solve a costly consumer money problem where past agreements or corrections materially affect the next decision. It offers a natural place for both persistent context and verified transaction data. Correct handling of ambiguous, changed, or stale information is a difficult engineering problem with observable consequences.

Prediction apps require trustworthy time-stamped forecasts and outcome evaluation; impressive performance claims cannot be inferred from a short or cherry-picked history. Real-life agents offer broad freedom but a generic assistant with remembered preferences would need substantial differentiation. Consumer finance also has obvious templates; an expense tracker, shared budget, or subscription manager alone would not meet the user's originality standard.

Prioritize the main track and Best Walrus Memory. Consider agent payments only if buying an external service is necessary to the product. Consider AI Builder only if it materially contributes to the build; neither bonus justifies bolting on an irrelevant dependency.

## Standard for the subsequent idea research

- Identify the person harmed, the concrete loss, who should solve it, and who would pay.
- Find the closest existing products and test the proposed difference against them.
- Show why memory is necessary rather than substituting it for an ordinary ledger.
- Explain the legitimate role of Tatum/Sui data in the user workflow.
- Demonstrate changed behavior after an outcome or correction, across a fresh session.
- Compare the same cases with and without relevant memory; label simulated sequences clearly and report failures.
- Choose difficulty arising from a real problem, rather than maximizing technology count.
- No full build before selecting a product with the user. No spending, publishing, or submitting was authorized by this research request.
