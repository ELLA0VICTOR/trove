#[test_only]
module trove::corporate_tests;
use trove::practice::{Self, Account};
use trove::quote_fixtures as signatures;
use sui::clock::{Self, Clock};
use sui::test_scenario::{Self, Scenario};
fun repeated(byte: u8, count: u64): vector<u8> { let mut v=vector[];let mut n=0u64;while (n < count) {v.push_back(byte);n=n+1;};v }
fun setup(): (Scenario, Clock) {
    let mut s=test_scenario::begin(@0xA);
    practice::create(@0xB,signatures::public_key(),100000000,300000000,vector[b"AAPL"],s.ctx());s.next_tx(@0xB);
    let mut clock=clock::create_for_testing(s.ctx());clock::set_for_testing(&mut clock,1000);
    let mut account=s.take_shared<Account>();
    practice::execute(&mut account,b"AAPL",true,25000000,25000000,25000000,100000000,90000,0,0,0,repeated(0,32),repeated(1,32),repeated(2,16),signatures::buy25(),&clock,s.ctx());
    test_scenario::return_shared(account);s.next_tx(@0xC);(s,clock)
}
fun adjust(account:&mut Account,clock:&Clock,kind:u8,n:u64,d:u64,dividend:u64,price:u64,units:u64,seq:u64,rev:u64,id:u8,sig:vector<u8>) {
    practice::adjust(account,repeated(id,32),b"AAPL",kind,0,n,d,dividend,price,units,seq,rev,repeated(0,32),repeated(3,32),90000,sig,clock);
}
fun finish(s:Scenario,a:Account,c:Clock){test_scenario::return_shared(a);clock::destroy_for_testing(c);s.end();}
#[test]
fun signed_split_and_dividend_post_without_changing_permission() {
    let (mut s,c)=setup();let mut a=s.take_shared<Account>();
    adjust(&mut a,&c,0,2,1,0,50000000,25000000,1,0,4,signatures::split2());
    let (units,cost)=practice::position(&a);assert!(units==50000000&&cost==25000000);assert!(practice::cash(&a)==975000000);
    adjust(&mut a,&c,1,1,1,1000000,50000000,50000000,2,0,5,signatures::dividend50());
    assert!(practice::cash(&a)==975500000);assert!(practice::spent(&a)==25000000);assert!(practice::revision(&a)==0);finish(s,a,c);
}
#[test]
fun reverse_split_remainder_has_cash_and_cost_basis_entries() {
    let (mut s,c)=setup();let mut a=s.take_shared<Account>();
    adjust(&mut a,&c,0,1,3,0,300000000,25000000,1,0,4,signatures::reverse3());
    let (units,cost)=practice::position(&a);assert!(units==8333333&&cost==24999999);assert!(practice::cash(&a)==975000001);finish(s,a,c);
}
#[test,expected_failure(abort_code=7,location=trove::practice)]
fun same_event_cannot_be_applied_again_at_a_new_sequence() {
    let (mut s,c)=setup();let mut a=s.take_shared<Account>();
    adjust(&mut a,&c,0,2,1,0,50000000,25000000,1,0,4,signatures::split2());
    adjust(&mut a,&c,0,2,1,0,50000000,50000000,2,0,4,signatures::replaySplit());finish(s,a,c);
}
#[test,expected_failure(abort_code=6,location=trove::practice)]
fun changing_the_split_ratio_invalidates_the_attestation() {
    let (mut s,c)=setup();let mut a=s.take_shared<Account>();
    adjust(&mut a,&c,0,3,1,0,50000000,25000000,1,0,4,signatures::split2());finish(s,a,c);
}
#[test,expected_failure(abort_code=6,location=trove::practice)]
fun changing_the_dividend_rate_invalidates_the_attestation() {
    let (mut s,c)=setup();let mut a=s.take_shared<Account>();
    adjust(&mut a,&c,1,1,1,2000000,50000000,25000000,1,0,4,signatures::dividend25());finish(s,a,c);
}
#[test]
fun paused_investing_still_receives_passive_book_entries() {
    let (mut s,c)=setup();s.next_tx(@0xA);let mut a=s.take_shared<Account>();practice::policy(&mut a,100000000,300000000,true,s.ctx());
    adjust(&mut a,&c,0,2,1,0,50000000,25000000,1,1,4,signatures::pausedSplit());
    let (units,_)=practice::position(&a);assert!(units==50000000);assert!(practice::spent(&a)==25000000);finish(s,a,c);
}
#[test,expected_failure(abort_code=3,location=trove::practice)]
fun expired_corporate_entries_are_rejected() {
    let (mut s,mut c)=setup();clock::set_for_testing(&mut c,90000);let mut a=s.take_shared<Account>();
    adjust(&mut a,&c,0,2,1,0,50000000,25000000,1,0,4,signatures::split2());finish(s,a,c);
}
