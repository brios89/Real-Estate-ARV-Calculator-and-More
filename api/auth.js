// Student passcode check for the Hobknob Co-Living Academy Deal Analyzer.
// The passcode lives only in the ACADEMY_PASSCODE environment variable in Vercel, never in the code.
// To change it (for example when a cohort ends), update the variable in Vercel and redeploy.
import { timingSafeEqual, createHash } from "node:crypto";

const sameText = (a, b) => {
  // Compare hashes so the check takes the same time no matter how much of the guess is right.
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST." });
  const expected = String(process.env.ACADEMY_PASSCODE || "").trim();
  if (!expected) {
    // Fail closed: with no passcode set, nobody gets in.
    return res.status(503).json({ ok: false, error: "The analyzer is not set up yet (no passcode configured). Please contact Hobknob Co-Living Academy." });
  }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const code = String((body && body.code) || "").trim();
  if (code && sameText(code.toLowerCase(), expected.toLowerCase())) return res.status(200).json({ ok: true });
  // A short pause on a wrong guess slows down anyone trying passcodes one after another.
  await new Promise((r) => setTimeout(r, 700));
  return res.status(401).json({ ok: false, error: "That passcode did not work. Check your course for the current one." });
}
