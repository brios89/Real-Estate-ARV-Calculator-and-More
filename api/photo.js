// Property photo proxy — Google Street View Static API, key kept server-side (GOOGLE_MAPS_KEY in
// Vercel env vars). The free metadata check runs first so addresses with no imagery return 404
// instead of Google's gray "no image" tile — the card's <img> then falls back to the placeholder.
// No key configured = 404 for everything = placeholders everywhere. Safe to deploy before the key exists.
export default async function handler(req, res) {
  try {
    const key = process.env.GOOGLE_MAPS_KEY;
    const address = String(req.query.address || "").trim();
    if (!key || !address) { res.status(404).end(); return; }
    const loc = encodeURIComponent(address);
    const meta = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${loc}&key=${key}`).then((r) => r.json());
    if (!meta || meta.status !== "OK") { res.status(404).end(); return; }
    const r = await fetch(`https://maps.googleapis.com/maps/api/streetview?size=240x200&location=${loc}&key=${key}`);
    if (!r.ok) { res.status(404).end(); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", r.headers.get("content-type") || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    res.status(200).send(buf);
  } catch {
    res.status(404).end();
  }
}
