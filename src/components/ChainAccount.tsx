import { useEffect, useRef, useState } from "react";
import { getWallets } from "@mysten/wallet-standard";
import type { Wallet, WalletAccount } from "@mysten/wallet-standard";
import {
  availableWallets,
  chainAction,
  reconnectWallet,
  linkWallet,
} from "../lib/wallet.ts";
import { useApp } from "../lib/app-context.tsx";
import { Button } from "./UI.tsx";
import { explorerUrl } from "../../shared/network.ts";

export function ChainAccount({ setup = false }: { setup?: boolean }) {
  const { state, refresh, update } = useApp();
  const [wallets, setWallets] = useState<readonly Wallet[]>(availableWallets),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [choices, setChoices] = useState<readonly WalletAccount[] | null>(null);
  const selectResult = useRef<((address?: string) => void) | undefined>(
    undefined,
  );
  useEffect(() => () => selectResult.current?.(), []);
  function chooseAccount(accounts: readonly WalletAccount[]) {
    return new Promise<string | undefined>((resolve) => {
      selectResult.current = resolve;
      setChoices(accounts);
    });
  }
  function finishChoice(address?: string) {
    selectResult.current?.(address);
    selectResult.current = undefined;
    setChoices(null);
  }
  useEffect(() => {
    const registry = getWallets(),
      updateWallets = () => setWallets(availableWallets());
    // oxlint-disable-next-line react/set-state-in-effect -- Re-read the external registry when the configured network changes.
    updateWallets();
    const a = registry.on("register", updateWallets),
      b = registry.on("unregister", updateWallets);
    return () => {
      a();
      b();
    };
  }, [state?.chain?.network]);
  if (!state?.chain?.ready)
    return setup ? (
      <p className="practice-setup-unavailable" role="status">
        Wallet setup is temporarily unavailable. You can explore companies and
        continue learning.
      </p>
    ) : null;
  const chain = state.chain;
  const activationHint = !chain.guardian
    ? "Connect your wallet first."
    : !chain.learner && !chain.enrollmentReady
      ? "Activation unavailable."
      : chain.pending?.length
        ? "Transaction pending."
        : state.market?.mode !== "market"
          ? "Prices unavailable."
          : "";
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
          Practice funds are simulated. Transaction gas is sponsored.
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
                ? chain.account &&
                  state.role === "learner" &&
                  chain.learnerBound === false
                  ? reconnectWallet(wallet, chain.wallet).then(() =>
                      chainAction({ action: "enroll" }, chain.wallet),
                    )
                  : reconnectWallet(wallet, chain.wallet)
                : linkWallet(wallet, chooseAccount),
            )
          }
        >
          {chain.wallet
            ? chain.account &&
              state.role === "learner" &&
              chain.learnerBound === false
              ? "Finish connecting "
              : "Reconnect "
            : "Link "}
          {wallet.name}
        </Button>
      ))}
      {choices && (
        <div
          className="wallet-account-choices"
          role="group"
          aria-label={`Choose your ${state.role} wallet`}
        >
          <p>Choose your {state.role} wallet</p>
          {choices.map((account) => (
            <Button
              key={account.address}
              secondary
              onClick={() => finishChoice(account.address)}
            >
              {account.address}
            </Button>
          ))}
          <button className="text-link" onClick={() => finishChoice()}>
            Cancel
          </button>
        </div>
      )}
      {!wallets.length && (
        <div className="practice-wallet-install">
          <p>
            Install Slush, select{" "}
            {chain.network === "mainnet" ? "Mainnet" : "Testnet"}, then return
            here to connect.
          </p>
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
            href={explorerUrl(chain.network, "object", chain.account)}
            target="_blank"
            rel="noreferrer"
          >
            View practice contract account ↗
          </a>
        </p>
      ) : state.role === "parent" ? (
        <div className="practice-activation">
          <Button
            disabled={
              busy ||
              !chain.guardian ||
              (!chain.learner && !chain.enrollmentReady) ||
              Boolean(chain.pending?.length) ||
              state.market?.mode !== "market"
            }
            onClick={() =>
              void run(() => chainAction({ action: "create" }, chain.wallet))
            }
          >
            Activate practice portfolio
          </Button>
          {activationHint && (
            <p className="practice-activation-hint" role="status">
              {activationHint}
            </p>
          )}
        </div>
      ) : (
        <p>Your parent can activate the portfolio from their own Home page.</p>
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
