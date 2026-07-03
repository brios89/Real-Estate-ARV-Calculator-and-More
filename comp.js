// /api/autocomplete.js — Vercel serverless function
// Address typeahead for the calculator. Uses Photon (OpenStreetMap-based),
// which is free and needs no API key. Returns a list of formatted US address strings.
//
// Called as:  /api/autocomplete?q=1145 S 32nd
// Returns:    { suggestions: ["1145 S 32nd St, Louisville, KY 40211", ...] }
//
// To upgrade to Google-grade accuracy later, swap the fetch below for the Google
// Places Autocomplete API and read a GOOGLE_PLACES_API_KEY env var.

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || "";
  if (allowed) res.setHeader("Access-Control-Allow-Origin", allowed);

  const q = (req.query.q || "").toString().trim();
  if (q.length < 4) return res.status(200).json({ suggestions: [] });

  // Bias results toward the US; limit to a handful of matches.
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=en`;

  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return res.status(200).json({ suggestions: [] });
    const data = await r.json();

    const suggestions = (data.features || [])
      .map((f) => f.properties || {})
      // Keep US results, and prefer ones with a house number (actual addresses)
      .filter((p) => (p.countrycode === "US" || p.country === "United States"))
      .map((p) => {
        const line1 = [p.housenumber, p.street].filter(Boolean).join(" ");
        const cityState = [p.city || p.county, p.state].filter(Boolean).join(", ");
        const parts = [line1 || p.name, cityState, p.postcode].filter(Boolean);
        return parts.join(line1 || p.name ? ", " : "").replace(/, ,/g, ",");
      })
      .map((s) => s.replace(/\s+,/g, ",").replace(/,\s*,/g, ", ").trim())
      .filter((s, i, arr) => s && arr.indexOf(s) === i); // dedupe + drop empties

    return res.status(200).json({ suggestions });
  } catch (err) {
    return res.status(200).json({ suggestions: [] });
  }
}
