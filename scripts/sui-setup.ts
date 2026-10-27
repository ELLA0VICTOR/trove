import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { TatumSuiGateway } from "../server/integrations/tatum.ts";
import { configuredValue } from "../server/config.ts";

const directory = resolve(process.env.TROVE_DATA_DIR ?? ".trove");
mkdirSync(directory, { recursive: true });
const path = resolve(directory, "sui-testnet-keys.json");
const keys = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : {
      sponsorKey: Ed25519Keypair.generate().getSecretKey(),
      attestorKey: Ed25519Keypair.generate().getSecretKey(),
      network: "testnet",
    };
if (!existsSync(path))
  writeFileSync(path, JSON.stringify(keys), { mode: 0o600, flag: "wx" });
const sponsor = Ed25519Keypair.fromSecretKey(keys.sponsorKey),
  recipient = sponsor.toSuiAddress();
const key = configuredValue(process.env, "TATUM_API_KEY");
if (!key) throw new Error("Configure TATUM_API_KEY before setting up Testnet.");
const gateway = new TatumSuiGateway(key, "testnet");
try {
  let balance = (await gateway.client.getBalance({ owner: recipient })).balance;
  if (BigInt(balance.balance) < 150_000_000n) {
    console.log(
      "Use https://faucet.sui.io, choose Testnet, and paste the sponsor address below. The official faucet completes proof of work and pays into the address balance. No Mainnet SUI is needed.",
    );
  }
  console.log(
    JSON.stringify(
      {
        network: "testnet",
        sponsor: recipient,
        attestorPublicKey: Buffer.from(
          Ed25519Keypair.fromSecretKey(keys.attestorKey)
            .getPublicKey()
            .toRawBytes(),
        ).toString("hex"),
        gasMist: balance.balance,
        secrets:
          "Stored only in ignored .trove/sui-testnet-keys.json; never printed.",
      },
      null,
      2,
    ),
  );
} finally {
  gateway.destroy();
}
