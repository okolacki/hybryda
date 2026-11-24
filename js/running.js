// Bieganie: import CSV/FIT, klasyfikacja, VDOT (Daniels), tempa, analiza, generator treningów
import { state } from './store.js';
import { parseCSV, parseTime, num, uid, today, diffDays, weekStart, addDays, fmtPace, clamp } from './util.js';
import { parseFit } from './fit.js';

// ---------- Import ----------
const COLS = {
  type: ['activity type', 'typ aktywności', 'rodzaj aktywności'],
  date: ['date', 'data'],
  title: ['title', 'tytuł', 'nazwa'],
  dist: ['distance', 'dystans'],
  cal: ['calories', 'kalorie'],
  time: ['time', 'czas'],
  moving: ['moving time', 'czas ruchu'],
  elapsed: ['elapsed time', 'upływający czas', 'czas całkowity'],
  avgHr: ['avg hr', 'średnie tętno', 'średnie hr'],
  maxHr: ['max hr', 'maksymalne tętno', 'maks. tętno', 'maksymalne hr'],
  te: ['aerobic te', 'te aerobowy', 'efekt treningowy (aerobowy)'],
  cad: ['avg run cadence', 'średnia kadencja biegu', 'średnia kadencja'],
  ascent: ['total ascent', 'całkowity wznios', 'suma podejść'],
};

export function importCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('Pusty plik CSV');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const idx = {};
  for (const [k, names] of Object.entries(COLS)) idx[k] = head.findIndex((h) => names.includes(h));
  if (idx.date < 0 || idx.dist < 0 || idx.time < 0) throw new Error('Nie rozpoznano kolumn (oczekiwano eksportu Garmin Connect: Date, Distance, Time…)');
  const g = (r, k) => (idx[k] >= 0 ? r[idx[k]] : null);
  const runs = [];
  for (const r of rows.slice(1)) {
    const type = (g(r, 'type') || 'Running').trim();
    const date = (g(r, 'date') || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) continue;
    const timeSec = parseTime(g(r, 'moving')) || parseTime(g(r, 'time'));
    runs.push({
      date, type, title: g(r, 'title') || type,
      distKm: num(g(r, 'dist')), timeSec,
      elapsedSec: parseTime(g(r, 'elapsed')) || parseTime(g(r, 'time')),
      avgHr: num(g(r, 'avgHr')), maxHr: num(g(r, 'maxHr')),
      cadence: num(g(r, 'cad')), ascent: num(g(r, 'ascent')), te: num(g(r, 'te')), calories: num(g(r, 'cal')),
      laps: null, hrSamples: null,
    });
  }
  return mergeRuns(runs, 'csv');
}

export function importFIT(buffer) { return mergeRuns([parseFit(buffer)], 'fit'); }

export function mergeRuns(list, source) {
  let added = 0, updated = 0, skipped = 0;
  for (const r of list) {
    if (!r.distKm && !r.timeSec) { skipped++; continue; }
    r.source = source;
    const day = r.date.slice(0, 10);
    const dup = state.runs.find((x) => x.date.slice(0, 10) === day && x.type.includes('Cycling') === r.type.includes('Cycling') &&
      (x.distKm && r.distKm ? Math.abs(x.distKm - r.distKm) / r.distKm < 0.15 : Math.abs((x.timeSec || 0) - (r.timeSec || 0)) < 300));
    if (dup) {
      const rank = { manual: 0, csv: 1, strava: 2, fit: 3 };
      if (rank[source] >= rank[dup.source]) {
        const keep = { id: dup.id, wt: dup.wt, slotId: dup.slotId, note: dup.note };
        if (source === 'csv' && dup.source === 'fit') { skipped++; continue; }
        if (source === dup.source && source === 'strava' && dup.stravaId === r.stravaId && !r.laps && dup.laps) { r.laps = dup.laps; r.hrSamples = dup.hrSamples; }
        Object.assign(dup, r, keep, (source === 'csv' || source === 'strava') && dup.laps && !r.laps ? { laps: dup.laps, hrSamples: dup.hrSamples } : {});
        updated++;
      } else skipped++;
    } else {
      state.runs.push({ id: uid(), ...r });
      added++;
    }
  }
  state.runs.sort((a, b) => (a.date < b.date ? 1 : -1));
  autoHrMax();
  return { added, updated, skipped };
}

export function autoHrMax() {
  if (!state.settings.hrMaxAuto) return;
  const m = Math.max(0, ...state.runs.filter((r) => !isCycling(r)).map((r) => r.maxHr || 0));
  if (m > 150) state.settings.hrMax = Math.min(m, 215);
}

export const isCycling = (r) => /cycl|rower|bike/i.test(r.type);
export const isRun = (r) => /run|bieg/i.test(r.type) && !isCycling(r);
export const runPace = (r) => (r.distKm && r.timeSec ? r.timeSec / r.distKm : null);
export const hrMax = () => state.settings.hrMax || 190;

// ---------- Klasyfikacja ----------
export const RUN_TYPES = {
  E: { label: 'Spokojny', short: 'E', cat: 'runE' },
  S: { label: 'Umiarkowany', short: 'S', cat: 'runE' },
  L: { label: 'Długi', short: 'L', cat: 'runL' },
  T: { label: 'Tempo / progowy', short: 'T', cat: 'runQ' },
  I: { label: 'Interwały', short: 'I', cat: 'runQ' },
  R: { label: 'Rytmy / szybkość', short: 'R', cat: 'runQ' },
  C: { label: 'Cardio', short: 'C', cat: 'cardio' },
};

export function classify(r) {
  if (r.wt) return r.wt;
  if (isCycling(r) || !isRun(r)) return 'C';
  const t = r.title || '';
  const m = t.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (m) { const d = +m[2]; return d >= 100 && d <= 600 ? 'R' : 'I'; }
  if (/interwa|interval/i.test(t)) return 'I';
  if (/tempo|threshold|prog/i.test(t)) return 'T';
  if (r.laps && lapsLookLikeIntervals(r.laps)) return 'I';
  const pct = r.avgHr ? r.avgHr / hrMax() : null;
  if ((r.distKm || 0) >= 15 || (r.timeSec || 0) >= 70 * 60) return 'L';
  if (pct != null && pct >= 0.85) return 'T';
  if (pct != null && pct >= 0.78) return 'S';
  return 'E';
}
function lapsLookLikeIntervals(laps) {
  const act = laps.filter((l) => l.intensity === 0 && l.distM);
  const rest = laps.filter((l) => l.intensity === 1);
  if (act.length >= 3 && rest.length >= 2) return true;
  const paces = laps.filter((l) => l.distM > 150).map((l) => l.timeSec / (l.distM / 1000));
  if (paces.length < 6) return false;
  const sorted = [...paces].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.8)] / sorted[Math.floor(sorted.length * 0.2)] > 1.25;
}

// ---------- VDOT (Jack Daniels) ----------
const vo2AtV = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v; // v w m/min
const pctMax = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t); // t w min
export function vdotFrom(distM, sec) { const t = sec / 60; return vo2AtV(distM / t) / pctMax(t); }
const vAtVo2 = (vo2) => (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (vo2 + 4.6))) / (2 * 0.000104);
export const paceAt = (vdot, frac) => 60000 / vAtVo2(vdot * frac); // s/km

export function predict(vdot, distM) {
  let lo = distM / 400 * 60, hi = distM / 100 * 60; // sekundy
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (vdotFrom(distM, mid) > vdot) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export function paces(vdot) {
  return {
    E: [paceAt(vdot, 0.70), paceAt(vdot, 0.62)],
    M: paceAt(vdot, 0.80),
    T: paceAt(vdot, 0.88),
    I: paceAt(vdot, 0.975),
    R: paceAt(vdot, 0.975) - 15,
  };
}

// Każdy bieg daje dolne ograniczenie formy; starsze wyniki tracą ~0,4%/tydzień
export function estimateVdot() {
  const now = today();
  let best = null, peak = null;
  for (const r of state.runs) {
    if (!isRun(r) || !r.distKm || r.distKm < 3 || !r.timeSec) continue;
    const pace = r.timeSec / r.distKm;
    if (pace < 150 || pace > 480) continue;
    const v = vdotFrom(r.distKm * 1000, r.timeSec);
    const age = diffDays(now, r.date);
    if (age < 0) continue;
    if (age <= 183 && (!peak || v > peak.v)) peak = { v, run: r };
    if (age > 120) continue;
    const weeks = age / 7;
    const dec = v * (1 - clamp(0.004 * (weeks - 3), 0, 0.1));
    if (!best || dec > best.v) best = { v: dec, raw: v, run: r };
  }
  const ov = state.settings.vdotOverride;
  return {
    vdot: ov || (best ? Math.round(best.v * 10) / 10 : null),
    source: ov ? 'manual' : best ? 'auto' : null,
    basis: best, peak,
  };
}

// ---------- Analiza ----------
export function weeklyKm(weeks = 12) {
  const ws0 = weekStart(today());
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const ws = addDays(ws0, -7 * i), we = addDays(ws, 7);
    const runs = state.runs.filter((r) => isRun(r) && r.date.slice(0, 10) >= ws && r.date.slice(0, 10) < we);
    out.push({ ws, km: runs.reduce((a, r) => a + (r.distKm || 0), 0), n: runs.length, q: runs.filter((r) => RUN_TYPES[classify(r)].cat === 'runQ').length });
  }
  return out;
}

export function runStats() {
  const wk = weeklyKm(12);
  const last4 = wk.slice(-5, -1); // 4 pełne tygodnie przed bieżącym
  const avg4 = last4.reduce((a, w) => a + w.km, 0) / 4;
  const prev4 = wk.slice(-9, -5).reduce((a, w) => a + w.km, 0) / 4;
  const day7 = addDays(today(), -7);
  const day28 = addDays(today(), -28);
  const acute = state.runs.filter((r) => isRun(r) && r.date.slice(0, 10) > day7).reduce((a, r) => a + (r.distKm || 0), 0);
  const chronic = state.runs.filter((r) => isRun(r) && r.date.slice(0, 10) > day28).reduce((a, r) => a + (r.distKm || 0), 0) / 4;
  const recent = state.runs.filter((r) => isRun(r) && diffDays(today(), r.date) <= 42);
  const easyish = recent.filter((r) => ['E', 'S'].includes(classify(r)) && r.avgHr);
  const grey = easyish.filter((r) => r.avgHr / hrMax() >= 0.78).length;
  const cads = recent.filter((r) => r.cadence && r.cadence > 120).map((r) => r.cadence);
  const longest21 = Math.max(0, ...state.runs.filter((r) => isRun(r) && diffDays(today(), r.date) <= 21).map((r) => r.distKm || 0));
  const lastLong = state.runs.find((r) => isRun(r) && classify(r) === 'L');
  return {
    weeks: wk, avg4, prev4, acute, chronic, acwr: chronic > 0 ? acute / chronic : null,
    greyShare: easyish.length ? grey / easyish.length : null, easyCount: easyish.length,
    cadence: cads.length ? cads.reduce((a, b) => a + b, 0) / cads.length : null,
    longest21, lastLong, daysSinceRun: state.runs.find(isRun) ? diffDays(today(), state.runs.find(isRun).date) : null,
  };
}

// Efficiency factor: prędkość (m/min) / średnie tętno – rośnie wraz z formą tlenową
export function efficiencySeries() {
  return state.runs.filter((r) => isRun(r) && r.avgHr && r.distKm >= 3 && r.timeSec / r.distKm < 450 && ['E', 'S', 'L'].includes(classify(r)))
    .map((r) => ({ date: r.date.slice(0, 10), ef: (r.distKm * 1000 / (r.timeSec / 60)) / r.avgHr }))
    .reverse();
}

export function hrZones() {
  const m = hrMax();
  return [
    { z: 'Z1', lo: 0, hi: Math.round(m * 0.68), label: 'Regeneracja' },
    { z: 'Z2', lo: Math.round(m * 0.68), hi: Math.round(m * 0.78), label: 'Tlenowa / E' },
    { z: 'Z3', lo: Math.round(m * 0.78), hi: Math.round(m * 0.85), label: 'Umiarkowana (szara strefa)' },
    { z: 'Z4', lo: Math.round(m * 0.85), hi: Math.round(m * 0.92), label: 'Progowa / T' },
    { z: 'Z5', lo: Math.round(m * 0.92), hi: m, label: 'VO₂max / I' },
  ];
}

export function zoneTimes(r) {
  if (!r.hrSamples) return null;
  const zs = hrZones(), out = zs.map(() => 0);
  for (let i = 1; i < r.hrSamples.length; i++) {
    const dt = Math.min(30, r.hrSamples[i][0] - r.hrSamples[i - 1][0]);
    const hr = r.hrSamples[i][1];
    let zi = zs.findIndex((z) => hr < z.hi); if (zi < 0) zi = 4;
    out[zi] += dt;
  }
  return out;
}

// ---------- Generator treningów biegowych ----------
const I_LADDER = [[5, 800], [6, 800], [5, 1000], [6, 1000], [4, 1200], [5, 1200], [4, 1600]];
const R_LADDER = [[6, 400], [8, 400], [10, 400], [6, 600], [8, 600], [10, 600]];
const T_LADDER = [[3, 8], [4, 8], [3, 10], [2, 15], [3, 12], [1, 25], [2, 20]];
const LONG_CAP = { '5k': 15, '10k': 19, hm: 24, m: 34, none: 16 };

function countRecent(type, days = 56) {
  return state.runs.filter((r) => isRun(r) && classify(r) === type && diffDays(today(), r.date) <= days).length;
}
const hrCap = (f) => Math.round(hrMax() * f);

export function buildRun(type, minutes) {
  const est = estimateVdot();
  const vdot = est.vdot || 42;
  const p = paces(vdot);
  const focus = state.goal.runFocus || '10k';
  const st = runStats();
  const deload = state.settings.deloadUntil && state.settings.deloadUntil >= today();
  const pE = `${fmtPace(p.E[0])}–${fmtPace(p.E[1])}/km`;
  const wu = 15, cd = 10;
  const steps = [];
  let title = '', summary = '', estMin = minutes;

  if (type === 'E') {
    const max = st.avg4 > 30 ? 70 : st.avg4 > 15 ? 55 : 45;
    const dur = clamp(Math.min(minutes - 5, max), 20, 90);
    const strides = ['5k', '10k'].includes(focus) && dur >= 30;
    title = 'Bieg spokojny';
    summary = `${dur} min @ ${pE}${strides ? ' + 6 rytmów' : ''}`;
    steps.push({ t: `${dur} min swobodnie`, d: `${pE}, tętno < ${hrCap(0.78)} (Z2). Musisz móc rozmawiać pełnymi zdaniami.` });
    if (strides) steps.push({ t: '6 × 20 s rytmy', d: `Płynne przyspieszenia do ~${fmtPace(p.R)}/km, 60–90 s marszu/truchtu między. Nie sprint – luźny, szybki krok.` });
    estMin = dur + (strides ? 8 : 0);
  } else if (type === 'L') {
    const base = Math.max(st.longest21 + 1.5, st.avg4 * 0.33, 8);
    let km = Math.min(base, LONG_CAP[focus] || 16, (minutes - 3) * 60 / p.E[0]);
    if (deload) km *= 0.75;
    km = Math.max(6, Math.round(km * 2) / 2);
    const mFinish = ['hm', 'm'].includes(focus) && countRecent('L') >= 2 && !deload;
    title = 'Długi bieg';
    summary = `${String(km).replace('.', ',')} km @ ${pE}${mFinish ? ', ostatnie 3 km w tempie M' : ''}`;
    steps.push({ t: `${String(km).replace('.', ',')} km spokojnie`, d: `${pE}, tętno < ${hrCap(0.78)}. Picie co ~20 min jeśli > 75 min.` });
    if (mFinish) steps.push({ t: 'Ostatnie 3 km', d: `Tempo maratońskie ${fmtPace(p.M)}/km – kontrolowane, nie ściganie.` });
    estMin = Math.round(km * p.E[0] / 60);
  } else if (type === 'T') {
    let lvl = clamp(countRecent('T'), 0, T_LADDER.length - 1);
    if (deload) lvl = 0;
    let [n, m] = T_LADDER[lvl];
    const rest = Math.max(1, Math.round(m / 5));
    const tot = () => wu + cd + n * m + (n - 1) * rest;
    while (tot() > minutes && n > 1) n--;
    title = 'Tempo / progowy';
    summary = n === 1 ? `${m} min ciągle @ ${fmtPace(p.T)}/km` : `${n} × ${m} min @ ${fmtPace(p.T)}/km`;
    steps.push({ t: `Rozgrzewka ${wu} min`, d: `${pE} + 4 rytmy po 15 s` });
    steps.push({ t: summary, d: `Tempo progowe – „komfortowo ciężko”, tętno ok. ${hrCap(0.86)}–${hrCap(0.9)}.${n > 1 ? ` Przerwy ${rest} min truchtu.` : ''}` });
    steps.push({ t: `Schłodzenie ${cd} min`, d: 'Bardzo luźny trucht' });
    estMin = tot();
  } else if (type === 'I' || type === 'R') {
    const ladder = type === 'I' ? I_LADDER : R_LADDER;
    let lvl = clamp(countRecent(type), 0, ladder.length - 1);
    if (deload) lvl = 0;
    let [n, d] = ladder[lvl];
    const pace = type === 'I' ? p.I : p.R;
    const repSec = d / 1000 * pace;
    const restSec = type === 'I' ? Math.round(repSec * 0.9 / 15) * 15 : Math.round(d / 1000 * p.E[0] / 15) * 15;
    const tot = () => wu + cd + Math.round(n * (repSec + restSec) / 60);
    while (tot() > minutes && n > 3) n--;
    title = type === 'I' ? 'Interwały VO₂max' : 'Rytmy / szybkość';
    summary = `${n} × ${d} m @ ${fmtPace(pace)}/km`;
    steps.push({ t: `Rozgrzewka ${wu} min`, d: `${pE} + 4 rytmy po 20 s` });
    steps.push({ t: summary, d: `Każdy odcinek ok. ${Math.floor(repSec / 60)}:${String(Math.round(repSec % 60)).padStart(2, '0')}. Przerwa ${type === 'I' ? Math.floor(restSec / 60) + ':' + String(restSec % 60).padStart(2, '0') + ' min truchtu' : 'trucht ' + d + ' m (pełny odpoczynek)'}.${type === 'R' ? ' Forma > zmęczenie: lekki, szybki krok.' : ' Równe odcinki – ostatni tak samo szybki jak pierwszy.'}` });
    steps.push({ t: `Schłodzenie ${cd} min`, d: 'Luźny trucht' });
    estMin = tot();
  } else if (type === 'Z2') {
    const dur = clamp(minutes, 15, 40);
    title = 'Cardio Z2 (bieżnia / rowerek)';
    summary = `${dur} min Z2`;
    steps.push({ t: `${dur} min`, d: `Tętno ${hrZones()[1].lo}–${hrZones()[1].hi}. Bieżnia: nachylenie 1–3%, ${pE}. Rowerek: równy opór, kadencja 85–95.` });
    estMin = dur;
  } else if (type === 'HIIT') {
    const reps = minutes >= 25 ? 8 : 6;
    title = 'Krótkie interwały na bieżni';
    summary = `${reps} × 1 min @ ${fmtPace(p.I)}/km / 1 min marsz`;
    steps.push({ t: '5 min rozgrzewki', d: 'Szybki marsz → trucht' });
    steps.push({ t: summary, d: 'Na bieżni ustaw 1% nachylenia. Ostatnie powtórzenie powinno być ciężkie, ale wykonalne.' });
    steps.push({ t: '3–5 min schłodzenia', d: 'Marsz' });
    estMin = reps * 2 + 10;
  }
  return { type, title, summary, steps, estMin, vdot, paces: p };
}

export function addManualRun({ date, distKm, timeSec, avgHr, wt, title, slotId, type }) {
  const r = { id: uid(), date: `${date} 12:00:00`, type: type || 'Running', title: title || 'Bieg (ręcznie)', distKm, timeSec, elapsedSec: timeSec, avgHr: avgHr || null, maxHr: null, cadence: null, source: 'manual', wt: wt || null, slotId: slotId || null, laps: null, hrSamples: null };
  state.runs.push(r);
  state.runs.sort((a, b) => (a.date < b.date ? 1 : -1));
  return r;
}
