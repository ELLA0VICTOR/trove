# Alpaca stock-data setup

Alpaca's Basic plan includes the real-time IEX feed. It covers one US exchange; consolidated data across all exchanges is a separate plan. [Market-data plans](https://docs.alpaca.markets/us/docs/about-market-data-api)

1. Open [Create your Trading API account](https://app.alpaca.markets/signup). Enter your own details and actual country.
2. Verify your email and complete the account's multi-factor security setup.
3. Select **Paper Trading** in the account selector.
4. Open **Home → API Keys → Generate**. Copy the Key ID and Secret Key. The secret is displayed once. [Official key-generation guide](https://alpaca.markets/learn/connect-to-alpaca-api)
5. In Trove's ignored `.env.local`, replace these placeholders:

```dotenv
ALPACA_API_KEY=YOUR_PAPER_KEY_ID
ALPACA_API_SECRET=YOUR_PAPER_SECRET_KEY
```

Use the Basic market-data plan for this development setup. Paper-only accounts are available globally. [Paper-account documentation](https://docs.alpaca.markets/us/docs/paper-trading)

Keep both keys in server-side settings. Trove selects Alpaca automatically when both variables are present. Add the same variables to **Vercel → Trove → Settings → Environment Variables**, select **Production**, and redeploy the updated application.

## How the prices update

The server imports the latest IEX trades for all twelve assets through a shared one-minute cache. Visible app screens refresh every thirty seconds. Each asset shows its actual trade timestamp. The portfolio chart starts with its opening balance and adds observed valuations as prices change. Added practice funds are tracked separately from investment returns.

The adapter reads market data, corporate actions, and the paper-account market clock. Practice trades continue through Trove's Sui contract. The adapter never submits Alpaca brokerage orders.

US stocks move during their exchange sessions. Outside those sessions, the last available IEX trade remains visible and the portfolio can stay flat. IEX covers one exchange, so its latest trade can differ from a consolidated quote shown elsewhere. On October 28, 2026, the regular US session opens at **14:30 in Lagos**.

With no Alpaca keys configured, a configured Marketstack key supplies daily closes using its existing four-day import allowance. `TROVE_LIVE_SERVICES=0` selects deterministic offline development.

Alpaca data access and permissions for public display depend on the account's provider terms; the Basic development allowance alone does not establish redistribution rights.
