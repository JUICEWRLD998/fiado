# DECISIONS

Newest first. Every entry carries the measurement that justified it.

## 2026-10-09 — Phase 9: three real shopkeepers, notebook figures

Three Lagos shopkeepers (Amina, Emeka, Chinedu) gave written consent on 2026-10-08 to be named by first name and city on /evidence, with customer names and phone numbers kept private. The consent forms in hand carry form dates of 06/10, 07/10 and 08/10 and blank "date consent was given" lines; he confirmed all three consented on 2026-10-08.

**Decisions:**
1. **Notebook figures sit in their own labelled block**, `src/evidence/paper.ts`, never in the live counts. Their activity was recorded in paper notebooks, so it is not on the Stellar ledger and the page says so. The live registry (`registry.ts`) stays empty: it needs each shop's public key, which exists only after the shop joins on testnet.
2. **Totals are computed from the per-day log**, not typed. A test pins them to the shopkeepers' combined table: 6 credit purchases, 3 repayments, 3 refusals, ₦15,500 issued, ₦6,500 repaid, ₦9,000 outstanding. A planted bad entry must be rejected.
3. **Amounts are shown for this block only**, because all three shops are in Lagos and write in naira. Live counts stay counts-only.
4. **No customer names or phones exist in the data file.**

5. **Handoff store: Neon Postgres added** (`NeonStore` in `src/handoff/store.ts`). He connected a Vercel Neon database, which sets `DATABASE_URL` (or `POSTGRES_URL`), and the code ignored it, so a deploy would have silently fallen back to in-memory. Order now: Upstash variables, else Neon, else memory. One table `fiado_handoff(key, value, expires_at)`; write-once is one atomic `INSERT ... ON CONFLICT DO UPDATE ... WHERE expires_at <= now() RETURNING`. Tested against a fake SQL runner (statements, retry after a failed table create, planted "live key returns false" control); **not yet run against a live Neon**. No `.env` is committed; Vercel injects the variables at deploy time.

**Not done:** on-chain lines for the three shops (they have not run their books on Fiado yet), the consented video, and the deployed-URL check. Exit evidence for Phase 9 (2+ non-team shops with real lines on the ledger) is NOT met.

## 2026-10-07 — Phase 8: proof pages and the practice shop

**Measurement:** `npm run check:proof` (6 claims against live Horizon, two planted controls caught), `npx vitest run` (235 pass), `npx playwright test phase8 --project=desktop` (4 pass on live testnet, 2.1 min), `node design/verify/phase8.mjs` (/how, /evidence, /try at 8 widths x 2 schemes: no overflow, no tap target under 24px, no unexpected console error, planted overflow control registered). With the registry temporarily pointed at a known test shop, `/evidence` rendered 2 customers, 2 purchases, 1 refusal, 0 repayments, equal to the captured Horizon feed (registry reverted to empty before commit).

**Decisions:**
1. **/evidence is registry-driven and starts empty.** A shop is shown only if `src/evidence/registry.ts` holds an entry with a first name, city and consent date; an invalid entry fails the build. No shopkeeper has consented yet, so the page says so and shows no numbers. It is filled in Phase 9.
2. **Refusals are counted from failed transactions** (`include_failed=true`), and only when the transaction's own result says line-full. A planted control caught a real bug while writing this: the first decoder swallowed an SDK shape error and returned false for everything.
3. **The practice shop ("judge mode") is real, not a mock.** `/try` creates a fresh shop and two customers on testnet in the visitor's tab (keys in memory only, funded by the existing /api/fund), then every purchase, refusal and repayment is a genuine transaction. It is labelled Demo on every row and is never listed on /evidence. Keys are never shipped in the bundle.
4. **/how claims are data** (`src/proof/claims.ts`) checked by script, so the page cannot drift from the ledger. The "shop cannot forge a debt" claim has no ledger entry (the network rejects it before recording), so it points at `npm run spike` and says why.
5. **The proof links live in the footer of every page**, so the header stays two links wide at 320px.

**Not done in this phase:** the deployed-URL check from a clean browser (nothing is deployed yet; Vercel and the handoff Redis are untested live).

## 2026-10-06 — Phases 3-5: the thin path works end to end, in two real browsers, on testnet

**Measurement:** `npx playwright test thin-path` (desktop shop + phone-sized customer, each with its own virtual passkey authenticator with PRF), run twice against live testnet, both green (1.3 and 1.5 min). Each run uses brand-new accounts. Checked against the ledger, not just the UI. Run 1:

| Step | Result | Tx |
|---|---|---|
| Join: sponsored 0-XLM account + on-chain name + trustline limit 10,000 + authorization, one tx | success, 7 ops | `d5970fc2…fb3a` |
| Purchase ₦3,200 "Rice 2 bags", customer-signed, shop fee-bump | success | `afb4facc…11fb` |
| Purchase ₦9,000 (headroom ₦6,800), customer-signed | **`successful=false`, decoded result: `txFeeBumpInnerFailed` → `txFailed` → payment `paymentLineFull`**, on ledger 5054710 | `8544a6cc…c4c7` |
| Cash repayment ₦1,000 | success; shop book and customer tab both read ₦2,200 | (UI) |

Screenshots of every step: `test-results/thin-path/` (not committed; regenerate with the command above).

**Decisions made while building (each one a change from the written plan):**
1. **The mailbox holds no secrets and is not trusted, so the planned HMAC is dropped.** Every client rebuilds the transaction it expects and compares it to what it received (`src/handoff/verify.ts`): same source, operations byte for byte, memo, fee cap, 15-minute expiry cap, required signatures. 25 hostile cases are tested and 19 mutants of the security-critical code were killed. Two mutants initially survived and exposed real test gaps (a source-account check and the exact refusal reasons); both are now covered.
2. **One transaction joins a customer and opens the line** (`joinAndOpen`), including their display name as an on-chain data entry. Proven live before anything was built on it. A second shop opening a line for an existing customer uses `openCredit` instead, and the verifier knows which to expect.
3. **No sponsor server, no temporary accounts, no sweep job.** The shop's own key sponsors and fee-bumps from the shop's browser, so the plan's relayer, sponsor-balance alert and sweep were not needed.
4. **Names live on-chain** (`name` and `currency` data entries), so the book and the record need no database.
5. **The shop's book trusts the network's balance and uses history only to explain it.** A row shows `explained: false` when the movements do not add up, and a FIADO line is only a customer if its issuer has `AUTH_REQUIRED` (a rogue issuer minting its own "FIADO" is ignored; tested with a real capture).
6. **Handoff storage is pluggable.** In memory locally; **Upstash Redis in production** (Vercel dashboard → Storage → Upstash; the variables `UPSTASH_REDIS_REST_URL`/`_TOKEN` or `KV_REST_API_URL`/`_TOKEN` are read automatically). The Upstash adapter is tested against a fake HTTP server for its exact request shape; **it has not been run against a live Redis.**
7. **Setup is resumable.** The key, shop name and currency are saved first; the shop screen finishes any missing on-chain setup itself, so a reload mid-setup cannot strand a shop.

**Corrections marked in place:**
- My first tamper control for the export verifier never took effect (it mutated a copy the SDK rebuilt) and reported a false pass. Redone at the XDR level, with a before/after count, and it fails correctly.
- My first e2e record assertion ended in `.catch(() => {})`, which could never fail. Replaced by a strict assertion, which also exposed "1 purchases".
- SDK v17 changed three shapes the plan assumed (text memos come back as bytes, signatures are `{value}` objects, `TransactionEnvelope` is a union). All handled and tested.

**Not done, and why:** (a) real Android/iPhone passkey-PRF runs (the virtual authenticator proves our code path, not every phone); (b) a screen recording on two real phones; (c) a live Upstash run; (d) GitHub Actions has never run, because the account is billing-locked (CI is now manual-only).

## 2026-10-06 — Chain layer: typed builders reproduce the spike (Phase 2)

**Decision:** all chain access goes through `src/chain`. That module holds pure builders (`joinCustomer`, `openCredit`, `setLimit`, `buyOnCredit`, `feeBump`, `repayCash`, `repayDollars`, `closeCredit`), plus `submit()`, which turns every Horizon result code into a typed `ChainRefusal`.

**Measurement:** `npm test` passes 22/22 offline. The tests check op order, sources, assets, limits, memos and the two client-side guards. `npm run test:testnet` passes 11/11 live on 2026-10-06, and every refusal came back with the expected code:

| Step | Result | Tx |
|---|---|---|
| join (0 XLM, sponsored) | ok | `c990e796…428d` |
| open line 5,000 | ok | `71412e83…0df7` |
| buy 3,000 (fee-bumped) | ok | `db66f956…ce3c` |
| buy 2,500 more | `op_line_full` | `378507e2…f0ca` |
| shop forges a purchase | `op_bad_auth` | `12c36811…b96d` (never on ledger) |
| pay an unauthorized shop | `op_not_authorized` | `bc4186fd…97c4` |
| cash repay 1,000 | ok | `2b69d645…2a37` |
| dollar repay (1 TUSD + burn 1,500) | ok | `8cc5c537…1f0b` |
| short dollar repay | `op_underfunded`, burn cancelled | `2d0c1d35…a6a2` |
| limit below debt (guard bypassed) | `op_invalid_limit` | `d1a016c3…2a57` |
| close at zero | ok | `3ac47906…2755` |
| buy at the closed line | `op_no_trust` | `875be321…c785` |

**Rules fixed here:**
- **Purchase memo format:** `"<item>|<YYMMDD>"` in the 28-byte text memo. The limit is counted in UTF-8 bytes, so `₦` costs 3. A `|` typed inside the item is replaced by `/`, so an item can never forge a due date. A cash repay has memo `cash`, a written-off debt has memo `forgiven`, and a dollar repay has memo `dollars`.
- **Two guards run before the network:** a limit below the open debt, and closing a line that still has debt. Both are refused locally with the reason. The network enforces the same rules anyway (`op_invalid_limit`, proven above with the guard bypassed).
- **Amounts are exact:** amounts are validated and compared in stroops (`bigint`), never as floats.
- **Retries:** transport errors (friendbot `ECONNRESET`) are retried; a result code is the network's answer and is never retried.

**Two corrections marked in place:**
1. The first builder tests compared text memos as strings, but SDK v17 returns them as bytes. The tests were wrong, not the builders.
2. A `sed` edit lost its newline under MSYS and commented out the test helper. It was fixed with a direct edit.

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
