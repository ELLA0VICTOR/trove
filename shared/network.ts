export type SuiNetwork = "testnet" | "mainnet";
export const networkLabel = (network: SuiNetwork = "testnet") =>
  network === "mainnet" ? "Sui Mainnet" : "Sui Testnet";
export const explorerUrl = (
  network: SuiNetwork,
  kind: "tx" | "object",
  id: string,
) => `https://suiscan.xyz/${network}/${kind}/${encodeURIComponent(id)}`;
