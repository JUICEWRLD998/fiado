# DECISIONS

Newest first. Every entry carries the measurement that justified it.

## 2026-10-06 — Passkey keys via WebAuthn PRF: probe ready, phones pending

**Decision:** derive each user's ed25519 Stellar key from a passkey's PRF output (32 bytes). Fallback: a device-stored key plus a printed recovery card, chosen only if real phones fail the probe.
**Measurement:** `probes/prf.html`, driven in headless Chrome through a CDP virtual authenticator. PRF on → 32 bytes, with the same fingerprint (`97c3018c`) on two reads, so the derived key is stable. PRF off → no result, and the probe reports FAIL. Both controls behave, so the probe can be trusted on real phones. **Real Android and iOS 18+ results are still open.**

## 2026-10-06 — Testnet is safe to build and judge on

**Decision:** build and demo on testnet with no reset contingency beyond the planned envelope export.
**Measurement:** no testnet reset is announced for October 2026. The last testnet event was Protocol 28 on 2026-08-27 (developers.stellar.org/docs/networks/software-versions). Resets are announced at least two weeks ahead, so none can land before judging (Oct 13-16) unannounced. Re-check on 2026-10-09.

## 2026-10-06 — The credit line is a trustline limit (spike: 21/21 on testnet)

**Decision:** build Fiado on classic Stellar IOU semantics, with no smart contract:

- The customer's account issues `FIADO`.
- The shop's trustline limit to that asset is the credit limit.
- A purchase on credit is a payment of `FIADO` that the customer signs.
- A repayment is the shop returning `FIADO` to the issuer, which burns it.

**Measurement:** `node scripts/spike.mjs`, run 2026-10-06T12:44:12Z on testnet. Full log: `docs/spike/2026-10-06.json`.
Accounts: shop `GDLNK6ZV…55KB`, customer `GCEOXIZ4…DQE22`.

| Step | Expected | Result | Tx |
|---|---|---|---|
| Shop sponsors the customer's account (0 XLM) and the customer sets `AUTH_REQUIRED` | ok | ok, customer balance `0.0000000` | `ac785894…2272` |
| Shop trustline limit 5,000 + customer authorizes it, one tx | ok | ok | `135dfb4a…b668` |
| Customer buys 3,000 on credit, fee-bumped by the shop | ok | ok | `3ad039e2…ee0a` |
| **Customer buys 2,500 more (5,500 > 5,000)** | refused | **`op_line_full`, on ledger 5053398, `successful: false`** | `1fda65a5…75ea` |
| Shop submits a purchase without the customer's signature | refused | `op_bad_auth`, rejected at submission (never reaches the ledger; Horizon 404) | (none) |
| Customer pays a shop it never authorized | refused | `op_not_authorized`, on ledger 5053401 | `3ef19edf…838b` |
| Cash repay: shop returns 1,000 to the issuer | ok, balance 2,000 | ok, `2000.0000000` | `606da392…5163` |
| Atomic repay: customer pays 1 TUSD and shop burns 1,500 FIADO, one tx | ok | ok | `a92071b9…2e10` |
| Atomic repay whose dollar leg is short (5 TUSD asked, 1 held) | whole tx reverts | `op_underfunded` + `op_success`, tx failed; the burn did not happen (balance stayed 500) | `09d610d8…9fc9` |
| Lower the limit to 100 while 500 is owed | refused | `op_invalid_limit` | `8a4a9394…7066` |
| Repay the last 500, then close (limit 0 removes the trustline) | ok | ok | `6eff8c4c…c0e2`, `ad57a03c…8708` |
| Buy at a closed line | refused | `op_no_trust` | `b05786d2…b1da` |
| Customer XLM balance at the end | `0.0000000` | `0.0000000` | (none) |

**Design consequences (each one now a rule for Phase 2):**
1. **The over-limit refusal is a real failed transaction on the ledger.** It is linkable on stellar.expert. This is the demo's signature moment, and it is not simulated.
2. **The shop cannot forge debt.** Without the customer's signature the network rejects the tx before the ledger. The UI says "only you can add to your tab".
3. **A limit cannot be cut below the open debt** (`op_invalid_limit`). The UI only offers limits ≥ the current balance, and says why.
4. **A line can only close at zero.** "Close" therefore means "settle, then close". Forgiving a debt is a repayment with the memo `forgiven`.
5. **The customer never holds XLM.** The shop sponsors the account and the trustline reserves, and fee-bumps every customer-sourced tx. The customer's fees are charged to the shop.
6. **The dollar repayment is truly atomic.** The negative control proves a short dollar leg cancels the burn.

**Correction marked in place:** the first run predicted `tx_bad_auth` for the forged purchase. The network answered `op_bad_auth`. The refusal is the same; only the code differs. The expectation was fixed in the script (commit `44c3f3d`).
