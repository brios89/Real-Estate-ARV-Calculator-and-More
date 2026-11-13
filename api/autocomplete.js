// Address predictions as the student types, for the Hobknob Co-Living Academy Deal Analyzer.
// 1) Google Places API (New) Autocomplete, then 2) the legacy Places Autocomplete, both with the
//    GOOGLE_MAPS_KEY saved in Vercel. Google gives 10,000 autocomplete requests a month free
//    (pricing checked Nov 2026). Google stopped letting new projects turn on the legacy API in 2025,
//    so the New API is tried first.
// 3) Photon (OpenStreetMap, free, no key) as a last resort. OSM often has no house numbers, so its
//    predictions are rough. If Google fails, the response says why in "googleError" so it can be fixed.
// Results lean toward the student's own area using Vercel's IP location headers. Soft lean only.
// Called as:  /api/autocomplete?q=1215 s pres
// Returns:    { suggestions: [...], source: "google" | "osm", googleError?: "..." }

const clean = (s) => String(s || "").replace(/, USA$/, "").trim();
const uniq = (list) => list.filter((s, i, arr) => s && arr.indexOf(s) === i).slice(0, 6);

export default async function handler(req, res) {
  const q = String(req.query.q || "").trim();
  if (q.length < 4 || q.length > 200) return res.status(200).json({ suggestions: [] });

  const lat = parseFloat(req.headers["x-vercel-ip-latitude"]);
  const lng = parseFloat(req.headers["x-vercel-ip-longitude"]);
  const near = isFinite(lat) && isFinite(lng) && req.headers["x-vercel-ip-country"] === "US" ? { lat, lng } : null;

  const key = process.env.GOOGLE_MAPS_KEY;
  const errors = [];
  if (!key) errors.push("GOOGLE_MAPS_KEY is not set in Vercel");

  // 1) Places API (New)
  if (key) {
    try {
      const body = { input: q, includedRegionCodes: ["us"], includedPrimaryTypes: ["street_address", "premise", "subpremise"] };
      if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 50000.0 } };
      const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        const suggestions = uniq((data.suggestions || []).map((s) => clean(s.placePrediction?.text?.text)));
        return res.status(200).json({ suggestions, source: "google" });
      }
      errors.push(`Places API (New): ${data.error?.status || r.status} ${data.error?.message || ""}`.trim());
    } catch (e) { errors.push(`Places API (New): ${e?.message || "request failed"}`); }
  }

  // 2) Legacy Places Autocomplete
  if (key) {
    try {
      const params = new URLSearchParams({ input: q, types: "address", components: "country:us", key });
      if (near) { params.set("location", `${near.lat},${near.lng}`); params.set("radius", "150000"); }
      const r = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
      const data = await r.json().catch(() => ({}));
      if (data.status === "OK" || data.status === "ZERO_RESULTS") {
        return res.status(200).json({ suggestions: uniq((data.predictions || []).map((p) => clean(p.description))), source: "google" });
      }
      errors.push(`Places API (Legacy): ${data.status || r.status} ${data.error_message || ""}`.trim());
    } catch (e) { errors.push(`Places API (Legacy): ${e?.message || "request failed"}`); }
  }

  // 3) Photon (OpenStreetMap)
  const googleError = errors.join(" | ").slice(0, 600);
  try {
    const params = new URLSearchParams({ q, limit: "10", lang: "en" });
    if (near) { params.set("lat", String(near.lat)); params.set("lon", String(near.lng)); }
    const r = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: { Accept: "application/json" } });
    if (!r.ok) return res.status(200).json({ suggestions: [], googleError });
    const data = await r.json();
    const rows = (data.features || []).map((f) => f.properties || {}).filter((p) => p.countrycode === "US" || p.country === "United States");
    // Put real house-number matches first when the student typed a number.
    const wantsNumber = /^\d/.test(q);
    rows.sort((a, b) => (wantsNumber ? Number(!!b.housenumber) - Number(!!a.housenumber) : 0));
    const suggestions = uniq(rows.map((p) => {
      const line1 = [p.housenumber, p.street].filter(Boolean).join(" ");
      const cityState = [p.city || p.county, p.state].filter(Boolean).join(", ");
      return [line1 || p.name, cityState, p.postcode].filter(Boolean).join(", ").replace(/,\s*,/g, ", ").trim();
    }));
    return res.status(200).json({ suggestions, source: "osm", googleError });
  } catch {
    return res.status(200).json({ suggestions: [], googleError });
  }
}
