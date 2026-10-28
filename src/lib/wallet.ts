import {
  getWallets,
  isWalletWithRequiredFeatureSet,
  signTransaction,
} from "@mysten/wallet-standard";
import type { Wallet } from "@mysten/wallet-standard";
import { Transaction } from "@mysten/sui/transactions";
import { api } from "./app-context.tsx";
import type { ChainStatus } from "../../shared/chain.ts";
import { WalletConnection } from "./wallet-connection.ts";
import type { AccountSelector } from "./wallet-connection.ts";
import type { SuiNetwork } from "../../shared/network.ts";
import { walletNetwork } from "./network.ts";

const connections = new Map<SuiNetwork, WalletConnection>();
function walletConnection() {
  const network = walletNetwork();
  if (!connections.has(network))
    connections.set(network, new WalletConnection(network));
  return connections.get(network)!;
}
export function availableWallets(): readonly Wallet[] {
  return getWallets()
    .get()
    .filter(
      (wallet) =>
        wallet.chains.includes(`sui:${walletNetwork()}`) &&
        isWalletWithRequiredFeatureSet(wallet, ["sui:signPersonalMessage"]) &&
        ("sui:signTransaction" in wallet.features ||
          "sui:signTransactionBlock" in wallet.features),
    );
}
export async function connectWallet(wallet: Wallet, expected?: string) {
  return walletConnection().connect(wallet, expected);
}
export async function reconnectWallet(wallet: Wallet, expected: string) {
  return walletConnection().connect(wallet, expected, { fresh: true });
}
export async function linkWallet(
  wallet: Wallet,
  selectAccount?: AccountSelector,
) {
  const connection = walletConnection();
  const account = await connection.connect(wallet, undefined, {
    fresh: true,
    selectAccount,
  });
  const signingWallet = connection.wallet!;
  const challenge = await api<{ id: string; message: string }>(
    "/chain/challenge",
    "POST",
    { address: account.address },
  );
  const feature = signingWallet.features["sui:signPersonalMessage"];
  if (!feature) throw new Error("Personal message signing is unavailable.");
  const currentAccount = connection.authorized(signingWallet, account.address);
  if (!currentAccount)
    throw new Error("Your wallet connection changed. Reconnect and try again.");
  const signed = await feature.signPersonalMessage({
    account: currentAccount,
    chain: `sui:${walletNetwork()}`,
    message: new TextEncoder().encode(challenge.message),
  });
  const status = await api<ChainStatus>("/chain/link", "POST", {
    id: challenge.id,
    signature: signed.signature,
  });
  if (
    status.account &&
    status.learnerBound === false &&
    status.wallet === status.learner &&
    status.wallet !== status.guardian
  ) {
    await chainAction({ action: "enroll" }, status.wallet);
  }
  return status;
}
export async function chainAction(
  action: Record<string, unknown>,
  expected?: string,
) {
  const network = walletNetwork(),
    connection = walletConnection();
  if (!expected) throw new Error("Link your practice wallet before signing.");
  const wallets = availableWallets();
  if (!wallets.length)
    throw new Error("Connect your practice wallet before signing a trade.");
  const preferred =
    wallets.find((w) => connection.authorized(w, expected)) ??
    wallets.find((w) => w === connection.wallet) ??
    (wallets.length === 1 ? wallets[0] : undefined);
  if (!preferred)
    throw new Error("Choose your Sui wallet in Account settings first.");
  await connectWallet(preferred, expected);
  const signingWallet = connection.wallet!;
  const prepared = await api<{
    id: string;
    bytes: string;
    network?: SuiNetwork;
  }>("/chain/prepare", "POST", action);
  let submitted = false;
  try {
    if (prepared.network && prepared.network !== network)
      throw new Error(
        "The practice network changed. Refresh your account before signing.",
      );
    const currentAccount = connection.authorized(signingWallet, expected);
    if (!currentAccount)
      throw new Error(
        "Your wallet connection changed. Reconnect and try again.",
      );
    const signed = await signTransaction(signingWallet, {
      account: currentAccount,
      chain: `sui:${network}`,
      transaction: Transaction.from(prepared.bytes),
    });
    if (signed.bytes !== prepared.bytes)
      throw new Error(
        "The wallet changed the reviewed transaction. Please try again.",
      );
    submitted = true;
    const result = await api<{ state: string; digest: string }>(
      "/chain/submit",
      "POST",
      { id: prepared.id, signature: signed.signature },
    );
    for (
      let attempt = 0;
      result.state === "pending" && attempt < 12;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const current = await api<{ state: string; digest: string }>(
        `/chain/transactions/${prepared.id}`,
      );
      result.state = current.state;
    }
    if (result.state === "failed")
      throw new Error(
        "Sui rejected this action. Your practice balance was not changed.",
      );
    if (result.state !== "confirmed")
      throw new Error(
        "Submitted to Sui; confirmation is pending. Use Recheck transaction in Account settings. Do not create another order.",
      );
    return result;
  } catch (error) {
    if (!submitted)
      await api("/chain/cancel", "POST", { id: prepared.id }).catch(() => {});
    throw error;
  }
}
