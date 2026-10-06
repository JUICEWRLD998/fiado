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
