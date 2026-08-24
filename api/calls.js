// Shared Offer Call storage — the team-wide layer behind the Offer Call drawer.
//
// Calls are keyed by subject address, so whoever opens that address next sees what the last
// person captured: Mary's qualifying facts, the underwriter's pain points, the closer's numbers.
//
// Backed by Upstash Redis via the Vercel Marketplace integration, which injects
// KV_REST_API_URL and KV_REST_API_TOKEN automatically. If those are missing, every request
// returns { disabled: true } and the app quietly falls back to browser-only saving.
//
// SECURITY: this app is on a public URL and these records hold seller PII. Every request must
// carry the team passcode (TEAM_PASSCODE env var) in the x-ylhb-key header. No passcode set on
// the server = the endpoint refuses to run at all, so a misconfiguration can never expose data.

const KEY_PREFIX = "call:";

const norm = (addr) => String(addr || "").trim().toLowerCase().replace(/\s+/g, " ");

async function upstash(path, { body } = {}) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const r = await fetch(`${base}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body }),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  const base = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const passcode = process.env.TEAM_PASSCODE;

  // Not configured yet: tell the client so it stays on browser-only saving instead of erroring.
  if (!base || !token) return res.status(200).json({ disabled: true, reason: "no-store" });
  if (!passcode) return res.status(200).json({ disabled: true, reason: "no-passcode" });

  // Gate everything behind the shared team passcode.
  const given = req.headers["x-ylhb-key"] || "";
  if (given !== passcode) return res.status(401).json({ error: "bad-passcode" });

  const address = norm(req.query.address);
  if (!address) return res.status(400).json({ error: "address is required" });
  const key = KEY_PREFIX + encodeURIComponent(address);

  try {
    if (req.method === "GET") {
      const out = await upstash(`get/${key}`);
      if (!out || out.result == null) return res.status(200).json({ found: false });
      let rec = null;
      try { rec = JSON.parse(out.result); } catch { rec = null; }
      if (!rec) return res.status(200).json({ found: false });
      return res.status(200).json({ found: true, record: rec });
    }

    if (req.method === "POST") {
      // Body arrives as an object on Vercel's node runtime; accept a raw string too.
      const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (!payload || typeof payload !== "object" || !payload.call) {
        return res.status(400).json({ error: "call payload is required" });
      }
      const record = {
        call: payload.call,
        repairOverride: payload.repairOverride ?? "",
        wholesaleFee: payload.wholesaleFee ?? "",
        at: new Date().toISOString(),
        by: String(payload.by || "").slice(0, 40),   // who captured it — shown on the next person's screen
        address: String(payload.address || "").slice(0, 200),
      };
      await upstash(`set/${key}`, { body: JSON.stringify(record) });
      return res.status(200).json({ ok: true, record });
    }

    if (req.method === "DELETE") {
      await upstash(`del/${key}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    // Never break a live call over a storage hiccup — the client keeps its local copy.
    return res.status(200).json({ error: "store-unavailable", detail: String(e.message || e) });
  }
}
