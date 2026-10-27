import { useEffect, useState } from "react";
import { getWallets } from "@mysten/wallet-standard";
import type { Wallet } from "@mysten/wallet-standard";
import {
  availableWallets,
  chainAction,
  connectWallet,
  linkWallet,
} from "../lib/wallet.ts";
import { useApp } from "../lib/app-context.tsx";
import { Button } from "./UI.tsx";

export function ChainAccount() {
  const { state, refresh, update } = useApp();
  const [wallets, setWallets] = useState<readonly Wallet[]>(availableWallets),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const registry = getWallets(),
      updateWallets = () => setWallets(availableWallets());
    const a = registry.on("register", updateWallets),
      b = registry.on("unregister", updateWallets);
    return () => {
      a();
      b();
    };
  }, []);
  if (!state?.chain?.ready) return null;
  const chain = state.chain;
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  return (
    <div className="account-setting">
      <h3>Sui practice</h3>
      {chain.wallet ? (
        <p>
          Linked wallet: {chain.wallet.slice(0, 8)}…{chain.wallet.slice(-6)}
        </p>
      ) : (
        <p>
          Link a separate wallet for each family role. Only Testnet gas is used;
          all investments remain simulated.
        </p>
      )}
      {wallets.map((wallet) => (
        <Button
          key={wallet.name}
          secondary
          disabled={busy}
          onClick={() =>
            void run(() =>
              chain.wallet
                ? connectWallet(wallet, chain.wallet)
                : linkWallet(wallet),
            )
          }
        >
          {chain.wallet ? "Connect " : "Link "}
          {wallet.name}
        </Button>
      ))}
      {!wallets.length && (
        <p>
          Install a Sui wallet such as{" "}
          <a href="https://slush.app" target="_blank" rel="noreferrer">
            Slush
          </a>
          , select Testnet, then reopen this panel.
        </p>
      )}
      {chain.account ? (
        <p>
          <a
            href={`https://suiscan.xyz/testnet/object/${chain.account}`}
            target="_blank"
            rel="noreferrer"
          >
            View practice contract account ↗
          </a>
        </p>
      ) : chain.guardian && chain.learner && state.role === "parent" ? (
        <>
          <p>
            Start a new $1,000 practice portfolio enforced on Sui. Your earlier
            activity remains archived. Limits require your wallet; orders
            require the learner’s wallet. Gas is sponsored.
          </p>
          <Button
            disabled={busy || state.market?.mode !== "market"}
            onClick={() =>
              void run(() => chainAction({ action: "create" }, chain.wallet))
            }
          >
            Start Sui practice
          </Button>
        </>
      ) : (
        <p>
          {chain.guardian ? "Parent wallet linked." : "Parent wallet needed."}{" "}
          {chain.learner ? "Learner wallet linked." : "Learner wallet needed."}
        </p>
      )}
      {!!chain.pending?.length && (
        <>
          <Button
            secondary
            disabled={busy}
            onClick={() => void run(() => update("/chain/reconcile", {}))}
          >
            Recheck transaction
          </Button>
          {chain.pending
            .filter((p) => p.state === "prepared")
            .map((p) => (
              <button
                key={p.id}
                className="text-link"
                disabled={busy}
                onClick={() =>
                  void run(() => update("/chain/cancel", { id: p.id }))
                }
              >
                Cancel unsigned preview
              </button>
            ))}
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
