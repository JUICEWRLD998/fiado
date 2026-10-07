# CLAIMS

Every claim in the README maps to a command anyone can run, and the output it must produce.

| # | Claim | Command | Expected output |
|---|---|---|---|
| 1 | A purchase over the credit limit is refused by the network | `npm run spike` | `PASS  buy 2500 more -> over the limit` with `op_line_full` |
| 2 | The shop cannot create a debt without the customer's signature | `npm run spike` | `PASS  shop forges a purchase without customer signature` with `op_bad_auth` |
| 3 | A shop the customer never authorized cannot hold the customer's debt | `npm run spike` | `PASS  customer pays the unauthorized stranger` with `op_not_authorized` |
| 4 | A repayment burns the debt | `npm run spike` | `PASS  shop FIADO balance after cash repay`, `2000.0000000` |
| 5 | A dollar repayment and the burn happen in one transaction, or not at all | `npm run spike` | `PASS  atomic repay with insufficient TUSD -> whole tx reverts`, balance stays `500.0000000` |
| 6 | The customer never holds or spends XLM | `npm run spike` | `PASS  customer still holds 0 XLM at the end` |
| 7 | The typed chain layer reproduces every spike result, including each refusal | `npm run test:testnet` | `Tests  11 passed (11)`, with a testnet explorer link per step |
| 8 | Builders put every operation in the right order, with the right signer, asset and memo | `npm test` | `Tests  22 passed (22)` (20 chain-layer tests + 2 testnet-only guard tests) |
| 9 | The shop's book and the customer's record are exact arithmetic over real Horizon feeds, and a look-alike FIADO from another issuer is ignored | `npm test` | all `src/book` tests pass (parsed from a real captured feed, `tests/fixtures/lifecycle.json`) |
| 10 | A history can be exported with its signed envelopes and verified offline; tampering is caught | `npm run export -- <G... account>` then `npm run export -- --verify exports/<G...>.json` | `verified every signature offline: OK`; a swapped or signature-stripped envelope exits 1 |
| 11 | Each phone rebuilds and compares what it is asked to sign; any extra, missing or altered operation is refused | `npm test` | all `src/handoff/verify.test.ts` cases pass (25 hostile cases) |
| 12 | A passkey becomes a stable Stellar key (RFC 5869 HKDF), different for shop and customer | `npm test` | `src/passkey/derive.test.ts` passes, including the RFC test vectors and a pinned known answer |
| 13 | The whole thin path works in two real browsers: join, purchase, an over-limit purchase REFUSED by the network, cash repayment | `npx playwright test thin-path` | `1 passed`; prints a stellar.expert link per step, including the refused transaction |
| 14 | Every claim on `/how` matches the ledger: the join transaction, the customer-signed fee-bumped purchase, the refusal (`op_line_full`), the cash repayment, and the customer account. The checker proves it is not blind by catching a planted wrong claim and a planted wrong result code | `npm run check:proof` | `PASS` for the two planted controls and every claim, ending `every claim on /how matches the Stellar test network` |
| 15 | A shop's evidence counts (customers, purchases, repayments, write-offs, and purchases refused at the limit) are exact counts over its public feed, and a failed payment for any other reason, in the wrong direction, or with a look-alike asset is not counted as a refusal | `npm test` | `src/book/evidence.test.ts` passes (9 tests, on a real captured feed that includes the refused transaction `d04d5789…`) |
| 16 | `/evidence` lists only registered shops with a consent date, and shows no numbers while none is registered | `npm test` then `npx playwright test phase8 --project=desktop` | `src/evidence/registry.test.ts` passes; the e2e test finds the empty state and no counts |
| 17 | The practice shop at `/try` is reachable in one click, labelled Demo from the first moment, and its refusal is the network's own: a real failed transaction on Horizon, nothing added to the tab, and the shop (not the customer) paid the fee on the purchase | `npx playwright test phase8 --project=desktop` | `4 passed`; the test reads the refused and the successful transaction back from Horizon |
