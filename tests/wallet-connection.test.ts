import test from "node:test";
import assert from "node:assert/strict";
import type {
  Wallet,
  WalletAccount,
  StandardEventsListeners,
} from "@mysten/wallet-standard";
import { WalletConnection } from "../src/lib/wallet-connection.ts";

const parent = "0x" + "7".repeat(64),
  learner = "0x" + "8".repeat(64);
function account(address: string, chain = "sui:testnet"): WalletAccount {
  return {
    address,
    publicKey: new Uint8Array(32),
    chains: [chain as `${string}:${string}`],
    features: ["sui:signPersonalMessage", "sui:signTransaction"],
  };
}
function fixture() {
  let accounts: readonly WalletAccount[] = [account(parent)];
  let next = accounts;
  let calls = 0,
    disconnects = 0;
  const listeners = new Set<StandardEventsListeners["change"]>();
  const emit = (values: readonly WalletAccount[]) => {
    accounts = values;
    for (const listener of listeners) listener({ accounts: values });
  };
  const wallet = {
    name: "Test Slush",
    version: "1.0.0",
    icon: "data:image/svg+xml,<svg/>",
    chains: ["sui:testnet"],
    get accounts() {
      return accounts;
    },
    features: {
      "standard:events": {
        version: "1.0.0",
        on: (_event: unknown, listener: StandardEventsListeners["change"]) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
      },
      "standard:connect": {
        version: "1.0.0",
        connect: async (options?: { silent?: boolean }) => {
          assert.equal(options?.silent, false);
          calls++;
          emit(next);
          return { accounts };
        },
      },
      "standard:disconnect": {
        version: "1.0.0",
        disconnect: async () => {
          disconnects++;
          emit([]);
        },
      },
      "sui:signPersonalMessage": {
        version: "1.0.0",
        signPersonalMessage: async () => ({}),
      },
    },
  } as unknown as Wallet;
  return {
    wallet,
    emit,
    grant: (values: readonly WalletAccount[]) => {
      next = values;
    },
    calls: () => calls,
    disconnects: () => disconnects,
    listeners: () => listeners.size,
  };
}

test("Mainnet authorization accepts Mainnet accounts and refuses Testnet-only accounts", async () => {
  const f = fixture(),
    connection = new WalletConnection("mainnet");
  f.emit([account(parent, "sui:mainnet")]);
  assert.equal((await connection.connect(f.wallet, parent)).address, parent);
  assert.equal(connection.chain, "sui:mainnet");
  f.emit([account(parent, "sui:testnet")]);
  assert.equal(connection.authorized(f.wallet, parent), undefined);
  f.grant([account(parent, "sui:testnet")]);
  await assert.rejects(
    () => connection.connect(f.wallet, parent, { fresh: true }),
    /Authorize/,
  );
  connection.clear();
});

test("both authorized addresses stay usable regardless of their order or the last selected role", async () => {
  const f = fixture(),
    connection = new WalletConnection();
  f.emit([account(learner), account(parent)]);
  assert.equal((await connection.connect(f.wallet, parent)).address, parent);
  assert.equal((await connection.connect(f.wallet, learner)).address, learner);
  assert.equal((await connection.connect(f.wallet, parent)).address, parent);
  assert.equal(f.calls(), 0);
  assert.equal(f.listeners(), 1);
  connection.clear();
  assert.equal(f.listeners(), 0);
});
test("revocation clears the cached signer and switching back is reauthorized", async () => {
  const f = fixture(),
    connection = new WalletConnection();
  await connection.connect(f.wallet, parent);
  f.emit([account(learner)]);
  assert.equal(connection.account, undefined);
  assert.equal(connection.authorized(f.wallet, parent), undefined);
  f.grant([account(parent)]);
  assert.equal((await connection.connect(f.wallet, parent)).address, parent);
  assert.equal(f.calls(), 1);
  connection.clear();
});
test("fresh reconnect resets the extension connection even if the expected address is cached", async () => {
  const f = fixture(),
    connection = new WalletConnection();
  await connection.connect(f.wallet, parent);
  f.grant([account(learner), account(parent)]);
  assert.equal(
    (await connection.connect(f.wallet, parent, { fresh: true })).address,
    parent,
  );
  assert.equal(f.disconnects(), 1);
  assert.equal(f.calls(), 1);
  connection.clear();
});
test("a stale connect response gets one reset retry, then rejects the wrong address", async () => {
  const f = fixture(),
    connection = new WalletConnection();
  f.emit([account(learner)]);
  f.grant([account(learner)]);
  await assert.rejects(
    () => connection.connect(f.wallet, parent),
    /Authorize 0x777777…777777/,
  );
  assert.equal(f.calls(), 2);
  assert.equal(f.disconnects(), 1);
  assert.equal(connection.account, undefined);
});
test("first linking requires a choice when the wallet returns multiple addresses", async () => {
  const f = fixture(),
    connection = new WalletConnection();
  f.grant([account(parent), account(learner)]);
  await assert.rejects(
    () => connection.connect(f.wallet, undefined, { fresh: true }),
    /Choose a wallet address/,
  );
  const linked = await connection.connect(f.wallet, undefined, {
    fresh: true,
    selectAccount: async (accounts) => {
      assert.equal(accounts.length, 2);
      return learner;
    },
  });
  assert.equal(linked.address, learner);
  connection.clear();
});
test("account selection cannot invent an authorization and cancellation leaves no signer", async () => {
  for (const choice of [undefined, "0x" + "9".repeat(64)]) {
    const f = fixture(),
      connection = new WalletConnection();
    f.grant([account(parent), account(learner)]);
    await assert.rejects(() =>
      connection.connect(f.wallet, undefined, {
        fresh: true,
        selectAccount: async () => choice,
      }),
    );
    assert.equal(connection.account, undefined);
  }
});
test("a mainnet-only account cannot satisfy a Testnet signer request", async () => {
  const f = fixture(),
    connection = new WalletConnection();
  f.emit([account(parent, "sui:mainnet")]);
  f.grant([account(parent, "sui:mainnet")]);
  await assert.rejects(() => connection.connect(f.wallet, parent), /Authorize/);
  assert.equal(connection.account, undefined);
});
