# Functionality research and readiness findings

Research date: October 26, 2026, Africa/Lagos. This document records primary-source findings and distinguishes them from Trove design decisions. The accompanying [functional spec](FUNCTIONAL-SPEC.md) and [architecture](ARCHITECTURE.md) are recommendations for the build, not evidence of implementation.

## What was actually verified

Read current provider documentation, inspected published npm metadata and the Walrus SDK's declaration files, retrieved the market provider's published OpenAPI document, and made unauthenticated GET requests to Walrus Memory's public health/config endpoints. Checked local tool availability and whether expected credential names were present, without printing secret values.

During the research phase, no product packages were installed, user accounts created, authenticated provider calls made, model requests purchased, transactions signed, or deployment/submission performed. Subsequent local implementation now installs the product dependencies and provider SDKs; see [BUILD-STATUS.md](BUILD-STATUS.md). Credentialed end-to-end feasibility remains an implementation preflight, not a result of reading documentation.

## 1. Hackathon fit

The official rules still identify Consumer Finance Apps, the 30/30/20/20 rubric, Mainnet Walrus integration, ten memories, working demo/public repo/blog, and a two-to-three-minute video. Trove's family practice-finance product remains aligned with the chosen direction. The deadline is November 10, 2026, 17:00 UTC, or 18:00 Lagos. [Official rules](https://thewalrussessions.wal.app/tatum-total-recall), [Tatum event](https://tatum.io/hackathon/total-recall).

Best Walrus Memory specifically rewards a visible learning loop. Our design implication is to demonstrate different next exercises and grounded explanations from different learner histories, rather than only a memory counter. The separate agent-payments award is optional; prior event research records a discrepancy between the live application's disclosed award and the Walrus rules' older mystery-bounty label. No bonus changes the core requirements.

## 2. Walrus Memory

The supported default TypeScript client is `@mysten-incubation/memwal`. Managed production endpoint: `https://relayer.memory.walrus.xyz`. It signs requests with an account delegate; `remember` accepts an asynchronous job. Use status/wait methods to establish completion and retain the resulting blob handle. [SDK operations](https://docs.wal.app/walrus-memory/sdk/usage/memwal).

Persist an application operation key and the accepted job ID. A timeout does not cancel a write. Rate-limited polls need backoff; an empty semantic search is not proof that storage failed. This directly motivates Trove's transactional outbox and background reconciliation. [Production-readiness guide](https://docs.wal.app/walrus-memory/sdk/production-readiness).

The operator-account pattern is officially documented. Its delegate can reach every namespace in that account; namespace selection is not user authorization. Trove must enforce membership and derive namespaces on the server. The initial service account owns the records; login alone does not make memory user-owned. [Multi-tenant cookbook](https://docs.wal.app/walrus-memory/sdk/cookbook-multi-tenant).

The managed relayer processes plaintext for embedding/encryption and is provided without an availability SLA. It currently sponsors both WAL storage and SUI gas for relayed memory writes, subject to usage limits. Account creation and other chain operations are separate from that sponsorship claim. [Managed relayer](https://docs.wal.app/walrus-memory/relayer/public-relayer), [trust model](https://docs.wal.app/walrus-memory/fundamentals/architecture/data-flow-security-model).

Manual encryption is available, but adds Seal/key/embedding responsibilities and does not make the model or embedding provider unable to see inputs. Choose it only with an explicit product trust model, not to add an encryption badge. [Manual client](https://docs.wal.app/walrus-memory/sdk/usage/memwal-manual).

Memory storage has a purchased lifetime. Lifecycle management must handle expiry and the relevant blob owner. A corrected statement is a new version; an encrypted blob's content address does not identify the plaintext or deduplicate it automatically. [Memory management](https://docs.wal.app/walrus-memory/guides/manage-your-memory), [version lineage](https://docs.wal.app/walrus-memory/sdk/versioned-datasets).

### Published SDK inspected

On the research date, the npm latest version was **0.1.10**. Downloaded the published tarball for inspection and extracted its types/package metadata into ignored research artifacts. No package code was executed. [Published npm metadata](https://registry.npmjs.org/@mysten-incubation%2fmemwal/0.1.10).

Useful details verified in these types:

- Jobs expose pending/running/uploaded/done/failed/not_found, with a blob ID where available.
- Confirmed results expose job/record ID, blob ID, owner, and namespace.
- Recall may return relayer write time; that is not the event time described inside a historical memory.
- `listNamespaces` and `listMemories` expose paginated metadata, not decrypted record content. They can support inventory and expiry visibility if enabled by the deployed service.
- Follow `has_more` and cursors rather than inferring completion from page length. Namespace filtering in `listMemories` is client-side and may yield an empty page before pagination ends.
- Restore includes failure/truncation information and a candidate-discovery ceiling. A single restore call is not a guaranteed complete recovery procedure.

These are SDK capabilities, not proof that every endpoint is enabled on the managed relayer. Authenticate and exercise them during the first integration slice. The generic docs include examples targeting 0.1.9; the installed code and live endpoint must be checked together.

### Read-only live observations

`GET /health` returned HTTP 200 and reported async/bulk memory feature flags. `GET /config` reported network `mainnet` and public package/registry/transport metadata. Both responses were archived. This establishes reachability and advertised configuration only, not valid credentials, successful writes, storage duration, or an independently verified Mainnet receipt.

## 3. Tatum and Sui transport

Tatum documents native Sui gRPC over TLS with the API key in `x-api-key` metadata. Mainnet host is `sui-mainnet-grpc.gateway.tatum.io:443`; the changelog also identifies `sui-testnet-grpc.gateway.tatum.io`. Supported surfaces include object/transaction reads, package metadata, execution/simulation, and checkpoint subscriptions. [Tatum guide](https://docs.tatum.io/reference/sui-grpc), [Tatum gRPC announcement](https://docs.tatum.io/changelog/sui-grpc-available-tatum).

Mysten's `SuiGrpcClient` supports a native server transport as well as its default gRPC-web transport. Trove should use the documented native transport behind its API, keeping the key private. Endpoint reachability, key scope, method coverage, and object/effects masks need real calls before declaring the adapter complete. [Mysten gRPC client](https://sdk.mystenlabs.com/sui/clients/grpc).

Sui shared objects are accessible to arbitrary callers. Move must enforce parent/learner authorization and capability-to-account binding itself. One account per learner also avoids one global hot object for every household. [Shared-object model](https://docs.sui.io/develop/objects/object-ownership/shared), [security guidance](https://docs.sui.io/develop/security/best-practices).

Use actual chain time for expiry and spending windows. Sponsored gas is distinct from permission to transact. [Onchain time](https://docs.sui.io/sui-stack/on-chain-primitives/access-time), [transaction payment](https://docs.sui.io/develop/transaction-payment/).

The proposed Testnet practice ledger and Mainnet memory deployment are different environments. Show both accurately. We have no organizer statement requiring the custom practice contract to use Mainnet; the explicit Mainnet requirement is for Walrus Memory. Recheck the submission wording before delivery.

## 4. Familiar login and signing

Enoki registers provider-backed wallets that support Sui signatures; the current React example uses `@mysten/dapp-kit-react`. Google login can present a normal sign-in button while user actions remain signed by the corresponding account. [Wallet setup](https://docs.enoki.mystenlabs.com/ts-sdk/register), [sign-in](https://docs.enoki.mystenlabs.com/ts-sdk/sign-in).

Sponsorship uses a private backend key. The official API exposes sender, allowed-address, and Move-target restrictions; the app must still validate complete transaction intent and restrict its own sponsor endpoint. A sponsor is not a substitute for the user's signature. [Sponsorship examples](https://docs.enoki.mystenlabs.com/ts-sdk/examples), [API schema](https://docs.enoki.mystenlabs.com/http-api/openapi).

The documented SDK path for verifying a zkLogin personal-message signature uses a network-appropriate GraphQL client. Do not accidentally use Mainnet verification for Testnet identities or compare only one derived address representation. [Mysten signature verification](https://sdk.mystenlabs.com/sui/cryptography).

Enoki advertises a free Sandbox, but its page lists live-app entitlements and sponsorship under other plans/add-ons. Sandbox does not establish unlimited free public app usage. Confirm the configured account's actual entitlements and test sponsorship before depending on it. No subscription was purchased. [Current Enoki plans](https://enoki.mystenlabs.com/pricing).

## 5. Market data: a real deployment constraint

Real daily observations are sufficient for the first product: it teaches choices over time rather than fast trading. Keep market date, source, price basis, and simulation assumptions visible.

### Preferred adapter target: Marketstack v2

The provider publishes v2 endpoints for daily observations, latest observations, splits, and dividends. Its OpenAPI JSON was downloaded from its SwaggerHub publisher account. Each symbol consumes quota even in a batch, and pagination also consumes requests. Use server caching and a bounded catalog. [Official OpenAPI](https://api.swaggerhub.com/apis/apilayer-863/MarketstackAPIv2/2.0.0/swagger.json), [vendor integration explanation](https://blog.apilayer.com/how-to-build-a-real-time-stock-market-dashboard-using-marketstack-v2-and-react/).

The current pricing page advertises Free as 100 requests/month, one year of history, and non-commercial use. Basic is advertised at $9.99/month, 10,000 requests, longer history, and commercial use. These are published plan descriptions, not a confirmed quote or a determination of public redistribution rights. Do not subscribe automatically or enable uncapped overage billing. [Pricing](https://marketstack.com/pricing).

Current documentation links redirect inconsistently, including to a v1 article marked deprecated after June 2025. Implementation should use the inspected v2 OpenAPI and authenticated response fixtures. Symbol coverage, ETF availability, split/dividend field interpretation, caching, display, and exporting rights still need the selected account's entitlement check.

### Twelve Data alternative

Twelve Data documents strong current/historical APIs. Its usage guidance and business page distinguish internal development from client-facing display and redistribution, including conditions for simulated student trading. A free API key is not enough to infer permission for a public Trove demo or raw data publication. Its historical/EOD licensing note must be read alongside plan usage restrictions. [API docs](https://twelvedata.com/docs), [usage guidance](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage), [business plans](https://twelvedata.com/pricing-business).

Recommendation: implement the market adapter independently of the vendor, start with explicit synthetic fixtures, and verify a budget-appropriate real-data plan before the public demo. Do not quietly substitute synthetic history while calling it real market data. A short-lived API trial must not be the demo's undisclosed expiry date.

## 6. Pyth is an optional extension

Current Pyth Sui documentation includes Pro verification and Core-compatible contracts following an August 26, 2026 upgrade; it states the original Core deployment no longer works. Access and feed interpretation have changed. Some equity-like feeds in the current catalog are proprietary index products, which must not be silently labelled official exchange stock prices. [Current Sui guide](https://docs.pyth.network/pro/use-prices-on-blockchain/sui), [example AAPL index metadata](https://app.pyth.com/explore/Equity.Index.AAPL%2FUSD).

This is a reason to avoid reusing old Cresco/Pyth assumptions without checking them. The baseline practice quote attestor is explicit about operator trust. A verified oracle route can be added only after its exact data product and consumer value are established.

## 7. Coach and server stack

Anthropic's API supports structured responses and strict tool schemas. They constrain output shape, not factual truth, source validity, or permission to execute. Trove still needs source/exercise validation and deterministic numerical rendering. Configure an available model after checking its capabilities and budget; no model access or cost measurement was performed. [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [model availability](https://platform.claude.com/docs/en/models/overview).

Hono has an official Node adapter. Drizzle supports PostgreSQL through `pg`. These fit a TypeScript API with a durable outbox without moving the frontend away from Vite. Choose stable compatible package versions and inspect the installed API rather than following an example that happens to use an RC release. [Hono Node guide](https://hono.dev/docs/getting-started/nodejs), [Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started/postgresql-new).

## 8. Local tooling and versions

The environment has Node **24.19.0**. Walrus's current quickstart recommends patched versions including Node **24.22.1+**; the official release index lists 24.22.1 dated October 20, 2026. Upgrade or pin an appropriate patched runtime for the integration build. The SDK's broader `engines` floor is not the same as its current security recommendation. [Walrus quickstart](https://docs.wal.app/walrus-memory/getting-started/quick-start), [Node release index](https://nodejs.org/dist/index.json).

Docker's executable is present; its daemon and a PostgreSQL instance were not tested or started. `sui` was not on PATH. Use a pinned official toolchain for the chosen Testnet deployment; inspect the Windows installation route rather than running a shell installer blindly. [Sui installation](https://docs.sui.io/getting-started/onboarding/sui-install), [official toolchain manager](https://github.com/MystenLabs/suiup).

Published npm versions observed, not installed/pinned integration results:

| Package | Observed version |
| --- | --- |
| `@mysten-incubation/memwal` | 0.1.10 |
| `@mysten/sui` | 2.37.0 |
| `@mysten/enoki` | 1.3.1 |
| `@mysten/dapp-kit-react` | 2.1.41 |
| `@anthropic-ai/sdk` | 1.3.0 |
| `hono` | 4.13.14 |
| `drizzle-orm` | 0.45.4 |
| `zod` | 4.6.7 |

Metadata and SDK declarations are archived in `.artifacts/functionality-research/`. API compatibility and peer resolution must be verified during installation; npm latest is not by itself a reason to upgrade a working dependency.

## Readiness conclusion

The research is sufficient to start staged implementation. The first real integration slice must resolve credentialed compatibility, real-data coverage/display rights, and the familiar-login/sponsor account's entitlement. These are explicit external setup gates, not hidden claims that the services have already been tested. See [INTEGRATION-SETUP.md](INTEGRATION-SETUP.md) and [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md).
