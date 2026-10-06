# Fiado design plan (Phase 7, step 1: ground)

Written 2026-10-06. The numbers come from `node design/measure.mjs`, which fails loudly if its own controls fail.

## Subject, audience, the one job per screen

- **Subject:** the paper credit book every small shop keeps ("the counter book", *la libreta de fiado*), moved onto a network that only lets the customer write a debt.
- **Audience:** shopkeepers (often 40+, a mid-range Android phone, direct sunlight, WhatsApp as the default app) and the customers who buy from them. Both read in a hurry, at a counter.
- **One job per screen:**
  | Screen | Job |
  |---|---|
  | Shop (`/shop`) | See who owes what, then record a sale or a payment in two taps |
  | Customer (`/c`) | See what I owe and what I can still buy |
  | Join / Pay (`/c/join`, `/c/pay`) | Read exactly what I am about to sign, then sign |
  | Record (`/record/<key>`) | Judge a stranger's repayment history in ten seconds |
  | Landing (`/`) | Understand the idea, and open the product |

## Vocabulary sheet (from the subject's own world)

Hardback exercise books with ruled blue lines and a red margin; biro ink that is blue-black, never black; carbon-copy receipt pads with torn perforations; rubber stamps (PAID, CANCELLED); tally strokes in fives; the highlighter used on the line that matters; chalk price boards; kraft paper bags; hand-painted shop signs.

**What we do not draw:** terminals, neon, glass, coins, blockchains, padlocks, shields, gradients. Nothing in this world looks like crypto, and the product should not either.

## The default-cluster review (what I rejected, and why)

| The default I would write for any "credit" brief | Why it is wrong here | What replaces it |
|---|---|---|
| Cream paper, high-contrast serif, terracotta accent | Paper in this world is cool and blue-ruled, not warm cream; terracotta is the common generated tell | Cool blue-white paper, biro-blue accent, red used only as the margin |
| Near-black with one acid accent | A shop in daylight is not a dark terminal | Light first; dark is a designed "night counter", not an inversion |
| The SaaS card kit: identical rounded cards, grey shadows | A book is rows on a page, not tiles | Rows on ruled lines; loose paper (slips) only for things that really are loose: a code to show, a receipt |
| Eyebrow labels, middle-dot meta strings, arrows on links | Template chrome | None. Sentence case. Plain verbs |
| Monospace for "data labels" | The ledger hand is a human hand | Tabular figures in a hyperlegible face |

**One collision with his house style:** SIGNAL DECK (deep blue-black, one mint-teal accent) is the near-black-plus-one-accent cluster. It does not fit a paper book read in sunlight, so this product does not use it. If he wants SIGNAL DECK anyway, the tokens are the only place to change.

## Palette (OKLCH, measured)

Light, "the book" (surfaces are tinted toward the paper hue, chroma 0.006 to 0.014; no neutral grey):

| Token | oklch | Job |
|---|---|---|
| `--paper` | 97.6% 0.010 215 | the page |
| `--raised` | 99% 0.006 215 | a loose slip on top of the book |
| `--sunk` | 94.5% 0.014 215 | the counter under the book |
| `--rule` | 84% 0.060 235 | the ruled line |
| `--rule-strong` | 62% 0.100 240 | a control border (3:1 on paper) |
| `--ink` | 25% 0.075 262 | biro blue-black, text |
| `--ink-2` | 42% 0.060 262 | secondary text |
| `--accent` | 40% 0.170 262 | the one call-to-action colour (biro blue) |
| `--margin` | 52% 0.200 27 | margin red: refusal, overdue |
| `--tally` | 46% 0.100 155 | tally green: paid, recorded |
| `--highlight` | 91% 0.160 100 | highlighter yellow: a note, a pending state (fill only) |

Dark, "the night counter": paper 21% 0.020 255, raised 25.5%, sunk 17.5%, ink 93% 0.014 230, accent 78% 0.120 245, margin 72% 0.170 25, tally 75% 0.130 155 (all in `design/measure.mjs`). Dark is not the light palette inverted: support-hue chroma is lower and lightness is lifted.

**Measured** (`node design/measure.mjs`, 58 checks, 0 failures):
- Every colour is inside sRGB. The first draft had two that were not (`light.tally`, `dark.highlight`) and a control border at 2.87:1; all three were fixed before any code.
- Text on its own surface: ink 15.1:1, ink-2 7.9:1, accent 9.0:1, margin red 5.7:1 (light, on paper); the weakest text pair in either theme is 5.2:1.
- Role hues are different colours (CIE ΔE76, not contrast): accent vs margin 108.9, accent vs tally 102.6, margin vs tally 104.1, accent vs ink 40.4 (the closest pair; all must be at least 20).
- The accent is clearly louder than every surface: Lab chroma 63.5 against 4.6 (13.8x) in light and 39.3 against 7.7 (5.1x) in dark; the floor is 4x.

**One colour, one meaning.** Blue means "you can act here". Red means "refused or late". Green means "recorded or paid". Yellow means "pending, a note". None of them is used for anything else.

## Type

| Role | Face | Why |
|---|---|---|
| Display and names | **Bricolage Grotesque** (variable, optical size) | A grotesque with the slight irregularity of a hand-painted shop sign; free |
| Everything else | **Atkinson Hyperlegible Next** | Designed for low-vision legibility: right for glare, cheap screens and hurried reading; has tabular figures; free |

Scale (rem): 0.8125 / 0.9375 / 1 / 1.125 / 1.375 / 1.75 / 2.5; body 1rem at 1.5; lines under 68ch; headings `text-wrap: balance`, short text `pretty`; every figure that can change uses `tabular-nums`. No italic headings, no all-caps labels, no eyebrows.

## Layout concept (bespoke: the page is the book)

```
SHOP, 1280                                          SHOP, 375
┌─ book page ───────────────────────────┐          ┌──────────────────┐
│ Mama Bisi            testnet · GDHJ…  │          │ Mama Bisi        │
│ ┃ ─────────────────────────────────── │          │ ┃ ─────────────── │
│ ┃ [ slip: Add a customer ] ← the one  │          │ ┃ Bisi      ₦3,200 │
│ ┃                    filled button    │          │ ┃ ▓▓▓▓░░░ limit    │
│ ┃ ─────────────────────────────────── │          │ ┃ ─────────────── │
│ ┃ Bisi          ▓▓▓▓▓░░░┆   ₦3,200    │          │ [Add a customer] │
│ ┃ Rice 2 bags · due 13 Oct             │          └──────────────────┘
│ ┃ ─────────────────────────────────── │
│ ┃ Alhaji…                              │          ┃ = the red margin line
└────────────────────────────────────────┘          ┆ = the credit limit on each row's gauge
```

Rows are ruled lines; the red margin runs the full height; each row carries a **tab gauge** (what is owed, against a limit marker). Loose things (a join code, a purchase code, a receipt) are **slips**: raised paper with a torn edge, set on top of the book. Phone: one column, the margin on the left edge. Desktop: the book is a centred page of about 46rem with a quiet side column that holds the slip being worked on, so the page is never a narrow strip in an empty field.

## Hierarchy contract (the first viewport at 1280 and 375)

| Screen | Where am I | What matters most | What can I do | What just happened | What next |
|---|---|---|---|---|---|
| Shop | the shop's name at the top of the book | who owes, overdue first | add a customer (the only filled button); per row: new purchase | a one-line ink note under the title ("Recorded: Rice 2 bags") | remind, repayment |
| Customer | my name | what I owe at each shop and what is left | scan or open a code | the tab changed | share my record |
| Pay | the shop that asks | the item and the amount, in large type | sign | (none yet) | the consequence line says what my tab becomes |
| Record | whose record, and that it is public | "N purchases at M shops, K paid off" | read; check on the ledger | n/a | n/a |
| Landing | what Fiado is | the over-limit refusal, shown, not described | open my shop; I am a customer | n/a | n/a |

The blind critic in step 7 is scored against this table.

## Image plan (ladder: R1 first)

| Route | Image | Rung |
|---|---|---|
| Landing | the real shop book from the live e2e run, at 2x, with the refusal on screen | R1, the product's own output |
| Shop | a ledger-corner illustration in the header (ruling, margin, a biro), outside the data | R2, hand-built SVG, graded |
| Customer | the same corner, tab-gauge variant | R2 |
| Empty states (no customers, no tabs) | tally strokes on a ruled line | R2 |
| Pay and Join | none: the terms to sign fill the viewport (written skip reason) | skip |
| Record | the margin-and-tally motif beside the facts | R2 |
| Packaging (OG card, icon, README hero) | cut from the signature moment | R1 |

R2 art is graded (one 0.5px blur on the wrapper, a warm-key and cool-fill gradient, light where the practical light is), uses `currentColor` and tokens, and shows no drawn faces.

## Motion: one signature moment, and nothing else moves unasked

**Signature moment: "The line stops at the margin."** The mechanism acting: the network refusing a purchase over the limit.

```
Trigger:   a purchase over the limit comes back refused (op_line_full)
Beats:     t=0      the row's tab gauge is at rest: ink fill = what is owed, a red marker = the limit
           t=120    a hatched segment, the attempted purchase, starts growing from the end of the ink (ease-out)
           t=520    it reaches the red margin and stops dead against it; the segment beyond is drawn as a dashed ghost
           t=640    the margin line takes one short pulse (opacity), the ghost drops to 40%
           t=760    a REFUSED stamp lands beside the amount (scale 1.12 to 1, rotate -4deg to -2deg, 160ms; the one allowed overshoot,
                    because a real rubber stamp lands and settles by a pixel or two)
           t=900    the sentence appears: "Over the credit limit. The network refused this purchase, so nothing was added to the tab."
           settle by 1100ms
The eye:   the growing segment, the margin, the stamp, the sentence
End state: as text: "Over the credit limit... nothing was added", the owed figure unchanged, a link to the refused transaction
Reduced:   no movement: the gauge, stamp and sentence cross-fade in 150ms and end identical
Thumbnail: t=900ms (stamp landed, sentence visible): the source of the OG card and README hero
```

It carries information (the gauge shows by how much it was refused), is announced through `aria-live="polite"`, never blocks input (a click jumps to the end state), and is deterministic.

Everything else is feedback (press `scale(0.97)`, 150ms) or continuity (rows enter and leave with `layout`, 220ms), plus one quiet entrance on first load. No scroll fades, no hover lifts, no loops.

## The three directions explored (Phase 2)

Same data, same refusal moment, differing on structure, type voice and where the boldness goes. Built at `/prototypes/book`.

1. **Counter book**: a ruled page, a red margin, rows on lines; the bold thing is the margin line and the stamp.
2. **Receipt roll**: each customer is a carbon-copy slip on a pad with a perforated edge; the bold thing is the torn edge and the duplicate.
3. **Chalkboard**: a price board with chalk lettering in two columns; the bold thing is the chalk gauge.

### Seen at 1280 and 375 (screenshots in `design/shots/explore/`) and picked

**Counter book.** Scored against the hierarchy contract: it answers "who owes what" in one scan (name left, figure right, one gauge per row); the limit tick and the stopped segment make the refusal cause-and-effect legible without reading; it holds the same layout at 375 and 1920; and it themes to light and dark without changing structure.

| Direction | What it did well | Why it lost |
|---|---|---|
| Receipt roll | The torn edge and carbon stripe are very subject-true | Counting a tab in ₦500 tally strokes hides the real amount; a 3-up slip grid leaves most of a desktop empty; the refusal reads quieter |
| Chalkboard | The chalk gauge is the most expressive drawing of the moment | A dark board is the worst case for a shop read in sunlight; it fights the light/dark theming; skeuomorphic frame |

**Runner-up: Receipt roll.** Its vocabulary is kept where things really are loose: the join code and purchase code are **slips** (raised paper, torn top edge, carbon stripe).

**Defects seen and carried into the build:** at 375 the stamp covers the due date (give it its own row); Atkinson's slashed zero is correct for legibility but busy next to the Naira sign (test `font-feature-settings`); a favicon is missing (404).

## Hallmark structure picks (custom route, bespoke depth)

- **Pre-flight:** Next.js 16 App Router (`package.json`), CSS Modules + `src/ui/tokens.css` (no Tailwind), Motion 14 installed (`package.json`, motion-on project), no prior Hallmark stamp or `.hallmark/log.json` in this project.
- **Route:** custom, **bespoke**: the structure itself (the page is a book; loose things are slips) is the idea, and no catalog macrostructure has it. Stamp is at the top of `src/ui/tokens.css`.
- **First Hallmark run in this project**, so there is no rotation to state. Nav: wordmark left, two role links right (the product has exactly two destinations, so the minimal archetype is honest here). Footer: none on app routes; one-line colophon on the landing.
- **Locked tokens:** every colour and font in component CSS is a `var(--…)`. The chalkboard's local colours were prototype-only and are deleted with the prototype.
