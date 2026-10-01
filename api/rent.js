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
  // Comp settings. Radius and look-back match the RentCast website without Pro (5 miles, 270 days, per
  // RentCast's docs: Property Valuation > "AVM Values: API vs. RentCast Website"). Comp count is 25, the
  // API's maximum (the website uses 20), per B, Sep 30 2026: a bigger pool of comps inside the same
  // 5-mile, 270-day box. Expect it to land close to, not exactly on, the website's number.
  const SITE = { compCount: "25", maxRadius: "5", daysOld: "270" };
  for (const [k, v] of Object.entries(SITE)) params.set(k, v);
  const call = (p) => fetch(`https://api.rentcast.io/v1/avm/rent/long-term?${p.toString()}`, { headers: { "X-Api-Key": key, Accept: "application/json" } });

  try {
    let r = await call(params);
    let widened = false;
    // RentCast warns that a tight radius or look-back can come back with "not enough comps". When that
    // happens, ask once more with its own defaults instead of handing the rep an error.
    if (!r.ok && ![401, 429].includes(r.status)) {
      const loose = new URLSearchParams(params);
      loose.delete("maxRadius"); loose.delete("daysOld");
      const r2 = await call(loose);
      if (r2.ok) { r = r2; widened = true; }
    }

    if (!r.ok) {
      const body = await r.text();
      return res.status(r.status).json({
        error:
          r.status === 404 ? "RentCast couldn't estimate rent for that address. Enter rent manually."
          : r.status === 401 ? "RentCast rejected the API key. Re-check RENTCAST_API_KEY in Vercel."
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
      search: widened ? "RentCast default search" : "within 5 mi, last 270 days",
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
