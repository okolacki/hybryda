// Akcje proponowane przez asystenta AI (function calling). Nic nie zmienia się bez zatwierdzenia użytkownika.
import { state, save, MUSCLES } from './store.js';
import { uid, normKey, clamp, today, fmtDateLong, addDays } from './util.js';
import { GOALS, FOCUS, candidates, candByKey } from './engine.js';

const S = (description, extra = {}) => ({ type: 'STRING', description, ...extra });
const N = (description) => ({ type: 'INTEGER', description });

export function declarations() {
  const tplNames = state.templates.map((t) => `${t.id} = ${t.name}`).join('; ');
  const keys = candidates().map((c) => c.key);
  return [
    { name: 'update_exercise', description: `Zmień parametry ćwiczenia w szablonie planu siłowego. Szablony: ${tplNames}.`,
      parameters: { type: 'OBJECT', properties: {
        template: S('ID lub nazwa szablonu, np. UA'), exercise: S('Dokładna nazwa ćwiczenia z planu'),
        sets: N('Nowa liczba serii (1–8)'), rep_min: N('Nowe minimum powtórzeń'), rep_max: N('Nowe maksimum powtórzeń'),
        rest_sec: N('Przerwa w sekundach'), new_name: S('Nowa nazwa (zamiana ćwiczenia)'), note: S('Wskazówka techniczna'),
      }, required: ['template', 'exercise'] } },
    { name: 'add_exercise', description: 'Dodaj ćwiczenie do szablonu.',
      parameters: { type: 'OBJECT', properties: {
        template: S('ID lub nazwa szablonu'), name: S('Nazwa ćwiczenia'), sets: N('Serie'), rep_min: N('Min powtórzeń'), rep_max: N('Max powtórzeń'),
        rest_sec: N('Przerwa w sekundach'), priority: N('1 kluczowe, 2 akcesoria, 3 opcjonalne'),
        muscle: S('Główna partia', { enum: Object.keys(MUSCLES) }), note: S('Wskazówka'),
      }, required: ['template', 'name', 'sets', 'rep_min', 'rep_max'] } },
    { name: 'remove_exercise', description: 'Usuń ćwiczenie z szablonu.',
      parameters: { type: 'OBJECT', properties: { template: S('ID lub nazwa szablonu'), exercise: S('Nazwa ćwiczenia') }, required: ['template', 'exercise'] } },
    { name: 'plan_session', description: 'Zaplanuj slot treningowy w danym dniu (aplikacja sama dobiera trening, chyba że podasz workout).',
      parameters: { type: 'OBJECT', properties: {
        date: S('Data YYYY-MM-DD (dziś lub przyszłość)'), minutes: N('Dostępny czas w minutach'), time: S('Godzina HH:MM (opcjonalnie)'),
        workout: S('Konkretny trening lub "auto"', { enum: ['auto', ...keys] }),
      }, required: ['date', 'minutes'] } },
    { name: 'set_goal', description: 'Zmień cel treningowy użytkownika.',
      parameters: { type: 'OBJECT', properties: {
        type: S('Typ celu', { enum: Object.keys(GOALS) }), run_focus: S('Dystans docelowy', { enum: Object.keys(FOCUS) }),
        target_time: S('Docelowy czas, np. 44:59 lub 1:39:00'), target_date: S('Data startu YYYY-MM-DD'),
      } } },
    { name: 'set_deload', description: 'Włącz (na 7 dni) lub wyłącz tydzień deload.',
      parameters: { type: 'OBJECT', properties: { active: { type: 'BOOLEAN', description: 'true = włącz' } }, required: ['active'] } },
    { name: 'remember', description: 'Zapamiętaj trwały fakt o użytkowniku (kontuzja, sprzęt, preferencja, ograniczenie czasowe). Tylko fakty podane przez użytkownika.',
      parameters: { type: 'OBJECT', properties: { fact: S('Krótki fakt, 1 zdanie') }, required: ['fact'] } },
  ];
}

// ---------- wyszukiwanie ----------
function findTpl(q) {
  if (!q) return null;
  const k = normKey(q);
  return state.templates.find((t) => normKey(t.id) === k) || state.templates.find((t) => normKey(t.name) === k)
    || state.templates.find((t) => normKey(t.name).includes(k) || k.includes(normKey(t.name)));
}
function findEx(t, q) {
  if (!t || !q) return null;
  const k = normKey(q);
  const ex = t.exercises;
  const hit = ex.find((e) => normKey(e.name) === k) || ex.find((e) => normKey(e.name).includes(k) || k.includes(normKey(e.name)));
  if (hit) return hit;
  const words = k.split(/[\s(),/-]+/).filter((w) => w.length > 3);
  let best = null, bs = 0;
  for (const e of ex) { const n = normKey(e.name); const sc = words.filter((w) => n.includes(w)).length; if (sc > bs) { bs = sc; best = e; } }
  return bs >= Math.max(2, Math.ceil(words.length * 0.6)) ? best : null;
}
const int = (v, lo, hi) => (v == null || isNaN(+v) ? null : clamp(Math.round(+v), lo, hi));

// ---------- opis (podgląd zmian) ----------
export function describe(a) {
  const x = a.args || {};
  try {
    switch (a.name) {
      case 'update_exercise': {
        const t = findTpl(x.template); if (!t) return bad(`Nie znaleziono szablonu „${x.template}”`);
        const e = findEx(t, x.exercise); if (!e) return bad(`Brak ćwiczenia „${x.exercise}” w ${t.name}`);
        const ch = [];
        const s = int(x.sets, 1, 8); if (s != null && s !== e.sets) ch.push(`serie ${e.sets} → ${s}`);
        const lo = int(x.rep_min, 1, 50), hi = int(x.rep_max, 1, 60);
        if ((lo != null && lo !== e.repMin) || (hi != null && hi !== e.repMax)) ch.push(`zakres ${e.repMin}–${e.repMax} → ${lo ?? e.repMin}–${hi ?? e.repMax}`);
        const r = int(x.rest_sec, 15, 600); if (r != null && r !== e.rest) ch.push(`przerwa ${e.rest}s → ${r}s`);
        if (x.new_name && x.new_name.trim() !== e.name) ch.push(`zamiana na „${x.new_name.trim()}”`);
        if (x.note) ch.push(`notatka: „${x.note}”`);
        if (!ch.length) return bad(`${e.name}: brak zmian`);
        return ok(`${t.name} · ${e.name}: ${ch.join(', ')}`);
      }
      case 'add_exercise': {
        const t = findTpl(x.template); if (!t) return bad(`Nie znaleziono szablonu „${x.template}”`);
        if (!x.name) return bad('Brak nazwy ćwiczenia');
        if (findEx(t, x.name) && normKey(findEx(t, x.name).name) === normKey(x.name)) return bad(`${x.name} już jest w ${t.name}`);
        return ok(`${t.name}: dodaj „${x.name}” ${int(x.sets, 1, 8) || 3}×${int(x.rep_min, 1, 50) || 8}–${int(x.rep_max, 1, 60) || 12}`);
      }
      case 'remove_exercise': {
        const t = findTpl(x.template); if (!t) return bad(`Nie znaleziono szablonu „${x.template}”`);
        const e = findEx(t, x.exercise); if (!e) return bad(`Brak ćwiczenia „${x.exercise}” w ${t.name}`);
        return ok(`${t.name}: usuń „${e.name}”`);
      }
      case 'plan_session': {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || '')) return bad('Nieprawidłowa data');
        if (x.date < today()) return bad(`${x.date} jest w przeszłości`);
        if (x.date > addDays(today(), 60)) return bad('Data dalej niż 60 dni');
        const m = int(x.minutes, 15, 300); if (!m) return bad('Brak czasu treningu');
        const c = x.workout && x.workout !== 'auto' ? candByKey(x.workout) : null;
        if (x.workout && x.workout !== 'auto' && !c) return bad(`Nieznany trening „${x.workout}”`);
        return ok(`${fmtDateLong(x.date)}${x.time ? ' ' + x.time : ''}: slot ${m} min – ${c ? c.label : 'dobór automatyczny'}`);
      }
      case 'set_goal': {
        const ch = [];
        if (x.type) { if (!GOALS[x.type]) return bad('Nieznany typ celu'); ch.push(`cel: ${GOALS[x.type].label}`); }
        if (x.run_focus) { if (!FOCUS[x.run_focus]) return bad('Nieznany dystans'); ch.push(`dystans: ${FOCUS[x.run_focus]}`); }
        if (x.target_time) ch.push(`czas: ${x.target_time}`);
        if (x.target_date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(x.target_date)) return bad('Nieprawidłowa data startu'); ch.push(`start: ${x.target_date}`); }
        return ch.length ? ok(`Cel → ${ch.join(', ')}`) : bad('Brak zmian celu');
      }
      case 'set_deload': return ok(x.active ? 'Włącz tydzień deload (7 dni)' : 'Wyłącz deload');
      case 'remember': return x.fact ? ok(`Zapamiętaj: „${String(x.fact).slice(0, 200)}”`) : bad('Pusty fakt');
      default: return bad(`Nieznana akcja ${a.name}`);
    }
  } catch (e) { return bad(e.message); }
}
const ok = (text) => ({ ok: true, text });
const bad = (text) => ({ ok: false, text });

// ---------- zastosowanie ----------
export function apply(a) {
  const d = describe(a);
  if (!d.ok) throw new Error(d.text);
  const x = a.args || {};
  switch (a.name) {
    case 'update_exercise': {
      const e = findEx(findTpl(x.template), x.exercise);
      const s = int(x.sets, 1, 8); if (s != null) e.sets = s;
      const lo = int(x.rep_min, 1, 50), hi = int(x.rep_max, 1, 60);
      if (lo != null) e.repMin = lo; if (hi != null) e.repMax = Math.max(hi, e.repMin);
      const r = int(x.rest_sec, 15, 600); if (r != null) e.rest = r;
      if (x.new_name && x.new_name.trim() !== e.name) { e.alts = [...new Set([...(e.alts || []), e.name])]; e.name = x.new_name.trim(); }
      if (x.note) e.note = String(x.note);
      break;
    }
    case 'add_exercise': {
      const t = findTpl(x.template);
      t.exercises.push({ id: uid(), name: x.name.trim(), sets: int(x.sets, 1, 8) || 3, repMin: int(x.rep_min, 1, 50) || 8, repMax: int(x.rep_max, 1, 60) || 12,
        unit: 'reps', rest: int(x.rest_sec, 15, 600) || 75, inc: 2.5, equip: /hantl/i.test(x.name) ? 'db' : /sztang/i.test(x.name) ? 'bb' : 'cable',
        muscles: x.muscle && MUSCLES[x.muscle] ? { [x.muscle]: 1 } : {}, prio: int(x.priority, 1, 3) || 2, ss: '', note: x.note || '' });
      break;
    }
    case 'remove_exercise': {
      const t = findTpl(x.template), e = findEx(t, x.exercise);
      t.exercises = t.exercises.filter((z) => z !== e);
      break;
    }
    case 'plan_session': {
      state.plan.push({ id: uid(), date: x.date, minutes: int(x.minutes, 15, 300), time: /^\d{1,2}:\d{2}$/.test(x.time || '') ? x.time.padStart(5, '0') : null,
        energy: 0, override: x.workout && x.workout !== 'auto' ? x.workout : null, status: 'planned', created: Date.now() });
      break;
    }
    case 'set_goal': {
      if (x.type) state.goal.type = x.type;
      if (x.run_focus) state.goal.runFocus = x.run_focus;
      if (x.target_time) state.goal.targetTime = String(x.target_time);
      if (x.target_date) state.goal.targetDate = x.target_date;
      state.goal.set = true;
      break;
    }
    case 'set_deload': state.settings.deloadUntil = x.active ? addDays(today(), 6) : null; break;
    case 'remember': addFact(String(x.fact).slice(0, 200)); break;
  }
  save();
}

// ---------- pamięć ----------
export function addFact(text) {
  text = text.trim();
  if (!text || state.memory.facts.some((f) => normKey(f.text) === normKey(text))) return;
  state.memory.facts.push({ id: uid(), text, at: today() });
  if (state.memory.facts.length > 40) state.memory.facts.shift();
}
