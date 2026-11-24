// Stan aplikacji, plan domyślny, zapis w localStorage
import { uid } from './util.js';

const KEY = 'hybryda-tracker-v1';

export const MUSCLES = {
  klatka: 'Klatka', plecy: 'Plecy', barki_b: 'Barki (bok)', barki_t: 'Barki (tył)', barki_p: 'Barki (przód)',
  biceps: 'Biceps', triceps: 'Triceps', brzuch: 'Brzuch', nogi: 'Nogi / pośladki', dwuglowe: 'Dwugłowe / pośladki',
  prostowniki: 'Dół pleców', lydki: 'Łydki',
};
// Zalecana liczba twardych serii / tydzień (hipertrofia, rekompozycja)
export const MUSCLE_RANGE = {
  klatka: [10, 20], plecy: [10, 20], barki_b: [8, 20], barki_t: [6, 16], biceps: [6, 14], triceps: [6, 14],
  brzuch: [6, 12], nogi: [4, 10], dwuglowe: [4, 10], prostowniki: [3, 8], lydki: [4, 10],
};
export const EQUIP = { db: 'Hantle', bb: 'Sztanga', cable: 'Wyciąg', 'bw+': 'Masa ciała + obciążenie', bw: 'Masa ciała', machine: 'Maszyna' };

const ex = (name, sets, repMin, repMax, o = {}) => ({
  id: uid(), name, sets, repMin, repMax, unit: 'reps', rest: 90, inc: 2.5, equip: 'cable', muscles: {}, prio: 2, ss: '', note: '', ...o,
});
const mob = (name, dose, o = {}) => ({ id: uid(), name, dose, secs: 0, sets: 1, note: '', ...o });

export function defaultTemplates() {
  return [
    {
      id: 'UA', name: 'Upper A', kind: 'upper', desc: 'Siła bazowa, klatka & szerokość pleców',
      exercises: [
        ex('Wyciskanie hantli na skosie dodatnim (30°)', 3, 6, 8, { equip: 'db', inc: 2, rest: 90, prio: 1, ss: 'APS 1', muscles: { klatka: 1, barki_p: 0.5, triceps: 0.5 }, note: 'Klatka: serie 1–3' }),
        ex('Podciąganie na drążku z dociążeniem', 3, 5, 8, { equip: 'bw+', inc: 2.5, rest: 90, prio: 1, ss: 'APS 1', muscles: { plecy: 1, biceps: 0.5 }, note: 'Plecy: serie 1–3' }),
        ex('Rozpiętki na bramie z dolnego wyciągu (Low-to-High)', 3, 10, 12, { rest: 75, muscles: { klatka: 1 }, note: 'Klatka: serie 4–6' }),
        ex('Wiosłowanie hantlem jednorącz w oparciu o ławkę', 3, 8, 10, { equip: 'db', inc: 2, rest: 75, muscles: { plecy: 1, biceps: 0.5 }, note: 'Plecy: serie 4–6, ruch po łuku w kierunku biodra' }),
        ex('Wznosy bokiem na wyciągu (Cable Lateral Raises)', 3, 12, 15, { inc: 1.25, rest: 60, muscles: { barki_b: 1 }, note: 'Stałe napięcie' }),
        ex('Face Pulls do czoła z rotacją zewn.', 3, 12, 15, { rest: 60, muscles: { barki_t: 1, plecy: 0.3 }, note: 'Retrakcja łopatek, zdrowie stożka rotatorów' }),
        ex('Uginanie przedramion z supinacją na ławce skośnej', 2, 10, 12, { equip: 'db', inc: 1, rest: 60, prio: 3, ss: 'Ramiona', muscles: { biceps: 1 } }),
        ex('Prostowanie ramion na wyciągu z linką', 2, 10, 12, { rest: 60, prio: 3, ss: 'Ramiona', muscles: { triceps: 1 } }),
        ex('Wiszące unoszenie nóg do drążka', 3, 10, 12, { equip: 'bw', inc: 0, rest: 60, prio: 3, muscles: { brzuch: 1 }, note: 'Kontrola anty-przeprostna tułowia' }),
      ],
      mobility: [],
    },
    {
      id: 'UB', name: 'Upper B', kind: 'upper', desc: 'Hipertrofia, gęstość pleców & detal klatki',
      exercises: [
        ex('Dipsy na poręczach z dociążeniem', 3, 6, 8, { equip: 'bw+', inc: 2.5, rest: 90, prio: 1, ss: 'APS 1', muscles: { klatka: 1, triceps: 0.5 }, note: 'Klatka: serie 1–3, lekkie pochylenie w przód' }),
        ex('Ściąganie drążka wyciągu górnego do klatki', 3, 8, 10, { rest: 90, prio: 1, ss: 'APS 1', muscles: { plecy: 1, biceps: 0.5 }, note: 'Chwyt neutralny/szeroki. Plecy: serie 1–3' }),
        ex('Rozpiętki na bramie w siadzie (Seated Cable Fly)', 3, 10, 12, { rest: 75, muscles: { klatka: 1 }, note: 'Klatka: serie 4–6, pełne ustabilizowanie pleców' }),
        ex('Wiosłowanie na wyciągu dolnym (Seated Cable Row)', 3, 8, 10, { rest: 75, muscles: { plecy: 1, biceps: 0.5 }, note: 'Plecy: serie 4–6, pauza 1 s w pełnym skurczu' }),
        ex('Wznosy bokiem z hantlami', 3, 12, 15, { equip: 'db', inc: 1, rest: 60, muscles: { barki_b: 1 } }),
        ex('Odwrotne rozpiętki na bramie (Rear Delt Fly)', 3, 12, 15, { inc: 1.25, rest: 60, muscles: { barki_t: 1 } }),
        ex('Uginanie przedramion ze sztangą łamaną stojąc', 2, 8, 10, { equip: 'bb', inc: 2.5, rest: 60, prio: 3, ss: 'Ramiona', muscles: { biceps: 1 } }),
        ex('Wyciskanie francuskie ze sztangą leżąc (Skullcrushers)', 2, 10, 12, { equip: 'bb', inc: 2.5, rest: 60, prio: 3, ss: 'Ramiona', muscles: { triceps: 1 } }),
        ex('Allahy na wyciągu klęcząc (Cable Crunches)', 3, 10, 12, { rest: 60, prio: 3, muscles: { brzuch: 1 }, note: 'Lub Ab-Wheel' }),
      ],
      mobility: [],
    },
    {
      id: 'LM', name: 'Athletic Lower & Mobility', kind: 'lower', desc: 'Niska objętość nóg, sztywność ścięgien, dół pleców + mobilność',
      exercises: [
        ex('Cossack Squat', 2, 6, 8, { equip: 'db', inc: 2, rest: 90, prio: 1, muscles: { nogi: 1 }, note: 'Powtórzenia na stronę' }),
        ex('RDL jednonóż', 2, 8, 10, { equip: 'db', inc: 2, rest: 90, prio: 1, muscles: { dwuglowe: 1, prostowniki: 0.5 }, note: 'Powtórzenia na stronę' }),
        ex('Wyprosty na ławce rzymskiej', 2, 10, 15, { equip: 'bw+', inc: 2.5, rest: 75, prio: 2, muscles: { prostowniki: 1, dwuglowe: 0.5 } }),
        ex('Wspięcia na łydki', 3, 10, 15, { equip: 'machine', inc: 5, rest: 60, prio: 2, muscles: { lydki: 1 }, note: 'Pauza w rozciągnięciu – sztywność ścięgna Achillesa' }),
        ex('Brzuch (Pallof press / Dead bug)', 3, 10, 15, { rest: 45, prio: 3, muscles: { brzuch: 1 } }),
      ],
      mobility: defaultMobility(),
    },
    {
      id: 'MOB', name: 'Mobility & dekompresja', kind: 'mob', desc: 'Postawa, biodra, odcinek piersiowy, dekompresja kręgosłupa',
      exercises: [],
      mobility: defaultMobility(),
    },
  ];
}
function defaultMobility() {
  return [
    mob('Couch Stretch', '2 min / strona', { secs: 120, sets: 2, note: 'Zginacze bioder i czworogłowy; cofnięcie przodopochylenia miednicy' }),
    mob('90/90 Hip Flow z rotacją wewn.', '2 × 60 s / strona', { secs: 60, sets: 4, note: 'Zakres torebki stawowej biodra, płynność kroku' }),
    mob("Butcher's Block Stretch przy ławce", '3 × 45 s', { secs: 45, sets: 3, note: 'Najszersze i tricepsy, kąt zgięcia ramienia' }),
    mob('Rolowanie odcinka piersiowego z wyprostem', '3 min', { secs: 180, sets: 1, note: 'Przeciw zaokrąglonym plecom' }),
    mob('Prone Y-T-W / Wall Slides', '3 × 8–10', { secs: 0, sets: 3, note: 'Dolny czworoboczny i równoległoboczne' }),
    mob('Pasywny zwis na drążku (Dead Hang)', '3 × 30–45 s', { secs: 40, sets: 3, note: 'Dekompresja krążków, odciążenie lędźwi' }),
  ];
}

export function defaultState() {
  return {
    v: 1,
    goal: { type: 'hybrid', runFocus: '10k', targetTime: '', targetDate: '', note: '', set: false },
    settings: { hrMax: null, hrMaxAuto: true, hrRest: 55, vdotOverride: null, bodyWeight: null, deloadUntil: null, sound: true, barKg: 20, slotTime: '18:00', reminder: 60,
      aiKey: '', aiModel: 'gemini-4-hydrogen', aiGrounding: false, strava: { clientId: '', clientSecret: '', refresh: '', access: '', expires: 0, athlete: '', lastSync: 0, error: '' } },
    templates: defaultTemplates(),
    sessions: [],   // zalogowane treningi siłowe / mobility
    runs: [],       // biegi i cardio (CSV / FIT / ręcznie)
    plan: [],       // zaplanowane sloty {id,date,minutes,override,energy,status,doneType,doneRef}
    bodyweight: [], // {date, kg}
    active: null,   // trwający trening
    chat: [],       // rozmowa z asystentem AI
    memory: { profile: '', facts: [] }, // co asystent wie o użytkowniku
  };
}

export let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { console.warn('load failed', e); }
  return defaultState();
}
function migrate(s) {
  const d = defaultState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  s.goal = { ...d.goal, ...s.goal };
  s.settings = { ...d.settings, ...s.settings };
  s.settings.strava = { ...d.settings.strava, ...(s.settings.strava || {}) };
  s.memory = { profile: '', facts: [], ...(s.memory || {}) };
  if (!s.settings.aiModel || /gemini-(1|2)\./.test(s.settings.aiModel)) s.settings.aiModel = 'gemini-4-hydrogen';
  return s;
}
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert('Nie udało się zapisać danych: ' + e.message); }
}
export function replaceState(next) { state = migrate(next); save(); }
export function resetState() { state = defaultState(); save(); }
export function tpl(id) { return state.templates.find((t) => t.id === id); }

export async function requestPersist() {
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch (e) { /* ignore */ }
}

// Sekrety nie trafiają do kopii zapasowej
export function exportable() {
  const copy = JSON.parse(JSON.stringify(state));
  copy.settings.aiKey = '';
  copy.settings.strava = { ...copy.settings.strava, clientSecret: '', refresh: '', access: '', expires: 0 };
  return copy;
}
export function importBackup(data) {
  const keep = { aiKey: state.settings.aiKey, strava: state.settings.strava };
  replaceState(data);
  if (!state.settings.aiKey) state.settings.aiKey = keep.aiKey;
  if (!state.settings.strava.refresh) state.settings.strava = keep.strava;
  save();
}

// Zamienniki ćwiczeń (klucz: nazwa małymi literami)
export const SUBS = {
  'wyciskanie hantli na skosie dodatnim (30°)': ['Wyciskanie sztangi na skosie dodatnim', 'Wyciskanie na maszynie Smitha (skos)', 'Wyciskanie na maszynie hammer (skos)'],
  'podciąganie na drążku z dociążeniem': ['Podciąganie bez obciążenia (wolna ekscentryka)', 'Ściąganie drążka wyciągu górnego do klatki', 'Podciąganie z gumą'],
  'rozpiętki na bramie z dolnego wyciągu (low-to-high)': ['Rozpiętki z hantlami na skosie dodatnim', 'Pec deck'],
  'wiosłowanie hantlem jednorącz w oparciu o ławkę': ['Wiosłowanie na wyciągu jednorącz', 'Wiosłowanie na maszynie (chest-supported)', 'Wiosłowanie sztangą w opadzie'],
  'wznosy bokiem na wyciągu (cable lateral raises)': ['Wznosy bokiem z hantlami', 'Wznosy bokiem na maszynie'],
  'face pulls do czoła z rotacją zewn.': ['Odwrotne rozpiętki na bramie (Rear Delt Fly)', 'Odwrotne rozpiętki z hantlami w opadzie', 'Reverse pec deck'],
  'uginanie przedramion z supinacją na ławce skośnej': ['Uginanie na modlitewniku', 'Uginanie na wyciągu dolnym', 'Uginanie z hantlami stojąc'],
  'prostowanie ramion na wyciągu z linką': ['Prostowanie ramion nad głową na wyciągu', 'Prostowanie na wyciągu drążkiem prostym'],
  'wiszące unoszenie nóg do drążka': ['Unoszenie kolan w podporze (captain\'s chair)', 'Odwrotne brzuszki na ławce', 'Ab-Wheel'],
  'dipsy na poręczach z dociążeniem': ['Wyciskanie hantli na ławce płaskiej', 'Dipsy na maszynie', 'Pompki z obciążeniem'],
  'ściąganie drążka wyciągu górnego do klatki': ['Podciąganie chwytem neutralnym', 'Ściąganie jednorącz na wyciągu', 'Pullover na wyciągu'],
  'rozpiętki na bramie w siadzie (seated cable fly)': ['Pec deck', 'Rozpiętki z hantlami na ławce płaskiej'],
  'wiosłowanie na wyciągu dolnym (seated cable row)': ['Wiosłowanie na maszynie (chest-supported)', 'Wiosłowanie hantlem jednorącz w oparciu o ławkę'],
  'wznosy bokiem z hantlami': ['Wznosy bokiem na wyciągu (Cable Lateral Raises)', 'Wznosy bokiem na maszynie'],
  'odwrotne rozpiętki na bramie (rear delt fly)': ['Face Pulls do czoła z rotacją zewn.', 'Reverse pec deck'],
  'uginanie przedramion ze sztangą łamaną stojąc': ['Uginanie z hantlami stojąc', 'Uginanie na wyciągu dolnym'],
  'wyciskanie francuskie ze sztangą leżąc (skullcrushers)': ['Wyciskanie francuskie hantlami', 'Prostowanie ramion nad głową na wyciągu', 'Prostowanie ramion na wyciągu z linką'],
  'allahy na wyciągu klęcząc (cable crunches)': ['Ab-Wheel', 'Wiszące unoszenie nóg do drążka'],
  'cossack squat': ['Wykroki boczne z hantlami', 'Bułgarskie przysiady (lekko)'],
  'rdl jednonóż': ['RDL z hantlami (obunóż)', 'Hip thrust', 'Uginanie nóg na maszynie'],
  'wyprosty na ławce rzymskiej': ['Reverse hyper', 'Good morning z lekką sztangą', 'Bird-dog'],
  'wspięcia na łydki': ['Wspięcia na łydki na suwnicy', 'Wspięcia jednonóż ze schodka'],
  'brzuch (pallof press / dead bug)': ['Dead bug', 'Plank boczny', 'Ab-Wheel'],
};
