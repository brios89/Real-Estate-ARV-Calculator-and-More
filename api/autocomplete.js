// Address predictions as the student types, for the Hobknob Co-Living Academy Deal Analyzer.
// Primary: Google Places Autocomplete with the GOOGLE_MAPS_KEY already saved in Vercel. Google gives
// 10,000 autocomplete requests a month free (pricing checked Nov 2026), and each address takes a few.
// Fallback: Photon (OpenStreetMap, free, no key) if the key is missing or Google errors.
// Results lean toward the student's own area using Vercel's IP location headers, so a student in
// Denver sees Denver addresses first. It is a soft lean, not a limit. Full addresses anywhere in the US match.
// Called as:  /api/autocomplete?q=1215 s pres
// Returns:    { suggestions: ["1215 S Preston St, Louisville, KY 40203", ...], source: "google" | "osm" }

export default async function handler(req, res) {
  const q = String(req.query.q || "").trim();
  if (q.length < 4 || q.length > 200) return res.status(200).json({ suggestions: [] });

  const lat = parseFloat(req.headers["x-vercel-ip-latitude"]);
  const lng = parseFloat(req.headers["x-vercel-ip-longitude"]);
  const near = isFinite(lat) && isFinite(lng) && req.headers["x-vercel-ip-country"] === "US" ? { lat, lng } : null;

  const key = process.env.GOOGLE_MAPS_KEY;
  if (key) {
    try {
      const params = new URLSearchParams({ input: q, types: "address", components: "country:us", key });
      if (near) { params.set("location", `${near.lat},${near.lng}`); params.set("radius", "150000"); }
      const r = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
      if (r.ok) {
        const data = await r.json();
        if (data.status === "OK" || data.status === "ZERO_RESULTS") {
          const suggestions = (data.predictions || [])
            .map((p) => String(p.description || "").replace(/, USA$/, ""))
            .filter((s, i, arr) => s && arr.indexOf(s) === i)
            .slice(0, 6);
          return res.status(200).json({ suggestions, source: "google" });
        }
      }
    } catch { /* fall through to Photon */ }
  }

  try {
    const params = new URLSearchParams({ q, limit: "6", lang: "en" });
    if (near) { params.set("lat", String(near.lat)); params.set("lon", String(near.lng)); }
    const r = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: { Accept: "application/json" } });
    if (!r.ok) return res.status(200).json({ suggestions: [] });
    const data = await r.json();
    const suggestions = (data.features || [])
      .map((f) => f.properties || {})
      .filter((p) => p.countrycode === "US" || p.country === "United States")
      .map((p) => {
        const line1 = [p.housenumber, p.street].filter(Boolean).join(" ");
        const cityState = [p.city || p.county, p.state].filter(Boolean).join(", ");
        return [line1 || p.name, cityState, p.postcode].filter(Boolean).join(", ").replace(/,\s*,/g, ", ").trim();
      })
      .filter((s, i, arr) => s && arr.indexOf(s) === i);
    return res.status(200).json({ suggestions, source: "osm" });
  } catch {
    return res.status(200).json({ suggestions: [] });
  }
}
