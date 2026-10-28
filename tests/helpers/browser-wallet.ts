import type { Page } from "@playwright/test";
import { resolve } from "node:path";
import { Transaction } from "@mysten/sui/transactions";
import { DemoStore } from "../../server/store.ts";
import { execute, preview } from "../../server/domain.ts";
import { applyFunding, fundingAmount } from "../../shared/funding.ts";
import type { SuiNetwork } from "../../shared/network.ts";

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

export async function installBrowserWallet(
  page: Page,
  active = true,
  learnerReady = true,
  linkedInitially = active,
  authorization: "own" | "other" | "both" = "own",
  network: SuiNetwork = "testnet",
) {
  const original = await (await page.request.get("/api/state")).json();
  const role = original.role;
  const guardian = "0x" + "7".repeat(64),
    learner = "0x" + "8".repeat(64);
  const address = role === "parent" ? guardian : learner;
  let account: string | undefined = active ? "0x" + "9".repeat(64) : undefined;
  let linked = linkedInitially;
  let learnerBound = active && learnerReady;
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
  const signedAddresses: string[] = [],
    linkedAddresses: string[] = [];
  await page.exposeFunction(
    "signTestTroveTransaction",
    async (signer: string, signingChain: string) => {
      if (signer !== address)
        throw new Error("The wrong family wallet was asked to sign.");
      if (signingChain !== `sui:${network}`)
        throw new Error("The wallet was asked to sign on the wrong network.");
      signedAddresses.push(signer);
      signatures++;
      return { bytes, signature: "synthetic-browser-wallet-signature" };
    },
  );
  await page.addInitScript(
    ({ address, guardian, learner, authorization, network }) => {
      const account = {
        address,
        publicKey: new Uint8Array(32),
        chains: [`sui:${network}`],
        features: ["sui:signTransaction", "sui:signPersonalMessage"],
      };
      const other = {
        ...account,
        address: address === guardian ? learner : guardian,
      };
      let accounts =
        authorization === "both"
          ? [other, account]
          : authorization === "other"
            ? [other]
            : [account];
      let grant = authorization;
      let connects = 0,
        disconnects = 0;
      const listeners = new Set<
        (change: { accounts: typeof accounts }) => void
      >();
      function authorize(mode: "own" | "other" | "both") {
        accounts =
          mode === "both"
            ? [other, account]
            : mode === "other"
              ? [other]
              : [account];
        for (const listener of listeners) listener({ accounts });
      }
      Object.assign(window, {
        troveWalletTest: {
          authorize,
          setGrant: (mode: typeof grant) => {
            grant = mode;
          },
          stats: () => ({ connects, disconnects }),
        },
      });
      const wallet = {
        name: "Test Sui Wallet",
        version: "1.0.0",
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
        chains: [`sui:${network}`],
        get accounts() {
          return accounts;
        },
        features: {
          "standard:connect": {
            version: "1.0.0",
            connect: async () => {
              connects++;
              authorize(grant);
              return { accounts };
            },
          },
          "standard:disconnect": {
            version: "1.0.0",
            disconnect: async () => {
              disconnects++;
              accounts = [];
              for (const listener of listeners) listener({ accounts });
            },
          },
          "standard:events": {
            version: "1.0.0",
            on: (
              _: string,
              listener: (change: { accounts: typeof accounts }) => void,
            ) => {
              listeners.add(listener);
              return () => {
                listeners.delete(listener);
              };
            },
          },
          "sui:signPersonalMessage": {
            version: "1.0.0",
            signPersonalMessage: async () => ({
              bytes: "dGVzdA==",
              signature: "synthetic-link-signature",
            }),
          },
          "sui:signTransaction": {
            version: "2.0.0",
            signTransaction: async (input: {
              account: { address: string };
              chain: string;
            }) =>
              (
                window as unknown as {
                  signTestTroveTransaction: (
                    address: string,
                    chain: string,
                  ) => Promise<unknown>;
                }
              ).signTestTroveTransaction(input.account.address, input.chain),
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
    { address, guardian, learner, authorization, network },
  );
  const chain = () => ({
    ready: true,
    fundingReady: true,
    enrollmentReady: true,
    learnerBound,
    network,
    account,
    guardian: role === "parent" && !linked ? undefined : guardian,
    learner:
      (role === "learner" && !linked) || (role === "parent" && !learnerReady)
        ? undefined
        : learner,
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
  await page.route("**/api/chain/challenge", async (route) => {
    linkedAddresses.push(route.request().postDataJSON().address);
    await route.fulfill({
      json: { id: crypto.randomUUID(), message: "Synthetic wallet link" },
    });
  });
  await page.route("**/api/chain/link", async (route) => {
    linked = true;
    await route.fulfill({ json: chain() });
  });
  await page.route("**/api/chain/prepare", async (route) => {
    const id = crypto.randomUUID();
    actions.set(id, route.request().postDataJSON());
    await route.fulfill({ json: { id, bytes, network } });
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
      if (action.action === "create") {
        account = "0x" + "9".repeat(64);
        learnerBound = Boolean(chain().learner);
      } else if (action.action === "enroll") learnerBound = true;
      else if (action.action === "fund")
        await store.atomic(async () => {
          const state = await store.get(original.id);
          applyFunding(state, {
            id: action.id,
            amount: String(fundingAmount(action.amount)),
            recordedAt: new Date().toISOString(),
          });
          await store.set(state);
        });
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
  return {
    signatures: () => signatures,
    signedAddresses: () => signedAddresses,
    linkedAddresses: () => linkedAddresses,
    preparations: () => actions.size,
  };
}
