# Hobknob Co-Living Academy Deal Analyzer: Project Guide

## Who you're working with
- Brian Rios ("B"), founder of Hobknob Mid-Term Rentals and the Hobknob Co-Living Academy. He calls his AI "Ace."
- Direct, honest pushback over polite agreement. Plain English, analogies welcome.
- HARD RULE: never guess. Read the actual code before answering or editing, and prove a change works before calling it done.
- Copy rules: no em dashes or semicolons in UI text. Never make guarantees. Hobknob co-living homes are for "gentlemen" or "ladies," never "male" or "female." No outside course or company names in the UI.

## What this app is
A deal analyzer for Academy students. Students type the property facts and rents, the app does the math. No property-data APIs, so nothing bills per lookup.
- Deal types: Buy & Convert, Creative Buy (Sub-To or Seller Finance), House Hack.
- No rental arbitrage. Brian does not teach it and has never done it, so it was removed on purpose. Do not add it back.
- Management default: $61.50 per rented room or unit per month (`MGMT_PER_ROOM`).
- Rental models: Co-Living by the room, Private units, Hybrid.
- HOA dues only count for Private units. For co-living and hybrid the HOA field is hidden and left out of the math, because in Brian's experience about 99% of HOAs do not allow renting by the room. Private units show a caution that many HOAs ban leases under 12 months or renting at all.
- Buy & Convert has a "Hard money / private lender" option (interest only, points, short term). Defaults: 90% of purchase, 100% of rehab, 12%, 2 points, 12 months. The "no money in" view must always carry the skin-in-the-game warning. No 5-year view for hard money because the loan comes due. The hard money section has a "Long-term plan" (refiPlan in calc.js): DSCR refinance (defaults 75% of value, 7.5%, 30 yrs, 3% costs), private money lender (student's own terms), or pay it off in cash.
- After-repair value is required for Buy & Convert and House Hack (Brian, Nov 2026). No verdict until it is entered. If a bank, DSCR or FHA loan is more than lenders allow for that value (80%, FHA 96.5%), the verdict fails and step 4 explains why.
- Lender DSCR uses the traditional / whole-house rent the student enters, not room rents. Brian knows of only one lender that counts by-the-room income and a few that count Airbnb income. The furnished-rent DSCR is shown only as a secondary number.
- Access: a student passcode checked by `api/auth.js` against the `ACADEMY_PASSCODE` env var in Vercel. It fails closed when the variable is missing.

## Architecture
- `src/calc.js`: all deal math as pure functions (`analyze`, `whatItTakes`). Defaults come from Brian's Deal Analyzer sheet. Test math here first.
- `src/App.jsx`: the whole UI. Saved deals and the autosaved draft live in the student's browser (localStorage keys `academy.deals.v1`, `academy.draft.v1`).
- `src/docs.js`: printable, editable contractor documents (type over any text, click boxes to check, download as HTML that keeps edits or as a Word .doc) (Scope of Work, Punch List, Rehab Estimate) built from the deal. Started from Brian's sample forms, corrected and expanded for co-living. Cost ranges are national ballparks (Nov 2026). Never invent a range. Use "Get local bids" when none was verified. Never print the student's budget on the Scope of Work.
- `api/auth.js`: passcode check only.
- Deploy: Vercel auto-deploys the GitHub repo.

## Validated numbers (do not break)
The Falls example from Brian's sheet (5 rooms at $799, $181,000, 80% LTV, 7% / 30 yrs, $7,000 closing, $16,100 furnishing, 0 months to rent, Hobknob default expenses, management set to $50 per room as on the sheet) must show $1,050/mo cash flow, $59,300 cash needed, 21.24% cash-on-cash.

## Working rules
1. `npm run build` must pass before claiming done.
2. Wording is B's call. Do not rename labels he approved without asking.
3. Verdict thresholds (20/12/8% cash-on-cash) live in `TARGETS` in calc.js and are B's to tune.
