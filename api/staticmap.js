// /api/staticmap.js — Vercel serverless function. Renders the rental-comp map for the buyer deck as a
// PNG (Google Static Maps API, same GOOGLE_MAPS_KEY as the photos, kept server-side) and returns it as
// base64 so the deck can embed it. Static Maps is an Essentials SKU: 10,000 free maps a month.
//
// Calls:  /api/staticmap?subject=38.22,-85.75&pins=38.23,-85.76|38.21,-85.74   (up to 9 pins, labeled 1-9)
// Returns: { image: "image/png;base64,..." }   or   { error }
export default async function handler(req, res) {
  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return res.status(500).json({ error: "GOOGLE_MAPS_KEY is not set." });
  const ll = (v) => {
    const [a, b] = String(v || "").split(",").map(Number);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? `${a.toFixed(6)},${b.toFixed(6)}` : null;
  };
  const subject = ll(req.query.subject);
  const pins = String(req.query.pins || "").split("|").map(ll).filter(Boolean).slice(0, 9);
  if (!subject && !pins.length) return res.status(400).json({ error: "Provide subject and/or pins." });

  const q = new URLSearchParams({ size: "640x400", scale: "2", maptype: "roadmap", key });
  // Gray look to match the app's map: no color, no business pins.
  for (const st of ["saturation:-100", "feature:poi.business|visibility:off", "feature:poi|element:labels.icon|visibility:off", "feature:transit|visibility:off"]) q.append("style", st);
  pins.forEach((p, i) => q.append("markers", `color:0x6b7f99|label:${i + 1}|${p}`));
  if (subject) q.append("markers", `color:0x06b6d4|${subject}`);

  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${q.toString()}`);
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) {
      const body = await r.text().catch(() => "");
      return res.status(502).json({ error: "Google Static Maps did not return an image. Make sure the Maps Static API is enabled on GOOGLE_MAPS_KEY.", detail: body.slice(0, 200) });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ image: `${type.split(";")[0]};base64,${buf.toString("base64")}` });
  } catch (err) {
    return res.status(502).json({ error: "Could not reach Google Static Maps.", detail: String(err).slice(0, 200) });
  }
}
