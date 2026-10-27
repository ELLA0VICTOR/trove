import { writeFileSync } from "node:fs";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { QuoteBcs, CorporateTermsBcs } from "../shared/chain.ts";
// Public deterministic test seed; never used for a wallet or deployed service.
const signer = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(7));
const base = {
  domain: Array.from(Buffer.from("trove:practice:v1")),
  package_id: "0x0",
  account: "0x34401905bebdf8c04f3cd5f04f442a39372c8dc321c29edfb4f9cb30b23ab96",
  symbol: Array.from(Buffer.from("AAPL")),
  buy: true,
  requested: "25000000",
  amount: "25000000",
  units: "25000000",
  price: "100000000",
  expires_at: "90000",
  revision: "0",
  sequence: "0",
  market_day: "0",
  snapshot: Array(32).fill(0),
  commitment: Array(32).fill(1),
  nonce: Array(16).fill(2),
};
let move = `#[test_only]\nmodule trove::quote_fixtures;\n// Public deterministic test-only signatures, generated from seed [7;32].\npublic fun public_key(): vector<u8> { x"${Buffer.from(signer.getPublicKey().toRawBytes()).toString("hex")}" }\n`;
for (const [name, change] of Object.entries({
  buy25: {},
  sell25: { buy: false },
  buy1500: {
    requested: "1500000000",
    amount: "1500000000",
    units: "1500000000",
  },
  sell25seq1: { buy: false, sequence: "1" },
  buy25seq2: { sequence: "2" },
})) {
  const sig = await signer.sign(
    QuoteBcs.serialize({ ...base, ...change }).toBytes(),
  );
  move += `public fun ${name}(): vector<u8> { x"${Buffer.from(sig).toString("hex")}" }\n`;
}
const corporate = {
  domain: Array.from(Buffer.from("trove:corporate:v1")),
  package_id: "0x0",
  account: base.account,
  event_id: Array(32).fill(4),
  symbol: base.symbol,
  kind: 0,
  effective_day: "0",
  numerator: "2",
  denominator: "1",
  dividend: "0",
  price: "50000000",
  units_before: "25000000",
  sequence: "1",
  revision: "0",
  from_snapshot: Array(32).fill(0),
  to_snapshot: Array(32).fill(3),
  expires_at: "90000",
};
for (const [name, change] of Object.entries({
  split2: {},
  reverse3: { numerator: "1", denominator: "3", price: "300000000" },
  dividend25: { kind: 1, numerator: "1", dividend: "1000000" },
  dividend50: {
    kind: 1,
    numerator: "1",
    dividend: "1000000",
    units_before: "50000000",
    sequence: "2",
    event_id: Array(32).fill(5),
  },
  replaySplit: { units_before: "50000000", sequence: "2" },
  pausedSplit: { revision: "1" },
})) {
  const signature = await signer.sign(
    CorporateTermsBcs.serialize({ ...corporate, ...change }).toBytes(),
  );
  move += `public fun ${name}(): vector<u8> { x"${Buffer.from(signature).toString("hex")}" }\n`;
}
writeFileSync("contracts/practice/tests/quote_fixtures.move", move);
