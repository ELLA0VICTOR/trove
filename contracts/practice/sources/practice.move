/// Testnet-only simulated USD and shares. No coins, deposits or real securities.
module trove::practice;

use std::bcs;
use sui::clock::{Self, Clock};
use sui::ed25519;
use sui::event;
use sui::hash;
use sui::dynamic_field;

const EAuthority: u64 = 1;
const EPolicy: u64 = 2;
const EQuote: u64 = 3;
const EBalance: u64 = 4;
const EApproval: u64 = 5;
const ESignature: u64 = 6;
const EApplied: u64 = 7;
const SCALE: u128 = 100000000;

public struct Position has store, copy, drop { symbol: vector<u8>, units: u64, cost: u64 }
public struct Account has key {
    id: UID, guardian: address, learner: address, attestor: vector<u8>,
    cash: u64, positions: vector<Position>, per_trade: u64, daily: u64,
    paused: bool, allowed: vector<vector<u8>>, revision: u64, sequence: u64,
    day_spent: u64, spend_day: u64, approval: vector<u8>,
}
/// The BCS schema is also defined in shared/chain.ts. Every executable field is signed.
public struct Quote has copy, drop, store {
    domain: vector<u8>, package_id: address, account: address,
    symbol: vector<u8>, buy: bool, requested: u64, amount: u64, units: u64, price: u64,
    expires_at: u64, revision: u64, sequence: u64, market_day: u64,
    snapshot: vector<u8>, commitment: vector<u8>, nonce: vector<u8>,
}
public struct Created has copy, drop { account: address, guardian: address, learner: address }
public struct PolicyChanged has copy, drop { account: address, revision: u64, per_trade: u64, daily: u64, paused: bool }
public struct FundingKey has copy, drop, store { id: vector<u8> }
public struct Funded has copy, drop { account: address, id: vector<u8>, amount: u64, cash: u64, sequence: u64 }
public struct ApprovalGranted has copy, drop { account: address, quote_hash: vector<u8> }
public struct Executed has copy, drop {
    account: address, nonce: vector<u8>, symbol: vector<u8>, buy: bool,
    amount: u64, units: u64, price: u64, sequence: u64, revision: u64,
    cash: u64, day_spent: u64, spend_day: u64, commitment: vector<u8>, snapshot: vector<u8>,
}
public struct CorporateKey has copy, drop, store { event_id: vector<u8> }
public struct CorporateTerms has copy, drop, store {
    domain: vector<u8>, package_id: address, account: address,
    event_id: vector<u8>, symbol: vector<u8>, kind: u8, effective_day: u64,
    numerator: u64, denominator: u64, dividend: u64, price: u64,
    units_before: u64, sequence: u64, revision: u64,
    from_snapshot: vector<u8>, to_snapshot: vector<u8>, expires_at: u64,
}
public struct CorporateApplied has copy, drop {
    account: address, event_id: vector<u8>, symbol: vector<u8>, kind: u8, effective_day: u64,
    units_before: u64, units_after: u64, cash_delta: u64, cost_released: u64,
    sequence: u64, from_snapshot: vector<u8>, to_snapshot: vector<u8>,
}

/// Passive bookkeeping is authorized by the account's pinned data attestor.
/// It neither changes permissions nor replenishes the gross-buy allowance.
public fun adjust(account: &mut Account, event_id: vector<u8>, symbol: vector<u8>, kind: u8, effective_day: u64, numerator: u64, denominator: u64, dividend: u64, price: u64, units_before: u64, sequence: u64, revision: u64, from_snapshot: vector<u8>, to_snapshot: vector<u8>, expires_at: u64, signature: vector<u8>, clock: &Clock) {
    let key = CorporateKey { event_id };
    assert!(!dynamic_field::exists(&account.id, key), EApplied);
    let now = clock::timestamp_ms(clock);
    assert!(event_id.length() == 32 && from_snapshot.length() == 32 && to_snapshot.length() == 32 && from_snapshot != to_snapshot, EQuote);
    assert!(kind <= 1 && effective_day <= now / 86400000 && expires_at > now && expires_at <= now + 120000, EQuote);
    assert!(sequence == account.sequence && revision == account.revision && numerator > 0 && denominator > 0 && numerator <= 1000000000 && denominator <= 1000000000 && price > 0, EQuote);
    let terms = CorporateTerms { domain: b"trove:corporate:v1", package_id: std::type_name::original_id<Account>(), account: object::id_address(account), event_id, symbol, kind, effective_day, numerator, denominator, dividend, price, units_before, sequence, revision, from_snapshot, to_snapshot, expires_at };
    assert!(ed25519::ed25519_verify(&signature, &account.attestor, &bcs::to_bytes(&terms)), ESignature);
    let mut index = 0;
    while (index < account.positions.length() && account.positions[index].symbol != symbol) { index = index + 1; };
    assert!(index < account.positions.length() && units_before > 0 && account.positions[index].units == units_before, EBalance);
    let position = &mut account.positions[index];
    let (cash_delta, cost_released) = if (kind == 0) {
        assert!(dividend == 0, EQuote);
        let scaled = (units_before as u128) * (numerator as u128);
        let remainder = scaled % (denominator as u128);
        position.units = (scaled / (denominator as u128)) as u64;
        let cash = (remainder * (price as u128) / ((denominator as u128) * SCALE)) as u64;
        let cost = ((position.cost as u128) * remainder / scaled) as u64;
        position.cost = position.cost - cost;
        (cash, cost)
    } else {
        assert!(numerator == 1 && denominator == 1 && dividend > 0, EQuote);
        (((units_before as u128) * (dividend as u128) / SCALE) as u64, 0)
    };
    let units_after = position.units;
    account.cash = account.cash + cash_delta; account.sequence = account.sequence + 1; account.approval = vector[];
    dynamic_field::add(&mut account.id, key, true);
    event::emit(CorporateApplied { account: object::id_address(account), event_id, symbol, kind, effective_day, units_before, units_after, cash_delta, cost_released, sequence: account.sequence, from_snapshot, to_snapshot });
}

public fun create(learner: address, attestor: vector<u8>, per_trade: u64, daily: u64, allowed: vector<vector<u8>>, ctx: &mut TxContext) {
    create_with_funds(learner, attestor, per_trade, daily, allowed, 1000000000, false, ctx);
}
public fun create_with_funds(learner: address, attestor: vector<u8>, per_trade: u64, daily: u64, allowed: vector<vector<u8>>, initial_cash: u64, paused: bool, ctx: &mut TxContext) {
    assert!(learner != ctx.sender() && learner != @0x0 && attestor.length() == 32, EAuthority);
    assert!(per_trade > 0 && daily >= per_trade && allowed.length() > 0 && allowed.length() <= 32, EPolicy);
    assert!(initial_cash >= 10000 && initial_cash <= 1000000000000000, EBalance);
    let account = Account {
        id: object::new(ctx), guardian: ctx.sender(), learner, attestor,
        cash: initial_cash, positions: vector[], per_trade, daily, paused,
        allowed, revision: 0, sequence: 0, day_spent: 0, spend_day: 0, approval: vector[],
    };
    event::emit(Created { account: object::id_address(&account), guardian: account.guardian, learner });
    transfer::share_object(account);
}
/// Guardian-issued simulated funds. Preserves holdings, spending, pause, and limits.
public fun fund(account: &mut Account, id: vector<u8>, amount: u64, sequence: u64, ctx: &TxContext) {
    assert!(ctx.sender() == account.guardian, EAuthority);
    assert!(id.length() == 16 && sequence == account.sequence, EQuote);
    let key = FundingKey { id };
    assert!(!dynamic_field::exists(&account.id, key), EApplied);
    assert!(amount >= 10000 && amount <= 1000000000000 && (account.cash as u128) + (amount as u128) <= 1000000000000000, EBalance);
    account.cash = account.cash + amount;
    account.sequence = account.sequence + 1;
    account.approval = vector[];
    dynamic_field::add(&mut account.id, key, true);
    event::emit(Funded { account: object::id_address(account), id, amount, cash: account.cash, sequence: account.sequence });
}
public fun policy(account: &mut Account, per_trade: u64, daily: u64, paused: bool, ctx: &TxContext) {
    assert!(ctx.sender() == account.guardian, EAuthority);
    assert!(per_trade > 0 && daily >= per_trade, EPolicy);
    account.per_trade = per_trade; account.daily = daily; account.paused = paused;
    account.revision = account.revision + 1; account.approval = vector[];
    event::emit(PolicyChanged { account: object::id_address(account), revision: account.revision, per_trade, daily, paused });
}
fun quote(account: &Account, symbol: vector<u8>, buy: bool, requested: u64, amount: u64, units: u64, price: u64, expires_at: u64, revision: u64, sequence: u64, market_day: u64, snapshot: vector<u8>, commitment: vector<u8>, nonce: vector<u8>): Quote {
    // A named-address literal remains 0x0 after publication. Derive the package
    // identity from the type so deployed signatures bind the actual package.
    Quote { domain: b"trove:practice:v1", package_id: std::type_name::original_id<Account>(), account: object::id_address(account), symbol, buy, requested, amount, units, price, expires_at, revision, sequence, market_day, snapshot, commitment, nonce }
}
fun validate(account: &Account, q: &Quote, signature: &vector<u8>, clock: &Clock) {
    let now = clock::timestamp_ms(clock);
    assert!(!account.paused && account.allowed.contains(&q.symbol), EPolicy);
    assert!(q.expires_at > now && q.expires_at <= now + 120000 && q.revision == account.revision && q.sequence == account.sequence, EQuote);
    assert!(q.market_day <= now / 86400000 && now / 86400000 - q.market_day <= 5, EQuote);
    assert!(q.units > 0 && q.price > 0 && q.requested > 0 && q.snapshot.length() == 32 && q.commitment.length() == 32 && q.nonce.length() == 16, EQuote);
    let product = (q.units as u128) * (q.price as u128);
    let expected = if (q.buy) { (product + SCALE - 1) / SCALE } else { product / SCALE };
    assert!(expected == (q.amount as u128) && q.amount <= q.requested, EQuote);
    // Also bind the integer units to the original dollar request; no dust inflation.
    assert!((q.units as u128) == (q.requested as u128) * SCALE / (q.price as u128), EQuote);
    assert!(ed25519::ed25519_verify(signature, &account.attestor, &bcs::to_bytes(q)), ESignature);
}
public fun approve(account: &mut Account, symbol: vector<u8>, buy: bool, requested: u64, amount: u64, units: u64, price: u64, expires_at: u64, revision: u64, sequence: u64, market_day: u64, snapshot: vector<u8>, commitment: vector<u8>, nonce: vector<u8>, signature: vector<u8>, clock: &Clock, ctx: &TxContext) {
    assert!(ctx.sender() == account.guardian, EAuthority);
    let q = quote(account, symbol, buy, requested, amount, units, price, expires_at, revision, sequence, market_day, snapshot, commitment, nonce);
    validate(account, &q, &signature, clock);
    account.approval = hash::blake2b256(&bcs::to_bytes(&q));
    event::emit(ApprovalGranted { account: object::id_address(account), quote_hash: account.approval });
}
public fun execute(account: &mut Account, symbol: vector<u8>, buy: bool, requested: u64, amount: u64, units: u64, price: u64, expires_at: u64, revision: u64, sequence: u64, market_day: u64, snapshot: vector<u8>, commitment: vector<u8>, nonce: vector<u8>, signature: vector<u8>, clock: &Clock, ctx: &TxContext) {
    assert!(ctx.sender() == account.learner, EAuthority);
    let q = quote(account, symbol, buy, requested, amount, units, price, expires_at, revision, sequence, market_day, snapshot, commitment, nonce);
    validate(account, &q, &signature, clock);
    let day = clock::timestamp_ms(clock) / 86400000;
    if (account.spend_day != day) { account.day_spent = 0; account.spend_day = day; };
    if (buy && (requested > account.per_trade || account.day_spent + amount > account.daily)) {
        assert!(account.approval == hash::blake2b256(&bcs::to_bytes(&q)), EApproval);
    };
    let mut index = 0;
    while (index < account.positions.length() && account.positions[index].symbol != q.symbol) { index = index + 1; };
    if (buy) {
        assert!(account.cash >= amount, EBalance);
        account.cash = account.cash - amount; account.day_spent = account.day_spent + amount;
        if (index == account.positions.length()) { account.positions.push_back(Position { symbol: q.symbol, units: 0, cost: 0 }); };
        let position = &mut account.positions[index];
        position.units = position.units + units; position.cost = position.cost + amount;
    } else {
        assert!(index < account.positions.length(), EBalance);
        let position = &mut account.positions[index];
        assert!(position.units >= units, EBalance);
        let released = ((position.cost as u128) * (units as u128) / (position.units as u128)) as u64;
        position.units = position.units - units; position.cost = position.cost - released;
        account.cash = account.cash + amount;
    };
    // Cleared on every trade: approval cannot follow a changed account or be reused.
    account.approval = vector[]; account.sequence = account.sequence + 1;
    event::emit(Executed {
        account: object::id_address(account), nonce: q.nonce, symbol: q.symbol, buy,
        amount, units, price, sequence: account.sequence, revision: account.revision,
        cash: account.cash, day_spent: account.day_spent, spend_day: account.spend_day,
        commitment: q.commitment, snapshot: q.snapshot,
    });
}

#[test_only]
public fun cash(account: &Account): u64 { account.cash }
#[test_only]
public fun revision(account: &Account): u64 { account.revision }
#[test_only]
public fun position(account: &Account): (u64, u64) { (account.positions[0].units, account.positions[0].cost) }
#[test_only]
public fun spent(account: &Account): u64 { account.day_spent }
