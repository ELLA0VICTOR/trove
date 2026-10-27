import {
  getWallets,
  isWalletWithRequiredFeatureSet,
  signTransaction,
} from "@mysten/wallet-standard";
import type {
  Wallet,
  WalletAccount,
  SuiWalletFeatures,
  WalletWithFeatures,
} from "@mysten/wallet-standard";
import { Transaction } from "@mysten/sui/transactions";
import { api } from "./app-context.tsx";

let selected: WalletWithFeatures<Partial<SuiWalletFeatures>> | undefined;
let selectedAccount: WalletAccount | undefined;
export function availableWallets(): readonly Wallet[] {
  return getWallets()
    .get()
    .filter(
      (wallet) =>
        wallet.chains.includes("sui:testnet") &&
        isWalletWithRequiredFeatureSet(wallet, ["sui:signPersonalMessage"]),
    );
}
export async function connectWallet(wallet: Wallet, expected?: string) {
  if (
    !isWalletWithRequiredFeatureSet<SuiWalletFeatures>(wallet, [
      "sui:signPersonalMessage",
    ])
  )
    throw new Error("This wallet does not support Sui message signing.");
  const result = await wallet.features["standard:connect"].connect();
  const account = result.accounts.find(
    (a) =>
      (!expected || a.address === expected) && a.chains.includes("sui:testnet"),
  );
  if (!account)
    throw new Error(
      expected
        ? "Select the wallet address linked to this account."
        : "Select a Sui Testnet wallet account.",
    );
  selected = wallet;
  selectedAccount = account;
  return account;
}
export async function linkWallet(wallet: Wallet) {
  const account = await connectWallet(wallet);
  const challenge = await api<{ id: string; message: string }>(
    "/chain/challenge",
    "POST",
    { address: account.address },
  );
  const feature = selected!.features["sui:signPersonalMessage"];
  if (!feature) throw new Error("Personal message signing is unavailable.");
  const signed = await feature.signPersonalMessage({
    account,
    chain: "sui:testnet",
    message: new TextEncoder().encode(challenge.message),
  });
  return api("/chain/link", "POST", {
    id: challenge.id,
    signature: signed.signature,
  });
}
export async function chainAction(
  action: Record<string, unknown>,
  expected?: string,
) {
  if (!selected || !selectedAccount || selectedAccount.address !== expected) {
    const wallets = availableWallets();
    if (!wallets.length)
      throw new Error("Open Account settings and connect a Sui wallet first.");
    const preferred =
      wallets.find((w) => w.accounts.some((a) => a.address === expected)) ??
      (wallets.length === 1 ? wallets[0] : undefined);
    if (!preferred)
      throw new Error("Choose your Sui wallet in Account settings first.");
    await connectWallet(preferred, expected);
  }
  const prepared = await api<{ id: string; bytes: string }>(
    "/chain/prepare",
    "POST",
    action,
  );
  let submitted = false;
  try {
    const signed = await signTransaction(selected!, {
      account: selectedAccount!,
      chain: "sui:testnet",
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
