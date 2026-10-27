import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  verifyPersonalMessageSignature,
  verifyTransactionSignature,
} from "@mysten/sui/verify";
import { normalizeSuiAddress, toBase64, fromBase64 } from "@mysten/sui/utils";
import { z } from "zod";
import {
  AccountBcs,
  CreatedBcs,
  ExecutedBcs,
  QuoteBcs,
  ClockBcs,
  CorporateTermsBcs,
  CorporateAppliedBcs,
} from "../shared/chain.ts";
import type { ChainStatus } from "../shared/chain.ts";
import type { Quote } from "../shared/model.ts";
import { parseDollars } from "../shared/model.ts";
import type { DemoStore } from "./store.ts";
import type { MarketService } from "./market.ts";
import { TatumSuiGateway } from "./integrations/tatum.ts";
import { AccessError, Accounts } from "./auth.ts";
import type { Member } from "./auth.ts";
import { DomainError } from "./domain.ts";
import { applyAdjustment } from "../shared/corporate-actions.ts";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const bytes = (text: string) => Array.from(Buffer.from(text));
const hash = (text: string) => createHash("sha256").update(text).digest();
const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => normalizeSuiAddress(value));
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("corporate") }),
  z.object({ action: z.literal("create") }),
  z.object({ action: z.literal("order"), quoteId: z.uuid() }),
  z.object({ action: z.literal("approve"), approvalId: z.uuid() }),
  z.object({
    action: z.literal("policy"),
    perTrade: z.string().max(12),
    daily: z.string().max(12),
    paused: z.boolean(),
  }),
]);
type Intent = {
  id: string;
  family: string;
  member: string;
  action: string;
  payload: string;
  bytes: string | null;
  digest: string;
  signature: string | null;
  state: string;
  expires_at: number;
  error: string | null;
};
export type ChainConfig = {
  packageId: string;
  originalPackageId?: string;
  sponsorKey: string;
  attestorKey: string;
  gateway: TatumSuiGateway;
};

/** Only fixed, server-built Testnet calls can be sponsored. Wallet signatures remain mandatory. */
export class ChainService {
  readonly store: DemoStore;
  readonly market: MarketService;
  readonly config?: ChainConfig;
  private readonly sponsor?: Ed25519Keypair;
  private readonly attestor?: Ed25519Keypair;
  private readonly accounts: Accounts;
  constructor(store: DemoStore, market: MarketService, config?: ChainConfig) {
    this.store = store;
    this.market = market;
    this.config = config;
    this.accounts = new Accounts(store);
    if (config) {
      address.parse(config.packageId);
      if (config.gateway.network !== "testnet")
        throw new Error("Practice execution only supports Sui Testnet.");
      this.sponsor = Ed25519Keypair.fromSecretKey(config.sponsorKey);
      this.attestor = Ed25519Keypair.fromSecretKey(config.attestorKey);
    }
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS chain_wallets(family TEXT NOT NULL,role TEXT NOT NULL,address TEXT NOT NULL,PRIMARY KEY(family,role),UNIQUE(family,address));
      CREATE TABLE IF NOT EXISTS chain_challenges(id TEXT PRIMARY KEY,member TEXT NOT NULL,message TEXT NOT NULL,address TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS chain_accounts(family TEXT PRIMARY KEY,object_id TEXT NOT NULL UNIQUE,created_digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chain_quote_attestations(quote_id TEXT PRIMARY KEY,payload TEXT NOT NULL,salt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chain_dispatch(id TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,token TEXT);
      CREATE TABLE IF NOT EXISTS corporate_retry(family TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,attempts INTEGER NOT NULL,next_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chain_intents(id TEXT PRIMARY KEY,family TEXT NOT NULL,member TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL,bytes TEXT,digest TEXT NOT NULL,signature TEXT,state TEXT NOT NULL,expires_at INTEGER NOT NULL,error TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS chain_one_active ON chain_intents((1)) WHERE state IN ('building','prepared','submitting','pending');`);
  }
  account(family: string) {
    return this.store.db
      .prepare("SELECT object_id FROM chain_accounts WHERE family=?")
      .get(family) as { object_id: string } | undefined;
  }
  wallet(family: string, role: string) {
    return (
      this.store.db
        .prepare("SELECT address FROM chain_wallets WHERE family=? AND role=?")
        .get(family, role) as { address: string } | undefined
    )?.address;
  }
  pending(family: string) {
    return this.store.db
      .prepare(
        "SELECT * FROM chain_intents WHERE family=? AND state IN ('building','prepared','submitting','pending')",
      )
      .all(family) as Intent[];
  }
  status(member: Member): ChainStatus {
    return {
      ready: Boolean(this.config),
      network: "testnet",
      account: this.account(member.family)?.object_id,
      wallet: this.wallet(member.family, member.role),
      guardian: this.wallet(member.family, "parent"),
      learner: this.wallet(member.family, "learner"),
      pending: this.pending(member.family).map(({ id, state, digest }) => ({
        id,
        state,
        digest,
      })),
    };
  }
  private get typePackage() {
    return this.config!.originalPackageId ?? this.config!.packageId;
  }
  challenge(member: Member, input: unknown) {
    this.requireReady();
    this.accounts.limit(`wallet-link:${member.id}`, 10, 60_000);
    const wallet = address.parse(input);
    if (this.account(member.family))
      throw new DomainError(
        "This practice account already has fixed wallet authorities.",
      );
    const id = randomUUID(),
      expires = Date.now() + 300_000;
    const message = `Trove Testnet wallet link\nMember: ${member.id}\nFamily: ${member.family}\nRole: ${member.role}\nWallet: ${wallet}\nNonce: ${randomBytes(32).toString("hex")}\nExpires: ${expires}\nThis links a practice wallet; it does not prove adulthood or a legal relationship.`;
    this.store.db
      .prepare("INSERT INTO chain_challenges VALUES(?,?,?,?,?,0)")
      .run(id, member.id, message, wallet, expires);
    return { id, message, expiresAt: expires };
  }
  async link(member: Member, id: string, signature: string) {
    this.requireReady();
    const row = this.store.db
      .prepare("SELECT * FROM chain_challenges WHERE id=? AND member=?")
      .get(id, member.id) as
      | {
          message: string;
          address: string;
          expires_at: number;
          consumed: number;
        }
      | undefined;
    if (!row || row.consumed || row.expires_at <= Date.now())
      throw new DomainError("This wallet link expired. Try again.");
    try {
      await verifyPersonalMessageSignature(
        Buffer.from(row.message),
        signature,
        { address: row.address, client: this.config!.gateway.client },
      );
    } catch {
      throw new AccessError("The wallet signature could not be verified.");
    }
    this.store.atomic(() => {
      if (this.account(member.family) || this.pending(member.family).length)
        throw new DomainError(
          "Wallet authority is locked while an account or transaction exists.",
        );
      const changed = this.store.db
        .prepare(
          "UPDATE chain_challenges SET consumed=1 WHERE id=? AND consumed=0 AND expires_at>?",
        )
        .run(id, Date.now());
      if (!changed.changes)
        throw new DomainError("This wallet link was already used or expired.");
      const other = this.wallet(
        member.family,
        member.role === "parent" ? "learner" : "parent",
      );
      if (other === row.address)
        throw new DomainError("Parent and learner need separate wallets.");
      this.store.db
        .prepare(
          "INSERT INTO chain_wallets VALUES(?,?,?) ON CONFLICT(family,role) DO UPDATE SET address=excluded.address",
        )
        .run(member.family, member.role, row.address);
    });
    return this.status(member);
  }
  private requireReady() {
    if (!this.config)
      throw new DomainError(
        "Sui Testnet is not configured on this server yet.",
      );
  }
  assertLocal(family: string) {
    if (this.account(family) || this.pending(family).length)
      throw new DomainError(
        "This account requires a wallet-signed Sui transaction. Reconcile any pending action first.",
      );
  }
  async quoteExpiry() {
    this.requireReady();
    try {
      const object = await this.config!.gateway.object("0x6");
      const timestamp = Number(
        ClockBcs.parse(object.object.content).timestamp_ms,
      );
      if (
        !Number.isSafeInteger(timestamp) ||
        Math.abs(Date.now() - timestamp) > 30_000
      )
        throw new Error("Clock outside the supported skew window.");
      // A host-clock expiry of now+120s can exceed the contract's now+120s
      // ceiling while its last checkpoint is a few seconds behind the host.
      // Anchor to consensus and leave 20s for different provider checkpoint lags.
      return Math.min(Date.now() + 120_000, timestamp + 100_000);
    } catch {
      throw new DomainError(
        "The Sui clock could not be checked. Please review a fresh order shortly.",
      );
    }
  }
  async prepare(member: Member, raw: unknown, internal = false) {
    this.requireReady();
    const input = actionSchema.parse(raw);
    if (
      input.action === "corporate" &&
      (!internal || member.id !== "system:corporate")
    )
      throw new AccessError(
        "Corporate entries are generated by the market ledger.",
      );
    if ((input.action === "order" ? "learner" : "parent") !== member.role)
      throw new AccessError("This action belongs to the other family role.");
    const sender =
        input.action === "corporate"
          ? this.sponsor!.toSuiAddress()
          : this.wallet(member.family, member.role),
      guardian = this.wallet(member.family, "parent"),
      learner = this.wallet(member.family, "learner");
    if (!sender || !guardian || !learner)
      throw new DomainError(
        "Both parent and learner must link separate Sui wallets first.",
      );
    if (input.action === "corporate")
      this.accounts.limit("chain-maintenance:global", 100, 86400_000);
    else {
      this.accounts.limit(`chain:${member.family}`, 40, 86400_000);
      this.accounts.limit("chain:global", 200, 86400_000);
    }
    const state = this.store.get(member.family),
      account = this.account(member.family);
    if (input.action === "create" ? Boolean(account) : !account)
      throw new DomainError(
        "This action does not match the Sui practice account status.",
      );
    if (
      input.action === "create" &&
      (!state.portfolio || this.market.status(state).stale)
    )
      throw new DomainError(
        "Start a fresh market-price practice portfolio first.",
      );
    let quote: Quote | undefined;
    if (input.action === "order") {
      const found = this.store.getQuote(member.family, input.quoteId);
      if (found.decision)
        throw new DomainError("This practice order is already recorded.");
      quote = found.quote;
    } else if (input.action === "approve") {
      const approval = state.approvals.find(
        (a) => a.id === input.approvalId && a.state === "requested",
      );
      if (!approval)
        throw new DomainError("This request is no longer awaiting approval.");
      quote = approval.quote;
    }
    if (
      quote &&
      (quote.expiresAt <= Date.now() ||
        quote.sequence !== state.sequence ||
        quote.revision !== state.policy.revision ||
        quote.datasetId !== state.portfolio?.datasetId ||
        quote.portfolioId !== state.portfolio?.id)
    )
      throw new DomainError(
        "The order changed or expired. Review a fresh preview.",
      );
    if (quote) this.market.assertTradable(state);
    if (input.action === "policy") {
      const per = parseDollars(input.perTrade),
        day = parseDollars(input.daily);
      if (per <= 0n || day < per)
        throw new DomainError(
          "The daily allowance must cover the positive per-investment limit.",
        );
    }
    const corporatePlan =
      input.action === "corporate" ? this.market.plan(state) : undefined;
    if (
      corporatePlan &&
      (!corporatePlan.entries.length || corporatePlan.entries.length > 48)
    )
      throw new DomainError("This corporate-action batch is no longer ready.");
    const consensusExpiry =
      input.action === "corporate" ? await this.quoteExpiry() : undefined;
    const id = randomUUID(),
      expires = Math.min(
        consensusExpiry ?? quote?.expiresAt ?? Date.now() + 120_000,
        Date.now() + 120_000,
      );
    this.store.atomic(() => {
      this.store.db
        .prepare(
          "UPDATE chain_intents SET state='failed',error='Unsigned preview expired' WHERE state IN ('building','prepared') AND expires_at<=?",
        )
        .run(Date.now());
      const active = this.store.db
        .prepare(
          "SELECT 1 FROM chain_intents WHERE state IN ('building','prepared','submitting','pending')",
        )
        .get();
      if (active)
        throw new DomainError(
          "Another sponsored action is awaiting a signature or confirmation. Finish or cancel it first.",
        );
      this.store.db
        .prepare(
          "INSERT INTO chain_intents VALUES(?,?,?,?,?,NULL,'',NULL,'building',?,NULL)",
        )
        .run(
          id,
          member.family,
          member.id,
          input.action,
          JSON.stringify(input),
          expires,
        );
    });
    let preparationStage = "transaction";
    try {
      const tx = new Transaction();
      tx.setSender(sender);
      tx.setGasOwner(this.sponsor!.toSuiAddress());
      tx.setGasBudget(30_000_000);
      let payload: Record<string, unknown> = { ...input };
      if (input.action === "corporate") {
        const plan = corporatePlan!;
        for (const [index, entry] of plan.entries.entries()) {
          const data = {
            domain: bytes("trove:corporate:v1"),
            package_id: this.typePackage,
            account: account!.object_id,
            event_id: Array.from(Buffer.from(entry.id, "hex")),
            symbol: bytes(entry.symbol),
            kind: entry.kind === "split" ? 0 : 1,
            effective_day: String(
              Math.floor(Date.parse(entry.date + "T00:00:00Z") / 86400_000),
            ),
            numerator: entry.numerator,
            denominator: entry.denominator,
            dividend: entry.dividend,
            price: entry.price,
            units_before: entry.unitsBefore,
            sequence: String(state.sequence + index),
            revision: String(state.policy.revision),
            from_snapshot: Array.from(Buffer.from(plan.from!.id, "hex")),
            to_snapshot: Array.from(Buffer.from(plan.target!.id, "hex")),
            expires_at: String(expires),
          };
          const signature = await this.attestor!.sign(
            CorporateTermsBcs.serialize(data).toBytes(),
          );
          tx.moveCall({
            target: `${this.config!.packageId}::practice::adjust`,
            arguments: [
              tx.object(account!.object_id),
              tx.pure.vector("u8", data.event_id),
              tx.pure.vector("u8", data.symbol),
              tx.pure.u8(data.kind),
              ...[
                data.effective_day,
                data.numerator,
                data.denominator,
                data.dividend,
                data.price,
                data.units_before,
                data.sequence,
                data.revision,
              ].map((n) => tx.pure.u64(n)),
              tx.pure.vector("u8", data.from_snapshot),
              tx.pure.vector("u8", data.to_snapshot),
              tx.pure.u64(expires),
              tx.pure.vector("u8", Array.from(signature)),
              tx.object("0x6"),
            ],
          });
        }
        tx.setGasBudget(80_000_000);
        payload = {
          action: "corporate",
          entries: plan.entries,
          from: plan.from!.id,
          to: plan.target!.id,
          sequence: state.sequence,
        };
      } else if (input.action === "create") {
        tx.moveCall({
          target: `${this.config!.packageId}::practice::create`,
          arguments: [
            tx.pure.address(learner),
            tx.pure.vector(
              "u8",
              Array.from(this.attestor!.getPublicKey().toRawBytes()),
            ),
            tx.pure.u64(state.policy.perTrade),
            tx.pure.u64(state.policy.daily),
            tx.pure.vector("vector<u8>", state.policy.allowed.map(bytes)),
          ],
        });
      } else if (input.action === "policy") {
        tx.moveCall({
          target: `${this.config!.packageId}::practice::policy`,
          arguments: [
            tx.object(account!.object_id),
            tx.pure.u64(parseDollars(input.perTrade)),
            tx.pure.u64(parseDollars(input.daily)),
            tx.pure.bool(input.paused),
          ],
        });
      } else {
        preparationStage = "attestation";
        const q = quote!;
        // Keep this salt local; a public hash of a short private thought is guessable without it.
        let attested = this.store.db
          .prepare(
            "SELECT payload FROM chain_quote_attestations WHERE quote_id=?",
          )
          .get(q.id) as { payload: string } | undefined;
        if (!attested) {
          const salt = randomBytes(32).toString("hex");
          const data = {
            domain: bytes("trove:practice:v1"),
            package_id: this.typePackage,
            account: account!.object_id,
            symbol: bytes(q.symbol),
            buy: q.side === "buy",
            requested: q.requested,
            amount: q.amount,
            units: q.units,
            price: q.price,
            expires_at: String(q.expiresAt),
            revision: String(q.revision),
            sequence: String(q.sequence),
            market_day: String(
              Math.floor(Date.parse(q.marketDate + "T00:00:00Z") / 86400_000),
            ),
            snapshot: Array.from(Buffer.from(q.datasetId!, "hex")),
            commitment: Array.from(hash(`${salt}:${q.id}:${q.reason}`)),
            nonce: Array.from(Buffer.from(q.id.replaceAll("-", ""), "hex")),
          };
          attested = { payload: JSON.stringify(data) };
          this.store.db
            .prepare("INSERT INTO chain_quote_attestations VALUES(?,?,?)")
            .run(q.id, attested.payload, salt);
        }
        preparationStage = "quote-encoding";
        const data = QuoteBcs.parse(
          QuoteBcs.serialize(JSON.parse(attested.payload)).toBytes(),
        );
        preparationStage = "quote-signing";
        const sig = await this.attestor!.sign(
          QuoteBcs.serialize(data).toBytes(),
        );
        preparationStage = "move-arguments";
        tx.moveCall({
          target: `${this.config!.packageId}::practice::${input.action === "order" ? "execute" : "approve"}`,
          arguments: [
            tx.object(account!.object_id),
            tx.pure.vector("u8", data.symbol),
            tx.pure.bool(data.buy),
            ...[
              data.requested,
              data.amount,
              data.units,
              data.price,
              data.expires_at,
              data.revision,
              data.sequence,
              data.market_day,
            ].map((n) => tx.pure.u64(n)),
            tx.pure.vector("u8", data.snapshot),
            tx.pure.vector("u8", data.commitment),
            tx.pure.vector("u8", data.nonce),
            tx.pure.vector("u8", Array.from(sig)),
            tx.object("0x6"),
          ],
        });
        payload = { ...payload, quote: q, attested: data };
      }
      preparationStage = "sponsor-gas";
      const coins = await this.config!.gateway.client.listCoins({
        owner: this.sponsor!.toSuiAddress(),
        coinType: "0x2::sui::SUI",
      });
      const gasBudget =
        input.action === "corporate" ? 80_000_000n : 30_000_000n;
      const coin = coins.objects.find((c) => BigInt(c.balance) >= gasBudget);
      const balance = (
        await this.config!.gateway.client.getBalance({
          owner: this.sponsor!.toSuiAddress(),
        })
      ).balance;
      if (BigInt(balance.addressBalance) >= gasBudget) tx.setGasPayment([]);
      else if (coin)
        tx.setGasPayment([
          {
            objectId: coin.objectId,
            version: coin.version,
            digest: coin.digest,
          },
        ]);
      else
        throw new DomainError(
          "The Testnet gas sponsor needs free faucet SUI before continuing.",
        );
      preparationStage = "transaction-build";
      const built = await tx.build({ client: this.config!.gateway.client }),
        digest = await tx.getDigest();
      this.store.db
        .prepare(
          "UPDATE chain_intents SET payload=?,bytes=?,digest=?,state='prepared' WHERE id=? AND state='building'",
        )
        .run(JSON.stringify(payload), toBase64(built), digest, id);
      return {
        id,
        bytes: toBase64(built),
        digest,
        expiresAt: expires,
        network: "testnet",
        action: input.action,
      };
    } catch (error) {
      console.error(
        `[trove] Sui preparation failed at ${preparationStage} (${error instanceof Error ? error.name : "unknown"}).`,
      );
      if (process.env.TROVE_DEBUG === "1" && error instanceof Error) {
        let message = error.message.replace(
          /https?:\/\/\S+/g,
          "[provider URL]",
        );
        for (const [name, value] of Object.entries(process.env))
          if (value && /KEY|SECRET|PASSWORD|TOKEN/.test(name))
            message = message.replaceAll(value, "[redacted]");
        console.error(message.slice(0, 700));
      }
      this.store.db
        .prepare(
          "UPDATE chain_intents SET state='failed',error='Preparation failed' WHERE id=? AND state='building'",
        )
        .run(id);
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "Tatum could not prepare this Testnet action. No transaction was submitted.",
      );
    }
  }
  async submit(member: Member, id: string, signature: string) {
    this.requireReady();
    const intent = this.store.db
      .prepare(
        "SELECT * FROM chain_intents WHERE id=? AND family=? AND member=?",
      )
      .get(id, member.family, member.id) as Intent | undefined;
    if (!intent?.bytes)
      throw new DomainError("This transaction preview was not found.");
    if (intent.state === "confirmed")
      return { state: "confirmed", digest: intent.digest };
    if (["submitting", "pending"].includes(intent.state))
      return this.reconcile(intent);
    if (intent.state !== "prepared" || intent.expires_at <= Date.now())
      throw new DomainError(
        "This unsigned transaction expired. Review a fresh action.",
      );
    try {
      await verifyTransactionSignature(fromBase64(intent.bytes), signature, {
        address:
          intent.action === "corporate"
            ? this.sponsor!.toSuiAddress()
            : this.wallet(member.family, member.role),
        client: this.config!.gateway.client,
      });
    } catch {
      throw new AccessError(
        "The signed transaction does not match this wallet and preview.",
      );
    }
    const changed = this.store.db
      .prepare(
        "UPDATE chain_intents SET signature=?,state='submitting' WHERE id=? AND state='prepared' AND expires_at>?",
      )
      .run(signature, id, Date.now());
    if (!changed.changes)
      throw new DomainError("This preview was already submitted or expired.");
    await this.dispatch({ ...intent, signature, state: "submitting" });
    this.store.db
      .prepare(
        "UPDATE chain_intents SET state='pending' WHERE id=? AND state='submitting'",
      )
      .run(id);
    return this.reconcile({ ...intent, state: "pending" });
  }
  cancel(member: Member, id: string) {
    const changed = this.store.db
      .prepare(
        "UPDATE chain_intents SET state='failed',error='Cancelled before submission' WHERE id=? AND member=? AND family=? AND state IN ('prepared','building')",
      )
      .run(id, member.id, member.family);
    if (!changed.changes)
      throw new DomainError(
        "A submitted transaction must be reconciled and cannot be cancelled locally.",
      );
  }
  private async dispatch(intent: Intent) {
    if (!intent.bytes || !intent.signature) return;
    const token = randomUUID();
    const claimed = this.store.atomic(() => {
      this.store.db
        .prepare("INSERT OR IGNORE INTO chain_dispatch(id) VALUES(?)")
        .run(intent.id);
      return this.store.db
        .prepare(
          "UPDATE chain_dispatch SET attempts=attempts+1,next_at=?,lease_until=?,token=? WHERE id=? AND attempts<8 AND next_at<=? AND lease_until<=?",
        )
        .run(
          Date.now() + 30_000,
          Date.now() + 45_000,
          token,
          intent.id,
          Date.now(),
          Date.now(),
        ).changes;
    });
    if (!claimed) return;
    try {
      const sponsorSignature = (
        await this.sponsor!.signTransaction(fromBase64(intent.bytes))
      ).signature;
      await this.config!.gateway.client.executeTransaction({
        transaction: fromBase64(intent.bytes),
        signatures: [...new Set([intent.signature, sponsorSignature])],
        include: { effects: true, events: true },
      });
    } catch {
      /* Re-send only identical signed bytes. One digest cannot execute twice. */
    } finally {
      this.store.db
        .prepare(
          "UPDATE chain_dispatch SET lease_until=0 WHERE id=? AND token=?",
        )
        .run(intent.id, token);
    }
  }
  async reconcile(intent: Intent) {
    this.requireReady();
    let receipt;
    try {
      receipt = await this.config!.gateway.receipt(intent.digest);
    } catch {
      return { state: "pending", digest: intent.digest };
    }
    if (receipt.state === "failed") {
      this.store.db
        .prepare(
          "UPDATE chain_intents SET state='failed',error='Sui execution aborted' WHERE id=? AND state IN ('pending','submitting')",
        )
        .run(intent.id);
      return { state: "failed", digest: intent.digest };
    }
    const transaction = receipt.transaction;
    if (transaction.digest !== intent.digest)
      throw new DomainError("The provider returned a different transaction.");
    const packageIds = new Set([this.typePackage, this.config!.packageId]);
    const events = transaction.events.filter(
      (e) =>
        packageIds.has(e.packageId) &&
        e.module === "practice" &&
        packageIds.has(e.eventType.split("::")[0]),
    );
    const isType = (event: { eventType: string }, name: string) =>
      event.eventType.endsWith(`::practice::${name}`);
    const payload = JSON.parse(intent.payload);
    const created = events.find((e) => isType(e, "Created"));
    const objectId =
      intent.action === "create" && created
        ? CreatedBcs.parse(created.bcs).account
        : this.account(intent.family)?.object_id;
    if (!objectId)
      throw new DomainError(
        "The confirmed transaction did not create the expected practice account.",
      );
    const object = (await this.config!.gateway.object(objectId)).object;
    if (object.type !== `${this.typePackage}::practice::Account`)
      throw new DomainError(
        "The provider returned an unexpected practice object type.",
      );
    const onchain = AccountBcs.parse(object.content);
    if (
      onchain.guardian !== this.wallet(intent.family, "parent") ||
      onchain.learner !== this.wallet(intent.family, "learner") ||
      hex(Uint8Array.from(onchain.attestor)) !==
        hex(this.attestor!.getPublicKey().toRawBytes())
    )
      throw new DomainError(
        "The onchain authorities do not match this family.",
      );
    this.store.atomic(() => {
      const row = this.store.db
        .prepare("SELECT state FROM chain_intents WHERE id=?")
        .get(intent.id) as { state: string };
      if (row.state === "confirmed") return;
      if (!["pending", "submitting"].includes(row.state))
        throw new DomainError(
          "The transaction is not awaiting reconciliation.",
        );
      const state = this.store.get(intent.family);
      if (intent.action === "create") {
        this.store.db
          .prepare("INSERT INTO chain_accounts VALUES(?,?,?)")
          .run(intent.family, objectId, intent.digest);
        this.store.db
          .prepare("INSERT INTO portfolio_archives VALUES(?,?,?,?)")
          .run(
            randomUUID(),
            intent.family,
            JSON.stringify(state),
            new Date().toISOString(),
          );
        state.portfolio = {
          ...state.portfolio!,
          id: randomUUID(),
          startedAt: new Date().toISOString(),
          initialCash: "1000000000",
        };
        state.approvals = [];
      }
      if (intent.action === "order") {
        const ev = events.find((e) => isType(e, "Executed"));
        if (!ev)
          throw new DomainError(
            "The confirmed transaction has no practice execution receipt.",
          );
        const event = ExecutedBcs.parse(ev.bcs),
          q: Quote = payload.quote;
        if (
          event.account !== objectId ||
          hex(Uint8Array.from(event.nonce)) !== q.id.replaceAll("-", "") ||
          event.amount !== q.amount ||
          event.units !== q.units ||
          event.price !== q.price ||
          Buffer.from(event.symbol).toString() !== q.symbol ||
          event.buy !== (q.side === "buy") ||
          hex(Uint8Array.from(event.commitment)) !==
            hex(Uint8Array.from(payload.attested.commitment)) ||
          hex(Uint8Array.from(event.snapshot)) !== q.datasetId ||
          event.sequence !== String(q.sequence + 1) ||
          event.revision !== String(q.revision)
        )
          throw new DomainError(
            "The execution receipt does not match the reviewed order.",
          );
        const previous = this.store.getQuote(intent.family, q.id);
        if (!previous.decision) {
          const now = new Date(
            Number(transaction.timestampMs ?? Date.now()),
          ).toISOString();
          state.decisions.unshift({
            ...q,
            id: q.id,
            recordedAt: now,
            origin: "local",
            memoryStatus: "local",
            transactionDigest: intent.digest,
          });
          if (q.reason)
            state.memories.unshift({
              id: randomUUID(),
              kind: "decision",
              text: q.reason,
              recordedAt: now,
              decisionId: q.id,
              active: true,
              origin: "local",
            });
          this.store.consumeQuote(q.id, q.id);
          const approval = state.approvals.find((a) => a.quote.id === q.id);
          if (approval) approval.state = "consumed";
        }
      }
      if (intent.action === "approve") {
        const approval = state.approvals.find(
          (a) => a.id === payload.approvalId,
        );
        if (approval) approval.state = "approved";
      }
      if (intent.action === "corporate") {
        const entries =
          payload.entries as import("../shared/model.ts").Adjustment[];
        const receipts = events
          .filter((e) => isType(e, "CorporateApplied"))
          .map((e) => CorporateAppliedBcs.parse(e.bcs));
        if (
          receipts.length !== entries.length ||
          state.portfolio?.datasetId !== payload.from ||
          state.sequence !== payload.sequence
        )
          throw new DomainError(
            "The corporate-action receipt does not match this portfolio version.",
          );
        for (const [index, entry] of entries.entries()) {
          const event = receipts[index];
          if (
            event.account !== objectId ||
            hex(Uint8Array.from(event.event_id)) !== entry.id ||
            Buffer.from(event.symbol).toString() !== entry.symbol ||
            event.kind !== (entry.kind === "split" ? 0 : 1) ||
            event.effective_day !==
              String(
                Math.floor(Date.parse(entry.date + "T00:00:00Z") / 86400_000),
              ) ||
            event.units_before !== entry.unitsBefore ||
            event.units_after !== entry.unitsAfter ||
            event.cash_delta !== entry.cashDelta ||
            event.cost_released !== entry.costReleased ||
            event.sequence !== String(payload.sequence + index + 1) ||
            hex(Uint8Array.from(event.from_snapshot)) !== payload.from ||
            hex(Uint8Array.from(event.to_snapshot)) !== payload.to
          )
            throw new DomainError(
              "A corporate-action receipt failed ledger validation.",
            );
        }
        const projected = structuredClone(state);
        for (const entry of entries)
          applyAdjustment(
            projected,
            entry,
            payload.from,
            payload.to,
            entry.recordedAt,
          );
        const positions = onchain.positions
          .filter((p) => BigInt(p.units) > 0n)
          .map((p) => ({
            symbol: Buffer.from(p.symbol).toString(),
            units: p.units,
            cost: p.cost,
          }));
        const normalized = (items: typeof positions) =>
          JSON.stringify(
            [...items].sort((a, b) => a.symbol.localeCompare(b.symbol)),
          );
        if (
          onchain.sequence !== String(projected.sequence) ||
          onchain.cash !== projected.cash ||
          normalized(positions) !== normalized(projected.holdings) ||
          onchain.day_spent !== state.daySpent ||
          onchain.revision !== String(state.policy.revision) ||
          onchain.per_trade !== state.policy.perTrade ||
          onchain.daily !== state.policy.daily ||
          onchain.paused !== state.policy.paused ||
          JSON.stringify(
            onchain.allowed.map((a) => Buffer.from(a).toString()).sort(),
          ) !== JSON.stringify([...state.policy.allowed].sort())
        )
          throw new DomainError(
            "The corporate-action account state failed balance validation.",
          );
        const existing = new Set(
          (state.adjustments ?? []).map((a) => `${a.portfolioId}:${a.id}`),
        );
        state.adjustments = [
          ...entries
            .filter((e) => !existing.has(`${e.portfolioId}:${e.id}`))
            .map((e) => ({ ...e, transactionDigest: intent.digest })),
          ...(state.adjustments ?? []),
        ];
        state.portfolio!.datasetId = payload.to;
        state.approvals = state.approvals.map((a) =>
          a.state === "approved" || a.state === "requested"
            ? { ...a, state: "declined" }
            : a,
        );
      }
      state.cash = onchain.cash;
      state.holdings = onchain.positions
        .filter((p) => BigInt(p.units) > 0n)
        .map((p) => ({
          symbol: Buffer.from(p.symbol).toString(),
          units: p.units,
          cost: p.cost,
        }));
      state.policy = {
        perTrade: onchain.per_trade,
        daily: onchain.daily,
        paused: onchain.paused,
        revision: Number(onchain.revision),
        allowed: onchain.allowed.map((a) => Buffer.from(a).toString()),
      };
      state.sequence = Number(onchain.sequence);
      state.daySpent = onchain.day_spent;
      state.spendDay = new Date(Number(onchain.spend_day) * 86400_000)
        .toISOString()
        .slice(0, 10);
      this.store.set(state);
      this.store.db
        .prepare(
          "UPDATE chain_intents SET state='confirmed',error=NULL WHERE id=?",
        )
        .run(intent.id);
    });
    return { state: "confirmed", digest: intent.digest };
  }
  async reconcilePending() {
    if (!this.config) return;
    const rows = this.store.db
      .prepare(
        "SELECT * FROM chain_intents WHERE state IN ('pending','submitting') ORDER BY expires_at LIMIT 5",
      )
      .all() as Intent[];
    for (const intent of rows) {
      try {
        const result = await this.reconcile(intent);
        if (result.state === "pending") {
          await this.dispatch(intent);
          await this.reconcile(intent);
        }
      } catch {
        console.error(
          "[trove] A Sui receipt needs reconciliation; balances were not fabricated.",
        );
      }
    }
    const families = this.store.db
      .prepare("SELECT family FROM chain_accounts")
      .all() as { family: string }[];
    for (const { family } of families) {
      if (
        this.store.db
          .prepare(
            "SELECT 1 FROM chain_intents WHERE state IN ('building','prepared','submitting','pending')",
          )
          .get()
      )
        break;
      try {
        await this.maintain(family);
      } catch {
        /* persisted failures retry with the next coherent snapshot/sequence */
      }
    }
  }
  async maintain(family: string) {
    if (!this.config || !this.account(family)) return;
    const state = this.store.get(family),
      plan = this.market.plan(state);
    if (!plan.entries.length) return;
    if (this.pending(family).length) return;
    const fingerprint = hash(
      JSON.stringify([
        plan.from!.id,
        plan.target!.id,
        state.sequence,
        state.policy.revision,
        plan.entries.map((e) => e.id),
      ]),
    ).toString("hex");
    const retry = this.store.db
      .prepare("SELECT * FROM corporate_retry WHERE family=?")
      .get(family) as
      { fingerprint: string; attempts: number; next_at: number } | undefined;
    if (retry?.fingerprint === fingerprint && retry.next_at > Date.now())
      return;
    const attempts =
      retry?.fingerprint === fingerprint ? retry.attempts + 1 : 1;
    this.store.db
      .prepare(
        "INSERT INTO corporate_retry VALUES(?,?,?,?) ON CONFLICT(family) DO UPDATE SET fingerprint=excluded.fingerprint,attempts=excluded.attempts,next_at=excluded.next_at",
      )
      .run(
        family,
        fingerprint,
        attempts,
        Date.now() + Math.min(1800_000, 10_000 * 2 ** Math.min(attempts, 8)),
      );
    const member: Member = {
      id: "system:corporate",
      family,
      role: "parent",
      username: "system",
    };
    const prepared = await this.prepare(member, { action: "corporate" }, true);
    const signature = (
      await this.sponsor!.signTransaction(fromBase64(prepared.bytes))
    ).signature;
    const result = await this.submit(member, prepared.id, signature);
    if (result.state === "confirmed")
      this.store.db
        .prepare("DELETE FROM corporate_retry WHERE family=?")
        .run(family);
    return result;
  }
}
