# Trove project decisions

Trove is the approved family investing-and-learning product for Tatum x Walrus Total Recall, Consumer Finance Apps track.

Start with [current build status](BUILD-STATUS.md), [local setup](../README.md), and the [demo walkthrough](DEMO-GUIDE.md). The documents below preserve the agreed direction and live implementation plan:

The current functionality audit is [FUNCTIONALITY-CHECKLIST.md](FUNCTIONALITY-CHECKLIST.md). For provider dashboard links and manual credential setup, use [ACCOUNT-SETUP.md](ACCOUNT-SETUP.md).

1. [Product brief](PRODUCT-BRIEF.md): accepted consumer promise, scope, and technical quality bar.
2. [Frontend brief](FRONTEND-BRIEF.md): the user's visual direction and the proposed screen plan.
3. [Reference inspection](DESIGN-REFERENCE.md): verified fonts, styling, animation mechanics, and evidence.
4. [Design tokens](DESIGN-TOKENS.json): reference values and proposed Trove green theme, kept separate.
5. [Hackathon research](HACKATHON-RESEARCH-2026-10-26.md): event requirements and source links, captured October 26, 2026.
6. [Functional specification](FUNCTIONAL-SPEC.md): recommended learner/parent journeys and concrete first-version behavior.
7. [Architecture](ARCHITECTURE.md): authority boundaries, accounting/replay, typed memory, API, and durable state.
8. [Functionality research](FUNCTIONALITY-RESEARCH.md): current primary-source findings, live read-only checks, and remaining validation.
9. [Integration setup](INTEGRATION-SETUP.md): credentials, runtime, costs/entitlements, and credentialed preflight.
10. [Implementation plan](IMPLEMENTATION-PLAN.md): build stages, meaningful verification, evaluation, and demonstration evidence.

Current stage: a localhost family practice product with separate parent/learner sign-in, consent-gated Walrus Mainnet writes, a scoped OpenAI guide, correction-aware recall, reply caching and cost controls. Ten synthetic demo-learning records and fresh-session coaching were verified. Authored app prices, Sui contract enforcement, production account recovery/hosting, and submission delivery remain work. The NEAR reference remains a design input; that hackathon participation is cancelled.

Raw site captures, fonts inspected, browser measurements, and the user's twelve screenshots are saved locally under `.artifacts/design-reference/`. That directory is ignored by Git. Durable specifications live in this `docs/` directory.
