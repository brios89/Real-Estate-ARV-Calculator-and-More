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
export const MGMT_PER_ROOM = 61.5;

// Grading lines (Ace's starting thresholds, tunable).
export const TARGETS = {
  cocStrong: 20, cocSolid: 12, cocThin: 8,         // cash-on-cash %
  dscrMin: 1.25,                                   // typical DSCR lender minimum
};

export const DEAL_TYPES = {
  buy: "Buy & Convert",
  creative: "Creative Buy",
  hack: "House Hack",
};

// The whole analysis. `d` is the deal as the student entered it (strings or numbers).
// Furnishing and holding can be paid in cash, added to the hard money loan, or covered by a separate
// loan. Financing them changes the payment, which changes the holding cost, so analyze() settles the
// amount over a few passes (it converges fast because a few months of interest is small).
export function analyze(d) {
  const mode = d && d.dealType === "buy" && d.lender === "hard" ? (d.hmSetupFunding || "cash") : "cash";
  const needsLoop = mode === "roll" || (mode === "separate" && String(d.slAmount ?? "").trim() === "");
  if (!needsLoop) return analyzeCore(d, mode === "separate" ? num(d.slAmount) : 0, mode);
  let x = 0, r = null;
  for (let i = 0; i < 12; i++) {
    r = analyzeCore(d, x, mode);
    const next = r.furnishing + r.holding;
    if (Math.abs(next - x) < 0.01) break;
    x = next;
  }
  return analyzeCore(d, x, mode);
}

function analyzeCore(d, setupAmount, setupMode) {
  const type = DEAL_TYPES[d.dealType] ? d.dealType : "buy";
  const owns = true; // every deal type in the Academy owns or controls title
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
  const price = num(d.price);
  const reno = Object.values(d.capex || {}).reduce((a, v) => a + num(v), 0);
  const closing = num(d.closing);
  let loan = 0, pAndI = 0, mi = 0, sellerNote = 0, notePay = 0, down = 0, upfrontSeller = 0, loanRate = 0, loanYears = 0, balloonYears = 0;
  let financedReno = false;
  // Hard money / private lender (Buy & Convert only): short-term, interest-only, lender may cover
  // part or all of the purchase and rehab. Typical 2026 terms (lender guides): 9% to 15% interest,
  // 1 to 5 points, 6 to 24 months, 85% to 90% of cost, capped at 70% to 75% of after-repair value.
  let hard = null, closingCash = closing, pointsCash = 0, renoCashHard = null;
  if (type === "buy" && d.lender === "hard") {
    const clamp = (v) => Math.min(100, Math.max(0, num(v))) / 100;
    const pp = clamp(d.hmPurchasePct ?? 90), rp = clamp(d.hmRehabPct ?? 100);
    const rate = num(d.hmRate ?? 12), pts = num(d.hmPoints ?? 2), termMonths = num(d.hmMonths ?? 12) || 12;
    const roll = !!d.hmRollCosts;
    const baseLoan = price * pp + reno * rp + (roll ? closing : 0) + (setupMode === "roll" ? setupAmount : 0);
    const points = (baseLoan * pts) / 100;
    loan = baseLoan + (roll ? points : 0);
    pAndI = (loan * rate) / 100 / 12;      // interest only
    down = price * (1 - pp);
    renoCashHard = reno * (1 - rp);
    closingCash = roll ? 0 : closing;
    pointsCash = roll ? 0 : points;
    loanRate = rate; loanYears = 0;
    const arv = num(d.arv);
    hard = {
      rate, pts, points, termMonths, roll, balloon: loan,
      loanToCost: price + reno > 0 ? ((price * pp + reno * rp) / (price + reno)) * 100 : null,
      loanToArv: arv > 0 ? (loan / arv) * 100 : null,
    };
  } else if (type === "buy" || type === "hack") {
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
  // Separate loan for furnishing and holding (hard money deals only).
  let setupLoan = null;
  if (hard && setupMode === "separate" && setupAmount > 0) {
    const r = num(d.slRate ?? 10), yrs = num(d.slYears ?? 5) || 5, io = !!d.slIO;
    const payment = io ? (setupAmount * r) / 100 / 12 : pmt(setupAmount, r, yrs);
    const balanceAtRefi = io ? setupAmount : balanceAfter(setupAmount, r, yrs, hard.termMonths);
    setupLoan = { amount: setupAmount, rate: r, years: yrs, io, payment, balanceAtRefi, payAtRefi: d.slPayAtRefi !== false };
  }
  if (hard) hard.setupMode = setupMode;
  const debtService = pAndI + mi + notePay + (setupLoan ? setupLoan.payment : 0);

  // Taxes and insurance (ownership only). A Sub-To payment that already includes them is not double counted.
  const escrowedSubto = type === "creative" && (d.creativeMode || "subto") === "subto" && d.stEscrowed !== false;
  const taxesMo = escrowedSubto ? 0 : (num(d.taxMode) === 1 ? num(d.taxMonthly) : (price * num(d.taxPct ?? 1.85)) / 100 / 12);
  const insMo = escrowedSubto ? 0 : (num(d.insMode) === 1 ? num(d.insMonthly) : (price * num(d.insPct ?? 1.2)) / 100 / 12);

  // ---- Operating expenses ----
  const exp = d.expenses || {};
  const opexLines = EXPENSE_ITEMS.map(([k, label]) => ({ k, label, amt: num(exp[k]) }));
  const mgmt = d.selfManage ? 0 : num(d.mgmtPerRoom ?? MGMT_PER_ROOM) * rentedCount;
  const opex = opexLines.reduce((a, l) => a + l.amt, 0) + mgmt;
  const utilities = UTILITY_KEYS.reduce((a, k) => a + num(exp[k]), 0);

  // NOI: income after operating costs, before the loan.
  const noi = effectiveIncome - opex - taxesMo - insMo;
  const cashFlow = noi - debtService;

  // ---- Setup costs ----
  const furn = furnishingEstimate({ ...(d.furnish || {}), hire: !!(d.furnish && d.furnish.hire) });
  const furnishing = d.furnishOverride !== "" && d.furnishOverride != null && num(d.furnishOverride) > 0 ? num(d.furnishOverride) : furn.total;
  const months = num(d.monthsToRent);
  // Carrying cost while the home fills: the loan, taxes and insurance, HOA, lawn, and about half the utilities.
  const holdingMonthly = debtService + taxesMo + insMo + num(exp.hoa) + num(exp.lawn) + utilities / 2;
  const holding = months * holdingMonthly;
  const renoCash = renoCashHard != null ? renoCashHard : financedReno ? 0 : reno;
  const otherUpfront = num(d.otherUpfront);
  // Furnishing and holding paid by a loan come off the cash needed.
  const setupFinanced = setupMode === "roll" ? Math.min(setupAmount, furnishing + holding) : setupLoan ? setupLoan.amount : 0;
  const cashInRaw = down + closingCash + pointsCash + furnishing + renoCash + holding + upfrontSeller + otherUpfront - setupFinanced;
  const cashIn = Math.abs(cashInRaw) < 1 ? 0 : cashInRaw;   // pennies left over from rounding count as zero
  const cashInLines = [
    [hard ? "Purchase not covered by the lender" : "Down payment", down], ["Cash to seller + arrears", upfrontSeller],
    ["Closing costs", closingCash], ["Lender points", pointsCash], [hard ? "Rehab not covered by the lender" : "Renovation / conversion", renoCash], ["Furnishing and setup", furnishing],
    [`Holding cost (${months} mo until rented)`, holding], ["Other upfront", otherUpfront],
    [setupMode === "roll" ? "Furnishing and holding in the hard money loan" : "Furnishing and holding from the separate loan", -setupFinanced],
  ].filter(([, v]) => Math.abs(v) > 0.5).map(([label, amt]) => ({ label, amt }));

  // ---- Returns ----
  const annualCF = cashFlow * 12;
  const coc = cashIn > 0 ? (annualCF / cashIn) * 100 : null;
  const pitia = pAndI + mi + notePay + taxesMo + insMo + num(exp.hoa);
  // Lender DSCR. Most lenders qualify on traditional rent (what the house rents for to one tenant),
  // not room rents. Brian knows of only one lender that counts by-the-room income, and a few that
  // count short-term rental income. So the main DSCR uses the traditional rent the student enters.
  const dscrRoom = pitia > 0 ? effectiveIncome / pitia : null;
  const dscr = pitia > 0 && num(d.wholeHouseRent) > 0 ? num(d.wholeHouseRent) / pitia : null;
  const allIn = price + reno;
  const capRate = allIn > 0 ? ((noi * 12) / allIn) * 100 : null;
  const costPerRoom = rentableCount > 0 ? allIn / rentableCount : null;
  const fixedCosts = opex - mgmt + taxesMo + insMo + debtService;
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
  if (!hard) {
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
  // Buy & Convert and House Hack need a value: lenders lend on what the house is worth (Brian, Nov 2026).
  else if ((type === "buy" || type === "hack") && !(num(d.arv) > 0)) verdict = { tone: "none", label: "Add the after-repair value", note: "Lenders lend based on what the house is worth once it is done. Enter it in step 4 to see the verdict." };
  // A hard money loan bigger than the house is worth will not get funded.
  else if (hard && loan > num(d.arv))
    verdict = { tone: "pass", label: "Loan is bigger than the house is worth", note: `The hard money loan (${fmt$(loan)}) is more than the ${fmt$(num(d.arv))} after-repair value. Most hard money lenders stop at 70% to 75% of it.` };
  // A bank, DSCR or FHA loan bigger than lenders allow for the value is not a real loan.
  else if (!hard && (type === "buy" || type === "hack") && loan > (num(d.arv) * (type === "hack" ? 96.5 : 80)) / 100)
    verdict = { tone: "pass", label: "Loan is bigger than the value allows", note: `Lenders lend up to about ${type === "hack" ? "96.5%" : "75% to 80%"} of what the house is worth. At ${fmt$(num(d.arv))}, this loan would not happen. Check the after-repair value or plan to bring more cash.` };
  else if (type === "hack") {
    verdict = hack.yourCost <= 0
      ? { tone: "strong", label: "You live for free", note: `The other rooms cover every cost and pay you about ${fmt$(Math.abs(hack.yourCost))} a month.` }
      : hack.current > 0 && hack.yourCost < hack.current
        ? { tone: "solid", label: "Cheaper than your rent now", note: `Living there costs about ${fmt$(hack.yourCost)} a month, ${fmt$(hack.current - hack.yourCost)} less than you pay now.` }
        : { tone: "thin", label: "Costs more than you pay now", note: hack.current > 0 ? `Living there costs about ${fmt$(hack.yourCost)} a month, more than the ${fmt$(hack.current)} you pay now.` : `Living there costs about ${fmt$(hack.yourCost)} a month. Enter what you pay for housing now to compare.` };
  } else if (cashFlow <= 0) verdict = { tone: "pass", label: "Pass at these numbers", note: "It loses money every month. Lower the price, raise the rents, or cut costs." };
  else if (cashIn <= 0) verdict = { tone: "strong", label: "No money left in the deal", note: `Infinite cash-on-cash: it cash flows about ${fmt$(cashFlow)} a month with none of your own cash in. Check that a lender will really fund it this way.` };
  else {
    const c = coc ?? 0;
    verdict = c >= TARGETS.cocStrong ? { tone: "strong", label: "Strong deal", note: `${pct(c)} cash-on-cash.${c >= 100 ? " Over 100% means the cash flow pays back all the cash you put in within a year." : ""}` }
      : c >= TARGETS.cocSolid ? { tone: "solid", label: "Solid deal", note: `${pct(c)} cash-on-cash.` }
        : c >= TARGETS.cocThin ? { tone: "thin", label: "Thin", note: `${pct(c)} cash-on-cash. It works, but there is not much room for a vacancy or a repair.` }
          : { tone: "pass", label: "Pass at these numbers", note: `${pct(c)} cash-on-cash is too low for the work co-living takes.` };
  }

  return {
    type, owns, occ, rentableCount, rentedCount, grossRent, grossRoomRent, grossUnitRent, otherIncome, effectiveIncome,
    price, reno, closing, loan, down, pAndI, mi, notePay, sellerNote, debtService, taxesMo, insMo,
    opexLines, mgmt, opex, utilities, noi, cashFlow, annualCF, furn, furnishing, holding, holdingMonthly, months,
    cashIn, cashInLines, coc, dscr, dscrRoom, capRate, costPerRoom, breakEvenOcc, paybackMonths, cfPerRoom, premium, five,
    balloonDue, hack, verdict, perRoomMgmt, financedReno, upfrontSeller, hard, pointsCash, closingCash, setupLoan, setupFinanced,
  };
}

// Long-term plan after hard money: refinance into a DSCR loan, refinance with a private lender,
// or pay it off in cash. DSCR ranges checked Nov 2026 (lender guides): 7% to 8% rates, 70% to 75%
// of value for cash-out, 75% to 80% for rate and term, cash-out rates about 0.25% to 0.5% higher than
// rate and term, 2% to 5% closing costs, 3 to 6 months owned before the new value is used.
// Rate and term: the new loan only pays off the old loan and the closing costs, so no cash comes out.
// Brian: with rate and term you usually get a little back at closing, usually under $1,000.
export function refiPlan(d, a) {
  if (!a || !a.hard) return null;
  const sl = a.setupLoan;
  const payoff = a.hard.balloon + (sl && sl.payAtRefi ? sl.balanceAtRefi : 0);
  // The refinance is sized on the after-repair value only. No value, no refinance number.
  const value = num(d.arv) > 0 ? num(d.arv) : 0;
  const type = d.refiType || "dscr";
  let newLoan = 0, costs = 0, payment = 0, rate = 0, years = 0, io = false;
  let kind = "cashout", capped = false;
  if (type === "dscr") {
    kind = d.refiKind === "rateterm" ? "rateterm" : "cashout";
    const costPct = num(d.refiCostPct ?? 3) / 100;
    years = num(d.refiYears ?? 30) || 30;
    if (kind === "rateterm") {
      const maxLoan = value * Math.min(100, Math.max(0, num(d.rtLtv ?? 80))) / 100;
      const needed = costPct < 1 ? payoff / (1 - costPct) : payoff;   // pays off the old loan plus its own closing costs
      newLoan = Math.min(needed, maxLoan); capped = needed > maxLoan + 0.5;
      rate = num(d.rtRate ?? 7.25);
    } else {
      newLoan = value * Math.min(100, Math.max(0, num(d.refiLtv ?? 75))) / 100;
      rate = num(d.refiRate ?? 7.5);
    }
    costs = newLoan * costPct;
    payment = pmt(newLoan, rate, years);
  } else if (type === "private") {
    newLoan = String(d.pmAmount ?? "").trim() !== "" ? num(d.pmAmount) : payoff;
    rate = num(d.pmRate ?? 10); years = num(d.pmYears ?? 30) || 30; io = !!d.pmIO;
    payment = io ? newLoan * rate / 100 / 12 : pmt(newLoan, rate, years);
  }
  const cashToClose = payoff + costs - newLoan;           // above 0 = you bring cash, below 0 = cash back to you
  const cashFlow = a.noi - payment - (sl && !sl.payAtRefi ? sl.payment : 0);
  const cashLeftIn = a.cashIn + cashToClose;
  const pitia = payment + a.taxesMo + a.insMo + num((d.expenses || {}).hoa);
  const tradRent = num(d.wholeHouseRent);
  return {
    missingValue: type === "dscr" && !(value > 0),
    type, kind, capped, payoff, value, newLoan, costs, payment, rate, years, io, cashToClose, cashFlow, cashLeftIn,
    coc: cashLeftIn > 0 ? (cashFlow * 12 / cashLeftIn) * 100 : null,
    dscr: type === "dscr" && pitia > 0 && tradRent > 0 ? tradRent / pitia : null,
    ltv: value > 0 ? (newLoan / value) * 100 : null,
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
  // 2) Max price that still hits the target.
  let maxPrice = null;
  if (base.type === "buy" || base.type === "hack" || (base.type === "creative" && d.creativeMode === "sf")) {
    const p = solve(0, Math.max(1, base.price) * 4 + 500000, (x) => !hits(analyze({ ...d, price: x })));
    maxPrice = hits(analyze({ ...d, price: 0 })) ? p : null;
  }
  return { rentNeeded, avgNow, maxPrice };
}

export const fmt$ = (n) => (n == null || !isFinite(n) ? "--" : `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`);
export const pct = (n) => (n == null || !isFinite(n) ? "--" : `${Math.round(n * 100) / 100}%`);
