// Address check for the Hobknob Co-Living Academy Deal Analyzer.
// Uses the free U.S. Census Bureau geocoder (no key, no cost). It confirms the address, and returns
// the standardized form, map coordinates, county and state. It does NOT return beds, baths, sq ft or
// taxes. Those need a paid data service, which Brian chose not to use (Nov 2026).
export default async function handler(req, res) {
  const q = String(req.query.q || "").trim();
  if (!q || q.length > 200) return res.status(400).json({ error: "Type a full street address, city and state." });
  const url = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?" + new URLSearchParams({
    address: q, benchmark: "Public_AR_Current", vintage: "Current_Current", layers: "Counties", format: "json",
  });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) return res.status(502).json({ error: "The address service is not responding right now. Try again in a minute." });
    const data = await r.json();
    const m = data?.result?.addressMatches?.[0];
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    if (!m) return res.status(200).json({ found: false });
    const county = m.geographies?.Counties?.[0] || {};
    return res.status(200).json({
      found: true,
      matched: m.matchedAddress || "",
      lat: m.coordinates?.y ?? null,
      lng: m.coordinates?.x ?? null,
      county: county.NAME || "",
      state: m.addressComponents?.state || "",
      zip: m.addressComponents?.zip || "",
    });
  } catch (e) {
    return res.status(502).json({ error: e?.name === "AbortError" ? "The address service took too long. Try again in a minute." : "Address lookup failed. Try again in a minute." });
  } finally {
    clearTimeout(timer);
  }
}
