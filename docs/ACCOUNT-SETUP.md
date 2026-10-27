# Trove account setup

Verified October 26, 2026. Start with **Tatum and Walrus**. The current application remains a local sample until its integrations are connected and verified; adding keys does not silently enable uploads, transactions, or model calls.

## Open the private settings file

Open [`.env.local`](../.env.local) in the Trove project. It already contains `REPLACE_ME_...` placeholders. Replace the value after `=` with your own value; keep the variable name. Do not include angle brackets, surrounding backticks, or spaces around `=`.

This file is ignored by Git. `.env.example` is the shareable blank template. Never put secret keys in a variable beginning with `VITE_`, in a screenshot, or in chat.

## 1. Tatum — blockchain access

1. Go to the [Tatum dashboard](https://dashboard.tatum.io/) and create an account or sign in.
2. Open its API-key area. Copy the **Testnet** API key into `TATUM_API_KEY` and the **Mainnet** key into `TATUM_MAINNET_API_KEY`. If your dashboard presents a single key for both networks, use that key for both; the preflight checks each network separately.
3. If a key setup asks for the blockchain, select **Sui**. We use the standard RPC/gRPC gateway, not a paid dedicated node.
4. Find your dashboard **account ID** in account/settings information and save it as `TATUM_ACCOUNT_ID`. The hackathon form needs this identifier; it is not an API key. If it is not obvious in your dashboard, leave that placeholder for now.

Tatum documents separate Mainnet/Testnet keys for free accounts and header-based API authentication. Its [authentication guide](https://docs.tatum.io/oa/docs/authentication) and [Sui gRPC announcement](https://docs.tatum.io/changelog/sui-grpc-available-tatum) explain the credentials and both endpoints. Access and quotas still need to pass the actual account check.

## 2. Walrus Memory — the hackathon's persistent memory

1. Open the **Mainnet** [Walrus Memory dashboard](https://memory.walrus.xyz/dashboard). Use its sign-in/connect flow and create your Memory account/agent.
2. Find the **Memory account ID** (`MemWalAccount`, normally starting `0x`). Put it in `MEMWAL_ACCOUNT_ID`. This is the account object's ID, not your wallet address.
3. Under **Delegate keys**, create a dedicated key for **Trove development**. Save the delegate's **private key** in `MEMWAL_PRIVATE_KEY`. The SDK expects a 32-byte hex key. Keep your owner-wallet seed phrase/private key out of Trove.
4. Save that delegate's **public key** as `MEMWAL_AGENT_ID` for the submission form. The public key and private key serve different purposes; do not swap them.
5. Keep `MEMWAL_SERVER_URL=https://relayer.memory.walrus.xyz` exactly as supplied. Do not use the staging/Testnet dashboard or relayer for the required Mainnet memories.

Dashboard labels can vary; the authoritative mapping is **account object ID + registered delegate private key**. If a generated private key is shown only once, save it immediately. A key generated independently must also be registered by the account owner before it works. See the [official quick start](https://docs.wal.app/walrus-memory/getting-started/quick-start), [delegate-key guide](https://docs.wal.app/walrus-memory/contract/delegate-key-management), and [server configuration guide](https://docs.wal.app/walrus-memory/sdk/headless-setup).

If the dashboard requires a wallet action or funding you do not understand, stop at that screen and describe the non-secret labels. Do not transfer money just to guess your way through setup.

## Check the first two services

From Command Prompt:

```cmd
cd /d C:\Users\kolev\Desktop\trove
npm run setup:check
```

This is **offline**. It displays variable names and `missing`, `placeholder`, `invalid-format`, or `ready-to-check`; never their values. `ready-to-check` only means configuration is present.

Then run these limited **read-only provider checks**:

```cmd
npm run check:integrations -- --service tatum
npm run check:integrations -- --service walrus
```

The Tatum check requests a checkpoint on each configured network. The Walrus check performs authenticated recall in a separate preflight namespace; zero results is fine. It prints no remembered text and creates no memory. A relayer health response alone would not validate the delegate, so we do not count it as successful authentication.

Each command reads the saved `.env.local` afresh. You do not need to restart the app for these commands. The app now consumes the memory and coach keys only for authenticated, consented family activity; guests remain local. Share only a success/failure summary, never the file contents. Provider reads can consume account quotas.

## 3. Real stock prices — configure after those two

Our prepared market-data adapter is **Marketstack v2 daily data**; Tatum provides blockchain data, not Apple/Microsoft stock history.

1. Create an account through [Marketstack](https://marketstack.com/).
2. Open the [Marketstack dashboard](https://marketstack.com/dashboard) and copy its API access key into `MARKETSTACK_API_KEY`.
3. Start with available free access. We still need to verify selected-symbol history and public-demo display/caching rights before choosing a paid plan or importing the final dataset. Daily observations are not real-time exchange quotes.

The explicit check below retrieves a bounded AAPL history window and can use quota:

```cmd
npm run check:integrations -- --service market
```

## 4. AI coach — use the existing OpenAI credits

The user has an OpenAI API key with approximately $5 credit. Use that existing account; no Anthropic account is needed. In `.env.local`, replace only the OpenAI key placeholder:

```dotenv
OPENAI_API_KEY=REPLACE_ME_OPENAI_API_KEY
COACH_MODEL=gpt-6-luna
COACH_BUDGET_USD=1.00
```

The [OpenAI API-key page](https://platform.openai.com/api-keys) manages keys. Keep this server key outside `VITE_` variables and out of chat. The [official deprecation notice](https://developers.openai.com/api/docs/deprecations) lists certain GPT-4o/4o-mini/4.1/4.1-mini snapshots for API removal on January 14, 2027. The documented replacement, [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), supports structured outputs and `reasoning.effort: none`.

Standard text pricing checked October 26, 2026 is $0.10 per million input tokens and $0.50 per million output tokens. For example, 1,500 input plus 300 output tokens would cost approximately **$0.0003**, or $0.30 for 1,000 such calls, excluding other services and changes in usage/prices. This is an arithmetic estimate, not measured Trove traffic. [Official pricing](https://developers.openai.com/api/docs/pricing).

Run the offline check, then the model metadata check:

```cmd
npm run setup:check
npm run check:integrations -- --service coach
```

The second command retrieves model metadata for the configured key; it does not generate an answer. Metadata access does not prove credit availability or answer quality. A real inference check requires adding the explicit `--model-call` flag. After the user replaced the key, one bounded check passed on October 26, 2026; recorded estimated usage was $0.000056. The consumer guide still needs to be connected to authorized memory.

The prepared adapter uses the Responses API with a 384-token output cap, bounded question/context size, at most six memory excerpts, no paid tools, no automatic retry or model upgrade, and `store: false`. A persistent local ledger reserves a conservative estimated cost before each generation and settles against reported token usage. Unknown timeout costs retain their reservation. The user increased the lifetime local allowance from $0.25 to **$1.00** on October 26, 2026. Existing usage still counts; the allowance does not reset when the process restarts. Unused credit is not spent simply because it exists. Local SQLite uses `.trove/coach-usage.sqlite`; a configured DATABASE_URL keeps usage in PostgreSQL. The deployment preparation helper carries over cumulative local usage. Keep the ledger intact so the limit remains meaningful.

The allowance covers Trove calls through this adapter, not other applications using the same key. Prices and token reservations are local estimates, not an OpenAI account-level billing guarantee. Guests can complete deterministic lessons; Ask Trove requires learner sign-in. A signed-in learner whose parent enables remembering uses the live, source-checked guide. `store: false` disables response storage; it is not a claim of zero provider retention. See [Responses migration/storage guidance](https://developers.openai.com/api/docs/guides/migrate-to-responses).

## Leave these alone for now

Set `DATABASE_URL` to the pooled connection string from a Neon Free project for hosted storage. Leave `ENOKI_SECRET_KEY`, `VITE_ENOKI_PUBLIC_KEY`, and `VITE_GOOGLE_CLIENT_ID` blank; Trove uses its own guardian/learner sign-in. Follow [Vercel and Neon setup](VERCEL-DEPLOY.md).

Wallet-backed practice uses separate Testnet-only sponsor and quote-attestor service keys. Locally these are generated into ignored `.trove/sui-testnet-keys.json`; the browser wallets retain user signing authority. Parent and learner connect their own wallets from Home. See [Sui practice setup](SUI-PRACTICE.md) and [Vercel environment values](VERCEL-DEPLOY.md).

## Using the connected app

Restart `npm run dev` after configuration changes. Use Sign in to create a parent account, invite a separate learner, and explicitly enable remembering in Account settings. New authenticated practice activity syncs to Mainnet; guest history is not uploaded. Saved thoughts displays confirmation, and Ask Trove uses the confirmed context. A generated non-personal demo family is available locally in ignored `.trove/demo-access.json`; do not publish its credentials.
