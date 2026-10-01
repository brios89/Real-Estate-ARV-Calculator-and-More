// /api/rent.js — Vercel serverless function. Returns RentCast's long-term rent estimate.
// Called ONLY when the user opens the Rental tab (lazy-load), so address pulls that never
// touch the Rental tab stay at 1 RentCast credit instead of 2.
//
// Calls:  /api/rent?address=123 Main St, Louisville, KY[&bedrooms=4&bathrooms=2&squareFootage=1050&propertyType=Single Family]
// Returns: { rent, rentLow, rentHigh, subjectAddress, basis: { beds, baths, sqft } }
//
// The optional attributes let the Deal Desk price the house as the team has corrected it (an added
// bedroom, a finished bath). Without them RentCast looks up its own record for the address, which
// ignores every bed/bath correction. RentCast docs: bedrooms, bathrooms (fractions allowed),
// squareFootage and propertyType are accepted on /avm/rent/long-term and override its lookup.

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || "";
  if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);

  const key = process.env.RENTCAST_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Server is missing RENTCAST_API_KEY. Add it in Vercel → Settings → Environment Variables." });
  }

  const address = (req.query.address || "").toString().trim();
  if (!address) {
    return res.status(400).json({ error: "Provide an address, e.g. /api/rent?address=123 Main St, Louisville, KY" });
  }

  const params = new URLSearchParams({ address });
  const pos = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
  const beds = pos(req.query.bedrooms), baths = pos(req.query.bathrooms), sqft = pos(req.query.squareFootage);
  const ptype = (req.query.propertyType || "").toString().trim();
  if (beds != null) params.set("bedrooms", String(beds));
  if (baths != null && baths > 0) params.set("bathrooms", String(baths));
  if (sqft != null && sqft > 0) params.set("squareFootage", String(Math.round(sqft)));
  if (ptype) params.set("propertyType", ptype);
  // Comp settings, per B (Sep 30 2026): 25 comps (the API maximum), start hyper-local at half a mile
  // and only rentals seen in the last 90 days, so the estimate reflects today's rents. This file only
  // prices rent. Sold comps for the ARV live in sold.js and are not affected. RentCast's docs warn a
  // tight radius or look-back can come back with "not enough comps", so the search widens in steps
  // (below). RentCast only bills successful requests (non-200 responses are free, per its Billing and
  // Pricing docs), so the widening steps cost nothing. A pull is still 1 credit.
  params.set("compCount", "25");
  const DAYS = "90";
  params.set("daysOld", DAYS);
  // Search order, per B (Sep 30 2026): distance gives first, then time. Hold the 90-day window and widen
  // 0.5 -> 1 -> 2 -> 5 miles. If 5 miles still has too few recent rentals, hold 5 miles and stretch the
  // look-back 180 -> 270 -> 365 days. Only after all of that, RentCast's own default search.
  const STEPS = [
    ["0.5", DAYS], ["1", DAYS], ["2", DAYS], ["5", DAYS],
    ["5", "180"], ["5", "270"], ["5", "365"],
  ];
  const call = (p) => fetch(`https://api.rentcast.io/v1/avm/rent/long-term?${p.toString()}`, { headers: { "X-Api-Key": key, Accept: "application/json" } });

  try {
    let r = null, used = null;
    for (const [mi, days] of STEPS) {
      const p = new URLSearchParams(params);
      p.set("maxRadius", mi);
      p.set("daysOld", days);
      r = await call(p);
      if (r.ok) { used = `within ${mi} mi, last ${days} days`; break; }
      if ([401, 403, 429].includes(r.status)) break;   // key, billing or quota problem: widening will not help
    }
    if (!r.ok && ![401, 403, 429].includes(r.status)) {
      const loose = new URLSearchParams(params);
      loose.delete("maxRadius"); loose.delete("daysOld");
      const r2 = await call(loose);
      if (r2.ok) { r = r2; used = "from RentCast's default search, since there were not enough rentals within 5 mi even looking back a full year"; }
    }

    if (!r.ok) {
      const body = await r.text();
      return res.status(r.status).json({
        error:
          r.status === 404 ? "RentCast couldn't estimate rent for that address. Enter rent manually."
          : r.status === 401 ? "RentCast rejected the API key. Re-check RENTCAST_API_KEY in Vercel."
          : r.status === 403 ? "RentCast says the API subscription is inactive or has a billing problem. Check the API dashboard."
          : r.status === 429 ? "RentCast call limit reached for this period (free tier = 50/mo)."
          : `RentCast error ${r.status}.`,
        detail: body.slice(0, 300),
      });
    }

    const data = await r.json();
    return res.status(200).json({
      rent: data.rent ? Math.round(Number(data.rent)) : null,
      rentLow: data.rentRangeLow ? Math.round(Number(data.rentRangeLow)) : null,
      rentHigh: data.rentRangeHigh ? Math.round(Number(data.rentRangeHigh)) : null,
      subjectAddress: data.subjectProperty?.formattedAddress || address,
      comps: Array.isArray(data.comparables) ? data.comparables.length : null,
      // The rental comps themselves, for the map and list under the rent card. Same response, no extra credit.
      compList: Array.isArray(data.comparables) ? data.comparables.slice(0, 25).map((c) => ({
        address: c.formattedAddress || c.addressLine1 || "",
        lat: c.latitude ?? null, lng: c.longitude ?? null,
        rent: c.price != null ? Math.round(Number(c.price)) : null,
        beds: c.bedrooms ?? null, baths: c.bathrooms ?? null, sqft: c.squareFootage ?? null,
        type: c.propertyType || null, status: c.status || null,
        distance: c.distance != null ? Math.round(Number(c.distance) * 100) / 100 : null,
        daysOld: c.daysOld ?? null,
        match: c.correlation != null ? Math.round(Number(c.correlation) * 100) : null,
      })) : [],
      subjectLat: data.subjectProperty?.latitude ?? null,
      subjectLng: data.subjectProperty?.longitude ?? null,
      search: used,
      // What the estimate was actually priced for: RentCast's resolved subject, falling back to what we sent.
      basis: {
        beds: data.subjectProperty?.bedrooms ?? beds ?? null,
        baths: data.subjectProperty?.bathrooms ?? baths ?? null,
        sqft: data.subjectProperty?.squareFootage ?? sqft ?? null,
      },
    });
  } catch (err) {
    return res.status(502).json({ error: "Could not reach RentCast.", detail: String(err).slice(0, 200) });
  }
}
