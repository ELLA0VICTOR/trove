import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Database, chainSql } from "../server/database.ts";
import { DemoStore } from "../server/store.ts";
import { ChainService } from "../server/chain.ts";
import { MarketService } from "../server/market.ts";
import type { TatumSuiGateway } from "../server/integrations/tatum.ts";
import { seededFamily } from "./helpers/family.ts";
import {
  configuredNetwork,
  practiceDeployment,
} from "../server/chain-config.ts";
import mainnet from "../contracts/practice/deployment.mainnet.json" with { type: "json" };

test("network selection is explicit and SQL isolation never rewrites data literals or shared identity tables", () => {
  assert.equal(configuredNetwork({}), "testnet");
  assert.equal(configuredNetwork({ SUI_NETWORK: "mainnet" }), "mainnet");
  assert.throws(
    () => configuredNetwork({ SUI_NETWORK: "wrong" }),
    /mainnet or testnet/,
  );
  const sql =
    "SELECT 'chain_accounts' AS label FROM chain_accounts WHERE family=?";
  assert.equal(
    chainSql(sql, "mainnet"),
    "SELECT 'chain_accounts' AS label FROM mainnet_chain_accounts WHERE family=?",
  );
  assert.equal(chainSql(sql, "testnet"), sql);
  assert.equal(
    chainSql("SELECT * FROM families JOIN memory_outbox ON 1=1", "mainnet"),
    "SELECT * FROM families JOIN memory_outbox ON 1=1",
  );
  if (!mainnet.packageId)
    assert.throws(
      () => practiceDeployment(undefined, undefined, "mainnet"),
      /Publish the Mainnet/,
    );
  else
    assert.equal(
      practiceDeployment(undefined, undefined, "mainnet").packageId,
      mainnet.packageId,
    );
});

test("a Mainnet connection preserves accounts, consent and memories while keeping Testnet accounts and wallet links isolated", async () => {
  const directory = mkdtempSync(join(tmpdir(), "trove-networks-")),
    filename = join(directory, "state.sqlite");
  let db = new Database({ filename });
  try {
    let store = new DemoStore(db, { liveMemory: true });
    const { family, parent } = await seededFamily(store);
    await db
      .prepare("UPDATE account_profiles SET memory_enabled=1 WHERE family=?")
      .run(family);
    const state = await store.get(family);
    const memory = {
      id: randomUUID(),
      kind: "reflection" as const,
      text: "Compare the risks behind company names.",
      recordedAt: new Date().toISOString(),
      active: true,
      origin: "local" as const,
    };
    state.memories = [memory];
    state.portfolio = {
      id: randomUUID(),
      initialCash: "1000000000",
      startedAt: new Date().toISOString(),
      datasetId: "testnet-prices",
    };
    await store.set(state);
    const originalScope = await store.memoryScope(family);
    await db
      .prepare("INSERT INTO chain_accounts VALUES(?,?,?)")
      .run(family, "0x" + "2".repeat(64), "old-testnet-receipt");
    await db
      .prepare("INSERT INTO chain_wallets VALUES(?,?,?)")
      .run(family, "parent", "0x" + "3".repeat(64));
    await db.close();
    db = new Database({ filename, chainNetwork: "mainnet" });
    store = new DemoStore(db, { liveMemory: true });
    const parentKey = Ed25519Keypair.generate(),
      sponsor = Ed25519Keypair.generate(),
      attestor = Ed25519Keypair.generate();
    const config = {
      packageId: "0x" + "1".repeat(64),
      fundingReady: true,
      enrollmentReady: true,
      sponsorKey: sponsor.getSecretKey(),
      attestorKey: attestor.getSecretKey(),
      gateway: { network: "mainnet", client: {} } as unknown as TatumSuiGateway,
    };
    const chain = new ChainService(store, new MarketService(store), config);
    assert.equal(await chain.account(family), undefined);
    assert.equal((await chain.status(parent.member)).network, "mainnet");
    assert.equal((await chain.status(parent.member)).guardian, undefined);
    assert.equal(
      (await db
        .prepare(
          "SELECT object_id FROM chain_accounts WHERE family=?",
          "testnet",
        )
        .get(family))!.object_id,
      "0x" + "2".repeat(64),
    );
    const challenge = await chain.challenge(
      parent.member,
      parentKey.toSuiAddress(),
    );
    assert.match(challenge.message, /Sui Mainnet/);
    const signed = await parentKey.signPersonalMessage(
      Buffer.from(challenge.message),
    );
    const status = await chain.link(
      parent.member,
      challenge.id,
      signed.signature,
    );
    assert.equal(status.guardian, parentKey.toSuiAddress());
    assert.equal(
      (await db
        .prepare(
          "SELECT address FROM chain_wallets WHERE family=? AND role='parent'",
          "testnet",
        )
        .get(family))!.address,
      "0x" + "3".repeat(64),
    );
    assert.equal(await store.memoryScope(family), originalScope);
    assert.equal((await store.profile(family))!.memory_enabled, 1);
    assert.equal((await store.get(family)).memories[0].id, memory.id);
    assert.equal(
      (await db
        .prepare("SELECT COUNT(*) AS n FROM account_members WHERE family=?")
        .get(family))!.n,
      2,
    );
    await assert.rejects(
      () =>
        chain.prepare(parent.member, {
          action: "fund",
          id: randomUUID(),
          amount: "25",
        }),
      /Activate your Sui Mainnet/,
    );
  } finally {
    await db.close();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  }
});
