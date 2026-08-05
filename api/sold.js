// /api/sold.js — Vercel serverless function (runs on the server, NOT in the browser).
// Pulls ACTUAL sold comps from RentCast's Property Records endpoint (/v1/properties),
// using recorded sale prices (lastSalePrice / lastSaleDate) — not AVM estimates.
//
// Billing note: RentCast bills per REQUEST, not per record. One call to /v1/properties
// returns up to 500 records, so a full sold-comp pull for a deal = 1 API credit.
//
// The calculator calls:
//   /api/sold?address=123 Main St, Louisville, KY&subjectSqft=1500&propertyType=Single Family
// Returns a trimmed, browser-safe payload:
//   { soldArv, medianPpsf, count, window, subject, comps: [...] }

// Straight-line distance in miles between two lat/lng points (haversine). RentCast's Property Records
// endpoint doesn't return a distance the way the AVM endpoint does — but it returns coordinates, and the
// subject itself is usually one of the records, so we compute comp distances ourselves.
const distMi = (lat1, lon1, lat2, lon2) => {
  const R = 3958.8, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export default async function handler(req, res) {
  // Lock CORS to same-origin by default. Set ALLOWED_ORIGIN in Vercel if the UI is on another domain.
  const allowed = process.env.ALLOWED_ORIGIN || "";
  if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);

  const key = process.env.RENTCAST_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Server is missing RENTCAST_API_KEY. Add it in Vercel → Settings → Environment Variables." });
  }

  const address = (req.query.address || "").toString().trim();
  if (!address) {
    return res.status(400).json({ error: "Provide an address, e.g. /api/sold?address=123 Main St, Louisville, KY" });
  }

  // Tuning. Defaults match how /api/comp already thinks, tuned for actual sold comps:
  //  - radius=1         → miles around the subject (RentCast circular search)
  //  - saleDateRange    → only properties SOLD within this many days (365 = last 12 months)
  //  - propertyType     → keep comps to the subject's type (optional; omitted = all types)
  //  - subjectSqft      → the subject's size, used to filter ±sqftBand and imply the ARV (from the AVM pull)
  //  - sqftBand=250     → ± sq ft vs the subject, filtered locally
  //  - keepCount=8      → how many sold comps to keep for the ARV
  const radius = req.query.radius || "1";
  const saleDateRange = req.query.saleDateRange || "365";
  const propertyType = (req.query.propertyType || "").toString().trim();
  const subjectSqft = Number(req.query.subjectSqft || 0);
  const sqftBand = Number(req.query.sqftBand || 250);
  const keepCount = Number(req.query.keepCount || 12);

  // One request, up to 500 records = 1 RentCast credit regardless of how many come back.
  const params = new URLSearchParams({ address, radius, saleDateRange, limit: "500" });
  if (propertyType) params.set("propertyType", propertyType);

  const url = `https://api.rentcast.io/v1/properties?${params.toString()}`;

  try {
    const r = await fetch(url, {
      headers: { "X-Api-Key": key, Accept: "application/json" },
    });

    if (!r.ok) {
      const body = await r.text();
      // 404 = nothing found; 401 = bad key; 429 = out of calls / rate limited
      return res.status(r.status).json({
        error:
          r.status === 404 ? "RentCast found no sold records for that area. Widen the radius or date range, or comp manually."
          : r.status === 401 ? "RentCast rejected the API key. Re-check RENTCAST_API_KEY in Vercel."
          : r.status === 429 ? "RentCast call limit reached for this period (free tier = 50/mo)."
          : `RentCast error ${r.status}.`,
        detail: body.slice(0, 300),
      });
    }

    const data = await r.json();
    // /properties returns a JSON array of records; stay defensive in case of an envelope.
    const records = Array.isArray(data) ? data : (data.properties || data.results || []);
    const now = Date.now();
    const windowDays = Number(saleDateRange) || 365;

    // Subject coordinates, best source first:
    //  1) passed in by the client — captured from the AVM pull's subjectProperty (always present in the
    //     Auto-comp chain, which is the only thing that triggers this endpoint)
    //  2) fallback: find the subject in the raw records by address. NOTE: usually misses, because this
    //     query filters to properties SOLD in the last 12 months — and the subject typically hasn't.
    const qLat = Number(req.query.subjectLat), qLng = Number(req.query.subjectLng);
    const addrLc = address.toLowerCase();
    const streetLc = addrLc.split(",")[0].trim();
    const subjRec = records.find((p) => {
      const a = String(p.formattedAddress || p.addressLine1 || "").trim().toLowerCase();
      return a === addrLc || (streetLc.length > 3 && a.startsWith(streetLc));
    });
    const sLat = Number.isFinite(qLat) ? qLat : (subjRec && subjRec.latitude != null ? Number(subjRec.latitude) : NaN);
    const sLng = Number.isFinite(qLng) ? qLng : (subjRec && subjRec.longitude != null ? Number(subjRec.longitude) : NaN);

    let comps = records
      .map((p) => {
        const price = Number(p.lastSalePrice) || 0;   // actual RECORDED sale price (off the deed)
        const sqft = Number(p.squareFootage) || 0;
        return {
          address: p.formattedAddress || p.addressLine1 || "",
          salePrice: price ? Math.round(price) : 0,
          saleDate: p.lastSaleDate || null,           // actual recorded sale date
          sqft: sqft ? Math.round(sqft) : 0,
          beds: p.bedrooms ?? null,
          baths: p.bathrooms ?? null,
          yearBuilt: p.yearBuilt ?? null,
          lat: p.latitude ?? null,                    // coordinates for the comp map
          lng: p.longitude ?? null,
          propertyType: p.propertyType ?? null,
          // Extra record detail for the comp pop-up — all of this rides the SAME /properties response
          // we already paid for; nothing here costs an extra RentCast credit. Every field is defensive:
          // when RentCast doesn't have it, it comes through null and the pop-up simply doesn't show it.
          lotSize: p.lotSize ?? null,
          ownerOccupied: typeof p.ownerOccupied === "boolean" ? p.ownerOccupied : null,
          architecture: (p.features && p.features.architectureType) || null,
          heating: (p.features && (p.features.heatingType || (p.features.heating === true ? "Yes" : null))) || null,
          cooling: (p.features && (p.features.coolingType || (p.features.cooling === true ? "Yes" : null))) || null,
          garage: (p.features && (p.features.garageType || (p.features.garage === true ? (p.features.garageSpaces ? `${p.features.garageSpaces}-car` : "Yes") : null))) || null,
          saleHistory: Object.entries(p.history || {})
            .map(([k, v]) => (v && v.event && String(v.event).toLowerCase().includes("sale") ? { date: v.date || k, price: Number(v.price) || null } : null))
            .filter((e) => e && e.date)
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .slice(0, 12),
          distance: Number.isFinite(sLat) && Number.isFinite(sLng) && p.latitude != null && p.longitude != null
            ? Math.round(distMi(sLat, sLng, Number(p.latitude), Number(p.longitude)) * 100) / 100
            : (p.distance ?? null),                   // computed from coordinates; falls back gracefully
          ppsf: price > 0 && sqft > 0 ? Math.round(price / sqft) : null,
        };
      })
      // 1) must have a real recorded sale price AND a size, so $/sqft is meaningful
      .filter((c) => c.salePrice > 0 && c.sqft > 0 && c.ppsf)
      // 2) sold within the window (saleDateRange handles this server-side; belt-and-suspenders here)
      .filter((c) => {
        if (!c.saleDate) return true;
        const t = Date.parse(c.saleDate);
        return isNaN(t) ? true : (now - t) / 86400000 <= windowDays + 5;
      })
      // 3) drop the subject itself if it slipped into the results (same address)
      .filter((c) => c.address.trim().toLowerCase() !== address.toLowerCase());

    // ---- MLS cross-check (1 extra RentCast request, /listings/sale) ----
    // A recorded deed tells you a property CLOSED; it doesn't tell you it was marketed. Off-market
    // transfers (family deals, wholesale assignments, foreclosure deeds) pollute an ARV. So we pull
    // the INACTIVE sale listings in the same radius and match them to the sold comps by address:
    // a match whose removal date lines up with the deed date = a real arm's-length MLS sale.
    // Best-effort by design — if this call fails, comps still return, just without MLS badges.
    let mlsChecked = false;
    try {
      const lp = new URLSearchParams({ address, radius, status: "Inactive", limit: "500", daysOld: "545" });
      if (propertyType) lp.set("propertyType", propertyType);
      const lr = await fetch(`https://api.rentcast.io/v1/listings/sale?${lp.toString()}`, {
        headers: { "X-Api-Key": key, Accept: "application/json" },
      });
      if (lr.ok) {
        const ldata = await lr.json();
        const listings = Array.isArray(ldata) ? ldata : (ldata.listings || ldata.results || []);
        const norm = (x) => String(x || "").trim().toLowerCase().replace(/\s+/g, " ");
        const byAddr = new Map();
        for (const l of listings) {
          const k = norm(l.formattedAddress || l.addressLine1);
          if (!k) continue;
          const prev = byAddr.get(k);
          if (!prev || String(l.removedDate || l.lastSeenDate || "") > String(prev.removedDate || prev.lastSeenDate || "")) byAddr.set(k, l);
        }
        for (const c of comps) {
          const l = byAddr.get(norm(c.address));
          if (!l) continue;
          // The listing must line up with THIS sale: removed from market up to ~8 months before the
          // deed date (closings lag listings) or 60 days after. No dates = no MLS claim made.
          const rd = Date.parse(l.removedDate || l.lastSeenDate || "");
          const sd = Date.parse(c.saleDate || "");
          if (isNaN(rd) || isNaN(sd)) continue;
          const lagDays = (sd - rd) / 86400000;
          if (lagDays < -60 || lagDays > 240) continue;
          c.mls = {
            name: l.mlsName || null,
            number: l.mlsNumber || null,
            listPrice: Number(l.price) || null,
            listedDate: l.listedDate || null,
            removedDate: l.removedDate || null,
            daysOnMarket: l.daysOnMarket ?? null,
            listingType: l.listingType || null,
          };
        }
        mlsChecked = true;
      }
    } catch { /* keep going — MLS badges are a bonus, not a dependency */ }

    // Split by the ±sqft band around the subject; in-band comps are the clean ones for the ARV.
    const near = (c) => subjectSqft > 0 && Math.abs(c.sqft - subjectSqft) <= sqftBand;
    const sortClose = (arr) => arr.sort((a, b) => {
      const da = a.distance == null ? Infinity : a.distance;
      const db = b.distance == null ? Infinity : b.distance;
      if (da !== db) return da - db;                                            // closest first (when distance is available)
      return String(b.saleDate || "").localeCompare(String(a.saleDate || "")); // then most recent sale
    });

    const inBand = sortClose((subjectSqft > 0 ? comps.filter(near) : comps).slice());
    let chosen = inBand.slice(0, keepCount);
    // Guarantee at least keepCount comps when the pool allows: backfill with the closest-by-sqft
    // out-of-band sales (they'll trip the "sqft off" junk flag in the UI, so they're clearly marked).
    if (chosen.length < keepCount && subjectSqft > 0) {
      const fill = comps
        .filter((c) => !near(c))
        .sort((a, b) => Math.abs(a.sqft - subjectSqft) - Math.abs(b.sqft - subjectSqft));
      chosen = chosen.concat(fill.slice(0, keepCount - chosen.length));
    }
    comps = chosen;

    // Raw median $/sqft from the in-band comps (a fallback/reference — the calculator recomputes a
    // clean median that also drops beds/baths/age outliers via the junk filter, client-side).
    const arvPool = (inBand.length ? inBand : comps).slice(0, keepCount);
    const ppsfs = arvPool.map((c) => c.ppsf).filter((x) => x > 0).sort((a, b) => a - b);
    let medianPpsf = null;
    if (ppsfs.length) {
      const mid = Math.floor(ppsfs.length / 2);
      medianPpsf = ppsfs.length % 2 ? ppsfs[mid] : Math.round((ppsfs[mid - 1] + ppsfs[mid]) / 2);
    }
    const soldArv = medianPpsf && subjectSqft > 0 ? Math.round(medianPpsf * subjectSqft) : null;

    return res.status(200).json({
      soldArv,                    // median sold $/sqft × subject sqft — an ARV backed by real closings
      medianPpsf,                 // median $/sqft across the kept sold comps
      count: comps.length,
      mlsChecked,             // true = the /listings/sale cross-check ran; comps that matched carry a .mls object
      window: { radius: Number(radius), saleDateRange: windowDays, sqftBand, keepCount },
      subject: { sqft: subjectSqft || null, propertyType: propertyType || null },
      comps,
    });
  } catch (err) {
    return res.status(502).json({ error: "Could not reach RentCast.", detail: String(err).slice(0, 200) });
  }
}
