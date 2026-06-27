// /api/rent.js — Vercel serverless function. Returns RentCast's long-term rent estimate.
// Called ONLY when the user opens the Rental tab (lazy-load), so address pulls that never
// touch the Rental tab stay at 1 RentCast credit instead of 2.
//
// Calls:  /api/rent?address=123 Main St, Louisville, KY
// Returns: { rent, rentLow, rentHigh, subjectAddress }

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
  const url = `https://api.rentcast.io/v1/avm/rent/long-term?${params.toString()}`;

  try {
    const r = await fetch(url, { headers: { "X-Api-Key": key, Accept: "application/json" } });

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
    });
  } catch (err) {
    return res.status(502).json({ error: "Could not reach RentCast.", detail: String(err).slice(0, 200) });
  }
}
