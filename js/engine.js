// Silnik: dobór treningu do slotu, progresja siłowa, porady, optymalizacja planu
import { state, MUSCLES, MUSCLE_RANGE } from './store.js';
import { today, addDays, weekStart, diffDays, normKey, round, clamp, fmtKg, fmtNum, dayIdx, DAYS } from './util.js';
import { classify, isRun, RUN_TYPES, runStats, buildRun, hrMax, estimateVdot } from './running.js';

export const GOALS = {
  hybrid: { label: 'Hybryda: sylwetka + bieganie', desc: 'Równowaga: 2× góra, 1× nogi/mobilność, jakość biegowa + długi bieg.',
    targets: { upper: 2, lower: 1, runQ: 1, runL: 1, runE: 1, mob: 0.5 }, w: { upper: 1, runQ: 0.85, lower: 0.7, runL: 0.7, runE: 0.5, mob: 0.3 } },
  recomp: { label: 'Rekompozycja (priorytet siłownia)', desc: 'Budowa górnych partii, nogi w trybie „athletic”, bieganie jako wsparcie spalania i kondycji.',
    targets: { upper: 2, lower: 1, runQ: 1, runE: 1, runL: 0, mob: 0.5 }, w: { upper: 1, lower: 0.65, runQ: 0.55, runE: 0.5, runL: 0.2, mob: 0.35 } },
  run: { label: 'Wynik biegowy', desc: 'Priorytet: 2 jednostki jakościowe + długi bieg, siłownia podtrzymująca.',
    targets: { runQ: 2, runL: 1, runE: 2, upper: 1, lower: 1, mob: 0.5 }, w: { runQ: 1, runL: 0.9, runE: 0.6, lower: 0.55, upper: 0.5, mob: 0.3 } },
  strength: { label: 'Siła i masa górnych partii', desc: 'Do 3× góra w tygodniu, bieganie głównie spokojne.',
    targets: { upper: 3, lower: 1, runE: 1, runQ: 0, runL: 0, mob: 0.5 }, w: { upper: 1, lower: 0.7, runE: 0.4, runQ: 0.2, runL: 0.1, mob: 0.3 } },
  general: { label: 'Ogólna sprawność', desc: 'Wszystkiego po trochu, dużo mobilności.',
    targets: { upper: 2, lower: 1, runE: 1, runQ: 1, runL: 0, mob: 1 }, w: { upper: 0.8, lower: 0.8, runE: 0.7, runQ: 0.6, runL: 0.2, mob: 0.5 } },
};
export const FOCUS = { '5k': '5 km', '10k': '10 km', hm: 'Półmaraton', m: 'Maraton', none: 'Bez startu' };
const FOCUS_Q = { '5k': { I: 0.15, R: 0.12, T: 0 }, '10k': { I: 0.15, T: 0.1, R: 0.02 }, hm: { T: 0.18, I: 0.06, R: -0.2 }, m: { T: 0.2, I: 0, R: -0.3 }, none: { I: 0.1, T: 0.1, R: 0 } };
export const CAT_LABEL = { upper: 'Góra', lower: 'Nogi', runQ: 'Bieg jakość', runL: 'Długi bieg', runE: 'Bieg spokojny', mob: 'Mobilność' };
const isDeload = () => state.settings.deloadUntil && state.settings.deloadUntil >= today();

// ---------- Szacowanie czasu i skracanie szablonu ----------
const exSec = (e) => e.sets * (45 + (e.rest || 60));
const mobSec = (m) => (m.secs ? m.sets * m.secs + m.sets * 15 : m.sets * 60);
const estimate = (exs, mobs) => Math.round((exs.reduce((a, e) => a + exSec(e) + 60, 0) + mobs.reduce((a, m) => a + mobSec(m), 0)) / 60 + (exs.length ? 8 : 3));

export function fitTemplate(t, minutes = 999) {
  let exs = t.exercises.map((e) => ({ ...e }));
  let mobs = t.mobility.map((m) => ({ ...m }));
  const full = estimate(exs, mobs);
  const dropped = [];
  const steps = [
    () => { exs.filter((e) => e.prio === 3).forEach((e) => dropped.push(e.name)); exs = exs.filter((e) => e.prio !== 3); },
    () => { if (mobs.length > 3 && exs.length) { mobs.slice(3).forEach((m) => dropped.push(m.name)); mobs = mobs.slice(0, 3); } mobs.forEach((m) => { m.sets = Math.max(1, Math.ceil(m.sets / 2)); }); },
    () => { exs.forEach((e) => { if (e.prio === 2 && e.sets > 2) e.sets--; }); },
    () => { exs.filter((e) => e.prio === 2).slice(-2).forEach((e) => dropped.push(e.name)); const drop = new Set(exs.filter((e) => e.prio === 2).slice(-2).map((e) => e.id)); exs = exs.filter((e) => !drop.has(e.id)); },
  ];
  let est = full;
  for (const s of steps) { if (est <= minutes) break; s(); est = estimate(exs, mobs); }
  return { exercises: exs, mobility: mobs, est, full, dropped, trimmed: dropped.length > 0 || est < full };
}

// ---------- Kandydaci ----------
export function candidates() {
  const out = [];
  const focus = state.goal.runFocus || '10k';
  for (const t of state.templates) {
    const full = fitTemplate(t).full, min = fitTemplate(t, 0).est;
    if (t.kind === 'upper') {
      out.push({ key: `tpl:${t.id}`, kind: 'strength', tplId: t.id, label: t.name, cats: { upper: 1 }, full, min, upper: true });
      out.push({ key: `tpl:${t.id}+Z2`, kind: 'strength', tplId: t.id, addon: 'Z2', label: `${t.name} + cardio Z2`, cats: { upper: 1, runE: 0.5 }, full: full + 25, min: min + 18, upper: true });
      out.push({ key: `tpl:${t.id}+HIIT`, kind: 'strength', tplId: t.id, addon: 'HIIT', label: `${t.name} + interwały na bieżni`, cats: { upper: 1, runQ: 0.35 }, full: full + 22, min: min + 18, upper: true, hardish: true });
    } else if (t.kind === 'lower') {
      out.push({ key: `tpl:${t.id}`, kind: 'strength', tplId: t.id, label: t.name, cats: { lower: 1, mob: t.mobility.length ? 1 : 0 }, full, min, legs: true });
    } else if (t.kind === 'mob') {
      out.push({ key: `tpl:${t.id}`, kind: 'strength', tplId: t.id, label: t.name, cats: { mob: 1 }, full, min: Math.min(min, 15), light: true });
    } else {
      out.push({ key: `tpl:${t.id}`, kind: 'strength', tplId: t.id, label: t.name, cats: { upper: 0.6, lower: 0.6 }, full, min, upper: true, legs: true });
    }
  }
  const runs = [['E', 25, 50], ['L', 60, 95], ['T', 40, 55], ['I', 40, 55]];
  if (['5k', '10k'].includes(focus) || state.goal.type === 'run') runs.push(['R', 38, 50]);
  for (const [rt, min, full] of runs) {
    out.push({ key: `run:${rt}`, kind: 'run', runType: rt, label: RUN_TYPES[rt].label === 'Spokojny' ? 'Bieg spokojny' : RUN_TYPES[rt].label, cats: { [RUN_TYPES[rt].cat]: 1 }, full, min, hard: rt !== 'E' });
  }
  return out;
}
export const candByKey = (key) => candidates().find((c) => c.key === key);

// ---------- Zdarzenia (historia) ----------
export function eventsFromHistory() {
  const ev = [];
  for (const s of state.sessions) {
    const t = state.templates.find((x) => x.id === s.tplId);
    const kind = s.tplKind || t?.kind || 'upper';
    const cats = kind === 'upper' ? { upper: 1 } : kind === 'lower' ? { lower: 1, mob: s.mobDone ? 1 : 0.3 } : kind === 'mob' ? { mob: 1 } : { upper: 0.6, lower: 0.6 };
    if (s.addon === 'Z2') cats.runE = 0.5;
    if (s.addon === 'HIIT') cats.runQ = 0.35;
    ev.push({ date: s.date, cats, upper: kind === 'upper' || kind === 'full', legs: kind === 'lower' || kind === 'full', hard: s.addon === 'HIIT', tplId: s.tplId, label: s.tplName, src: 'session', id: s.id });
  }
  for (const r of state.runs) {
    const rt = classify(r);
    const cat = RUN_TYPES[rt].cat;
    const cats = cat === 'cardio' ? { runE: 0.4 } : { [cat]: 1 };
    ev.push({ date: r.date.slice(0, 10), cats, hard: ['T', 'I', 'R', 'L'].includes(rt), runType: rt, label: RUN_TYPES[rt].label, src: 'run', id: r.id });
  }
  for (const p of state.plan) {
    if (p.status === 'done' && !p.doneRef && p.doneKey) {
      const c = candByKey(p.doneKey);
      if (c) ev.push({ date: p.date, cats: c.cats, hard: c.hard || c.hardish, upper: c.upper, legs: c.legs, runType: c.runType, tplId: c.tplId, label: c.label, src: 'slot', id: p.id });
    }
  }
  return ev;
}

// ---------- Ocena kandydata ----------
function score(c, slot, ctx) {
  const g = GOALS[state.goal.type] || GOALS.hybrid;
  const reasons = [];
  let s = 0;
  const minutes = slot.minutes;
  if (c.min > minutes + 3) return null;

  const taper = ctx.daysToRace != null && ctx.daysToRace >= 0 && ctx.daysToRace <= 10;
  for (const [cat, amt] of Object.entries(c.cats)) {
    if (!amt) continue;
    const t = g.targets[cat] || 0, done = ctx.counts[cat] || 0;
    let w = g.w[cat] ?? 0.2;
    if (taper && (cat === 'lower' || cat === 'runL')) w *= 0.3;
    let need = t > 0 ? (t - done) / t : -0.3;
    need = need > 0 ? 0.4 + need : need * 0.8 - 0.1;
    s += amt * w * need;
    if (t >= 1 && done < t && amt >= 0.5) reasons.push({ p: amt * w * need, t: `${CAT_LABEL[cat]}: ${fmtNum(done, done % 1 ? 1 : 0)}/${t} w tym tygodniu` });
    if (t >= 1 && done >= t && amt >= 0.5) reasons.push({ p: -0.2, t: `${CAT_LABEL[cat]} – cel tygodnia już zrobiony` });
  }

  // regeneracja
  for (const e of ctx.recent) {
    const dd = diffDays(slot.date, e.date);
    if (dd < 0 || dd > 2) continue;
    const when = dd === 0 ? 'dziś' : dd === 1 ? 'wczoraj' : 'przedwczoraj';
    if (dd === 0 && !c.light) { s -= 0.8; reasons.push({ p: -0.8, t: `Dziś już był trening (${e.label})` }); }
    if (c.hard) {
      if (e.hard && dd <= 1) { s -= 1.2; reasons.push({ p: -1.2, t: `Ciężki bieg ${when} – daj 48 h` }); }
      else if (e.hard && dd === 2) s -= 0.25;
      if (e.legs && dd <= 1) { s -= 0.7; reasons.push({ p: -0.7, t: `Nogi trenowane ${when}` }); }
    }
    if (c.legs) {
      if (e.hard && dd <= 1) { s -= 0.6; reasons.push({ p: -0.6, t: `Ciężki bieg ${when} – nogi zmęczone` }); }
      if (e.legs && dd <= 2) { s -= 1.0; reasons.push({ p: -1, t: `Nogi trenowane ${when}` }); }
    }
    if (c.upper && e.upper && dd <= 1) { s -= 1.0; reasons.push({ p: -1, t: `Góra trenowana ${when} – mięśnie potrzebują ~48 h` }); }
    if (c.hardish && e.hard && dd <= 1) s -= 0.4;
  }

  // samopoczucie
  const en = slot.energy || 3;
  if (en <= 2) {
    if (c.hard || c.hardish) { s -= 1.2; reasons.push({ p: -1.2, t: 'Niskie samopoczucie – bez akcentów' }); }
    if (c.legs) s -= 0.6;
    if (c.upper) s -= 0.2;
    if (c.light || c.runType === 'E') { s += 0.45; reasons.push({ p: 0.45, t: 'Niskie samopoczucie – lżejsza jednostka' }); }
  } else if (en >= 5 && (c.hard || c.upper)) s += 0.15;

  if (isDeload() && (c.hard || c.hardish)) { s -= 0.3; reasons.push({ p: -0.3, t: 'Tydzień deload' }); }
  if (taper) {
    if (c.legs) s -= 0.5;
    if (c.runType === 'L') { s -= 0.8; reasons.push({ p: -0.8, t: `Taper – start za ${ctx.daysToRace} dni` }); }
  }

  // rotacja szablonów (A/B) i typów jakości
  if (c.tplId) {
    const t = state.templates.find((x) => x.id === c.tplId);
    const sameKind = state.templates.filter((x) => x.kind === t.kind && x.id !== t.id);
    const last = ctx.lastTpl[c.tplId];
    for (const o of sameKind) {
      const lo = ctx.lastTpl[o.id];
      if (last && (!lo || last > lo)) { s -= 0.35; reasons.push({ p: -0.35, t: `${t.name} był ostatnio – rotacja` }); break; }
      if (!last && lo) { s += 0.1; reasons.push({ p: 0.3, t: `Kolej na ${t.name} (rotacja z ${o.name})` }); break; }
    }
  }
  if (c.runType && RUN_TYPES[c.runType].cat === 'runQ') {
    const pref = FOCUS_Q[state.goal.runFocus || '10k'] || FOCUS_Q.none;
    s += pref[c.runType] || 0;
    if (ctx.lastQ === c.runType) { s -= 0.25; }
    else if (ctx.lastQ) reasons.push({ p: 0.2, t: `Ostatni akcent: ${RUN_TYPES[ctx.lastQ].label.toLowerCase()} – zmiana bodźca` });
    if (state.goal.type !== 'run' && c.runType === 'R' && ctx.counts.runQ >= 1) s -= 0.3;
  }
  if (c.runType === 'L' && minutes < 70) s -= 0.3;

  // wykorzystanie czasu
  if (minutes >= 75 && c.full <= minutes * 0.6 && en > 2) s -= 0.15;
  if (c.addon && c.full > minutes + 3) s -= 0.35;
  if (c.full > minutes + 3) { s -= 0.12; reasons.push({ p: -0.05, t: 'Wersja skrócona do dostępnego czasu' }); }

  reasons.sort((a, b) => Math.abs(b.p) - Math.abs(a.p));
  return { cand: c, score: s, reasons: reasons.map((r) => r) };
}

function countCats(events, from, to) {
  const counts = {};
  for (const e of events) {
    if (e.date < from || e.date > to) continue;
    for (const [k, v] of Object.entries(e.cats)) counts[k] = (counts[k] || 0) + v;
  }
  return counts;
}

// Przydziela treningi do wszystkich slotów tygodnia (zachłannie, chronologicznie)
export function assignWeek(ws) {
  const we = addDays(ws, 6), t0 = today();
  const hist = eventsFromHistory();
  const events = [...hist];
  const lastTpl = {};
  let lastQ = null;
  for (const e of [...hist].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (e.tplId) lastTpl[e.tplId] = e.date;
    if (e.runType && RUN_TYPES[e.runType].cat === 'runQ') lastQ = e.runType;
  }
  const daysToRace = state.goal.targetDate ? diffDays(state.goal.targetDate, t0) : null;
  const slots = state.plan.filter((p) => p.date >= ws && p.date <= we).sort((a, b) => (a.date === b.date ? (a.created || 0) - (b.created || 0) : a.date < b.date ? -1 : 1));
  const result = {};
  const cands = candidates();
  for (const slot of slots) {
    if (slot.status === 'done') { result[slot.id] = { status: 'done' }; continue; }
    if (slot.date < t0) { result[slot.id] = { status: 'missed' }; continue; }
    const recent = events.filter((e) => e.date >= addDays(slot.date, -2) && e.date <= slot.date);
    const ctx = { counts: countCats(events, ws, we), recent, lastTpl: { ...lastTpl }, lastQ, daysToRace };
    const scored = cands.map((c) => score(c, slot, ctx)).filter(Boolean).sort((a, b) => b.score - a.score);
    let pick = scored[0];
    if (slot.override) pick = scored.find((x) => x.cand.key === slot.override) || { cand: candByKey(slot.override), score: 0, reasons: [{ p: 0, t: 'Wybrane ręcznie' }] };
    if (!pick || !pick.cand) { result[slot.id] = { status: 'none', alts: scored }; continue; }
    result[slot.id] = { status: 'planned', ...pick, alts: scored, pinned: !!slot.override };
    const c = pick.cand;
    events.push({ date: slot.date, cats: c.cats, hard: c.hard || c.hardish, upper: c.upper, legs: c.legs, runType: c.runType, tplId: c.tplId, label: c.label, src: 'plan' });
    if (c.tplId) lastTpl[c.tplId] = slot.date;
    if (c.runType && RUN_TYPES[c.runType].cat === 'runQ') lastQ = c.runType;
  }
  return result;
}

export function weekSummary(ws) {
  const g = GOALS[state.goal.type] || GOALS.hybrid;
  const counts = countCats(eventsFromHistory(), ws, addDays(ws, 6));
  const km = state.runs.filter((r) => isRun(r) && r.date.slice(0, 10) >= ws && r.date.slice(0, 10) <= addDays(ws, 6)).reduce((a, r) => a + (r.distKm || 0), 0);
  return { counts, targets: g.targets, km };
}

// Szczegóły treningu dla wybranego kandydata i czasu
export function buildWorkout(c, minutes) {
  if (c.kind === 'run') return { kind: 'run', run: buildRun(c.runType, minutes) };
  const t = state.templates.find((x) => x.id === c.tplId);
  const addonMin = c.addon ? clamp(minutes - fitTemplate(t).full, 15, c.addon === 'Z2' ? 35 : 22) : 0;
  const fit = fitTemplate(t, minutes - addonMin);
  return { kind: 'strength', tpl: t, fit, addon: c.addon ? buildRun(c.addon, addonMin) : null, est: fit.est + addonMin };
}

// ---------- Progresja siłowa ----------
export function bodyWeight() {
  const last = [...state.bodyweight].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return last?.kg || state.settings.bodyWeight || null;
}
export function e1rm(w, r, equip) {
  if (!r) return 0;
  const load = equip === 'bw+' ? (bodyWeight() || 75) + (w || 0) : (w || 0);
  if (!load) return r; // ćwiczenia bez obciążenia – liczymy powtórzenia
  return load * (1 + Math.min(r, 15) / 30);
}

export function history(name) {
  const key = normKey(name);
  const out = [];
  for (const s of [...state.sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.finishedAt || 0) - (a.finishedAt || 0)))) {
    const e = s.exercises.find((x) => normKey(x.name) === key);
    if (e && e.sets.some((x) => x.r > 0)) out.push({ date: s.date, sessionId: s.id, ...e, sets: e.sets.filter((x) => x.r > 0) });
  }
  return out;
}
export function bestE1rm(h) { return Math.max(0, ...h.sets.map((x) => e1rm(x.w, x.r, h.equip))); }

export function prescribe(ex) {
  const h = history(ex.name);
  const deload = isDeload();
  const sets = deload ? Math.max(1, ex.sets - 1) : ex.sets;
  const range = `${ex.repMin}–${ex.repMax}`;
  if (!h.length) return { w: null, reps: ex.repMax, sets, text: `${range} powt.`, why: 'Pierwszy raz – dobierz ciężar tak, by zostały 1–2 powtórzenia w zapasie.', last: null };
  const last = h[0];
  const lastTxt = last.sets.map((x) => (x.w ? `${fmtKg(x.w)}×${x.r}` : `${x.r}`)).join(', ');
  const W = Math.max(...last.sets.map((x) => x.w || 0));
  const atW = last.sets.filter((x) => (x.w || 0) === W);
  const inc = ex.inc || 0;
  let w = W, reps = ex.repMin, why;
  if (!inc || (!W && ex.equip === 'bw')) {
    const best = Math.max(...last.sets.map((x) => x.r));
    reps = Math.min(best + 1, ex.repMax + 5);
    why = best >= ex.repMax ? 'Górny zakres osiągnięty – dodaj obciążenie lub wolniejsze tempo (3 s ekscentryka).' : 'Dąż do +1 powtórzenia względem ostatniej sesji.';
  } else if (atW.length >= ex.sets && atW.every((x) => x.r >= ex.repMax)) {
    w = W + inc; reps = ex.repMin;
    why = `Wszystkie serie w górnym zakresie (${ex.repMax}) → +${fmtKg(inc)} kg.`;
  } else if (Math.max(...atW.map((x) => x.r)) < ex.repMin) {
    const prevFail = h[1] && Math.max(...h[1].sets.map((x) => x.r)) < ex.repMin;
    if (prevFail) { w = Math.max(0, round(W * 0.92, inc >= 2 ? 1 : 0.5)); why = 'Dwie sesje poniżej zakresu → zmniejsz ciężar o ~8% i odbuduj.'; }
    else why = 'Ostatnio poniżej zakresu – zostań przy ciężarze, skup się na technice.';
    reps = ex.repMin;
  } else {
    const minR = Math.min(...atW.map((x) => x.r));
    reps = Math.min(minR + 1, ex.repMax);
    why = `Ten sam ciężar, celuj w ${reps}+ powtórzeń w każdej serii (podwójna progresja).`;
  }
  if (deload) { w = W ? round(W * 0.9, 0.5) : w; why = 'Deload: −1 seria, ~90% ciężaru, 3–4 powtórzenia w zapasie.'; }
  return { w, reps, sets, text: `${w ? fmtKg(w) + ' kg × ' : ''}${range}`, why, last: { date: last.date, txt: lastTxt } };
}

export function stalled(name, equip) {
  const h = history(name).slice(0, 4);
  if (h.length < 4) return false;
  const vals = h.map((x) => Math.max(...x.sets.map((s) => e1rm(s.w, s.r, equip))));
  return Math.max(vals[0], vals[1], vals[2]) <= vals[3] * 1.005;
}

export function prsInSession(s) {
  const prs = [];
  for (const e of s.exercises) {
    const h = history(e.name).filter((x) => x.sessionId !== s.id && x.date <= s.date);
    const prev = Math.max(0, ...h.map((x) => bestE1rm({ ...x, equip: e.equip })));
    const cur = Math.max(0, ...e.sets.filter((x) => x.r > 0).map((x) => e1rm(x.w, x.r, e.equip)));
    if (h.length && cur > prev * 1.001) prs.push({ name: e.name, cur, prev });
  }
  return prs;
}

// ---------- Objętość ----------
export function muscleSets(from, to) {
  const out = {};
  for (const s of state.sessions) {
    if (s.date < from || s.date > to) continue;
    for (const e of s.exercises) {
      const n = e.sets.filter((x) => x.r > 0).length;
      for (const [m, f] of Object.entries(e.muscles || {})) out[m] = (out[m] || 0) + n * f;
    }
  }
  return out;
}
export function avgPerWeek(kind, weeks = 4) {
  const ws = weekStart(today());
  const from = addDays(ws, -7 * weeks), to = addDays(ws, -1);
  return state.sessions.filter((s) => s.date >= from && s.date <= to && (s.tplKind || 'upper') === kind).length / weeks;
}
function weeksSinceDeload() {
  let n = 0; const ws = weekStart(today());
  for (let i = 1; i <= 12; i++) {
    const a = addDays(ws, -7 * i), b = addDays(a, 6);
    if (state.settings.deloadUntil && state.settings.deloadUntil >= a && state.settings.deloadUntil <= addDays(b, 7)) break;
    const k = state.sessions.filter((s) => s.date >= a && s.date <= b && s.tplKind === 'upper').length;
    if (k >= 2) n++; else break;
  }
  return n;
}

// ---------- Porady ----------
export function tips() {
  const out = [];
  const st = runStats();
  const g = state.goal;
  if (!g.set) out.push({ lvl: 'info', title: 'Ustaw cel treningowy', text: 'Cel steruje doborem treningów (proporcje siłownia / bieganie, typ akcentów biegowych).', action: 'goal' });
  if (!state.runs.length) out.push({ lvl: 'info', title: 'Zaimportuj biegi', text: 'Wgraj eksport CSV z Garmin Connect lub pliki .FIT – aplikacja wyliczy Twoje tempa treningowe (VDOT).', action: 'import' });

  const daysToRace = g.targetDate ? diffDays(g.targetDate, today()) : null;
  if (daysToRace != null && daysToRace >= 0 && daysToRace <= 14) {
    out.push({ lvl: 'warn', title: daysToRace <= 3 ? 'Start tuż-tuż' : `Taper – start za ${daysToRace} dni`, text: daysToRace <= 3 ? 'Tylko krótkie rozbieganie z 3–4 rytmami. Bez siłowni nóg, sen i węglowodany.' : 'Zmniejsz kilometraż o 30–50%, zachowaj krótkie akcenty w tempie startowym. Nogi na siłowni odpuść ostatnie 7–10 dni.' });
  }
  if (st.acwr && st.acwr > 1.5 && st.chronic > 5) out.push({ lvl: 'warn', title: 'Skok kilometrażu', text: `Ostatnie 7 dni: ${fmtNum(st.acute)} km vs średnio ${fmtNum(st.chronic)} km/tydz. (×${fmtNum(st.acwr, 2)}). Ryzyko przeciążenia rośnie powyżej ×1,5 – następny bieg spokojny.` });
  if (st.prev4 > 12 && st.avg4 < st.prev4 * 0.65) out.push({ lvl: 'info', title: 'Objętość biegowa spadła', text: `Śr. ${fmtNum(st.avg4)} km/tydz. (wcześniej ${fmtNum(st.prev4)}). Wracaj stopniowo: maks. +10–15% tygodniowo; tempa liczone są z aktualnej formy, nie szczytowej.` });
  if (st.greyShare != null && st.easyCount >= 3 && st.greyShare >= 0.5) out.push({ lvl: 'warn', title: 'Spokojne biegi za szybko', text: `${Math.round(st.greyShare * 100)}% Twoich nieakcentowanych biegów (6 tyg.) to strefa Z3+ (tętno ≥ ${Math.round(hrMax() * 0.78)}). Zasada 80/20: spokojne naprawdę spokojnie (< ${Math.round(hrMax() * 0.78)} bpm), a siłę zostaw na akcenty.` });
  if (st.cadence && st.cadence < 166) out.push({ lvl: 'info', title: 'Kadencja', text: `Średnio ${Math.round(st.cadence)} kroków/min. Podniesienie o ~5% (≈${Math.round(st.cadence * 1.05)}) na spokojnych biegach skraca krok i zmniejsza obciążenie kolan i bioder. Pomaga metronom w zegarku.` });
  if (['hm', 'm'].includes(g.runFocus) && st.daysSinceRun != null && !state.runs.some((r) => isRun(r) && classify(r) === 'L' && diffDays(today(), r.date) <= 14)) out.push({ lvl: 'info', title: 'Brak długiego biegu', text: 'Przy celu półmaraton/maraton długi bieg co 7–10 dni to podstawa. Zaplanuj slot ≥ 75 min.' });

  const lastAny = [...state.sessions.map((s) => s.date), ...state.runs.map((r) => r.date.slice(0, 10))].sort().pop();
  if (lastAny && diffDays(today(), lastAny) >= 7) out.push({ lvl: 'info', title: 'Powrót po przerwie', text: `Ostatni trening ${diffDays(today(), lastAny)} dni temu. Pierwsza sesja: −1 seria lub ~90% ciężaru, bieg spokojny zamiast akcentu.` });

  const stalls = [];
  for (const t of state.templates) for (const e of t.exercises) if (stalled(e.name, e.equip) && !stalls.includes(e.name)) stalls.push(e.name);
  if (stalls.length >= 3 && !isDeload()) out.push({ lvl: 'warn', title: 'Kilka ćwiczeń stoi w miejscu', text: `${stalls.slice(0, 3).join(', ')}… Najczęściej pomaga tydzień deload (−1 seria, ~90% ciężaru).`, action: 'deload' });
  else for (const n of stalls.slice(0, 2)) out.push({ lvl: 'info', title: 'Stagnacja', text: `${n}: 3 sesje bez poprawy szacowanego 1RM. Opcje: zmiana zakresu powtórzeń, wolniejsza ekscentryka, lub wariant ćwiczenia. Szczegóły w zakładce Plan → Optymalizacja.` });
  const wsd = weeksSinceDeload();
  if (wsd >= 6 && !isDeload() && stalls.length < 3) out.push({ lvl: 'info', title: 'Czas na deload?', text: `${wsd} tygodni regularnej siłowni z rzędu. Lżejszy tydzień co 6–8 tygodni pomaga utrzymać progres i stawy.`, action: 'deload' });
  if (isDeload()) out.push({ lvl: 'good', title: 'Tydzień deload aktywny', text: `Do ${state.settings.deloadUntil}: mniej serii, lżej, bez akcentów maksymalnych.`, action: 'undeload' });

  const ws = weekStart(today());
  const ms = muscleSets(addDays(ws, -28), addDays(ws, -1));
  const weeksWithData = state.sessions.filter((s) => s.date >= addDays(ws, -28) && s.date < ws).length;
  if (weeksWithData >= 3) {
    const low = ['klatka', 'plecy', 'barki_b'].filter((m) => (ms[m] || 0) / 4 < MUSCLE_RANGE[m][0]);
    if (low.length && ['recomp', 'hybrid', 'strength'].includes(g.type)) out.push({ lvl: 'info', title: 'Niska objętość tygodniowa', text: `${low.map((m) => MUSCLES[m]).join(', ')}: śr. ${low.map((m) => fmtNum((ms[m] || 0) / 4)).join(' / ')} serii/tydz. (zalecane ${low.map((m) => MUSCLE_RANGE[m][0]).join(' / ')}+). Zobacz Plan → Optymalizacja.` });
  }
  return out;
}

// ---------- Optymalizacja planu ----------
export function planSuggestions() {
  const out = [];
  const up = avgPerWeek('upper');
  const totalUp = state.sessions.filter((s) => s.tplKind === 'upper').length;
  const boosted = state.settings.freqBoost;
  if (totalUp >= 3 && up < 1.5 && !boosted) {
    out.push({ id: 'freq+', title: 'Mało sesji góry → więcej serii na sesję', text: `Średnio ${fmtNum(up)} sesji górnych/tydz. Przy takiej częstotliwości klatka i plecy dostają poniżej 10 serii tygodniowo. Dodaj 1 serię do par APS (3 → 4), żeby wyrównać objętość.`, apply: 'freqBoost' });
  }
  if (boosted && up >= 2.2) {
    out.push({ id: 'freq-', title: 'Częściej trenujesz → wróć do 3 serii', text: `Średnio ${fmtNum(up)} sesji górnych/tydz. – objętość jest wystarczająca, możesz zdjąć dodatkową serię z APS.`, apply: 'freqUnboost' });
  }
  for (const t of state.templates) {
    for (const e of t.exercises) {
      if (!stalled(e.name, e.equip)) continue;
      if (e.repMax <= 12 && e.unit === 'reps') out.push({ id: 'rr:' + e.id, title: `Stagnacja: ${e.name}`, text: `Zmień zakres ${e.repMin}–${e.repMax} → ${e.repMin + 2}–${e.repMax + 2} na 4–6 tygodni (nowy bodziec, mniejsze obciążenie stawów), potem wróć.`, apply: 'repShift', tplId: t.id, exId: e.id });
    }
  }
  const ms = muscleSets(addDays(today(), -28), today());
  const totalRuns = state.runs.filter((r) => isRun(r) && diffDays(today(), r.date) <= 28).length;
  const st = runStats();
  const focus = state.goal.runFocus || '10k';
  const kmCap = { '5k': 40, '10k': 50, hm: 60, m: 80, none: 35 }[focus];
  const nextKm = clamp(Math.max(st.avg4, st.acute) * 1.12, 12, kmCap);
  out.push({ id: 'km', title: `Kilometraż na ten tydzień: ~${Math.round(nextKm)} km`, text: `Średnia z 4 tygodni: ${fmtNum(st.avg4)} km. Progresja maks. ~10–15%/tydz., co 4. tydzień lżej. Docelowo dla ${FOCUS[focus]}: ${Math.round(kmCap * 0.6)}–${kmCap} km.` });
  if (totalRuns >= 4) {
    const q = state.runs.filter((r) => isRun(r) && diffDays(today(), r.date) <= 28 && RUN_TYPES[classify(r)].cat === 'runQ').length;
    if (q / totalRuns > 0.4) out.push({ id: 'q', title: 'Za dużo akcentów biegowych', text: `${q} z ${totalRuns} biegów w 4 tyg. to akcenty. Przy niskim kilometrażu 1 akcent/tydz. wystarczy – reszta Z2.` });
  }
  if ((ms.lydki || 0) === 0 && state.sessions.length > 4) out.push({ id: 'calf', title: 'Łydki i ścięgna', text: 'Wspięcia na łydki chronią przed kontuzjami Achillesa przy bieganiu – nie pomijaj ich w Lower & Mobility.' });
  return out;
}

export function applySuggestion(sug) {
  if (sug.apply === 'freqBoost' || sug.apply === 'freqUnboost') {
    const d = sug.apply === 'freqBoost' ? 1 : -1;
    for (const t of state.templates) if (t.kind === 'upper') for (const e of t.exercises) if (e.prio === 1) e.sets = clamp(e.sets + d, 1, 6);
    state.settings.freqBoost = d > 0;
  } else if (sug.apply === 'repShift') {
    const t = state.templates.find((x) => x.id === sug.tplId);
    const e = t?.exercises.find((x) => x.id === sug.exId);
    if (e) { e.repMin += 2; e.repMax += 2; }
  }
}

export function upcomingQuality() {
  return ['I', 'T', 'L', 'E'].map((t) => buildRun(t, 70));
}
export { estimateVdot, DAYS, dayIdx };
