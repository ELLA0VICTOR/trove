# Trove local demo walkthrough

Start both services with `npm run dev` and open `http://127.0.0.1:5173`. No provider account is needed. This walkthrough demonstrates the local learning product; it is not the final Mainnet hackathon demonstration.

## Prepare

Open **About this build** in the app and choose **Reset my local sample**, then confirm with **Reset sample**. This resets only your current sample family and invalidates its reviewed orders. Return to **Home**. The default limit is $100 per investment and $250 of gross purchases per UTC day; approximately $250 remains in practice cash after the sample holdings.

The introduction appears once per browser tab session. Use a fresh browser session to replay it, or clear the `trove-intro` session-storage value. Escape or **Skip intro** exits immediately. Reduced-motion settings bypass the introduction. The globe's pause control stops its motion.

## Show the product

1. **Home:** review the account value, invested value, available cash, return, full-width chart, and holdings. The header toggle hides or restores the sidebar. Visit **Decisions** to read Maya's original five-company reasoning.
2. **Explore → Coca-Cola → Make a practice move:** enter $50 and a reason such as “I want to understand a different sector.” Review the fixed quote and confirm. Reload **Your decisions**; the action and original reason remain.
3. **Replay:** compare the original mix and a broader alternative with the same $1,000 and the same sample observations. Change the alternative weights and scrub the period. This illustrates tradeoffs, not proof of a universally better strategy. The actual account remains unchanged.
4. **Learning guide:** ask about concentration. Open **See or correct a memory**, correct the original five-companies thought to “I meant to explore technology companies, not claim that I had spread out my risk,” and ask again. The deterministic guide acknowledges the correction rather than presenting the old belief as current.
5. **Try a thought:** choose the answer explaining that five technology companies can share the same risks. Save the attempt. The next task becomes time horizon; the standing financial limits stay unchanged.

## Show the exception boundary

Reset first so enough cash is available. Request a $150 Coca-Cola practice purchase. The review explains that it exceeds the $100 limit. Choose **Ask for guidance → Open parent preview → Enter parent preview** and approve the specific action. Return with **Back to Maya**. On **Home**, select **Review this approved choice** and confirm.

The $150 action executes once, the approval becomes consumed, and the $100 standing limit remains. Finish within two minutes of the quote; an expired or changed quote must be reviewed again. Parent preview is a local demonstration, not a real login or a production control for children.

## Show honest evidence

**About this build** lists working local behavior and disconnected integrations. Local record counts can change, but Mainnet memories and live chain transactions stay at zero. No wallet signatures, real funds, actual shares, external model calls, or provider writes are produced by these demo steps.

Run `npm test`, `npm run test:browser`, and `npm run build` for the corresponding automated checks. See [build status](BUILD-STATUS.md) for remaining live work and [integration setup](INTEGRATION-SETUP.md) for configuration requirements.
