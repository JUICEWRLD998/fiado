# Fiado

**The credit book the network keeps.**

A shop gives a customer a credit line. Only the customer can write a debt into it. The Stellar network refuses
any purchase over the limit. A customer who pays on time can carry that record to the next shop.

> Status: **in build, testnet only.** The thin path (join, buy on credit, over-limit refusal, repayment) works end to end in two real browsers. Labels used everywhere: LIVE / NEXT / NOT LIVE.
> Built for the Find Your Way Hackathon (Stellar Passport), General Track, by Mustapha Fadhlullah.

## The problem, in shopkeepers' words

Every small shop in Lagos, Lima or São Paulo keeps a notebook of customers who buy on credit
(*la libreta de fiado*). We asked three shopkeepers in Nigeria on 2026-10-06:

- They extend credit to **50-60 regular customers** between them.
- **Every shop has disputes every month**: "they argue that they already paid, or that I wrote the wrong amount".
- **Every shop has lost customers over them**: "I've lost a few customers because they don't agree with what I wrote."

The notebook fails because one person writes it. Fiado moves the pen.

## How it works

Fiado uses Stellar's original IOU model. There is no smart contract.

| Paper notebook | Fiado on Stellar |
|---|---|
| The shop writes "Bisi owes ₦3,200" | The customer's own account issues `FIADO` and signs a payment of ₦3,200 to the shop. **Only the customer can create the debt.** |
| "I let her go up to ₦10,000" | The shop's **trustline limit** to the customer's `FIADO` is the credit limit. |
| An argument at the counter about going over | The network refuses the payment with `op_line_full`. The refusal is a failed transaction on the public ledger. |
| "I paid you last week" | A repayment returns `FIADO` to the customer's account, which burns it, visibly and permanently. |
| A good customer starts from zero at a new shop | Any shop can read the customer's repayment history from Horizon, with the customer's link. |

The customer needs no XLM and no app. The shop **sponsors** the customer's account and **fee-bumps** their transactions.
A passkey in the browser holds the key.

## Verified so far (testnet)

The mechanism passed a 21-step spike with negative controls. See [`DECISIONS.md`](DECISIONS.md) and
[`docs/spike/2026-10-06.json`](docs/spike/2026-10-06.json). Every claim maps to a command in [`CLAIMS.md`](CLAIMS.md).

```bash
npm install
npm run spike        # creates fresh testnet accounts and replays the whole credit-line lifecycle
```

## Why only on Stellar

Trustline limits, issuer-only creation, `AUTH_REQUIRED` authorization, sponsored reserves and fee-bump transactions are
protocol features. On Stellar the credit book needs no contract to audit and no custom token logic. The rule
"you cannot go over your limit" is enforced by every validator.

## What this is NOT

- **Not a lender.** Fiado never extends credit, holds money or charges interest.
- **Not a credit score.** The record is arithmetic over public transactions, shown as facts, never as one number.
- **Not on mainnet.** This submission runs on testnet by design.

## Deploying (Vercel)

The two phones pass a transaction through a small mailbox (`/api/handoff`). Locally it lives in memory. **On Vercel it needs Redis**: add the free Upstash integration (Vercel dashboard → Storage → Upstash) and its environment variables are picked up automatically. Everything else is static or stateless. Nothing secret is stored.

## Develop

```bash
npm run dev          # http://localhost:3000
npm run lint && npm run typecheck && npm test
npm run test:testnet # integration tests against public testnet
npm run e2e          # Playwright, phone + desktop
```
