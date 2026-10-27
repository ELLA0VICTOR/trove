#[test_only]
module trove::execution_tests;
use trove::practice::{Self, Account};
use trove::quote_fixtures as signatures;
use sui::clock::{Self, Clock};
use sui::test_scenario::{Self, Scenario};

fun setup(per_trade: u64, daily: u64): (Scenario, Clock) {
    let mut s = test_scenario::begin(@0xA);
    practice::create(@0xB, signatures::public_key(), per_trade, daily, vector[b"AAPL"], s.ctx());
    s.next_tx(@0xB);
    let mut clock = clock::create_for_testing(s.ctx()); clock::set_for_testing(&mut clock, 1000);
    (s, clock)
}
fun vectors(): (vector<u8>, vector<u8>, vector<u8>) {
    (vector[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], vector[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1], vector[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2])
}
fun order(a: &mut Account, clock: &Clock, buy: bool, amount: u64, sequence: u64, signature: vector<u8>, ctx: &TxContext) {
    let (snapshot, commitment, nonce) = vectors();
    practice::execute(a, b"AAPL", buy, amount, amount, amount, 100000000, 90000, 0, sequence, 0, snapshot, commitment, nonce, signature, clock, ctx);
}
fun approve(a: &mut Account, clock: &Clock, ctx: &TxContext) {
    let (snapshot, commitment, nonce) = vectors();
    practice::approve(a, b"AAPL", true, 25000000, 25000000, 25000000, 100000000, 90000, 0, 0, 0, snapshot, commitment, nonce, signatures::buy25(), clock, ctx);
}
fun end(s: Scenario, a: Account, clock: Clock) { test_scenario::return_shared(a); clock::destroy_for_testing(clock); s.end(); }

#[test]
fun signed_buy_uses_exact_integer_accounting() {
    let (mut s, clock) = setup(100000000, 300000000); let mut a = s.take_shared<Account>();
    order(&mut a, &clock, true, 25000000, 0, signatures::buy25(), s.ctx());
    assert!(practice::cash(&a) == 975000000); end(s, a, clock);
}
#[test, expected_failure(abort_code=5, location=trove::practice)]
fun over_limit_needs_exact_guardian_approval() {
    let (mut s, clock) = setup(10000000, 20000000); let mut a = s.take_shared<Account>();
    order(&mut a, &clock, true, 25000000, 0, signatures::buy25(), s.ctx()); end(s, a, clock);
}
#[test]
fun guardian_approval_bypasses_only_limits_for_one_order() {
    let (mut s, clock) = setup(10000000, 20000000); s.next_tx(@0xA); let mut a = s.take_shared<Account>();
    approve(&mut a, &clock, s.ctx()); test_scenario::return_shared(a); s.next_tx(@0xB); a = s.take_shared<Account>();
    order(&mut a, &clock, true, 25000000, 0, signatures::buy25(), s.ctx()); assert!(practice::cash(&a) == 975000000); end(s, a, clock);
}
#[test, expected_failure(abort_code=1, location=trove::practice)]
fun learner_cannot_approve_self() {
    let (mut s, clock) = setup(10000000, 20000000); let mut a = s.take_shared<Account>(); approve(&mut a, &clock, s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=1, location=trove::practice)]
fun guardian_cannot_execute_learner_order() {
    let (mut s, clock) = setup(100000000, 300000000); s.next_tx(@0xA); let mut a = s.take_shared<Account>();
    order(&mut a, &clock, true, 25000000, 0, signatures::buy25(), s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=3, location=trove::practice)]
fun replayed_quote_fails_sequence_check() {
    let (mut s, clock) = setup(100000000, 300000000); let mut a = s.take_shared<Account>();
    order(&mut a, &clock, true, 25000000, 0, signatures::buy25(), s.ctx());
    order(&mut a, &clock, true, 25000000, 0, signatures::buy25(), s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=6, location=trove::practice)]
fun tampered_amount_rejects_original_signature() {
    let (mut s, clock) = setup(100000000, 300000000); let mut a = s.take_shared<Account>();
    order(&mut a, &clock, true, 26000000, 0, signatures::buy25(), s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=3, location=trove::practice)]
fun expired_quote_cannot_execute() {
    let (mut s, mut clock) = setup(100000000, 300000000); clock::set_for_testing(&mut clock, 90000); let mut a = s.take_shared<Account>();
    order(&mut a, &clock, true, 25000000, 0, signatures::buy25(), s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=2, location=trove::practice)]
fun approval_cannot_override_pause() {
    let (mut s, clock) = setup(10000000, 20000000); s.next_tx(@0xA); let mut a = s.take_shared<Account>();
    approve(&mut a, &clock, s.ctx()); practice::policy(&mut a, 10000000, 20000000, true, s.ctx()); test_scenario::return_shared(a); s.next_tx(@0xB); a=s.take_shared<Account>();
    order(&mut a, &clock, true, 25000000, 0, signatures::buy25(), s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=4, location=trove::practice)]
fun valid_signature_cannot_overspend_cash() {
    let (mut s, clock) = setup(2000000000, 3000000000); let mut a = s.take_shared<Account>();
    order(&mut a, &clock, true, 1500000000, 0, signatures::buy1500(), s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=4, location=trove::practice)]
fun cannot_sell_unowned_shares() {
    let (mut s, clock) = setup(100000000, 300000000); let mut a = s.take_shared<Account>();
    order(&mut a, &clock, false, 25000000, 0, signatures::sell25(), s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=5, location=trove::practice)]
fun selling_does_not_replenish_daily_buy_allowance() {
    let (mut s, clock) = setup(25000000, 25000000); let mut a = s.take_shared<Account>();
    order(&mut a, &clock, true, 25000000, 0, signatures::buy25(), s.ctx());
    order(&mut a, &clock, false, 25000000, 1, signatures::sell25seq1(), s.ctx());
    assert!(practice::cash(&a) == 1000000000);
    order(&mut a, &clock, true, 25000000, 2, signatures::buy25seq2(), s.ctx()); end(s, a, clock);
}

#[test]
fun replenishing_preserves_positions_and_already_used_daily_allowance() {
    let (mut s, clock) = setup(25000000, 25000000); let mut a = s.take_shared<Account>();
    order(&mut a, &clock, true, 25000000, 0, signatures::buy25(), s.ctx());
    let (before_units, before_cost) = practice::position(&a);
    test_scenario::return_shared(a); s.next_tx(@0xA); a = s.take_shared<Account>();
    practice::fund(&mut a, vector[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], 1000000000, 1, s.ctx());
    let (units, cost) = practice::position(&a);
    assert!(practice::spent(&a) == 25000000 && units == before_units && cost == before_cost && practice::cash(&a) == 1975000000);
    end(s, a, clock);
}
#[test, expected_failure(abort_code=5, location=trove::practice)]
fun replenishing_does_not_restore_daily_buy_allowance() {
    let (mut s, clock) = setup(25000000, 25000000); let mut a = s.take_shared<Account>();
    order(&mut a, &clock, true, 25000000, 0, signatures::buy25(), s.ctx());
    test_scenario::return_shared(a); s.next_tx(@0xA); a = s.take_shared<Account>();
    practice::fund(&mut a, vector[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16], 1000000000, 1, s.ctx());
    test_scenario::return_shared(a); s.next_tx(@0xB); a = s.take_shared<Account>();
    order(&mut a, &clock, true, 25000000, 2, signatures::buy25seq2(), s.ctx()); end(s, a, clock);
}
