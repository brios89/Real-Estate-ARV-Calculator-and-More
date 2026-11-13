// Printable contractor documents for Hobknob Co-Living Academy students:
// a Scope of Work, a Residential Punch List and a Rehab Estimate.
// Each builder returns a complete, print-ready HTML page filled in with the deal's facts.
// Started from Brian's sample forms, corrected (units, missing totals, typos) and expanded for co-living.
// Cost ranges are national ballparks gathered Nov 2026 (Inch Calculator, Angi, This Old House) or
// carried from Brian's sample sheet. They are starting points only. Students get local bids.
// UI copy rule: no em dashes or semicolons in any text a student or contractor reads.

import { num, fmt$, CAPEX_ITEMS, DEAL_TYPES } from "./calc.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// Clickable check boxes. Plain symbols (not form inputs) so they survive printing and the Word download.
const BOX = '<span class="cb" contenteditable="false" title="Click to check">&#9744;</span>';
const BOXED = '<span class="cb" contenteditable="false" title="Click to uncheck">&#9746;</span>';

// ---------- facts every document shares ----------
export function projectFacts(d) {
  const model = d.model || "coliving";
  const rooms = ["coliving", "hybrid"].includes(model) ? Math.max(0, Math.round(num(d.roomCount))) : 0;
  const units = ["private", "hybrid"].includes(model) ? Math.max(0, Math.round(num(d.unitCount))) : 0;
  const bathsAfter = num(d.bathsAfter) || num(d.baths);
  const docs = d.docs || {};
  return {
    name: d.name || d.address || "Co-living project",
    address: d.address || "",
    model,
    modelLabel: { coliving: "Co-living (by the room)", private: "Private units", hybrid: "Hybrid (rooms and units)" }[model],
    dealType: DEAL_TYPES[d.dealType] || "",
    sqft: num(d.sqft),
    bedsNow: num(d.beds),
    bathsNow: num(d.baths),
    bathsAfter,
    rooms,
    units,
    bathCount: Math.max(1, Math.ceil(bathsAfter || 1)),
    ownerName: docs.ownerName || "",
    ownerPhone: docs.ownerPhone || "",
    ownerEmail: docs.ownerEmail || "",
    contractor: docs.contractor || "",
    today: new Date().toLocaleDateString("en-US"),
  };
}

// ---------- shared page shell ----------
const CSS = `
*{box-sizing:border-box}
body{font-family:-apple-system,"Segoe UI",Arial,sans-serif;color:#0f172a;margin:0;background:#f1f5f9}
.page{max-width:8.5in;margin:16px auto;background:#fff;padding:.55in .5in;box-shadow:0 1px 4px rgba(0,0,0,.12)}
.bar{position:sticky;top:0;z-index:5;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;padding:10px;background:#0f172a}
.bar button,.bar a{font:600 14px/1 -apple-system,"Segoe UI",Arial,sans-serif;padding:10px 16px;border-radius:8px;border:0;cursor:pointer;text-decoration:none}
.bar .p{background:#4c9a31;color:#fff}.bar .s{background:#fff;color:#0f172a}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #6cbb4a;padding-bottom:10px;margin-bottom:12px}
.head img{height:44px}
h1{font-size:20px;margin:0 0 2px}
.sub{font-size:11.5px;color:#475569;margin:0}
h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;margin:18px 0 6px;padding:5px 8px;background:#ecf7e7;border-left:4px solid #6cbb4a;break-after:avoid}
h3{font-size:12px;margin:12px 0 4px;break-after:avoid}
p,li{font-size:11.5px;line-height:1.45}
ul{margin:4px 0 8px;padding-left:18px}
table{width:100%;border-collapse:collapse;font-size:10.5px;margin:4px 0 8px}
th,td{border:1px solid #cbd5e1;padding:5px 6px;vertical-align:top;text-align:left}
th{background:#f8fafc;font-size:9.5px;text-transform:uppercase;letter-spacing:.03em}
thead{display:table-header-group}
tr{break-inside:avoid}
.facts td{border:1px solid #cbd5e1;font-size:11px}
.facts td.k{width:18%;background:#f8fafc;font-weight:600}
.box{width:22px;text-align:center;font-size:13px}
.cb{cursor:pointer;user-select:none;font-size:14px}
.hint{width:100%;text-align:center;color:#cbd5e1;font:12px -apple-system,"Segoe UI",Arial,sans-serif}
[contenteditable="true"]:focus{outline:none}
[contenteditable="true"] td:hover,[contenteditable="true"] li:hover,[contenteditable="true"] p:hover{background:#fffbea}
.blank{height:22px}
.w{color:#64748b;font-size:9.5px}
.tip{border:1px solid #bfe3b0;background:#f3faf0;border-radius:6px;padding:8px 10px;font-size:11px;margin:8px 0}
.warn{border:1px solid #fcd9a5;background:#fff8ec;border-radius:6px;padding:8px 10px;font-size:11px;margin:8px 0}
.line{border-bottom:1px solid #94a3b8;display:inline-block;min-width:180px;height:16px}
.sig td{height:34px}
.foot{margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:9.5px;color:#64748b}
.num{text-align:right;white-space:nowrap}
.tot td{font-weight:700;background:#f8fafc}
@page{size:letter;margin:.45in}
@media print{body{background:#fff}.bar{display:none}[contenteditable="true"] td:hover,[contenteditable="true"] li:hover,[contenteditable="true"] p:hover{background:none}.page{box-shadow:none;margin:0;max-width:none;padding:0}}
@media (max-width:640px){.page{padding:18px 12px;margin:0;overflow-x:auto}.head{flex-direction:column}}
`;

function shell({ title, fileName, facts, intro, body }) {
  const factRows = [
    ["Project", facts.name], ["Address", facts.address],
    ["Owner", [facts.ownerName, facts.ownerPhone, facts.ownerEmail].filter(Boolean).map(esc).join(" &middot; ") || "&nbsp;"],
    ["Contractor", esc(facts.contractor) || "&nbsp;"],
  ];
  const summary = [
    facts.sqft ? `${facts.sqft.toLocaleString()} sq ft` : null,
    facts.bedsNow ? `${facts.bedsNow} bed / ${facts.bathsNow || 0} bath today` : null,
    facts.rooms ? `${facts.rooms} rentable bedrooms planned` : null,
    facts.units ? `${facts.units} private units planned` : null,
    facts.bathsAfter && facts.bathsAfter !== facts.bathsNow ? `${facts.bathsAfter} baths after` : null,
  ].filter(Boolean).join(" &middot; ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | ${esc(facts.name)}</title><style>${CSS}</style></head><body>
<div class="bar" data-file="${esc(fileName)}"><button class="p" onclick="window.print()">Print or save as PDF</button><button class="s" id="dlh">Download (keeps your edits)</button><button class="s" id="dlw">Download for Word</button><div class="hint">Click any text to type over it. Click a box to check it. Blank rows and cells are yours to fill in.</div></div>
<div class="page" contenteditable="true" spellcheck="true">
<div class="head"><div><h1>${esc(title)}</h1><p class="sub">${esc(facts.modelLabel)}${facts.dealType ? ` &middot; ${esc(facts.dealType)}` : ""}${summary ? ` &middot; ${summary}` : ""}</p></div>
<img src="${location.origin}/academy-logo.png" alt="Hobknob Co-Living Academy"></div>
<table class="facts"><tbody>${factRows.map(([k, v], i) => (i % 2 === 0 ? "<tr>" : "") + `<td class="k">${k}</td><td>${k === "Project" || k === "Address" ? esc(v) || "&nbsp;" : v}</td>` + (i % 2 === 1 ? "</tr>" : "")).join("")}
<tr><td class="k">Date</td><td>${esc(facts.today)}</td><td class="k">Contractor phone</td><td>&nbsp;</td></tr></tbody></table>
${intro || ""}
${body}
<div class="foot">Prepared with the Hobknob Co-Living Academy Deal Analyzer. This is a template and a starting point, not legal advice or a guarantee of cost or results. Have a local attorney review any contract before you sign it, and confirm code requirements with your local building department.</div>
</div>
<script>
(function(){
  var name=(document.querySelector(".bar")||{}).getAttribute?document.querySelector(".bar").getAttribute("data-file"):"document.html";
  document.addEventListener("click",function(e){var c=e.target.closest&&e.target.closest(".cb");if(!c)return;e.preventDefault();c.innerHTML=c.textContent==="\u2610"?"&#9746;":"&#9744;";c.title=c.textContent==="\u2610"?"Click to check":"Click to uncheck";});
  function save(data,type,file){var b=new Blob([data],{type:type});var u=URL.createObjectURL(b);var a=document.createElement("a");a.href=u;a.download=file;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},4000);}
  document.getElementById("dlh").addEventListener("click",function(){save("<!doctype html>"+document.documentElement.outerHTML,"text/html",name);});
  document.getElementById("dlw").addEventListener("click",function(){
    var page=document.querySelector(".page").cloneNode(true);page.removeAttribute("contenteditable");page.querySelectorAll("table").forEach(function(t){t.setAttribute("border","1");t.setAttribute("cellspacing","0");t.setAttribute("cellpadding","4");t.style.borderCollapse="collapse";});page.querySelectorAll(".cb").forEach(function(c){c.removeAttribute("contenteditable");});
    var css=document.querySelector("style").textContent;
    var doc='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>'+document.title+'</title><style>'+css+' .page{box-shadow:none;margin:0;padding:0} p,li{margin:0 0 3pt} ul{margin-top:2pt;margin-bottom:4pt} td,th{border:1px solid #94a3b8}</style></head><body>'+page.outerHTML+'</body></html>';
    save("\ufeff"+doc,"application/msword",name.replace(/[.]html$/,".doc"));
  });
})();
</script>
</body></html>`;
}

// =====================================================================
// 1) SCOPE OF WORK
// =====================================================================
// Each item: [text, defaultMaterialBy]  ("O" owner furnished, "C" contractor furnished, "" either)
const SOW_SECTIONS = (f) => [
  ["Demolition and prep", [
    ["Remove debris, trash and any items left by the previous owner", "C"],
    ["Remove flooring as marked (carpet, damaged vinyl, tile)", "C"],
    ["Remove kitchen cabinets, countertops and appliances as marked", "C"],
    ["Remove bathroom fixtures, tile and vanities as marked", "C"],
    ["Remove walls or partitions as marked (contractor confirms if any wall is load bearing before removal)", "C"],
    ["Disconnect and cap plumbing, gas and electrical at removed fixtures", "C"],
    ["Protect floors, fixtures and areas not in the scope", "C"],
  ]],
  ["Co-living conversion and life safety", [
    [`Create ${f.rooms > f.bedsNow ? f.rooms - f.bedsNow : "___"} new bedroom(s): frame walls, insulate for sound, drywall, door, closet, outlets, light and switch`, ""],
    ["Every bedroom has an egress window that meets local code (IRC: at least 5.7 sq ft clear opening, 5.0 sq ft at grade or below, at least 24 in. tall and 20 in. wide clear, sill no higher than 44 in. above the floor)", "C"],
    ["Below-grade egress: window well at least 9 sq ft and 36 in. deep from the wall, with a fixed ladder if deeper than 44 in.", "C"],
    [`Keyed-different or smart lock on every bedroom door (${f.rooms || "___"} doors), keys labeled by room`, "O"],
    ["Number or name every bedroom door", "O"],
    ["Smoke alarms in every bedroom, outside each sleeping area and on every floor including the basement, interconnected so one sets off all", "C"],
    ["Carbon monoxide alarms outside each sleeping area (required with any gas appliance or attached garage)", "C"],
    ["Fire extinguisher in the kitchen and on every floor", "O"],
    ["Keypad or smart lock on the main entry door", "O"],
    ["Common area set up as marked (living, dining, kitchen seating for the number of residents)", ""],
  ]],
  ["Exterior", [
    ["Roof: repair or replace as marked, including flashing, drip edge and ventilation", "C"],
    ["Gutters and downspouts: clean, repair or replace, water drains away from the foundation", "C"],
    ["Siding and trim: repair or replace damaged sections, caulk and seal", "C"],
    ["Exterior paint as marked", "C"],
    ["Exterior doors: replace or repair, weatherstrip, new locks", "O"],
    ["Windows: repair or replace as marked, all open, close and lock", ""],
    ["Concrete: sidewalk, steps or driveway repair as marked", "C"],
    ["Deck, porch, steps and handrails safe and secure (handrails and guards per code)", "C"],
    ["Parking pad or gravel for resident parking as marked", "C"],
    ["Landscaping cleanup, trim trees and shrubs away from the house", "C"],
    ["Exterior lighting at entries, motion or dusk-to-dawn", "O"],
  ]],
  ["Framing, drywall and insulation", [
    ["Frame new walls, closets and openings per the floor plan", "C"],
    ["Patch and repair drywall, holes and cracks, texture to match", "C"],
    ["Insulate new walls between bedrooms for sound", "C"],
    ["Attic insulation as marked", "C"],
    ["Attic access panel as required", "C"],
  ]],
  ["Kitchen", [
    ["Install cabinets per the layout (base, upper and pantry)", "O"],
    ["Install countertops and sink", ""],
    ["Install backsplash as marked", "O"],
    ["Install and connect appliances: range, hood or microwave, refrigerator(s), dishwasher", "O"],
    ["Plumbing for sink, faucet, disposal, dishwasher and refrigerator water line", "C"],
    ["Outlets along the counter on GFCI protection as required by code", "C"],
    ["Lighting as marked", "O"],
  ]],
  ...Array.from({ length: f.bathCount }, (_, i) => [`Bathroom ${i + 1}`, [
    ["New or repaired tub or shower, surround and valve", ""],
    ["Waterproofing behind all tile in wet areas (cement board and membrane)", "C"],
    ["Floor tile or LVP as marked", "O"],
    ["Toilet, vanity with top, faucet and mirror", "O"],
    ["Exhaust fan vented to the outside, on its own switch", "C"],
    ["GFCI outlet at the vanity", "C"],
    ["Vanity light", "O"],
    ["Towel bars, robe hooks and toilet paper holder", "O"],
    ["Caulk tub, shower, sink and toilet base", "C"],
  ]]),
  ["Flooring", [
    ["LVP (luxury vinyl plank) in areas marked", "O"],
    ["Carpet in areas marked", "O"],
    ["Refinish existing hardwood in areas marked", "C"],
    ["Transitions, thresholds and shoe molding", "C"],
  ]],
  ["Interior paint", [
    ["Prep, patch and prime as needed. Protect surfaces not being painted", "C"],
    ["Paint walls, ceilings, doors and trim per the color schedule below", "C"],
    ["Caulk all trim before painting", "C"],
  ]],
  ["Doors, trim and closets", [
    ["Interior doors installed, plumb, latching and with new hardware", "O"],
    ["Base, casing and trim at new walls and openings", "C"],
    ["Closet shelving and rod in every bedroom", "O"],
  ]],
  ["Plumbing", [
    ["Supply lines (PEX or copper) and drains for all new fixtures", "C"],
    ["Replace galvanized or failing supply and drain lines as marked", "C"],
    ["Water heater sized for the number of residents, with expansion tank if required", ""],
    ["Washer box and dryer vent for laundry", "C"],
    ["Fix all leaks and test water pressure", "C"],
  ]],
  ["HVAC", [
    ["Service or replace furnace and AC as marked", "C"],
    ["Mini-splits or added ductwork so every bedroom heats and cools evenly", "C"],
    ["New registers and grilles, clean ducts as marked", "C"],
    ["Thermostat(s) as marked", "O"],
  ]],
  ["Electrical", [
    ["Panel upgrade or replacement as marked (size for the added bedrooms and loads)", "C"],
    ["Replace outlets and switches as marked", "C"],
    ["GFCI protection in kitchen, bathrooms, laundry, garage, basement and outside as required by code", "C"],
    ["AFCI protection for bedroom and living area circuits as required by code", "C"],
    ["Light fixtures and ceiling fans as marked", "O"],
    ["Hardwired, interconnected smoke and CO alarms (see life safety)", "C"],
    ["Wi-Fi: network cable or outlet at a central spot for mesh internet", "C"],
  ]],
  ["Final cleanup", [
    ["Daily cleanup of work areas", "C"],
    ["All debris hauled away (dumpster provided by ____________)", "C"],
    ["Final construction clean, move-in ready", "C"],
    ["Walk the punch list with the owner and complete every item before final payment", "C"],
  ]],
];

// Which line items to pre-check from the analyzer's renovation entries.
const SOW_CHECK_FROM_CAPEX = {
  bedroomConv: ["Create ", "egress window", "Below-grade egress", "Insulate new walls"],
  locks: ["Keyed-different", "Number or name"],
  safety: ["Smoke alarms", "Carbon monoxide", "Fire extinguisher", "egress window", "Hardwired"],
  hvac: ["Mini-splits", "Service or replace furnace"],
  floors: ["LVP (luxury", "Transitions"],
  paint: ["Prep, patch", "Paint walls", "Caulk all trim"],
  roof: ["Roof:", "Gutters and downspouts"],
  parking: ["Parking pad"],
  appliances: ["Install and connect appliances", "Washer box"],
  commonArea: ["Common area set up"],
};

export function buildScope(d) {
  const f = projectFacts(d);
  const capex = d.capex || {};
  const want = Object.entries(SOW_CHECK_FROM_CAPEX).filter(([k]) => num(capex[k]) > 0).flatMap(([, v]) => v);
  // Adding a bathroom pre-checks only the new bathroom(s), the ones past today's count.
  const bathsToday = Math.ceil(f.bathsNow || 0);
  const isNewBath = (section) => num(capex.bathAdd) > 0 && /^Bathroom (\d+)$/.test(section) && Number(section.split(" ")[1]) > bathsToday;
  const checked = (section, text) => isNewBath(section) || want.some((w) => text.includes(w));
  const sections = SOW_SECTIONS(f).map(([title, items]) => `
<h2>${esc(title)}</h2>
<table><thead><tr><th class="box">&#10003;</th><th>Work item</th><th style="width:96px">Material by</th><th style="width:32%">Notes, quantities, locations</th></tr></thead><tbody>
${items.map(([text, by]) => `<tr><td class="box">${checked(title, text) ? BOXED : BOX}</td><td>${esc(text)}</td><td class="w">${BOX} Owner ${by === "O" ? "(typ.)" : ""}<br>${BOX} Contractor ${by === "C" ? "(typ.)" : ""}</td><td></td></tr>`).join("")}
<tr><td class="box">${BOX}</td><td class="blank"></td><td class="w">${BOX} Owner<br>${BOX} Contractor</td><td></td></tr>
<tr><td class="box">${BOX}</td><td class="blank"></td><td class="w">${BOX} Owner<br>${BOX} Contractor</td><td></td></tr>
</tbody></table>`).join("");

  const body = `
<h2>General terms</h2>
<ul>
<li>The work includes all labor, materials, tools, equipment, insurance, overhead and profit needed to complete the items checked below, except materials marked "Owner."</li>
<li>Contractor has walked the property and accepts the existing conditions. Costs for those conditions are included in this price.</li>
<li>Contractor will field verify all locations, sizes and quantities before ordering or starting work.</li>
<li>All work will meet local building codes and pass required inspections. Building permit pulled by: ${BOX} Owner ${BOX} Contractor. Trade permits (electrical, plumbing, HVAC) are pulled by the licensed contractor doing that work.</li>
<li>Contractor will provide a certificate of general liability insurance and workers' compensation (or a valid exemption) before starting, and a copy of any license required locally.</li>
<li>Any change to this scope or price must be a written change order signed by both parties before the work is done.</li>
<li>Contractor will provide a lien waiver from themselves and their subcontractors and suppliers with each payment.</li>
<li>Workmanship warranty: ______ months from final completion.</li>
<li>Daily cleanup of all work areas. Debris disposal in the dumpster provided by: ${BOX} Owner ${BOX} Contractor.</li>
</ul>
<h3>Who buys the materials</h3>
<p><b>OFCI</b> = Owner Furnished, Contractor Installed. <b>CFCI</b> = Contractor Furnished, Contractor Installed. Check "Owner" or "Contractor" on every line so nobody assumes the other one is buying it.</p>
<div class="tip"><b>Tip from Brian:</b> I have always gone with OFCI. I buy the materials and the contractor installs them.</div>
<div class="warn">Check the items that apply, cross out what does not, and add your own lines. Items already checked come from the renovation costs you entered in the analyzer. Do not write your budget on this page. Let the contractor price the work.</div>
${sections}
<h2>Paint color schedule</h2>
<table><thead><tr><th style="width:22%">Surface</th><th>Color</th><th style="width:18%">Sheen</th><th style="width:18%">Brand / product</th></tr></thead><tbody>
${["Walls", "Ceilings", "Trim and casings", "Doors", "Bathrooms", "Accent wall (if any)"].map((s) => `<tr><td>${s}</td><td class="blank"></td><td></td><td></td></tr>`).join("")}
</tbody></table>
<h2>Price, schedule and payments</h2>
<table class="facts"><tbody>
<tr><td class="k">Total price</td><td>$</td><td class="k">Start date</td><td></td></tr>
<tr><td class="k">Deposit</td><td>$</td><td class="k">Completion date</td><td></td></tr>
</tbody></table>
<table><thead><tr><th>Payment milestone</th><th style="width:16%">Amount</th><th style="width:16%">Date paid</th><th style="width:18%">Lien waiver received</th></tr></thead><tbody>
${["Deposit or materials draw", "Demolition complete", "Rough-ins complete and inspections passed", "Drywall, paint and flooring complete", "Final completion, punch list done and final inspection passed"].map((m) => `<tr><td>${m}</td><td>$</td><td></td><td>${BOX} Yes</td></tr>`).join("")}
</tbody></table>
<div class="tip">Tie every payment to finished, inspected work. Keep the last payment until the punch list is complete and the final inspection passes.</div>
<h2>Signatures</h2>
<table class="sig"><thead><tr><th style="width:18%"></th><th>Contractor</th><th>Owner</th></tr></thead><tbody>
${["Company", "Name", "Phone", "Email", "Signature", "Date"].map((r) => `<tr><td><b>${r}</b></td><td>${r === "Name" ? esc(f.contractor) : ""}</td><td>${r === "Name" ? esc(f.ownerName) : r === "Phone" ? esc(f.ownerPhone) : r === "Email" ? esc(f.ownerEmail) : ""}</td></tr>`).join("")}
</tbody></table>`;
  return shell({ title: "Project Scope of Work", fileName: fileName(f, "scope-of-work"), facts: f, body });
}

// =====================================================================
// 2) RESIDENTIAL PUNCH LIST
// =====================================================================
const SURFACES = ["Walls", "Floors", "Ceiling", "Windows (open, close, lock, screens)", "Doors (latch, hardware)", "Trim", "Outlets", "Switches", "Light fixtures"];
const PUNCH_AREAS = (f) => {
  const areas = [
    ["Exterior", ["Roof and flashing", "Gutters and downspouts", "Siding and trim", "Exterior paint", "Entry doors and locks", "Keypad or smart entry lock", "Exterior lights", "Steps, porch, deck and handrails", "Walkways and driveway", "Parking area", "House numbers visible from the street", "Landscaping and yard cleanup"]],
    ["Entry and living room", [...SURFACES, "Closet", "Smoke alarm (tested)"]],
    ["Kitchen", ["Walls", "Floors", "Ceiling", "Windows", "Cabinets (doors and drawers open and close)", "Countertops", "Backsplash", "Sink and faucet (no leaks)", "Garbage disposal", "Dishwasher (runs a full cycle)", "Range or oven", "Range hood or microwave", "Refrigerator(s)", "GFCI outlets (tested)", "Switches", "Light fixtures", "Trim", "Pantry", "Fire extinguisher mounted"]],
  ];
  if (f.model !== "private") areas.push(["Dining area", [...SURFACES]]);
  areas.push(["Hallways and stairs", [...SURFACES, "Handrails secure", "Smoke alarm outside bedrooms (tested)", "Carbon monoxide alarm (tested)", "Closet"]]);
  const roomCount = f.rooms || (f.model === "private" ? 0 : Math.max(f.bedsNow, 3));
  for (let i = 1; i <= roomCount; i++) {
    areas.push([`Bedroom ${i}`, [...SURFACES, "Closet (shelf and rod)", "Bedroom door lock and keys (labeled)", "Room number on door", "Egress window opens fully", "Smoke alarm (tested)", "Heat and AC reach the room", "Blinds or window coverings", "Wi-Fi signal strong in the room"]]);
  }
  for (let i = 1; i <= f.units; i++) {
    areas.push([`Unit ${i}`, ["Entry door, lock and keys", "Walls, floors and ceilings", "Windows (open, close, lock)", "Kitchen cabinets and countertops", "Sink, faucet and disposal", "Appliances work", "Bathroom fixtures (no leaks)", "Exhaust fan", "GFCI outlets (tested)", "Outlets, switches and lights", "Heat and AC", "Smoke and CO alarms (tested)", "Egress window in bedroom", "Closets", "Wi-Fi signal strong"]]);
  }
  for (let i = 1; i <= f.bathCount; i++) {
    areas.push([`Bathroom ${i}`, ["Walls", "Floors", "Ceiling", "Windows", "Door and lock", "Vanity and cabinet", "Sink and faucet (no leaks)", "Toilet (flushes, no rocking, no leaks)", "Tub or shower (drains, no leaks)", "Hot water reaches the fixture", "Caulk and grout", "Exhaust fan vents outside", "GFCI outlet (tested)", "Light fixtures", "Mirror", "Towel bars and toilet paper holder", "Trim"]]);
  }
  areas.push(
    ["Laundry", ["Washer hookups (no leaks)", "Dryer vent to the outside", "Washer and dryer work", "GFCI outlet", "Floor drain or pan if required", "Light"]],
    ["Basement and mechanical", ["Furnace or air handler", "AC condenser", "Water heater (and expansion tank)", "Electrical panel labeled", "Sump pump if present", "No water or moisture", "Smoke alarm (tested)", "Stairs and handrail"]],
    ["Whole house systems and safety", ["Smoke alarms interconnected (one sets off all)", "Carbon monoxide alarms (tested)", "Fire extinguishers on every floor", "All plumbing: no leaks, good water pressure", "Heat and AC: every room comfortable", "All outlets have power", "Wi-Fi covers the whole house", "Permits closed and final inspections passed"]],
    ["Final clean and move-in ready", ["Construction dust cleaned", "Windows and sills cleaned", "Floors cleaned", "Kitchen and bathrooms cleaned", "Debris and leftover materials removed", "Keys, codes and manuals turned over to the owner"]],
  );
  return areas;
};

export function buildPunch(d) {
  const f = projectFacts(d);
  const body = `
<div class="tip">Walk every room with the contractor before the final payment. Mark each item OK or write what needs fixing, who will fix it and by when. Add any room or item that is not listed.</div>
${PUNCH_AREAS(f).map(([area, items]) => `
<h2>${esc(area)}</h2>
<table><thead><tr><th style="width:26%">Item</th><th class="box">OK</th><th>What needs to be fixed</th><th style="width:15%">Assigned to</th><th style="width:10%">Date assigned</th><th style="width:10%">Date done</th></tr></thead><tbody>
${items.map((it) => `<tr><td>${esc(it)}</td><td class="box">${BOX}</td><td></td><td></td><td></td><td></td></tr>`).join("")}
<tr><td class="blank"></td><td class="box">${BOX}</td><td></td><td></td><td></td><td></td></tr>
</tbody></table>`).join("")}
<h2>Sign off</h2>
<table class="sig"><thead><tr><th style="width:18%"></th><th>Contractor</th><th>Owner</th></tr></thead><tbody>
<tr><td><b>All items complete</b></td><td>${BOX} Yes</td><td>${BOX} Yes</td></tr>
<tr><td><b>Name</b></td><td>${esc(f.contractor)}</td><td>${esc(f.ownerName)}</td></tr>
<tr><td><b>Signature</b></td><td></td><td></td></tr>
<tr><td><b>Date</b></td><td></td><td></td></tr>
</tbody></table>`;
  return shell({ title: "Residential Punch List", fileName: fileName(f, "punch-list"), facts: f, body });
}

// =====================================================================
// 3) REHAB ESTIMATE
// =====================================================================
// [description, typical range, unit, hint(f) optional]
// "Get local bids" means no national range was verified. Do not invent one.
export const REHAB_SECTIONS = [
  ["Exterior", [
    ["Roof replacement, architectural shingle, with tear-off", "$550 to $1,400 / SQ", "SQ", () => "1 SQ = 100 sq ft of roof surface"],
    ["Gutters and downspouts", "Get local bids", "LF"],
    ["Siding", "$3 to $7 / SF", "SF"],
    ["Masonry / tuckpointing", "$20 to $30 / SF", "SF"],
    ["Exterior painting", "$1 to $2 / SF", "SF"],
    ["Decks / porches", "Replace decking $10 / SF, new deck $25 / SF", "SF"],
    ["Exterior doors", "Labor $100 + material $150 to $300", "EACH"],
    ["Windows", "Labor $75 + material $100 to $300", "EACH"],
    ["Garage door", "Labor $350 + material $500 to $1,000", "EACH"],
    ["Concrete", "$4 to $8 / SF", "SF"],
    ["Landscaping", "$500 to $5,000", "LS"],
    ["Fencing", "$15 to $30 / LF", "LF"],
    ["Parking pad / gravel", "Get local bids", "SF"],
  ]],
  ["Co-living conversion and life safety", [
    ["Bedroom conversion (walls, door, closet, outlet, light)", "Get local bids", "EACH", (f) => (f.rooms > f.bedsNow ? `Plan: ${f.rooms - f.bedsNow} new bedroom(s)` : "")],
    ["Egress window, above grade", "$900 to $3,000", "EACH"],
    ["Egress window, below grade with well", "$2,500 to $5,000 window + $3,000 to $7,000 dig and well", "EACH"],
    ["Keyed or smart lock on each bedroom door", "Get local bids", "EACH", (f) => (f.rooms ? `${f.rooms} bedroom doors` : "")],
    ["Smoke alarms, interconnected", "Get local bids", "EACH", (f) => (f.rooms ? `At least ${f.rooms} bedrooms + hallways + each floor` : "Each bedroom + hallways + each floor")],
    ["Carbon monoxide alarms", "Get local bids", "EACH", () => "Outside each sleeping area"],
    ["Fire extinguishers", "Get local bids", "EACH", () => "Kitchen + each floor"],
    ["Add a full bathroom", "Get local bids", "EACH"],
    ["Convert half bath to full", "Get local bids", "EACH"],
    ["Laundry hookups (washer box, dryer vent)", "Get local bids", "LS"],
    ["Wi-Fi mesh / network wiring", "Get local bids", "LS"],
    ["Keypad or smart entry lock", "Get local bids", "EACH"],
  ]],
  ["Interior", [
    ["Demolition", "$15 to $25 / HR (sample rate, verify locally)", "HR"],
    ["Framing / drywall", "Varies", "LS"],
    ["Interior doors", "Labor $75 + material $85 to $150", "EACH"],
    ["Base trim", "$2 / LF", "LF"],
    ["Crown molding", "$5 / LF", "LF"],
    ["Interior painting", "$1 to $3 / SF of wall and ceiling surface (not floor)", "SF"],
    ["LVP flooring, installed", "$3 to $15 / SF", "SF", (f) => (f.sqft ? `House is ${f.sqft.toLocaleString()} sq ft` : "")],
    ["Carpet", "$1 to $3 / SF", "SF"],
    ["Tile", "Labor $4 + material $1 to $5 / SF", "SF"],
    ["Hardwood flooring", "Labor $4 + material $2 to $5 / SF", "SF"],
    ["Closet shelving and rods", "Get local bids", "EACH"],
  ]],
  ["Kitchen", [
    ["Full kitchen remodel (use this OR the line items below)", "$4,000 to $15,000", "EACH"],
    ["Cabinets", "Labor $50 + material $150 / LF", "LF"],
    ["Countertops", "$30 to $80 / SF", "SF"],
    ["Appliance package", "$1,500 to $3,000", "EACH"],
    ["Extra refrigerator for residents", "Get local bids", "EACH"],
    ["Kitchen sink", "Labor $100 + material $150 to $400", "EACH"],
    ["Kitchen faucet", "Labor $50 + material $50 to $250", "EACH"],
    ["Garbage disposal", "Labor $50 + material $75 to $150", "EACH"],
  ]],
  ["Bathrooms", [
    ["Full bathroom remodel (use this OR the line items below)", "$2,500 to $10,000", "EACH", (f) => `${f.bathCount} bathroom(s) planned`],
    ["Half bathroom remodel", "$1,000 to $5,000", "EACH"],
    ["Vanity with top", "Labor $150 + material $300 to $1,000", "EACH"],
    ["Tub / shower pan", "Labor $150 + material $200 to $500", "EACH"],
    ["Tub / shower valve and head kit", "Labor $100 + material $75 to $200", "EACH"],
    ["Toilet", "Labor $100 + material $100", "EACH"],
    ["Faucet", "Labor $50 + material $50 to $150", "EACH"],
    ["Exhaust fan", "Get local bids", "EACH"],
  ]],
  ["Plumbing, HVAC and electrical", [
    ["Re-plumb entire property", "$2 to $5 / SF", "SF"],
    ["Water heater", "Labor $150 to $300 + material $350 to $500 (sample rate, verify locally)", "EACH"],
    ["Water line", "$50 to $150 / LF", "LF"],
    ["Gas furnace replacement", "$3,800 to $10,000", "EACH"],
    ["Central AC replacement", "$5,650 to $9,800", "EACH"],
    ["Mini-split, each added zone", "$2,000 to $3,000", "EACH"],
    ["Thermostat", "Labor $50 + material $50 to $250", "EACH"],
    ["Grilles and registers", "Labor $15 + material $15 to $30", "EACH"],
    ["Whole house rewire", "$10,000 to $15,000 typical", "LS"],
    ["Electrical panel, 200 amp", "$2,500 to $4,500", "EACH"],
    ["Light fixtures", "Labor $50 + material $25 to $150", "EACH"],
    ["Ceiling fans", "Labor $75 + material $50 to $300", "EACH"],
  ]],
  ["General and soft costs", [
    ["Permits and inspections", "Get local bids", "LS"],
    ["Dumpster", "Get local bids", "EACH"],
    ["Pest treatment", "Get local bids", "LS"],
    ["Final construction clean", "Get local bids", "LS"],
  ]],
];

export function buildRehab(d) {
  const f = projectFacts(d);
  const capex = d.capex || {};
  const entered = CAPEX_ITEMS.filter(([k]) => num(capex[k]) > 0).map(([k, l]) => [l, num(capex[k])]);
  const enteredTotal = entered.reduce((s, [, v]) => s + v, 0);
  const budget = entered.length ? `
<h2>Your renovation budget from the analyzer</h2>
<table><thead><tr><th>Item</th><th class="num" style="width:22%">Budget</th></tr></thead><tbody>
${entered.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="num">${fmt$(v)}</td></tr>`).join("")}
<tr class="tot"><td>Total in the analyzer</td><td class="num">${fmt$(enteredTotal)}</td></tr>
</tbody></table>
<p class="w">Compare this to your walkthrough total below. If the walkthrough comes in higher, update the renovation numbers in the analyzer so your cash needed and returns stay honest.</p>` : "";
  const sections = REHAB_SECTIONS.map(([title, rows]) => `
<h2>${esc(title)}</h2>
<table><thead><tr><th style="width:24%">Description</th><th style="width:21%">Typical range</th><th style="width:6%">Unit</th><th style="width:7%">Qty</th><th style="width:9%">Labor</th><th style="width:9%">Material</th><th style="width:10%">Total</th><th>Notes</th></tr></thead><tbody>
${rows.map(([desc, range, unit, hint]) => `<tr><td>${esc(desc)}</td><td class="w">${esc(range)}</td><td>${unit}</td><td></td><td></td><td></td><td></td><td class="w">${esc(hint ? hint(f) : "")}</td></tr>`).join("")}
<tr><td class="blank"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr class="tot"><td colspan="6">${esc(title)} total</td><td></td><td></td></tr>
</tbody></table>`).join("");
  const body = `
<div class="tip">Print this and take it to the walkthrough. Write in quantities, then labor and material per unit. Total = quantity x (labor + material). Ranges are national ballparks from 2026 cost guides and Brian's sample sheet. Prices in your market can be very different, so get at least 3 local bids before you commit.</div>
<p class="w">Units: SQ = 100 sq ft of roof, SF = square feet, LF = linear feet, EACH = per item, LS = lump sum, HR = per hour.</p>
${budget}
${sections}
<h2>Estimate summary</h2>
<table><thead><tr><th>Section</th><th class="num" style="width:25%">Total</th></tr></thead><tbody>
${REHAB_SECTIONS.map(([t]) => `<tr><td>${esc(t)}</td><td class="num">$</td></tr>`).join("")}
<tr><td>Subtotal</td><td class="num">$</td></tr>
<tr><td>Contingency for surprises (10% to 15% of subtotal)</td><td class="num">$</td></tr>
<tr class="tot"><td>Total rehab estimate</td><td class="num">$</td></tr>
</tbody></table>
<h2>Notes and sketches</h2>
<div style="border:1px solid #cbd5e1;height:3in;border-radius:4px"></div>`;
  return shell({ title: "Rehab Estimate", fileName: fileName(f, "rehab-estimate"), facts: f, body });
}

function fileName(f, kind) {
  const base = (f.name || "project").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "project";
  return `${base}-${kind}.html`;
}

// Opens the document in a new tab, ready to print. Falls back to a download if the tab is blocked.
export function openPrintable(html, name) {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    const link = document.createElement("a");
    link.href = url; link.download = name || "document.html";
    document.body.appendChild(link); link.click(); link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
