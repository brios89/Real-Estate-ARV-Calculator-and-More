// Hobknob Co-Living Academy deal math. Pure functions, no React, so the numbers can be tested on their own.
// Built from Brian Rios's Deal Analyzer sheet (co-living, private mid-term and hybrid tabs plus the
// furnishing cost analyzer), with the 5-year return view (cash flow, principal paydown, appreciation,
// depreciation) added. Every default below is a starting point the student can change.

export const num = (v) => {
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(/[$,%\s]/g, ""));
  return isFinite(n) ? n : 0;
};

// Monthly principal + interest on an amortizing loan. 0% rate is a straight split.
export const pmt = (principal, ratePct, years) => {
  const P = num(principal), n = Math.round(num(years) * 12), r = num(ratePct) / 100 / 12;
  if (P <= 0 || n <= 0) return 0;
  if (r === 0) return P / n;
  return (P * r) / (1 - Math.pow(1 + r, -n));
};
// Balance left after `months` payments.
export const balanceAfter = (principal, ratePct, years, months) => {
  const P = num(principal), n = Math.round(num(years) * 12), r = num(ratePct) / 100 / 12;
  if (P <= 0 || n <= 0) return 0;
  const k = Math.min(Math.max(0, Math.round(months)), n);
  if (r === 0) return Math.max(0, P - (P / n) * k);
  const p = pmt(P, ratePct, years);
  return Math.max(0, P * Math.pow(1 + r, k) - p * ((Math.pow(1 + r, k) - 1) / r));
};

// ---- Brian's furnishing cost analyzer (as of 10/01/2025). Appliances not included. ----
export const FURNISH_RATES = { bedroom: 1500, bathroom: 700, kitchen: 1700, laundry: 700, living: 2250, dining: 1500, perSqft: 0.7, hirePerSqft: 3 };
export const furnishingEstimate = (f) => {
  const lines = [
    ["Bedrooms", num(f.bedrooms), FURNISH_RATES.bedroom],
    ["Bathrooms", num(f.bathrooms), FURNISH_RATES.bathroom],
    ["Kitchens", num(f.kitchens), FURNISH_RATES.kitchen],
    ["Laundry rooms", num(f.laundry), FURNISH_RATES.laundry],
    ["Living rooms", num(f.living), FURNISH_RATES.living],
    ["Dining rooms", num(f.dining), FURNISH_RATES.dining],
    ["Misc. by sq ft", num(f.sqft), FURNISH_RATES.perSqft],
  ].map(([label, qty, rate]) => ({ label, qty, rate, cost: qty * rate }));
  const diy = lines.reduce((a, l) => a + l.cost, 0);
  const hireExtra = f.hire ? num(f.sqft) * FURNISH_RATES.hirePerSqft : 0;
  return { lines, diy, hireExtra, total: diy + hireExtra };
};

// ---- Renovation / conversion line items ----
export const CAPEX_ITEMS = [
  ["bedroomConv", "Bedroom conversions"], ["bathAdd", "Add a full bathroom"], ["halfToFull", "Convert a half bath to full"],
  ["commonArea", "Common area conversion"], ["garage", "Garage conversion"], ["hvac", "HVAC / mini-split"],
  ["parking", "Parking pad / gravel"], ["floors", "Floors"], ["paint", "Paint"], ["roof", "Roof / gutters"],
  ["appliances", "Appliances (fridges, washer / dryer)"], ["locks", "Keyed or smart locks on every bedroom door"],
  ["safety", "Smoke / CO detectors, fire extinguishers, egress"], ["other", "Other"],
];

// ---- Brian's monthly operating averages (5-bedroom co-living home, Clarksville IN) ----
export const EXPENSE_ITEMS = [
  ["wifi", "Wifi", 75], ["security", "Ring / security", 12], ["capex", "Capital expenditures (reserve)", 150],
  ["maintenance", "Maintenance", 100], ["lawn", "Lawn / landscape", 80], ["electric", "Electric", 200],
  ["gas", "Gas", 200], ["water", "Water / sewer", 105], ["cleaning", "Bi-weekly cleaning of the common areas", 100],
  ["supplies", "Supplies (TP, paper towels, cleaning supplies)", 50], ["hoa", "HOA", 0], ["otherExp", "Other", 0],
];
export const UTILITY_KEYS = ["electric", "gas", "water"];
// Costs a co-living home carries that a traditional whole-house rental usually does not (tenant pays them).
export const COLIVING_EXTRA_KEYS = ["wifi", "security", "electric", "gas", "water", "cleaning", "supplies"];
export const MGMT_PER_ROOM = 50;

// Grading lines (Ace's starting thresholds, tunable).
export const TARGETS = {
  cocStrong: 20, cocSolid: 12, cocThin: 8,         // cash-on-cash %
  arbPaybackStrong: 12, arbPaybackSolid: 18, arbPaybackThin: 24, // months to earn back startup cash
  dscrMin: 1.25,                                   // typical DSCR lender minimum
};

export const DEAL_TYPES = {
  buy: "Buy & Convert",
  arb: "Rental Arbitrage",
  creative: "Creative Buy",
  hack: "House Hack",
};

// The whole analysis. `d` is the deal as the student entered it (strings or numbers).
export function analyze(d) {
  const type = d.dealType || "buy";
  const owns = type !== "arb";
  const occ = Math.min(100, Math.max(0, num(d.occupancy ?? 95))) / 100;

  // ---- Income ----
  const rooms = (d.rooms || []).map((r, i) => ({ i, rent: num(r.rent), owner: type === "hack" && !!r.owner }));
  const units = (d.units || []).map((u, i) => ({ i, rent: num(u.rent), owner: type === "hack" && !!u.owner }));
  const rentals = [...rooms, ...units];
  const rentedRooms = rooms.filter((r) => !r.owner), rentedUnits = units.filter((u) => !u.owner);
  const rentableCount = rentals.length;                       // every rentable bedroom / unit in the layout
  const rentedCount = rentedRooms.length + rentedUnits.length; // the ones that pay rent (house hack excludes yours)
  const grossRoomRent = rentedRooms.reduce((a, r) => a + r.rent, 0);
  const grossUnitRent = rentedUnits.reduce((a, u) => a + u.rent, 0);
  const grossRent = grossRoomRent + grossUnitRent;
  const otherIncome = num(d.otherIncome);
  const effectiveIncome = grossRent * occ + otherIncome;
  const ownerRoomValue = rentals.filter((r) => r.owner).reduce((a, r) => a + r.rent, 0);

  // ---- Acquisition and debt ----
  const price = owns ? num(d.price) : 0;
  const reno = Object.values(d.capex || {}).reduce((a, v) => a + num(v), 0);
  const closing = owns ? num(d.closing) : 0;   // arbitrage has no purchase, so no closing costs
  let loan = 0, pAndI = 0, mi = 0, sellerNote = 0, notePay = 0, down = 0, upfrontSeller = 0, loanRate = 0, loanYears = 0, balloonYears = 0;
  let financedReno = false;
  if (type === "buy" || type === "hack") {
    const ltv = Math.min(100, Math.max(0, num(type === "hack" ? (d.hackLtv ?? 96.5) : (d.ltv ?? 80)))) / 100;
    financedReno = !!d.financeReno;
    const base = price + (financedReno ? reno : 0);
    loan = base * ltv;
    down = base - loan;
    loanRate = num(d.rate); loanYears = num(d.term) || 30;
    pAndI = pmt(loan, loanRate, loanYears);
    if (type === "hack") mi = (loan * num(d.miPct ?? 0.55)) / 100 / 12;
  } else if (type === "creative") {
    if ((d.creativeMode || "subto") === "subto") {
      loan = num(d.stBalance);
      pAndI = num(d.stPayment);              // the seller's existing payment we take over
      loanRate = num(d.stRate); loanYears = num(d.stYearsLeft) || 0;
      upfrontSeller = num(d.stCashToSeller) + num(d.stArrears);
      sellerNote = Math.max(0, num(d.stCarry));
      notePay = pmt(sellerNote, num(d.stCarryRate), num(d.stCarryYears) || 0);
      down = 0;
    } else {
      down = num(d.sfDown);
      loan = Math.max(0, price - down);
      loanRate = num(d.sfRate); loanYears = num(d.sfAmort) || 30; balloonYears = num(d.sfBalloon);
      pAndI = pmt(loan, loanRate, loanYears);
    }
  }
  const debtService = pAndI + mi + notePay;

  // Taxes and insurance (ownership only). A Sub-To payment that already includes them is not double counted.
  const escrowedSubto = type === "creative" && (d.creativeMode || "subto") === "subto" && d.stEscrowed !== false;
  const taxesMo = !owns || escrowedSubto ? 0 : (num(d.taxMode) === 1 ? num(d.taxMonthly) : (price * num(d.taxPct ?? 1.85)) / 100 / 12);
  const insMo = !owns ? num(d.arbInsurance) : escrowedSubto ? 0 : (num(d.insMode) === 1 ? num(d.insMonthly) : (price * num(d.insPct ?? 1.2)) / 100 / 12);
  const leaseRent = type === "arb" ? num(d.leaseRent) : 0;

  // ---- Operating expenses ----
  const exp = d.expenses || {};
  const opexLines = EXPENSE_ITEMS.map(([k, label]) => ({ k, label, amt: num(exp[k]) }));
  const mgmt = d.selfManage ? 0 : num(d.mgmtPerRoom ?? MGMT_PER_ROOM) * rentedCount;
  const opex = opexLines.reduce((a, l) => a + l.amt, 0) + mgmt;
  const utilities = UTILITY_KEYS.reduce((a, k) => a + num(exp[k]), 0);

  // NOI: income after operating costs, before the loan. For arbitrage the lease is the cost of the house.
  const noi = effectiveIncome - opex - taxesMo - insMo - leaseRent;
  const cashFlow = noi - debtService;

  // ---- Setup costs ----
  const furn = furnishingEstimate({ ...(d.furnish || {}), hire: !!(d.furnish && d.furnish.hire) });
  const furnishing = d.furnishOverride !== "" && d.furnishOverride != null && num(d.furnishOverride) > 0 ? num(d.furnishOverride) : furn.total;
  const months = num(d.monthsToRent);
  // Carrying cost while the home fills: the loan or lease, taxes and insurance, HOA, lawn, and about half the utilities.
  const holdingMonthly = debtService + taxesMo + insMo + leaseRent + num(exp.hoa) + num(exp.lawn) + utilities / 2;
  const holding = months * holdingMonthly;
  const arbUpfront = type === "arb" ? num(d.deposit) + num(d.firstMonths ?? 1) * leaseRent + num(d.arbFees) : 0;
  const renoCash = financedReno ? 0 : reno;
  const otherUpfront = num(d.otherUpfront);
  const cashIn = down + closing + furnishing + renoCash + holding + arbUpfront + upfrontSeller + otherUpfront;
  const cashInLines = [
    ["Down payment", down], ["Cash to seller + arrears", upfrontSeller], ["Deposit, first month and fees", arbUpfront],
    ["Closing costs", closing], ["Renovation / conversion", renoCash], ["Furnishing and setup", furnishing],
    [`Holding cost (${months} mo until rented)`, holding], ["Other upfront", otherUpfront],
  ].filter(([, v]) => Math.abs(v) > 0.5).map(([label, amt]) => ({ label, amt }));

  // ---- Returns ----
  const annualCF = cashFlow * 12;
  const coc = cashIn > 0 ? (annualCF / cashIn) * 100 : null;
  const pitia = pAndI + mi + notePay + taxesMo + insMo + num(exp.hoa);
  const dscr = owns && pitia > 0 ? effectiveIncome / pitia : null;   // lender style: rent / PITIA
  const allIn = price + reno;
  const capRate = owns && allIn > 0 ? ((noi * 12) / allIn) * 100 : null;
  const costPerRoom = rentableCount > 0 ? (owns ? allIn / rentableCount : cashIn / rentableCount) : null;
  const fixedCosts = opex - mgmt + taxesMo + insMo + leaseRent + debtService;
  const perRoomMgmt = d.selfManage ? 0 : num(d.mgmtPerRoom ?? MGMT_PER_ROOM);
  // Occupancy needed to cover every cost (management scales with rooms, so it is counted at full).
  const breakEvenOcc = grossRent > 0 ? Math.max(0, ((fixedCosts + mgmt - otherIncome) / grossRent) * 100) : null;
  const paybackMonths = cashFlow > 0 ? cashIn / cashFlow : null;
  const cfPerRoom = rentedCount > 0 ? cashFlow / rentedCount : null;

  // Co-living vs renting the whole house to one family.
  const wholeHouse = num(d.wholeHouseRent);
  const extras = COLIVING_EXTRA_KEYS.reduce((a, k) => a + num(exp[k]), 0) + mgmt;
  const premium = wholeHouse > 0 ? { gross: effectiveIncome - wholeHouse * occ, extras, net: effectiveIncome - wholeHouse * occ - extras } : null;

  // 5-year view (ownership only).
  let five = null;
  if (owns) {
    const yrs = 5, appr = num(d.appreciation ?? 3) / 100;
    const value0 = num(d.arv) > 0 ? num(d.arv) : allIn;
    const appreciation = value0 * (Math.pow(1 + appr, yrs) - 1);
    const paydownMain = loan > 0 && loanYears > 0 ? loan - balanceAfter(loan, loanRate, loanYears, 60) : 0;
    const paydownNote = sellerNote > 0 ? sellerNote - balanceAfter(sellerNote, num(d.stCarryRate), num(d.stCarryYears) || 0, 60) : 0;
    const landPct = num(d.landPct ?? 20) / 100;
    const basis = Math.max(0, price * (1 - landPct) + closing + reno);
    const depreciationSavings = (basis / 27.5) * (num(d.taxRate ?? 24) / 100) * yrs;
    const cashflow5 = annualCF * yrs;
    const total = cashflow5 + paydownMain + paydownNote + appreciation + depreciationSavings;
    five = { cashflow5, paydown: paydownMain + paydownNote, appreciation, depreciationSavings, total, avgAnnualPct: cashIn > 0 ? (total / yrs / cashIn) * 100 : null, value0 };
  }
  const balloonDue = type === "creative" && balloonYears > 0 ? balanceAfter(loan, loanRate, loanYears, balloonYears * 12) : 0;

  // House hack: what living there costs you.
  const hack = type === "hack" ? { yourCost: -cashFlow, current: num(d.currentHousing), savings: num(d.currentHousing) + cashFlow, ownerRoomValue } : null;

  // Verdict.
  let verdict;
  if (rentedCount === 0 || grossRent <= 0) verdict = { tone: "none", label: "Add your rooms and rents", note: "Enter the rentable bedrooms (or units) and what each one rents for." };
  else if (type === "hack") {
    verdict = hack.yourCost <= 0
      ? { tone: "strong", label: "You live for free", note: `The other rooms cover every cost and pay you about ${fmt$(Math.abs(hack.yourCost))} a month.` }
      : hack.current > 0 && hack.yourCost < hack.current
        ? { tone: "solid", label: "Cheaper than your rent now", note: `Living there costs about ${fmt$(hack.yourCost)} a month, ${fmt$(hack.current - hack.yourCost)} less than you pay now.` }
        : { tone: "thin", label: "Costs more than you pay now", note: hack.current > 0 ? `Living there costs about ${fmt$(hack.yourCost)} a month, more than the ${fmt$(hack.current)} you pay now.` : `Living there costs about ${fmt$(hack.yourCost)} a month. Enter what you pay for housing now to compare.` };
  } else if (cashFlow <= 0) verdict = { tone: "pass", label: "Pass at these numbers", note: "It loses money every month. Lower the price or lease, raise the rents, or cut costs." };
  else if (type === "arb") {
    const p = paybackMonths;
    verdict = p <= TARGETS.arbPaybackStrong ? { tone: "strong", label: "Strong arbitrage deal", note: `Startup cash comes back in about ${Math.ceil(p)} months.` }
      : p <= TARGETS.arbPaybackSolid ? { tone: "solid", label: "Solid arbitrage deal", note: `Startup cash comes back in about ${Math.ceil(p)} months.` }
        : p <= TARGETS.arbPaybackThin ? { tone: "thin", label: "Thin", note: `Startup cash takes about ${Math.ceil(p)} months to come back. Make sure the lease runs longer than that.` }
          : { tone: "pass", label: "Pass at these numbers", note: `Startup cash takes about ${Math.ceil(p)} months to come back, which is too long for a lease.` };
  } else {
    const c = coc ?? 0;
    verdict = c >= TARGETS.cocStrong ? { tone: "strong", label: "Strong deal", note: `${pct(c)} cash-on-cash.` }
      : c >= TARGETS.cocSolid ? { tone: "solid", label: "Solid deal", note: `${pct(c)} cash-on-cash.` }
        : c >= TARGETS.cocThin ? { tone: "thin", label: "Thin", note: `${pct(c)} cash-on-cash. It works, but there is not much room for a vacancy or a repair.` }
          : { tone: "pass", label: "Pass at these numbers", note: `${pct(c)} cash-on-cash is too low for the work co-living takes.` };
  }

  return {
    type, owns, occ, rentableCount, rentedCount, grossRent, grossRoomRent, grossUnitRent, otherIncome, effectiveIncome,
    price, reno, closing, loan, down, pAndI, mi, notePay, sellerNote, debtService, taxesMo, insMo, leaseRent,
    opexLines, mgmt, opex, utilities, noi, cashFlow, annualCF, furn, furnishing, holding, holdingMonthly, months,
    cashIn, cashInLines, coc, dscr, capRate, costPerRoom, breakEvenOcc, paybackMonths, cfPerRoom, premium, five,
    balloonDue, hack, verdict, perRoomMgmt, financedReno, upfrontSeller, arbUpfront,
  };
}

// What it takes: solve for the number that hits a target cash-on-cash (or break-even when target is null).
const solve = (lo, hi, f, increasing = true) => {
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const ok = f(mid);
    if (increasing ? ok : !ok) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
};
export function whatItTakes(d, targetCoc) {
  const base = analyze(d);
  if (base.rentedCount === 0) return null;
  const hits = (a) => (targetCoc == null ? a.cashFlow >= 0 : a.coc != null && a.coc >= targetCoc);
  // 1) Average rent per room/unit needed (scales every rent by the same factor).
  const scale = solve(0, 10, (k) => hits(analyze({ ...d, rooms: (d.rooms || []).map((r) => ({ ...r, rent: num(r.rent) * k })), units: (d.units || []).map((u) => ({ ...u, rent: num(u.rent) * k })) })));
  const avgNow = base.rentedCount > 0 ? base.grossRent / base.rentedCount : 0;
  const rentNeeded = scale >= 9.99 ? null : avgNow * scale;
  // 2) Max price (ownership) or max lease (arbitrage) that still hits the target.
  let maxPrice = null, maxLease = null;
  if (base.type === "buy" || base.type === "hack" || (base.type === "creative" && d.creativeMode === "sf")) {
    const p = solve(0, Math.max(1, base.price) * 4 + 500000, (x) => !hits(analyze({ ...d, price: x })));
    maxPrice = hits(analyze({ ...d, price: 0 })) ? p : null;
  }
  if (base.type === "arb") {
    const L = solve(0, 50000, (x) => !hits(analyze({ ...d, leaseRent: x })));
    maxLease = hits(analyze({ ...d, leaseRent: 0 })) ? L : null;
  }
  return { rentNeeded, avgNow, maxPrice, maxLease };
}

export const fmt$ = (n) => (n == null || !isFinite(n) ? "--" : `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`);
export const pct = (n) => (n == null || !isFinite(n) ? "--" : `${Math.round(n * 100) / 100}%`);
