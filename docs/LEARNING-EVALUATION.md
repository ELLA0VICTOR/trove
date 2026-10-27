# Learning evaluation

Trove now has eight foundation checks and eight distinct transfer scenarios: shared risk, time horizon, liquidity, fees, source evidence, loss/recovery, simulated ownership, and reasoning versus outcomes. Passing a check never changes investment permissions. Attempts persist the concept, scenario version, phase, answer and deterministic result; these records can enter consented Walrus memory.

The versioned synthetic response dataset is [shared/evaluation.ts](../shared/evaluation.ts). It tests each concept under no-history, original-history, corrected-history, and injected-history conditions. The current prompt/schema was tested against all **32 cases** using the real configured OpenAI model, `gpt-6-luna`.

Observed mechanical checks: **32/32** valid citations, required evidence use, expected concept, bounded answer length, absence of injected markers, and absence of the tested authority-claim patterns. The evaluation cost estimate was **$0.0020258**; the shared local ledger reached **$0.0023142** across the earlier preflight/demo and this run. Usage is estimated from the configured token prices, not an account-wide billing guarantee.

```cmd
npm run eval:learning
npm run eval:learning -- --live
```

The first command only describes the suite. `--live` sends paid model requests through the same persistent $1 ledger as the app. It does not publish memories, use another provider, or automatically retry failed generations. Per-case outputs, failures and estimates are saved privately in `.artifacts/evaluation/learning-latest.json`.

These results test software behavior on synthetic inputs. They do **not** establish real learning gains, suitability of investments, universal prompt-injection resistance or expert-rated explanation quality. Source/concept/regex checks need ongoing human calibration. The actual Walrus recall, withdrawal, wrong-family, wrong-blob, correction and outage checks are separate integration/unit tests; this model suite does not pretend that injected fixture text came from Mainnet.

Design guidance: [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices). Educational background: [Investor.gov asset allocation](https://www.investor.gov/introduction-investing/getting-started/asset-allocation) and [introduction to investing](https://www.investor.gov/introduction-investing). Loss/recovery and fee examples use fixed arithmetic rather than model-generated financial calculations.
