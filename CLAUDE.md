# YLHB Real Estate Deal Desk — Project Guide

## Who you're working with
- Brian ("B") — founder/operator: Your Local Home Buyer (wholesaling, Louisville KY / Southern IN) and Hobknob (mid-term rentals). He calls his AI "Ace."
- Communication style: direct, honest pushback over polite agreement. If his idea has a problem, say so. Explain like you're teaching a sharp new VA — plain English, analogies welcome.
- HARD RULE: never guess. Read the actual code/docs before answering or editing. When you change code, prove it works before saying it's done.

## What this app is
A single-page React deal calculator for wholesaling: pulls comps from RentCast, computes an AVM-side ARV and a sold-comp ARV, MAO bands (75% under $200K / 80% over, adjustable), an itemized max offer with an assignment ceiling, five strategy tabs (Cash/MAO with BRRRR, Sub-To, Hybrid, Seller Finance, Novation), and buyer-facing pitch decks. Used by B and his VAs to screen deals fast.

## Architecture
- `src/App.jsx` — the ENTIRE app (~2,700 lines, deliberately one file). All state, math, and UI live here.
- `api/comp.js` — RentCast /avm/value: AVM point estimate + model comparables + subject details (beds/baths/sqft/yearBuilt/lastSale/lat/lng).
- `api/sold.js` — RentCast /v1/properties: recorded closings (1 mile, 365 days, backfills to 8 by closest sqft). Computes comp distances via haversine using subject coordinates passed from the client (subjectLat/subjectLng) — the records query filters to sold-in-12-months, so the subject itself is usually NOT in the results.
- `api/rent.js` — RentCast rent estimate (feeds the BRRRR/DSCR panel).
- `api/autocomplete.js` — address autocomplete.
- Deploy: Vercel auto-deploys this GitHub repo. RENTCAST_API_KEY lives in Vercel env vars. RentCast billing is per REQUEST (not per record); ~50 free/month; one Auto-comp click = 2 requests (comp + chained sold).

## The comping system (do not break casually)
- Auto-comp is the single trigger: it pulls the AVM comps AND chains the sold pull, passing fresh subject details directly (React state set in the same tick isn't visible to the chained call).
- Both panels share the same filter pipeline:
  1. Structural junk flags (`compFlags`): beds/baths mismatch, built 15+ yrs apart, 250+ sqft off, 0.5+ mi away.
  2. Size adjustment: every comp's PRICE is moved to the subject's sqft at a marginal rate = half the group's structurally-clean median $/sf (`marginalPsf` state exists for a manual rate but currently has no UI — auto only, by B's choice).
  3. Price-outlier tails run on the SIZE-ADJUSTED $/sf (`flagPriceOutliers`, ±25% vs clean median, needs 3+ clean comps): low tail = "possible distressed sale", high tail = "possible renovated resale (flip)" — the flip label coaches verify-on-Google-then-include, because renovated resales ARE after-repair condition.
- AVM panel (`gridSummary`): AVERAGE of included comps' adjusted prices. Flagged comps auto-excluded. Tri-state overrides in `gridIncluded` (true=force in, false=force out, undefined=auto).
- Sold panel (`soldSummary`): MEDIAN of the best `SOLID_TARGET` (4) solid comps' adjusted prices; solid comps beyond 4 sit on a bench; fewer than 4 in the pool → amber thin-comps warning and the ARV stat de-greens. Force-excluding a top-4 comp promotes the next solid one automatically. Tri-state `soldIncluded`.
- Record corrections (bed/bath count fixes, ±$ steppers): ride ON TOP of every ARV source exactly once. The picker buttons DISPLAY correction-inclusive values but STORE the base number in `arvOverride`; the `arv` memo adds `subjAdjust`. NEVER let the correction get added twice.
- Manual comps: "+ comp" on both panels appends locked read-only cards (flagged `manualEntry`, shown with a blue chip). A fresh SUCCESSFUL pull clears them (new property = clean slate); a failed pull preserves them.
- Comp cards are read-only by design (no editing pulled data). Curation happens only through include/exclude.
- All RentCast dates are midnight-UTC ISO strings — every date formatter pins timeZone: "UTC" or Eastern time shows the previous day.

## Working rules for this repo
1. Read the current file before editing — never assume from memory.
2. After edits: `npm run build` MUST pass before claiming done. (This is the compile check the chat version of Ace never had — use it every time.)
3. Work on the `dev` branch; push; give B the Vercel preview URL; merge to `main` only after he approves the preview.
4. UI copy is written for brand-new VAs — professional, plain English, no jargon walls. B killed a pizza analogy for being too childish; aim between childish and academic.
5. Wording is B's call. Never rename labels or copy he approved without asking.
6. When B says "never mind, put it back" — git revert the exact commit, don't reconstruct.
7. Advertising-adjacent content rules (if any marketing copy ever touches this repo): "gentlemen"/"ladies" never "male"/"female" for Hobknob co-living; never make guarantees.

## Approved backlog (discussed, not yet built)
- Sticky verdict bar: address / ARV / MAO / grade following the scroll.
- Compare-strategies side-by-side view (Cash vs BRRRR vs Sub-To vs SF columns) — the unmet market want from our UX research.
- Amber cross-check on the deal-grade banner when the 75/80% rule MAO and the itemized MAO disagree (they use different cost assumptions; the gap is information).
- Line-item waterfall breakdown under the Itemized Max Offer.
- Progressive disclosure pass on strategy-tab inputs; a deliberate mobile layout pass; saved deals / pipeline.
