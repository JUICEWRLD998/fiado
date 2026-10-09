# Fiado demo: how to record it

Mustapha Fadhlullah, independent security researcher

Live site: https://fiado-delta.vercel.app

## What the judges should understand

A shopkeeper's credit book is a notebook, and notebooks cause arguments. Fiado moves the book onto the Stellar network. The shop's credit limit is enforced by the network itself, and only the customer can sign a debt. If a judge remembers one thing, it should be the moment the network refuses a purchase that goes over the limit.

The voiceover is in `voiceover.md`. This file says what is on screen at each moment.

## Format

- About 2 minutes 10 seconds, screen recording at 1280 x 720, light mode.
- Burned-in captions (they are in the table below), so it works with the sound off.
- Record the screen and the voice separately, then lay the voice over the video. Your connection is slow, so you cannot talk live while pages load.
- The refusal must be on screen by 0:30.

## Before you record

1. Run the whole demo once with no recording. Fix anything that fails.
2. Open a fresh browser profile at 100% zoom. Hide the bookmarks bar and close every other tab.
3. Open these tabs in order: the landing page, `/try`, `/how`, `/evidence`, and a blank tab for the explorer.
4. Start `/try` two minutes before you record. It builds a real practice shop on testnet, which takes about a minute on your connection. Record from the moment it is ready. Do not record the waiting.
5. Switch to light mode with the sun and moon button in the header. Show the button once near the end, when you flip to dark mode and back.
6. Keep real customer names and real phone numbers off screen. Real shopkeepers appear only on `/evidence`, because they agreed to that.
7. Do not show any token or dashboard. Public addresses and transaction links are fine.

## Run sheet

| Time | On screen | What you do | Caption |
|---|---|---|---|
| 0:00 to 0:12 | A page of a real credit notebook, names blurred. If you have no photo, use the landing page. | Hold still. Let the voice carry it. | Credit lives in a notebook. Notebooks cause arguments. |
| 0:12 to 0:40 | `/try`, practice shop ready. Customer Bisi: limit ₦10,000, owes ₦3,200. | Click "Try ₦8,800, over the limit". Wait for the red Refused stamp. Click "Look up the refused transaction" and show the explorer page. | The network refused it. Nobody argued. |
| 0:40 to 1:05 | `/how` | Scroll slowly past the six claims. Pause on "A purchase over the limit is refused by the network" and on "Only the customer can write a debt". Open one of the check links. | The credit limit is a Stellar trustline limit. |
| 1:05 to 1:35 | Back to `/try`. | Click "Buy ₦500 on credit". Show the amount owed go up. Click "Paid ₦3,200 in cash". Show it go down. | The customer signs every purchase. Cash repayments are recorded. |
| 1:35 to 1:55 | `/c` (My tabs) on a real customer's device. If you have none, the explorer page of the practice customer's account. | Show one customer's tab and record: purchases, repayments, days to repay. | The record belongs to the customer. Any shop can read it. |
| 1:55 to 2:15 | `/evidence` | Scroll to "Reported from shop notebooks". Pause on the three shops and the note that they are not on the ledger. Flip to dark mode and back. Finish on the live address. | Three Lagos shops agreed to be listed. Testnet only, no real money. fiado-delta.vercel.app |

If you can do a real two-phone join, you may use 15 seconds of it inside the 1:05 to 1:35 slot: the shop shows a QR code, the customer scans and signs, and the customer appears in the shop's book. Only do this if the dry run worked twice in a row. It uses real passkeys, and passkeys on real phones are not tested yet. If in doubt, stay on `/try`.

## Scene notes

**Scene 1.** This is the problem. Keep it quiet and short. The three shopkeepers you spoke to each lost a customer over a disagreement about what was written. Confirm before you say this that those three are the same people who signed the consent forms.

**Scene 2.** This is the whole point of the video. Slow down here. After the Refused stamp, the explorer page shows the transaction failed with `op_line_full`. Say what that means in plain words: the network said no.

**Scene 3.** Do not read the page aloud. Point at two claims and say them in your own words. Show that each claim has a link, so a judge can check it.

**Scene 4.** Keep the amounts small and the clicks fast. The goal is that the judge sees the debt go up when the customer signs and down when cash arrives.

**Scene 5.** One idea: the record is the customer's, and a new shop can read it without calling the old one.

**Scene 6.** Be honest about the paper figures. The page labels them as notebook records, not on the ledger. Say that out loud. It builds trust.

## What you must not claim

- No real money moves. This runs on the Stellar test network. Say "testnet" once, clearly.
- It is not on mainnet. Interest, lending, credit scores and custody are not part of it.
- There is no USDC repayment yet. Do not mention it.
- The notebook figures are the shopkeepers' own records and are not on the ledger. The live counts on `/evidence` are empty until the shops run their books on Fiado, and the page says so.
- Passkeys are built and tested with a virtual authenticator. Do not say they were tested on real phones.
- A customer's display name is public on the test ledger. Do not put a real customer name on screen.

## Where each judging criterion shows up

| Criterion | Where the video shows it |
|---|---|
| Technical execution | The refusal on the explorer, the live site, the checks on `/how` |
| Meaningful use of Stellar | Trustline limit as credit limit, customer-signed purchases, the shop paying the fees |
| Originality | A credit book where the network says no, so nobody has to |
| Potential impact | The three shopkeepers and the notebook problem they described |
| User experience | The customer only taps Sign. No app and no money needed. The theme switch |
| Presentation quality | Captions, a clear first 30 seconds, an honest ending |

## If something goes wrong

- `/try` fails to build: retry once. If it still fails, use the saved screenshot of the refusal in `design/shots` and say in the voice that it is a screenshot. Do not hide a failure.
- The explorer page is slow: record it separately and cut it in.
- The refused transaction link shows nothing yet: wait a few seconds and reload. The ledger can lag.
- The site is slow on your connection: record pages once they have loaded, and keep the cuts tight.

## After you record

1. Watch it once with the sound off. The captions alone should explain it.
2. Watch it once with the sound on and no picture. The voice alone should make sense.
3. Check that no token, real customer name or phone number appears anywhere.
4. Put the video link at the top of the README and in the submission form.
