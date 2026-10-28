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
  FundedBcs,
  ExecutedBcs,
  QuoteBcs,
  ClockBcs,
  CorporateTermsBcs,
  CorporateAppliedBcs,
  EnrollmentTermsBcs,
  LearnerEnrolledBcs,
  UNASSIGNED_LEARNER,
} from "../shared/chain.ts";
import type { ChainStatus } from "../shared/chain.ts";
import type { Quote } from "../shared/model.ts";
import {
  applyFunding,
  fundingAmount,
  practiceCapital,
} from "../shared/funding.ts";
import { parseDollars } from "../shared/model.ts";
import type { DemoStore } from "./store.ts";
import type { MarketService } from "./market.ts";
import { TatumSuiGateway } from "./integrations/tatum.ts";
import { AccessError, Accounts } from "./auth.ts";
import type { Member } from "./auth.ts";
import { DomainError } from "./domain.ts";
import { applyAdjustment } from "../shared/corporate-actions.ts";
import { networkLabel } from "../shared/network.ts";
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
  z.object({ action: z.literal("enroll") }),
  z.object({
    action: z.literal("fund"),
    id: z.uuid(),
    amount: z.string().max(20),
  }),
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
  eventTypeOrigins?: Readonly<Record<string, string>>;
  fundingReady?: boolean;
  enrollmentReady?: boolean;
  sponsorKey: string;
  attestorKey: string;
  gateway: TatumSuiGateway;
};
/** Only fixed, server-built practice calls can be sponsored. Wallet signatures remain mandatory. */
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
      for (const origin of Object.values(config.eventTypeOrigins ?? {}))
        address.parse(origin);
      if (config.gateway.network !== store.db.chainNetwork)
        throw new Error("The chain provider and storage network must match.");
      this.sponsor = Ed25519Keypair.fromSecretKey(config.sponsorKey);
      this.attestor = Ed25519Keypair.fromSecretKey(config.attestorKey);
    }
  }
  get network() {
    return this.config?.gateway.network ?? this.store.db.chainNetwork;
  }
  async account(family: string) {
    return (await this.store.db
      .prepare("SELECT object_id FROM chain_accounts WHERE family=?")
      .get(family)) as
      | {
          object_id: string;
        }
      | undefined;
  }
  async wallet(family: string, role: string) {
    return (
      (await this.store.db
        .prepare("SELECT address FROM chain_wallets WHERE family=? AND role=?")
        .get(family, role)) as
        | {
            address: string;
          }
        | undefined
    )?.address;
  }
  async enrolledLearner(family: string) {
    const binding = await this.store.db
      .prepare("SELECT address FROM chain_learner_bindings WHERE family=?")
      .get(family);
    return binding
      ? String(binding.address)
      : ((await this.wallet(family, "learner")) ?? UNASSIGNED_LEARNER);
  }
  private async mayLink(member: Member) {
    return (
      !(await this.account(member.family)) ||
      (member.role === "learner" &&
        this.config?.enrollmentReady &&
        (await this.enrolledLearner(member.family)) === UNASSIGNED_LEARNER)
    );
  }
  async pending(family: string) {
    return (await this.store.db
      .prepare(
        "SELECT * FROM chain_intents WHERE family=? AND state IN ('building','prepared','submitting','pending')",
      )
      .all(family)) as Intent[];
  }
  async status(member: Member): Promise<ChainStatus> {
    const account = (await this.account(member.family))?.object_id;
    return {
      ready: Boolean(this.config),
      fundingReady: Boolean(this.config?.fundingReady),
      enrollmentReady: Boolean(this.config?.enrollmentReady),
      learnerBound: Boolean(
        account &&
        (await this.enrolledLearner(member.family)) !== UNASSIGNED_LEARNER,
      ),
      network: this.network,
      account,
      wallet: await this.wallet(member.family, member.role),
      guardian: await this.wallet(member.family, "parent"),
      learner: await this.wallet(member.family, "learner"),
      pending: (await this.pending(member.family)).map(
        ({ id, state, digest }) => ({
          id,
          state,
          digest,
        }),
      ),
    };
  }
  private get typePackage() {
    return this.config!.originalPackageId ?? this.config!.packageId;
  }
  async challenge(member: Member, input: unknown) {
    this.requireReady();
    await this.accounts.limit(`wallet-link:${member.id}`, 10, 60000);
    const wallet = address.parse(input);
    if (!(await this.mayLink(member)))
      throw new DomainError(
        "This practice account already has fixed wallet authorities.",
      );
    const id = randomUUID(),
      expires = Date.now() + 300000;
    const message = `Trove ${networkLabel(this.network)} wallet link\nMember: ${member.id}\nFamily: ${member.family}\nRole: ${member.role}\nWallet: ${wallet}\nNonce: ${randomBytes(32).toString("hex")}\nExpires: ${expires}\nThis links a practice wallet; it does not prove adulthood or a legal relationship.`;
    await this.store.db
      .prepare("INSERT INTO chain_challenges VALUES(?,?,?,?,?,0)")
      .run(id, member.id, message, wallet, expires);
    return { id, message, expiresAt: expires };
  }
  async link(member: Member, id: string, signature: string) {
    this.requireReady();
    const row = (await this.store.db
      .prepare("SELECT * FROM chain_challenges WHERE id=? AND member=?")
      .get(id, member.id)) as
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
    await this.store.atomic(async () => {
      await this.store.db.lock(`chain-authority:${member.family}`);
      if (
        !(await this.mayLink(member)) ||
        (await this.pending(member.family)).length
      )
        throw new DomainError(
          "Wallet authority is locked while an account or transaction exists.",
        );
      const changed = await this.store.db
        .prepare(
          "UPDATE chain_challenges SET consumed=1 WHERE id=? AND consumed=0 AND expires_at>?",
        )
        .run(id, Date.now());
      if (!changed.changes)
        throw new DomainError("This wallet link was already used or expired.");
      const other = await this.wallet(
        member.family,
        member.role === "parent" ? "learner" : "parent",
      );
      if (other === row.address)
        throw new DomainError("Parent and learner need separate wallets.");
      await this.store.db
        .prepare(
          "INSERT INTO chain_wallets VALUES(?,?,?) ON CONFLICT(family,role) DO UPDATE SET address=excluded.address",
        )
        .run(member.family, member.role, row.address);
    });
    return await this.status(member);
  }
  private requireReady() {
    if (!this.config)
      throw new DomainError(
        `${networkLabel(this.network)} is not configured on this server yet.`,
      );
  }
  async assertLocal(family: string) {
    if ((await this.account(family)) || (await this.pending(family)).length)
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
        Math.abs(Date.now() - timestamp) > 30000
      )
        throw new Error("Clock outside the supported skew window.");
      // A host-clock expiry of now+120s can exceed the contract's now+120s
      // ceiling while its last checkpoint is a few seconds behind the host.
      // Anchor to consensus and leave 20s for different provider checkpoint lags.
      return Math.min(Date.now() + 120000, timestamp + 100000);
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
    if (
      (["order", "enroll"].includes(input.action) ? "learner" : "parent") !==
      member.role
    )
      throw new AccessError("This action belongs to the other family role.");
    if (
      (input.action === "fund" || input.action === "create") &&
      !this.config!.fundingReady
    ) {
      const current = await this.store.get(member.family);
      if (
        input.action === "fund" ||
        practiceCapital(current) !== 1000000000n ||
        current.policy.paused
      )
        throw new DomainError(
          "This Sui account needs its practice-funds update before continuing.",
        );
    }
    const sender =
        input.action === "corporate"
          ? this.sponsor!.toSuiAddress()
          : await this.wallet(member.family, member.role),
      guardian = await this.wallet(member.family, "parent"),
      learner = await this.wallet(member.family, "learner");
    if (!sender || !guardian)
      throw new DomainError("Connect your own practice wallet first.");
    if (input.action === "create" && !learner && !this.config!.enrollmentReady)
      throw new DomainError(
        "Parent-first activation needs the updated Sui practice contract.",
      );
    if (input.action === "corporate")
      await this.accounts.limit("chain-maintenance:global", 100, 86400000);
    else {
      await this.accounts.limit(`chain:${member.family}`, 40, 86400000);
      await this.accounts.limit("chain:global", 200, 86400000);
    }
    const state = await this.store.get(member.family),
      account = await this.account(member.family);
    const ledgerNetwork = state.portfolio?.network ?? "testnet";
    if (input.action !== "create" && ledgerNetwork !== this.network)
      throw new DomainError(
        `Activate your ${networkLabel(this.network)} practice portfolio before continuing.`,
      );
    const otherNetwork = this.network === "mainnet" ? "testnet" : "mainnet";
    if (
      input.action === "create" &&
      (await this.store.db
        .prepare(
          "SELECT 1 FROM chain_intents WHERE family=? AND state IN ('building','prepared','submitting','pending')",
          otherNetwork,
        )
        .get(member.family))
    )
      throw new DomainError(
        "Finish your pending transaction on the previous network before activating this portfolio.",
      );
    if (input.action === "create" ? Boolean(account) : !account)
      throw new DomainError(
        "This action does not match the Sui practice account status.",
      );
    if (
      input.action === "enroll" &&
      (!this.config!.enrollmentReady ||
        !learner ||
        (await this.enrolledLearner(member.family)) !== UNASSIGNED_LEARNER)
    )
      throw new DomainError(
        "This portfolio is not waiting for learner registration.",
      );
    if (
      ["order", "approve"].includes(input.action) &&
      (!learner ||
        (await this.enrolledLearner(member.family)) === UNASSIGNED_LEARNER)
    )
      throw new DomainError(
        "The learner must finish connecting their wallet before trading.",
      );
    if (
      input.action === "create" &&
      (!state.portfolio || (await this.market.status(state)).stale)
    )
      throw new DomainError(
        "Start a fresh market-price practice portfolio first.",
      );
    if (input.action === "fund") {
      const projected = structuredClone(state);
      if (
        !applyFunding(projected, {
          id: input.id,
          amount: String(fundingAmount(input.amount)),
          recordedAt: new Date().toISOString(),
        })
      )
        throw new DomainError(
          "This practice funding request is already recorded.",
        );
    }
    let quote: Quote | undefined;
    if (input.action === "order") {
      const found = await this.store.getQuote(member.family, input.quoteId);
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
    if (quote) await this.market.assertTradable(state);
    if (input.action === "policy") {
      const per = parseDollars(input.perTrade),
        day = parseDollars(input.daily);
      if (per <= 0n || day < per)
        throw new DomainError(
          "The daily allowance must cover the positive per-investment limit.",
        );
    }
    const corporatePlan =
      input.action === "corporate" ? await this.market.plan(state) : undefined;
    if (
      corporatePlan &&
      (!corporatePlan.entries.length || corporatePlan.entries.length > 48)
    )
      throw new DomainError("This corporate-action batch is no longer ready.");
    const consensusExpiry = ["corporate", "enroll"].includes(input.action)
      ? await this.quoteExpiry()
      : undefined;
    const id = randomUUID();
    let expires = Math.min(
      consensusExpiry ?? quote?.expiresAt ?? Date.now() + 120000,
      Date.now() + 120000,
    );
    await this.store.atomic(async () => {
      await this.store.db.lock(`chain-authority:${member.family}`);
      const current = await this.store.get(member.family);
      if (
        current.sequence !== state.sequence ||
        current.policy.revision !== state.policy.revision
      )
        throw new DomainError(
          "This portfolio changed. Refresh before preparing this action.",
        );
      if (
        (await this.wallet(member.family, "parent")) !== guardian ||
        (await this.wallet(member.family, "learner")) !== learner
      )
        throw new DomainError(
          "The linked wallets changed. Refresh before preparing this action.",
        );
      await this.store.db
        .prepare(
          "UPDATE chain_intents SET state='failed',error='Unsigned preview expired' WHERE state IN ('building','prepared') AND expires_at<=?",
        )
        .run(Date.now());
      const active = await this.store.db
        .prepare(
          "SELECT 1 FROM chain_intents WHERE state IN ('building','prepared','submitting','pending')",
        )
        .get();
      if (active)
        throw new DomainError(
          "Another sponsored action is awaiting a signature or confirmation. Finish or cancel it first.",
        );
      await this.store.db
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
      tx.setGasBudget(30000000);
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
              Math.floor(Date.parse(entry.date + "T00:00:00Z") / 86400000),
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
        tx.setGasBudget(80000000);
        payload = {
          action: "corporate",
          entries: plan.entries,
          from: plan.from!.id,
          to: plan.target!.id,
          sequence: state.sequence,
        };
      } else if (input.action === "enroll") {
        const data = {
          domain: bytes("trove:enrollment:v1"),
          package_id: this.typePackage,
          account: account!.object_id,
          guardian,
          learner: learner!,
          expires_at: String(expires),
          nonce: Array.from(randomBytes(16)),
        };
        const signature = await this.attestor!.sign(
          EnrollmentTermsBcs.serialize(data).toBytes(),
        );
        tx.moveCall({
          target: `${this.config!.packageId}::practice::enroll`,
          arguments: [
            tx.object(account!.object_id),
            tx.pure.u64(expires),
            tx.pure.vector("u8", data.nonce),
            tx.pure.vector("u8", Array.from(signature)),
            tx.object("0x6"),
          ],
        });
        payload = {
          ...input,
          learner,
          sequence: state.sequence,
          portfolioId: state.portfolio?.id,
        };
      } else if (input.action === "create") {
        tx.moveCall({
          target: `${this.config!.packageId}::practice::${!learner ? "create_family" : this.config!.fundingReady ? "create_with_funds" : "create"}`,
          arguments: [
            ...(learner ? [tx.pure.address(learner)] : []),
            tx.pure.vector(
              "u8",
              Array.from(this.attestor!.getPublicKey().toRawBytes()),
            ),
            tx.pure.u64(state.policy.perTrade),
            tx.pure.u64(state.policy.daily),
            tx.pure.vector("vector<u8>", state.policy.allowed.map(bytes)),
            ...(this.config!.fundingReady
              ? [
                  tx.pure.u64(practiceCapital(state)),
                  tx.pure.bool(state.policy.paused),
                ]
              : []),
          ],
        });
        payload = {
          ...input,
          initialCash: String(practiceCapital(state)),
          learnerAddress: learner ?? UNASSIGNED_LEARNER,
        };
      } else if (input.action === "fund") {
        const amount = String(fundingAmount(input.amount));
        tx.moveCall({
          target: `${this.config!.packageId}::practice::fund`,
          arguments: [
            tx.object(account!.object_id),
            tx.pure.vector(
              "u8",
              Array.from(Buffer.from(input.id.replaceAll("-", ""), "hex")),
            ),
            tx.pure.u64(amount),
            tx.pure.u64(state.sequence),
          ],
        });
        payload = {
          ...input,
          amount,
          sequence: state.sequence,
          portfolioId: state.portfolio?.id,
        };
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
        let attested = (await this.store.db
          .prepare(
            "SELECT payload FROM chain_quote_attestations WHERE quote_id=?",
          )
          .get(q.id)) as
          | {
              payload: string;
            }
          | undefined;
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
            expires_at: String(Math.min(q.expiresAt, await this.quoteExpiry())),
            revision: String(q.revision),
            sequence: String(q.sequence),
            market_day: String(
              Math.floor(Date.parse(q.marketDate + "T00:00:00Z") / 86400000),
            ),
            snapshot: Array.from(Buffer.from(q.datasetId!, "hex")),
            commitment: Array.from(hash(`${salt}:${q.id}:${q.reason}`)),
            nonce: Array.from(Buffer.from(q.id.replaceAll("-", ""), "hex")),
          };
          attested = { payload: JSON.stringify(data) };
          await this.store.db
            .prepare("INSERT INTO chain_quote_attestations VALUES(?,?,?)")
            .run(q.id, attested.payload, salt);
        }
        preparationStage = "quote-encoding";
        const data = QuoteBcs.parse(
          QuoteBcs.serialize(JSON.parse(attested.payload)).toBytes(),
        );
        expires = Math.min(expires, Number(data.expires_at));
        if (expires <= Date.now())
          throw new DomainError(
            "This signed quote expired. Review a fresh order.",
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
      const gasBudget = input.action === "corporate" ? 80000000n : 30000000n;
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
          this.network === "testnet"
            ? "The Testnet gas sponsor needs free faucet SUI before continuing."
            : "The Mainnet gas sponsor needs SUI before continuing.",
        );
      preparationStage = "transaction-build";
      const built = await tx.build({ client: this.config!.gateway.client }),
        digest = await tx.getDigest();
      await this.store.db
        .prepare(
          "UPDATE chain_intents SET payload=?,bytes=?,digest=?,expires_at=?,state='prepared' WHERE id=? AND state='building'",
        )
        .run(JSON.stringify(payload), toBase64(built), digest, expires, id);
      return {
        id,
        bytes: toBase64(built),
        digest,
        expiresAt: expires,
        network: this.network,
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
      await this.store.db
        .prepare(
          "UPDATE chain_intents SET state='failed',error='Preparation failed' WHERE id=? AND state='building'",
        )
        .run(id);
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        `Tatum could not prepare this ${networkLabel(this.network)} action. No transaction was submitted.`,
      );
    }
  }
  async submit(member: Member, id: string, signature: string) {
    this.requireReady();
    const intent = (await this.store.db
      .prepare(
        "SELECT * FROM chain_intents WHERE id=? AND family=? AND member=?",
      )
      .get(id, member.family, member.id)) as Intent | undefined;
    if (!intent?.bytes)
      throw new DomainError("This transaction preview was not found.");
    if (intent.state === "confirmed")
      return { state: "confirmed", digest: intent.digest };
    if (["submitting", "pending"].includes(intent.state))
      return await this.reconcile(intent);
    if (intent.state !== "prepared" || intent.expires_at <= Date.now())
      throw new DomainError(
        "This unsigned transaction expired. Review a fresh action.",
      );
    try {
      await verifyTransactionSignature(fromBase64(intent.bytes), signature, {
        address:
          intent.action === "corporate"
            ? this.sponsor!.toSuiAddress()
            : await this.wallet(member.family, member.role),
        client: this.config!.gateway.client,
      });
    } catch {
      throw new AccessError(
        "The signed transaction does not match this wallet and preview.",
      );
    }
    const changed = await this.store.db
      .prepare(
        "UPDATE chain_intents SET signature=?,state='submitting' WHERE id=? AND state='prepared' AND expires_at>?",
      )
      .run(signature, id, Date.now());
    if (!changed.changes)
      throw new DomainError("This preview was already submitted or expired.");
    await this.dispatch({ ...intent, signature, state: "submitting" });
    await this.store.db
      .prepare(
        "UPDATE chain_intents SET state='pending' WHERE id=? AND state='submitting'",
      )
      .run(id);
    return await this.reconcile({ ...intent, state: "pending" });
  }
  async cancel(member: Member, id: string) {
    const changed = await this.store.db
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
    const claimed = await this.store.atomic(async () => {
      await this.store.db
        .prepare("INSERT OR IGNORE INTO chain_dispatch(id) VALUES(?)")
        .run(intent.id);
      return (
        await this.store.db
          .prepare(
            "UPDATE chain_dispatch SET attempts=attempts+1,next_at=?,lease_until=?,token=? WHERE id=? AND attempts<8 AND next_at<=? AND lease_until<=?",
          )
          .run(
            Date.now() + 30000,
            Date.now() + 45000,
            token,
            intent.id,
            Date.now(),
            Date.now(),
          )
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
      await this.store.db
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
      await this.store.db
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
      (e) => packageIds.has(e.packageId) && e.module === "practice",
    );
    const isType = (
      event: {
        eventType: string;
      },
      name: string,
    ) => {
      // A type introduced by an intermediate upgrade retains that package's
      // identity even when the transaction executes the latest package.
      const origin = this.config!.eventTypeOrigins?.[name];
      return origin
        ? event.eventType === `${origin}::practice::${name}`
        : [...packageIds].some(
            (id) => event.eventType === `${id}::practice::${name}`,
          );
    };
    const payload = JSON.parse(intent.payload);
    const created = events.find((e) => isType(e, "Created"));
    const objectId =
      intent.action === "create" && created
        ? CreatedBcs.parse(created.bcs).account
        : (await this.account(intent.family))?.object_id;
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
    const expectedLearner =
      intent.action === "create"
        ? (payload.learnerAddress ??
          (await this.wallet(intent.family, "learner")) ??
          UNASSIGNED_LEARNER)
        : intent.action === "enroll"
          ? payload.learner
          : await this.enrolledLearner(intent.family);
    if (
      onchain.id !== objectId ||
      onchain.guardian !== (await this.wallet(intent.family, "parent")) ||
      onchain.learner !== expectedLearner ||
      hex(Uint8Array.from(onchain.attestor)) !==
        hex(this.attestor!.getPublicKey().toRawBytes())
    )
      throw new DomainError(
        "The onchain authorities do not match this family.",
      );
    await this.store.atomic(async () => {
      const state = await this.store.get(intent.family);
      const row = (await this.store.db
        .prepare("SELECT state FROM chain_intents WHERE id=?")
        .get(intent.id)) as {
        state: string;
      };
      if (row.state === "confirmed") return;
      if (!["pending", "submitting"].includes(row.state))
        throw new DomainError(
          "The transaction is not awaiting reconciliation.",
        );
      if (
        intent.action !== "create" &&
        (state.portfolio?.network ?? "testnet") !== this.network
      )
        throw new DomainError(
          "This receipt belongs to a different network from the active portfolio.",
        );
      if (intent.action === "create") {
        if (
          onchain.cash !== (payload.initialCash ?? "1000000000") ||
          onchain.positions.length ||
          onchain.sequence !== "0" ||
          onchain.day_spent !== "0" ||
          onchain.per_trade !== state.policy.perTrade ||
          onchain.daily !== state.policy.daily ||
          onchain.paused !== state.policy.paused ||
          onchain.revision !== "0"
        )
          throw new DomainError(
            "The created practice account does not match its starting capital and limits.",
          );
        await this.store.db
          .prepare("INSERT INTO chain_accounts VALUES(?,?,?)")
          .run(intent.family, objectId, intent.digest);
        await this.store.db
          .prepare(
            "INSERT INTO chain_learner_bindings(family,address) VALUES(?,?)",
          )
          .run(intent.family, expectedLearner);
        await this.store.db
          .prepare("INSERT INTO portfolio_archives VALUES(?,?,?,?)")
          .run(
            randomUUID(),
            intent.family,
            JSON.stringify(state),
            new Date().toISOString(),
          );
        state.portfolio = {
          ...state.portfolio!,
          network: this.network,
          id: randomUUID(),
          startedAt: new Date().toISOString(),
          initialCash: payload.initialCash ?? "1000000000",
        };
        state.approvals = [];
      }
      if (intent.action === "enroll") {
        const ev = events.find((e) => isType(e, "LearnerEnrolled"));
        const enrolled = ev ? LearnerEnrolledBcs.parse(ev.bcs) : undefined;
        const positions = onchain.positions
          .filter((p) => BigInt(p.units) > 0n)
          .map((p) => ({
            symbol: Buffer.from(p.symbol).toString(),
            units: p.units,
            cost: p.cost,
          }));
        if (
          !enrolled ||
          enrolled.account !== objectId ||
          enrolled.learner !== payload.learner ||
          enrolled.sequence !== String(payload.sequence + 1) ||
          onchain.sequence !== enrolled.sequence ||
          state.sequence !== payload.sequence ||
          state.portfolio?.id !== payload.portfolioId ||
          onchain.cash !== state.cash ||
          JSON.stringify(positions) !== JSON.stringify(state.holdings) ||
          onchain.per_trade !== state.policy.perTrade ||
          onchain.daily !== state.policy.daily ||
          onchain.paused !== state.policy.paused ||
          onchain.revision !== String(state.policy.revision) ||
          onchain.day_spent !== state.daySpent ||
          onchain.spend_day !==
            String(
              Math.floor(Date.parse(state.spendDay + "T00:00:00Z") / 86400000),
            ) ||
          JSON.stringify(
            onchain.allowed.map((s) => Buffer.from(s).toString()),
          ) !== JSON.stringify(state.policy.allowed) ||
          onchain.approval.length !== 0 ||
          payload.learner !== (await this.wallet(intent.family, "learner"))
        )
          throw new DomainError(
            "The learner registration receipt does not match this portfolio.",
          );
        await this.store.db
          .prepare(
            "INSERT INTO chain_learner_bindings(family,address) VALUES(?,?) ON CONFLICT(family) DO UPDATE SET address=excluded.address",
          )
          .run(intent.family, payload.learner);
        state.approvals = state.approvals.map((a) =>
          a.state === "requested" || a.state === "approved"
            ? { ...a, state: "declined" }
            : a,
        );
      }
      if (intent.action === "fund") {
        const ev = events.find((event) => isType(event, "Funded"));
        if (
          !ev ||
          payload.sequence !== state.sequence ||
          payload.portfolioId !== state.portfolio?.id
        )
          throw new DomainError(
            "The funding receipt does not match this portfolio version.",
          );
        const event = FundedBcs.parse(ev.bcs);
        const projected = structuredClone(state);
        applyFunding(projected, {
          id: payload.id,
          amount: payload.amount,
          recordedAt: new Date(
            Number(transaction.timestampMs ?? Date.now()),
          ).toISOString(),
          transactionDigest: intent.digest,
        });
        const normalize = (positions: typeof state.holdings) =>
          JSON.stringify(
            [...positions].sort((a, b) => a.symbol.localeCompare(b.symbol)),
          );
        const positions = onchain.positions
          .filter((position) => BigInt(position.units) > 0n)
          .map((position) => ({
            symbol: Buffer.from(position.symbol).toString(),
            units: position.units,
            cost: position.cost,
          }));
        if (
          event.account !== objectId ||
          hex(Uint8Array.from(event.id)) !== payload.id.replaceAll("-", "") ||
          event.amount !== payload.amount ||
          event.cash !== projected.cash ||
          event.sequence !== String(projected.sequence) ||
          onchain.cash !== projected.cash ||
          onchain.sequence !== String(projected.sequence) ||
          normalize(positions) !== normalize(state.holdings) ||
          onchain.day_spent !== state.daySpent ||
          onchain.spend_day !==
            String(
              Math.floor(Date.parse(state.spendDay + "T00:00:00Z") / 86400000),
            ) ||
          onchain.revision !== String(state.policy.revision) ||
          onchain.per_trade !== state.policy.perTrade ||
          onchain.daily !== state.policy.daily ||
          onchain.paused !== state.policy.paused ||
          JSON.stringify(
            onchain.allowed
              .map((value) => Buffer.from(value).toString())
              .sort(),
          ) !== JSON.stringify([...state.policy.allowed].sort()) ||
          onchain.approval.length !== 0
        )
          throw new DomainError(
            "The funding receipt failed cash and authority validation.",
          );
        state.funding = projected.funding;
        state.approvals = projected.approvals;
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
        const previous = await this.store.getQuote(intent.family, q.id);
        if (!previous.decision) {
          const now = new Date(
            Number(transaction.timestampMs ?? Date.now()),
          ).toISOString();
          state.decisions.unshift({
            network: this.network,
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
          await this.store.consumeQuote(q.id, q.id);
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
                Math.floor(Date.parse(entry.date + "T00:00:00Z") / 86400000),
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
            .map((e) => ({
              ...e,
              network: this.network,
              transactionDigest: intent.digest,
            })),
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
      state.spendDay = new Date(Number(onchain.spend_day) * 86400000)
        .toISOString()
        .slice(0, 10);
      await this.store.set(state);
      await this.store.db
        .prepare(
          "UPDATE chain_intents SET state='confirmed',error=NULL WHERE id=?",
        )
        .run(intent.id);
    });
    return { state: "confirmed", digest: intent.digest };
  }
  async reconcilePending(batchSize = 5) {
    if (!this.config) return;
    const rows = (await this.store.db
      .prepare(
        "SELECT * FROM chain_intents WHERE state IN ('pending','submitting') ORDER BY expires_at LIMIT ?",
      )
      .all(Math.max(1, Math.min(5, batchSize)))) as Intent[];
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
    const families = (await this.store.db
      .prepare("SELECT family FROM chain_accounts LIMIT ?")
      .all(Math.max(1, Math.min(5, batchSize)))) as {
      family: string;
    }[];
    for (const { family } of families) {
      if (
        await this.store.db
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
    if (!this.config || !(await this.account(family))) return;
    const state = await this.store.get(family),
      plan = await this.market.plan(state);
    if (!plan.entries.length) return;
    if ((await this.pending(family)).length) return;
    const fingerprint = hash(
      JSON.stringify([
        plan.from!.id,
        plan.target!.id,
        state.sequence,
        state.policy.revision,
        plan.entries.map((e) => e.id),
      ]),
    ).toString("hex");
    const retry = (await this.store.db
      .prepare("SELECT * FROM corporate_retry WHERE family=?")
      .get(family)) as
      | {
          fingerprint: string;
          attempts: number;
          next_at: number;
        }
      | undefined;
    if (retry?.fingerprint === fingerprint && retry.next_at > Date.now())
      return;
    const attempts =
      retry?.fingerprint === fingerprint ? retry.attempts + 1 : 1;
    await this.store.db
      .prepare(
        "INSERT INTO corporate_retry VALUES(?,?,?,?) ON CONFLICT(family) DO UPDATE SET fingerprint=excluded.fingerprint,attempts=excluded.attempts,next_at=excluded.next_at",
      )
      .run(
        family,
        fingerprint,
        attempts,
        Date.now() + Math.min(1800000, 10000 * 2 ** Math.min(attempts, 8)),
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
      await this.store.db
        .prepare("DELETE FROM corporate_retry WHERE family=?")
        .run(family);
    return result;
  }
}
