#[test_only]
module trove::enrollment_fixtures;
// Public test-only signatures: Ed25519 seed [7;32], EnrollmentTermsBcs.
public fun valid(): vector<u8> { x"e0eeeebd20235fa1b7991fb4dcc1d95be4f39da7945602de3421fc73fe460262033234e9c8cd67dc8c808e67ec3600ad9aa4b46a4168882b86e69fbc9d2e0807" }
public fun wrong_account(): vector<u8> { x"06f713f0c1f34d199d5144b8eb3b69ef7fe2ba41990b6b469f7372adcda1447e43da7a0b04d82435e5970f9b2cc4b03cd87389bb3464a18b995effd297615a0c" }
public fun wrong_guardian(): vector<u8> { x"2a9af85185ed8e4cbdd8daf2e5c4f0d95cd1691b032e658801e735dbe66b076c8a5d8370966afae73584f11c4cbedf4f29039fb73d06fd48beb4bebcf8174809" }
public fun wrong_package(): vector<u8> { x"fb5c03244b59c5f549df2ec68aa5b60e75d411305bc32e7a48a2b9758af4fd7c828609fb7e34f143aecb8b69b53cd95a1eac43536e707b3d49d5956f814f5604" }
public fun wrong_domain(): vector<u8> { x"dbcb9febea516ae427184a926a8eb7eb10b80934b08ba95a360a81504f2ae51e31ca29abf40802e649350383f2a33d57ac0e46437a0eca64798257393640200e" }
