import { isWalletWithRequiredFeatureSet } from "@mysten/wallet-standard";
import type {
  Wallet,
  WalletAccount,
  WalletWithFeatures,
  SuiWalletFeatures,
  StandardDisconnectFeature,
  StandardConnectFeature,
  StandardEventsFeature,
} from "@mysten/wallet-standard";
import { normalizeSuiAddress } from "@mysten/sui/utils";

export type SigningWallet = WalletWithFeatures<
  StandardConnectFeature & StandardEventsFeature & Partial<SuiWalletFeatures>
>;
export type AccountSelector = (
  accounts: readonly WalletAccount[],
) => Promise<string | undefined>;
export function sameWalletAddress(a: string, b: string) {
  return normalizeSuiAddress(a) === normalizeSuiAddress(b);
}
function eligible(accounts: readonly WalletAccount[], expected?: string) {
  return accounts.filter(
    (a) =>
      a.chains.includes("sui:testnet") &&
      (!expected || sameWalletAddress(a.address, expected)),
  );
}

/** Connection state is a convenience only. Signing always checks current authorization. */
export class WalletConnection {
  wallet?: SigningWallet;
  account?: WalletAccount;
  private unsubscribe?: () => void;

  private select(wallet: SigningWallet, account: WalletAccount) {
    this.unsubscribe?.();
    this.wallet = wallet;
    this.account = account;
    const events = wallet.features["standard:events"];
    this.unsubscribe = events?.on("change", ({ accounts, chains }) => {
      if (chains && !chains.includes("sui:testnet")) this.account = undefined;
      if (accounts) this.account = eligible(accounts, account.address)[0];
    });
    return account;
  }

  clear() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.wallet = undefined;
    this.account = undefined;
  }

  authorized(wallet: Wallet, expected: string) {
    return eligible(wallet.accounts, expected)[0];
  }

  async connect(
    wallet: Wallet,
    expected?: string,
    options: { fresh?: boolean; selectAccount?: AccountSelector } = {},
  ) {
    if (
      !isWalletWithRequiredFeatureSet<SuiWalletFeatures>(wallet, [
        "sui:signPersonalMessage",
      ])
    )
      throw new Error("This wallet does not support Sui message signing.");
    const disconnect = async () => {
      this.clear();
      if (
        isWalletWithRequiredFeatureSet<StandardDisconnectFeature>(wallet, [
          "standard:disconnect",
        ])
      )
        await wallet.features["standard:disconnect"].disconnect();
    };
    if (options.fresh) await disconnect();
    if (expected && !options.fresh) {
      const authorized = this.authorized(wallet, expected);
      if (authorized) return this.select(wallet, authorized);
    }
    // Explicit authorization, rather than a silent restoration of the old account.
    let { accounts } = await wallet.features["standard:connect"].connect({
      silent: false,
    });
    if (
      expected &&
      !eligible(accounts, expected).length &&
      !options.fresh &&
      "standard:disconnect" in wallet.features
    ) {
      await disconnect();
      ({ accounts } = await wallet.features["standard:connect"].connect({
        silent: false,
      }));
    }
    const candidates = eligible(accounts, expected);
    let account = candidates[0];
    if (!expected && candidates.length > 1) {
      if (!options.selectAccount)
        throw new Error("Choose a wallet address to link.");
      const address = await options.selectAccount(candidates);
      if (!address) throw new Error("Wallet connection cancelled.");
      account = candidates.find((a) => sameWalletAddress(a.address, address))!;
    }
    if (!account) {
      this.clear();
      throw new Error(
        expected
          ? `Authorize ${expected.slice(0, 8)}…${expected.slice(-6)} in ${wallet.name}, then reconnect.`
          : "Select a Sui Testnet wallet account.",
      );
    }
    return this.select(wallet, account);
  }
}
