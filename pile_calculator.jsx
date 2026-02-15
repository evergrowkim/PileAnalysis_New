import { useState, useMemo } from "react";

// Reference Data - PHC Pile Specifications (KS F 4306)
const PHC_SPECS = [
  { d: 350, t: 60, Ac: 547, Ic: 59930, wt: 142, types: {
    A: { Qap_tf: 88, Ze: 3508, Ie: 61400, ps: 40 },
    B: { Qap_tf: 66, Ze: 3614, Ie: 63240, ps: 80 },
    C: { Qap_tf: 55, Ze: 3655, Ie: 63960, ps: 100 } } },
  { d: 400, t: 65, Ac: 684, Ic: 99580, wt: 178, types: {
    A: { Qap_tf: 109, Ze: 5104, Ie: 102100, ps: 40 },
    B: { Qap_tf: 82, Ze: 5229, Ie: 104600, ps: 80 },
    C: { Qap_tf: 68, Ze: 5327, Ie: 106500, ps: 100 } } },
  { d: 450, t: 70, Ac: 836, Ic: 156000, wt: 217, types: {
    A: { Qap_tf: 68, Ze: 7121, Ie: 160200, ps: 40 },
    B: { Qap_tf: 100, Ze: 7310, Ie: 164500, ps: 80 },
    C: { Qap_tf: 84, Ze: 7437, Ie: 167300, ps: 100 } } },
  { d: 500, t: 80, Ac: 1056, Ic: 241200, wt: 274, types: {
    A: { Qap_tf: 169, Ze: 9914, Ie: 247900, ps: 40 },
    B: { Qap_tf: 127, Ze: 10180, Ie: 254500, ps: 80 },
    C: { Qap_tf: 106, Ze: 10360, Ie: 258900, ps: 100 } } },
  { d: 600, t: 90, Ac: 1442, Ic: 483400, wt: 375, types: {
    A: { Qap_tf: 231, Ze: 16560, Ie: 496900, ps: 40 },
    B: { Qap_tf: 173, Ze: 17010, Ie: 570400, ps: 80 },
    C: { Qap_tf: 144, Ze: 17330, Ie: 519800, ps: 100 } } },
];

// Reference Data - Steel Pipe Pile Specifications (corrosion-deducted)
const STEEL_SPECS = [
  { d: 406.4, options: [
    { t: 9, W: 88.2, Ap: 112.4, I: 22200, Z: 1090, K: 14.0, Qap: 1131 },
    { t: 10, W: 97.8, Ap: 124.5, I: 24500, Z: 1200, K: 14.0, Qap: 1426 },
    { t: 12, W: 117.0, Ap: 148.7, I: 28900, Z: 1420, K: 14.0, Qap: 1823 } ] },
  { d: 508.0, options: [
    { t: 9, W: 111.0, Ap: 141.1, I: 43900, Z: 1730, K: 17.6, Qap: 1520 },
    { t: 10, W: 123.0, Ap: 156.5, I: 48500, Z: 1910, K: 17.6, Qap: 1754 },
    { t: 12, W: 147.0, Ap: 187.0, I: 57500, Z: 2270, K: 17.5, Qap: 2233 } ] },
  { d: 609.6, options: [
    { t: 9, W: 133.0, Ap: 169.8, I: 76600, Z: 2510, K: 21.2, Qap: 1808 },
    { t: 10, W: 148.0, Ap: 188.4, I: 84700, Z: 2780, K: 21.2, Qap: 2082 },
    { t: 12, W: 177.0, Ap: 225.3, I: 101000, Z: 3300, K: 21.1, Qap: 2642 } ] },
];

const SLENDERNESS = { PHC: { n: 85 }, "강관": { n: 100 } };
const SOIL_OPTS = ["성토층","전답토(CL)","퇴적층(SM)","퇴적층(CL)","퇴적층(SP)","풍화토(SM)","풍화토(CL)","풍화암(WR)","연암(SR)","경암(HR)","자갈층(GP)","모래층(SP)","실트층(ML)"];
const SOIL_CLS = {"성토층":"sand","전답토(CL)":"clay","퇴적층(SM)":"sand","퇴적층(CL)":"clay","퇴적층(SP)":"sand","풍화토(SM)":"sand","풍화토(CL)":"clay","풍화암(WR)":"sand","연암(SR)":"rock","경암(HR)":"rock","자갈층(GP)":"sand","모래층(SP)":"sand","실트층(ML)":"clay"};
const UW_DEF = {"성토층":18,"전답토(CL)":16,"퇴적층(SM)":18,"퇴적층(CL)":17,"퇴적층(SP)":18,"풍화토(SM)":19,"풍화토(CL)":18,"풍화암(WR)":20,"연암(SR)":22,"경암(HR)":24,"자갈층(GP)":19,"모래층(SP)":18,"실트층(ML)":17};

// Calculation Engine
function calcPile(p) {
  const isPHC = p.pileType === "PHC";
  const D = p.diameter_mm / 1000, t = p.thickness_mm / 1000;
  const pileLength = p.pileTopEL - p.bearingEL;
  const cutFillDepth = p.pileTopEL - p.groundEL;
  const gwlEL = p.groundEL - p.gwlDepth;

  let Ap_tip, Ap_net, I, Zp, E, Qap, n_slender, W_unit, At_steel = 0, Ai_steel = 0, steelSpec = null;

  if (isPHC) {
    const row = PHC_SPECS.find(r => r.d === p.diameter_mm);
    Ap_tip = Math.PI / 4 * D * D;
    if (row) {
      Ap_net = row.Ac / 10000;
      I = row.Ic / 1e8;
      const td = row.types[p.phcGrade || "A"];
      Zp = td.Ze / 1e6;
      Qap = td.Qap_tf * 9.80665;
    } else {
      Ap_net = Math.PI / 4 * (D * D - Math.pow(D - 2 * t, 2));
      I = Math.PI / 64 * (Math.pow(D, 4) - Math.pow(D - 2 * t, 4));
      Zp = I / (D / 2);
      Qap = 1650;
    }
    E = 39200000; n_slender = 85;
    W_unit = Ap_net * 24;
  } else {
    const corr = (p.corrosionThickness_mm || 2) / 1000;
    const dRow = STEEL_SPECS.find(r => r.d === p.diameter_mm);
    steelSpec = dRow ? dRow.options.find(o => o.t === p.thickness_mm) : null;
    Ap_tip = Math.PI / 4 * D * D;
    At_steel = Math.PI / 4 * (D * D - Math.pow(D - 2 * (t - corr), 2));
    Ai_steel = Math.PI / 4 * Math.pow(D - 2 * t, 2);
    if (steelSpec) {
      Ap_net = steelSpec.Ap / 10000;
      I = steelSpec.I / 1e8;
      Zp = steelSpec.Z / 1e6;
      Qap = steelSpec.Qap;
      W_unit = steelSpec.W * 9.80665 / 1000;
    } else {
      Ap_net = Math.PI / 4 * (D * D - Math.pow(D - 2 * t, 2));
      I = Math.PI / 64 * (Math.pow(D, 4) - Math.pow(D - 2 * t, 4));
      Zp = I / (D / 2);
      Qap = Ap_net * 235000 / 3;
      W_unit = Ap_net * 78.5;
    }
    E = 210000000; n_slender = 100;
  }

  const U = Math.PI * D, EI = E * I;

  // 2.1.1 Material
  const L_over_d = pileLength / D;
  const mu1 = L_over_d > n_slender ? Math.min((L_over_d / n_slender - 1) * 100, 30) : 0;
  const jc = p.jointCount || 0;
  let mu2 = 0;
  if (jc > 0) {
    const jt = p.jointType || "welding";
    if (jt === "welding") mu2 = jc * 5;
    else if (jt === "bolt") mu2 = jc * 10;
    else mu2 = Math.min(jc, 2) * 20 + Math.max(jc - 2, 0) * 30;
  }
  const Qp_material = (1 - (mu1 + mu2) / 100) * Qap;

  // Layers
  const processedLayers = [];
  if (p.layers) p.layers.forEach(layer => {
    const sc = SOIL_CLS[layer.soilType] || "sand";
    const As_i = U * layer.thickness;
    const cN = Math.min(layer.avgN, 30);
    processedLayers.push({ ...layer, soilClass: sc, As: As_i,
      skinFriction_sand: sc === "sand" ? 2 * cN * As_i : 0,
      skinFriction_clay: sc === "clay" ? 6.25 * cN * As_i : 0 });
  });

  const sum_2NsAs = processedLayers.reduce((s, l) => s + l.skinFriction_sand, 0);
  const sum_625NcAc = processedLayers.reduce((s, l) => s + l.skinFriction_clay, 0);
  const tipSPT = p.sptData && p.sptData.length > 0 ? p.sptData[p.sptData.length - 1] : { N: 50 };
  const N_tip = Math.min(tipSPT.N, 50);

  let Pu_tip, Pu_goodman = null, Pu_canadian = null, Pu_selected, rockCalcDetails = null;
  const method = p.bearingMethod || (isPHC ? "meyerhof" : "rock");

  if (!isPHC && method === "rock") {
    const qu_eff = Math.min(p.qu_kPa || 10000, 10000);
    const qu_lab = p.qu_kPa || 32460;
    Pu_tip = 443 * Math.pow(qu_eff, 0.5) * Math.pow(At_steel, 2 / 5) * Math.pow(Ai_steel, 1 / 3);
    const phi_rock = p.rockPhi_deg || 35;
    const N_phi = Math.pow(Math.tan((45 + phi_rock / 2) * Math.PI / 180), 2);
    const Ap_full = Math.PI / 4 * D * D;
    Pu_goodman = qu_lab * (N_phi + 1) * Ap_full;
    const Sd = p.Sd_m || 0.15, td = p.td_m || 0.002;
    const Ksp = (3 + Sd / D) / (10 * Math.sqrt(1 + 300 * td / Sd));
    Pu_canadian = 3 * qu_lab * Ksp * 2 * Ap_full;
    Pu_selected = Math.min(Pu_tip, Pu_goodman, Pu_canadian);
    rockCalcDetails = { qu_eff, qu_lab, At_m2: At_steel, Ai_m2: Ai_steel, Pu_tip, phi_rock, N_phi, Ap_full, Pu_goodman, Sd, td, Ksp, Pu_canadian, Pu_selected };
  } else {
    Pu_selected = 250 * N_tip * Ap_tip;
    Pu_tip = Pu_selected;
  }

  const Qu = Pu_selected + sum_2NsAs + sum_625NcAc;
  const Qu_tip = Pu_selected, Qu_skin = sum_2NsAs + sum_625NcAc;
  const FS = 3, Qa_ground = Qu / FS;
  const Qa_applied = Math.min(Qp_material, Qa_ground);

  // 2.2 Horizontal
  const topN = p.sptData && p.sptData.length > 0 ? p.sptData.filter(s => s.N < 50).reduce((s, d) => s + d.N, 0) / Math.max(p.sptData.filter(s => s.N < 50).length, 1) : 10;
  const N_kh = Math.max(topN, 1);
  const a = p.alpha_kh || 1;
  const Eo2800 = 2800 * N_kh, Eo1000 = 1000 * N_kh;
  const Kh1 = 1.208 * Math.pow(a * Eo2800, 1.1) * Math.pow(D, -0.31) * Math.pow(EI, -0.1);
  const Kh2 = 6910 * Math.pow(N_kh, 0.406);
  const Kh3 = 2000 * N_kh;
  const Kh4 = 1.208 * Math.pow(a * Eo1000, 1.1) * Math.pow(D, -0.31) * Math.pow(EI, -0.1);
  const Kh_min = Math.min(Kh1, Kh2, Kh3, Kh4);

  const beta = Math.pow((Kh_min * D) / (4 * EI), 0.25);
  const nh = Kh_min * D / (1 / beta);
  const eta = Math.pow(nh / EI, 0.2);
  const etaL = eta * pileLength;
  const pileClass = etaL < 2 ? "짧은말뚝" : etaL <= 4 ? "중간말뚝" : "긴말뚝";
  const phi_deg = Math.sqrt(12 * N_kh) + 15;
  const phi_rad = phi_deg * Math.PI / 180;
  const Kp = (1 + Math.sin(phi_rad)) / (1 - Math.sin(phi_rad));
  const gamma_top = p.layers && p.layers.length > 0 ? p.layers[0].unitWeight : 18;
  const deltaM = (p.delta_cm || 1.5) / 100;

  const H_disp = 4 * Math.pow(beta, 3) * EI * deltaM;
  const My_case1 = H_disp / (2 * beta);
  let Hu_brom1;
  if (pileClass === "긴말뚝") { const term = My_case1 / (Kp * gamma_top * Math.pow(D, 4)); Hu_brom1 = 2.38 * Math.pow(term, 2 / 3) * Kp * gamma_top * Math.pow(D, 3); }
  else if (pileClass === "짧은말뚝") { Hu_brom1 = 1.5 * Kp * gamma_top * D * pileLength * pileLength; }
  else { const term = My_case1 / (Kp * Math.pow(D, 4) * gamma_top); Hu_brom1 = Kp * Math.pow(D, 3) * gamma_top * (term + 0.5 * Math.pow(pileLength / D, 3)) * (D / pileLength); }
  const Ha_brom1 = Hu_brom1 / 2.5;

  const sigma_max = p.sigmaMax_kN || (isPHC ? 20000 : 235000);
  const My_case2 = Zp * sigma_max;
  let Hu_brom2;
  if (pileClass === "긴말뚝") { const t2 = My_case2 / (Kp * gamma_top * Math.pow(D, 4)); Hu_brom2 = 2.38 * Math.pow(t2, 2 / 3) * Kp * gamma_top * Math.pow(D, 3); }
  else { Hu_brom2 = Hu_brom1; }
  const Ha_brom2 = Hu_brom2 / 2.5;
  const Ha_brom = Math.min(Ha_brom1, Ha_brom2);
  const Ha_chang = deltaM * Kh_min * D / beta;
  const Ha_applied = Math.min(Ha_brom, Ha_chang);

  // Pull-out
  const l1 = Math.max(p.pileTopEL - gwlEL, 0);
  const l2 = pileLength - l1;
  const Wp = W_unit * pileLength - (l2 > 0 ? Ap_tip * l2 * 10 : 0);
  const Qpull = Qu_skin / FS + Math.max(Wp, 0);

  // Settlement
  const ratio_tip = Qu_tip / Math.max(Qu, 1);
  const Qps = Qa_applied * ratio_tip, Qfs = Qa_applied * (1 - ratio_tip);
  const Ss = (Qps + 0.67 * Qfs) * (pileLength * 1000) / (Ap_net * E);
  const Cp = 0.09;
  const qp = Qu_tip / Math.max(Ap_tip, 0.001);
  const Sp = (Qps * Cp) / (D * Math.max(qp, 1)) * 1000;
  const Cs = (0.93 + 0.16 * Math.sqrt(pileLength / D)) * Cp;
  const Sps = (Qfs * Cs) / (pileLength * Math.max(qp, 1)) * 1000;
  const St = Ss + Sp + Sps;

  return { D, t, pileLength, cutFillDepth, gwlEL, U, Ap_tip, Ap_net, I, Zp, E, EI, W_unit,
    L_over_d, mu1, mu2, Qap, Qp_material, n_slender,
    N_tip, Qu, Qu_tip, Qu_skin, Qa_ground, FS, sum_2NsAs, sum_625NcAc, processedLayers, Qa_applied,
    At_steel, Ai_steel, steelSpec, rockCalcDetails, method, Pu_tip, Pu_goodman, Pu_canadian, Pu_selected,
    N_kh: Math.round(N_kh * 100) / 100, Eo2800, Eo1000,
    Kh1, Kh2, Kh3, Kh4, Kh_min,
    beta, betaL: beta * pileLength, eta, etaL, pileClass,
    phi_deg, Kp, gamma_top,
    H_disp, My_case1, Hu_brom1, Ha_brom1, My_case2, Hu_brom2, Ha_brom2, Ha_brom, Ha_chang, Ha_applied,
    l1, l2, Wp, Qpull, ratio_tip, Qps, Qfs, Ss, Sp, Sps, St, Cp, Cs, qp };
}

const fmt = (v, d = 2) => v != null && !isNaN(v) ? Number(v).toFixed(d) : "-";
const fmtE = v => v != null ? v.toExponential(3) : "-";

const C = { bg: "#f4f5f7", dark: "#1a1a2e", navy: "#0f3460", accent: "#e94560", green: "#16a34a", steel: "#3b82f6", border: "#d1d5db" };

function Field({ label, value, onChange, unit, type = "number", options, disabled }) {
  const lb = { fontSize: 10, fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: ".3px" };
  const inp = { padding: "6px 8px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", outline: "none" };
  const sel = { ...inp, background: "#fff" };
  if (options) return (<div style={{ display: "flex", flexDirection: "column", gap: 3 }}><label style={lb}>{label}</label><select style={sel} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>{options.map(o => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</option>)}</select></div>);
  return (<div style={{ display: "flex", flexDirection: "column", gap: 3 }}><label style={lb}>{label}{unit ? ` (${unit})` : ""}</label><input type={type} style={inp} value={value} step="any" disabled={disabled} onChange={e => onChange(type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)} /></div>);
}

function CL({ label, formula, value, unit }) {
  return (<div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#f8f9fc", borderRadius: 4, marginBottom: 4, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, flexWrap: "wrap" }}>
    <span style={{ fontWeight: 600, color: C.navy, minWidth: 50 }}>{label}</span>
    {formula && <span style={{ color: "#555" }}> = {formula}</span>}
    <span style={{ margin: "0 3px" }}>=</span>
    <span style={{ color: C.accent, fontWeight: 700 }}>{value}</span>
    {unit && <span style={{ color: "#888", fontSize: 10 }}>{unit}</span>}
  </div>);
}

const G = n => ({ display: "grid", gridTemplateColumns: `repeat(${n},1fr)`, gap: 10 });
const Sec = ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 700, color: C.navy, borderLeft: `3px solid ${C.accent}`, paddingLeft: 10, margin: "18px 0 10px" }}>{children}</h3>;
const RB = ({ ok, label, value }) => (<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 13px", background: ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${ok ? "#86efac" : "#fca5a5"}`, borderRadius: 6, marginTop: 8 }}>
  <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
  <span style={{ fontSize: 16, fontWeight: 800, color: ok ? "#15803d" : "#dc2626", fontFamily: "'JetBrains Mono',monospace" }}>{value}</span>
</div>);
const Fm = ({ children }) => <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, padding: "7px 11px", background: "#f1f5f9", borderRadius: 4, border: "1px solid #e2e8f0", marginBottom: 5, lineHeight: 1.4 }}>{children}</div>;
const Tag = ({ isPHC }) => <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: isPHC ? "#fef3c7" : "#dbeafe", color: isPHC ? "#92400e" : "#1d4ed8", marginLeft: 6 }}>{isPHC ? "PHC" : "Steel"}</span>;
const Bd = ({ type }) => <span style={{ padding: "2px 6px", borderRadius: 8, fontSize: 9, fontWeight: 700, background: type === "clay" ? "#dbeafe" : type === "rock" ? "#fef3c7" : "#dcfce7", color: type === "clay" ? "#1d4ed8" : type === "rock" ? "#92400e" : "#15803d" }}>{type}</span>;
const Btn = (props) => <button {...props} style={{ padding: "6px 13px", background: C.navy, color: "#fff", border: "none", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer", ...(props.style || {}) }} />;
const BtnD = (props) => <button {...props} style={{ padding: "4px 8px", background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 4, fontSize: 10, cursor: "pointer", ...(props.style || {}) }} />;

const th = { background: C.dark, color: "#fff", padding: "6px 7px", textAlign: "center", fontWeight: 600, fontSize: 10, whiteSpace: "nowrap" };
const td = { padding: "5px 7px", borderBottom: "1px solid #eee", textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontSize: 11 };
const tdL = { ...td, textAlign: "left" };
const tbl = { width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 5 };

export default function PileCalculator() {
  const [tab, setTab] = useState(0);
  const [pileType, setPileType] = useState("PHC");
  const [diameter_mm, setDiameter] = useState(500);
  const [thickness_mm, setThickness] = useState(80);
  const [phcGrade, setPhcGrade] = useState("A");
  const [pileTopEL, setPileTopEL] = useState(130);
  const [groundEL, setGroundEL] = useState(127.38);
  const [bearingEL, setBearingEL] = useState(119.98);
  const [gwlDepth, setGwlDepth] = useState(3.75);
  const [boreholeNo, setBoreholeNo] = useState("NBH-03");
  const [alpha_kh, setAlphaKh] = useState(1);
  const [delta_cm, setDeltaCm] = useState(1.5);
  const [sigmaMax, setSigmaMax] = useState(20000);
  const [bearingMethod, setBearingMethod] = useState("meyerhof");
  const [corrosionThk, setCorrosionThk] = useState(2);
  const [qu_kPa, setQu] = useState(32460);
  const [Sd_m, setSd] = useState(0.15);
  const [td_m, setTd] = useState(0.002);
  const [rockPhi, setRockPhi] = useState(35);
  const [jointCount, setJointCount] = useState(1);
  const [jointType, setJointType] = useState("welding");

  const [sptData, setSptData] = useState([
    { depth: 1, N: 10, remark: "성토층" }, { depth: 2, N: 10, remark: "성토층" },
    { depth: 3.62, N: 19, remark: "퇴적층(SM)" }, { depth: 4.62, N: 7, remark: "퇴적층(SM)" },
    { depth: 5.62, N: 6, remark: "퇴적층(SM)" }, { depth: 6.62, N: 7, remark: "퇴적층(SM)" },
    { depth: 7.62, N: 43, remark: "풍화토(SM)" }, { depth: 8.62, N: 50, remark: "풍화토(SM)" },
    { depth: 9.62, N: 50, remark: "풍화암(WR)" },
  ]);
  const [layers, setLayers] = useState([
    { soilType: "성토층", thickness: 2.62, avgN: 10, unitWeight: 18 },
    { soilType: "전답토(CL)", thickness: 0.5, avgN: 19, unitWeight: 16 },
    { soilType: "퇴적층(SM)", thickness: 4, avgN: 9.75, unitWeight: 18 },
    { soilType: "풍화토(SM)", thickness: 1.9, avgN: 30, unitWeight: 19 },
    { soilType: "풍화암(WR)", thickness: 1, avgN: 30, unitWeight: 20 },
  ]);

  const isPHC = pileType === "PHC";
  const handlePileTypeChange = v => {
    setPileType(v);
    if (v === "PHC") { setDiameter(500); setThickness(80); setBearingMethod("meyerhof"); setSigmaMax(20000); }
    else { setDiameter(609.6); setThickness(12); setBearingMethod("rock"); setSigmaMax(235000); }
  };
  const getDiamOpts = () => isPHC ? PHC_SPECS.map(r => ({ value: r.d, label: `${r.d} mm` })) : STEEL_SPECS.map(r => ({ value: r.d, label: `${r.d} mm` }));
  const getThkOpts = () => {
    if (isPHC) { const r = PHC_SPECS.find(r => r.d === diameter_mm); return r ? [{ value: r.t, label: `${r.t} mm` }] : [{ value: thickness_mm, label: `${thickness_mm} mm` }]; }
    const r = STEEL_SPECS.find(r => r.d === diameter_mm);
    return r ? r.options.map(o => ({ value: o.t, label: `${o.t} mm` })) : [{ value: thickness_mm, label: `${thickness_mm} mm` }];
  };
  const handleDiamChange = v => {
    const d = parseFloat(v); setDiameter(d);
    if (isPHC) { const r = PHC_SPECS.find(r => r.d === d); if (r) setThickness(r.t); }
    else { const r = STEEL_SPECS.find(r => r.d === d); if (r?.options.length) setThickness(r.options[r.options.length - 1].t); }
  };

  const curSpec = useMemo(() => {
    if (isPHC) { const r = PHC_SPECS.find(r => r.d === diameter_mm); if (!r) return null; const t = r.types[phcGrade || "A"]; return { Ac: r.Ac, Ic: r.Ic, wt: r.wt, Qap_tf: t.Qap_tf, Qap_kN: (t.Qap_tf * 9.80665).toFixed(1), Ze: t.Ze }; }
    const dr = STEEL_SPECS.find(r => r.d === diameter_mm); return dr ? dr.options.find(o => o.t === thickness_mm) : null;
  }, [isPHC, diameter_mm, thickness_mm, phcGrade]);

  const result = useMemo(() => {
    try { return calcPile({ pileType, diameter_mm, thickness_mm, phcGrade, pileTopEL, groundEL, bearingEL, gwlDepth, sptData, layers, alpha_kh, delta_cm, sigmaMax_kN: sigmaMax, corrosionThickness_mm: corrosionThk, qu_kPa, Sd_m, td_m, rockPhi_deg: rockPhi, bearingMethod, jointCount, jointType }); }
    catch (e) { console.error(e); return null; }
  }, [pileType, diameter_mm, thickness_mm, phcGrade, pileTopEL, groundEL, bearingEL, gwlDepth, sptData, layers, alpha_kh, delta_cm, sigmaMax, corrosionThk, qu_kPa, Sd_m, td_m, rockPhi, bearingMethod, jointCount, jointType]);

  const loadSteel = () => { setPileType("강관"); setDiameter(609.6); setThickness(12); setBoreholeNo("NBH-09"); setGroundEL(125.19); setBearingEL(112.19); setPileTopEL(130); setGwlDepth(1.7); setBearingMethod("rock"); setSigmaMax(235000); setCorrosionThk(2); setQu(32460); setSd(0.15); setTd(0.002); setRockPhi(35); setJointCount(1); setJointType("welding");
    setSptData([{depth:1,N:10,remark:"성토층"},{depth:2,N:10,remark:"성토층"},{depth:3,N:10,remark:"성토층"},{depth:4,N:10,remark:"성토층"},{depth:5,N:6,remark:"퇴적층(SM)"},{depth:6,N:9,remark:"퇴적층(SM)"},{depth:7,N:22,remark:"퇴적층(SM)"},{depth:8,N:28,remark:"퇴적층(SM)"},{depth:9,N:50,remark:"풍화토(SM)"},{depth:10,N:50,remark:"풍화토(SM)"},{depth:11,N:50,remark:"풍화토(SM)"},{depth:12,N:50,remark:"풍화토(SM)"},{depth:13,N:50,remark:"풍화토(SM)"},{depth:14,N:50,remark:"풍화암(WR)"},{depth:15,N:50,remark:"풍화암(WR)"},{depth:16,N:50,remark:"연암(SR)"}]);
    setLayers([{soilType:"성토층",thickness:4.81,avgN:10,unitWeight:18},{soilType:"전답토(CL)",thickness:0.6,avgN:6,unitWeight:16},{soilType:"퇴적층(SM)",thickness:1.9,avgN:7.5,unitWeight:18},{soilType:"퇴적층(SP)",thickness:2,avgN:25,unitWeight:18},{soilType:"풍화토(SM)",thickness:5.5,avgN:50,unitWeight:19},{soilType:"풍화암(WR)",thickness:2,avgN:50,unitWeight:20},{soilType:"연암(SR)",thickness:1,avgN:50,unitWeight:23}]); };
  const loadPHC = () => { setPileType("PHC"); setDiameter(500); setThickness(80); setPhcGrade("A"); setBoreholeNo("NBH-03"); setGroundEL(127.38); setBearingEL(119.98); setPileTopEL(130); setGwlDepth(3.75); setBearingMethod("meyerhof"); setSigmaMax(20000);
    setSptData([{depth:1,N:10,remark:"성토층"},{depth:2,N:10,remark:"성토층"},{depth:3.62,N:19,remark:"퇴적층(SM)"},{depth:4.62,N:7,remark:"퇴적층(SM)"},{depth:5.62,N:6,remark:"퇴적층(SM)"},{depth:6.62,N:7,remark:"퇴적층(SM)"},{depth:7.62,N:43,remark:"풍화토(SM)"},{depth:8.62,N:50,remark:"풍화토(SM)"},{depth:9.62,N:50,remark:"풍화암(WR)"}]);
    setLayers([{soilType:"성토층",thickness:2.62,avgN:10,unitWeight:18},{soilType:"전답토(CL)",thickness:0.5,avgN:19,unitWeight:16},{soilType:"퇴적층(SM)",thickness:4,avgN:9.75,unitWeight:18},{soilType:"풍화토(SM)",thickness:1.9,avgN:30,unitWeight:19},{soilType:"풍화암(WR)",thickness:1,avgN:30,unitWeight:20}]); };

  const tabs = ["Input", "Vertical", "Horizontal", "Pull-out", "Settlement", "Summary"];
  const r = result;

  return (
    <div style={{ fontFamily: "'Pretendard','Noto Sans KR',-apple-system,sans-serif", background: C.bg, minHeight: "100vh", color: "#1a1a2e" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ background: `linear-gradient(135deg,${C.dark},#16213e,${C.navy})`, color: "#fff", padding: "16px 24px", borderBottom: `3px solid ${C.accent}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Pile Foundation Calculator<Tag isPHC={isPHC} /></h1><p style={{ fontSize: 10.5, color: "#a8b2d1", marginTop: 3 }}>KDS 11 50 40 / Foundation Design Standards 2018 / Road Bridge 2008</p></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: "#a8b2d1" }}>Borehole</div><div style={{ fontSize: 14, fontWeight: 700, color: C.accent }}>{boreholeNo}</div></div>
        </div>
      </div>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "14px 18px" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
          <Btn onClick={loadPHC} style={{ background: "#fef3c7", color: "#92400e", fontSize: 10 }}>PHC Sample (NBH-03)</Btn>
          <Btn onClick={loadSteel} style={{ background: "#dbeafe", color: "#1d4ed8", fontSize: 10 }}>Steel Sample (NBH-09)</Btn>
        </div>
        <div style={{ display: "flex", gap: 2, background: "#e2e4e9", borderRadius: "8px 8px 0 0", overflow: "hidden", marginTop: 10 }}>
          {tabs.map((t, i) => <button key={t} style={{ padding: "8px 14px", fontSize: 11.5, fontWeight: tab === i ? 700 : 500, background: tab === i ? "#fff" : "transparent", color: tab === i ? C.navy : "#666", border: "none", cursor: "pointer", borderBottom: tab === i ? `2px solid ${C.accent}` : "2px solid transparent" }} onClick={() => setTab(i)}>{t}</button>)}
        </div>
        <div style={{ background: "#fff", borderRadius: "0 0 8px 8px", padding: "18px 22px", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>

          {/* INPUT */}
          {tab === 0 && <div>
            <Sec>1. Design Specifications (설계제원)</Sec>
            <div style={G(4)}>
              <Field label="Borehole No." value={boreholeNo} onChange={setBoreholeNo} type="text" />
              <Field label="Pile Type" value={pileType} onChange={handlePileTypeChange} options={[{value:"PHC",label:"PHC"},{value:"강관",label:"Steel Pipe (강관)"}]} />
              <Field label="Diameter" value={diameter_mm} onChange={handleDiamChange} options={getDiamOpts()} />
              <Field label="Thickness" value={thickness_mm} onChange={v=>setThickness(parseFloat(v))} options={getThkOpts()} />
            </div>
            {isPHC && <div style={{...G(4),marginTop:8}}><Field label="PHC Grade" value={phcGrade} onChange={setPhcGrade} options={["A","B","C"]} /></div>}
            {!isPHC && <div style={{...G(4),marginTop:8}}>
              <Field label="Corrosion (부식)" value={corrosionThk} onChange={setCorrosionThk} unit="mm" />
              <Field label="Joint Count" value={jointCount} onChange={v=>setJointCount(parseInt(v)||0)} />
              <Field label="Joint Type" value={jointType} onChange={setJointType} options={[{value:"welding",label:"Welding"},{value:"bolt",label:"Bolt"},{value:"fill",label:"Fill"}]} />
              <Field label="Bearing Method" value={bearingMethod} onChange={setBearingMethod} options={[{value:"rock",label:"Rock (암반근입)"},{value:"meyerhof",label:"Meyerhof (토사)"}]} />
            </div>}
            {!isPHC && bearingMethod === "rock" && <div style={{...G(4),marginTop:8,padding:9,background:"#eff6ff",borderRadius:5,border:"1px solid #bfdbfe"}}>
              <Field label="qu (일축압축강도)" value={qu_kPa} onChange={setQu} unit="kPa" />
              <Field label="Sd (불연속면간격)" value={Sd_m} onChange={setSd} unit="m" />
              <Field label="td (불연속면폭)" value={td_m} onChange={setTd} unit="m" />
              <Field label="Rock Phi" value={rockPhi} onChange={setRockPhi} unit="deg" />
            </div>}
            <div style={{...G(4),marginTop:8}}>
              <Field label="Pile Top EL." value={pileTopEL} onChange={setPileTopEL} unit="EL,m" />
              <Field label="Ground EL." value={groundEL} onChange={setGroundEL} unit="EL,m" />
              <Field label="Bearing EL." value={bearingEL} onChange={setBearingEL} unit="EL,m" />
              <Field label="GWL Depth" value={gwlDepth} onChange={setGwlDepth} unit="GL,m" />
            </div>
            <div style={{...G(3),marginTop:8}}>
              <Field label="alpha (Kh)" value={alpha_kh} onChange={setAlphaKh} />
              <Field label="Allowable Disp." value={delta_cm} onChange={setDeltaCm} unit="cm" />
              <Field label={isPHC?"sigma_max":"Yield Stress"} value={sigmaMax} onChange={setSigmaMax} unit="kN/m2" />
            </div>
            {curSpec && <div style={{marginTop:10,padding:10,background:isPHC?"#fffbeb":"#eff6ff",borderRadius:5,border:`1px solid ${isPHC?"#fde68a":"#bfdbfe"}`}}>
              <div style={{fontSize:10.5,fontWeight:700,color:isPHC?"#92400e":"#1d4ed8",marginBottom:5}}>
                {isPHC?`PHC ${phcGrade} D${diameter_mm}x${thickness_mm}t Specs`:`Steel D${diameter_mm}x${thickness_mm}t Specs`}
              </div>
              <div style={G(isPHC?4:5)}>
                {isPHC ? <><div style={{fontSize:10.5}}>Ac: <strong>{curSpec.Ac} cm2</strong></div><div style={{fontSize:10.5}}>Ic: <strong>{curSpec.Ic} cm4</strong></div><div style={{fontSize:10.5}}>Qap: <strong>{curSpec.Qap_kN} kN</strong></div><div style={{fontSize:10.5}}>Wt: <strong>{curSpec.wt} kg/m</strong></div></> : <><div style={{fontSize:10.5}}>Ap: <strong>{curSpec.Ap} cm2</strong></div><div style={{fontSize:10.5}}>I: <strong>{curSpec.I} cm4</strong></div><div style={{fontSize:10.5}}>Z: <strong>{curSpec.Z} cm3</strong></div><div style={{fontSize:10.5}}>Qap: <strong style={{color:"#1d4ed8"}}>{curSpec.Qap} kN</strong></div><div style={{fontSize:10.5}}>W: <strong>{curSpec.W} kgf/m</strong></div></>}
              </div>
            </div>}
            {r && <div style={{...G(3),marginTop:10,padding:9,background:"#f8f9fc",borderRadius:5}}>
              <div style={{fontSize:11}}>Length: <strong style={{color:C.navy}}>{fmt(r.pileLength)} m</strong></div>
              <div style={{fontSize:11}}>Ap(tip): <strong style={{color:C.navy}}>{fmt(r.Ap_tip,4)} m2</strong></div>
              <div style={{fontSize:11}}>EI: <strong style={{color:C.navy}}>{fmt(r.EI,1)} kN-m2</strong></div>
              <div style={{fontSize:11}}>E: <strong style={{color:C.navy}}>{(r.E/1e6).toFixed(0)} MPa</strong></div>
              <div style={{fontSize:11}}>I: <strong style={{color:C.navy}}>{fmtE(r.I)} m4</strong></div>
              <div style={{fontSize:11}}>U: <strong style={{color:C.navy}}>{fmt(r.U,4)} m</strong></div>
              {!isPHC && r.At_steel>0 && <><div style={{fontSize:11}}>At: <strong style={{color:C.steel}}>{fmt(r.At_steel,6)} m2</strong></div><div style={{fontSize:11}}>Ai: <strong style={{color:C.steel}}>{fmt(r.Ai_steel,6)} m2</strong></div></>}
            </div>}
            <Sec>2. SPT N-value</Sec>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}><span style={{fontSize:11,fontWeight:600,color:"#555"}}>SPT Data</span><Btn onClick={()=>setSptData([...sptData,{depth:(sptData[sptData.length-1]?.depth||0)+1,N:10,remark:"퇴적층(SM)"}])}>+ Add</Btn></div>
            <div style={{overflowX:"auto"}}><table style={tbl}><thead><tr><th style={th}>No.</th><th style={th}>EL.+</th><th style={th}>Depth</th><th style={th}>N</th><th style={th}>Remark</th><th style={th}></th></tr></thead><tbody>
              {sptData.map((s,i)=>(<tr key={i} style={{background:i%2===0?"#fff":"#fafbfc"}}><td style={td}>{i+1}</td><td style={td}>{fmt(groundEL-s.depth+1)}</td><td style={td}><input type="number" value={s.depth} style={{padding:"4px 6px",border:`1px solid ${C.border}`,borderRadius:3,width:50,textAlign:"center",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}} onChange={e=>{const n=[...sptData];n[i]={...n[i],depth:parseFloat(e.target.value)||0};setSptData(n);}}/></td><td style={td}><input type="number" value={s.N} style={{padding:"4px 6px",border:`1px solid ${C.border}`,borderRadius:3,width:50,textAlign:"center",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}} onChange={e=>{const n=[...sptData];n[i]={...n[i],N:parseInt(e.target.value)||0};setSptData(n);}}/></td><td style={td}><select value={s.remark} style={{padding:"3px 5px",border:`1px solid ${C.border}`,borderRadius:3,fontSize:10}} onChange={e=>{const n=[...sptData];n[i]={...n[i],remark:e.target.value};setSptData(n);}}>{SOIL_OPTS.map(o=><option key={o} value={o}>{o}</option>)}</select></td><td style={td}><BtnD onClick={()=>setSptData(sptData.filter((_,j)=>j!==i))}>Del</BtnD></td></tr>))}
            </tbody></table></div>
            <Sec>3. Averaged Layers</Sec>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}><span style={{fontSize:11,fontWeight:600,color:"#555"}}>Layers</span><Btn onClick={()=>setLayers([...layers,{soilType:"퇴적층(SM)",thickness:2,avgN:10,unitWeight:18}])}>+ Add</Btn></div>
            <table style={tbl}><thead><tr><th style={th}>Soil Type</th><th style={th}>L(m)</th><th style={th}>Avg N</th><th style={th}>Unit Wt.</th><th style={th}>Class</th><th style={th}></th></tr></thead><tbody>
              {layers.map((l,i)=>(<tr key={i} style={{background:i%2===0?"#fff":"#fafbfc"}}><td style={td}><select value={l.soilType} style={{padding:"3px 5px",border:`1px solid ${C.border}`,borderRadius:3,fontSize:10}} onChange={e=>{const n=[...layers];n[i]={...n[i],soilType:e.target.value,unitWeight:UW_DEF[e.target.value]||18};setLayers(n);}}>{SOIL_OPTS.map(o=><option key={o} value={o}>{o}</option>)}</select></td><td style={td}><input type="number" value={l.thickness} style={{padding:"4px 6px",border:`1px solid ${C.border}`,borderRadius:3,width:50,textAlign:"center",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}} onChange={e=>{const n=[...layers];n[i]={...n[i],thickness:parseFloat(e.target.value)||0};setLayers(n);}}/></td><td style={td}><input type="number" value={l.avgN} style={{padding:"4px 6px",border:`1px solid ${C.border}`,borderRadius:3,width:50,textAlign:"center",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}} onChange={e=>{const n=[...layers];n[i]={...n[i],avgN:parseFloat(e.target.value)||0};setLayers(n);}}/></td><td style={td}><input type="number" value={l.unitWeight} style={{padding:"4px 6px",border:`1px solid ${C.border}`,borderRadius:3,width:50,textAlign:"center",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}} onChange={e=>{const n=[...layers];n[i]={...n[i],unitWeight:parseFloat(e.target.value)||0};setLayers(n);}}/></td><td style={td}><Bd type={SOIL_CLS[l.soilType]||"sand"}/></td><td style={td}><BtnD onClick={()=>setLayers(layers.filter((_,j)=>j!==i))}>Del</BtnD></td></tr>))}
            </tbody></table>
          </div>}

          {/* VERTICAL */}
          {tab === 1 && r && <div>
            <Sec>2.1.1 Material Capacity (재료 허용연직지지력)</Sec>
            <Fm>Qp = (1 - (μ1 + μ2)/100) x Qap</Fm>
            <CL label="L/d" formula={`${fmt(r.pileLength)} / ${fmt(r.D,4)}`} value={fmt(r.L_over_d,1)} />
            <CL label="n" value={r.n_slender} unit={isPHC?"(PHC)":"(Steel)"} />
            <CL label="μ1" value={fmt(r.mu1)} unit="% (slenderness)" />
            <CL label="μ2" value={fmt(r.mu2)} unit="% (joint)" />
            <CL label="Qap" value={fmt(r.Qap)} unit="kN" />
            <CL label="Qp" formula={`(1-(${fmt(r.mu1)}+${fmt(r.mu2)})/100)x${fmt(r.Qap)}`} value={fmt(r.Qp_material)} unit="kN" />
            {!isPHC && <div style={{marginTop:10}}><div style={{fontSize:10.5,fontWeight:600,color:"#555",marginBottom:4}}>Steel Spec Table (부식치 공제)</div><table style={tbl}><thead><tr><th style={th}>D</th><th style={th}>t</th><th style={th}>W</th><th style={th}>Ap</th><th style={th}>I</th><th style={th}>Z</th><th style={th}>Qap(kN)</th></tr></thead><tbody>
              {STEEL_SPECS.flatMap(d=>d.options.map(o=>(<tr key={`${d.d}-${o.t}`} style={{background:d.d===diameter_mm&&o.t===thickness_mm?"#dbeafe":"#fff",fontWeight:d.d===diameter_mm&&o.t===thickness_mm?700:400}}><td style={td}>{d.d}</td><td style={td}>{o.t}</td><td style={td}>{o.W}</td><td style={td}>{o.Ap}</td><td style={td}>{o.I.toLocaleString()}</td><td style={td}>{o.Z}</td><td style={td}>{o.Qap}</td></tr>)))}
            </tbody></table></div>}

            {!isPHC && r.rockCalcDetails && <>
              <Sec>2.1.2 구조물기초설계기준 (p305) — Rock Tip</Sec>
              <Fm>Pu = 443 x qu^(1/2) x At^(2/5) x Ai^(1/3)</Fm>
              <CL label="qu" value={fmt(r.rockCalcDetails.qu_eff)} unit={`kPa (cap 10000, lab=${fmt(r.rockCalcDetails.qu_lab)})`} />
              <CL label="At" value={fmt(r.rockCalcDetails.At_m2,6)} unit="m2 (corrosion deducted)" />
              <CL label="Ai" value={fmt(r.rockCalcDetails.Ai_m2,6)} unit="m2 (inner plug)" />
              <CL label="Pu" value={fmt(r.rockCalcDetails.Pu_tip)} unit="kN" />

              <Sec>2.1.3 Goodman (도로교 2008, p863)</Sec>
              <Fm>Qu = qu(lab) x (NΦ + 1) x Ap</Fm>
              <CL label="qu(lab)" value={fmt(r.rockCalcDetails.qu_lab)} unit="kPa" />
              <CL label="NΦ" formula={`tan2(45+${r.rockCalcDetails.phi_rock}/2)`} value={fmt(r.rockCalcDetails.N_phi,3)} />
              <CL label="Ap" value={fmt(r.rockCalcDetails.Ap_full,3)} unit="m2 (full)" />
              <CL label="Qu" value={fmt(r.rockCalcDetails.Pu_goodman)} unit="kN" />

              <Sec>2.1.4 Canadian FEM (도로교 2008, p862)</Sec>
              <Fm>Qu = 3 x qu x Ksp x d x Ap, Ksp=(3+Sd/D)/[10(1+300td/Sd)^0.5]</Fm>
              <CL label="Ksp" value={fmt(r.rockCalcDetails.Ksp)} />
              <CL label="Qu" value={fmt(r.rockCalcDetails.Pu_canadian)} unit="kN" />

              <RB ok={true} label="Pu (selected) = min(구기설, Goodman, Canadian)" value={`${fmt(r.rockCalcDetails.Pu_selected)} kN`} />
            </>}

            <Sec>2.1.5 Ground Capacity (지반 허용연직지지력)</Sec>
            <Fm>{r.rockCalcDetails ? "Qu = Pu(rock) + 2NsAs + 6.25NcAc" : "Qu = 250NAp + 2NsAs + 6.25NcAc"}</Fm>
            <table style={tbl}><thead><tr><th style={th}>Layer</th><th style={th}>γ</th><th style={th}>L</th><th style={th}>N</th><th style={th}>As</th><th style={th}>2NsAs</th><th style={th}>6.25NcAc</th></tr></thead><tbody>
              {r.processedLayers.map((l,i)=>(<tr key={i} style={{background:i%2===0?"#fff":"#fafbfc"}}><td style={tdL}>{l.soilType}</td><td style={td}>{l.unitWeight}</td><td style={td}>{fmt(l.thickness)}</td><td style={td}>{fmt(l.avgN)}</td><td style={td}>{fmt(l.As,3)}</td><td style={td}>{l.skinFriction_sand>0?fmt(l.skinFriction_sand):"-"}</td><td style={td}>{l.skinFriction_clay>0?fmt(l.skinFriction_clay):"-"}</td></tr>))}
              <tr style={{background:"#f0f4ff",fontWeight:700}}><td style={tdL}>Total</td><td style={td}></td><td style={td}>{fmt(r.pileLength)}</td><td style={td}></td><td style={td}></td><td style={td}>{fmt(r.sum_2NsAs)}</td><td style={td}>{fmt(r.sum_625NcAc)}</td></tr>
            </tbody></table>
            <div style={{marginTop:10}}>
              <CL label="Tip" value={fmt(r.Qu_tip)} unit={`kN (${r.rockCalcDetails?"rock":"250NAp"})`} />
              <CL label="Qu" formula={`${fmt(r.Qu_tip)}+${fmt(r.sum_2NsAs)}+${fmt(r.sum_625NcAc)}`} value={fmt(r.Qu)} unit="kN" />
              <CL label="Qa" formula={`Qu/${r.FS}`} value={fmt(r.Qa_ground)} unit="kN" />
            </div>
            <Sec>2.1.6 Summary</Sec>
            <table style={tbl}><thead><tr><th style={th}>Category</th><th style={th}>Material (kN)</th><th style={th}>Ground (kN)</th><th style={th}>Applied (kN)</th></tr></thead><tbody><tr><td style={{...tdL,fontWeight:600}}>Result</td><td style={{...td,fontWeight:700}}>{fmt(r.Qp_material)}</td><td style={{...td,fontWeight:700}}>{fmt(r.Qa_ground)}</td><td style={{...td,fontWeight:800,color:C.accent}}>{fmt(r.Qa_applied)}</td></tr></tbody></table>
          </div>}

          {/* HORIZONTAL */}
          {tab === 2 && r && <div>
            <Sec>2.2.1 Kh (수평 지반반력계수)</Sec>
            <CL label="N(avg)" value={r.N_kh} /><CL label="E" value={`${(r.E/1e6).toFixed(0)} MPa`} /><CL label="EI" value={fmt(r.EI,1)} unit="kN-m2" />
            <table style={{...tbl,marginTop:8}}><thead><tr><th style={th}>Method</th><th style={th}>Formula</th><th style={th}>Kh</th></tr></thead><tbody>
              {[{n:"Road Bridge",f:"1.208(aEo)^1.1 d^-0.31 EI^-0.1",v:r.Kh1},{n:"Fukuoka",f:"6910N^0.406",v:r.Kh2},{n:"Yokoyama",f:"2000N",v:r.Kh3},{n:"Geotech Soc.",f:"1.208(a1000N)^1.1...",v:r.Kh4}].map((m,i)=>(<tr key={i} style={{background:r.Kh_min===m.v?"#fef9c3":i%2===0?"#fff":"#fafbfc"}}><td style={tdL}>{m.n}</td><td style={{...td,fontSize:10,textAlign:"left",fontFamily:"'JetBrains Mono',monospace"}}>{m.f}</td><td style={{...td,fontWeight:700}}>{fmt(m.v,1)}</td></tr>))}
            </tbody></table>
            <RB ok={true} label="Kh (min)" value={`${fmt(r.Kh_min,1)} kN/m3`} />
            <Sec>2.2.2 Brom's Method</Sec>
            <CL label="Phi" formula={`sqrt(12x${r.N_kh})+15`} value={fmt(r.phi_deg)} unit="deg" />
            <CL label="Kp" value={fmt(r.Kp,3)} /><CL label="beta" value={fmt(r.beta,6)} unit="m-1" /><CL label="etaL" value={fmt(r.etaL)} />
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#e0f2fe",borderRadius:4,marginBottom:4}}><span style={{fontWeight:600,color:C.navy}}>Class</span><span style={{color:"#0369a1",fontWeight:700}}>{r.pileClass}</span></div>
            <div style={{fontSize:10.5,fontWeight:600,color:"#555",marginTop:8}}>Case-1: Displacement</div>
            <CL label="H" value={fmt(r.H_disp)} unit="kN" /><CL label="Hu" value={fmt(r.Hu_brom1)} unit="kN" /><CL label="Ha" formula="Hu/2.5" value={fmt(r.Ha_brom1)} unit="kN" />
            <div style={{fontSize:10.5,fontWeight:600,color:"#555",marginTop:8}}>Case-2: Yield stress</div>
            <CL label="My" value={fmt(r.My_case2)} unit="kN-m" /><CL label="Ha" formula="Hu/2.5" value={fmt(r.Ha_brom2)} unit="kN" />
            <Sec>2.2.3 Chang's</Sec>
            <CL label="Ha" value={fmt(r.Ha_chang)} unit="kN" />
            <RB ok={true} label="Ha (applied)" value={`${fmt(r.Ha_applied)} kN`} />
          </div>}

          {/* PULL-OUT */}
          {tab === 3 && r && <div>
            <Sec>2.3 Pull-out (인발)</Sec><Fm>Qpull = Qu_skin/FS + Wp</Fm>
            <CL label="Qu_skin" value={fmt(r.Qu_skin)} unit="kN" /><CL label="Wp" value={fmt(r.Wp)} unit="kN" /><CL label="Qpull" value={fmt(r.Qpull)} unit="kN" />
            <RB ok={true} label="Pull-out" value={`${fmt(r.Qpull)} kN`} />
          </div>}

          {/* SETTLEMENT */}
          {tab === 4 && r && <div>
            <Sec>4. Settlement (침하량)</Sec><Fm>St = Ss + Sp + Sps</Fm>
            <CL label="Qps" value={fmt(r.Qps)} unit="kN" /><CL label="Qfs" value={fmt(r.Qfs)} unit="kN" />
            <CL label="Ss" value={fmt(r.Ss)} unit="mm" /><CL label="Sp" value={fmt(r.Sp)} unit="mm" /><CL label="Sps" value={fmt(r.Sps,3)} unit="mm" />
            <RB ok={r.St<25} label={`St = ${fmt(r.Ss)}+${fmt(r.Sp)}+${fmt(r.Sps,3)}`} value={`${fmt(r.St)} mm ${r.St<25?"OK":"NG"}`} />
          </div>}

          {/* SUMMARY */}
          {tab === 5 && r && <div>
            <Sec>Bearing Capacity Summary</Sec>
            <div style={{padding:12,background:isPHC?"#fffbeb":"#eff6ff",borderRadius:7,marginBottom:14,border:`1px solid ${isPHC?"#fde68a":"#bfdbfe"}`}}>
              <div style={G(3)}><div style={{fontSize:11}}>Pile: <strong>{isPHC?`PHC ${phcGrade}`:"Steel"} D{diameter_mm}x{thickness_mm}t</strong></div><div style={{fontSize:11}}>BH: <strong>{boreholeNo}</strong></div><div style={{fontSize:11}}>L: <strong>{fmt(r.pileLength)} m</strong></div></div>
              {!isPHC&&r.rockCalcDetails&&<div style={{marginTop:6,fontSize:10,color:"#555"}}>Rock: qu={fmt(r.rockCalcDetails.qu_lab)}kPa | Corr={corrosionThk}mm | Pu(min)={fmt(r.rockCalcDetails.Pu_selected)}kN</div>}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
              {[{lb:"Vertical",v:fmt(r.Qa_applied),c:C.navy},{lb:"Horizontal",v:fmt(r.Ha_applied),c:C.accent},{lb:"Pull-out",v:fmt(r.Qpull),c:C.green}].map(x=>(<div key={x.lb} style={{padding:12,borderRadius:7,background:"#fff",border:`2px solid ${x.c}`,textAlign:"center"}}><div style={{fontSize:10,fontWeight:600,color:"#666",marginBottom:2}}>{x.lb}</div><div style={{fontSize:19,fontWeight:800,color:x.c,fontFamily:"'JetBrains Mono',monospace"}}>{x.v}</div><div style={{fontSize:10,color:"#888"}}>kN/pile</div></div>))}
            </div>
            <table style={{...tbl,marginTop:14}}><thead><tr><th style={th}>Category</th><th style={th}>V(kN)</th><th style={th}>H(kN)</th><th style={th}>Pull-out(kN)</th><th style={th}>St(mm)</th></tr></thead><tbody><tr>
              <td style={{...tdL,fontWeight:600}}>{isPHC?`PHC ${phcGrade}`:"Steel"} D{diameter_mm}x{thickness_mm}t</td>
              <td style={{...td,fontWeight:700,color:C.navy}}>{fmt(r.Qa_applied)}</td><td style={{...td,fontWeight:700,color:C.accent}}>{fmt(r.Ha_applied)}</td><td style={{...td,fontWeight:700,color:C.green}}>{fmt(r.Qpull)}</td><td style={{...td,fontWeight:700,color:r.St<25?"#15803d":"#dc2626"}}>{fmt(r.St)} {r.St<25?"OK":"NG"}</td>
            </tr></tbody></table>
            <RB ok={r.St<25} label={`Settlement: ${fmt(r.Ss)}+${fmt(r.Sp)}+${fmt(r.Sps,3)}`} value={`${fmt(r.St)} mm ${r.St<25?"OK":"NG"}`} />
            <div style={{marginTop:16,padding:"8px 12px",background:"#f1f5f9",borderRadius:5,fontSize:10,color:"#64748b",lineHeight:1.4}}>
              <strong>Ref:</strong> KDS 11 50 40 (2018) | Road Bridge (2008) | Geotechnical Society (1996){!isPHC&&" | Goodman (1980) | Canadian FEM"}
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}
