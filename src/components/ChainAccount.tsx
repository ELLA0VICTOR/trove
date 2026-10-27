import { practiceCapital } from "../../shared/funding.ts";
import { money } from "../../shared/model.ts";
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

export function ChainAccount({ setup = false }: { setup?: boolean }) {
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
  if (!state?.chain?.ready)
    return setup ? (
      <p className="practice-setup-unavailable" role="status">
        Wallet setup is temporarily unavailable. You can explore companies and
        continue learning.
      </p>
    ) : null;
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
      {!setup && <h3>Practice wallet</h3>}
      {chain.wallet ? (
        <p>
          Linked wallet: {chain.wallet.slice(0, 8)}…{chain.wallet.slice(-6)}
        </p>
      ) : (
        <p>
          {state.role === "parent"
            ? "Connect your parent wallet."
            : "Connect your learner wallet."}{" "}
          Practice funds are simulated. Testnet gas is sponsored.
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
        <div className="practice-wallet-install">
          <p>Install Slush, select Testnet, then return here to connect.</p>
          <a
            className="button button-secondary"
            href="https://slush.app/get-started"
            target="_blank"
            rel="noreferrer"
          >
            Get Slush
          </a>
        </div>
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
            Your portfolio starts with {money(practiceCapital(state))} in
            practice funds.
            {state.holdings.length > 0 &&
              " Activating archives your earlier holdings and starts a fresh round. Your saved learning stays."}
          </p>
          <Button
            disabled={
              busy ||
              Boolean(chain.pending?.length) ||
              state.market?.mode !== "market"
            }
            onClick={() =>
              void run(() => chainAction({ action: "create" }, chain.wallet))
            }
          >
            Activate practice portfolio
          </Button>
        </>
      ) : !chain.guardian || !chain.learner ? (
        <p>
          {state.role === "parent"
            ? chain.wallet
              ? "Your learner can now connect their wallet from Home."
              : "Your learner connects their own wallet from their account."
            : chain.wallet
              ? "Your parent can activate the portfolio once both wallets are connected."
              : "Your parent connects their own wallet from their account."}
        </p>
      ) : (
        <p>
          Both wallets are connected. Your parent can activate the portfolio
          from Home.
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
