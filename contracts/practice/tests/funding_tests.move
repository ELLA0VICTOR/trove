#[test_only]
module trove::funding_tests;
use trove::practice::{Self, Account};
use trove::quote_fixtures as signatures;
use sui::test_scenario::{Self, Scenario};

fun setup(capital: u64): Scenario {
    let mut s = test_scenario::begin(@0xA);
    practice::create_with_funds(@0xB, signatures::public_key(), 100000000, 300000000, vector[b"AAPL"], capital, false, s.ctx());
    s.next_tx(@0xA); s
}
fun id(): vector<u8> { vector[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16] }
#[test]
fun guardian_can_choose_higher_starting_capital_and_replenish() {
    let mut s = setup(5000000000); let mut a = s.take_shared<Account>();
    assert!(practice::cash(&a) == 5000000000);
    practice::policy(&mut a, 100000000, 300000000, true, s.ctx());
    practice::fund(&mut a, id(), 250000000, 0, s.ctx());
    assert!(practice::cash(&a) == 5250000000 && practice::revision(&a) == 1 && practice::spent(&a) == 0);
    test_scenario::return_shared(a); s.end();
}
#[test, expected_failure(abort_code=1, location=trove::practice)]
fun learner_cannot_replenish_cash() {
    let mut s = setup(1000000000); s.next_tx(@0xB); let mut a = s.take_shared<Account>();
    practice::fund(&mut a, id(), 1000000000, 0, s.ctx());
    test_scenario::return_shared(a); s.end();
}
#[test, expected_failure(abort_code=7, location=trove::practice)]
fun funding_id_is_single_use_even_with_a_fresh_sequence() {
    let mut s = setup(1000000000); let mut a = s.take_shared<Account>();
    practice::fund(&mut a, id(), 1000000000, 0, s.ctx());
    practice::fund(&mut a, id(), 1000000000, 1, s.ctx());
    test_scenario::return_shared(a); s.end();
}
#[test, expected_failure(abort_code=3, location=trove::practice)]
fun stale_funding_sequence_is_rejected() {
    let mut s = setup(1000000000); let mut a = s.take_shared<Account>();
    practice::fund(&mut a, id(), 1000000000, 99, s.ctx());
    test_scenario::return_shared(a); s.end();
}
#[test, expected_failure(abort_code=4, location=trove::practice)]
fun zero_funding_is_rejected() {
    let mut s = setup(1000000000); let mut a = s.take_shared<Account>();
    practice::fund(&mut a, id(), 0, 0, s.ctx());
    test_scenario::return_shared(a); s.end();
}
#[test, expected_failure(abort_code=4, location=trove::practice)]
fun excessive_funding_is_rejected() {
    let mut s = setup(1000000000); let mut a = s.take_shared<Account>();
    practice::fund(&mut a, id(), 1000000000001, 0, s.ctx());
    test_scenario::return_shared(a); s.end();
}
