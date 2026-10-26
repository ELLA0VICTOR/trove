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

Each command reads the saved `.env.local` afresh. You do not need to restart the app for these commands. The sample app itself does not consume these keys yet. Share only a success/failure summary, never the file contents. Provider reads can consume account quotas.

## 3. Real stock prices — configure after those two

Our prepared market-data adapter is **Marketstack v2 daily data**; Tatum provides blockchain data, not Apple/Microsoft stock history.

1. Create an account through [Marketstack](https://marketstack.com/).
2. Open the [Marketstack dashboard](https://marketstack.com/dashboard) and copy its API access key into `MARKETSTACK_API_KEY`.
3. Start with available free access. We still need to verify selected-symbol history and public-demo display/caching rights before choosing a paid plan or importing the final dataset. Daily observations are not real-time exchange quotes.

The explicit check below retrieves a bounded AAPL history window and can use quota:

```cmd
npm run check:integrations -- --service market
```

## 4. AI coach — configure when ready for metered calls

1. Open the [Claude Console API-key page](https://platform.claude.com/settings/keys), create a developer account if needed, and create a key for Trove.
2. Paste it into `ANTHROPIC_API_KEY`. See [Anthropic's API quick start](https://platform.claude.com/docs/en/get-started).
3. Leave `COACH_MODEL` blank until we choose an available structured-output model and a small API budget. A chat subscription is not the configuration this SDK uses; it needs developer API access.

`npm run setup:check` makes no model call. The model preflight requires an explicit `--model-call` flag; leave that for the next integration step.

## Leave these alone for now

Leave `DATABASE_URL`, `ENOKI_SECRET_KEY`, `VITE_ENOKI_PUBLIC_KEY`, and `VITE_GOOGLE_CLIENT_ID` blank. Local SQLite already works. We will configure genuine family login and deployment storage as a separate implementation step; those unused entries are not prerequisites for the first Tatum/Walrus checks.

No stock trading account, real investment deposit, wallet seed phrase, or owner-wallet private key is needed in this environment file.
