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

function systemPrompt() {
  return `Jesteś doświadczonym trenerem przygotowania hybrydowego (siłownia + bieganie) i osobistym asystentem w aplikacji „Hybryda”.
Odpowiadasz po polsku, konkretnie i praktycznie: podawaj liczby (tempa /km, tętno, ciężary, serie×powtórzenia, minuty). Opieraj się na danych użytkownika poniżej – cytuj je, gdy uzasadniasz rekomendację.
Zasady: progresja stopniowa (kilometraż max ~10–15%/tydz.), 80/20 w bieganiu, 48 h między ciężkimi bodźcami na tę samą partię, priorytet celu użytkownika. Użytkownik trenuje nieregularnie (2–5 jednostek/tydz.) – proponuj plany odporne na to (priorytety zamiast sztywnych dni).
Tempa biegowe bierz z pola bieganie.tempa (model VDOT Danielsa). Przy bólu/kontuzji nie diagnozuj – zasugeruj modyfikację i konsultację z fizjoterapeutą.
Formatowanie: krótkie akapity, listy punktowane, ewentualnie prosta tabela Markdown. Bez zbędnych wstępów.

DANE UŻYTKOWNIKA (JSON):
${JSON.stringify(buildContext())}`;
}

// Strumieniowa odpowiedź; onDelta(textSoFar)
export async function ask(messages, onDelta, signal) {
  const key = state.settings.aiKey;
  if (!key) throw new Error('Brak klucza API – dodaj go w ustawieniach asystenta.');
  const model = state.settings.aiModel || 'gemini-2.5-flash';
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt() }] },
    contents: messages.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })),
    generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
  };
  const res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new Error(await errText(res));
  let text = '';
  if (!res.body || !res.body.getReader) {
    const raw = await res.text();
    raw.split('\n').filter((l) => l.startsWith('data:')).forEach((l) => { text += chunkText(l); });
    onDelta(text); return text;
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('data:')) { text += chunkText(line); onDelta(text); }
    }
  }
  if (buf.trim().startsWith('data:')) { text += chunkText(buf.trim()); onDelta(text); }
  if (!text) throw new Error('Pusta odpowiedź modelu (możliwa blokada treści lub limit).');
  return text;
}
function chunkText(line) {
  try {
    const j = JSON.parse(line.slice(5));
    return (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
  } catch (e) { return ''; }
}

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
