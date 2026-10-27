#[test_only]
module trove::authority_tests;
use trove::practice::{Self, Account};
use sui::test_scenario;

#[test]
fun guardian_controls_policy() {
    let mut scenario = test_scenario::begin(@0xA);
    practice::create(@0xB, vector[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], 100000000, 300000000, vector[b"AAPL"], scenario.ctx());
    scenario.next_tx(@0xA);
    let mut account = scenario.take_shared<Account>();
    assert!(practice::cash(&account) == 1000000000);
    practice::policy(&mut account, 50000000, 100000000, true, scenario.ctx());
    assert!(practice::revision(&account) == 1);
    test_scenario::return_shared(account); scenario.end();
}
#[test, expected_failure(abort_code = 1, location = trove::practice)]
fun learner_cannot_raise_limits() {
    let mut scenario = test_scenario::begin(@0xA);
    practice::create(@0xB, vector[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31], 100000000, 300000000, vector[b"AAPL"], scenario.ctx());
    scenario.next_tx(@0xB);
    let mut account = scenario.take_shared<Account>();
    practice::policy(&mut account, 500000000, 900000000, false, scenario.ctx());
    test_scenario::return_shared(account); scenario.end();
}
