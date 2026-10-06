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
