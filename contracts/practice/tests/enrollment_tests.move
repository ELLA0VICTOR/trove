#[test_only]
module trove::enrollment_tests;
use trove::practice::{Self, Account};
use trove::quote_fixtures as quotes;
use trove::enrollment_fixtures as signatures;
use sui::clock::{Self, Clock};
use sui::test_scenario::{Self, Scenario};

fun setup(): (Scenario, Clock) {
    let mut s = test_scenario::begin(@0xA);
    practice::create_family(quotes::public_key(), 100000000, 300000000, vector[b"AAPL"], 1000000000, false, s.ctx());
    s.next_tx(@0xB);
    let mut clock = clock::create_for_testing(s.ctx()); clock::set_for_testing(&mut clock, 1000);
    (s, clock)
}
fun nonce(): vector<u8> { vector[3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3] }
fun end(s: Scenario, a: Account, clock: Clock) { test_scenario::return_shared(a); clock::destroy_for_testing(clock); s.end(); }

#[test]
fun parent_activates_and_funds_before_learner_connects_then_learner_trades() {
    let (mut s, clock) = setup(); s.next_tx(@0xA); let mut a = s.take_shared<Account>();
    assert!(practice::learner(&a) == @0x0 && practice::cash(&a) == 1000000000);
    practice::fund(&mut a, nonce(), 500000000, 0, s.ctx());
    test_scenario::return_shared(a); s.next_tx(@0xB); a = s.take_shared<Account>();
    practice::enroll(&mut a, 90000, nonce(), signatures::valid(), &clock, s.ctx());
    assert!(practice::learner(&a) == @0xB && practice::cash(&a) == 1500000000 && practice::revision(&a) == 0);
    practice::execute(&mut a, b"AAPL", true, 25000000, 25000000, 25000000, 100000000, 90000, 0, 2, 0,
      vector[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      vector[1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      vector[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2], quotes::buy25seq2(), &clock, s.ctx());
    assert!(practice::cash(&a) == 1475000000); end(s, a, clock);
}
#[test]
fun enrollment_preserves_parent_policy() {
    let (mut s, clock) = setup(); s.next_tx(@0xA); let mut a = s.take_shared<Account>();
    practice::policy(&mut a, 50000000, 200000000, true, s.ctx());
    test_scenario::return_shared(a); s.next_tx(@0xB); a = s.take_shared<Account>();
    practice::enroll(&mut a, 90000, nonce(), signatures::valid(), &clock, s.ctx());
    assert!(practice::cash(&a) == 1000000000 && practice::revision(&a) == 1 && practice::spent(&a) == 0);
    end(s, a, clock);
}
#[test, expected_failure(abort_code=6, location=trove::practice)]
fun another_wallet_cannot_claim_the_invited_learners_enrollment() {
    let (mut s, clock) = setup(); s.next_tx(@0xC); let mut a = s.take_shared<Account>();
    practice::enroll(&mut a, 90000, nonce(), signatures::valid(), &clock, s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=1, location=trove::practice)]
fun parent_cannot_enroll_as_learner() {
    let (mut s, clock) = setup(); s.next_tx(@0xA); let mut a = s.take_shared<Account>();
    practice::enroll(&mut a, 90000, nonce(), signatures::valid(), &clock, s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=3, location=trove::practice)]
fun expired_enrollment_is_rejected() {
    let (mut s, mut clock) = setup(); clock::set_for_testing(&mut clock, 90000); let mut a = s.take_shared<Account>();
    practice::enroll(&mut a, 90000, nonce(), signatures::valid(), &clock, s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=6, location=trove::practice)]
fun enrollment_is_bound_to_the_exact_portfolio() {
    let (mut s, clock) = setup(); let mut a = s.take_shared<Account>();
    practice::enroll(&mut a, 90000, nonce(), signatures::wrong_account(), &clock, s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=6, location=trove::practice)]
fun enrollment_is_bound_to_the_guardian() {
    let (mut s, clock) = setup(); let mut a = s.take_shared<Account>();
    practice::enroll(&mut a, 90000, nonce(), signatures::wrong_guardian(), &clock, s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=6, location=trove::practice)]
fun enrollment_is_bound_to_the_package() {
    let (mut s, clock) = setup(); let mut a = s.take_shared<Account>();
    practice::enroll(&mut a, 90000, nonce(), signatures::wrong_package(), &clock, s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=6, location=trove::practice)]
fun enrollment_is_bound_to_the_application_domain() {
    let (mut s, clock) = setup(); let mut a = s.take_shared<Account>();
    practice::enroll(&mut a, 90000, nonce(), signatures::wrong_domain(), &clock, s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=1, location=trove::practice)]
fun enrollment_is_one_time() {
    let (mut s, clock) = setup(); let mut a = s.take_shared<Account>();
    practice::enroll(&mut a, 90000, nonce(), signatures::valid(), &clock, s.ctx());
    practice::enroll(&mut a, 90000, nonce(), signatures::valid(), &clock, s.ctx()); end(s, a, clock);
}
#[test, expected_failure(abort_code=1, location=trove::practice)]
fun existing_bound_accounts_cannot_change_learner() {
    let mut s = test_scenario::begin(@0xA);
    practice::create(@0xB, quotes::public_key(), 100000000, 300000000, vector[b"AAPL"], s.ctx());
    s.next_tx(@0xC); let clock = clock::create_for_testing(s.ctx()); let mut a = s.take_shared<Account>();
    practice::enroll(&mut a, 90000, nonce(), signatures::valid(), &clock, s.ctx()); end(s, a, clock);
}
