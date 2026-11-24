// Raport tygodniowy: wykonanie planu, siła, bieganie, wnioski na kolejny tydzień
import { state } from './store.js';
import { addDays, fmtNum, diffDays, today } from './util.js';
import { GOALS, CAT_LABEL, weekSummary, prsInSession, muscleSets } from './engine.js';
import { isRun, classify, RUN_TYPES, runPace, hrMax } from './running.js';

export function weekReport(ws) {
  const we = addDays(ws, 6);
  const g = GOALS[state.goal.type] || GOALS.hybrid;
  const sum = weekSummary(ws);
  const prev = weekSummary(addDays(ws, -7));
  const inWeek = (d) => d >= ws && d <= we;
  const sessions = state.sessions.filter((s) => inWeek(s.date));
  const runs = state.runs.filter((r) => inWeek(r.date.slice(0, 10)));
  const slots = state.plan.filter((p) => inWeek(p.date));
  const ended = we < today();

  // zgodność z celem (ważona)
  let got = 0, need = 0;
  for (const [cat, t] of Object.entries(g.targets)) {
    if (t <= 0) continue;
    const w = g.w[cat] ?? 0.2;
    got += Math.min(sum.counts[cat] || 0, t) * w;
    need += t * w;
  }
  const adherence = need ? got / need : 0;

  const sets = sessions.reduce((a, s) => a + s.exercises.reduce((b, e) => b + e.sets.length, 0), 0);
  const tonnage = sessions.reduce((a, s) => a + s.exercises.reduce((b, e) => b + e.sets.reduce((c, x) => c + (x.w || 0) * (x.r || 0), 0), 0), 0);
  const prs = sessions.flatMap((s) => prsInSession(s));
  const rr = runs.filter(isRun);
  const easy = rr.filter((r) => ['E', 'S'].includes(classify(r)) && r.avgHr);
  const easyHr = easy.length ? easy.reduce((a, r) => a + r.avgHr, 0) / easy.length : null;
  const longest = Math.max(0, ...rr.map((r) => r.distKm || 0));
  const quality = rr.filter((r) => RUN_TYPES[classify(r)].cat === 'runQ');
  const ms = muscleSets(ws, we);

  const done = slots.filter((p) => p.status === 'done').length;
  const missed = slots.filter((p) => p.status !== 'done' && p.date < today()).length;

  const notes = [];
  const missing = Object.entries(g.targets).filter(([c, t]) => t >= 1 && (sum.counts[c] || 0) < t).map(([c]) => CAT_LABEL[c]);
  if (missing.length) notes.push(`${ended ? 'Zabrakło' : 'Jeszcze brakuje'}: ${missing.join(', ').toLowerCase()}. ${ended ? 'Silnik nada im priorytet w kolejnym tygodniu.' : ''}`.trim());
  if (prev.km > 3 && sum.km > prev.km * 1.25 && sum.km - prev.km > 4) notes.push(`Kilometraż +${Math.round((sum.km / prev.km - 1) * 100)}% tydzień do tygodnia – w następnym utrzymaj, nie dokładaj.`);
  else if (ended && prev.km > 5 && sum.km < prev.km * 0.6) notes.push(`Kilometraż spadł do ${fmtNum(sum.km)} km (z ${fmtNum(prev.km)}). Wracaj o max ~15%/tydz.`);
  if (easyHr && easyHr / hrMax() >= 0.78) notes.push(`Średnie tętno spokojnych biegów ${Math.round(easyHr)} bpm – to już Z3. Zwolnij na rozbieganiach (< ${Math.round(hrMax() * 0.78)}).`);
  if (quality.length >= 3) notes.push('3+ akcenty biegowe w tygodniu – przy obecnej objętości to dużo; zostaw 1–2.');
  if (sessions.length && (ms.klatka || 0) < 6 && g.targets.upper >= 2) notes.push(`Klatka tylko ${fmtNum(ms.klatka || 0)} serii – rozważ dłuższy slot na Upper albo +1 serię w APS.`);
  if (prs.length) notes.push(`Rekordy: ${prs.map((p) => p.name.split(' (')[0]).join(', ')} – progres działa.`);
  if (ended && missed >= 2) notes.push(`${missed} zaplanowane sloty przepadły. Planuj realniej (krótsze sloty też się liczą – 30–45 min daje bieg spokojny albo mobilność).`);
  if (ended && adherence >= 0.85) notes.push('Bardzo dobry tydzień względem celu – tak trzymaj.');
  if (!sessions.length && !runs.length) notes.push('Brak zapisanych aktywności w tym tygodniu.');

  return {
    ws, we, ended, adherence, counts: sum.counts, targets: g.targets, km: sum.km, prevKm: prev.km,
    sessions, runs, rr, sets, tonnage, prs, longest, quality: quality.length, easyHr, slots: slots.length, done, missed, notes,
    duration: sessions.reduce((a, s) => a + (s.durationMin || 0), 0) + rr.reduce((a, r) => a + (r.timeSec || 0) / 60, 0),
  };
}

// Krótka wersja tekstowa (dla asystenta AI)
export function reportText(r) {
  return `Tydzień ${r.ws}–${r.we}: zgodność z celem ${Math.round(r.adherence * 100)}%, ` +
    Object.entries(r.targets).filter(([, t]) => t >= 1).map(([c, t]) => `${CAT_LABEL[c]} ${fmtNum(r.counts[c] || 0, 1)}/${t}`).join(', ') +
    `; siłownia: ${r.sessions.length} sesji, ${r.sets} serii; bieg: ${fmtNum(r.km)} km (${r.rr.length} biegów, ${r.quality} akcentów, najdłuższy ${fmtNum(r.longest)} km)` +
    `${r.easyHr ? `, śr. HR spokojnych ${Math.round(r.easyHr)}` : ''}; sloty: ${r.done}/${r.slots} zrobione. Wnioski: ${r.notes.join(' ')}`;
}
