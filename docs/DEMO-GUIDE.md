# Trove manual test and demo rehearsal

Open https://trove-x.vercel.app/app. On one computer, use two separate regular browser profiles, or Chrome for the parent and Edge for the learner. Install Slush separately in each profile and use the corresponding wallet address. Keep both windows available during the approval test.

This is a rehearsal checklist. Complete it before recording the short demo. Use fictional, non-personal learning statements for the rehearsal family. Use inboxes you can open for both family members. Write down your emails, current usernames, and passwords privately; passwords require at least 12 characters.

## 1. Check the visitor experience

1. Open Home while signed out. Expect the welcome screen and the Create a family account and Sign in buttons. Portfolio balances, holdings, and charts should be absent.
2. Open Explore, select Apple, and check that a price, source, and daily closing date appear. The closing date can differ from today's date. This is daily market data.
3. Select Sign in to practice. Expect the sign-in dialog rather than an order form. Close it.
4. Open Learn > Lessons > Shared risk > Check understanding. Choose the answer about different companies sharing risks, then Check answer and Done. Expect lesson progress to increase and the next lesson to unlock. This uses the built-in lesson rubric and consumes no AI tokens.
5. Select Ask Trove. Expect the sign-in prompt with no question box. Open Decisions and Parent; expect account prompts.

Pass when visitors can browse and learn while personal actions require sign-in.

## 2. Create the parent account

In the parent browser:

1. Open Home and select Create a family account.
2. Enter an email inbox you can open and a password of at least 12 characters, then select Sign up. Open the emailed link within 30 minutes and select Verify email. Trove assigns a username automatically. Select Continue to Trove.
3. Expect Your portfolio, $1,000 in practice cash, and no holdings or decisions.
4. Select Settings on Home. You can change the assigned username to something memorable, such as trove_parent_01, and select Save username. Select Create learner invitation and copy the invitation code.
5. Your signup email is already verified and can recover your password. Existing username accounts can add one under Settings > Recovery email using their current password. See [email setup](EMAIL-SETUP.md). In the account panel, read and tick the Remember learning consent checkbox, then select Enable remembering. This enables storage of this family's learning records and the remembered guide for its learner.
6. Close the account panel. Open Parent > Edit limits. Set Per investment to 50 and Daily allowance to 200, then Save limits. These are the starting limits for the shared wallet-backed portfolio.

Pass when the parent has a saved family, an invitation, remembering enabled, and limits of $50 per investment and $200 per day.

## 3. Join as the learner

In the separate learner browser:

1. Open Trove and select Sign in > Join a family.
2. Paste the invitation code, enter a different email address you can open and a password of at least 12 characters, and select Sign up. Open the emailed link in the learner browser and select Verify email. Select Continue to Trove. In Settings, you can change the assigned username to trove_learner_01.
3. Expect the same family's $1,000 practice portfolio.
4. Open Parent. Expect Parent account required, without editable limits. Return to Home.

Pass when the two browsers remain signed in as different roles and share the same portfolio and limits.

## 3b. Connect wallets and activate the portfolio

Wallet setup is part of the main practice flow on Home. Complete it before placing any trade. Lessons and remembered coaching remain available during setup.

1. Use two normal browser profiles, one for each role, with the [Slush browser extension](https://slush.app/get-started) installed in both. Create a different wallet address for each role and select Testnet in each wallet's network settings.
2. Parent: open Home > Set up your family portfolio > Link Slush. Approve the wallet-link message.
3. Parent: select Activate practice portfolio on Home and approve the wallet transaction. The learner does not need a wallet or account yet. Testnet gas is sponsored.
4. Wait for confirmation. Expect Your portfolio is active and a fresh portfolio with the family's current practice capital: $1,000 by default, or $6,000 if the parent previously added $5,000. Any earlier holdings and trading activity are archived; saved learning stays associated with the family. Parent limits and refills are available immediately.
5. Learner: after joining the family, open Home and link their different Slush address. Approve the wallet-link message, then the learner-registration transaction. No further parent approval is required. If the transaction is interrupted, select Finish connecting Slush to resume.
6. Expect setup to disappear once registration confirms. The balance, portfolio identity, and parent limits stay unchanged. Refresh either browser to see the completed connection. If both wallets were already linked before activation, no later registration is needed.
7. Open Settings > Practice wallet > View practice contract account to inspect the Testnet object.

Pass when setup is complete, the contract account exists, and parent and learner remain linked to their separate wallets. Signed execution is the only trading path. If wallet setup is unavailable, browsing and learning remain available while trading waits for setup.

If Slush exposes several addresses during linking, choose the correct address in Trove. To recover a mismatched connection, open Home > Settings > Practice wallet > Reconnect Slush and authorize the address shown as Linked wallet. Switching the extension's active address alone may leave the site's previous authorization in place. Separate browser profiles avoid sharing the same extension instance during the rehearsal.

## 4. Make an ordinary practice investment

In the learner browser:

1. Open Explore > Apple > Make a practice move.
2. Enter 25 as the practice amount.
3. Enter: I want to understand how Apple earns money and how a company's price changes.
4. Select Review my practice move. Check the company, amount, dated price, and reason.
5. Select Confirm practice move, approve the learner wallet transaction, and wait for confirmation. Then select Keep growing.
6. Open Home. Expect an Apple holding and approximately $975 in available practice cash. Total account value should remain close to $1,000 because some cash is now held in Apple.
7. Open Decisions and refresh. Expect the Apple purchase and its original reason to remain.

Pass when the order changes cash and holdings once and its reason survives refresh.

## 5. Test parent approval

Keep both role windows and wallets ready. Signed order previews expire in about two minutes, so complete the approval and signing promptly.

1. Learner: open Explore > Microsoft > Make a practice move and enter 75.
2. Enter: I want to compare Microsoft with Apple and understand what risks they share.
3. Select Review my practice move. Expect the $50 per-investment boundary, then select Ask for guidance.
4. Parent: open Parent and find the exact Microsoft request and reason. Select Approve this choice and approve the parent wallet transaction.
5. Learner: return to Home and select Sign approved trade. Approve the learner wallet transaction. The extra in-app review dialog is unnecessary.
6. Wait for confirmation. Expect Microsoft in holdings and approximately $900 available cash from the original $1,000 capital. If you added practice funds, subtract $100 from your starting capital instead. The standing per-investment limit remains $50.
7. Refresh Decisions and verify that the Microsoft trade and original reason are saved once, with a transaction receipt.

Expired requests remain visible with a link to review a fresh choice. A changed portfolio or policy also requires a fresh request. Keep the same policy and avoid other orders while an exact approval is pending.

Pass when the parent authorizes one exact exception, the learner signs its execution, and limits stay unchanged.

## 6. Test pause and resume

1. Parent: select Pause practice, approve the parent wallet transaction, and wait for confirmation.
2. Learner: refresh, then review another small practice investment. Expect a paused message and no successful order execution.
3. Close that order dialog.
4. Parent: select Resume practice and approve the parent wallet transaction.
5. Learner: refresh and check that practice is available again.

Pass when the parent's pause affects the learner and resuming restores access.

## 7. Establish the Mainnet memory history

In the learner browser, open Learn > Saved thoughts. Add the statements below one at a time using Reflection > Save reflection. Prior investment reasons and learner lesson results also create records, so this provides more than ten records for the rehearsal family.

1. I think owning Apple and Microsoft means I have spread my risk because they have different company names.
2. My goal in this practice account is to learn before making larger choices.
3. I prefer to explain a choice before confirming it.
4. I want to compare companies from different industries.
5. I want to understand the difference between a company and a fund.
6. I am learning how needing cash soon affects how long I can hold an investment.
7. I am learning how costs can reduce returns.
8. I want to judge a decision by its reasoning as well as its outcome.
9. I want to understand why a price can fall even when I like the company.
10. I want to keep each practice investment within the limits we agreed.

Keep Saved thoughts open while records move from SYNCING to MAINNET CONFIRMED. Confirmation can take time; each pending operation is saved and checked again. Count at least ten active entries displaying MAINNET CONFIRMED before considering this step complete.

If entries show SYNC NEEDS ATTENTION, or remain pending without progress, report the exact status and how long you waited. Do not record the final memory demo until confirmation works.

Pass when at least ten meaningful learning records have actual Mainnet confirmation in this hosted family.

## 8. Test Ask Trove and correction

1. Close Saved thoughts and select Ask Trove.
2. Ask: Have I really spread my risk just because I own Apple and Microsoft?
3. Expect the remembered guide to discuss the shared risks and refer to relevant saved thinking. Use View saved thoughts when sources are offered to inspect the context.
4. Open Saved thoughts and find statement 1 from the previous step. Select Correct this thought.
5. Enter: I now understand that different company names can share the same industry risk. I need to look at what the companies have in common.
6. Select Save correction and wait for the replacement to show MAINNET CONFIRMED.
7. Ask: What do you remember about how I think about spreading risk?
8. Expect the guide to use the updated understanding. The earlier belief should not be treated as the learner's current view.

Use two or three purposeful questions for this rehearsal. The shared AI allowance and request limits remain active. An unchanged question and context can return a cached explanation.

Pass when the explanation uses saved context and respects a correction rather than merely producing a generic answer.

## 9. Test a returning session

1. Learner: click your username and select Sign out.
2. Close the account dialog. Expect the portfolio sign-in screen.
3. Sign in again with the learner username and password.
4. Check that holdings, decisions, lesson progress, and saved thoughts return.
5. Ask: Which assumption have I changed about different companies sharing risk?
6. Expect the corrected learning context to remain available after sign-in.

Pass when the family history and remembered explanation survive a new sign-in.

## 10. Inspect Sui enforcement and Tatum reconciliation

The trades in steps 4 and 5 already use Sui Testnet. This stage checks their evidence.

1. Learner: open Decisions and select the ordinary trade from step 4.
2. Follow its transaction receipt link. Confirm that the Testnet explorer shows a successful transaction.
3. Check the company, practice amount, shares, and cash against the saved trade and portfolio.
4. Inspect the above-limit trade from step 5 and confirm that the standing limit stayed unchanged after the exact exception.
5. Parent: open Settings > Practice wallet > View practice contract account to inspect the shared account and its fixed role addresses.

Pass when role-specific signatures, Tatum-confirmed receipts, and the portfolio agree. If a transaction stays pending, use Settings > Practice wallet > Recheck transaction and report its status instead of repeatedly signing new orders.

## Report results

For each stage, note PASS or the exact screen/message where it stopped. We need all stages, especially Mainnet confirmation and the wallet-backed transaction, before recording the full integration demonstration.

## Recording outline after rehearsal

Prepare the two role sessions and confirmed memory history before filming. A 2-3 minute video can show:

- Family portfolio and the parent-set limit.
- A learner's reason and an above-limit request approved from the parent session.
- A confirmed Sui practice action and its receipt.
- Saved Mainnet thoughts and a remembered explanation.
- A corrected thought followed by an updated explanation after returning to the account.

Record clean clips of the successful flow and add the voiceover afterward. Account creation, the full ten-record preparation, and confirmation waits belong in rehearsal and setup rather than consuming the entire video.

## Practice capital and replenishment

Each family shares one learner portfolio. It starts with $1,000 in simulated cash; the parent manages the allowance and the learner places investments. The parent account views that same portfolio.

To increase capital or replenish cash, sign in as the parent and open **Parent > Add practice funds**. Enter the amount and select **Add funds**. For example, adding $4,000 before investing raises the default practice capital to $5,000. Refills preserve holdings, learning records, losses, limits, pause, and daily spending. Supplied cash is excluded from investment profit. A signed Sui account requires a parent wallet signature and a confirmed Tatum receipt before cash changes.

A zero cash balance may mean the cash is invested in holdings. A learner can sell holdings to release cash or ask the parent to add practice funds. Refills do not erase the earlier performance record.

For an optional rehearsal after the numbered order tests, record the current cash, limits, and return; add $100 from the parent session; reload both sessions. Cash and practice capital should rise by $100, while the investment return, holdings, limits, and day spending stay unchanged. A repeated submission of the same request must credit once. Learner and signed-out requests must be rejected.
