// /api/comp.js  — Vercel serverless function (runs on the server, NOT in the browser)
// Your RentCast API key lives in process.env.RENTCAST_API_KEY and is never sent to the browser.
//
// The calculator calls:  /api/comp?address=123 Main St, Louisville, KY
// This function calls RentCast's value-estimate (AVM) endpoint and returns a trimmed,
// browser-safe payload: { arv, subject, comps: [...] }

export default async function handler(req, res) {
  // Lock CORS to same-origin by default. If you ever host the UI on a different domain,
  // set ALLOWED_ORIGIN in Vercel env vars to that domain.
  const allowed = process.env.ALLOWED_ORIGIN || "";
  if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);

  const key = process.env.RENTCAST_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Server is missing RENTCAST_API_KEY. Add it in Vercel → Settings → Environment Variables." });
  }

  const address = (req.query.address || "").toString().trim();
  if (!address) {
    return res.status(400).json({ error: "Provide an address, e.g. /api/comp?address=123 Main St, Louisville, KY" });
  }

  // Tuning. Defaults dial the comps in the way we want:
  //  - daysOld=365  → only comps listed/sold within the last 12 months
  //  - compCount=25 → pull a deep pool so we can filter to ±250 sqft and still have 8 good ones
  const compCount = req.query.compCount || "25";
  const maxRadius = req.query.maxRadius || "";
  const daysOld = req.query.daysOld || "365";
  const sqftBand = Number(req.query.sqftBand || 250);   // ± sq ft vs subject
  const keepCount = Number(req.query.keepCount || 8);    // how many comps to keep for ARV

  const params = new URLSearchParams({ address, compCount });
  if (maxRadius) params.set("maxRadius", maxRadius);
  if (daysOld) params.set("daysOld", daysOld);

  const url = `https://api.rentcast.io/v1/avm/value?${params.toString()}`;

  try {
    const r = await fetch(url, {
      headers: { "X-Api-Key": key, Accept: "application/json" },
    });

    if (!r.ok) {
      const body = await r.text();
      // 404 = address not found; 401 = bad key; 429 = out of calls / rate limited
      return res.status(r.status).json({
        error:
          r.status === 404 ? "RentCast couldn't find that address. Check spelling, or enter comps manually."
          : r.status === 401 ? "RentCast rejected the API key. Re-check RENTCAST_API_KEY in Vercel."
          : r.status === 429 ? "RentCast call limit reached for this period (free tier = 50/mo)."
          : `RentCast error ${r.status}.`,
        detail: body.slice(0, 300),
      });
    }

    const data = await r.json();
    const subj = data.subjectProperty || {};
    const subjSqft = Number(subj.squareFootage) || 0;

    // Build the comp list, dialed in the way the user asked:
    //  1) must have a price and square footage
    //  2) within ±sqftBand (default 250) of the subject's square footage, when we know the subject sqft
    //  3) keep RentCast's correlation order (most similar first)
    //  4) keep only the top `keepCount` (default 8) for the ARV calc
    const comps = (data.comparables || [])
      .filter((c) => Number(c.price) > 0 && Number(c.squareFootage) > 0)
      .filter((c) => (subjSqft > 0 ? Math.abs(Number(c.squareFootage) - subjSqft) <= sqftBand : true))
      .slice(0, keepCount)
      .map((c) => ({
        address: c.formattedAddress || c.addressLine1 || "",
        price: Math.round(Number(c.price)),
        sqft: Math.round(Number(c.squareFootage)),
        beds: c.bedrooms ?? null,
        baths: c.bathrooms ?? null,
        yearBuilt: c.yearBuilt ?? null,
        propertyType: c.propertyType ?? null,
        distance: c.distance ?? null,
        daysOnMarket: c.daysOnMarket ?? null,
        daysOld: c.daysOld ?? null,
        listedDate: c.listedDate ?? null,     // when it hit the market
        removedDate: c.removedDate ?? null,   // when it went off market (best proxy for "sold")
        lastSeenDate: c.lastSeenDate ?? null,
        status: c.status ?? null,
        correlation: c.correlation ?? null,
        ppsf: Math.round(Number(c.price) / Number(c.squareFootage)),
      }));

    return res.status(200).json({
      arv: data.price ? Math.round(Number(data.price)) : null,   // RentCast's AVM value
      priceLow: data.priceRangeLow ? Math.round(Number(data.priceRangeLow)) : null,
      priceHigh: data.priceRangeHigh ? Math.round(Number(data.priceRangeHigh)) : null,
      subject: {
        address: subj.formattedAddress || address,
        sqft: subj.squareFootage ? Math.round(Number(subj.squareFootage)) : null,
        beds: subj.bedrooms ?? null,
        baths: subj.bathrooms ?? null,
        yearBuilt: subj.yearBuilt ?? null,
        propertyType: subj.propertyType ?? null,
        lastSaleDate: subj.lastSaleDate ?? null,     // real recorded sale
        lastSalePrice: subj.lastSalePrice ?? null,
      },
      meta: { sqftBand, keepCount, daysOld, subjectSqft: subjSqft || null },
      comps,
    });
  } catch (err) {
    return res.status(502).json({ error: "Could not reach RentCast.", detail: String(err).slice(0, 200) });
  }
}
