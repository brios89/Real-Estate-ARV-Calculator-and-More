// Subject property deep-dive — one RentCast property-record lookup, curated into labeled sections the
// client renders generically. Fetched on demand (1 credit) when the user opens "Subject property details".
export default async function handler(req, res) {
  const key = process.env.RENTCAST_API_KEY;
  const address = String(req.query.address || "").trim();
  if (!key) return res.status(500).json({ error: "RENTCAST_API_KEY is not configured." });
  if (!address) return res.status(400).json({ error: "address is required" });
  try {
    const r = await fetch(`https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`, {
      headers: { "X-Api-Key": key, Accept: "application/json" },
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data?.error || `RentCast error (${r.status})` });
    const p = Array.isArray(data) ? data[0] : data;
    if (!p) return res.status(404).json({ error: "No property record found for that address." });

    const f = p.features || {};
    const yn = (v) => (v === true ? "Yes" : v === false ? "No" : null);
    const usd0 = (n) => (n > 0 ? `$${Math.round(n).toLocaleString()}` : null);
    const dt = (iso) => { const d = new Date(iso); return isNaN(d) ? null : d.toLocaleDateString("en-US", { timeZone: "UTC" }); };
    const lot = p.lotSize > 0 ? (p.lotSize >= 10890 ? `${(p.lotSize / 43560).toFixed(2)} acres` : `${Math.round(p.lotSize).toLocaleString()} sqft`) : null;
    const latestKey = (o) => (o && typeof o === "object" ? Object.keys(o).sort().pop() : null);
    const taY = latestKey(p.taxAssessments); const ta = taY ? p.taxAssessments[taY] : null;
    const txY = latestKey(p.propertyTaxes); const tx = txY ? p.propertyTaxes[txY] : null;
    const ownerNames = p.owner && Array.isArray(p.owner.names) ? p.owner.names.join(", ") : null;
    const mail = p.owner && p.owner.mailingAddress ? p.owner.mailingAddress.formattedAddress ||
      [p.owner.mailingAddress.addressLine1, p.owner.mailingAddress.city, p.owner.mailingAddress.state].filter(Boolean).join(", ") : null;

    const pick = (pairs) => pairs.filter(([, v]) => v != null && v !== "");
    const sections = {
      "Property": pick([
        ["Beds", p.bedrooms], ["Baths", p.bathrooms], ["Sq Ft", p.squareFootage ? Math.round(p.squareFootage).toLocaleString() : null],
        ["Year Built", p.yearBuilt], ["Lot Size", lot], ["Stories", f.floorCount], ["Rooms", f.roomCount],
        ["Type", p.propertyType], ["Heating", f.heatingType || yn(f.heating)], ["Cooling", f.coolingType || yn(f.cooling)],
        ["Fireplace", f.fireplaceType || yn(f.fireplace)], ["Garage", f.garageType || (f.garageSpaces ? `${f.garageSpaces} spaces` : yn(f.garage))],
        ["Pool", yn(f.pool)], ["Exterior", f.exteriorType], ["Roof", f.roofType], ["Foundation", f.foundationType],
        ["Architecture", f.architectureType],
      ]),
      "Ownership": pick([
        ["Owner", ownerNames],
        ["Owner Occupied", p.ownerOccupied === false ? "No — ABSENTEE" : yn(p.ownerOccupied)],
        ["Owner Mailing Address", mail],
      ]),
      "Tax & Sale": pick([
        ["Last Sale Price", usd0(p.lastSalePrice)], ["Last Sale Date", dt(p.lastSaleDate)],
        [`Assessed Value${taY ? ` (${taY})` : ""}`, ta ? usd0(ta.value) : null],
        [`Assessed Land`, ta ? usd0(ta.land) : null], [`Assessed Improvements`, ta ? usd0(ta.improvements) : null],
        [`Property Taxes${txY ? ` (${txY})` : ""}`, tx ? usd0(tx.total) : null],
      ]),
      "Legal": pick([
        ["Legal Description", p.legalDescription], ["Subdivision", p.subdivision], ["Zoning", p.zoning],
        ["County", p.county], ["APN", p.assessorID],
      ]),
    };
    Object.keys(sections).forEach((k) => { if (!sections[k].length) delete sections[k]; });
    return res.status(200).json({ address: p.formattedAddress || address, sections });
  } catch (e) {
    return res.status(500).json({ error: "Lookup failed." });
  }
}
