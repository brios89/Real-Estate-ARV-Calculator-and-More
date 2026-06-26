import React, { useState, useMemo, useEffect, useRef } from "react";
import { Home, Calculator, Building2, Layers, Banknote, RefreshCw, AlertTriangle, CheckCircle2, MinusCircle, Info, Zap, Loader2, MapPin, ExternalLink, TrendingDown } from "lucide-react";

// Where the proxies live. Same-origin by default on Vercel.
const COMP_API = "/api/comp";
const AUTOCOMPLETE_API = "/api/autocomplete";

// Build a Google Maps search link for any address string
const gmaps = (addr) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;

// ---------- helpers ----------
const num = (v) => {
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const usd = (n) =>
  isFinite(n) ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—";
const pct = (n) => (isFinite(n) ? `${n.toFixed(1)}%` : "—");

const pmt = (principal, annualRatePct, years) => {
  const n = years * 12;
  if (n <= 0 || principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
};
const balanceAt = (principal, annualRatePct, years, atYear) => {
  if (principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const k = Math.max(0, atYear) * 12;
  const M = pmt(principal, annualRatePct, years);
  if (r === 0) return Math.max(0, principal - M * k);
  return Math.max(0, principal * Math.pow(1 + r, k) - (M * (Math.pow(1 + r, k) - 1)) / r);
};

// ---------- module-scope inputs (stable refs = no focus loss) ----------
const InfoDot = ({ text }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-slate-300 hover:text-emerald-600" aria-label="more info">
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span className="absolute left-1/2 top-5 z-30 w-52 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-normal normal-case leading-snug tracking-normal text-white shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
};

const Field = ({ label, hint, info, children }) => (
  <label className="block">
    <div className="flex items-baseline justify-between gap-2">
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}{info && <InfoDot text={info} />}
      </span>
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </div>
    <div className="mt-1">{children}</div>
  </label>
);

const TextInput = ({ value, onChange, placeholder }) => (
  <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
);

// Address typeahead: shows real address suggestions as you type (debounced).
const AddressAutocomplete = ({ value, onChange, onPick, placeholder }) => {
  const [sugs, setSugs] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const boxRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const fetchSugs = (q) => {
    if (timer.current) clearTimeout(timer.current);
    if (!q || q.trim().length < 4) { setSugs([]); setOpen(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`${AUTOCOMPLETE_API}?q=${encodeURIComponent(q)}`);
        if (!r.ok) { setSugs([]); return; }
        const data = await r.json();
        setSugs(data.suggestions || []);
        setOpen((data.suggestions || []).length > 0);
        setHi(-1);
      } catch { setSugs([]); }
    }, 250);
  };

  const handleChange = (v) => { onChange(v); fetchSugs(v); };
  const pick = (s) => { onChange(s); onPick && onPick(s); setOpen(false); setSugs([]); };

  const onKey = (e) => {
    if (!open || !sugs.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, sugs.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && hi >= 0) { e.preventDefault(); pick(sugs[hi]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        type="text" value={value} placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => sugs.length && setOpen(true)}
        onKeyDown={onKey}
        autoComplete="off"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
      />
      {open && sugs.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {sugs.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(s)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${i === hi ? "bg-emerald-50 text-emerald-800" : "text-slate-700 hover:bg-slate-50"}`}
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span>{s}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const MoneyInput = ({ value, onChange, placeholder }) => (
  <div className="flex items-center rounded-lg border border-slate-200 bg-white transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
    <span className="pl-3 pr-1 text-sm text-slate-400">$</span>
    <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-transparent py-2 pr-3 text-sm tabular-nums text-slate-900 outline-none font-mono" />
  </div>
);

const PlainInput = ({ value, onChange, placeholder, suffix }) => (
  <div className="flex items-center rounded-lg border border-slate-200 bg-white transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
    <input type="text" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-transparent px-3 py-2 text-sm tabular-nums text-slate-900 outline-none font-mono" />
    {suffix && <span className="pr-3 text-sm text-slate-400">{suffix}</span>}
  </div>
);

const Stat = ({ label, value, tone = "default", big = false, sub }) => {
  const tones = { default: "text-slate-900", good: "text-emerald-600", bad: "text-rose-600", warn: "text-amber-600" };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono tabular-nums ${big ? "text-2xl" : "text-lg"} font-bold ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
};

const Verdict = ({ status, headline, detail }) => {
  const map = {
    go: { bg: "bg-emerald-50", bd: "border-emerald-200", tx: "text-emerald-800", Icon: CheckCircle2, ic: "text-emerald-600" },
    maybe: { bg: "bg-amber-50", bd: "border-amber-200", tx: "text-amber-900", Icon: AlertTriangle, ic: "text-amber-600" },
    no: { bg: "bg-rose-50", bd: "border-rose-200", tx: "text-rose-800", Icon: MinusCircle, ic: "text-rose-600" },
  };
  const s = map[status] || map.maybe;
  const Icon = s.Icon;
  return (
    <div className={`flex items-start gap-3 rounded-xl border ${s.bd} ${s.bg} px-4 py-3`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${s.ic}`} />
      <div>
        <div className={`text-sm font-bold ${s.tx}`}>{headline}</div>
        {detail && <div className={`mt-0.5 text-xs ${s.tx} opacity-80`}>{detail}</div>}
      </div>
    </div>
  );
};

const SectionTitle = ({ children }) => (
  <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">{children}</h3>
);

// ---------- main ----------
export default function App() {
  // property + ARV
  const [address, setAddress] = useState("");
  const [sqft, setSqft] = useState("");
  const [comps, setComps] = useState([
    { sqft: "", price: "", address: "" },
    { sqft: "", price: "", address: "" },
    { sqft: "", price: "", address: "" },
  ]);
  const [arvOverride, setArvOverride] = useState("");
  const [compLoading, setCompLoading] = useState(false);
  const [compMsg, setCompMsg] = useState(null); // {type:'ok'|'err', text}

  async function autoComp() {
    const a = address.trim();
    if (!a) { setCompMsg({ type: "err", text: "Type the subject address first." }); return; }
    setCompLoading(true); setCompMsg(null);
    try {
      const r = await fetch(`${COMP_API}?address=${encodeURIComponent(a)}`);
      const data = await r.json();
      if (!r.ok) { setCompMsg({ type: "err", text: data.error || `Lookup failed (${r.status}).` }); return; }
      // Always refresh subject sqft for the new address (fixes stale-sqft glitch)
      if (data.subject?.sqft) setSqft(String(data.subject.sqft));
      // Fill the comp grid (address + sqft + price), pad to at least 3 rows
      const incoming = (data.comps || []).map((c) => ({
        sqft: String(c.sqft),
        price: String(c.price),
        address: c.address || "",
      }));
      if (incoming.length) {
        while (incoming.length < 3) incoming.push({ sqft: "", price: "", address: "" });
        setComps(incoming);
      }
      // Drop RentCast's own AVM into the override box as a reference ARV
      if (data.arv) setArvOverride(String(data.arv));
      const n = (data.comps || []).length;
      setCompMsg({ type: "ok", text: `Pulled ${n} comp${n === 1 ? "" : "s"}${data.arv ? ` · RentCast ARV ${usd(data.arv)}` : ""}. Review and trim outliers before trusting it.` });
    } catch (e) {
      setCompMsg({ type: "err", text: "Couldn't reach the comp service. Is the proxy deployed?" });
    } finally {
      setCompLoading(false);
    }
  }

  // rehab + MAO %
  const [rehabLevel, setRehabLevel] = useState("moderate");
  const [customPsf, setCustomPsf] = useState("");
  const [repairOverride, setRepairOverride] = useState("");
  const [underPct, setUnderPct] = useState(75); // under $200k band
  const [overPct, setOverPct] = useState(80);    // over $200k band

  const [tab, setTab] = useState("cash");

  // cash/mao
  const [wholesaleFee, setWholesaleFee] = useState("10000");
  const [sellingPct, setSellingPct] = useState("10");
  const [holding, setHolding] = useState("5000");
  const [desiredProfit, setDesiredProfit] = useState("30000");
  const [askingPrice, setAskingPrice] = useState("");

  // sub-to
  const [stBal, setStBal] = useState("");
  const [stPiti, setStPiti] = useState("");
  const [stArrears, setStArrears] = useState("");
  const [stCashSeller, setStCashSeller] = useState("");
  const [stClosing, setStClosing] = useState("3500");
  const [stRent, setStRent] = useState("");
  const [stReservePct, setStReservePct] = useState("12");

  // hybrid
  const [hyPrice, setHyPrice] = useState("");
  const [hyDown, setHyDown] = useState("");
  const [hyBal, setHyBal] = useState("");
  const [hyPiti, setHyPiti] = useState("");
  const [hyRate, setHyRate] = useState("0");
  const [hyTerm, setHyTerm] = useState("30");
  const [hyClosing, setHyClosing] = useState("3500");
  const [hyRent, setHyRent] = useState("");
  const [hyReservePct, setHyReservePct] = useState("12");

  // seller finance
  const [sfPrice, setSfPrice] = useState("");
  const [sfDown, setSfDown] = useState("");
  const [sfRate, setSfRate] = useState("0");
  const [sfAmort, setSfAmort] = useState("30");
  const [sfBalloon, setSfBalloon] = useState("0");
  const [sfTaxIns, setSfTaxIns] = useState("");
  const [sfRent, setSfRent] = useState("");
  const [sfReservePct, setSfReservePct] = useState("12");

  // novation
  const [novAsIs, setNovAsIs] = useState("");
  const [novProfit, setNovProfit] = useState("30000");
  const [novListFactor, setNovListFactor] = useState("95");
  const [novCostFactor, setNovCostFactor] = useState("8");

  // ---- ARV ----
  const arv = useMemo(() => {
    if (num(arvOverride) > 0) return num(arvOverride);
    const sf = num(sqft);
    const valid = comps.filter((c) => num(c.sqft) > 0 && num(c.price) > 0);
    if (valid.length === 0 || sf <= 0) return 0;
    const avgPsf = valid.reduce((a, c) => a + num(c.price) / num(c.sqft), 0) / valid.length;
    return avgPsf * sf;
  }, [comps, sqft, arvOverride]);

  const avgPsf = useMemo(() => {
    const valid = comps.filter((c) => num(c.sqft) > 0 && num(c.price) > 0);
    if (!valid.length) return 0;
    return valid.reduce((a, c) => a + num(c.price) / num(c.sqft), 0) / valid.length;
  }, [comps]);

  // ---- repairs ----
  const repairPsf = rehabLevel === "cosmetic" ? 15 : rehabLevel === "moderate" ? 30 : rehabLevel === "gut" ? 50 : num(customPsf);
  const repairs = useMemo(() => {
    if (num(repairOverride) > 0) return num(repairOverride);
    return repairPsf * num(sqft);
  }, [repairPsf, sqft, repairOverride]);

  // ---- cash MAO (both bands) ----
  const ruleMaoUnder = arv * (num(underPct) / 100) - repairs;
  const ruleMaoOver = arv * (num(overPct) / 100) - repairs;
  const investorMaoUnder = ruleMaoUnder - num(wholesaleFee);
  const investorMaoOver = ruleMaoOver - num(wholesaleFee);
  const itemizedMao =
    arv - repairs - arv * (num(sellingPct) / 100) - num(holding) - num(desiredProfit) - num(wholesaleFee);

  // which band applies to THIS deal (by ARV) — used for the verdict
  const isOver = arv >= 200000;
  const activeRuleMao = isOver ? ruleMaoOver : ruleMaoUnder;
  const activeInvestorMao = isOver ? investorMaoOver : investorMaoUnder;
  const activePct = isOver ? num(overPct) : num(underPct);

  const setComp = (i, key, val) =>
    setComps((cs) => cs.map((c, idx) => (idx === i ? { ...c, [key]: val } : c)));
  const addComp = () => setComps((cs) => (cs.length < 6 ? [...cs, { sqft: "", price: "", address: "" }] : cs));
  const rmComp = (i) => setComps((cs) => (cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs));

  const tabs = [
    { id: "cash", label: "Cash / MAO", Icon: Calculator },
    { id: "subto", label: "Sub-To", Icon: Building2 },
    { id: "hybrid", label: "Hybrid", Icon: Layers },
    { id: "sf", label: "Seller Finance", Icon: Banknote },
    { id: "nov", label: "Novation", Icon: RefreshCw },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* header */}
      <div className="bg-slate-900 px-5 py-5">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-lg bg-white px-2 py-1.5 shadow-sm">
              <img src="/logo.png" alt="Your Local Home Buyer" className="h-9 w-auto object-contain" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white">YLHB RE Calculator</div>
              <div className="text-[11px] text-slate-400">Acquisitions</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-5">
        {/* PROPERTY + ARV */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <SectionTitle>Property &amp; ARV</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Field label="Subject address" hint="start typing — pick the exact match">
                <AddressAutocomplete value={address} onChange={setAddress} placeholder="1225 S 6th St, Louisville, KY" />
              </Field>
            </div>
            <Field label="Subject sq ft">
              <PlainInput value={sqft} onChange={setSqft} placeholder="1500" suffix="sf" />
            </Field>
          </div>

          {/* comp grid */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Sold comps (Jamil method: avg $/sf × subject sf)
              </span>
              <div className="flex items-center gap-2">
                <button onClick={autoComp} disabled={compLoading}
                  className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {compLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  {compLoading ? "Pulling…" : "Auto-comp address"}
                </button>
                <button onClick={addComp}
                  className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                  + comp
                </button>
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {comps.map((c, i) => {
                const ppsf = num(c.sqft) > 0 && num(c.price) > 0 ? num(c.price) / num(c.sqft) : 0;
                return (
                  <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
                    {/* address row */}
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center text-xs font-bold text-slate-300">{i + 1}</span>
                      <div className="flex flex-1 items-center gap-1.5">
                        <input
                          type="text"
                          value={c.address}
                          onChange={(e) => setComp(i, "address", e.target.value)}
                          placeholder="comp address (optional)"
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-100"
                        />
                        {c.address ? (
                          <a href={gmaps(c.address)} target="_blank" rel="noopener noreferrer"
                            title="Open in Google Maps"
                            className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50">
                            <MapPin className="h-3 w-3" /> Map <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <span className="shrink-0 px-2 py-1 text-[11px] text-slate-300">no map</span>
                        )}
                      </div>
                      <button onClick={() => rmComp(i)} className="text-slate-300 hover:text-rose-500" aria-label="remove comp">×</button>
                    </div>
                    {/* numbers row */}
                    <div className="mt-1.5 flex items-center gap-2 pl-7">
                      <div className="flex-1">
                        <PlainInput value={c.sqft} onChange={(v) => setComp(i, "sqft", v)} placeholder="sq ft" suffix="sf" />
                      </div>
                      <div className="flex-1">
                        <MoneyInput value={c.price} onChange={(v) => setComp(i, "price", v)} placeholder="sold price" />
                      </div>
                      <span className="w-20 text-right font-mono text-xs tabular-nums text-slate-500">
                        {ppsf ? `$${ppsf.toFixed(0)}/sf` : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {compMsg && (
              <div className={`mt-2 rounded-lg px-3 py-2 text-[11px] ${compMsg.type === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {compMsg.text}
              </div>
            )}
            <div className="mt-3">
              <Field label="Or enter ARV directly" hint="overrides comps">
                <MoneyInput value={arvOverride} onChange={setArvOverride} placeholder="optional" />
              </Field>
            </div>
          </div>

          {/* ARV result */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Avg $/sf" value={avgPsf ? `$${avgPsf.toFixed(0)}` : "—"} />
            <Stat label="After-Repair Value" value={usd(arv)} tone="default" big />
            <Stat label="Repair estimate" value={usd(repairs)} sub={repairOverride ? "manual" : `${repairPsf || 0} $/sf × ${num(sqft) || 0} sf`} />
          </div>
        </div>

        {/* CONTROLS: rehab + MAO bands */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionTitle>Rehab level</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "cosmetic", t: "Light", s: "$15/sf" },
                { id: "moderate", t: "Moderate", s: "$30/sf" },
                { id: "gut", t: "Full Gut", s: "$50/sf" },
                { id: "custom", t: "Custom", s: "set $/sf" },
              ].map((r) => (
                <button key={r.id} onClick={() => setRehabLevel(r.id)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    rehabLevel === r.id ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}>
                  <div className="text-sm font-semibold text-slate-800">{r.t}</div>
                  <div className="text-[11px] text-slate-500">{r.s}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {rehabLevel === "custom" && (
                <Field label="Custom $/sf">
                  <PlainInput value={customPsf} onChange={setCustomPsf} placeholder="45" suffix="$/sf" />
                </Field>
              )}
              <Field label="Or total repair $" hint="overrides">
                <MoneyInput value={repairOverride} onChange={setRepairOverride} placeholder="optional" />
              </Field>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionTitle>MAO % of ARV — by price band</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-lg border px-3 py-2 ${!isOver ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Under $200k</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-mono text-2xl font-bold tabular-nums text-slate-900">{underPct}</span>
                  <span className="text-xs text-slate-500">%</span>
                </div>
                <input type="range" min={60} max={85} step={1} value={underPct} onChange={(e) => setUnderPct(parseInt(e.target.value))} className="mt-1 w-full accent-emerald-600" />
              </div>
              <div className={`rounded-lg border px-3 py-2 ${isOver ? "border-emerald-500 bg-emerald-50" : "border-slate-200"}`}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Over $200k</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-mono text-2xl font-bold tabular-nums text-slate-900">{overPct}</span>
                  <span className="text-xs text-slate-500">%</span>
                </div>
                <input type="range" min={60} max={90} step={1} value={overPct} onChange={(e) => setOverPct(parseInt(e.target.value))} className="mt-1 w-full accent-emerald-600" />
              </div>
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              ARV {usd(arv)} → <b>{isOver ? "Over $200k" : "Under $200k"}</b> band applies ({activePct}%). Both columns show in the Cash/MAO tab; the green one is this deal.
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map((t) => {
            const Icon = t.Icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  tab === t.id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}>
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          {tab === "cash" && (
            <CashTab {...{ arv, repairs, underPct, overPct, isOver, ruleMaoUnder, ruleMaoOver, investorMaoUnder, investorMaoOver, itemizedMao, activeInvestorMao, activeRuleMao, activePct, wholesaleFee, setWholesaleFee, sellingPct, setSellingPct, holding, setHolding, desiredProfit, setDesiredProfit, askingPrice, setAskingPrice }} />
          )}
          {tab === "subto" && (
            <SubToTab {...{ arv, repairs, underPct, overPct, wholesaleFee, stBal, setStBal, stPiti, setStPiti, stArrears, setStArrears, stCashSeller, setStCashSeller, stClosing, setStClosing, stRent, setStRent, stReservePct, setStReservePct }} />
          )}
          {tab === "hybrid" && (
            <HybridTab {...{ arv, repairs, underPct, overPct, wholesaleFee, hyPrice, setHyPrice, hyDown, setHyDown, hyBal, setHyBal, hyPiti, setHyPiti, hyRate, setHyRate, hyTerm, setHyTerm, hyClosing, setHyClosing, hyRent, setHyRent, hyReservePct, setHyReservePct }} />
          )}
          {tab === "sf" && (
            <SellerFinanceTab {...{ arv, repairs, underPct, overPct, wholesaleFee, sfPrice, setSfPrice, sfDown, setSfDown, sfRate, setSfRate, sfAmort, setSfAmort, sfBalloon, setSfBalloon, sfTaxIns, setSfTaxIns, sfRent, setSfRent, sfReservePct, setSfReservePct }} />
          )}
          {tab === "nov" && (
            <NovationTab {...{ novAsIs, setNovAsIs, novProfit, setNovProfit, novListFactor, setNovListFactor, novCostFactor, setNovCostFactor }} />
          )}
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-400">
          Formulas use standard Pace Morby / Jamil Damji methodology (ARV = avg $/sf × sq ft; MAO = ARV × band % − repairs).
          Bands default to 75% under $200k / 80% over, matching your sheet. Estimates only — verify comps and underwriting before offers. Not legal or financial advice.
        </div>
      </div>
    </div>
  );
}

// ---------- CASH ----------
function CashTab(props) {
  const { arv, repairs, underPct, overPct, isOver, ruleMaoUnder, ruleMaoOver, investorMaoUnder, investorMaoOver, itemizedMao, activeInvestorMao, activeRuleMao, activePct, wholesaleFee, setWholesaleFee, sellingPct, setSellingPct, holding, setHolding, desiredProfit, setDesiredProfit, askingPrice, setAskingPrice } = props;
  const ask = num(askingPrice);
  let status = "maybe", headline = "Enter an asking price to grade the deal", detail = "";
  if (ask > 0 && arv > 0) {
    const spread = activeInvestorMao - ask;
    if (ask <= activeInvestorMao) {
      status = "go"; headline = "WHOLESALE — lock it";
      detail = `At ${usd(ask)} you're under your investor MAO with ~${usd(spread)} of room above your fee (${activePct}% band).`;
    } else if (ask <= activeRuleMao) {
      status = "maybe"; headline = "FLIP margin — thin for an assignment";
      detail = `Works as a flip at the ${activePct}% rule, but ${usd(ask - activeInvestorMao)} over your wholesale MAO. Renegotiate or shrink the fee.`;
    } else {
      status = "no"; headline = "PASS / renegotiate";
      detail = `Asking is ${usd(ask - activeRuleMao)} above even the ${activePct}% MAO. Numbers don't work at this price.`;
    }
  }
  return (
    <div className="space-y-4">
      {/* INPUTS: two boxes side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Your wholesale numbers */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <SectionTitle>Your wholesale numbers</SectionTitle>
          <div className="space-y-3">
            <Field label="Your wholesale fee" info="Your assignment fee — the spread YOU keep for putting the deal together. Subtracted to get your Investor MAO."><MoneyInput value={wholesaleFee} onChange={setWholesaleFee} /></Field>
            <Field label="Seller asking price" hint="optional — grades the deal"><MoneyInput value={askingPrice} onChange={setAskingPrice} /></Field>
          </div>
        </div>

        {/* The flipper's numbers */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">The flipper's numbers — your end buyer</div>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                What the investor who buys this from you needs to profit on the flip. Feeds the <b className="font-semibold text-slate-600">Itemized max offer</b> — the most you can pay and still leave them a deal worth doing.
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            <Field label="Selling costs" hint="% of ARV" info="Cost to SELL the fixed-up house: agent commissions, title, closing. Roughly 8–10% of ARV."><PlainInput value={sellingPct} onChange={setSellingPct} suffix="%" /></Field>
            <Field label="Holding costs" info="Cost to OWN it during rehab and sale: loan interest, taxes, insurance, utilities. ~$3k–$8k on a typical flip."><MoneyInput value={holding} onChange={setHolding} /></Field>
            <Field label="Desired flip profit" info="Profit the flipper wants to clear after all costs — the cushion that makes them say yes. Commonly $25k–$40k+."><MoneyInput value={desiredProfit} onChange={setDesiredProfit} /></Field>
          </div>
        </div>
      </div>

      {/* VERDICT */}
      <Verdict status={status} headline={headline} detail={detail} />

      {/* RESULTS: MAO table + stat cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm overflow-x-auto">
          <SectionTitle>Max Allowable Offer — both bands</SectionTitle>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-1 text-left font-semibold"></th>
                <th className={`py-1 text-right font-semibold ${!isOver ? "text-emerald-600" : ""}`}>Under $200k ({underPct}%)</th>
                <th className={`py-1 text-right font-semibold ${isOver ? "text-emerald-600" : ""}`}>Over $200k ({overPct}%)</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular-nums">
              <CRow label="% of ARV" a={usd(arv * underPct / 100)} b={usd(arv * overPct / 100)} />
              <CRow label="− Repairs" a={usd(repairs)} b={usd(repairs)} />
              <CRow label="= Wholesale price" a={usd(ruleMaoUnder)} b={usd(ruleMaoOver)} muted />
              <CRow label="− Your fee" a={usd(num(wholesaleFee))} b={usd(num(wholesaleFee))} />
              <tr className="border-t-2 border-slate-200">
                <td className="py-2 font-sans text-[11px] font-bold uppercase tracking-wide text-slate-500">Investor MAO</td>
                <td className={`py-2 text-right text-base font-bold ${!isOver ? "text-emerald-600" : "text-slate-900"}`}>{usd(investorMaoUnder)}</td>
                <td className={`py-2 text-right text-base font-bold ${isOver ? "text-emerald-600" : "text-slate-900"}`}>{usd(investorMaoOver)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Stat label={`${activePct}% Rule MAO`} value={usd(activeRuleMao)} tone={activeRuleMao > 0 ? "default" : "bad"} big sub="ARV × band − repairs" />
          <Stat label="Investor MAO" value={usd(activeInvestorMao)} tone={activeInvestorMao > 0 ? "good" : "bad"} big sub="after your fee" />
          <Stat label="Itemized max offer" value={usd(itemizedMao)} sub="leaves the flipper their profit" />
          <Stat label="ARV" value={usd(arv)} sub={`repairs ${usd(repairs)}`} />
        </div>
      </div>
    </div>
  );
}
const CRow = ({ label, a, b, muted }) => (
  <tr className="border-t border-slate-100">
    <td className="py-1.5 font-sans text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</td>
    <td className={`py-1.5 text-right ${muted ? "text-slate-500" : "text-slate-900"}`}>{a}</td>
    <td className={`py-1.5 text-right ${muted ? "text-slate-500" : "text-slate-900"}`}>{b}</td>
  </tr>
);

// ---------- shared: "what if we wholesaled this" panel ----------
function WholesaleCompare({ arv, repairs, underPct, overPct, wholesaleFee, dealCost, costLabel }) {
  const band = arv >= 200000 ? num(overPct) : num(underPct);
  const cashMao = arv * (band / 100) - repairs;          // what a cash buyer would pay
  const yourOffer = cashMao - num(wholesaleFee);          // your max wholesale offer, keeping your fee
  const spread = dealCost > 0 ? cashMao - dealCost : 0;   // assignment fee if you locked at this basis

  let tone = "default", note = "Enter this deal's price/basis to compare a wholesale exit.";
  if (arv <= 0) { note = "Set the ARV up top to compare a wholesale exit."; }
  else if (dealCost > 0) {
    if (spread >= 10000) { tone = "good"; note = `Wholesale-able — you could assign for ~${usd(spread)} instead of holding. Compare that quick cash to the long-term cash flow.`; }
    else if (spread > 0) { tone = "warn"; note = `Thin wholesale spread (~${usd(spread)}). The creative hold likely wins unless you need the quick cash.`; }
    else { tone = "bad"; note = `No wholesale spread at this basis — this one only makes sense as a creative hold, not a flip.`; }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-slate-400" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">If you wholesaled this instead</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Cash buyer MAO" value={usd(cashMao)} sub={`ARV × ${band}% − repairs`} />
        <Stat label={costLabel} value={dealCost > 0 ? usd(dealCost) : "—"} sub="this deal's basis" />
        <Stat label="Assignment spread" value={dealCost > 0 ? usd(spread) : "—"} tone={tone === "default" ? "default" : tone} sub="cash MAO − your basis" />
      </div>
      <div className={`mt-3 rounded-lg px-3 py-2 text-[11px] ${tone === "good" ? "bg-emerald-50 text-emerald-700" : tone === "bad" ? "bg-rose-50 text-rose-700" : tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-500"}`}>
        {note} <span className="text-slate-400">Your max wholesale offer (after a {usd(num(wholesaleFee))} fee): {usd(yourOffer)}.</span>
      </div>
    </div>
  );
}

// ---------- shared: rate-savings explorer ----------
function RateSavings({ loanAmount, defaultRate = 4, defaultTerm = 30 }) {
  const [rate, setRate] = useState(defaultRate);
  const [term, setTerm] = useState(defaultTerm);
  const [mkt, setMkt] = useState(7.5);
  const P = loanAmount;
  const payDeal = pmt(P, rate, term);
  const payMkt = pmt(P, mkt, term);
  const intDeal = Math.max(0, payDeal * term * 12 - P);
  const intMkt = Math.max(0, payMkt * term * 12 - P);
  const lifeSavings = Math.max(0, intMkt - intDeal);
  const moSavings = Math.max(0, payMkt - payDeal);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <TrendingDown className="h-4 w-4 text-emerald-500" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Rate savings — what your low rate is worth</h3>
      </div>
      {P > 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {/* sliders */}
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your interest rate</span>
                <span className="font-mono text-lg font-bold tabular-nums text-emerald-600">{rate.toFixed(2)}%</span>
              </div>
              <input type="range" min={0} max={12} step={0.125} value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} className="mt-1 w-full accent-emerald-600" />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Remaining loan term</span>
                <span className="font-mono text-lg font-bold tabular-nums text-slate-900">{term} yrs</span>
              </div>
              <input type="range" min={1} max={40} step={1} value={term} onChange={(e) => setTerm(parseInt(e.target.value))} className="mt-1 w-full accent-emerald-600" />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Market rate — compare to</span>
                <span className="font-mono text-sm font-bold tabular-nums text-slate-500">{mkt.toFixed(2)}%</span>
              </div>
              <input type="range" min={0} max={14} step={0.125} value={mkt} onChange={(e) => setMkt(parseFloat(e.target.value))} className="mt-1 w-full accent-slate-400" />
            </div>
            <div className="text-[11px] text-slate-400">Loan amount: <span className="font-mono text-slate-600">{usd(P)}</span> — pulled from this deal.</div>
          </div>
          {/* savings */}
          <div className="space-y-3">
            <Stat label="Lifetime interest savings" value={usd(lifeSavings)} tone="good" big sub={`vs ${mkt.toFixed(2)}% market over ${term} yrs`} />
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Your payment" value={usd(payDeal)} sub={`P&I @ ${rate.toFixed(2)}%`} />
              <Stat label="Monthly savings" value={usd(moSavings)} tone={moSavings > 0 ? "good" : "default"} sub="vs market pmt" />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          Enter the loan amount in this deal above, and the sliders will show what the low rate saves you over the life of the loan.
        </div>
      )}
    </div>
  );
}


// ---------- SUB-TO ----------
function SubToTab(props) {
  const { arv, repairs, underPct, overPct, wholesaleFee, stBal, setStBal, stPiti, setStPiti, stArrears, setStArrears, stCashSeller, setStCashSeller, stClosing, setStClosing, stRent, setStRent, stReservePct, setStReservePct } = props;
  const bal = num(stBal), piti = num(stPiti), arrears = num(stArrears), cashSeller = num(stCashSeller), closing = num(stClosing), rent = num(stRent);
  const reserves = rent * (num(stReservePct) / 100);
  const cashIn = cashSeller + arrears + closing;
  const cashFlow = rent - piti - reserves;
  const equity = arv - (bal + cashSeller + arrears);
  const coc = cashIn > 0 ? ((cashFlow * 12) / cashIn) * 100 : 0;
  let status = "maybe", headline = "Enter rent & PITI to grade", detail = "";
  if (rent > 0 && piti > 0) {
    if (cashFlow >= 200 && equity > 0) { status = "go"; headline = "STRONG sub-to"; detail = `${usd(cashFlow)}/mo cash flow and ${usd(equity)} captured equity over the loan.`; }
    else if (cashFlow > 0) { status = "maybe"; headline = "WORKS — watch the margin"; detail = `${usd(cashFlow)}/mo after reserves. ${equity > 0 ? usd(equity) + " equity." : "Little/no equity — leaning on rate + cash flow."}`; }
    else { status = "no"; headline = "NEGATIVE — pass or restructure"; detail = `${usd(cashFlow)}/mo after reserves. Lower entry, raise rent, or walk.`; }
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <SectionTitle>Subject-to inputs</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Existing loan balance"><MoneyInput value={stBal} onChange={setStBal} /></Field>
            <Field label="PITI (monthly)" hint="inherited payment"><MoneyInput value={stPiti} onChange={setStPiti} /></Field>
            <Field label="Arrears / back pmts"><MoneyInput value={stArrears} onChange={setStArrears} /></Field>
            <Field label="Cash to seller" hint="equity"><MoneyInput value={stCashSeller} onChange={setStCashSeller} /></Field>
            <Field label="Closing costs"><MoneyInput value={stClosing} onChange={setStClosing} /></Field>
            <Field label="Market rent (monthly)"><MoneyInput value={stRent} onChange={setStRent} /></Field>
            <Field label="Reserves" hint="% of rent"><PlainInput value={stReservePct} onChange={setStReservePct} suffix="%" /></Field>
          </div>
        </div>
        <div className="space-y-3">
          <Verdict status={status} headline={headline} detail={detail} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Monthly cash flow" value={usd(cashFlow)} tone={cashFlow > 0 ? "good" : "bad"} big sub={`rent − PITI − ${usd(reserves)} reserves`} />
            <Stat label="Equity captured" value={usd(equity)} tone={equity > 0 ? "good" : "warn"} big sub="ARV − loan − entry" />
            <Stat label="Total cash in" value={usd(cashIn)} sub="seller + arrears + closing" />
            <Stat label="Cash-on-cash" value={pct(coc)} tone={coc > 0 ? "good" : "bad"} sub="annual" />
          </div>
        </div>
      </div>
      <WholesaleCompare arv={arv} repairs={repairs} underPct={underPct} overPct={overPct} wholesaleFee={wholesaleFee}
        dealCost={bal + cashSeller + arrears} costLabel="Sub-to all-in (loan + entry)" />
      <RateSavings loanAmount={bal} defaultRate={4} defaultTerm={30} />
    </div>
  );
}

// ---------- HYBRID ----------
function HybridTab(props) {
  const { arv, repairs, underPct, overPct, wholesaleFee, hyPrice, setHyPrice, hyDown, setHyDown, hyBal, setHyBal, hyPiti, setHyPiti, hyRate, setHyRate, hyTerm, setHyTerm, hyClosing, setHyClosing, hyRent, setHyRent, hyReservePct, setHyReservePct } = props;
  const price = num(hyPrice), down = num(hyDown), bal = num(hyBal), piti = num(hyPiti), rent = num(hyRent), closing = num(hyClosing);
  const note = Math.max(0, price - bal - down);
  const notePay = pmt(note, num(hyRate), num(hyTerm));
  const totalMonthly = piti + notePay;
  const reserves = rent * (num(hyReservePct) / 100);
  const cashFlow = rent - totalMonthly - reserves;
  const cashIn = down + closing;
  const equity = arv - price;
  const coc = cashIn > 0 ? ((cashFlow * 12) / cashIn) * 100 : 0;
  let status = "maybe", headline = "Enter price, loan & rent to grade", detail = "";
  if (price > 0 && rent > 0) {
    if (cashFlow >= 200 && equity >= 0) { status = "go"; headline = "STRONG hybrid"; detail = `Sub-to keeps the low-rate ${usd(bal)} loan clean; ${usd(note)} seller note on top. ${usd(cashFlow)}/mo.`; }
    else if (cashFlow > 0) { status = "maybe"; headline = "WORKS — tune the note"; detail = `${usd(cashFlow)}/mo. Push note rate toward 0% or extend term to lift cash flow.`; }
    else { status = "no"; headline = "NEGATIVE — restructure"; detail = `${usd(cashFlow)}/mo. Lower price, bigger sub-to portion, or longer/0% note.`; }
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <SectionTitle>Hybrid (sub-to + seller note)</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Purchase price"><MoneyInput value={hyPrice} onChange={setHyPrice} /></Field>
            <Field label="Down payment"><MoneyInput value={hyDown} onChange={setHyDown} /></Field>
            <Field label="Existing loan balance" hint="taken sub-to"><MoneyInput value={hyBal} onChange={setHyBal} /></Field>
            <Field label="Sub-to PITI (monthly)"><MoneyInput value={hyPiti} onChange={setHyPiti} /></Field>
            <Field label="Seller note rate" hint="0% ok"><PlainInput value={hyRate} onChange={setHyRate} suffix="%" /></Field>
            <Field label="Seller note term"><PlainInput value={hyTerm} onChange={setHyTerm} suffix="yrs" /></Field>
            <Field label="Closing costs"><MoneyInput value={hyClosing} onChange={setHyClosing} /></Field>
            <Field label="Market rent (monthly)"><MoneyInput value={hyRent} onChange={setHyRent} /></Field>
            <Field label="Reserves" hint="% of rent"><PlainInput value={hyReservePct} onChange={setHyReservePct} suffix="%" /></Field>
          </div>
        </div>
        <div className="space-y-3">
          <Verdict status={status} headline={headline} detail={detail} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Monthly cash flow" value={usd(cashFlow)} tone={cashFlow > 0 ? "good" : "bad"} big sub={`rent − ${usd(totalMonthly)} debt − reserves`} />
            <Stat label="Seller note amount" value={usd(note)} sub="price − loan − down" />
            <Stat label="Note payment" value={usd(notePay)} sub={`${num(hyRate)}% / ${num(hyTerm)}yr`} />
            <Stat label="Total monthly debt" value={usd(totalMonthly)} sub="PITI + note" />
            <Stat label="Equity captured" value={usd(equity)} tone={equity >= 0 ? "good" : "warn"} sub="ARV − price" />
            <Stat label="Cash-on-cash" value={pct(coc)} tone={coc > 0 ? "good" : "bad"} sub={`${usd(cashIn)} in`} />
          </div>
        </div>
      </div>
      <WholesaleCompare arv={arv} repairs={repairs} underPct={underPct} overPct={overPct} wholesaleFee={wholesaleFee}
        dealCost={price} costLabel="Hybrid purchase price" />
      <RateSavings loanAmount={bal} defaultRate={4} defaultTerm={30} />
    </div>
  );
}

// ---------- SELLER FINANCE ----------
function SellerFinanceTab(props) {
  const { arv, repairs, underPct, overPct, wholesaleFee, sfPrice, setSfPrice, sfDown, setSfDown, sfRate, setSfRate, sfAmort, setSfAmort, sfBalloon, setSfBalloon, sfTaxIns, setSfTaxIns, sfRent, setSfRent, sfReservePct, setSfReservePct } = props;
  const price = num(sfPrice), down = num(sfDown), taxIns = num(sfTaxIns), rent = num(sfRent);
  const loan = Math.max(0, price - down);
  const pi = pmt(loan, num(sfRate), num(sfAmort));
  const totalMonthly = pi + taxIns;
  const reserves = rent * (num(sfReservePct) / 100);
  const cashFlow = rent - totalMonthly - reserves;
  const balloonYrs = num(sfBalloon);
  const balloonBal = balloonYrs > 0 ? balanceAt(loan, num(sfRate), num(sfAmort), balloonYrs) : 0;
  const totalInterest = pi * num(sfAmort) * 12 - loan;
  const equity = arv - price;
  const coc = down > 0 ? ((cashFlow * 12) / down) * 100 : 0;
  let status = "maybe", headline = "Enter price & rent to grade", detail = "";
  if (price > 0 && rent > 0) {
    if (cashFlow >= 200) { status = "go"; headline = "STRONG seller-finance"; detail = `${usd(cashFlow)}/mo at ${num(sfRate)}% over ${num(sfAmort)}yr.${balloonYrs ? " Balloon " + usd(balloonBal) + " due yr " + balloonYrs + "." : " No balloon — clean."}`; }
    else if (cashFlow > 0) { status = "maybe"; headline = "WORKS — push terms"; detail = `${usd(cashFlow)}/mo. Drive rate toward 0%, extend amortization, or kill the balloon.`; }
    else { status = "no"; headline = "NEGATIVE — renegotiate terms"; detail = `${usd(cashFlow)}/mo. Price for their number only if the terms carry the cash flow.`; }
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <SectionTitle>Seller financing inputs</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Purchase price"><MoneyInput value={sfPrice} onChange={setSfPrice} /></Field>
            <Field label="Down payment"><MoneyInput value={sfDown} onChange={setSfDown} /></Field>
            <Field label="Interest rate" hint="0% ok"><PlainInput value={sfRate} onChange={setSfRate} suffix="%" /></Field>
            <Field label="Amortization"><PlainInput value={sfAmort} onChange={setSfAmort} suffix="yrs" /></Field>
            <Field label="Balloon" hint="0 = none"><PlainInput value={sfBalloon} onChange={setSfBalloon} suffix="yrs" /></Field>
            <Field label="Taxes + insurance" hint="monthly"><MoneyInput value={sfTaxIns} onChange={setSfTaxIns} /></Field>
            <Field label="Market rent (monthly)"><MoneyInput value={sfRent} onChange={setSfRent} /></Field>
            <Field label="Reserves" hint="% of rent"><PlainInput value={sfReservePct} onChange={setSfReservePct} suffix="%" /></Field>
          </div>
        </div>
        <div className="space-y-3">
          <Verdict status={status} headline={headline} detail={detail} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Monthly cash flow" value={usd(cashFlow)} tone={cashFlow > 0 ? "good" : "bad"} big sub={`rent − ${usd(totalMonthly)} − reserves`} />
            <Stat label="Principal & interest" value={usd(pi)} big sub={`${usd(loan)} @ ${num(sfRate)}%`} />
            <Stat label="Balloon balance" value={balloonYrs ? usd(balloonBal) : "None"} tone={balloonYrs ? "warn" : "good"} sub={balloonYrs ? `due year ${balloonYrs}` : "fully amortizing"} />
            <Stat label="Total interest" value={usd(Math.max(0, totalInterest))} sub={num(sfRate) === 0 ? "0% — principal only" : "life of loan"} />
            <Stat label="Equity captured" value={usd(equity)} tone={equity >= 0 ? "good" : "warn"} sub="ARV − price" />
            <Stat label="Cash-on-cash" value={pct(coc)} tone={coc > 0 ? "good" : "bad"} sub="on down pmt" />
          </div>
        </div>
      </div>
      <WholesaleCompare arv={arv} repairs={repairs} underPct={underPct} overPct={overPct} wholesaleFee={wholesaleFee}
        dealCost={price} costLabel="Seller-finance price" />
      <RateSavings loanAmount={loan} defaultRate={num(sfRate) || 4} defaultTerm={num(sfAmort) || 30} />
    </div>
  );
}

// ---------- NOVATION (your sheet: As-Is × 0.95 × 0.92 − profit = MAO) ----------
function NovationTab(props) {
  const { novAsIs, setNovAsIs, novProfit, setNovProfit, novListFactor, setNovListFactor, novCostFactor, setNovCostFactor } = props;
  const asIs = num(novAsIs);
  const listPrice = asIs * (num(novListFactor) / 100);          // As-Is × 0.95
  const net = listPrice * (1 - num(novCostFactor) / 100);        // − closing + realtor (~8%)
  const mao = net - num(novProfit);                             // − desired novation profit
  let status = "maybe", headline = "Enter the As-Is value to grade", detail = "";
  if (asIs > 0) {
    if (mao > 0) { status = "go"; headline = "Novation MAO ready"; detail = `Offer up to ${usd(mao)} to net your ${usd(num(novProfit))} target.`; }
    else { status = "no"; headline = "Profit target too high for this value"; detail = `Costs + profit exceed the net. Lower the target or reconsider the deal.`; }
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="text-xs text-amber-900">
          Confirm the As-Is value is what the property will <b>actually sell for on the MLS as-is</b> before trusting this number. Runs your sheet's formula: As-Is × {num(novListFactor)}% × (100−{num(novCostFactor)})% − profit.
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <SectionTitle>Novation inputs</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="As-Is value (MLS list basis)"><MoneyInput value={novAsIs} onChange={setNovAsIs} placeholder="405000" /></Field></div>
            <Field label="Desired novation profit"><MoneyInput value={novProfit} onChange={setNovProfit} /></Field>
            <div className="hidden sm:block" />
            <Field label="List discount" hint="As-Is × this %"><PlainInput value={novListFactor} onChange={setNovListFactor} suffix="%" /></Field>
            <Field label="Closing + realtor" hint="% off list"><PlainInput value={novCostFactor} onChange={setNovCostFactor} suffix="%" /></Field>
          </div>
        </div>
        <div className="space-y-3">
          <Verdict status={status} headline={headline} detail={detail} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="List price" value={usd(listPrice)} sub={`As-Is × ${num(novListFactor)}%`} />
            <Stat label="Net after costs" value={usd(net)} sub={`− ${num(novCostFactor)}% closing/realtor`} />
          </div>
          <Stat label="Novation Max Allowable Offer" value={usd(mao)} tone={mao > 0 ? "good" : "bad"} big sub="net − desired profit" />
        </div>
      </div>
    </div>
  );
}
