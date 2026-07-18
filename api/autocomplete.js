// /api/autocomplete.js — address typeahead.
// Primary: Google Places Autocomplete (same GOOGLE_MAPS_KEY as photos) — google.com-grade matching,
// US addresses only. Fallback: Photon (OpenStreetMap, free, no key) when the key is missing or Google
// errors, so the search bar never goes dark.
// Called as:  /api/autocomplete?q=1215 s pres
// Returns:    { suggestions: ["1215 S Preston St, Louisville, KY 40203", ...] }

export default async function handler(req, res) {
  const q = (req.query.q || "").toString().trim();
  if (q.length < 4) return res.status(200).json({ suggestions: [] });

  const key = process.env.GOOGLE_MAPS_KEY;
  if (key) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&types=address&components=country:us&key=${key}`;
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        if (data.status === "OK" || data.status === "ZERO_RESULTS") {
          const suggestions = (data.predictions || [])
            .map((p) => String(p.description || "").replace(/, USA$/, ""))
            .filter((s, i, arr) => s && arr.indexOf(s) === i)
            .slice(0, 6);
          return res.status(200).json({ suggestions });
        }
      }
    } catch { /* fall through to Photon */ }
  }

  // Fallback: Photon (OSM) — keyless, keeps typeahead alive if Google is unavailable.
  try {
    const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`, { headers: { Accept: "application/json" } });
    if (!r.ok) return res.status(200).json({ suggestions: [] });
    const data = await r.json();
    const suggestions = (data.features || [])
      .map((f) => f.properties || {})
      .filter((p) => (p.countrycode === "US" || p.country === "United States"))
      .map((p) => {
        const line1 = [p.housenumber, p.street].filter(Boolean).join(" ");
        const cityState = [p.city || p.county, p.state].filter(Boolean).join(", ");
        return [line1 || p.name, cityState, p.postcode].filter(Boolean).join(", ").replace(/,\s*,/g, ", ").trim();
      })
      .filter((s, i, arr) => s && arr.indexOf(s) === i);
    return res.status(200).json({ suggestions });
  } catch {
    return res.status(200).json({ suggestions: [] });
  }
}
