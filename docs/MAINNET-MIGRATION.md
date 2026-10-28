# Sui Mainnet migration

Trove keeps account identities, email verification, learning progress and Walrus Memory shared across the migration. Sui wallet links, practice accounts, prepared transactions and receipts are stored separately for each network. Historical Testnet receipts retain their Testnet explorer links.

Walrus Memory already uses Mainnet. The Sui practice contract was published to Mainnet on October 28, 2026. The [publication receipt](https://suiscan.xyz/mainnet/tx/GtWEPwq845cEHQ1NCwviHRFF4GWBgKdPqvW9tHT1JYsu) and [deployment manifest](../contracts/practice/deployment.mainnet.json) identify the confirmed package. The hosted application switches networks when its corresponding code and environment settings are deployed.

## 1. Fund the dedicated sponsor

The dedicated sponsor was funded before publication. To replenish its transaction-gas balance, send **SUI on Sui Mainnet** to:

```text
0xd9179e689a530294f6cd0d65b4f243ffdba402dcf04eb3ad722c9f88af18c9a3
```

Publication cost **0.0502144 SUI**. Publication plus eight confirmed verification transactions cost **0.056108511 SUI** in total. The sponsor retained **1.011891489 SUI** after these checks. Continued usage consumes additional gas; transaction budgets cap the amount an individual action may spend.

The [public verification record](evidence/sui-mainnet.json) links the actual Mainnet transactions for parent-first activation, a refill before learner enrollment, guardian policy, learner registration, a within-limit buy, an exact parent approval, the approved buy, and a sale. The duplicate-receipt check left balances and decision counts unchanged. These checks used a separate synthetic family with real Alpaca IEX prices and remembering disabled.

The sponsor and quote-attestation keys are stored in the ignored `.trove/sui-mainnet-keys.json` file. Keep this file private and retain a secure backup.

## 2. Build, verify and publish

```sh
npm run sui:build
npm run sui:mainnet:setup
npm run sui:mainnet:estimate
npm run sui:mainnet:publish
```

The publisher checks funding, simulates the funded transaction, saves its signed intent privately, and verifies the confirmed receipt through Tatum. Retrying resumes the same intent. Once the deployment manifest contains a package ID, the script refuses to publish a duplicate.

## 3. Prepare Vercel configuration

After publication and Mainnet transaction checks:

```sh
npm run deploy:prepare -- --mainnet
```

Import the private `.artifacts/vercel.env` into Vercel's Production environment variables. This includes:

- `SUI_NETWORK=mainnet`
- `TATUM_MAINNET_API_KEY`
- `SUI_MAINNET_PACKAGE_ID`
- `SUI_MAINNET_ORIGINAL_PACKAGE_ID`
- `SUI_MAINNET_SPONSOR_KEY`
- `SUI_MAINNET_QUOTE_ATTESTOR_KEY`

Keep the existing Neon database and all account, email, market and Walrus configuration. Deploy the corresponding code and confirmed Mainnet manifest together with these settings. Local development can continue using Testnet until `SUI_NETWORK` is changed locally.

## 4. Activate the existing family on Mainnet

1. Sign in to the existing parent account.
2. Select Sui Mainnet in the wallet and link the parent's address again.
3. Activate the practice portfolio. Existing Testnet holdings are archived; a new round starts with the family's contributed practice capital. Accounts, saved learning and memories remain available.
4. Sign in as the learner, link their own Mainnet address, and sign the learner registration.
5. Make a small practice trade. Check its Mainnet receipt, portfolio cash, holdings and decision record.
6. Test a parent-approved exception and a practice refill, then confirm each changes the ledger once.

Wallet messages and transaction requests must show Sui Mainnet. A wallet security warning requires investigation before describing that wallet's Mainnet flow as verified.

## 5. Update submission evidence

Use the confirmed Mainnet deployment and verification links in the blog and submission. Keep the recorded product demo; its transaction scenes show the development deployment before the Mainnet release. The written materials identify the current Mainnet deployment.
