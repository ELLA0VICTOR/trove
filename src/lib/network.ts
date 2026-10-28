import type { SuiNetwork } from "../../shared/network.ts";
let selected: SuiNetwork = "testnet";
export const walletNetwork = () => selected;
export function selectWalletNetwork(network: SuiNetwork) {
  selected = network;
}
