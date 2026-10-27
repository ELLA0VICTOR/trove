import type { Page } from "@playwright/test";
import { resolve } from "node:path";
import { Transaction } from "@mysten/sui/transactions";
import { DemoStore } from "../../server/store.ts";
import { execute, preview } from "../../server/domain.ts";

// Browser fixtures simulate the wallet/provider boundary, while using the real
// isolated SQLite ledger for saved decisions. Production never imports this.
function fixtureStore() {
  return new DemoStore(
    resolve(
      process.env.TROVE_BROWSER_DATA_DIR ?? ".artifacts/browser-store",
      "local.sqlite",
    ),
  );
}
export async function seedBrowserTrade(
  page: Page,
  amount: string,
  reason: string,
) {
  const state = await (await page.request.get("/api/state")).json();
  const store = fixtureStore();
  try {
    const q = preview(await store.get(state.id), {
      symbol: "AAPL",
      side: "buy",
      amount,
      reason,
    });
    await store.putQuote(state.id, q);
    await execute(store, state.id, q.id, "learner");
  } finally {
    await store.db.close();
  }
}

export async function installBrowserWallet(page: Page, active = true) {
  const original = await (await page.request.get("/api/state")).json();
  const role = original.role;
  const guardian = "0x" + "7".repeat(64),
    learner = "0x" + "8".repeat(64);
  const address = role === "parent" ? guardian : learner;
  let account: string | undefined = active ? "0x" + "9".repeat(64) : undefined;
  let linked = active;
  const tx = new Transaction();
  tx.setSender(address);
  tx.setGasOwner(address);
  tx.setGasBudget(1000000);
  tx.setGasPrice(1);
  tx.setGasPayment([
    {
      objectId: "0x" + "1".repeat(64),
      version: "1",
      digest: "11111111111111111111111111111111",
    },
  ]);
  const bytes = Buffer.from(await tx.build()).toString("base64");
  let signatures = 0;
  await page.exposeFunction("signTestTroveTransaction", async () => {
    signatures++;
    return { bytes, signature: "synthetic-browser-wallet-signature" };
  });
  await page.addInitScript(
    ({ address }) => {
      const account = {
        address,
        publicKey: new Uint8Array(32),
        chains: ["sui:testnet"],
        features: ["sui:signTransaction", "sui:signPersonalMessage"],
      };
      const wallet = {
        name: "Test Sui Wallet",
        version: "1.0.0",
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
        chains: ["sui:testnet"],
        accounts: [account],
        features: {
          "standard:connect": {
            version: "1.0.0",
            connect: async () => ({ accounts: [account] }),
          },
          "standard:events": { version: "1.0.0", on: () => () => {} },
          "sui:signPersonalMessage": {
            version: "1.0.0",
            signPersonalMessage: async () => ({
              bytes: "dGVzdA==",
              signature: "synthetic-link-signature",
            }),
          },
          "sui:signTransaction": {
            version: "2.0.0",
            signTransaction: async () =>
              (
                window as unknown as {
                  signTestTroveTransaction: () => Promise<unknown>;
                }
              ).signTestTroveTransaction(),
          },
        },
      };
      const register = (api: { register: (wallet: unknown) => void }) =>
        api.register(wallet);
      window.addEventListener("wallet-standard:app-ready", (event) =>
        register((event as CustomEvent).detail),
      );
      window.dispatchEvent(
        new CustomEvent("wallet-standard:register-wallet", {
          detail: register,
        }),
      );
    },
    { address },
  );
  const chain = () => ({
    ready: true,
    fundingReady: true,
    network: "testnet",
    account,
    guardian: role === "parent" && !linked ? undefined : guardian,
    learner: role === "learner" && !linked ? undefined : learner,
    wallet: linked ? address : undefined,
    pending: [],
  });
  const snapshot = async () => {
    const state = await (await page.request.get("/api/state")).json();
    return {
      ...state,
      market: { ...state.market, mode: "market" },
      chain: chain(),
    };
  };
  const actions = new Map<string, Record<string, string>>();
  await page.route("**/api/state", async (route) =>
    route.fulfill({ json: await snapshot() }),
  );
  await page.route("**/api/chain/challenge", async (route) =>
    route.fulfill({
      json: { id: crypto.randomUUID(), message: "Synthetic wallet link" },
    }),
  );
  await page.route("**/api/chain/link", async (route) => {
    linked = true;
    await route.fulfill({ json: chain() });
  });
  await page.route("**/api/chain/prepare", async (route) => {
    const id = crypto.randomUUID();
    actions.set(id, route.request().postDataJSON());
    await route.fulfill({ json: { id, bytes } });
  });
  await page.route("**/api/approvals", async (route) => {
    const store = fixtureStore();
    try {
      const { quote } = await store.getQuote(
        original.id,
        route.request().postDataJSON().quoteId,
      );
      await store.atomic(async () => {
        const state = await store.get(original.id);
        state.approvals.unshift({
          id: crypto.randomUUID(),
          quote,
          state: "requested",
          createdAt: new Date().toISOString(),
        });
        await store.set(state);
      });
      await route.fulfill({ json: await snapshot() });
    } finally {
      await store.db.close();
    }
  });
  await page.route("**/api/chain/submit", async (route) => {
    const input = route.request().postDataJSON();
    if (input.signature !== "synthetic-browser-wallet-signature")
      throw new Error("Missing test wallet signature");
    const action = actions.get(input.id);
    if (!action) throw new Error("Missing prepared test transaction");
    const store = fixtureStore();
    try {
      if (action.action === "create") account = "0x" + "9".repeat(64);
      else if (action.action === "order")
        await execute(store, original.id, action.quoteId, "learner");
      else if (action.action === "approve")
        await store.atomic(async () => {
          const state = await store.get(original.id);
          const approval = state.approvals.find(
            (a) => a.id === action.approvalId,
          );
          if (!approval) throw new Error("Missing test request");
          approval.state = "approved";
          await store.set(state);
        });
      await route.fulfill({
        json: { state: "confirmed", digest: "synthetic-test-receipt" },
      });
    } finally {
      await store.db.close();
    }
  });
  return { signatures: () => signatures };
}
