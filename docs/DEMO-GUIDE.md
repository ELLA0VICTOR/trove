# Trove manual test and demo rehearsal

Open https://trove-x.vercel.app/app. Use one browser profile for the parent and a different browser profile or browser for the learner. Two ordinary tabs share the same sign-in. Keep both windows available during the approval test.

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
2. Enter your email and select Send verification link. Open the email link within 30 minutes, choose and confirm a password, then select Create account. Trove assigns a username automatically. Select Continue to Trove.
3. Expect Your portfolio, $1,000 in practice cash, and no holdings or decisions.
4. Select Settings on Home. You can change the assigned username to something memorable, such as trove_parent_01, and select Save username. Select Create learner invitation and copy the invitation code.
5. Your signup email is already verified and can recover your password. Existing username accounts can add one under Settings > Recovery email using their current password. See [email setup](EMAIL-SETUP.md). In the account panel, read and tick the Remember learning consent checkbox, then select Enable remembering. This enables storage of this family's learning records and the remembered guide for its learner.
6. Close the account panel. Open Parent > Edit limits. Set Per investment to 50 and Daily allowance to 200, then Save limits.

Pass when the parent has a saved family, an invitation, remembering enabled, and limits of $50 per investment and $200 per day.

## 3. Join as the learner

In the separate learner browser:

1. Open Trove and select Sign in > Join a family.
2. Paste the invitation code, enter a different email address you can open, and select Send verification link. Open the emailed link in the learner browser, choose and confirm a password, and select Create account. Select Continue to Trove. In Settings, you can change the assigned username to trove_learner_01.
3. Expect the same family's $1,000 practice portfolio.
4. Open Parent. Expect Parent account required, without editable limits. Return to Home.

Pass when the two browsers remain signed in as different roles and share the same portfolio and limits.

## 4. Make an ordinary practice investment

In the learner browser:

1. Open Explore > Apple > Make a practice move.
2. Enter 25 as the practice amount.
3. Enter: I want to understand how Apple earns money and how a company's price changes.
4. Select Review my practice move. Check the company, amount, dated price, and reason.
5. Select Confirm practice move, then Keep growing.
6. Open Home. Expect an Apple holding and approximately $975 in available practice cash. Total account value should remain close to $1,000 because some cash is now held in Apple.
7. Open Decisions and refresh. Expect the Apple purchase and its original reason to remain.

Pass when the order changes cash and holdings once and its reason survives refresh.

## 5. Test parent approval

Do these steps promptly: an order preview expires in about two minutes.

1. Learner: open Explore > Microsoft > Make a practice move and enter 75.
2. Enter: I want to compare Microsoft with Apple and understand what risks they share.
3. Select Review my practice move. Expect the $50 per-investment boundary, then select Ask for guidance.
4. Switch to the parent browser. Open Parent, refreshing if necessary. Expect a $75 Microsoft request with the learner's reason.
5. Select Approve this choice.
6. Switch to the learner browser, open Home, and select Review this approved choice.
7. Select Confirm practice move and then Keep growing.
8. Check that Microsoft appears, available cash is approximately $900, and the standing per-investment limit remains $50.

If the request expires, make a fresh request and repeat the approval. Keep the same policy and avoid other orders while an exact approval is pending.

Pass when a parent approves one particular order without increasing the standing limit.

## 6. Test pause and resume

1. Parent: select Pause practice.
2. Learner: refresh, then review another small practice investment. Expect a paused message and no successful order execution.
3. Close that order dialog.
4. Parent: select Resume practice.
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

## 10. Test Sui enforcement and Tatum reconciliation

Complete the earlier steps first. This stage requires a Sui-compatible wallet in each role's browser and two distinct wallet addresses. Use the wallet's Testnet setting. The app's Account panel lists compatible wallets and links to Slush if none are available. We can walk through wallet setup separately if needed.

1. Parent: click your username, find Sui practice, and select Link followed by your wallet name. Approve the wallet-link message for the parent address.
2. Learner: do the same using a different address in the learner browser.
3. Parent: reopen Account. Once both addresses are linked, select Start Sui practice and sign the transaction.
4. Wait for confirmation and the View practice contract account link. Open it to inspect the Testnet object.
5. Expect a fresh $1,000 practice portfolio. The earlier portfolio is archived when Sui practice starts; learning records remain associated with the family.
6. Parent: review or set the practice limits and sign any policy change requested by the wallet.
7. Learner: make a small practice investment and approve the wallet signature. Wait for the transaction to be confirmed.
8. Open Decisions and select that order. Follow the transaction receipt link and check that the Testnet explorer shows a successful transaction.
9. Repeat an above-limit request with a parent-signed one-time approval if needed for the final demo. Complete any exact request before it expires.

Gas is sponsored by the configured Testnet service. A successful order should produce a real Sui Testnet receipt reconciled through Tatum, while the investment balance remains simulated.

Pass when the contract account, role-specific signatures, confirmed transaction, and saved portfolio agree. If a transaction stays pending, use Account > Recheck transaction and report its status instead of repeatedly signing new orders.

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
