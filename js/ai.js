// Asystent AI – Google Gemini API (klucz z Google AI Studio, przechowywany tylko na urządzeniu)
import { state } from './store.js';
import { today, weekStart, addDays, fmtPace, fmtDur, fmtNum, esc } from './util.js';
import { GOALS, FOCUS, weekSummary, history, tips, assignWeek, CAT_LABEL } from './engine.js';
import { estimateVdot, paces, isRun, classify, RUN_TYPES, runPace, hrMax, weeklyKm, predict } from './running.js';
import { weekReport, reportText } from './report.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export async function listModels(key) {
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw new Error(await errText(res));
  const data = await res.json();
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name) && !/embedding|image|tts|audio|live/i.test(m.name))
    .map((m) => ({ id: m.name.replace('models/', ''), label: m.displayName || m.name }));
}

async function errText(res) {
  try { const j = await res.json(); return j.error?.message || `HTTP ${res.status}`; } catch (e) { return `HTTP ${res.status}`; }
}

export function buildContext() {
  const g = state.goal, s = state.settings;
  const est = estimateVdot();
  const p = est.vdot ? paces(est.vdot) : null;
  const ws = weekStart(today());
  const asg = assignWeek(ws);
  const strength = {};
  for (const t of state.templates) for (const e of t.exercises) {
    const h = history(e.name).slice(0, 4);
    if (h.length) strength[e.name] = h.map((x) => `${x.date}: ${x.sets.map((z) => (z.w ? z.w + '×' : '') + z.r + (z.rir != null ? '@' + z.rir : '')).join(', ')}`);
  }
  const runs = state.runs.filter((r) => isRun(r) || /cycl/i.test(r.type)).slice(0, 30).map((r) =>
    `${r.date.slice(0, 10)} ${r.type === 'Running' ? '' : r.type + ' '}${RUN_TYPES[classify(r)].label}: ${fmtNum(r.distKm, 2)} km, ${fmtDur(r.timeSec)}${isRun(r) ? ', ' + fmtPace(runPace(r)) + '/km' : ''}${r.avgHr ? ', HR ' + r.avgHr + (r.maxHr ? '/' + r.maxHr : '') : ''}${r.cadence ? ', kadencja ' + r.cadence : ''} "${r.title || ''}"`);
  return {
    dzis: today(),
    cel: { typ: GOALS[g.type]?.label, opis: GOALS[g.type]?.desc, dystans: FOCUS[g.runFocus], docelowy_czas: g.targetTime || null, data_startu: g.targetDate || null, notatka: g.note || null, tydzien_idealny: GOALS[g.type]?.targets },
    profil: { hrMax: hrMax(), hrSpoczynkowe: s.hrRest, masa_ciala: s.bodyWeight || state.bodyweight.slice(-1)[0]?.kg || null, deload_do: s.deloadUntil },
    bieganie: est.vdot ? {
      vdot: est.vdot, zrodlo: est.source, szczyt_6mies: est.peak ? fmtNum(est.peak.v) : null,
      tempa: { E: `${fmtPace(p.E[0])}-${fmtPace(p.E[1])}`, M: fmtPace(p.M), T: fmtPace(p.T), I: fmtPace(p.I), R: fmtPace(p.R) },
      prognozy: { '5k': fmtDur(predict(est.vdot, 5000)), '10k': fmtDur(predict(est.vdot, 10000)), hm: fmtDur(predict(est.vdot, 21097.5)) },
      km_tygodniowo_12tyg: weeklyKm(12).map((w) => `${w.ws}: ${fmtNum(w.km)}`),
      ostatnie_aktywnosci: runs,
    } : 'brak danych biegowych',
    plan_silowy: state.templates.map((t) => ({ nazwa: t.name, typ: t.kind, opis: t.desc, cwiczenia: t.exercises.map((e) => `${e.name}: ${e.sets}×${e.repMin}-${e.repMax}${e.ss ? ' [' + e.ss + ']' : ''} (priorytet ${e.prio})`), mobilnosc: t.mobility.map((m) => `${m.name} ${m.dose}`) })),
    historia_silowa_ostatnie_4_sesje: strength,
    biezacy_tydzien: {
      wykonane: Object.fromEntries(Object.entries(weekSummary(ws).counts).map(([k, v]) => [CAT_LABEL[k] || k, v])),
      sloty: state.plan.filter((x) => x.date >= ws && x.date <= addDays(ws, 6)).map((x) => `${x.date} ${x.minutes} min: ${x.status === 'done' ? 'zrobione' : asg[x.id]?.cand?.label || asg[x.id]?.status}`),
    },
    poprzedni_tydzien: reportText(weekReport(addDays(ws, -7))),
    porady_aplikacji: tips().map((t) => `${t.title}: ${t.text}`),
  };
}

// Kolejność modeli: główny + zapasowy (ID potwierdzone w dokumentacji Gemini API, listopad 2026)
export const MODEL_CHAIN = ['gemini-4-hydrogen', 'gemini-3.8-flash'];
const THINKING = { 'gemini-4-hydrogen': 'high', 'gemini-3.8-flash': 'high' };
export const MODEL_INFO = {
  'gemini-4-hydrogen': 'Główny – najnowszy, najlepsze rozumowanie',
  'gemini-3.8-flash': 'Zapasowy – stabilny i szybki',
};
export function chain() {
  const cur = state.settings.aiModel;
  const first = cur && !/gemini-(1|2)\./.test(cur) ? cur : MODEL_CHAIN[0];
  return [first, ...MODEL_CHAIN.filter((m) => m !== first)];
}

// Zwięzła baza wiedzy (konsensus naukowy), żeby model nie zgadywał zasad treningu
const KNOWLEDGE = `BAZA WIEDZY (stosuj; jeśli pytanie wykracza poza nią i poza DANE – powiedz to wprost):
Bieganie: intensywność wg VDOT Danielsa (E ok. 59–74% VO2max, M, T ok. 88%, I ok. 97–100%, R szybsze od I). Ok. 80% czasu w Z1–Z2, akcenty 1–2/tydz. przy < 40 km/tydz. Długi bieg ≤ ok. 30% tygodniowego kilometrażu. Wzrost objętości ok. 10%/tydz., co 3–4 tyg. tydzień lżejszy. ACWR 0,8–1,3 bezpieczny, > 1,5 ryzyko przeciążeń. Taper 7–14 dni: −30–50% objętości, intensywność zachowana. Kadencja: +5–10% na spokojnych biegach zmniejsza obciążenie kolan i bioder. Interwały I: odcinki 3–5 min, przerwy równe lub krótsze, łącznie ≤ ok. 8% tygodniowego kilometrażu; T łącznie ≤ ok. 10%.
Siła / hipertrofia: 10–20 twardych serii na partię tygodniowo (minimum ok. 6–10 daje progres); 2×/tydz. na partię optymalnie, gdy możliwe; serie 0–3 RIR; zakres 5–30 powtórzeń skuteczny przy bliskości upadku; podwójna progresja; deload co 4–8 tyg. lub przy stagnacji (−30–50% objętości). Pary antagonistyczne (APS) oszczędzają czas bez utraty efektu.
Trening równoległy: interferencja dotyczy głównie siły i mocy nóg przy dużej objętości biegowej; ciężkie nogi i akcenty biegowe rozdzielaj o 24–48 h; spokojny bieg po treningu góry nie szkodzi hipertrofii góry. Rekompozycja: białko 1,6–2,2 g/kg, umiarkowany deficyt.
Regeneracja: sen 7–9 h. Ból ostry/kłujący, obrzęk lub ból zmieniający technikę → przerwa i fizjoterapeuta (nie diagnozuj).`;

function systemPrompt() {
  return `Jesteś trenerem przygotowania hybrydowego (siłownia + bieganie) w aplikacji „Hybryda”. Odpowiadasz po polsku.

ZASADY RZETELNOŚCI (najważniejsze):
1. Liczby o użytkowniku (ciężary, tempa, tętno, km, daty) bierz WYŁĄCZNIE z sekcji DANE. Nie wymyślaj treningów, wyników ani historii, których tam nie ma.
2. Gdy danych brakuje (np. brak historii ćwiczenia, brak tętna) – napisz to wprost i zaproponuj, co zalogować. Lepiej „nie wiem z tych danych” niż zgadywanie.
3. Rekomendacje uzasadniaj krótko odwołaniem do DANYCH (np. „śr. HR spokojnych biegów 155 = Z3”) albo do BAZY WIEDZY. Nie podawaj fałszywie precyzyjnych wartości ani nieistniejących badań i cytatów.
4. Tempa biegowe tylko z bieganie.tempa (VDOT). Ciężary planuj od ostatnich serii z historia_silowa (podwójna progresja, skok jak w planie).
5. Użytkownik trenuje nieregularnie (2–5 jednostek/tydz.) – proponuj priorytety i warianty zamiast sztywnych dni.
6. Medycyna: nie diagnozuj; przy bólu zaproponuj modyfikację i fizjoterapeutę.

${KNOWLEDGE}

Formatowanie: konkretnie, krótkie akapity, listy, ewentualnie prosta tabela Markdown. Bez wstępów i powtarzania pytania.

DANE (stan na ${today()}, JSON):
${JSON.stringify(buildContext())}`;
}

// Strumieniowa odpowiedź z automatycznym przejściem na model zapasowy.
// onDelta(textSoFar); zwraca { text, model, note, sources }
export async function ask(messages, onDelta, signal) {
  const key = state.settings.aiKey;
  if (!key) throw new Error('Brak klucza API – dodaj go w ustawieniach asystenta.');
  const sys = systemPrompt();
  const errors = [];
  for (const model of chain()) {
    for (const grounded of state.settings.aiGrounding ? [true, false] : [false]) {
      try {
        const out = await askModel(model, sys, messages, onDelta, signal, grounded, key);
        const note = errors.length ? `${errors.map((e) => `${e.model}: ${e.msg}`).join('; ')} → odpowiada ${model}` : '';
        return { ...out, model, note };
      } catch (e) {
        if (e.name === 'AbortError' || e.partial) throw e;
        const msg = String(e.message || e);
        if (grounded && /ground|search|tool|free tier|not available|billing/i.test(msg)) { errors.push({ model, msg: 'weryfikacja w Google niedostępna na tym kluczu – wyłączona' }); state.settings.aiGrounding = false; continue; }
        errors.push({ model, msg: shortErr(msg, e.status) });
        if (e.status === 401 || /api key not valid|permission/i.test(msg)) throw new Error(msg);
        break; // następny model w łańcuchu
      }
    }
  }
  throw new Error('Żaden model nie odpowiedział: ' + errors.map((e) => `${e.model} – ${e.msg}`).join('; '));
}
function shortErr(msg, status) {
  if (status === 429 || /quota|rate/i.test(msg)) return 'limit zapytań';
  if (status === 404 || /not found|not supported/i.test(msg)) return 'model niedostępny';
  if (status === 503 || /overload|unavailable/i.test(msg)) return 'przeciążony';
  return msg.slice(0, 80);
}

async function post(model, body, signal, key) {
  return fetch(`${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal,
  });
}

async function askModel(model, sys, messages, onDelta, signal, grounded, key) {
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents: messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    // Gemini 3+/4: domyślna temperatura (zalecana przez Google); jakość podnosi tryb myślenia
    generationConfig: { maxOutputTokens: 16384, thinkingConfig: { thinkingLevel: THINKING[model] || 'high' } },
  };
  if (grounded) body.tools = [{ google_search: {} }];
  let res = await post(model, body, signal, key);
  if (!res.ok) {
    let msg = await errText(res);
    if (res.status === 400 && /thinking/i.test(msg)) { // model bez obsługi thinkingLevel
      delete body.generationConfig.thinkingConfig;
      res = await post(model, body, signal, key);
      if (res.ok) return readStream(res, onDelta);
      msg = await errText(res);
    }
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return readStream(res, onDelta);
}

async function readStream(res, onDelta) {
  let text = '';
  const sources = new Map();
  const handle = (line) => {
    const j = parseLine(line);
    if (!j) return;
    if (j.error) { const e = new Error(j.error.message || 'Błąd strumienia'); e.status = j.error.code; e.partial = !!text; throw e; }
    const c = j.candidates?.[0];
    text += (c?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
    for (const ch of c?.groundingMetadata?.groundingChunks || []) if (ch.web?.uri) sources.set(ch.web.uri, ch.web.title || ch.web.uri);
    onDelta(text);
  };
  if (!res.body || !res.body.getReader) {
    (await res.text()).split('\n').filter((l) => l.startsWith('data:')).forEach(handle);
  } else {
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line.startsWith('data:')) handle(line);
      }
    }
    if (buf.trim().startsWith('data:')) handle(buf.trim());
  }
  if (!text) { const e = new Error('Pusta odpowiedź modelu (blokada treści lub limit)'); e.status = 503; throw e; }
  return { text, sources: [...sources].map(([uri, title]) => ({ uri, title })) };
}
function parseLine(line) { try { return JSON.parse(line.slice(5)); } catch (e) { return null; } }


// Bezpieczny, minimalny Markdown → HTML
export function md(src) {
  const lines = esc(src).split('\n');
  const out = []; let list = null, table = null;
  const inline = (t) => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const flush = () => { if (list) { out.push(`<${list.t}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.t}>`); list = null; } if (table) { out.push(renderTable(table, inline)); table = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    let m;
    if (/^\s*\|.*\|\s*$/.test(l)) { if (list) flush(); (table ||= []).push(l); continue; }
    if (table) flush();
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list?.t !== 'ul') { flush(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list?.t !== 'ol') { flush(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    flush();
    if ((m = l.match(/^#{1,6}\s+(.*)/))) out.push(`<h4>${inline(m[1])}</h4>`);
    else if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) out.push('<hr>');
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  flush();
  return out.join('');
}
function renderTable(rows, inline) {
  const cells = rows.map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const body = cells.filter((c) => !c.every((x) => /^:?-+:?$/.test(x)));
  if (!body.length) return '';
  const [h, ...rest] = body;
  return `<div class="mdtbl"><table><thead><tr>${h.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export const QUICK = [
  ['Analiza tygodnia', 'Przeanalizuj mój poprzedni i bieżący tydzień. Co poszło dobrze, co poprawić i jak rozłożyć pozostałe treningi?'],
  ['Plan na 4 tygodnie', 'Rozpisz mi ramowy plan na najbliższe 4 tygodnie pod mój cel, zakładając 3–4 jednostki tygodniowo (z wariantem na tydzień, w którym dam radę tylko 2). Podaj konkretne treningi biegowe z tempami i priorytety siłowe.'],
  ['Moje bieganie', 'Oceń moje bieganie na podstawie ostatnich aktywności: forma, tętno na spokojnych biegach, kadencja, objętość. Co zmienić, by poprawić wynik na moim dystansie docelowym?'],
  ['Plan siłowy', 'Oceń mój plan siłowy i historię progresji. Które ćwiczenia stoją w miejscu, czy objętość na partie jest odpowiednia przy mojej częstotliwości i co konkretnie zmienić?'],
  ['Dzisiejszy trening', 'Co najlepiej zrobić dziś, biorąc pod uwagę ostatnie dni i moje sloty? Rozpisz trening.'],
];
