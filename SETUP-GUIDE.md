# YLHB Deal Desk — Auto-Comp Setup Guide

Goal: type an address, hit **Auto-comp address**, and the tool pulls the ARV + sold comps from RentCast and fills in the calculator. Your API key stays locked on the server, never in the browser.

You'll do this once. Budget ~15 minutes. **Nothing here costs money to start** — RentCast's Developer tier is free (50 lookups/month, no card).

---

## The 3 accounts you need (all free)

1. **GitHub** — github.com — stores the project files.
2. **RentCast** — rentcast.io — the comp data + your API key.
3. **Vercel** — vercel.com — hosts the calculator and the proxy in one spot.

---

## STEP 1 — Get your RentCast API key (≈3 min)

1. Go to **rentcast.io** → create an account.
2. Open the **API** section / dashboard → choose the **Developer** plan (free, 50 calls/month — no card).
3. Click **Generate API key**. Copy the long string it gives you. Keep it somewhere safe for Step 4. **Treat it like a password.**

> When 50 calls/month isn't enough, the **Foundation** plan is $74/mo for 1,000 calls. You upgrade right in the same dashboard — no code changes needed.

---

## STEP 2 — Put the project on GitHub (≈4 min)

Easiest no-terminal way:

1. Go to **github.com** → **New repository** → name it `ylhb-deal-desk` → **Create**.
2. On the new repo page, click **uploading an existing file**.
3. Drag in **everything** from the `ylhb-deal-desk` folder I gave you — keep the folder structure (the `api/` and `src/` folders must stay as folders). Easiest: drag the whole folder contents in; GitHub preserves subfolders.
4. Click **Commit changes**.

---

## STEP 3 — Deploy on Vercel (≈3 min)

1. Go to **vercel.com** → **Sign up** → choose **Continue with GitHub** (links them automatically).
2. Click **Add New… → Project**.
3. Find `ylhb-deal-desk` in the list → **Import**.
4. Vercel auto-detects it's a Vite app. **Don't change the build settings.**
5. **Before clicking Deploy**, open the **Environment Variables** section (Step 4 ↓).

---

## STEP 4 — Add your key as an environment variable (the important part)

In that Environment Variables box on the deploy screen:

| Name | Value |
|---|---|
| `RENTCAST_API_KEY` | *(paste the key from Step 1)* |

- Leave the optional `ALLOWED_ORIGIN` out for now.
- Click **Add**, then **Deploy**.

This is what keeps the key safe: it lives in Vercel's server environment, the proxy reads it server-side, and it is **never** sent to anyone's browser.

---

## STEP 5 — Use it

1. When the deploy finishes, Vercel gives you a URL like `https://ylhb-deal-desk.vercel.app`. That's your calculator — bookmark it on your desktop.
2. Type a subject address → click **Auto-comp address**.
3. The comp grid fills with sold comps, subject sqft fills in, and RentCast's ARV drops into the ARV box.
4. **Review the comps** — deselect/edit any junk (the tool still computes ARV = avg $/sf × sqft from whatever rows remain), then run your MAO and creative-finance tabs as usual.

---

## If something doesn't work

- **"RentCast rejected the API key"** → the key in Vercel is wrong or has a typo. Vercel → your project → **Settings → Environment Variables** → fix `RENTCAST_API_KEY` → **Redeploy**.
- **"couldn't find that address"** → spelling, or RentCast has no data there. Enter comps manually; everything else still works.
- **"call limit reached"** → you've used your 50 free lookups this month. Wait for reset or upgrade to Foundation.
- **Button does nothing / "couldn't reach the comp service"** → the `api/` folder didn't upload as a folder. Re-check Step 2 so `api/comp.js` exists in the repo.

---

## What stays true no matter what

- Manual entry always works — the API is a convenience layer, not a dependency.
- RentCast's number is an **AVM** (automated estimate of current value), not a true after-repair value. Use it as a fast first pass, then sanity-check the comps like Jamil teaches before you make an offer.
- Your key never touches the browser. That's the whole reason for the proxy.
