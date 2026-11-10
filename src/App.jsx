import React, { useEffect, useMemo, useState } from "react";
import {
  Home, Handshake, BedDouble, Info, Save, FilePlus2, FolderOpen, Download, Lock, Trash2,
  CheckCircle2, AlertTriangle, XCircle, Lightbulb, ChevronDown, ChevronUp, Users, Layers,
} from "lucide-react";
import {
  analyze, whatItTakes, num, fmt$, pct, EXPENSE_ITEMS, CAPEX_ITEMS, FURNISH_RATES, MGMT_PER_ROOM, TARGETS, DEAL_TYPES,
} from "./calc.js";

// Hobknob Co-Living Academy Deal Analyzer. Students type the property facts, the app does the rest.
// No property-data APIs: nothing here bills anyone per lookup.

const BRAND = "#4c9a31"; // the logo green (#6cbb4a), deepened so white button text stays readable
const DRAFT_KEY = "academy.draft.v1";
const DEALS_KEY = "academy.deals.v1";
const PASS_KEY = "academy.pass.v1";
const MAX_ROOMS = 15, MAX_UNITS = 10;

const store = {
  get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off: still works for this visit */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

const newDeal = () => ({
  name: "", address: "", dealType: "buy", model: "coliving",
  beds: "", baths: "", sqft: "", bathsAfter: "",
  roomCount: 5, unitCount: 2,
  rooms: Array.from({ length: 5 }, () => ({ rent: "", owner: false })),
  units: Array.from({ length: 2 }, () => ({ rent: "", owner: false })),
  occupancy: 95, otherIncome: "", wholeHouseRent: "",
  price: "", ltv: 80, hackLtv: 96.5, miPct: 0.55, financeReno: false, rate: 7, term: 30, closing: 7000,
  taxMode: 0, taxPct: 1.85, taxMonthly: "", insMode: 0, insPct: 1.2, insMonthly: "", arv: "",
  creativeMode: "subto", stBalance: "", stPayment: "", stEscrowed: true, stRate: "", stYearsLeft: "", stCashToSeller: "", stArrears: "",
  stCarry: "", stCarryRate: 0, stCarryYears: 10, sfDown: "", sfRate: 0, sfAmort: 30, sfBalloon: 0,
  furnish: { bedrooms: "", bathrooms: "", kitchens: "", laundry: "", living: "", dining: "", sqft: "", hire: false }, furnishOverride: "",
  capex: {}, monthsToRent: 1, otherUpfront: "",
  expenses: Object.fromEntries(EXPENSE_ITEMS.map(([k, , v]) => [k, v])), mgmtPerRoom: MGMT_PER_ROOM.toFixed(2), selfManage: false,
  appreciation: 3, landPct: 20, taxRate: 24, targetCoc: 15, currentHousing: "", notes: "",
});

// A saved deal from an older version may name a deal type that no longer exists. Fall back to Buy & Convert.
const cleanDeal = (saved) => {
  const merged = { ...newDeal(), ...(saved || {}) };
  if (!DEAL_TYPES[merged.dealType]) merged.dealType = "buy";
  return merged;
};

// ---------- small UI pieces ----------
const Tip = ({ text }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="More info">
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && <span className="absolute left-1/2 top-5 z-30 w-64 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-[11.5px] font-normal normal-case leading-snug tracking-normal text-slate-700 shadow-lg">{text}</span>}
    </span>
  );
};
const Field = ({ label, hint, tip, children, className = "" }) => (
  <label className={`block ${className}`}>
    <span className="mb-1 flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">{label}{tip && <Tip text={tip} />}</span>
      {hint && <span className="text-[10.5px] text-slate-500">{hint}</span>}
    </span>
    {children}
  </label>
);
const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const Money = ({ value, onChange, placeholder = "0" }) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
    <input inputMode="decimal" className={`${inputCls} pl-6`} value={value ?? ""} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} />
  </div>
);
const Num = ({ value, onChange, placeholder = "0", suffix }) => (
  <div className="relative">
    <input inputMode="decimal" className={`${inputCls} ${suffix ? "pr-10" : ""}`} value={value ?? ""} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} />
    {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{suffix}</span>}
  </div>
);
const Text = ({ value, onChange, placeholder }) => (
  <input className={inputCls} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
);
const Chips = ({ value, onChange, opts }) => (
  <div className="flex flex-wrap gap-1.5">
    {opts.map(([v, l]) => (
      <button key={String(v)} type="button" onClick={() => onChange(v)}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${value === v ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}>{l}</button>
    ))}
  </div>
);
const Check = ({ checked, onChange, children }) => (
  <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-slate-700">
    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{children}</span>
  </label>
);
const Card = ({ n, title, sub, children, right }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-800">
          {n && <span className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] text-white" style={{ background: BRAND }}>{n}</span>}
          {title}
        </h2>
        {sub && <p className="mt-1 text-[12.5px] leading-snug text-slate-600">{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </section>
);
const Stat = ({ label, value, sub, tone = "default", big }) => {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-600">{label}</div>
      <div className={`font-mono ${big ? "text-2xl" : "text-lg"} font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[11px] leading-snug text-slate-600">{sub}</div>}
    </div>
  );
};
const Row = ({ label, value, strong, muted }) => (
  <div className={`flex items-center justify-between gap-3 py-1 text-[13px] ${strong ? "border-t border-slate-200 pt-1.5 font-bold text-slate-900" : muted ? "text-slate-500" : "text-slate-700"}`}>
    <span>{label}</span><span className="font-mono tabular-nums">{value}</span>
  </div>
);

// ---------- passcode gate ----------
function Gate({ onUnlock }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: code.trim() }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { store.set(PASS_KEY, code.trim()); onUnlock(); }
      else setMsg(j.error || "That passcode did not work. Check the course for the current one.");
    } catch { setMsg("Could not reach the server. Check your connection and try again."); }
    setBusy(false);
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <img src="/academy-logo.png" alt="Hobknob Co-Living Academy" className="mx-auto h-16 w-auto" />
        <h1 className="mt-4 text-lg font-bold text-slate-900">Co-Living Deal Analyzer</h1>
        <p className="mt-1 text-[13px] text-slate-600">For Hobknob Co-Living Academy students. Enter the passcode from your course.</p>
        <div className="relative mt-4">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={`${inputCls} pl-9`} type="password" autoComplete="off" autoCapitalize="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Passcode" />
        </div>
        {msg && <div className="mt-2 text-[12px] text-rose-600">{msg}</div>}
        <button disabled={busy || !code.trim()} className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50" style={{ background: BRAND }}>{busy ? "Checking..." : "Open the analyzer"}</button>
      </form>
    </div>
  );
}

// ---------- main ----------
export default function App() {
  const [unlocked, setUnlocked] = useState(null); // null = checking a saved passcode
  useEffect(() => {
    const saved = store.get(PASS_KEY, "");
    if (!saved) { setUnlocked(false); return; }
    fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: saved }) })
      .then((r) => r.json().then((j) => ({ ok: r.ok && j.ok })).catch(() => ({ ok: false })))
      .then(({ ok }) => { if (!ok) store.del(PASS_KEY); setUnlocked(ok); })
      .catch(() => setUnlocked(true)); // offline with a passcode that worked before: let them keep working
  }, []);
  if (unlocked === null) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading...</div>;
  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />;
  return <Analyzer onLock={() => { store.del(PASS_KEY); setUnlocked(false); }} />;
}

function Analyzer({ onLock }) {
  const [d, setD] = useState(() => cleanDeal(store.get(DRAFT_KEY, {})));
  const [deals, setDeals] = useState(() => store.get(DEALS_KEY, []));
  const [showSaved, setShowSaved] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [showFurnish, setShowFurnish] = useState(false);
  const [showCapex, setShowCapex] = useState(false);
  const [showFive, setShowFive] = useState(true);
  const [fillRooms, setFillRooms] = useState(""); // the "same rent for every room" box remembers what is typed
  useEffect(() => { store.set(DRAFT_KEY, d); }, [d]);

  const set = (k, v) => setD((p) => ({ ...p, [k]: v }));
  const setIn = (group, k, v) => setD((p) => ({ ...p, [group]: { ...(p[group] || {}), [k]: v } }));
  const type = d.dealType, model = d.model;
  const showRooms = model === "coliving" || model === "hybrid";
  const showUnits = model === "private" || model === "hybrid";

  const resize = (key, countKey, n, max) => setD((p) => {
    const c = Math.max(0, Math.min(max, Math.round(num(n))));
    const list = [...(p[key] || [])];
    while (list.length < c) list.push({ rent: list.length ? list[list.length - 1].rent : "", owner: false });
    return { ...p, [countKey]: c, [key]: list.slice(0, c) };
  });
  const setRent = (key, i, v) => setD((p) => ({ ...p, [key]: p[key].map((r, j) => (j === i ? { ...r, rent: v } : r)) }));
  const setOwner = (key, i) => setD((p) => ({
    ...p,
    rooms: p.rooms.map((r, j) => ({ ...r, owner: key === "rooms" && j === i ? !r.owner : false })),
    units: p.units.map((u, j) => ({ ...u, owner: key === "units" && j === i ? !u.owner : false })),
  }));
  const fillAll = (key, v) => setD((p) => ({ ...p, [key]: p[key].map((r) => ({ ...r, rent: v })) }));

  // The deal as the math sees it: only the rentals the chosen model uses, and furnishing counts that
  // fall back to the property facts when left blank.
  const rentableAuto = (showRooms ? d.roomCount : 0) + (showUnits ? d.unitCount : 0);
  const furnAuto = {
    bedrooms: rentableAuto, bathrooms: num(d.bathsAfter) || num(d.baths),
    kitchens: model === "coliving" ? 1 : model === "private" ? d.unitCount : d.unitCount + 1,
    laundry: model === "coliving" ? 1 : model === "private" ? d.unitCount : d.unitCount + 1,
    living: model === "coliving" ? 1 : model === "private" ? d.unitCount : d.unitCount + 1,
    dining: model === "coliving" ? 1 : 0, sqft: num(d.sqft),
  };
  const furnEff = Object.fromEntries(Object.keys(furnAuto).map((k) => [k, String(d.furnish[k] ?? "").trim() !== "" ? num(d.furnish[k]) : furnAuto[k]]));
  const deal = useMemo(() => ({
    ...d,
    rooms: showRooms ? d.rooms : [], units: showUnits ? d.units : [],
    furnish: { ...furnEff, hire: d.furnish.hire },
    // A Sub-To payment includes taxes and insurance only when the student says it does.
    stEscrowed: d.stEscrowed !== false,
  }), [d, showRooms, showUnits, JSON.stringify(furnEff)]);
  const a = useMemo(() => analyze(deal), [deal]);
  const wit = useMemo(() => whatItTakes(deal, type === "hack" ? null : num(d.targetCoc) || 15), [deal, type, d.targetCoc]);
  const witBreakeven = useMemo(() => (type === "hack" ? null : whatItTakes(deal, null)), [deal, type]);

  // ---------- saved deals ----------
  const saveDeal = () => {
    const name = d.name.trim() || d.address.trim() || `Deal ${deals.length + 1}`;
    const rec = { id: d.id || `d${Date.now()}`, name, savedAt: new Date().toISOString(), d: { ...d, name } };
    const next = [rec, ...deals.filter((x) => x.id !== rec.id)];
    setDeals(next); store.set(DEALS_KEY, next); setD((p) => ({ ...p, id: rec.id, name }));
    setSavedMsg(`Saved "${name}"`); setTimeout(() => setSavedMsg(""), 2500);
  };
  const openDeal = (rec) => { setD(cleanDeal({ ...rec.d, id: rec.id })); setFillRooms(""); setShowSaved(false); window.scrollTo?.(0, 0); };
  const deleteDeal = (id) => { const next = deals.filter((x) => x.id !== id); setDeals(next); store.set(DEALS_KEY, next); };
  const startNew = () => { setD(newDeal()); setFillRooms(""); window.scrollTo?.(0, 0); };

  const tone = a.verdict.tone;
  const vStyle = tone === "strong" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : tone === "solid" ? "border-sky-300 bg-sky-50 text-sky-900"
    : tone === "thin" ? "border-amber-300 bg-amber-50 text-amber-900" : tone === "pass" ? "border-rose-300 bg-rose-50 text-rose-900" : "border-slate-200 bg-slate-50 text-slate-700";
  const VIcon = tone === "strong" || tone === "solid" ? CheckCircle2 : tone === "thin" ? AlertTriangle : tone === "pass" ? XCircle : Info;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:sticky lg:top-0">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <img src="/academy-logo.png" alt="Hobknob Co-Living Academy" className="h-8 w-auto sm:h-10" />
            <span className="hidden border-l border-slate-200 pl-3 text-sm font-bold text-slate-800 sm:inline">Co-Living Deal Analyzer</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {savedMsg && <span className="text-[12px] font-semibold text-emerald-700">{savedMsg}</span>}
            <button onClick={saveDeal} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: BRAND }}><Save className="h-3.5 w-3.5" />Save<span className="hidden sm:inline"> deal</span></button>
            <button onClick={() => setShowSaved((s) => !s)} aria-label="My deals" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"><FolderOpen className="h-3.5 w-3.5" /><span className="hidden sm:inline">My deals </span>({deals.length})</button>
            <button onClick={startNew} aria-label="New deal" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"><FilePlus2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">New</span></button>
            <button onClick={() => downloadReport(d, a, wit)} aria-label="Download report" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"><Download className="h-3.5 w-3.5" /><span className="hidden sm:inline">Report</span></button>
          </div>
        </div>
        {showSaved && (
          <div className="border-t border-slate-200 bg-white">
            <div className="mx-auto max-w-7xl px-4 py-3">
              {deals.length === 0 ? <div className="text-[13px] text-slate-600">No saved deals yet. Fill one in and tap Save deal. Deals save in this browser only.</div> : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {deals.map((rec) => {
                    const r = analyze({ ...rec.d, rooms: ["coliving", "hybrid"].includes(rec.d.model) ? rec.d.rooms : [], units: ["private", "hybrid"].includes(rec.d.model) ? rec.d.units : [] });
                    return (
                      <div key={rec.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                        <button onClick={() => openDeal(rec)} className="min-w-0 text-left">
                          <div className="truncate text-[13px] font-semibold text-slate-900">{rec.name}</div>
                          <div className="text-[11px] text-slate-600">{DEAL_TYPES[rec.d.dealType]} · {fmt$(r.cashFlow)}/mo · saved {new Date(rec.savedAt).toLocaleDateString()}</div>
                        </button>
                        <button onClick={() => deleteDeal(rec.id)} className="text-slate-400 hover:text-rose-600" aria-label="Delete deal"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Phones: the results sit below the form, so keep the headline numbers in view while typing. */}
      <a href="#results" className={`fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t-2 bg-white px-4 py-2.5 shadow-[0_-4px_12px_rgba(15,23,42,0.08)] lg:hidden ${tone === "pass" ? "border-rose-300" : tone === "thin" ? "border-amber-300" : tone === "none" ? "border-slate-200" : "border-emerald-400"}`}>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-extrabold text-slate-900">{a.verdict.label}</span>
          <span className="block text-[11px] text-slate-600">Tap for the full results</span>
        </span>
        <span className="shrink-0 text-right font-mono tabular-nums">
          <span className={`block text-base font-bold ${a.cashFlow > 0 ? "text-emerald-700" : a.rentedCount ? "text-rose-600" : "text-slate-900"}`}>{fmt$(a.cashFlow)}/mo</span>
          <span className="block text-[11px] text-slate-600">{type === "hack" ? (a.hack.yourCost <= 0 ? "you live free" : `${fmt$(a.hack.yourCost)} to live there`) : `${pct(a.coc)} cash-on-cash`}</span>
        </span>
      </a>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 pb-24 pt-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:pb-5">
        <div className="space-y-5">
          {/* 1. Deal type */}
          <Card n="1" title="What kind of deal is it?" sub="Pick how you are getting control of the house, then how you will rent it.">
            <div className="grid gap-2 sm:grid-cols-3">
              {[["buy", Home, "Buy & Convert", "Buy it with a loan, convert it, rent it by the room."],
                ["creative", Handshake, "Creative Buy", "Take over the seller's loan (Sub-To) or have them finance it."],
                ["hack", BedDouble, "House Hack", "Live in one room, rent out the rest."]].map(([v, Icon, l, s]) => (
                <button key={v} type="button" onClick={() => set("dealType", v)}
                  className={`rounded-xl border-2 p-3 text-left transition ${type === v ? "border-emerald-600 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <Icon className={`h-5 w-5 ${type === v ? "text-emerald-700" : "text-slate-500"}`} />
                  <div className="mt-1 text-sm font-bold text-slate-900">{l}</div>
                  <div className="text-[11.5px] leading-snug text-slate-600">{s}</div>
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Field label="How will you rent it?">
                <Chips value={model} onChange={(v) => set("model", v)} opts={[["coliving", "Co-Living (by the room)"], ["private", "Private units"], ["hybrid", "Hybrid (rooms + units)"]]} />
              </Field>
              <p className="mt-1.5 text-[11.5px] text-slate-600">
                {model === "coliving" ? "Every bedroom rents on its own, and everyone shares the kitchen and common areas." : model === "private" ? "Each unit is a furnished private apartment (a studio, a 1-bed, and so on) rented mid-term." : "Some of it rents by the room, some as private furnished units, like a duplex with one side co-living."}
              </p>
            </div>
          </Card>

          {/* 2. Property */}
          <Card n="2" title="The property" sub="The facts as it sits today, and what it will be once it is set up.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Deal name" hint="for your saved deals"><Text value={d.name} onChange={(v) => set("name", v)} placeholder="Oak St 5-bed" /></Field>
              <Field label="Address"><Text value={d.address} onChange={(v) => set("address", v)} placeholder="123 Main St, Louisville, KY" /></Field>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Bedrooms now"><Num value={d.beds} onChange={(v) => set("beds", v)} /></Field>
              <Field label="Bathrooms now"><Num value={d.baths} onChange={(v) => set("baths", v)} /></Field>
              <Field label="Square feet"><Num value={d.sqft} onChange={(v) => set("sqft", v)} /></Field>
              <Field label="Bathrooms after" tip="After any bathroom you add. A good co-living ratio is no more than 2 to 3 people per bathroom."><Num value={d.bathsAfter} onChange={(v) => set("bathsAfter", v)} placeholder={d.baths || "0"} /></Field>
            </div>
            {num(d.bathsAfter || d.baths) > 0 && rentableAuto > 0 && showRooms && (
              <div className={`mt-2 text-[12px] ${d.roomCount / num(d.bathsAfter || d.baths) > 3 ? "text-amber-700" : "text-slate-600"}`}>
                {(d.roomCount / num(d.bathsAfter || d.baths)).toFixed(1)} rented rooms per bathroom{d.roomCount / num(d.bathsAfter || d.baths) > 3 ? ". Over 3 per bathroom makes rooms harder to rent. Consider adding a bathroom." : "."}
              </div>
            )}
          </Card>

          {/* 3. Income */}
          <Card n="3" title="Rent and income" sub="List every rentable bedroom or unit after the conversion and what each one rents for, furnished with utilities included.">
            {showRooms && (
              <div className="mb-4">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Rentable bedrooms" tip="Count every bedroom you will rent, including any you are adding with the conversion. Rooms must meet your local code to count, like an egress window and a closet." className="w-40">
                    <Num value={d.roomCount} onChange={(v) => resize("rooms", "roomCount", v, MAX_ROOMS)} />
                  </Field>
                  <Field label="Same rent for every room" className="w-48"><Money value={fillRooms} placeholder="fill all" onChange={(v) => { setFillRooms(v); fillAll("rooms", v); }} /></Field>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {d.rooms.map((r, i) => (
                    <div key={i}>
                      <div className="mb-0.5 flex items-center justify-between text-[11px] text-slate-600"><span>Room {i + 1}</span>
                        {type === "hack" && <button type="button" onClick={() => setOwner("rooms", i)} className={`rounded px-1.5 text-[10px] font-bold ${r.owner ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>{r.owner ? "You live here" : "I live here"}</button>}
                      </div>
                      <Money value={r.rent} onChange={(v) => setRent("rooms", i, v)} placeholder="799" />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11.5px] text-slate-600">Find room rents near the property on Facebook Marketplace, Furnished Finder, PadSplit and Roomster. Price bigger rooms and rooms with a private bath higher.</p>
              </div>
            )}
            {showUnits && (
              <div className="mb-4">
                <Field label="Private units" className="w-40"><Num value={d.unitCount} onChange={(v) => resize("units", "unitCount", v, MAX_UNITS)} /></Field>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {d.units.map((u, i) => (
                    <div key={i}>
                      <div className="mb-0.5 flex items-center justify-between text-[11px] text-slate-600"><span>Unit {i + 1}</span>
                        {type === "hack" && <button type="button" onClick={() => setOwner("units", i)} className={`rounded px-1.5 text-[10px] font-bold ${u.owner ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>{u.owner ? "You live here" : "I live here"}</button>}
                      </div>
                      <Money value={u.rent} onChange={(v) => setRent("units", i, v)} placeholder="1599" />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11.5px] text-slate-600">Check Furnished Finder and Airbnb monthly stays for furnished units like yours.</p>
              </div>
            )}
            {type === "hack" && ![...(showRooms ? d.rooms : []), ...(showUnits ? d.units : [])].some((r) => r.owner) && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">Tap "I live here" on the room you will live in, so it is not counted as rent.</div>}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Occupancy" hint="Hobknob uses 95%" tip="The share of the year your rooms are rented. 95% leaves room for turnover between residents."><Num value={d.occupancy} onChange={(v) => set("occupancy", v)} suffix="%" /></Field>
              <Field label="Other income" hint="monthly" tip="Parking, pet fees, laundry machines, storage. Leave blank if none."><Money value={d.otherIncome} onChange={(v) => set("otherIncome", v)} /></Field>
              <Field label="Whole-house rent" hint="optional" tip="What the house would rent for to one family, unfurnished, tenant pays utilities. Check Zillow rentals. Used to show what co-living adds."><Money value={d.wholeHouseRent} onChange={(v) => set("wholeHouseRent", v)} /></Field>
            </div>
          </Card>

          {/* 4. Acquisition */}
          <Card n="4" title={type === "creative" ? "The creative terms" : type === "hack" ? "Buying it to live in" : "Buying it"}>
            {(type === "buy" || type === "hack") && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Purchase price"><Money value={d.price} onChange={(v) => set("price", v)} /></Field>
                {type === "buy"
                  ? <Field label="Loan to value" hint="DSCR lenders: 75-80%" tip="The share of the price the lender pays. DSCR loans qualify on the property's rent, not your job, and usually lend 75-80%."><Num value={d.ltv} onChange={(v) => set("ltv", v)} suffix="%" /></Field>
                  : <Field label="Loan to value" hint="FHA: 96.5%" tip="Owner-occupied loans can go much higher. FHA lends up to 96.5% (3.5% down) on homes with 1 to 4 units when you live in one. Confirm with your lender."><Num value={d.hackLtv} onChange={(v) => set("hackLtv", v)} suffix="%" /></Field>}
                <Field label="Closing costs" tip="Verify with your title company."><Money value={d.closing} onChange={(v) => set("closing", v)} /></Field>
                <Field label="Interest rate"><Num value={d.rate} onChange={(v) => set("rate", v)} suffix="%" /></Field>
                <Field label="Loan term"><Num value={d.term} onChange={(v) => set("term", v)} suffix="yrs" /></Field>
                {type === "hack" && <Field label="Mortgage insurance" hint="% of loan per year" tip="FHA charges a yearly mortgage insurance premium, commonly 0.55% of the loan for most borrowers. Confirm your number with your lender."><Num value={d.miPct} onChange={(v) => set("miPct", v)} suffix="%" /></Field>}
                <Field label="After-repair value" hint="optional" tip="What it will be worth once converted. Used for the 5-year appreciation. Blank uses price plus renovation."><Money value={d.arv} onChange={(v) => set("arv", v)} /></Field>
                <div className="sm:col-span-3"><Check checked={d.financeReno} onChange={(v) => set("financeReno", v)}>The lender finances the renovation too (rolled into the loan)</Check></div>
                {type === "hack" && <Field label="What you pay for housing now" hint="monthly" className="sm:col-span-1"><Money value={d.currentHousing} onChange={(v) => set("currentHousing", v)} /></Field>}
              </div>
            )}
            {type === "creative" && (
              <div>
                <Chips value={d.creativeMode} onChange={(v) => set("creativeMode", v)} opts={[["subto", "Subject-To (take over their loan)"], ["sf", "Seller Finance (they are the bank)"]]} />
                {d.creativeMode === "subto" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field label="Agreed price"><Money value={d.price} onChange={(v) => set("price", v)} /></Field>
                    <Field label="Loan balance"><Money value={d.stBalance} onChange={(v) => set("stBalance", v)} /></Field>
                    <Field label="Their monthly payment"><Money value={d.stPayment} onChange={(v) => set("stPayment", v)} /></Field>
                    <div className="sm:col-span-3"><Check checked={d.stEscrowed !== false} onChange={(v) => set("stEscrowed", v)}>That payment already includes taxes and insurance (escrowed)</Check></div>
                    <Field label="Loan rate"><Num value={d.stRate} onChange={(v) => set("stRate", v)} suffix="%" /></Field>
                    <Field label="Years left on the loan"><Num value={d.stYearsLeft} onChange={(v) => set("stYearsLeft", v)} /></Field>
                    <Field label="Cash to the seller"><Money value={d.stCashToSeller} onChange={(v) => set("stCashToSeller", v)} /></Field>
                    <Field label="Back payments (arrears)"><Money value={d.stArrears} onChange={(v) => set("stArrears", v)} /></Field>
                    <Field label="Closing costs"><Money value={d.closing} onChange={(v) => set("closing", v)} /></Field>
                    <Field label="Seller carries" hint="optional" tip="Part of their equity they agree to receive over time instead of at closing, as a second note."><Money value={d.stCarry} onChange={(v) => set("stCarry", v)} /></Field>
                    {num(d.stCarry) > 0 && <>
                      <Field label="Carry rate"><Num value={d.stCarryRate} onChange={(v) => set("stCarryRate", v)} suffix="%" /></Field>
                      <Field label="Carry term"><Num value={d.stCarryYears} onChange={(v) => set("stCarryYears", v)} suffix="yrs" /></Field>
                    </>}
                    {num(d.price) > 0 && num(d.stBalance) > 0 && num(d.price) - num(d.stBalance) - num(d.stCashToSeller) - num(d.stCarry) > 1 && (
                      <div className="sm:col-span-3 text-[12px] text-amber-700">{fmt$(num(d.price) - num(d.stBalance) - num(d.stCashToSeller) - num(d.stCarry))} of the price is not covered by the loan, the cash or the carry. Add it to one of them so the numbers match the agreement.</div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field label="Price"><Money value={d.price} onChange={(v) => set("price", v)} /></Field>
                    <Field label="Down payment"><Money value={d.sfDown} onChange={(v) => set("sfDown", v)} /></Field>
                    <Field label="Rate"><Num value={d.sfRate} onChange={(v) => set("sfRate", v)} suffix="%" /></Field>
                    <Field label="Amortization"><Num value={d.sfAmort} onChange={(v) => set("sfAmort", v)} suffix="yrs" /></Field>
                    <Field label="Balloon" hint="0 = none" tip="The year the rest of the balance is due in one payment."><Num value={d.sfBalloon} onChange={(v) => set("sfBalloon", v)} suffix="yrs" /></Field>
                    <Field label="Closing costs"><Money value={d.closing} onChange={(v) => set("closing", v)} /></Field>
                    {a.balloonDue > 0 && <div className="sm:col-span-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">About <b>{fmt$(a.balloonDue)}</b> comes due in year {num(d.sfBalloon)}. Plan now for how you will refinance or sell to pay it.</div>}
                  </div>
                )}
              </div>
            )}
            {!(type === "creative" && d.creativeMode === "subto" && d.stEscrowed !== false) && (
              <div className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                <Field label="Property taxes" hint={d.taxMode === 1 ? "monthly $" : "% of price per year"} tip="Verify with your county. Hobknob's sheet uses 1.85% of the price per year.">
                  <div className="flex gap-2">
                    <div className="flex-1">{d.taxMode === 1 ? <Money value={d.taxMonthly} onChange={(v) => set("taxMonthly", v)} /> : <Num value={d.taxPct} onChange={(v) => set("taxPct", v)} suffix="%" />}</div>
                    <button type="button" onClick={() => set("taxMode", d.taxMode === 1 ? 0 : 1)} className="rounded-lg border border-slate-300 px-2 text-[11px] font-semibold text-slate-600">{d.taxMode === 1 ? "use %" : "use $"}</button>
                  </div>
                </Field>
                <Field label="Insurance" hint={d.insMode === 1 ? "monthly $" : "% of price per year"} tip="Get a quote for a policy that covers renting by the room. Hobknob's sheet uses 1.2% of the price per year.">
                  <div className="flex gap-2">
                    <div className="flex-1">{d.insMode === 1 ? <Money value={d.insMonthly} onChange={(v) => set("insMonthly", v)} /> : <Num value={d.insPct} onChange={(v) => set("insPct", v)} suffix="%" />}</div>
                    <button type="button" onClick={() => set("insMode", d.insMode === 1 ? 0 : 1)} className="rounded-lg border border-slate-300 px-2 text-[11px] font-semibold text-slate-600">{d.insMode === 1 ? "use %" : "use $"}</button>
                  </div>
                </Field>
              </div>
            )}
          </Card>

          {/* 5. Setup costs */}
          <Card n="5" title="Getting it ready" sub="Renovation, furnishing and the time it takes to fill the rooms.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Months until rented" tip="How long until the rooms are filled. The house costs money every month before then: the loan, taxes, insurance and about half the utilities."><Num value={d.monthsToRent} onChange={(v) => set("monthsToRent", v)} /></Field>
              <Field label="Other upfront costs" tip="Permits, inspections, photos, listing fees, LLC setup."><Money value={d.otherUpfront} onChange={(v) => set("otherUpfront", v)} /></Field>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200">
              <button type="button" onClick={() => setShowCapex((s) => !s)} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
                <span className="text-[13px] font-bold text-slate-800">Renovation and conversion <span className="font-mono text-slate-600">{fmt$(a.reno)}</span></span>
                {showCapex ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
              </button>
              {showCapex && (
                <div className="grid gap-2 border-t border-slate-100 p-3 sm:grid-cols-2">
                  {CAPEX_ITEMS.map(([k, l]) => <Field key={k} label={l}><Money value={d.capex[k] ?? ""} onChange={(v) => setIn("capex", k, v)} /></Field>)}
                </div>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-slate-200">
              <button type="button" onClick={() => setShowFurnish((s) => !s)} className="flex w-full items-center justify-between px-3 py-2.5 text-left">
                <span className="text-[13px] font-bold text-slate-800">Furnishing and setup <span className="font-mono text-slate-600">{fmt$(a.furnishing)}</span>{num(d.furnishOverride) > 0 && <span className="ml-1 text-[11px] font-normal text-slate-500">(your number)</span>}</span>
                {showFurnish ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
              </button>
              {showFurnish && (
                <div className="border-t border-slate-100 p-3">
                  <p className="mb-2 text-[12px] text-slate-600">Hobknob's furnishing costs per room (as of 10/01/2025), appliances not included. Blank counts come from the property. Hobknob shops for decor at TJ Maxx, HomeGoods, Burlington and Goodwill, and for furniture on Facebook Marketplace, Amazon (beds), Wayfair, Walmart and Restore.</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[["bedrooms", "Bedrooms", FURNISH_RATES.bedroom], ["bathrooms", "Bathrooms", FURNISH_RATES.bathroom], ["kitchens", "Kitchens", FURNISH_RATES.kitchen], ["laundry", "Laundry rooms", FURNISH_RATES.laundry],
                      ["living", "Living rooms", FURNISH_RATES.living], ["dining", "Dining rooms", FURNISH_RATES.dining], ["sqft", "Sq ft (misc.)", FURNISH_RATES.perSqft]].map(([k, l, rate]) => (
                      <Field key={k} label={l} hint={k === "sqft" ? "$0.70/sf" : `$${rate.toLocaleString()} each`}><Num value={d.furnish[k]} onChange={(v) => setIn("furnish", k, v)} placeholder={String(furnAuto[k] || 0)} /></Field>
                    ))}
                  </div>
                  <div className="mt-2"><Check checked={d.furnish.hire} onChange={(v) => setIn("furnish", "hire", v)}>Hire someone to set it up (adds about $3 per sq ft)</Check></div>
                  <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
                    {a.furn.lines.filter((l) => l.qty > 0).map((l) => <Row key={l.label} label={`${l.label} (${l.qty.toLocaleString()} x $${l.rate.toLocaleString()})`} value={fmt$(l.cost)} />)}
                    {a.furn.hireExtra > 0 && <Row label="Setup labor" value={fmt$(a.furn.hireExtra)} />}
                    <Row label="Estimate" value={fmt$(a.furn.total)} strong />
                  </div>
                  <Field label="Or use your own number" hint="overrides the estimate" className="mt-3 sm:w-64"><Money value={d.furnishOverride} onChange={(v) => set("furnishOverride", v)} placeholder="optional" /></Field>
                </div>
              )}
            </div>
          </Card>

          {/* 6. Expenses */}
          <Card n="6" title="Monthly operating costs" sub="Pre-filled with Hobknob's 12-month averages for a 5-bedroom co-living home. Change any of them to match your house and market.">
            <div className="grid gap-3 sm:grid-cols-3">
              {EXPENSE_ITEMS.map(([k, l]) => <Field key={k} label={l}><Money value={d.expenses[k]} onChange={(v) => setIn("expenses", k, v)} /></Field>)}
              <Field label="Management per room / unit" hint={d.selfManage ? "self-managed" : `x ${a.rentedCount} = ${fmt$(a.mgmt)}`} tip="Hobknob budgets $61.50 per room or unit per month. Keep it in even if you self-manage, so the deal still works the day you hire it out.">
                <Money value={d.selfManage ? "0" : d.mgmtPerRoom} onChange={(v) => set("mgmtPerRoom", v)} />
              </Field>
            </div>
            <div className="mt-3"><Check checked={d.selfManage} onChange={(v) => set("selfManage", v)}>I will manage it myself (management at $0)</Check></div>
          </Card>

          {/* 7. Long-term (ownership) */}
          {a.five && (
            <Card n="7" title="5-year assumptions" sub="For the 5-year return. Talk to your CPA about your own tax picture.">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Appreciation per year"><Num value={d.appreciation} onChange={(v) => set("appreciation", v)} suffix="%" /></Field>
                <Field label="Land share of price" tip="Land cannot be depreciated, only the building. Your county assessment shows the land value."><Num value={d.landPct} onChange={(v) => set("landPct", v)} suffix="%" /></Field>
                <Field label="Your tax rate"><Num value={d.taxRate} onChange={(v) => set("taxRate", v)} suffix="%" /></Field>
              </div>
            </Card>
          )}

          <Card title="Notes"><textarea className={`${inputCls} min-h-[80px]`} value={d.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Zoning, HOA rules, lender, contractor quotes, questions to ask..." /></Card>

          <Checklist type={type} />
        </div>

        {/* ---------- Results ---------- */}
        <aside id="results" className="scroll-mt-4 space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pb-2">
          <div className={`flex items-start gap-2.5 rounded-2xl border-2 px-4 py-3 ${vStyle}`}>
            <VIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div><div className="text-base font-extrabold">{a.verdict.label}</div><div className="text-[12.5px] leading-snug">{a.verdict.note}</div></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="Monthly cash flow" value={fmt$(a.cashFlow)} tone={a.cashFlow > 0 ? "good" : a.rentedCount ? "bad" : "default"} big sub={a.cfPerRoom != null ? `${fmt$(a.cfPerRoom)} per room` : null} />
            {type === "hack"
                ? <Stat label="Your housing cost" value={a.hack.yourCost <= 0 ? "$0" : fmt$(a.hack.yourCost)} big sub={a.hack.yourCost <= 0 ? `and you are paid ${fmt$(-a.hack.yourCost)}` : "per month to live there"} tone={a.hack.yourCost <= 0 ? "good" : "warn"} />
                : <Stat label="Cash-on-cash" value={pct(a.coc)} big sub="yearly cash flow / cash in" tone={a.coc >= TARGETS.cocSolid ? "good" : a.coc > 0 ? "warn" : a.rentedCount ? "bad" : "default"} />}
            <Stat label="Cash needed" value={fmt$(a.cashIn)} sub="to buy, set up and fill it" />
            <Stat label="Cost per rentable room" value={fmt$(a.costPerRoom)} sub="price + renovation / rooms" />
            {<Stat label="Lender DSCR" value={a.dscr ? a.dscr.toFixed(2) : "--"} sub={`rent / loan payment with taxes, insurance, HOA. Most want ${TARGETS.dscrMin}+`} tone={a.dscr == null ? "default" : a.dscr >= TARGETS.dscrMin ? "good" : "warn"} />}
            <Stat label="Break-even occupancy" value={a.breakEvenOcc != null ? pct(a.breakEvenOcc) : "--"} sub="rented share needed to cover every cost" tone={a.breakEvenOcc == null ? "default" : a.breakEvenOcc <= 80 ? "good" : a.breakEvenOcc <= 92 ? "warn" : "bad"} />
            {type === "hack" && <Stat label="Cash-on-cash" value={pct(a.coc)} sub="yearly cash flow / cash in" />}
            {type !== "hack" && <Stat label="Cap rate" value={pct(a.capRate)} sub="yearly NOI / price + renovation" />}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">Monthly breakdown</div>
            <Row label={`Rent (${a.rentedCount} ${a.rentedCount === 1 ? "rental" : "rentals"} at 100%)`} value={fmt$(a.grossRent)} />
            <Row label={`At ${pct(a.occ * 100)} occupancy${a.otherIncome ? " + other income" : ""}`} value={fmt$(a.effectiveIncome)} strong />
            {a.taxesMo > 0 && <Row label="Property taxes" value={`-${fmt$(a.taxesMo)}`} />}
            {a.insMo > 0 && <Row label="Insurance" value={`-${fmt$(a.insMo)}`} />}
            <Row label="Operating costs" value={`-${fmt$(a.opex - a.mgmt)}`} />
            {a.mgmt > 0 && <Row label="Management" value={`-${fmt$(a.mgmt)}`} />}
            <Row label="Net operating income" value={fmt$(a.noi)} strong />
            {a.pAndI > 0 && <Row label={type === "creative" && d.creativeMode === "subto" ? "Their loan payment" : "Loan payment (P&I)"} value={`-${fmt$(a.pAndI)}`} />}
            {a.mi > 0 && <Row label="Mortgage insurance" value={`-${fmt$(a.mi)}`} />}
            {a.notePay > 0 && <Row label="Seller carry note" value={`-${fmt$(a.notePay)}`} />}
            <Row label="Cash flow" value={fmt$(a.cashFlow)} strong />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">Cash needed</div>
            {a.cashInLines.length ? a.cashInLines.map((l) => <Row key={l.label} label={l.label} value={fmt$(l.amt)} />) : <div className="text-[12px] text-slate-500">Fill in the deal to see it.</div>}
            <Row label="Total" value={fmt$(a.cashIn)} strong />
          </div>

          {a.premium && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600"><Users className="h-3.5 w-3.5" />Co-living vs. one family</div>
              <Row label="Extra rent vs. the whole-house rent" value={fmt$(a.premium.gross)} />
              <Row label="Extra costs you carry (utilities, wifi, cleaning, supplies, management)" value={`-${fmt$(a.premium.extras)}`} />
              <Row label="What co-living adds each month" value={fmt$(a.premium.net)} strong />
              <div className="mt-1 text-[11px] text-slate-600">{a.premium.net > 0 ? "Renting by the room beats renting the whole house, even after the extra costs." : "At these numbers a traditional rental would do as well or better. Check your room rents."}</div>
            </div>
          )}

          {wit && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800"><Lightbulb className="h-3.5 w-3.5" />What it takes</div>
              {type === "hack" ? (
                <div className="text-[12.5px] text-emerald-950">
                  {wit.rentNeeded != null && <div>To live for free, the other rooms need to average <b>{fmt$(wit.rentNeeded)}</b> (now {fmt$(wit.avgNow)}).</div>}
                  {wit.maxPrice != null && <div className="mt-1">Or buy at <b>{fmt$(wit.maxPrice)}</b> or less.</div>}
                </div>
              ) : (
                <>
                  <div className="mb-2 flex items-center gap-2 text-[12px] text-emerald-900">Target cash-on-cash <div className="w-20"><Num value={d.targetCoc} onChange={(v) => set("targetCoc", v)} suffix="%" /></div></div>
                  <div className="space-y-1 text-[12.5px] text-emerald-950">
                    {wit.rentNeeded != null && <div>Average rent per {showRooms && !showUnits ? "room" : "rental"}: <b>{fmt$(wit.rentNeeded)}</b> (now {fmt$(wit.avgNow)}).</div>}
                    {wit.maxPrice != null && <div>Most you can pay: <b>{fmt$(wit.maxPrice)}</b>{a.price > 0 ? ` (now ${fmt$(a.price)})` : ""}.</div>}
                    {witBreakeven && witBreakeven.rentNeeded != null && <div className="text-[11.5px] text-emerald-900">Break-even rent: {fmt$(witBreakeven.rentNeeded)} average.</div>}
                  </div>
                </>
              )}
            </div>
          )}

          {a.five && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <button type="button" onClick={() => setShowFive((s) => !s)} className="flex w-full items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">5-year return</span>
                {showFive ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
              </button>
              {showFive && <>
                <Row label="Cash flow" value={fmt$(a.five.cashflow5)} />
                <Row label="Loan paid down" value={fmt$(a.five.paydown)} />
                <Row label={`Appreciation (${pct(num(d.appreciation))}/yr)`} value={fmt$(a.five.appreciation)} />
                <Row label="Depreciation tax savings" value={fmt$(a.five.depreciationSavings)} />
                <Row label="Total over 5 years" value={fmt$(a.five.total)} strong />
                <Row label="Average yearly return on cash in" value={pct(a.five.avgAnnualPct)} muted />
              </>}
            </div>
          )}

          <p className="px-1 text-[11px] leading-snug text-slate-500">For education only. These are estimates, not guarantees, and real results vary. This is not financial, legal or tax advice. Verify every number with your lender, title company, insurance agent, CPA and local codes before you commit.</p>
          <button onClick={onLock} className="px-1 text-[11px] text-slate-400 underline">Lock the analyzer</button>
        </aside>
      </main>
    </div>
  );
}

// Before-you-commit checklist, by deal type.
function Checklist({ type }) {
  const [open, setOpen] = useState(false);
  const common = [
    "Zoning and occupancy rules: how many unrelated adults can live there, and whether rent-by-the-room is allowed.",
    "Fire and safety code for every bedroom: egress window, smoke and CO detectors, a door that locks.",
    "Parking: one spot per resident is a common local requirement for room rentals.",
    "Insurance quote for a policy that covers rent-by-the-room.",
    "HOA rules, if there is an HOA. Many ban short and mid-term rentals or room rentals.",
  ];
  const byType = {
    buy: ["A lender that allows rent-by-the-room. Many DSCR lenders do, but confirm before you are under contract.", "Contractor bids for every conversion line, plus 10-15% for surprises."],
    creative: ["An attorney or title company experienced in Subject-To and seller financing.", "The mortgage statement, to verify the balance, payment and that it is current.", "A plan for the due-on-sale clause, and how payments will be made and verified."],
    hack: ["The lender's owner-occupancy rules: how long you must live there.", "Whether house rules and shared space still work for you as the person living there."],
  };
  const items = [...common, ...(byType[type] || [])];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-800"><Layers className="h-4 w-4" />Before you commit</span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>
      {open && <ul className="mt-3 space-y-1.5">{items.map((t) => <li key={t} className="flex gap-2 text-[12.5px] text-slate-700"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />{t}</li>)}</ul>}
    </section>
  );
}

// Downloadable one-page report.
function downloadReport(d, a, wit) {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const row = (k, v) => `<tr><td>${esc(k)}</td><td class="n">${esc(v)}</td></tr>`;
  const name = d.name || d.address || "Co-living deal";
  const rents = [...(["coliving", "hybrid"].includes(d.model) ? d.rooms.map((r, i) => `Room ${i + 1}: ${fmt$(num(r.rent))}${r.owner && d.dealType === "hack" ? " (owner)" : ""}`) : []),
    ...(["private", "hybrid"].includes(d.model) ? d.units.map((u, i) => `Unit ${i + 1}: ${fmt$(num(u.rent))}${u.owner && d.dealType === "hack" ? " (owner)" : ""}`) : [])].join(", ");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(name)} | Co-Living Deal Analysis</title>
<style>body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#0f172a;max-width:760px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:8px 0 2px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin:22px 0 6px;border-bottom:2px solid #6cbb4a;padding-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:13px}td{padding:5px 4px;border-bottom:1px solid #e2e8f0}td.n{text-align:right;font-family:ui-monospace,Menlo,monospace}
.v{border:2px solid #6cbb4a;border-radius:10px;padding:10px 12px;margin-top:10px}.muted{color:#64748b;font-size:11px;margin-top:24px}</style></head><body>
<img src="${location.origin}/academy-logo.png" alt="Hobknob Co-Living Academy" style="height:52px">
<h1>${esc(name)}</h1><div>${esc(d.address)} · ${esc(DEAL_TYPES[d.dealType])} · ${esc({ coliving: "Co-Living", private: "Private units", hybrid: "Hybrid" }[d.model])}</div>
<div class="v"><b>${esc(a.verdict.label)}</b><br>${esc(a.verdict.note)}</div>
<h2>Results</h2><table>
${row("Monthly cash flow", fmt$(a.cashFlow))}${row("Cash needed", fmt$(a.cashIn))}${row("Cash-on-cash", pct(a.coc))}
${row("Cost per rentable room", fmt$(a.costPerRoom))}
${a.dscr ? row("Lender DSCR", a.dscr.toFixed(2)) : ""}${a.breakEvenOcc != null ? row("Break-even occupancy", pct(a.breakEvenOcc)) : ""}
${a.hack ? row("Your monthly housing cost", fmt$(Math.max(0, a.hack.yourCost))) : ""}</table>
<h2>Monthly</h2><table>
${row("Rent at 100%", fmt$(a.grossRent))}${row(`Income at ${pct(a.occ * 100)} occupancy`, fmt$(a.effectiveIncome))}
${a.taxesMo ? row("Taxes", `-${fmt$(a.taxesMo)}`) : ""}${a.insMo ? row("Insurance", `-${fmt$(a.insMo)}`) : ""}
${a.opexLines.filter((l) => l.amt).map((l) => row(l.label, `-${fmt$(l.amt)}`)).join("")}${a.mgmt ? row("Management", `-${fmt$(a.mgmt)}`) : ""}
${row("Net operating income", fmt$(a.noi))}${a.debtService ? row("Debt payments", `-${fmt$(a.debtService)}`) : ""}${row("Cash flow", fmt$(a.cashFlow))}</table>
<h2>Cash needed</h2><table>${a.cashInLines.map((l) => row(l.label, fmt$(l.amt))).join("")}${row("Total", fmt$(a.cashIn))}</table>
<h2>Rents</h2><div style="font-size:13px">${esc(rents || "none entered")}</div>
${a.five ? `<h2>5-year return</h2><table>${row("Cash flow", fmt$(a.five.cashflow5))}${row("Loan paid down", fmt$(a.five.paydown))}${row("Appreciation", fmt$(a.five.appreciation))}${row("Depreciation tax savings", fmt$(a.five.depreciationSavings))}${row("Total", fmt$(a.five.total))}</table>` : ""}
${wit ? `<h2>What it takes</h2><div style="font-size:13px">${wit.rentNeeded != null ? `Average rent needed: ${fmt$(wit.rentNeeded)}. ` : ""}${wit.maxPrice != null ? `Most you can pay: ${fmt$(wit.maxPrice)}. ` : ""}</div>` : ""}
${d.notes ? `<h2>Notes</h2><div style="font-size:13px;white-space:pre-wrap">${esc(d.notes)}</div>` : ""}
<p class="muted">Prepared with the Hobknob Co-Living Academy Deal Analyzer on ${new Date().toLocaleDateString()}. For education only. These are estimates, not guarantees, and real results vary. Not financial, legal or tax advice. Verify every number before you commit.</p>
</body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "deal"}-analysis.html`;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
