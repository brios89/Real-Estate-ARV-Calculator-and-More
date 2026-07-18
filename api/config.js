// Public runtime config. The Maps JavaScript API must run in the browser, so the key is served to the
// client — standard for Google Maps sites. Protect it in Google console: restrict the key to Street View
// Static API + Places API + Maps JavaScript API, and set daily quota caps.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.status(200).json({ mapsKey: process.env.GOOGLE_MAPS_KEY || "" });
}
