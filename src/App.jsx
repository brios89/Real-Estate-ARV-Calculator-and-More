import React, { useState, useMemo, useEffect, useRef } from "react";
import { Calculator, Building2, Layers, Banknote, RefreshCw, AlertTriangle, CheckCircle2, MinusCircle, Info, Zap, Loader2, MapPin, ExternalLink, TrendingDown, Search, Play, FileDown, X, HelpCircle } from "lucide-react";

// Where the proxies live. Same-origin by default on Vercel.
const COMP_API = "/api/comp";
const RENT_API = "/api/rent";
const AUTOCOMPLETE_API = "/api/autocomplete";

// Google web search link for any address string
const gsearch = (addr) => `https://www.google.com/search?q=${encodeURIComponent(addr)}`;

// Format property details into a readable line: "Single Family · 1 Bed · 1 Bath · Built 1920"
const propLine = (info) => {
  if (!info) return "";
  const parts = [];
  if (info.propertyType) parts.push(info.propertyType);
  if (info.beds != null && info.beds !== "") parts.push(`${info.beds} Bed${Number(info.beds) === 1 ? "" : "s"}`);
  if (info.baths != null && info.baths !== "") parts.push(`${info.baths} Bath${Number(info.baths) === 1 ? "" : "s"}`);
  if (info.yearBuilt) parts.push(`Built ${info.yearBuilt}`);
  return parts.join(" · ");
};

// Junk-comp check (flag-only): compare a comp to the subject and return reasons it may be a weak comp.
// Tolerances: >1 bed, >1 bath, >15 yrs build age, >250 sq ft, or >0.5 mi away.
const compFlags = (c, subj, subjSqft) => {
  const flags = [];
  if (!c) return flags;
  const nOr = (v) => (v == null || v === "" ? null : Number(v));
  const cb = nOr(c.beds), sb = nOr(subj?.beds);
  if (cb != null && sb != null && Math.abs(cb - sb) > 1) flags.push(`${Math.abs(cb - sb)} bd off`);
  const cba = nOr(c.baths), sba = nOr(subj?.baths);
  if (cba != null && sba != null && Math.abs(cba - sba) > 1) flags.push(`${Math.abs(cba - sba)} ba off`);
  const cy = nOr(c.yearBuilt), sy = nOr(subj?.yearBuilt);
  if (cy && sy && Math.abs(cy - sy) > 15) flags.push(`built ${Math.abs(cy - sy)} yrs apart`);
  const cs = nOr(c.sqft), ss = subjSqft;
  if (cs && ss && Math.abs(cs - ss) > 250) flags.push(`${Math.abs(cs - ss).toLocaleString()} sf off`);
  const cd = nOr(c.distance);
  if (cd != null && cd > 0.5) flags.push(`${cd.toFixed(1)} mi away`);
  return flags;
};
const shortDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};
// Full date like "11/18/2024"
const fullDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US");
};
// Subject's true last-sale line
const lastSoldLine = (info) => {
  if (!info || !info.lastSalePrice) return "";
  const when = fullDate(info.lastSaleDate);
  return `Last sold ${usd(info.lastSalePrice)}${when ? ` on ${when}` : ""}`;
};
// Comp listing line: "Listed $209k May '25 · off market Sep '25"
const listingLine = (c) => {
  if (!c) return "";
  const bits = [];
  const listed = shortDate(c.listedDate);
  const off = shortDate(c.removedDate || c.lastSeenDate);
  if (listed) bits.push(`listed ${listed}`);
  if (off && c.status && c.status.toLowerCase() !== "active") bits.push(`off market ${off}`);
  else if (off && !listed) bits.push(`seen ${off}`);
  return bits.join(" · ");
};

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
// Present value (today's dollars) of the monthly payment savings a below-market loan throws off,
// discounted at the market rate over the remaining term. This is what a cheap assumed loan is "worth"
// — it grows as the deal rate drops below market.
const pvSavings = (loan, ratePct, mktPct, years) => {
  const n = years * 12;
  if (loan <= 0 || n <= 0) return 0;
  const mo = pmt(loan, mktPct, years) - pmt(loan, ratePct, years); // monthly savings vs market
  if (mo <= 0) return 0;
  const r = mktPct / 100 / 12; // discount at the market monthly rate
  if (r === 0) return mo * n;
  return (mo * (1 - Math.pow(1 + r, -n))) / r;
};

// Returns snapshot + 5-year wealth projection for the buyer deck (shared across creative tabs).
function buildDealExtras({ loanAmt, rate, term, arv, equity, cashFlow, cashToClose, coc }) {
  const paydown5 = loanAmt > 0 ? loanAmt - balanceAt(loanAmt, rate, term, 5) : 0;
  const appreciation5 = arv > 0 ? arv * (Math.pow(1.03, 5) - 1) : 0;
  const cumCF5 = cashFlow * 60;
  const startEquity = Math.max(0, equity);
  // 1–30 year return curve: equity captured + loan paydown + cumulative cash flow + 3%/yr appreciation
  const curveSeries = [];
  for (let y = 1; y <= 30; y++) {
    const paydown = loanAmt > 0 ? loanAmt - balanceAt(loanAmt, rate, term, y) : 0;
    const appr = arv > 0 ? arv * (Math.pow(1.03, y) - 1) : 0;
    const cumCF = cashFlow * 12 * y;
    curveSeries.push({ year: y, total: startEquity + paydown + appr + cumCF });
  }
  const milestones = [1, 5, 10, 15, 20, 25, 30].map((y) => curveSeries[y - 1]).filter(Boolean);
  return {
    returns: { cashToClose, monthlyCF: cashFlow, annualCF: cashFlow * 12, coc },
    projection: { startEquity, paydown5, appreciation5, cumCF5, total5: startEquity + paydown5 + appreciation5 + cumCF5, apprRate: 3 },
    curve: { series: curveSeries, milestones, cashToClose },
    exits: [
      "Hold as a cash-flowing long-term rental",
      "BRRRR — season, refinance, and recycle your capital",
      "Resell on terms to your own buyer for a markup",
    ],
  };
}

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
  const [rentcastArv, setRentcastArv] = useState(null); // RentCast's own AVM, kept as a reference only
  // --- rental ---
  const [rentEst, setRentEst] = useState(null);      // RentCast rent estimate (auto)
  const [rentLow, setRentLow] = useState(null);
  const [rentHigh, setRentHigh] = useState(null);
  const [rentOverride, setRentOverride] = useState(""); // manual rent (wins when set)
  const [rentLoading, setRentLoading] = useState(false);
  const [rentMsg, setRentMsg] = useState(null);
  const [rentFetchedFor, setRentFetchedFor] = useState(""); // address we last pulled rent for (lazy-load guard)
  const [tab, setTab] = useState("cash");
  const [subjectInfo, setSubjectInfo] = useState(null);
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
      // Capture subject property details
      if (data.subject) setSubjectInfo({
        propertyType: data.subject.propertyType,
        beds: data.subject.beds,
        baths: data.subject.baths,
        yearBuilt: data.subject.yearBuilt,
        lastSaleDate: data.subject.lastSaleDate,
        lastSalePrice: data.subject.lastSalePrice,
      });
      // Fill the comp grid (address + sqft + price + details), pad to at least 3 rows
      const incoming = (data.comps || []).map((c) => ({
        sqft: String(c.sqft),
        price: String(c.price),
        address: c.address || "",
        propertyType: c.propertyType,
        beds: c.beds,
        baths: c.baths,
        yearBuilt: c.yearBuilt,
        distance: c.distance,
        listedDate: c.listedDate,
        removedDate: c.removedDate,
        lastSeenDate: c.lastSeenDate,
        status: c.status,
      }));
      if (incoming.length) {
        while (incoming.length < 3) incoming.push({ sqft: "", price: "", address: "" });
        setComps(incoming);
      }
      // Keep RentCast's own AVM as a REFERENCE only — do NOT shove it into the override,
      // or the comps would stop driving the ARV (removing comps would do nothing).
      setRentcastArv(data.arv || null);
      setArvOverride("");   // let the comps drive the ARV live
      const n = (data.comps || []).length;
      setCompMsg({ type: "ok", text: `Pulled ${n} comp${n === 1 ? "" : "s"}${data.arv ? ` · RentCast AVM ${usd(data.arv)} (reference)` : ""}. ARV is averaged from the comps below — trim outliers and it recalculates.` });
    } catch (e) {
      setCompMsg({ type: "err", text: "Couldn't reach the comp service. Is the proxy deployed?" });
    } finally {
      setCompLoading(false);
    }
  }

  // Pull the rent estimate on demand (from the BRRRR/DSCR "Generate" button). One RentCast credit per pull.
  async function fetchRent(addr) {
    const a = (addr || "").trim();
    if (!a) { setRentMsg({ type: "err", text: "Enter an address up top first, then reopen this tab." }); return; }
    setRentLoading(true);
    setRentMsg(null);
    try {
      const res = await fetch(`${RENT_API}?address=${encodeURIComponent(a)}`);
      const data = await res.json();
      if (!res.ok) { setRentMsg({ type: "err", text: data.error || "Rent lookup failed." }); return; }
      setRentEst(data.rent || null);
      setRentLow(data.rentLow || null);
      setRentHigh(data.rentHigh || null);
      setRentFetchedFor(a);
      setRentMsg(data.rent
        ? { type: "ok", text: `RentCast estimate ${usd(data.rent)}/mo${data.rentLow && data.rentHigh ? ` (range ${usd(data.rentLow)}–${usd(data.rentHigh)})` : ""}. Override below if you have a better number.` }
        : { type: "err", text: "No rent estimate available — enter rent manually below." });
    } catch (e) {
      setRentMsg({ type: "err", text: "Couldn't reach the rent service. Is the proxy deployed?" });
    } finally {
      setRentLoading(false);
    }
  }

  // Rent is pulled on demand from the BRRRR/DSCR panel's "Generate" button (uses a RentCast credit).

  // rehab + MAO %
  const [rehabLevel, setRehabLevel] = useState("moderate");
  const [customPsf, setCustomPsf] = useState("");
  const [repairOverride, setRepairOverride] = useState("");
  const [underPct, setUnderPct] = useState(75); // under $200k band
  const [overPct, setOverPct] = useState(80);    // over $200k band

  // cash/mao
  const [wholesaleFee, setWholesaleFee] = useState("15000");
  const [sellingPct, setSellingPct] = useState("10");
  const [holding, setHolding] = useState("5000");
  const [desiredProfit, setDesiredProfit] = useState("25000");
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

  // ---- rental ----
  const effRent = num(rentOverride) > 0 ? num(rentOverride) : (rentEst || 0); // override wins
  const onePctMax = effRent > 0 ? effRent * 100 : 0; // 1% rule: rent >= 1% of price → max price = rent × 100

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
  const addComp = () => setComps((cs) => (cs.length < 8 ? [...cs, { sqft: "", price: "", address: "" }] : cs));
  const rmComp = (i) => setComps((cs) => (cs.length > 1 ? cs.filter((_, idx) => idx !== i) : cs));

  const tabs = [
    { id: "cash", label: "Cash / MAO", Icon: Calculator },
    { id: "subto", label: "Sub-To", Icon: Building2 },
    { id: "hybrid", label: "Hybrid", Icon: Layers },
    { id: "sf", label: "Seller Finance", Icon: Banknote },
    { id: "nov", label: "Novation", Icon: RefreshCw },
  ];

  const validCompCount = comps.filter((c) => num(c.sqft) > 0 && num(c.price) > 0).length;
  const deckCommon = {
    address, arv, repairs,
    subjectLine: propLine(subjectInfo),
    rent: effRent,
    askingDefault: num(askingPrice),
    contractDefault: num(askingPrice),
    fee: num(wholesaleFee),
    compCount: num(arvOverride) > 0 ? 0 : validCompCount,
    avgPpsf: num(arvOverride) > 0 ? 0 : avgPsf,
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* header */}
      <div className="bg-slate-900 px-5 py-5">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-lg bg-white px-2 py-1.5 shadow-sm">
                <img src="/logo.png" alt="Your Local Home Buyer" className="h-9 w-auto object-contain" />
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight text-white">YLHB RE Calculator</div>
                <div className="text-[11px] text-slate-400">Acquisitions</div>
              </div>
            </div>
            <InstructionsButton />
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
              {(propLine(subjectInfo) || lastSoldLine(subjectInfo) || address) && (
                <div className="mt-1.5 space-y-0.5">
                  {(propLine(subjectInfo) || lastSoldLine(subjectInfo)) && (
                    <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                      {propLine(subjectInfo) && <span>{propLine(subjectInfo)}</span>}
                      {propLine(subjectInfo) && lastSoldLine(subjectInfo) && <span className="text-slate-300">•</span>}
                      {lastSoldLine(subjectInfo) && <span className="font-medium text-slate-600">{lastSoldLine(subjectInfo)}</span>}
                    </div>
                  )}
                  {address && (
                    <a href={gsearch(address)} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:underline">
                      <Search className="h-3 w-3" /> Google this property <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
              )}
            </div>
            <Field label="Subject sq ft">
              <PlainInput value={sqft} onChange={setSqft} placeholder="1500" suffix="sf" />
            </Field>
          </div>

          {/* comp grid */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Sold comps (YLHB method: avg $/sf × subject sf)
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
            <div className="mt-1 text-[10px] text-slate-400">
              Auto-comp pulls the 8 most-similar sold comps, filtered to the last 12 months and within ±250 sq ft of the subject.
            </div>
            <div className="mt-2 space-y-2">
              {comps.map((c, i) => {
                const ppsf = num(c.sqft) > 0 && num(c.price) > 0 ? num(c.price) / num(c.sqft) : 0;
                const flags = compFlags(c, subjectInfo, num(sqft));
                return (
                  <div key={i} className={`rounded-lg border p-2 ${flags.length ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-slate-50/50"}`}>
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
                          <a href={gsearch(c.address)} target="_blank" rel="noopener noreferrer"
                            title="Google this property"
                            className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-600 hover:bg-emerald-50">
                            <Search className="h-3 w-3" /> Google <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        ) : (
                          <span className="shrink-0 px-2 py-1 text-[11px] text-slate-300">no link</span>
                        )}
                      </div>
                      <button onClick={() => rmComp(i)} className="text-slate-300 hover:text-rose-500" aria-label="remove comp">×</button>
                    </div>
                    {/* property details + listing dates line */}
                    {(propLine(c) || listingLine(c)) && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 pl-7 text-[11px] text-slate-500">
                        {propLine(c) && <span>{propLine(c)}</span>}
                        {propLine(c) && listingLine(c) && <span className="text-slate-300">•</span>}
                        {listingLine(c) && <span className="text-slate-400">{listingLine(c)}</span>}
                      </div>
                    )}
                    {/* junk-comp flags vs subject */}
                    {flags.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-1 pl-7">
                        {flags.map((f, k) => (
                          <span key={k} className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                            <AlertTriangle className="h-2.5 w-2.5" /> {f}
                          </span>
                        ))}
                      </div>
                    )}
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
              {rentcastArv > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span>RentCast AVM (reference): <b className="text-slate-700">{usd(rentcastArv)}</b></span>
                  {num(arvOverride) !== rentcastArv && (
                    <button onClick={() => setArvOverride(String(rentcastArv))}
                      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 hover:bg-emerald-50">
                      use as ARV
                    </button>
                  )}
                  {num(arvOverride) > 0 && (
                    <button onClick={() => setArvOverride("")}
                      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-50">
                      back to comps
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ARV result */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Avg $/sf" value={avgPsf ? `$${avgPsf.toFixed(0)}` : "—"} sub={`${comps.filter((c) => num(c.sqft) > 0 && num(c.price) > 0).length} comps`} />
            <Stat label="After-Repair Value" value={usd(arv)} tone="default" big sub={num(arvOverride) > 0 ? "manual override" : "avg $/sf × subject sf"} />
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
            <CashTab {...{ arv, repairs, underPct, overPct, isOver, ruleMaoUnder, ruleMaoOver, investorMaoUnder, investorMaoOver, itemizedMao, activeInvestorMao, activeRuleMao, activePct, wholesaleFee, setWholesaleFee, sellingPct, setSellingPct, holding, setHolding, desiredProfit, setDesiredProfit, askingPrice, setAskingPrice, rentOverride, setRentOverride, rentDefault: effRent, deckCommon, onGenerateRent: () => fetchRent(address), rentLoading, rentMsg, hasAddress: !!address.trim() }} />
          )}
          {tab === "subto" && (
            <SubToTab {...{ arv, repairs, underPct, overPct, wholesaleFee, setWholesaleFee, deckCommon, rentDefault: effRent, stBal, setStBal, stPiti, setStPiti, stArrears, setStArrears, stCashSeller, setStCashSeller, stClosing, setStClosing, stRent, setStRent, stReservePct, setStReservePct }} />
          )}
          {tab === "hybrid" && (
            <HybridTab {...{ arv, repairs, underPct, overPct, wholesaleFee, setWholesaleFee, deckCommon, rentDefault: effRent, hyPrice, setHyPrice, hyDown, setHyDown, hyBal, setHyBal, hyPiti, setHyPiti, hyRate, setHyRate, hyTerm, setHyTerm, hyClosing, setHyClosing, hyRent, setHyRent, hyReservePct, setHyReservePct }} />
          )}
          {tab === "sf" && (
            <SellerFinanceTab {...{ arv, repairs, underPct, overPct, wholesaleFee, setWholesaleFee, deckCommon, rentDefault: effRent, sfPrice, setSfPrice, sfDown, setSfDown, sfRate, setSfRate, sfAmort, setSfAmort, sfBalloon, setSfBalloon, sfTaxIns, setSfTaxIns, sfRent, setSfRent, sfReservePct, setSfReservePct }} />
          )}
          {tab === "nov" && (
            <NovationTab {...{ novAsIs, setNovAsIs, novProfit, setNovProfit, novListFactor, setNovListFactor, novCostFactor, setNovCostFactor }} />
          )}
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-400">
          Formulas use standard YLHB methodology (ARV = avg $/sf × sq ft; MAO = ARV × band % − repairs).
          Bands default to 75% under $200k / 80% over, matching your sheet. Estimates only — verify comps and underwriting before offers. Not legal or financial advice.
        </div>
      </div>
    </div>
  );
}

// ---------- shared: how-to-use instructions ----------
function InstructionsButton() {
  const [open, setOpen] = useState(false);
  const steps = [
    ["Pull the property", "Type the address up top and hit Auto-comp. It pulls the ARV, sold comps, property details, and the subject's last sale — all from the address."],
    ["Tighten the comps", "Auto-comp keeps the 8 most-similar sold comps (last 12 months, ±250 sq ft). Comps that are off on beds, baths, age, size, or distance get an amber flag — delete the weak ones and the ARV recalculates live."],
    ["Pick your structure", "Use the tabs to run the deal as Cash/MAO, Sub-To, Hybrid, Seller Finance, Novation, or Rental. Each gives you a verdict and the key numbers."],
    ["Read the verdict", "Green means it pencils, amber means it's tight, red means walk. Hover the ⓘ icons for what any field means."],
    ["Wholesale it creative", "On the creative tabs, the 'If you wholesaled this contract' panel shows what you could assign the deal for — equity PLUS the financing value of the low rate. Lower rate = more value."],
    ["See the rate's worth", "The Rate Savings and amortization sliders show what a below-market loan saves over time and how the payment shifts from interest to principal."],
    ["Check the rental & BRRRR exit", "On the Cash/MAO tab, the BRRRR/DSCR panel shows the refinance, DSCR, and cash flow. Hit Generate next to Monthly rent to pull a RentCast estimate — only do that once the deal's under contract, since it uses a credit."],
    ["Send it to buyers", "Hit 'Download buyer deck' on any creative tab to generate a branded YLHB PowerPoint for your buyers list. Fill the required fields and it builds the slides."],
    ["Learn as you go", "Every tab has a plain-English explainer at the bottom, plus free Pace Morby videos on that structure."],
  ];
  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-[12px] font-semibold text-slate-200 hover:bg-slate-700">
        <HelpCircle className="h-4 w-4 text-emerald-400" /> How to use
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">How to use the YLHB RE Calculator</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-[13px] text-slate-500">Address in → deal out. Here's the flow, start to finish.</p>
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[12px] font-bold text-emerald-700">{i + 1}</span>
                  <div>
                    <div className="text-[13px] font-bold text-slate-800">{s[0]}</div>
                    <div className="text-[13px] leading-relaxed text-slate-600">{s[1]}</div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              Tip: numbers are estimates to get you to a fast yes/no. Always verify ARV, rent, condition, and loan terms before you commit a dollar.
            </div>
            <button onClick={() => setOpen(false)} className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700">Got it</button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- shared: buyer deck (.pptx) ----------
const YLHB = {
  email: "deals@yourlocalhomebuyerteam.com",
  phone: "(502) 305-8554",
  phoneRaw: "+15023058554",
  site: "www.yourlocalhomebuyerteam.com",
  siteUrl: "https://www.yourlocalhomebuyerteam.com",
};
const DECK = { FOREST: "1E4D2B", SAGE: "9CAF88", ORANGE: "E8833A", INK: "1A2E22", PAPER: "F5F7F4", WHITE: "FFFFFF", LINE: "DDE3DC" };

// Load PptxGenJS from CDN on first use (avoids bundling a heavy lib; keeps the Vercel build simple).
let _pptxPromise = null;
function loadPptx() {
  if (typeof window !== "undefined" && window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
  if (_pptxPromise) return _pptxPromise;
  _pptxPromise = new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js";
    sc.async = true;
    sc.onload = () => (window.PptxGenJS ? resolve(window.PptxGenJS) : reject(new Error("PowerPoint library loaded but unavailable.")));
    sc.onerror = () => reject(new Error("Could not load the PowerPoint library (check your connection)."));
    document.head.appendChild(sc);
  });
  return _pptxPromise;
}

async function getLogoData() {
  try {
    const res = await fetch("/logo.png");
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result).replace(/^data:/, "")); // pptxgenjs wants "image/png;base64,..."
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

async function generateBuyerDeck(data) {
  const PptxGenJS = await loadPptx();
  const logo = await getLogoData();
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 });
  pptx.layout = "W";
  pptx.author = "Your Local Home Buyer";
  pptx.company = "Your Local Home Buyer";
  const addLogo = (s, x, y, w) => { if (logo) s.addImage({ data: logo, x, y, w, h: w * 0.59 }); };

  // Slide 1 — cover (photo if provided, else branded title card)
  let s = pptx.addSlide();
  if (data.photo) {
    s.background = { color: DECK.INK };
    try { s.addImage({ data: data.photo, x: 0, y: 0, w: 13.333, h: 5.1, sizing: { type: "cover", w: 13.333, h: 5.1 } }); } catch { /* bad image — skip */ }
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.1, w: 13.333, h: 2.4, fill: { color: DECK.FOREST } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.35, w: 13.333, h: 0.15, fill: { color: DECK.ORANGE } });
    addLogo(s, 11.1, 5.32, 1.6);
    s.addText("INVESTMENT OPPORTUNITY", { x: 0.6, y: 5.3, w: 10, h: 0.4, fontSize: 14, color: DECK.SAGE, bold: true, charSpacing: 3 });
    s.addText(data.address || "Property address", { x: 0.6, y: 5.7, w: 10.3, h: 0.9, fontSize: 30, color: DECK.WHITE, bold: true });
    if (data.headline) s.addText(data.headline, { x: 0.6, y: 6.7, w: 11, h: 0.5, fontSize: 16, color: DECK.SAGE });
  } else {
    s.background = { color: DECK.FOREST };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.7, w: 13.333, h: 0.8, fill: { color: DECK.ORANGE } });
    addLogo(s, 0.6, 0.5, 2.3);
    s.addText("INVESTMENT OPPORTUNITY", { x: 0.6, y: 2.5, w: 12.1, h: 0.5, fontSize: 16, color: DECK.SAGE, bold: true, charSpacing: 3 });
    s.addText(data.address || "Property address", { x: 0.6, y: 3.0, w: 12.1, h: 1.2, fontSize: 38, color: DECK.WHITE, bold: true });
    if (data.headline) s.addText(data.headline, { x: 0.6, y: 4.35, w: 12.1, h: 0.6, fontSize: 18, color: DECK.SAGE });
  }

  const header = (slide, title) => {
    slide.background = { color: DECK.PAPER };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 1.1, fill: { color: DECK.FOREST } });
    slide.addText(title, { x: 0.6, y: 0.28, w: 10.4, h: 0.6, fontSize: 26, color: DECK.WHITE, bold: true });
    addLogo(slide, 11.3, 0.2, 1.45);
  };
  const kv = (rows) => rows.map((r) => [{ text: r[0], options: { bold: true, color: DECK.FOREST } }, { text: r[1], options: { align: "right", color: DECK.INK } }]);
  const tableOpts = { fontSize: 15, color: DECK.INK, rowH: 0.6, valign: "middle", fill: { color: DECK.WHITE }, border: { type: "solid", color: DECK.LINE, pt: 1 } };

  // Slide 2 — property
  s = pptx.addSlide(); header(s, "The Property");
  const propRows = [["Address", data.address || "—"]];
  if (data.subjectLine) propRows.push(["Property", data.subjectLine]);
  propRows.push(["After-Repair Value (ARV)", data.arv ? usd(data.arv) : "—"]);
  propRows.push(["Estimated rehab", data.repairs ? usd(data.repairs) : "—"]);
  propRows.push([data.priceLabel || "Purchase price", data.asking ? usd(data.asking) : "—"]);
  propRows.push(["Estimated rent", data.rent ? usd(data.rent) + "/mo" : "—"]);
  s.addTable(kv(propRows), { x: 0.6, y: 1.5, w: 12.1, colW: [4.2, 7.9], ...tableOpts });
  s.addText("Estimates for buyer review. Buyer to verify all figures, condition, and terms independently.", { x: 0.6, y: 6.9, w: 12.1, h: 0.4, fontSize: 9, color: "8A968C", italic: true });

  // Slide 3 — the deal
  s = pptx.addSlide(); header(s, `The Deal — ${data.dealType}`);
  const dRows = (data.dealRows && data.dealRows.length ? data.dealRows : [["—", "—"]]);
  s.addTable(kv(dRows), { x: 0.6, y: 1.5, w: 7.9, colW: [5.1, 2.8], ...tableOpts });
  if (dRows.some((r) => /PITI/i.test(String(r[0])))) s.addText("PITI = principal, interest, taxes & insurance — the monthly payment you take over.", { x: 0.6, y: 1.5 + dRows.length * 0.6 + 0.15, w: 7.9, h: 0.5, fontSize: 11, color: "6B7A6F", italic: true });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.9, y: 1.5, w: 3.8, h: 2.4, fill: { color: DECK.FOREST }, rectRadius: 0.1 });
  s.addText([
    { text: (data.totalLabel || "TOTAL DEAL VALUE").toUpperCase() + "\n", options: { fontSize: 13, color: DECK.SAGE, bold: true } },
    { text: data.totalValue || "—", options: { fontSize: 32, color: DECK.WHITE, bold: true } },
  ], { x: 8.9, y: 1.95, w: 3.8, h: 1.5, align: "center", valign: "middle" });
  if (data.verdict) s.addText(data.verdict, { x: 8.9, y: 4.05, w: 3.8, h: 2.4, fontSize: 12, color: DECK.INK, align: "center" });

  // Slide 4 — why this deal
  const highlights = (data.highlights || []).filter(Boolean);
  if (highlights.length) {
    s = pptx.addSlide(); header(s, "Why this deal");
    const items = highlights.slice(0, 6).map((h) => ({ text: h, options: { bullet: { code: "2713", indent: 18 }, color: DECK.INK, fontSize: 18, paraSpaceAfter: 14 } }));
    s.addText(items, { x: 0.9, y: 1.6, w: 11.5, h: 4.6, valign: "top" });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.9, w: 13.333, h: 0.6, fill: { color: DECK.ORANGE } });
  }

  // Slide — returns snapshot
  const R = data.returns;
  if (R && (R.monthlyCF || R.cashToClose || R.annualCF)) {
    s = pptx.addSlide(); header(s, "The Returns");
    const card = (x, label, value, accent) => {
      s.addShape(pptx.ShapeType.roundRect, { x, y: 1.6, w: 2.85, h: 1.9, fill: { color: DECK.WHITE }, line: { color: DECK.LINE, width: 1 }, rectRadius: 0.08 });
      s.addText([
        { text: label.toUpperCase() + "\n", options: { fontSize: 11, color: "6B7A6F", bold: true } },
        { text: value, options: { fontSize: 26, color: accent || DECK.FOREST, bold: true } },
      ], { x, y: 1.85, w: 2.85, h: 1.4, align: "center", valign: "middle" });
    };
    card(0.6, "Cash to close", R.cashToClose ? usd(R.cashToClose) : "—", DECK.INK);
    card(3.65, "Monthly cash flow", R.monthlyCF ? usd(R.monthlyCF) : "—", DECK.FOREST);
    card(6.7, "Annual cash flow", R.annualCF ? usd(R.annualCF) : "—", DECK.FOREST);
    card(9.75, "Cash-on-cash", R.coc ? R.coc.toFixed(1) + "%" : "—", DECK.ORANGE);
    if (data.exits && data.exits.length) {
      s.addText("Exit strategies", { x: 0.6, y: 3.9, w: 12, h: 0.4, fontSize: 15, color: DECK.FOREST, bold: true });
      const ex = data.exits.slice(0, 4).map((e) => ({ text: e, options: { bullet: { code: "2022", indent: 16 }, color: DECK.INK, fontSize: 15, paraSpaceAfter: 8 } }));
      s.addText(ex, { x: 0.7, y: 4.4, w: 12, h: 2, valign: "top" });
    }
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.9, w: 13.333, h: 0.6, fill: { color: DECK.ORANGE } });
  }

  // Slide — 5-year wealth projection
  const P5 = data.projection;
  if (P5 && P5.total5 > 0) {
    s = pptx.addSlide(); header(s, "5-Year Wealth Snapshot");
    const projRows = [
      ["Equity today (below ARV)", usd(P5.startEquity)],
      ["Loan paydown (5 yrs)", usd(P5.paydown5)],
      [`Appreciation (5 yrs @ ${P5.apprRate}%/yr)`, usd(P5.appreciation5)],
      ["Cumulative cash flow (5 yrs)", usd(P5.cumCF5)],
    ];
    s.addTable(kv(projRows), { x: 0.6, y: 1.6, w: 7.9, colW: [5.4, 2.5], ...tableOpts, rowH: 0.7 });
    s.addShape(pptx.ShapeType.roundRect, { x: 8.9, y: 1.6, w: 3.8, h: 2.8, fill: { color: DECK.FOREST }, rectRadius: 0.1 });
    s.addText([
      { text: "TOTAL 5-YEAR VALUE\n", options: { fontSize: 13, color: DECK.SAGE, bold: true } },
      { text: usd(P5.total5), options: { fontSize: 30, color: DECK.WHITE, bold: true } },
    ], { x: 8.9, y: 2.2, w: 3.8, h: 1.6, align: "center", valign: "middle" });
    s.addText("Equity build + paydown + modest appreciation + cash flow. Appreciation is an assumption, not a guarantee.", { x: 0.6, y: 6.6, w: 12.1, h: 0.5, fontSize: 10, color: "8A968C", italic: true });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.2, w: 13.333, h: 0.3, fill: { color: DECK.ORANGE } });
  }

  // Slide — CTA / contact
  s = pptx.addSlide();
  s.background = { color: DECK.FOREST };
  addLogo(s, 5.45, 0.7, 2.45);
  s.addText("Want this deal? Let's talk.", { x: 0.6, y: 2.35, w: 12.1, h: 0.8, fontSize: 34, color: DECK.WHITE, bold: true, align: "center" });

  const c = data.contact || {};
  let cy = 3.35;
  if (c.name) { s.addText(c.name, { x: 0.6, y: cy, w: 12.1, h: 0.45, fontSize: 20, color: DECK.SAGE, bold: true, align: "center" }); cy += 0.55; }

  s.addText([
    { text: "✉  ", options: { color: DECK.SAGE } },
    { text: YLHB.email, options: { color: DECK.WHITE, hyperlink: { url: `mailto:${YLHB.email}` } } },
  ], { x: 0.6, y: cy, w: 12.1, h: 0.45, fontSize: 18, align: "center" });
  cy += 0.5;
  s.addText([
    { text: "✆  ", options: { color: DECK.SAGE } },
    { text: c.phone || YLHB.phone, options: { color: DECK.WHITE, hyperlink: { url: `tel:${YLHB.phoneRaw}` } } },
  ], { x: 0.6, y: cy, w: 12.1, h: 0.45, fontSize: 18, align: "center" });
  cy += 0.5;
  s.addText([
    { text: "⌂  ", options: { color: DECK.SAGE } },
    { text: YLHB.site, options: { color: DECK.WHITE, bold: true, hyperlink: { url: YLHB.siteUrl } } },
  ], { x: 0.6, y: cy, w: 12.1, h: 0.45, fontSize: 18, align: "center" });

  s.addText("We work a short buyers list and move quickly — reach out to lock this one up.", { x: 0.6, y: cy + 0.7, w: 12.1, h: 0.5, fontSize: 14, color: DECK.SAGE, align: "center", italic: true });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.9, w: 13.333, h: 0.6, fill: { color: DECK.ORANGE } });
  const safe = (data.address || "deal").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);
  await pptx.writeFile({ fileName: `YLHB-${safe || "deal"}.pptx` });
}

// Dual-exit deck: shows the SAME deal as both a Fix & Flip and a BRRRR hold, so the buyer picks their lane.
async function generateDualDeck(data) {
  const PptxGenJS = await loadPptx();
  const logo = await getLogoData();
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "W", width: 13.333, height: 7.5 });
  pptx.layout = "W";
  pptx.author = "Your Local Home Buyer";
  pptx.company = "Your Local Home Buyer";
  const addLogo = (s, x, y, w) => { if (logo) s.addImage({ data: logo, x, y, w, h: w * 0.59 }); };
  const header = (slide, title) => {
    slide.background = { color: DECK.PAPER };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 1.1, fill: { color: DECK.FOREST } });
    slide.addText(title, { x: 0.6, y: 0.28, w: 10.4, h: 0.6, fontSize: 26, color: DECK.WHITE, bold: true });
    addLogo(slide, 11.3, 0.2, 1.45);
  };
  const kv = (rows) => rows.map((r) => [{ text: r[0], options: { bold: true, color: DECK.FOREST } }, { text: r[1], options: { align: "right", color: DECK.INK } }]);
  const tableOpts = { fontSize: 14, color: DECK.INK, rowH: 0.55, valign: "middle", fill: { color: DECK.WHITE }, border: { type: "solid", color: DECK.LINE, pt: 1 } };
  const bullets = (arr, accent) => (arr || []).filter(Boolean).map((t) => ({ text: t, options: { bullet: { code: "2022", indent: 14 }, fontSize: 13, color: DECK.INK, paraSpaceAfter: 7 } }));

  // Slide 1 — cover
  let s = pptx.addSlide();
  const headline = "Two ways to win — Fix & Flip or BRRRR";
  if (data.photo) {
    s.background = { color: DECK.INK };
    try { s.addImage({ data: data.photo, x: 0, y: 0, w: 13.333, h: 5.1, sizing: { type: "cover", w: 13.333, h: 5.1 } }); } catch {}
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.1, w: 13.333, h: 2.4, fill: { color: DECK.FOREST } });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.35, w: 13.333, h: 0.15, fill: { color: DECK.ORANGE } });
    addLogo(s, 11.1, 5.32, 1.6);
    s.addText("INVESTMENT OPPORTUNITY", { x: 0.6, y: 5.3, w: 10, h: 0.4, fontSize: 14, color: DECK.SAGE, bold: true, charSpacing: 3 });
    s.addText(data.address || "Property address", { x: 0.6, y: 5.7, w: 10.3, h: 0.9, fontSize: 30, color: DECK.WHITE, bold: true });
    s.addText(headline, { x: 0.6, y: 6.7, w: 11, h: 0.5, fontSize: 16, color: DECK.SAGE });
  } else {
    s.background = { color: DECK.FOREST };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.7, w: 13.333, h: 0.8, fill: { color: DECK.ORANGE } });
    addLogo(s, 0.6, 0.5, 2.3);
    s.addText("INVESTMENT OPPORTUNITY", { x: 0.6, y: 2.5, w: 12.1, h: 0.5, fontSize: 16, color: DECK.SAGE, bold: true, charSpacing: 3 });
    s.addText(data.address || "Property address", { x: 0.6, y: 3.0, w: 12.1, h: 1.2, fontSize: 38, color: DECK.WHITE, bold: true });
    s.addText(headline, { x: 0.6, y: 4.35, w: 12.1, h: 0.6, fontSize: 18, color: DECK.SAGE });
  }

  // Slide 2 — property
  s = pptx.addSlide(); header(s, "The Property");
  const propRows = [["Address", data.address || "—"]];
  if (data.subjectLine) propRows.push(["Property", data.subjectLine]);
  propRows.push(["After-Repair Value (ARV)", data.arv ? usd(data.arv) : "—"]);
  propRows.push(["Estimated rehab", data.repairs ? usd(data.repairs) : "—"]);
  propRows.push([data.priceLabel || "Purchase price", data.asking ? usd(data.asking) : "—"]);
  propRows.push(["Estimated rent", data.rent ? usd(data.rent) + "/mo" : "—"]);
  s.addTable(kv(propRows), { x: 0.6, y: 1.5, w: 12.1, colW: [4.2, 7.9], ...tableOpts, rowH: 0.6, fontSize: 15 });
  s.addText("Estimates for buyer review. Buyer to verify all figures, condition, and terms independently.", { x: 0.6, y: 6.9, w: 12.1, h: 0.4, fontSize: 9, color: "8A968C", italic: true });

  // Slide 3 — two ways to win (the hero comparison)
  s = pptx.addSlide(); header(s, "Two ways to win");
  // Flip card
  s.addShape(pptx.ShapeType.roundRect, { x: 0.6, y: 1.45, w: 5.9, h: 4.9, fill: { color: DECK.WHITE }, line: { color: DECK.ORANGE, width: 2 }, rectRadius: 0.1 });
  s.addText("OPTION A — FIX & FLIP", { x: 0.85, y: 1.7, w: 5.4, h: 0.4, fontSize: 15, color: DECK.ORANGE, bold: true });
  s.addText([{ text: "Profit potential\n", options: { fontSize: 12, color: "6B7A6F" } }, { text: data.flip.profitStr, options: { fontSize: 30, color: DECK.INK, bold: true } }], { x: 0.85, y: 2.15, w: 5.4, h: 1.1, valign: "top" });
  s.addText(bullets(data.flip.bullets), { x: 0.95, y: 3.35, w: 5.3, h: 2.85, valign: "top" });
  // BRRRR card
  s.addShape(pptx.ShapeType.roundRect, { x: 6.85, y: 1.45, w: 5.9, h: 4.9, fill: { color: DECK.WHITE }, line: { color: DECK.FOREST, width: 2 }, rectRadius: 0.1 });
  s.addText("OPTION B — BRRRR (HOLD)", { x: 7.1, y: 1.7, w: 5.4, h: 0.4, fontSize: 15, color: DECK.FOREST, bold: true });
  s.addText([{ text: "Cash flow & DSCR\n", options: { fontSize: 12, color: "6B7A6F" } }, { text: data.brrrr.headlineStr + "\n", options: { fontSize: 24, color: DECK.FOREST, bold: true } }, { text: data.brrrr.returnStr, options: { fontSize: 13.5, color: DECK.INK, bold: true } }], { x: 7.1, y: 2.15, w: 5.4, h: 1.5, valign: "top" });
  s.addText(bullets(data.brrrr.bullets), { x: 7.2, y: 3.7, w: 5.3, h: 2.5, valign: "top" });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.9, w: 13.333, h: 0.6, fill: { color: DECK.ORANGE } });

  // Slide 4 — Option A detail (flip)
  s = pptx.addSlide(); header(s, "Option A — Fix & Flip");
  s.addTable(kv(data.flip.rows), { x: 0.6, y: 1.5, w: 7.9, colW: [5.1, 2.8], ...tableOpts });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.9, y: 1.5, w: 3.8, h: 2.4, fill: { color: DECK.ORANGE }, rectRadius: 0.1 });
  s.addText([{ text: "PROFIT POTENTIAL\n", options: { fontSize: 13, color: DECK.WHITE, bold: true } }, { text: data.flip.profitStr, options: { fontSize: 32, color: DECK.WHITE, bold: true } }], { x: 8.9, y: 1.95, w: 3.8, h: 1.5, align: "center", valign: "middle" });
  if (data.flip.note) s.addText(data.flip.note, { x: 8.9, y: 4.05, w: 3.8, h: 2.2, fontSize: 12, color: DECK.INK, align: "center" });

  // Slide 5 — Option B detail (BRRRR)
  s = pptx.addSlide(); header(s, "Option B — BRRRR (Hold)");
  s.addTable(kv(data.brrrr.rows), { x: 0.6, y: 1.5, w: 7.9, colW: [5.1, 2.8], ...tableOpts, rowH: 0.5 });
  s.addText("PITIA = principal, interest, taxes, insurance & HOA — the all-in monthly payment on the new loan.", { x: 0.6, y: 1.5 + data.brrrr.rows.length * 0.5 + 0.15, w: 7.9, h: 0.5, fontSize: 11, color: "6B7A6F", italic: true });
  s.addShape(pptx.ShapeType.roundRect, { x: 8.9, y: 1.5, w: 3.8, h: 2.4, fill: { color: DECK.FOREST }, rectRadius: 0.1 });
  s.addText([{ text: "CASH-ON-CASH\n", options: { fontSize: 13, color: DECK.SAGE, bold: true } }, { text: data.brrrr.cocStr, options: { fontSize: 32, color: DECK.WHITE, bold: true } }], { x: 8.9, y: 1.95, w: 3.8, h: 1.5, align: "center", valign: "middle" });
  if (data.brrrr.note) s.addText(data.brrrr.note, { x: 8.9, y: 4.05, w: 3.8, h: 2.2, fontSize: 12, color: DECK.INK, align: "center" });

  // Slide 6 — 5-year wealth (BRRRR)
  const P5 = data.brrrr.projection;
  if (P5 && P5.total5 > 0) {
    s = pptx.addSlide(); header(s, "BRRRR — 5-Year Wealth Snapshot");
    const projRows = [
      ["Equity after rehab (below ARV)", usd(P5.startEquity)],
      ["Loan paydown (5 yrs)", usd(P5.paydown5)],
      [`Appreciation (5 yrs @ ${P5.apprRate}%/yr)`, usd(P5.appreciation5)],
      ["Cumulative cash flow (5 yrs)", usd(P5.cumCF5)],
    ];
    s.addTable(kv(projRows), { x: 0.6, y: 1.6, w: 7.9, colW: [5.4, 2.5], ...tableOpts, rowH: 0.7, fontSize: 15 });
    s.addShape(pptx.ShapeType.roundRect, { x: 8.9, y: 1.6, w: 3.8, h: 2.8, fill: { color: DECK.FOREST }, rectRadius: 0.1 });
    s.addText([{ text: "TOTAL 5-YEAR VALUE\n", options: { fontSize: 13, color: DECK.SAGE, bold: true } }, { text: usd(P5.total5), options: { fontSize: 30, color: DECK.WHITE, bold: true } }], { x: 8.9, y: 2.2, w: 3.8, h: 1.6, align: "center", valign: "middle" });
    s.addText("Equity build + paydown + modest appreciation + cash flow. Appreciation is an assumption, not a guarantee.", { x: 0.6, y: 6.6, w: 12.1, h: 0.5, fontSize: 10, color: "8A968C", italic: true });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.2, w: 13.333, h: 0.3, fill: { color: DECK.ORANGE } });
  }

  // Slide 7 — How the returns grow (1–30 yr chart)
  const CV = data.brrrr.curve;
  if (CV && CV.series && CV.series.length && CV.series[CV.series.length - 1].total > 0) {
    s = pptx.addSlide(); header(s, "How the returns grow — year 1 to 30");
    const labels = CV.series.map((p) => String(p.year));
    const values = CV.series.map((p) => Math.round(p.total));
    s.addChart(pptx.ChartType.line, [{ name: "Total return ($)", labels, values }], {
      x: 0.6, y: 1.4, w: 12.1, h: 3.55, showLegend: false, showTitle: false,
      lineSize: 3, lineSmooth: true, color: DECK.FOREST, chartColors: [DECK.FOREST],
      catAxisTitle: "Years held", showCatAxisTitle: true, catAxisTitleColor: "5A6B5E", catAxisTitleFontSize: 11,
      valAxisTitle: "Total return ($)", showValAxisTitle: true, valAxisTitleColor: "5A6B5E", valAxisTitleFontSize: 11,
      catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, valAxisLabelColor: "5A6B5E", catAxisLabelColor: "5A6B5E",
    });
    const ms = CV.milestones;
    const headRow = [{ text: "Years held", options: { bold: true, color: DECK.WHITE, fill: { color: DECK.FOREST }, align: "left", fontSize: 12 } },
      ...ms.map((m) => ({ text: String(m.year), options: { bold: true, color: DECK.WHITE, fill: { color: DECK.FOREST }, align: "center", fontSize: 12 } }))];
    const totalRow = [{ text: "Total return", options: { bold: true, color: DECK.INK, align: "left", fontSize: 12 } },
      ...ms.map((m) => ({ text: usd(m.total), options: { color: DECK.INK, align: "center", fontSize: 12 } }))];
    const rows = [headRow, totalRow];
    if (CV.cashToClose > 0) {
      rows.push([{ text: "Return on cash in", options: { bold: true, color: DECK.INK, align: "left", fontSize: 12 } },
        ...ms.map((m) => ({ text: (m.total / CV.cashToClose).toFixed(1) + "x", options: { bold: true, color: DECK.ORANGE, align: "center", fontSize: 12 } }))]);
    }
    const colRest = (12.1 - 2.7) / ms.length;
    s.addTable(rows, { x: 0.6, y: 5.15, w: 12.1, colW: [2.7, ...ms.map(() => colRest)], rowH: 0.46, valign: "middle", border: { type: "solid", color: DECK.LINE, pt: 0.5 } });
    s.addText("Total return = equity captured + loan paydown + cash flow + appreciation at 3%/yr. Appreciation is an assumption, not a guarantee.", { x: 0.6, y: 6.95, w: 12.1, h: 0.4, fontSize: 9, color: "8A968C", italic: true });
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.2, w: 13.333, h: 0.3, fill: { color: DECK.ORANGE } });
  }

  // Slide 8 — CTA
  s = pptx.addSlide();
  s.background = { color: DECK.FOREST };
  addLogo(s, 5.45, 0.7, 2.45);
  s.addText("Flip it or hold it — either way, let's talk.", { x: 0.6, y: 2.35, w: 12.1, h: 0.8, fontSize: 30, color: DECK.WHITE, bold: true, align: "center" });
  const c = data.contact || {};
  let cy = 3.35;
  if (c.name) { s.addText(c.name, { x: 0.6, y: cy, w: 12.1, h: 0.45, fontSize: 20, color: DECK.SAGE, bold: true, align: "center" }); cy += 0.55; }
  s.addText([{ text: "✉  ", options: { color: DECK.SAGE } }, { text: YLHB.email, options: { color: DECK.WHITE, hyperlink: { url: `mailto:${YLHB.email}` } } }], { x: 0.6, y: cy, w: 12.1, h: 0.45, fontSize: 18, align: "center" }); cy += 0.5;
  s.addText([{ text: "✆  ", options: { color: DECK.SAGE } }, { text: c.phone || YLHB.phone, options: { color: DECK.WHITE, hyperlink: { url: `tel:${YLHB.phoneRaw}` } } }], { x: 0.6, y: cy, w: 12.1, h: 0.45, fontSize: 18, align: "center" }); cy += 0.5;
  s.addText([{ text: "⌂  ", options: { color: DECK.SAGE } }, { text: YLHB.site, options: { color: DECK.WHITE, bold: true, hyperlink: { url: YLHB.siteUrl } } }], { x: 0.6, y: cy, w: 12.1, h: 0.45, fontSize: 18, align: "center" });
  s.addText("We work a short buyers list and move quickly — reach out to lock this one up.", { x: 0.6, y: cy + 0.7, w: 12.1, h: 0.5, fontSize: 14, color: DECK.SAGE, align: "center", italic: true });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 6.9, w: 13.333, h: 0.6, fill: { color: DECK.ORANGE } });

  const safe = (data.address || "deal").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40);
  await pptx.writeFile({ fileName: `YLHB-${safe || "deal"}-flip-brrrr.pptx` });
}

function BuyerDeckButton({ deal, common, generateOverride, label, priceLabel = "Purchase price" }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(null); // data URL of uploaded property photo
  const [f, setF] = useState({
    address: common.address || "",
    contract: common.contractDefault ? String(Math.round(common.contractDefault + (common.fee || 0))) : "",
    rent: common.rent ? String(Math.round(common.rent)) : "",
    name: "", phone: "", email: "",
  });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target?.value ?? e }));
  const missing = ["address", "contract", "rent"].filter((k) => !String(f[k]).trim());

  function onPhoto(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please choose an image file (JPG or PNG)."); return; }
    const r = new FileReader();
    r.onload = () => setPhoto(String(r.result));
    r.readAsDataURL(file);
  }

  async function go() {
    if (missing.length) return;
    setBusy(true);
    const buyerPrice = num(f.contract);  // field already holds contract + your fee (buyer's all-in)
    try {
      if (generateOverride) {
        await generateOverride({ address: f.address, asking: buyerPrice, rent: num(f.rent), photo, contact: { name: f.name, phone: f.phone, email: f.email } });
        setOpen(false);
        return;
      }
      await generateBuyerDeck({
        dealType: deal.type,
        address: f.address,
        subjectLine: common.subjectLine,
        arv: common.arv,
        repairs: common.repairs,
        asking: buyerPrice,
        priceLabel,
        rent: num(f.rent),
        photo,
        headline: deal.headline,
        dealRows: deal.rows,
        totalLabel: deal.totalLabel,
        totalValue: deal.totalValue,
        verdict: deal.verdict,
        highlights: deal.highlights,
        returns: deal.returns,
        projection: deal.projection,
        basis: { compCount: common.compCount, avgPpsf: common.avgPpsf, rent: num(f.rent) },
        exits: deal.exits,
        contact: { name: f.name, phone: f.phone, email: f.email },
      });
      setOpen(false);
    } catch (e) {
      alert("Couldn't generate the deck: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const req = (k, label, money) => (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label} <span className="text-rose-500">*</span></label>
      <div className={`mt-1 flex items-center rounded-lg border bg-white px-3 py-2 ${!String(f[k]).trim() ? "border-rose-300" : "border-slate-200"}`}>
        {money && <span className="mr-1 text-slate-400">$</span>}
        <input value={f[k]} onChange={set(k)} className="w-full text-sm outline-none" placeholder={label} />
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => { setF((p) => ({ ...p, address: common.address || p.address, contract: common.contractDefault ? String(Math.round(common.contractDefault + (common.fee || 0))) : p.contract, rent: common.rent ? String(Math.round(common.rent)) : p.rent })); setOpen(true); }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100">
        <FileDown className="h-4 w-4" /> {label || `Download buyer deck (.pptx) — ${deal.type}`}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">{label || `Buyer deck — ${deal.type}`}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-4 text-[12px] text-slate-500">Confirm the details for the slides. Fields marked <span className="text-rose-500">*</span> are required.</p>
            <div className="space-y-3">
              {req("address", "Property address")}
              <div className="grid grid-cols-2 gap-3">
                {req("contract", `${priceLabel}${num(common.fee) > 0 ? " (incl. fee)" : ""}`, true)}
                {req("rent", "Monthly rent", true)}
              </div>
              {num(common.fee) > 0 && <div className="-mt-1 text-[10px] text-slate-400">{priceLabel} includes your {usd(num(common.fee))} wholesale fee — what the buyer pays. Edit if needed.</div>}
              <div className="border-t border-slate-100 pt-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Property photo for the cover (optional)</div>
                {photo ? (
                  <div className="flex items-center gap-3">
                    <img src={photo} alt="cover" className="h-16 w-24 rounded-md object-cover" />
                    <button onClick={() => setPhoto(null)} className="text-[12px] font-semibold text-rose-500 hover:underline">Remove</button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-[12px] font-semibold text-slate-500 hover:bg-slate-50">
                    <FileDown className="h-4 w-4" /> Choose a photo (JPG/PNG)
                    <input type="file" accept="image/*" onChange={onPhoto} className="hidden" />
                  </label>
                )}
                <div className="mt-1 text-[10px] text-slate-400">No photo? The cover falls back to a clean branded YLHB title card with the address.</div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Contact for the CTA slide (optional)</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input value={f.name} onChange={set("name")} placeholder="Name" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" />
                  <input value={f.phone} onChange={set("phone")} placeholder="Phone" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" />
                  <input value={f.email} onChange={set("email")} placeholder="Email" className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" />
                </div>
              </div>
            </div>
            {missing.length > 0 && <div className="mt-3 text-[11px] text-rose-500">Fill in: {missing.map((m) => ({ address: "address", contract: "purchase price", rent: "monthly rent" }[m])).join(", ")}.</div>}
            <button onClick={go} disabled={busy || missing.length > 0}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Building deck…</> : <><FileDown className="h-4 w-4" /> Generate PowerPoint</>}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- shared: per-tab explainer + free learning links ----------
const PACE_CHANNEL = "https://www.youtube.com/channel/UCRkUNGepO8YnTFHSj7urWsQ";
const ytSearch = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

const EDU = {
  cash: {
    title: "Cash / MAO (wholesaling)",
    what: "A straight cash play. You lock the property under contract at a low enough price that a cash buyer can fix it and flip it — and you pocket the difference as an assignment fee, or buy it yourself.",
    how: "Start from the ARV (what it's worth fixed up), take 75–80% of it (the band), then subtract repairs and your fee. That's your Max Allowable Offer — the most you can pay and still leave meat on the bone for the next buyer.",
    analogy: "Like buying wholesale to resell at retail — your profit is baked in at the buy.",
    videos: [{ label: "Wholesaling basics", q: "pace morby wholesaling for beginners" }, { label: "How to calculate MAO", q: "pace morby maximum allowable offer ARV" }],
  },
  subto: {
    title: "Subject-To (Sub-To)",
    what: "You buy the house but leave the seller's existing mortgage in place — you take over their payments, while the loan stays in their name. You get the deed; they get out from under the debt.",
    how: "Gold when the seller has a low locked-in interest rate. You inherit that cheap payment (PITI), cover any back payments, and maybe hand the seller a little cash for their equity. Your money is made on the gap between the rent and that low inherited payment.",
    analogy: "Like taking over someone's gym membership at last year's rate instead of signing up at today's higher price.",
    videos: [{ label: "Subject-To explained", q: "pace morby subject to explained" }, { label: "Sub-To from start to finish", q: "pace morby subject to deal walkthrough" }],
  },
  hybrid: {
    title: "Hybrid (Sub-To + Seller Note)",
    what: "A combo deal: you take over the existing low-rate loan subject-to, AND the seller carries a second note for their equity on top.",
    how: "The cheap first loan stays in place. The gap between the price and that loan (minus your down) becomes a seller-financed note — often at 0%. You end up with two payments: one cheap and inherited, one to the seller. It gets deals done when the seller needs more than just debt relief.",
    analogy: "Sub-To handles the bank's loan; the seller note handles the seller's equity — best of both.",
    videos: [{ label: "The Morby Method", q: "pace morby method hybrid creative finance" }, { label: "Combining sub-to + seller finance", q: "pace morby subto seller finance combo" }],
  },
  sf: {
    title: "Seller Financing",
    what: "The seller becomes the bank. Instead of paying a mortgage company, you make payments straight to the seller over time, on terms the two of you agree to.",
    how: "You negotiate the price, down payment, interest rate (often 0% in trade for a higher price), how long it amortizes, and whether there's a balloon. No bank, no qualifying. Works best when the seller owns the home free-and-clear.",
    analogy: "Like a payment plan made directly with the owner — they hold the note, you hold the keys.",
    videos: [{ label: "Seller finance explained", q: "pace morby seller finance explained" }, { label: "Structuring 0% seller finance", q: "pace morby zero percent seller financing" }],
  },
  nov: {
    title: "Novation",
    what: "An agreement that lets you improve and re-sell the seller's home for more — you keep the spread between what you promised them and what it sells for, without ever taking title.",
    how: "You list the (often fixed-up) house at ARV. The buyer's price, minus selling/closing costs, minus your profit, sets the max you can offer the seller. You're not buying it to hold — you're adding value and capturing the resale spread.",
    analogy: "Like a consignment deal: you don't own it, you just make it worth more and take a cut of the upside.",
    videos: [{ label: "Novation agreements", q: "pace morby novation agreement real estate" }, { label: "Novation vs wholesaling", q: "pace morby novation vs wholesale" }],
  },
  rental: {
    title: "Rental (Buy-and-Hold + the 1% rule)",
    what: "Buying a property to keep as a long-term rental for cash flow and appreciation. The 1% rule is a quick screen: the monthly rent should be at least 1% of the purchase price.",
    how: "Estimate the rent, then divide by your target percentage to get the highest price that still pencils. It's a fast filter to spot cash-flowing deals — but it ignores taxes, insurance, vacancy, and management, so always underwrite the real numbers before you commit.",
    analogy: "The 1% rule is a metal detector, not a shovel — it tells you where to dig, not that there's treasure.",
    videos: [{ label: "Buy-and-hold rentals", q: "pace morby buy and hold rental" }, { label: "The 1% rule explained", q: "1 percent rule rental property explained" }],
  },
};

function TabEducation({ id }) {
  const e = EDU[id];
  if (!e) return null;
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Info className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-bold text-slate-700">What is {e.title}?</h3>
      </div>
      <p className="text-[13px] leading-relaxed text-slate-600">{e.what}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-600"><b className="font-semibold text-slate-700">How it works:</b> {e.how}</p>
      {e.analogy && (
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-[12px] italic leading-relaxed text-slate-500">💡 {e.analogy}</p>
      )}
      <div className="mt-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Learn more — free Pace Morby videos</div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {e.videos.map((v, k) => (
            <a key={k} href={ytSearch(v.q)} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-600">
              <Play className="h-3 w-3 text-rose-500" /> {v.label} <ExternalLink className="h-2.5 w-2.5 text-slate-300" />
            </a>
          ))}
          <a href={PACE_CHANNEL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50">
            Pace Morby's channel <ExternalLink className="h-2.5 w-2.5 text-slate-300" />
          </a>
        </div>
        <div className="mt-1.5 text-[10px] text-slate-400">Links open a YouTube search of Pace Morby's content on the topic — always current, never a dead link.</div>
      </div>
    </div>
  );
}

// ---------- CASH ----------
function CashTab(props) {
  const { arv, repairs, underPct, overPct, isOver, ruleMaoUnder, ruleMaoOver, investorMaoUnder, investorMaoOver, itemizedMao, activeInvestorMao, activeRuleMao, activePct, wholesaleFee, setWholesaleFee, sellingPct, setSellingPct, holding, setHolding, desiredProfit, setDesiredProfit, askingPrice, setAskingPrice, rentOverride, setRentOverride, rentDefault, deckCommon, onGenerateRent, rentLoading, rentMsg, hasAddress } = props;
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
      {/* INPUTS: your wholesale numbers (full width) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <SectionTitle>Your wholesale numbers</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Your wholesale fee" info="Your assignment fee — the spread YOU keep for putting the deal together. Subtracted to get your Investor MAO, and added on top for the buyer's all-in on the deck."><MoneyInput value={wholesaleFee} onChange={setWholesaleFee} /></Field>
          <Field label="Seller asking price" hint="negotiations & final contract price" info="One price for both jobs: it grades the deal while you negotiate, and prints on the buyer deck as your contract price (plus your wholesale fee). Just update it to your locked number once you're under contract."><MoneyInput value={askingPrice} onChange={setAskingPrice} /></Field>
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
          <Stat label="ARV" value={usd(arv)} sub={`repairs ${usd(repairs)}`} />
        </div>
      </div>

      {/* OPTIONAL — Itemized max offer: the flipper's inputs and the resulting number sit together so the cause/effect is obvious */}
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Itemized max offer</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Optional</span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
              A second, optional way to find your max offer — back into it from your <b className="font-semibold text-slate-600">end buyer's</b> costs and target profit (the investor who buys this from you and flips it — <b className="font-semibold text-slate-600">not you</b>). You don't have to fill this in — the Rule and Investor MAO above already work. When you do, the number on the right updates the instant you change a field on the left.
            </p>
          </div>
        </div>
        <div className="mt-3 grid items-stretch gap-4 md:grid-cols-2">
          {/* left: the flipper's inputs */}
          <div className="space-y-3">
            <Field label="Selling costs" hint="% of ARV" info="Cost to SELL the fixed-up house: agent commissions, title, closing. Roughly 8–10% of ARV."><PlainInput value={sellingPct} onChange={setSellingPct} suffix="%" /></Field>
            <Field label="Holding costs" info="Cost to OWN it during rehab and sale: loan interest, taxes, insurance, utilities. ~$3k–$8k on a typical flip."><MoneyInput value={holding} onChange={setHolding} /></Field>
            <Field label="Flipper's desired profit" hint="optional — your end buyer, not you" info="The profit the END BUYER (the investor who buys this from you and flips it) wants to clear after all their costs. This is THEIR cushion, not your wholesale fee. Commonly $25k–$40k+. Leave the default if you don't know it.">
              <MoneyInput value={desiredProfit} onChange={setDesiredProfit} />
              {num(desiredProfit) > 50000 && <div className="mt-1 flex items-start gap-1 text-[10px] font-medium text-amber-600"><span>⚠</span><span>That's high for a flip cushion — most flippers target $25k–$40k. A big number here pushes your max offer way down. Double-check this is really the buyer's number, not your wholesale fee.</span></div>}
            </Field>
          </div>
          {/* right: the live result, right next to the inputs that drive it */}
          <div className="flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-5 text-center">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Itemized max offer</div>
            <div className="mt-1 text-4xl font-bold tabular-nums text-slate-900">{usd(itemizedMao)}</div>
            <div className="mt-2 text-[11px] leading-snug text-slate-500">Buy at this price or lower and the flipper still clears the profit you entered.</div>
            <div className="mt-3 text-[10px] font-medium text-amber-700">↻ Updates the instant you change the flipper's desired profit.</div>
          </div>
        </div>
      </div>

      <BrrrrPanel
        arv={arv} repairs={repairs} rentDefault={rentDefault} rentOverride={rentOverride} setRentOverride={setRentOverride} purchaseDefault={activeInvestorMao}
        askingPrice={askingPrice} wholesaleFee={wholesaleFee} deckCommon={deckCommon}
        onGenerateRent={onGenerateRent} rentLoading={rentLoading} rentMsg={rentMsg} hasAddress={hasAddress}
        flipDeck={{
          sellingCost: arv * num(sellingPct) / 100,
          holdingCost: num(holding),
          sellingPct: num(sellingPct),
        }}
      />
      <TabEducation id="cash" />
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

// ---------- shared: BRRRR + DSCR (the hold/refi exit) ----------
function BrrrrPanel({ arv, repairs, rentDefault, rentOverride, setRentOverride, purchaseDefault, askingPrice, wholesaleFee, deckCommon, flipDeck, onGenerateRent, rentLoading, rentMsg, hasAddress }) {
  const [purchase, setPurchase] = useState("");
  const [rehab, setRehab] = useState("");
  const [taxIns, setTaxIns] = useState("");
  const [hoa, setHoa] = useState("");
  const [ltv, setLtv] = useState("75");
  const [rate, setRate] = useState("7.5");
  const [term, setTerm] = useState("30");
  const [reservePct, setReservePct] = useState("10");

  const buy = num(purchase);                                 // no default — enter the all-in price (incl. wholesale fee)
  const ask = num(askingPrice);                              // asking / contract price (set on the Cash / MAO tab above)
  const fee = num(wholesaleFee);                             // your assignment fee — shared Cash-tab value
  const askPlusFee = ask + fee;                              // what an end buyer pays when you wholesale it
  const fix = num(rehab) > 0 ? num(rehab) : repairs;
  const rnt = num(rentDefault);                              // shared rent (Generate or manual), already = override || estimate
  const allIn = buy + fix;
  const refiLoan = arv * (num(ltv) / 100);
  const cashLeftIn = allIn - refiLoan;
  const pi = pmt(refiLoan, num(rate), num(term));
  // Estimated taxes + insurance from the ARV (editable). Based on U.S. average rates, excluding the
  // outlier states CA, NY & FL: ~0.9%/yr effective property tax + ~0.6%/yr dwelling insurance = ~1.5%/yr.
  const estTax = arv > 0 ? (arv * 0.009) / 12 : 0;
  const estIns = arv > 0 ? (arv * 0.006) / 12 : 0;
  const estTaxIns = estTax + estIns;
  const taxInsEff = num(taxIns) > 0 ? num(taxIns) : estTaxIns;
  const pitia = pi + taxInsEff + num(hoa);                 // lender's denominator
  const dscr = pitia > 0 && rnt > 0 ? rnt / pitia : 0;
  const reserves = rnt * (num(reservePct) / 100);
  const trueCF = rnt - pitia - reserves;                      // your real monthly cash flow
  const annualCF = trueCF * 12;
  const coc = cashLeftIn > 0 ? (annualCF / cashLeftIn) * 100 : null; // null = all capital recovered
  // ---- ROI metrics ----
  const noiAnnual = (rnt - taxInsEff - num(hoa) - reserves) * 12;        // operating income, before debt service
  const capRate = arv > 0 ? (noiAnnual / arv) * 100 : 0;                 // unlevered yield on the asset
  const equityCaptured = arv - allIn;                                    // instant equity from buying right + rehab
  const paydown1 = refiLoan > 0 ? refiLoan - balanceAt(refiLoan, num(rate), num(term), 1) : 0; // year-1 principal
  const totalReturn1 = annualCF + paydown1;                             // year-1 cash flow + loan paydown
  const totalRoi = cashLeftIn > 0 ? (totalReturn1 / cashLeftIn) * 100 : null; // null = all capital recovered

  let dTone = "default", dNote = "Qualifies at standard terms.";
  if (dscr <= 0) { dTone = "default"; dNote = "Enter rent + PITIA to score the refi."; }
  else if (dscr >= 1.25) { dTone = "good"; dNote = "Strong — qualifies for the best DSCR rates."; }
  else if (dscr >= 1.0) { dTone = "good"; dNote = "Qualifies with most DSCR lenders (standard terms)."; }
  else if (dscr >= 0.75) { dTone = "warn"; dNote = "Thin — needs compensating factors (bigger down, reserves, IO)."; }
  else { dTone = "bad"; dNote = "Won't cover the payment — most lenders pass below 0.75."; }

  let brrrrLine = "Fill in your buy price and refi terms to see how much capital comes back out.";
  if (arv > 0 && allIn > 0) {
    if (cashLeftIn <= 0) brrrrLine = `Full BRRRR — the ${usd(refiLoan)} refi pulls out everything you put in, plus ${usd(-cashLeftIn)} above your basis. Infinite return: all your capital recycles into the next deal.`;
    else if (cashLeftIn <= 15000) brrrrLine = `Near-full BRRRR — you'd leave just ${usd(cashLeftIn)} in the deal after the ${usd(refiLoan)} refi. Most of your capital comes back out.`;
    else brrrrLine = `Capital-heavy — ${usd(cashLeftIn)} stays trapped in the deal after refi. Push the buy price down or the rehab leaner to recover more.`;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-emerald-500" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">BRRRR / DSCR — if you (or your buyer) hold it as a rental</h3>
      </div>
      <p className="mb-3 text-[11px] text-slate-400">Buy, rehab, rent, refinance, repeat. Refinance at the ARV, pull your capital back out, and see if it qualifies for a DSCR loan (rent ÷ PITIA).</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Purchase price (plus wholesale fee)" hint="all-in buy price" info="What the buyer actually pays to acquire it — the contract price PLUS your wholesale / assignment fee. If you're keeping it yourself, just enter your buy price (no fee to add). Enter it directly; no default.">
          <MoneyInput value={purchase} onChange={setPurchase} placeholder="Purchase price (plus wholesale fee)" />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setPurchase(String(Math.round(ask)))} disabled={ask <= 0}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
              title={ask > 0 ? "Fill with your asking / contract price — keeping it yourself, no fee to add" : "Enter a Seller asking price on the Cash / MAO tab above first"}>
              Use asking{ask > 0 ? ` · ${usd(ask)}` : ""}
            </button>
            <button type="button" onClick={() => setPurchase(String(Math.round(askPlusFee)))} disabled={ask <= 0}
              className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
              title={ask > 0 ? `Wholesaling it — asking + your ${usd(fee)} wholesale fee, what the buyer pays` : "Enter a Seller asking price on the Cash / MAO tab above first"}>
              Asking + fee{ask > 0 ? ` · ${usd(askPlusFee)}` : ""}
            </button>
          </div>
          {ask <= 0
            ? <div className="mt-1 text-[10px] italic text-slate-400">Set a <b className="text-slate-500">Seller asking price</b> on the Cash / MAO tab above to enable these quick-fills.</div>
            : <div className="mt-1 text-[10px] text-slate-400">Tap a button to fill from your asking / contract price, or type any amount. <b className="text-slate-500">Wholesaling</b> → price + your fee (what the buyer pays). <b className="text-slate-500">Keeping it</b> → just the price.</div>}
        </Field>
        <Field label="Rehab budget" info="Defaults to the repair estimate up top."><MoneyInput value={rehab} onChange={setRehab} placeholder={repairs > 0 ? String(Math.round(repairs)) : "e.g. 30000"} /></Field>
        <Field label="Monthly rent" info="Market rent once it's fixed and leased. Hit Generate to pull a RentCast estimate for this address, or type your own number.">
          <div className="flex items-center gap-2">
            <div className="flex-1"><MoneyInput value={rentOverride} onChange={setRentOverride} placeholder={num(rentDefault) > 0 ? String(Math.round(num(rentDefault))) : "Type, or hit Generate"} /></div>
            <button type="button" onClick={onGenerateRent} disabled={rentLoading || !hasAddress}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              title={hasAddress ? "Pull a RentCast rent estimate for this address" : "Add an address up top first"}>
              {rentLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Generate
            </button>
          </div>
          <div className="mt-1 text-[10px] font-bold text-rose-600">⚠ Only generate once the deal is under contract — each pull uses a RentCast credit.</div>
          {rentMsg && rentMsg.type === "err" && <div className="mt-1 text-[10px] text-rose-600">{rentMsg.text}</div>}
          {num(rentDefault) > 0 && !rentLoading && <div className="mt-0.5 text-[10px] text-slate-400">RentCast estimate ${Math.round(num(rentDefault)).toLocaleString()}/mo loaded — shown above; type to override.</div>}
        </Field>
        <Field label="Taxes + insurance" hint="monthly" info="Monthly property taxes + insurance — part of PITIA, the DSCR denominator. Auto-estimated from the ARV using U.S. average rates (~0.9% tax + ~0.6% insurance per year), excluding the outlier states CA, NY & FL. Type the actual to override.">
          <MoneyInput value={taxIns} onChange={setTaxIns} placeholder={estTaxIns > 0 ? String(Math.round(estTaxIns)) : "e.g. 300"} />
          {estTaxIns > 0 && (
            <div className="mt-1 text-[10px] text-slate-400">
              {num(taxIns) <= 0 ? <>Auto-estimate ~${Math.round(estTax).toLocaleString()} tax + ~${Math.round(estIns).toLocaleString()} insurance/mo. </> : null}
              <span className="italic">U.S. average rates, excludes CA/NY/FL — verify the actual for this property.</span>
            </div>
          )}
        </Field>
        <Field label="HOA" hint="monthly, if any" info="Monthly HOA / association dues, if the property has them. Also part of PITIA."><MoneyInput value={hoa} onChange={setHoa} /></Field>
        <Field label="Reserves" hint="% of rent" info="Vacancy + maintenance + management set-aside. NOT part of the lender's DSCR, but real money — used here for your true cash flow."><PlainInput value={reservePct} onChange={setReservePct} suffix="%" /></Field>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Refi LTV" hint="% of ARV" info="Cash-out refinances on rentals typically max out around 70–75% of the after-repair value."><PlainInput value={ltv} onChange={setLtv} suffix="%" /></Field>
        <Field label="Refi rate" hint="%" info="DSCR loan rates run ~6–7.5% right now. Higher than owner-occupied — these are investor loans."><PlainInput value={rate} onChange={setRate} suffix="%" /></Field>
        <Field label="Refi term" hint="years" info="Almost always a 30-year amortization on DSCR loans."><PlainInput value={term} onChange={setTerm} suffix="yr" /></Field>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Refi loan" value={arv > 0 ? usd(refiLoan) : "—"} sub={`ARV × ${num(ltv)}%`} />
        <Stat label="Cash left in deal" value={arv > 0 && buy > 0 ? usd(cashLeftIn) : "—"} tone={buy > 0 ? (cashLeftIn <= 0 ? "good" : cashLeftIn <= 15000 ? "default" : "warn") : "default"} sub={cashLeftIn <= 0 ? "all capital out" : "stays in after refi"} />
        <Stat label="DSCR" value={dscr > 0 ? dscr.toFixed(2) : "—"} tone={dTone} big sub="rent ÷ PITIA" />
        <Stat label="New payment (PITIA)" value={pitia > 0 ? usd(pitia) : "—"} sub={`P&I ${usd(pi)} + tax/ins/HOA`} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Stat label="Monthly cash flow" value={pitia > 0 && rnt > 0 ? usd(trueCF) : "—"} tone={trueCF > 0 ? "good" : pitia > 0 ? "bad" : "default"} sub={`after ${num(reservePct)}% reserves`} />
        <Stat label="Cash-on-cash" value={buy <= 0 ? "—" : coc === null ? "∞ (all cash out)" : annualCF !== 0 && cashLeftIn > 0 ? coc.toFixed(1) + "%" : "—"} tone={buy > 0 && (coc === null || (coc && coc > 8)) ? "good" : "default"} sub={coc === null ? "no capital left in" : "annual CF ÷ cash left in"} />
      </div>

      {/* ROI / Returns */}
      <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
        <div className="mb-2 flex items-center gap-2">
          <TrendingDown className="h-4 w-4 rotate-180 text-emerald-500" />
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-emerald-700/80">ROI / Returns</h4>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Cap rate" value={arv > 0 && rnt > 0 ? capRate.toFixed(1) + "%" : "—"} tone={capRate >= 7 ? "good" : capRate > 0 ? "default" : "default"} sub="NOI ÷ ARV (unlevered)" />
          <Stat label="Equity captured" value={arv > 0 && buy > 0 ? usd(equityCaptured) : "—"} tone={buy > 0 && equityCaptured > 0 ? "good" : buy > 0 ? "bad" : "default"} sub="ARV − all-in" />
          <Stat label="Total ROI (yr 1)" value={buy <= 0 ? "—" : totalRoi === null ? "∞ (all cash out)" : (cashLeftIn > 0 && totalReturn1 !== 0 ? totalRoi.toFixed(1) + "%" : "—")} tone={buy > 0 && (totalRoi === null || (totalRoi && totalRoi > 12)) ? "good" : "default"} sub="cash flow + paydown ÷ cash in" />
          <Stat label="Annual cash flow" value={pitia > 0 && rnt > 0 ? usd(annualCF) : "—"} tone={annualCF > 0 ? "good" : pitia > 0 ? "bad" : "default"} sub={`${usd(trueCF)}/mo × 12`} />
        </div>
        <div className="mt-2 text-[10px] text-slate-400">
          Cap rate is the unlevered yield (NOI ÷ ARV). Total ROI (yr 1) adds your first-year loan paydown to cash flow{buy > 0 && equityCaptured > 0 ? <>, on top of the <b className="text-emerald-700">{usd(equityCaptured)}</b> of equity you captured up front</> : null} — your real return on the cash left in the deal.
        </div>
      </div>

      <div className={`mt-3 rounded-lg px-3 py-2 text-[11px] ${dTone === "good" ? "bg-emerald-50 text-emerald-700" : dTone === "bad" ? "bg-rose-50 text-rose-700" : dTone === "warn" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-500"}`}>
        <b>DSCR {dscr > 0 ? dscr.toFixed(2) : "—"}:</b> {dNote}
      </div>
      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">{brrrrLine}</div>
      <div className="mt-2 text-[10px] text-slate-400">DSCR uses gross rent ÷ PITIA (the lender's formula — no operating expenses). Your cash flow above subtracts reserves for the real picture. Verify rent, taxes, and rate with the lender before counting on it.</div>

      {deckCommon && flipDeck && (
        <div className="mt-3">
          <BuyerDeckButton
            label="Download deal deck — Flip + BRRRR (.pptx)"
            common={{ ...deckCommon, rent: rnt }}
            generateOverride={async (form) => {
              await generateDualDeck({
                address: form.address,
                subjectLine: deckCommon.subjectLine,
                arv,
                repairs,
                asking: form.asking,
                rent: form.rent,
                photo: form.photo,
                basis: { compCount: deckCommon.compCount, avgPpsf: deckCommon.avgPpsf, rent: form.rent },
                contact: form.contact,
                flip: (() => {
                  const fSell = flipDeck.sellingCost || 0;
                  const fHold = flipDeck.holdingCost || 0;
                  const fProfit = arv - buy - repairs - fSell - fHold;   // buyer's real flip profit at YOUR offer price
                  return {
                    profitStr: buy > 0 ? usd(fProfit) : "—",
                    rows: [
                      ["After-repair value (ARV)", usd(arv)],
                      ["Estimated rehab", usd(repairs)],
                      [`Selling costs (${flipDeck.sellingPct}% of ARV)`, usd(fSell)],
                      ["Holding costs", usd(fHold)],
                      ["Your purchase price", buy > 0 ? usd(buy) : "—"],
                    ],
                    bullets: [
                      buy > 0 && fProfit > 0 ? `About ${usd(fProfit)} profit at your ${usd(buy)} purchase price` : null,
                      arv > 0 ? `${usd(arv)} after-repair value` : null,
                      repairs > 0 ? `Rehab scoped at about ${usd(repairs)}` : null,
                      "Resell at retail once rehabbed",
                    ],
                    note: "",
                  };
                })(),
                brrrr: {
                  headlineStr: `${usd(trueCF)}/mo · DSCR ${dscr > 0 ? dscr.toFixed(2) : "—"}`,
                  cocStr: coc === null ? "∞" : (cashLeftIn > 0 && coc ? coc.toFixed(1) + "%" : "—"),
                  returnStr: (() => {
                    if (buy <= 0) return "";
                    if (cashLeftIn <= 0) return "∞ cash-on-cash & ROI — all cash out";
                    const parts = [];
                    if (coc) parts.push(coc.toFixed(1) + "% cash-on-cash");
                    if (totalRoi && totalReturn1 !== 0) parts.push(totalRoi.toFixed(1) + "% total ROI (yr 1)");
                    return parts.join("  ·  ");
                  })(),
                  rows: [
                    ["All-in (purchase + rehab)", usd(allIn)],
                    [`Refi loan (ARV × ${num(ltv)}%)`, usd(refiLoan)],
                    ["Loan term", `${num(term)} yr`],
                    ["Cash left in deal", cashLeftIn <= 0 ? `${usd(-cashLeftIn)} back out` : usd(cashLeftIn)],
                    ["Monthly rent", rnt > 0 ? usd(rnt) : "—"],
                    ["New payment (PITIA)", usd(pitia)],
                    [`Reserves (${num(reservePct)}% of rent)`, reserves > 0 ? usd(reserves) : "—"],
                    ["DSCR", dscr > 0 ? dscr.toFixed(2) : "—"],
                    ["Monthly cash flow", usd(trueCF)],
                  ],
                  bullets: [
                    dscr >= 1.0 ? `Qualifies for a DSCR loan at ${dscr.toFixed(2)} — no income docs` : (dscr > 0 ? `DSCR ${dscr.toFixed(2)} — may need compensating factors` : null),
                    cashLeftIn <= 0 ? "Full BRRRR — all capital comes back out at refi" : `Only ${usd(cashLeftIn)} left in after refi`,
                    trueCF > 0 ? `${usd(trueCF)}/mo cash flow after reserves` : null,
                    "Refinance, rent, and hold for long-term wealth",
                  ],
                  note: dNote,
                  ...(() => { const ex = buildDealExtras({ loanAmt: refiLoan, rate: num(rate), term: num(term), arv, equity: arv - allIn, cashFlow: trueCF, cashToClose: Math.max(0, cashLeftIn), coc: coc || 0 }); return { projection: ex.projection, curve: ex.curve }; })(),
                },
              });
            }}
          />
          <div className="mt-1 text-center text-[10px] text-slate-400">One deck, both exits — your buyer sees the flip play and the BRRRR play side by side.</div>
        </div>
      )}
    </div>
  );
}

// ---------- shared: "wholesale this creative contract" panel ----------
function WholesaleCompare({ arv, repairs, underPct, overPct, wholesaleFee, setWholesaleFee, dealCost, costLabel, financingValue = 0, buyerCashIn = 0, annualCF = 0 }) {
  const fee = num(wholesaleFee);                               // assignment fee — shared with the Cash/MAO tab's wholesale fee
  const haveDeal = arv > 0 && dealCost > 0;
  const equity = haveDeal ? arv - repairs - dealCost : 0;      // hard spread you created by locking it up creative
  const finVal = Math.max(0, financingValue || 0);             // soft value of the below-market loan (PV)
  const totalValue = equity + finVal;                          // what the deal is really worth to a creative buyer
  const buyerKeeps = totalValue - fee;                        // value the assignee inherits after paying your fee
  const buyerEquity = equity - fee;                           // hard equity the assignee inherits after your fee
  const CUSHION = 5000;                                        // a little value we want to leave the buyer
  // --- what the END BUYER earns: their cash in = this deal's cash to close + your fee ---
  const buyerTotalCashIn = Math.max(0, buyerCashIn) + fee;
  const buyerCoC = buyerTotalCashIn > 0 ? (annualCF / buyerTotalCashIn) * 100 : null;          // cash flow on their cash
  const buyerRoi = buyerTotalCashIn > 0 ? ((annualCF + buyerEquity) / buyerTotalCashIn) * 100 : null; // + equity stepped into
  const showBuyerReturns = haveDeal && buyerTotalCashIn > 0 && annualCF !== 0;

  let tone = "default", note = "Lock in the deal numbers above, then enter the assignment fee you'd charge to hand this creative contract to another investor.";
  if (arv <= 0) { note = "Set the ARV up top to see what this creative deal could assign for."; }
  else if (!haveDeal) { note = "Fill in this deal's price/basis above to see the value you've created and what it could assign for."; }
  else if (totalValue <= 0) {
    tone = "warn";
    note = `Not much to assign here — there's no equity and the rate isn't below market, so there's little value to carve a fee from. The deal would have to sell on cash flow alone.`;
  } else if (fee <= 0) {
    tone = "default";
    note = `You've created ${usd(totalValue)} of total value: ${usd(equity)} equity + ${usd(finVal)} from the below-market financing. Enter the fee you'd charge to assign it and you'll see what's left for the buyer.`;
  } else if (buyerKeeps >= CUSHION) {
    tone = "good";
    note = `Assignable — ${usd(totalValue)} of total value (${usd(equity)} equity + ${usd(finVal)} from the cheap loan). Charge your ${usd(fee)} fee and the next investor still inherits ${usd(buyerKeeps)} in value plus the cash flow. The lower the rate, the more room you have here.`;
  } else if (buyerKeeps > 0) {
    tone = "warn";
    note = `Tight — your ${usd(fee)} fee leaves the buyer only ${usd(buyerKeeps)} of value. They may still take it for the terms and cash flow, but don't get greedy or it won't move.`;
  } else {
    tone = "bad";
    note = `Your ${usd(fee)} fee is more than the ${usd(totalValue)} of total value in the deal. A buyer would be paying you for a deal with no cushion left — trim the fee to leave them room.`;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-slate-400" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">If you wholesaled this creative contract</h3>
      </div>
      <p className="mb-3 text-[11px] text-slate-400">Assign this deal to another investor for a fee — they inherit the terms, you collect the spread. Value = equity + what the below-market loan is worth.</p>
      <div className="mb-3">
        <Field
          label="Your assignment fee"
          hint="shared across all tabs"
          info="What you'd charge another investor to take over this creative contract. This is the SAME number as 'Your wholesale fee' on the Cash / MAO tab — set it on any tab and it updates everywhere. It comes out of the total value you created — equity PLUS the present value of the below-market rate."
        >
          <MoneyInput value={wholesaleFee} onChange={setWholesaleFee} placeholder="Type your fee" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Equity in the deal" value={haveDeal ? usd(equity) : "—"} tone={haveDeal ? (equity > 0 ? "good" : "warn") : "default"} sub="ARV − repairs − basis" />
        <Stat label="Financing value" value={haveDeal ? usd(finVal) : "—"} tone={finVal > 0 ? "good" : "default"} sub="PV of the low rate" />
        <Stat label="Total deal value" value={haveDeal ? usd(totalValue) : "—"} tone={totalValue > 0 ? "good" : "default"} big sub="equity + financing" />
      </div>
      {haveDeal && (
        <div className="mt-2 text-[10px] text-slate-400">"Basis" is your cost to acquire ({costLabel.toLowerCase()}) — <b>not</b> your fee. Your fee comes out of the equity, leaving the buyer the rest.</div>
      )}
      {haveDeal && fee > 0 && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Stat label="Buyer's equity after your fee" value={usd(buyerEquity)} tone={buyerEquity >= CUSHION ? "good" : buyerEquity > 0 ? "warn" : "bad"} sub="equity − your fee" />
          <Stat label="Buyer keeps, all-in" value={usd(buyerKeeps)} tone={buyerKeeps >= CUSHION ? "good" : buyerKeeps > 0 ? "warn" : "bad"} sub="+ financing value" />
        </div>
      )}
      {showBuyerReturns && (
        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-700/80">What the end buyer earns</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Buyer's cash in" value={usd(buyerTotalCashIn)} sub="cash to close + rehab + your fee" />
            <Stat label="Buyer cash-on-cash" value={buyerCoC === null ? "—" : pct(buyerCoC)} tone={buyerCoC !== null && buyerCoC > 0 ? "good" : "warn"} sub="annual cash flow ÷ cash in" />
            <Stat label="Buyer ROI — year 1" value={buyerRoi === null ? "—" : pct(buyerRoi)} tone={buyerRoi !== null && buyerRoi > 0 ? "good" : "warn"} sub="cash flow + equity stepped into" />
          </div>
          <div className="mt-2 text-[10px] text-slate-400">Buyer's cash in is everything they sink in — cash to close + rehab (<b>{usd(Math.max(0, buyerCashIn))}</b>) + your <b>{usd(fee)}</b> fee. Cash-on-cash is the rent return on that full amount; ROI also counts the <b>{usd(buyerEquity)}</b> of equity they step into after your fee.</div>
        </div>
      )}
      <div className={`mt-3 rounded-lg px-3 py-2 text-[11px] ${tone === "good" ? "bg-emerald-50 text-emerald-700" : tone === "bad" ? "bg-rose-50 text-rose-700" : tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-500"}`}>
        {note}
      </div>
      <div className="mt-2 text-[10px] text-slate-400">Financing value is "soft" — realized over time as lower payments/higher cash flow, not cash in hand like equity. Adjust the rate sliders in Rate Savings below to see it move.</div>
    </div>
  );
}

// ---------- shared: rate-savings explorer ----------
function RateSavings({ loanAmount, rate, setRate, term, setTerm, mkt, setMkt, dealPayment = 0 }) {
  const [origTerm, setOrigTerm] = useState(30);
  const currentYear = new Date().getFullYear();
  const [rateStr, setRateStr] = useState(rate.toFixed(2));            // editable buffer for the rate input
  const [yearStr, setYearStr] = useState(String(currentYear + term)); // editable buffer for the maturity-year input
  const P = loanAmount;
  const effOrig = Math.max(term, origTerm);                 // original term can't be less than years left
  const seasoned = Math.max(0, effOrig - term);             // years the seller has already paid down
  const payDeal = pmt(P, rate, term);                       // financing-only P&I implied by the loan terms
  const payNew = pmt(P, mkt, effOrig);                      // fresh market loan, same balance, full term
  const intSubTo = Math.max(0, payDeal * term * 12 - P);    // interest left to pay on this loan
  const intNew = Math.max(0, payNew * effOrig * 12 - P);    // interest on a brand-new loan
  const intSaved = Math.max(0, intNew - intSubTo);          // total interest the buyer avoids
  const intSameTerm = Math.max(0, pmt(P, mkt, term) * term * 12 - P); // interest on a market-rate loan over the SAME years left
  const rateSaved = Math.max(0, intSameTerm - intSubTo);    // savings purely from the lower rate (same remaining term)
  const seasoningSaved = Math.max(0, intNew - intSameTerm); // savings purely from the loan being seasoned (fewer yrs left)
  const totalSaved = rateSaved + seasoningSaved;            // rate + seasoning; the two pieces always sum to this on screen
  // Fixed payment comparison: use the REAL payment entered on the deal, don't re-derive it.
  const haveRealPmt = dealPayment > 0;
  const tiPortion = haveRealPmt ? Math.max(0, dealPayment - payDeal) : 0;  // taxes/insurance (+ any 2nd-lien) baked into the real payment
  const newPmtFull = payNew + tiPortion;                                   // a new market loan, carrying the same taxes/insurance

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <TrendingDown className="h-4 w-4 text-emerald-500" />
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Rate + seasoning savings — what taking over this loan is worth</h3>
      </div>
      {P > 0 ? (
        <div className="grid gap-5 md:grid-cols-2">
          {/* sliders */}
          <div className="space-y-4">
            {/* type-it inputs: loan rate + maturity year — drive the same values as the sliders */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Loan's rate</div>
                  <PlainInput value={rateStr} onChange={(v) => { setRateStr(v); const n = parseFloat(v); if (!isNaN(n)) setRate(n); }} suffix="%" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Matures (year)</div>
                  <PlainInput value={yearStr} onChange={(v) => { setYearStr(v); const yr = parseInt(v, 10); if (yr > currentYear) setTerm(Math.min(40, yr - currentYear)); }} />
                </div>
              </div>
              <div className="mt-1.5 text-[10px] text-slate-400">Type the loan's rate and the year it pays off — or drag the sliders below. They stay in sync, and the savings update instantly.</div>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Seller's rate — you inherit</span>
                <span className="font-mono text-lg font-bold tabular-nums text-emerald-600">{rate.toFixed(2)}%</span>
              </div>
              <input type="range" min={0} max={12} step={0.125} value={rate} onChange={(e) => { const v = parseFloat(e.target.value); setRate(v); setRateStr(v.toFixed(2)); }} className="mt-1 w-full accent-emerald-600" />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Original loan term</span>
                <span className="font-mono text-lg font-bold tabular-nums text-slate-900">{effOrig} yrs</span>
              </div>
              <input type="range" min={5} max={40} step={1} value={origTerm} onChange={(e) => setOrigTerm(parseInt(e.target.value))} className="mt-1 w-full accent-emerald-600" />
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Years left on the loan</span>
                <span className="font-mono text-lg font-bold tabular-nums text-slate-900">{term} yrs</span>
              </div>
              <input type="range" min={1} max={40} step={1} value={term} onChange={(e) => { const v = parseInt(e.target.value); setTerm(v); setYearStr(String(currentYear + v)); }} className="mt-1 w-full accent-emerald-600" />
              <div className="mt-1 text-[11px] text-emerald-700">Seller has already paid <b>{seasoned} {seasoned === 1 ? "yr" : "yrs"}</b>{seasoned > 0 ? " — past the interest-heavy years" : ""}.</div>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">New-loan rate today — compare to</span>
                <span className="font-mono text-sm font-bold tabular-nums text-slate-500">{mkt.toFixed(2)}%</span>
              </div>
              <input type="range" min={0} max={14} step={0.125} value={mkt} onChange={(e) => setMkt(parseFloat(e.target.value))} className="mt-1 w-full accent-slate-400" />
            </div>
            <div className="text-[11px] text-slate-400">Loan balance: <span className="font-mono text-slate-600">{usd(P)}</span> — pulled from this deal.</div>
          </div>
          {/* savings */}
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/80">What this loan saves — held to maturity</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white/70 px-2.5 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Rate savings</div>
                  <div className="font-mono text-lg font-bold tabular-nums text-emerald-700">{usd(rateSaved)}</div>
                  <div className="text-[10px] leading-tight text-slate-400">{rate.toFixed(2)}% vs {mkt.toFixed(2)}%, same {term} yrs left</div>
                </div>
                <div className="rounded-lg bg-white/70 px-2.5 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Seasoning savings</div>
                  <div className="font-mono text-lg font-bold tabular-nums text-emerald-700">{usd(seasoningSaved)}</div>
                  <div className="text-[10px] leading-tight text-slate-400">{term} yrs left vs a fresh {effOrig}-yr loan</div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-600 px-3 py-2 text-white">
                <span className="text-[11px] font-bold uppercase tracking-wide">Total interest saved</span>
                <span className="font-mono text-2xl font-extrabold tabular-nums">{usd(totalSaved)}</span>
              </div>
              <div className="mt-1 text-[10px] leading-tight text-slate-400">Rate savings <b>+</b> seasoning savings. Realized in full only if the loan is held to payoff — sell or refinance early and you capture the part up to that point.</div>
            </div>
            {/* side-by-side: take this loan vs new loan */}
            <div className="overflow-hidden rounded-xl border border-slate-200 text-[12px]">
              <div className="grid grid-cols-3 bg-slate-50 font-semibold text-slate-500">
                <div className="px-3 py-1.5"></div>
                <div className="px-2 py-1.5 text-center text-emerald-700">Take this loan</div>
                <div className="px-2 py-1.5 text-center">Get a new loan</div>
              </div>
              {[
                ["Rate", `${rate.toFixed(2)}%`, `${mkt.toFixed(2)}%`],
                ["Years to pay", `${term} left`, `${effOrig} fresh`],
                ...(haveRealPmt ? [["Payment", `${usd(dealPayment)}/mo`, `${usd(newPmtFull)}/mo`]] : []),
                ["Total interest", usd(intSubTo), usd(intNew)],
              ].map((r, i, arr) => (
                <div key={r[0]} className={`grid grid-cols-3 ${i < arr.length - 1 ? "border-b border-slate-100" : ""}`}>
                  <div className="px-3 py-1.5 text-slate-500">{r[0]}</div>
                  <div className="px-2 py-1.5 text-center font-semibold tabular-nums text-emerald-700">{r[1]}</div>
                  <div className="px-2 py-1.5 text-center tabular-nums text-slate-700">{r[2]}</div>
                </div>
              ))}
            </div>
            {haveRealPmt && (
              <div className="text-[10px] text-slate-400">Payment row uses the <b>real payment from this deal</b> — fixed, it won't move with the sliders. The new-loan figure is a fresh-rate loan carrying the same taxes &amp; insurance; set "Years left" to the loan's actual remaining term for the most accurate new-loan number.</div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Monthly payment relief" value={usd(haveRealPmt ? Math.max(0, newPmtFull - dealPayment) : Math.max(0, payNew - payDeal))} tone="good" sub="lighter payment vs a new loan" />
              <Stat label="Paid off sooner" value={seasoned > 0 ? `${seasoned} ${seasoned === 1 ? "yr" : "yrs"}` : "—"} tone={seasoned > 0 ? "good" : "default"} sub="free & clear earlier" />
            </div>
            <div className="rounded-lg bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-700">
              {seasoned > 0
                ? <>This loan is <b>{seasoned} of {effOrig} yrs</b> in — the seller already paid down the interest-heavy years. A fresh {effOrig}-yr loan at {mkt.toFixed(2)}% restarts that clock, so the buyer saves <b>{usd(rateSaved)}</b> from the lower rate <b>+</b> <b>{usd(seasoningSaved)}</b> from the seasoning = <b>{usd(totalSaved)}</b> in total interest, and owns it free &amp; clear <b>{seasoned} {seasoned === 1 ? "yr" : "yrs"}</b> sooner — if held to payoff.</>
                : <>Set the original term, then drag <b>Years left</b> down to model a seasoned loan and watch the seasoning savings stack on top of the rate savings.</>}
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
  const { arv, repairs, underPct, overPct, wholesaleFee, setWholesaleFee, deckCommon, rentDefault, stBal, setStBal, stPiti, setStPiti, stArrears, setStArrears, stCashSeller, setStCashSeller, stClosing, setStClosing, stRent, setStRent, stReservePct, setStReservePct } = props;
  const bal = num(stBal), piti = num(stPiti), arrears = num(stArrears), cashSeller = num(stCashSeller), closing = num(stClosing), rent = num(stRent) || num(rentDefault);
  const reserves = rent * (num(stReservePct) / 100);
  const cashIn = cashSeller + arrears + closing + repairs;
  const closeCash = cashSeller + arrears + closing + num(wholesaleFee);  // buyer's cash at closing: entry + your fee (rehab is paid after close)
  const cashFlow = rent - piti - reserves;
  const equity = arv - (bal + cashSeller + arrears + repairs);
  const coc = (closeCash + repairs) > 0 ? ((cashFlow * 12) / (closeCash + repairs)) * 100 : 0; // cash-on-cash on true cash in: entry + fee + rehab (matches the deck)
  const buyerCoc = (closeCash + repairs) > 0 ? ((cashFlow * 12) / (closeCash + repairs)) * 100 : 0;  // buyer's coc on true total invested (cash to close + rehab)
  // shared rate-savings inputs (feed both Rate Savings + the creative-wholesale value)
  const [rsRate, setRsRate] = useState(4);
  const [rsTerm, setRsTerm] = useState(30);
  const [rsMkt, setRsMkt] = useState(7.5);
  const finValue = pvSavings(bal, rsRate, rsMkt, rsTerm);
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
            <Field label="Market rent (monthly)" hint={num(rentDefault) > 0 ? "auto-filled — type to override" : ""} info="Carried over from the rent you generate in the Cash / MAO tab's BRRRR panel. Type here to use a different rent for this strategy only."><MoneyInput value={stRent} onChange={setStRent} placeholder={num(rentDefault) > 0 ? String(Math.round(num(rentDefault))) : "Type the rent"} /></Field>
            <Field label="Reserves" hint="% of rent"><PlainInput value={stReservePct} onChange={setStReservePct} suffix="%" /></Field>
          </div>
        </div>
        <div className="space-y-3">
          <Verdict status={status} headline={headline} detail={detail} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Monthly cash flow" value={usd(cashFlow)} tone={cashFlow > 0 ? "good" : "bad"} big sub={`rent − PITI − ${usd(reserves)} reserves`} />
            <Stat label="Equity captured" value={usd(equity)} tone={equity > 0 ? "good" : "warn"} big sub={repairs > 0 ? "ARV − loan − entry − rehab" : "ARV − loan − entry"} />
            <Stat label="Total cash in" value={usd(closeCash)} sub={num(wholesaleFee) > 0 ? "seller + arrears + closing + fee" : "seller + arrears + closing"} />
            <Stat label="Cash-on-cash" value={pct(coc)} tone={coc > 0 ? "good" : "bad"} sub={repairs > 0 ? "annual · on cash in + rehab" : "annual · on cash in"} />
          </div>
        </div>
      </div>
      <WholesaleCompare arv={arv} repairs={repairs} underPct={underPct} overPct={overPct} wholesaleFee={wholesaleFee} setWholesaleFee={setWholesaleFee}
        dealCost={bal + cashSeller + arrears} costLabel="Sub-to all-in (loan + entry)" financingValue={finValue} buyerCashIn={cashIn} annualCF={cashFlow * 12} />
      <RateSavings loanAmount={bal} rate={rsRate} setRate={setRsRate} term={rsTerm} setTerm={setRsTerm} mkt={rsMkt} setMkt={setRsMkt} dealPayment={piti} />
      <BuyerDeckButton
        common={{ ...deckCommon, contractDefault: closeCash, fee: 0 }}
        priceLabel="Buyer's cash in"
        deal={{
          type: "Subject-To",
          headline: `Sub-To · ${usd(cashFlow)}/mo cash flow · ${usd(finValue)} financing value`,
          highlights: [
            cashFlow > 0 ? `Potential to make ${usd(cashFlow)}/mo in cash flow once renovated and rented` : null,
            equity > 0 ? `${usd(equity)} in built-in equity below ARV` : null,
            finValue > 0 ? `${usd(finValue)} of value from the assumed below-market loan` : null,
            "Take over the seller's existing financing — no new bank loan or qualifying",
            rent > 0 ? `Rents for about ${usd(rent)}/mo` : null,
          ],
          rows: [
            ["Existing loan balance", usd(bal)],
            ["Inherited payment (PITI)", usd(piti) + "/mo"],
            ["Cash to seller", usd(cashSeller)],
            ["Monthly cash flow", usd(cashFlow)],
            ["Equity captured", usd(equity)],
            ["Financing value (low rate)", usd(finValue)],
          ],
          totalLabel: "Total deal value",
          totalValue: usd(Math.max(0, equity) + finValue),
          verdict: detail,
          ...buildDealExtras({ loanAmt: bal, rate: rsRate, term: rsTerm, arv, equity, cashFlow, cashToClose: closeCash, coc: buyerCoc }),
        }}
      />
      <TabEducation id="subto" />
    </div>
  );
}

// ---------- HYBRID ----------
function HybridTab(props) {
  const { arv, repairs, underPct, overPct, wholesaleFee, setWholesaleFee, deckCommon, rentDefault, hyPrice, setHyPrice, hyDown, setHyDown, hyBal, setHyBal, hyPiti, setHyPiti, hyRate, setHyRate, hyTerm, setHyTerm, hyClosing, setHyClosing, hyRent, setHyRent, hyReservePct, setHyReservePct } = props;
  const price = num(hyPrice), down = num(hyDown), bal = num(hyBal), piti = num(hyPiti), rent = num(hyRent) || num(rentDefault), closing = num(hyClosing);
  const note = Math.max(0, price - bal - down);
  const notePay = pmt(note, num(hyRate), num(hyTerm));
  const totalMonthly = piti + notePay;
  const reserves = rent * (num(hyReservePct) / 100);
  const cashFlow = rent - totalMonthly - reserves;
  const cashIn = down + closing + repairs;
  const closeCash = down + closing + num(wholesaleFee);  // buyer's cash at closing: entry + your fee (rehab is paid after close)
  const equity = arv - price - repairs;
  const coc = (closeCash + repairs) > 0 ? ((cashFlow * 12) / (closeCash + repairs)) * 100 : 0; // cash-on-cash on true cash in: entry + fee + rehab (matches the deck)
  const buyerCoc = (closeCash + repairs) > 0 ? ((cashFlow * 12) / (closeCash + repairs)) * 100 : 0;  // buyer's coc on true total invested (cash to close + rehab)
  const [rsRate, setRsRate] = useState(4);
  const [rsTerm, setRsTerm] = useState(30);
  const [rsMkt, setRsMkt] = useState(7.5);
  const finValue = pvSavings(bal, rsRate, rsMkt, rsTerm);
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
            <Field label="Market rent (monthly)" hint={num(rentDefault) > 0 ? "auto-filled — type to override" : ""} info="Carried over from the rent you generate in the Cash / MAO tab's BRRRR panel. Type here to use a different rent for this strategy only."><MoneyInput value={hyRent} onChange={setHyRent} placeholder={num(rentDefault) > 0 ? String(Math.round(num(rentDefault))) : "Type the rent"} /></Field>
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
            <Stat label="Equity captured" value={usd(equity)} tone={equity >= 0 ? "good" : "warn"} sub={repairs > 0 ? "ARV − price − rehab" : "ARV − price"} />
            <Stat label="Cash-on-cash" value={pct(coc)} tone={coc > 0 ? "good" : "bad"} sub={`${usd(closeCash + repairs)} in`} />
          </div>
        </div>
      </div>
      <WholesaleCompare arv={arv} repairs={repairs} underPct={underPct} overPct={overPct} wholesaleFee={wholesaleFee} setWholesaleFee={setWholesaleFee}
        dealCost={price} costLabel="Hybrid purchase price" financingValue={finValue} buyerCashIn={cashIn} annualCF={cashFlow * 12} />
      <RateSavings loanAmount={bal} rate={rsRate} setRate={setRsRate} term={rsTerm} setTerm={setRsTerm} mkt={rsMkt} setMkt={setRsMkt} dealPayment={totalMonthly} />
      <BuyerDeckButton
        common={{ ...deckCommon, contractDefault: price }}
        deal={{
          type: "Hybrid",
          headline: `Hybrid · ${usd(cashFlow)}/mo cash flow · ${usd(finValue)} financing value`,
          highlights: [
            cashFlow > 0 ? `Potential to make ${usd(cashFlow)}/mo in cash flow once renovated and rented` : null,
            equity > 0 ? `${usd(equity)} in built-in equity below ARV` : null,
            finValue > 0 ? `${usd(finValue)} of value from the assumed low-rate first loan` : null,
            "Low-rate loan taken subject-to, seller carries the rest — minimal cash in",
            rent > 0 ? `Rents for about ${usd(rent)}/mo` : null,
          ],
          rows: [
            ["Purchase price", usd(price)],
            ["Sub-to loan (low rate)", usd(bal)],
            ["Seller note", usd(note)],
            ["Total monthly debt", usd(totalMonthly)],
            ["Monthly cash flow", usd(cashFlow)],
            ["Equity captured", usd(equity)],
          ],
          totalLabel: "Total deal value",
          totalValue: usd(Math.max(0, equity) + finValue),
          verdict: detail,
          ...buildDealExtras({ loanAmt: bal, rate: rsRate, term: rsTerm, arv, equity, cashFlow, cashToClose: closeCash, coc: buyerCoc }),
        }}
      />
      <TabEducation id="hybrid" />
    </div>
  );
}

// ---------- SELLER FINANCE ----------
function SellerFinanceTab(props) {
  const { arv, repairs, underPct, overPct, wholesaleFee, setWholesaleFee, deckCommon, rentDefault, sfPrice, setSfPrice, sfDown, setSfDown, sfRate, setSfRate, sfAmort, setSfAmort, sfBalloon, setSfBalloon, sfTaxIns, setSfTaxIns, sfRent, setSfRent, sfReservePct, setSfReservePct } = props;
  const price = num(sfPrice), down = num(sfDown), taxIns = num(sfTaxIns), rent = num(sfRent) || num(rentDefault);
  const loan = Math.max(0, price - down);
  const pi = pmt(loan, num(sfRate), num(sfAmort));
  const totalMonthly = pi + taxIns;
  const reserves = rent * (num(sfReservePct) / 100);
  const cashFlow = rent - totalMonthly - reserves;
  const balloonYrs = num(sfBalloon);
  const balloonBal = balloonYrs > 0 ? balanceAt(loan, num(sfRate), num(sfAmort), balloonYrs) : 0;
  const totalInterest = pi * num(sfAmort) * 12 - loan;
  const equity = arv - price - repairs;
  const cashIn = down + repairs;
  const closeCash = down + num(wholesaleFee);  // buyer's cash at closing: entry + your fee (rehab is paid after close)
  const coc = (closeCash + repairs) > 0 ? ((cashFlow * 12) / (closeCash + repairs)) * 100 : 0; // cash-on-cash on true cash in: entry + fee + rehab (matches the deck)
  const buyerCoc = (closeCash + repairs) > 0 ? ((cashFlow * 12) / (closeCash + repairs)) * 100 : 0;  // buyer's coc on true total invested (cash to close + rehab)
  // seller-finance terms ARE the loan terms — seed the shared rate inputs from them
  const [rsRate, setRsRate] = useState(num(sfRate) || 4);
  const [rsTerm, setRsTerm] = useState(num(sfAmort) || 30);
  const [rsMkt, setRsMkt] = useState(7.5);
  const finValue = pvSavings(loan, rsRate, rsMkt, rsTerm);
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
            <Field label="Market rent (monthly)" hint={num(rentDefault) > 0 ? "auto-filled — type to override" : ""} info="Carried over from the rent you generate in the Cash / MAO tab's BRRRR panel. Type here to use a different rent for this strategy only."><MoneyInput value={sfRent} onChange={setSfRent} placeholder={num(rentDefault) > 0 ? String(Math.round(num(rentDefault))) : "Type the rent"} /></Field>
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
            <Stat label="Equity captured" value={usd(equity)} tone={equity >= 0 ? "good" : "warn"} sub={repairs > 0 ? "ARV − price − rehab" : "ARV − price"} />
            <Stat label="Cash-on-cash" value={pct(coc)} tone={coc > 0 ? "good" : "bad"} sub={repairs > 0 ? "down + fee + rehab" : "down + fee"} />
          </div>
        </div>
      </div>
      <WholesaleCompare arv={arv} repairs={repairs} underPct={underPct} overPct={overPct} wholesaleFee={wholesaleFee} setWholesaleFee={setWholesaleFee}
        dealCost={price} costLabel="Seller-finance price" financingValue={finValue} buyerCashIn={cashIn} annualCF={cashFlow * 12} />
      <RateSavings loanAmount={loan} rate={rsRate} setRate={setRsRate} term={rsTerm} setTerm={setRsTerm} mkt={rsMkt} setMkt={setRsMkt} dealPayment={totalMonthly} />
      <BuyerDeckButton
        common={{ ...deckCommon, contractDefault: price }}
        deal={{
          type: "Seller Finance",
          headline: `Seller Finance · ${usd(cashFlow)}/mo cash flow · ${usd(finValue)} financing value`,
          highlights: [
            cashFlow > 0 ? `Potential to make ${usd(cashFlow)}/mo in cash flow once renovated and rented` : null,
            equity > 0 ? `${usd(equity)} in built-in equity below ARV` : null,
            num(sfRate) < 7 ? `${usd(finValue)} of value from a ${num(sfRate)}% seller-financed rate vs the market` : null,
            "Seller-financed — no bank, no qualifying, terms set with the seller",
            rent > 0 ? `Rents for about ${usd(rent)}/mo` : null,
          ],
          rows: [
            ["Purchase price", usd(price)],
            ["Down payment", usd(down)],
            ["Interest rate", `${num(sfRate)}%`],
            ["Monthly P&I", usd(pi)],
            ["Monthly cash flow", usd(cashFlow)],
            ["Equity captured", usd(equity)],
          ],
          totalLabel: "Total deal value",
          totalValue: usd(Math.max(0, equity) + finValue),
          verdict: detail,
          ...buildDealExtras({ loanAmt: loan, rate: rsRate, term: rsTerm, arv, equity, cashFlow, cashToClose: closeCash, coc: buyerCoc }),
        }}
      />
      <TabEducation id="sf" />
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
      <TabEducation id="nov" />
    </div>
  );
}
