import { state, save, tpl, replaceState, resetState, MUSCLES, MUSCLE_RANGE, EQUIP, requestPersist, exportable, importBackup } from './store.js';
import { uid, esc, today, weekStart, weekDays, addDays, isoWeek, fmtDate, fmtDateLong, DAYS, dayIdx, fmtDur, fmtMin, fmtPace, fmtKg, fmtNum, parseTime, num, normKey, diffDays, clamp } from './util.js';
import { GOALS, FOCUS, CAT_LABEL, assignWeek, weekSummary, buildWorkout, candidates, candByKey, fitTemplate, prescribe, history, e1rm, prsInSession, muscleSets, tips, planSuggestions, applySuggestion, bodyWeight, warmups, plates, alternatives } from './engine.js';
import { upcomingEvents, buildICS } from './ics.js';
import { weekReport } from './report.js';
import { ask, listModels, md, QUICK, MODEL_CHAIN, MODEL_INFO, chain } from './ai.js';
import * as strava from './strava.js';
import { describe as describeAct, apply as applyAct, addFact } from './actions.js';
import { importCSV, importFIT, vdotFrom, estimateVdot, paces, predict, runStats, weeklyKm, efficiencySeries, classify, RUN_TYPES, isRun, runPace, hrZones, zoneTimes, buildRun, addManualRun, hrMax, autoHrMax } from './running.js';
import { bars, line } from './charts.js';

const ui = {
  tab: state.active ? 'workout' : (localStorage.getItem('ui-tab') || 'week'),
  ws: weekStart(today()),
  sheet: null,
  form: {},
  more: null,
  editTpl: null,
  progEx: null,
  timer: null,
  showAllTips: false,
  aiBusy: false,
  aiErr: '',
  models: null,
  syncing: '',
};
const app = document.getElementById('app');

// ---------- ikony ----------
const I = {
  week: '<path d="M4 6h16M4 6v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6M4 6V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v1M8 2v4M16 2v4M8 11h3M8 15h3M14 11h2"/>',
  workout: '<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>',
  run: '<path d="M13 4.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0M8 21l3-6 3 2v5M6 12l3-4 4 1 3 3 3 1M11 15l-1-5"/>',
  progress: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>',
  coach: '<path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>', cal: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>', report: '<path d="M6 20V12M12 20V5M18 20v-9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 18l-6-6 6-6"/>', right: '<path d="M9 18l6-6-6-6"/>',
  check: '<path d="M5 12l5 5L20 7"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  dots: '<path d="M12 5h.01M12 12h.01M12 19h.01"/>', up: '<path d="M18 15l-6-6-6 6"/>', down: '<path d="M6 9l6 6 6-6"/>',
  timer: '<path d="M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
};
const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${I[n]}</svg>`;

const catClass = (cats) => {
  if (!cats) return 'c-mob';
  if (cats.upper) return 'c-up';
  if (cats.lower) return 'c-low';
  if (cats.runQ || cats.runL || cats.runE) return 'c-run';
  return 'c-mob';
};
const RUN_CAT_CLASS = { runE: 'c-run', runQ: 'c-run', runL: 'c-run', cardio: 'c-mob' };

// ---------- render ----------
function render() {
  const tabs = [['week', 'Tydzień'], ['workout', 'Trening'], ['run', 'Bieg'], ['coach', 'Asystent'], ['progress', 'Postęp'], ['more', 'Więcej']];
  let main = '';
  if (ui.tab === 'week') main = viewWeek();
  else if (ui.tab === 'workout') main = viewWorkout();
  else if (ui.tab === 'run') main = viewRun();
  else if (ui.tab === 'progress') main = viewProgress();
  else if (ui.tab === 'coach') main = viewCoach();
  else main = viewMore();
  app.innerHTML = `
    <main class="main">${main}</main>
    ${timerBar()}
    <nav class="tabbar">${tabs.map(([k, l]) => `<button class="tab ${ui.tab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${ic(k)}<span>${l}</span>${k === 'workout' && state.active ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>
    ${ui.sheet ? `<div class="backdrop" data-a="closeSheet"></div><div class="sheet" role="dialog">${renderSheet()}</div>` : ''}
    <input type="file" id="fileIn" multiple hidden>
    <input type="file" id="backupIn" accept="application/json,.json" hidden>`;
  document.body.classList.toggle('noscroll', !!ui.sheet);
}

// ====================== TYDZIEŃ ======================
function viewWeek() {
  const ws = ui.ws, days = weekDays(ws), t0 = today();
  const asg = assignWeek(ws);
  const sum = weekSummary(ws);
  const g = GOALS[state.goal.type] || GOALS.hybrid;
  const isCur = ws === weekStart(t0);
  const tipList = isCur ? tips() : [];
  const shownTips = ui.showAllTips ? tipList : tipList.slice(0, 2);

  const pills = Object.entries(sum.targets).filter(([, t]) => t >= 1).map(([k, t]) => {
    const d = sum.counts[k] || 0;
    return `<div class="pill ${d >= t ? 'full' : ''}"><span>${CAT_LABEL[k]}</span><b>${fmtNum(d, d % 1 ? 1 : 0)}/${t}</b><i style="width:${Math.min(100, (d / t) * 100)}%"></i></div>`;
  }).join('');

  return `
  <header class="top">
    <div>
      <div class="eyebrow">Tydzień ${isoWeek(ws)}${isCur ? ' · bieżący' : ''}</div>
      <h1>${fmtDate(ws)} – ${fmtDate(addDays(ws, 6))}</h1>
    </div>
    <div class="row gap">
      <button class="iconbtn" data-a="weekNav" data-v="-1" aria-label="Poprzedni tydzień">${ic('left')}</button>
      ${isCur ? '' : `<button class="btn sm ghost" data-a="weekNav" data-v="0">Dziś</button>`}
      <button class="iconbtn" data-a="weekNav" data-v="1" aria-label="Następny tydzień">${ic('right')}</button>
    </div>
  </header>
  <section class="card goalcard" data-a="more" data-v="goal">
    <div class="eyebrow">Cel</div>
    <div class="goalline"><b>${esc(g.label)}</b>${state.goal.runFocus && state.goal.runFocus !== 'none' ? `<span class="chip">${FOCUS[state.goal.runFocus]}${state.goal.targetTime ? ' · ' + esc(state.goal.targetTime) : ''}</span>` : ''}</div>
    <div class="pills">${pills}<div class="pill km"><span>Bieg</span><b>${fmtNum(sum.km)} km</b></div></div>
  </section>
  <div class="row gap wrap">
    <button class="btn sm ghost" data-a="report" data-v="${ws}">${ic('report')} Raport tygodnia</button>
    <button class="btn sm ghost" data-a="calendar">${ic('cal')} Do kalendarza</button>
  </div>
  ${isCur && dayIdx(t0) <= 2 ? prevReportCard(addDays(ws, -7)) : ''}
  ${shownTips.length ? `<section class="tips">${shownTips.map(tipCard).join('')}${tipList.length > 2 ? `<button class="link" data-a="toggleTips">${ui.showAllTips ? 'Pokaż mniej' : `Pokaż wszystkie porady (${tipList.length})`}</button>` : ''}</section>` : ''}
  ${!state.plan.some((p) => p.date >= ws && p.date <= addDays(ws, 6)) ? `<div class="hint">Dodaj dzień, w którym możesz trenować (<b>+</b> przy dniu), podaj ile masz czasu – aplikacja dobierze trening do celu, regeneracji i tego, co już zrobiłeś w tym tygodniu.</div>` : ''}
  <section class="days">
    ${days.map((d) => dayBlock(d, asg, t0)).join('')}
  </section>`;
}

function prevReportCard(pws) {
  const r = weekReport(pws);
  if (!r.sessions.length && !r.runs.length) return '';
  return `<button class="reportcard" data-a="report" data-v="${pws}"><div><div class="eyebrow">Raport · tydzień ${isoWeek(pws)}</div>
    <b>${Math.round(r.adherence * 100)}% celu</b><small>${r.sessions.length} siłowe · ${r.rr.length} biegi · ${fmtNum(r.km)} km${r.prs.length ? ` · ${r.prs.length} PR` : ''}</small></div>${ic('right')}</button>`;
}

function tipCard(t) {
  const act = { goal: ['Ustaw cel', 'more', 'goal'], import: ['Importuj', 'import', ''], deload: ['Włącz deload', 'deload', ''], undeload: ['Zakończ', 'undeload', ''] }[t.action];
  return `<div class="tip ${t.lvl}"><div><b>${esc(t.title)}</b><p>${esc(t.text)}</p></div>${act ? `<button class="btn sm" data-a="${act[1]}" data-v="${act[2]}">${act[0]}</button>` : ''}</div>`;
}

function dayBlock(d, asg, t0) {
  const sessions = state.sessions.filter((s) => s.date === d);
  const runs = state.runs.filter((r) => r.date.slice(0, 10) === d);
  const slots = state.plan.filter((p) => p.date === d).sort((a, b) => (a.created || 0) - (b.created || 0));
  const isToday = d === t0, past = d < t0;
  const items = [
    ...sessions.map((s) => loggedSession(s)),
    ...runs.map((r) => loggedRun(r)),
    ...slots.map((p) => slotCard(p, asg[p.id] || {}, d)),
  ].join('');
  return `<div class="day ${isToday ? 'today' : ''} ${past ? 'past' : ''}">
    <div class="dayhead"><div><b>${DAYS[dayIdx(d)]}</b> <span>${fmtDate(d)}</span>${isToday ? '<em>dziś</em>' : ''}</div>
    ${!past ? `<button class="iconbtn sm" data-a="addSlot" data-v="${d}" aria-label="Zaplanuj trening">${ic('plus')}</button>` : `<button class="iconbtn sm faint" data-a="addLog" data-v="${d}" aria-label="Dodaj">${ic('plus')}</button>`}</div>
    ${items || `<div class="restday">${past ? '—' : 'Wolne'}</div>`}
  </div>`;
}

function loggedSession(s) {
  const sets = s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.r > 0).length, 0);
  const cls = s.tplKind === 'lower' ? 'c-low' : s.tplKind === 'mob' ? 'c-mob' : 'c-up';
  return `<button class="logged ${cls}" data-a="openSession" data-v="${s.id}">
    <span class="bar"></span><div><b>${esc(s.tplName)}${s.addon ? ' + ' + (s.addon === 'Z2' ? 'Z2' : 'HIIT') : ''}</b>
    <small>${s.durationMin ? fmtMin(s.durationMin) + ' · ' : ''}${sets ? sets + ' serii' : ''}${s.mobDone ? ' · mobilność' : ''}${s.rpe ? ' · RPE ' + s.rpe : ''}</small></div>${ic('check', 'ok')}</button>`;
}
function loggedRun(r) {
  const rt = classify(r);
  return `<button class="logged ${RUN_CAT_CLASS[RUN_TYPES[rt].cat]}" data-a="openRun" data-v="${r.id}">
    <span class="bar"></span><div><b>${isRun(r) ? 'Bieg' : esc(r.type)} · ${RUN_TYPES[rt].label}</b>
    <small>${fmtNum(r.distKm, 2)} km · ${fmtDur(r.timeSec)}${isRun(r) ? ' · ' + fmtPace(runPace(r)) + '/km' : ''}${r.avgHr ? ' · ♥ ' + r.avgHr : ''}</small></div>${ic('check', 'ok')}</button>`;
}

function slotCard(p, a, d) {
  if (a.status === 'done') {
    if (p.doneRef) return '';
    const c = candByKey(p.doneKey);
    return `<div class="logged ${catClass(c?.cats)}"><span class="bar"></span><div><b>${esc(c?.label || 'Trening')}</b><small>Zrobione · dane do uzupełnienia z Garmina</small></div><button class="iconbtn sm faint" data-a="delSlot" data-v="${p.id}">${ic('x')}</button></div>`;
  }
  if (a.status === 'missed') return `<div class="slot missed"><div class="row between"><span>Zaplanowane ${p.minutes} min – nie odnotowano</span><div class="row gap"><button class="btn sm ghost" data-a="addLog" data-v="${p.date}">Dodaj</button><button class="iconbtn sm" data-a="delSlot" data-v="${p.id}">${ic('trash')}</button></div></div></div>`;
  if (a.status === 'none' || !a.cand) return `<div class="slot"><div class="row between"><span>${p.minutes} min – za mało czasu na jakikolwiek trening z planu</span><button class="iconbtn sm" data-a="delSlot" data-v="${p.id}">${ic('trash')}</button></div></div>`;
  const c = a.cand;
  const w = buildWorkout(c, p.minutes);
  let sub = '';
  if (w.kind === 'run') sub = `${esc(w.run.summary)}`;
  else sub = `${w.fit.exercises.length ? w.fit.exercises.length + ' ćwiczeń' : ''}${w.fit.mobility.length ? (w.fit.exercises.length ? ' + ' : '') + w.fit.mobility.length + ' mobilność' : ''}${w.addon ? ' + ' + esc(w.addon.summary) : ''}${w.fit.dropped.length ? ' · skrócone' : ''}`;
  const energy = ['', '😫', '😕', '🙂', '💪', '🔥'][p.energy || 0] || '';
  const isToday = d === today();
  return `<div class="slot ${catClass(c.cats)} ${isToday ? 'hot' : ''}">
    <div class="row between slotmeta"><span class="tag">${ic('timer')} ${p.time || state.settings.slotTime} · ${p.minutes} min${energy ? ' · ' + energy : ''}</span><span class="tag ${a.pinned ? 'pin' : 'auto'}">${a.pinned ? 'Twój wybór' : 'Sugestia'}</span></div>
    <h3>${esc(c.label)}</h3>
    <p class="sub">${sub} <span class="muted">· ~${w.kind === 'run' ? w.run.estMin : w.est} min</span></p>
    ${a.reasons?.length ? `<ul class="why">${a.reasons.slice(0, 3).map((r) => `<li class="${r.p >= 0 ? 'pos' : 'neg'}">${esc(r.t)}</li>`).join('')}</ul>` : ''}
    <div class="row gap wrap actions">
      ${c.kind === 'strength'
        ? `<button class="btn primary" data-a="startSlot" data-v="${p.id}">Start</button>`
        : `<button class="btn primary" data-a="runDetails" data-v="${p.id}">Rozpiska</button><button class="btn" data-a="runDone" data-v="${p.id}">Zrobione</button>`}
      <button class="btn ghost" data-a="changeSlot" data-v="${p.id}">Zmień</button>
      <button class="iconbtn" data-a="editSlot" data-v="${p.id}" aria-label="Edytuj slot">${ic('dots')}</button>
    </div>
  </div>`;
}

// ====================== TRENING ======================
function viewWorkout() {
  const A = state.active;
  if (!A) return viewWorkoutIdle();
  const groups = [];
  A.items.forEach((it, i) => {
    const prev = groups[groups.length - 1];
    if (it.ss && prev && prev.ss === it.ss) prev.items.push([it, i]);
    else groups.push({ ss: it.ss, items: [[it, i]] });
  });
  const doneSets = A.items.reduce((a, it) => a + it.sets.filter((s) => s.done).length, 0);
  const allSets = A.items.reduce((a, it) => a + it.sets.length, 0);
  return `
  <header class="top">
    <div><div class="eyebrow">Trening w toku</div><h1>${esc(A.tplName)}</h1></div>
    <div class="elapsed"><span id="elapsed">${fmtDur((Date.now() - A.startedAt) / 1000)}</span><small>${doneSets}/${allSets} serii</small></div>
  </header>
  ${A.dropped?.length ? `<div class="hint">Wersja skrócona do ${A.minutes} min – pominięto: ${A.dropped.map(esc).join(', ')}. <button class="link" data-a="restoreDropped">Przywróć</button></div>` : ''}
  ${groups.map((g) => `<div class="group ${g.ss ? 'ss' : ''}">${g.ss ? `<div class="sslabel">${esc(g.ss)} · superseria – na zmianę</div>` : ''}${g.items.map(([it, i]) => exerciseCard(it, i)).join('')}</div>`).join('')}
  ${A.mob.length ? `<section class="card"><h2>Mobilność</h2>${A.mob.map((m, j) => `
    <div class="mobrow ${m.done ? 'done' : ''}">
      <button class="check ${m.done ? 'on' : ''}" data-a="mobDone" data-v="${j}">${ic('check')}</button>
      <div class="grow"><b>${esc(m.name)}</b><small>${esc(m.dose)}${m.note ? ' · ' + esc(m.note) : ''}</small></div>
      ${m.secs ? `<button class="btn sm ghost" data-a="startTimer" data-v="${m.secs}">${ic('timer')} ${m.secs}s</button>` : ''}
    </div>`).join('')}</section>` : ''}
  ${A.addon ? `<section class="card c-run addon"><div class="row between"><h2>${esc(A.addon.run.title)}</h2><button class="check ${A.addon.done ? 'on' : ''}" data-a="addonDone">${ic('check')}</button></div>
    ${A.addon.run.steps.map((s) => `<div class="step"><b>${esc(s.t)}</b><small>${esc(s.d)}</small></div>`).join('')}</section>` : ''}
  <div class="row gap wrap">
    <button class="btn ghost" data-a="addExercise">+ Ćwiczenie</button>
    ${!A.addon && A.tplKind === 'upper' ? `<button class="btn ghost" data-a="addAddon" data-v="Z2">+ Cardio Z2</button><button class="btn ghost" data-a="addAddon" data-v="HIIT">+ Interwały</button>` : ''}
    ${!A.mob.length ? `<button class="btn ghost" data-a="addMob">+ Mobilność</button>` : ''}
  </div>
  <label class="field"><span>Notatki</span><textarea data-in="activeNotes" rows="2" placeholder="Samopoczucie, ból, sprzęt…">${esc(A.notes || '')}</textarea></label>
  <div class="row gap">
    <button class="btn primary grow" data-a="finishWorkout">Zakończ trening</button>
    <button class="btn danger" data-a="cancelWorkout">Anuluj</button>
  </div>`;
}

function exerciseCard(it, i) {
  const p = it.presc || {};
  const unit = it.unit === 'sec' ? 's' : 'powt.';
  const noWeight = it.equip === 'bw';
  return `<div class="ex card" id="ex-${i}">
    <div class="row between exhead">
      <div class="grow"><h3>${esc(it.name)}</h3>
      <div class="presc"><span class="target">Cel: ${p.w ? fmtKg(p.w) + ' kg × ' : ''}${it.repMin}–${it.repMax} ${unit}</span>${p.last ? `<span class="last">Ostatnio (${fmtDate(p.last.date)}): ${esc(p.last.txt)}</span>` : ''}</div></div>
      <button class="iconbtn sm" data-a="exMenu" data-v="${i}" aria-label="Opcje ćwiczenia">${ic('dots')}</button>
    </div>
    ${p.why ? `<p class="why1">${esc(p.why)}</p>` : ''}
    ${(() => { const wu = warmups(it); return wu ? `<p class="warm">Rozgrzewka: ${esc(wu)}</p>` : ''; })()}
    ${it.note ? `<p class="note">${esc(it.note)}</p>` : ''}
    <div class="sets">
      <div class="sethead"><span>#</span><span>${noWeight ? '' : it.equip === 'bw+' ? '+kg' : 'kg'}</span><span>${unit}</span><span>RIR</span><span></span></div>
      ${it.sets.map((s, j) => `<div class="setrow ${s.done ? 'done' : ''}">
        <span class="n">${j + 1}</span>
        ${noWeight ? '<span></span>' : `<input inputmode="decimal" data-in="w" data-i="${i}" data-j="${j}" value="${s.w ?? ''}" placeholder="${p.w ?? '–'}">`}
        <input inputmode="numeric" data-in="r" data-i="${i}" data-j="${j}" value="${s.r ?? ''}" placeholder="${p.reps ?? it.repMax}">
        <button class="rir ${s.rir != null ? 'on' : ''}" data-a="rir" data-i="${i}" data-j="${j}" aria-label="Powtórzenia w zapasie">${s.rir ?? '–'}</button>
        <button class="check ${s.done ? 'on' : ''}" data-a="setDone" data-i="${i}" data-j="${j}" aria-label="Seria zrobiona">${ic('check')}</button>
      </div>`).join('')}
    </div>
    <div class="row gap setbtns"><button class="btn sm ghost" data-a="addSet" data-v="${i}">+ seria</button><button class="btn sm ghost" data-a="delSet" data-v="${i}" ${it.sets.length <= 1 ? 'disabled' : ''}>− seria</button>${it.equip === 'bb' ? `<button class="btn sm ghost" data-a="plates" data-v="${i}">Talerze</button>` : ''}<span class="muted rest">przerwa ${it.rest}s</span></div>
  </div>`;
}

function viewWorkoutIdle() {
  const t0 = today();
  const asg = assignWeek(weekStart(t0));
  const todaySlots = state.plan.filter((p) => p.date === t0 && asg[p.id]?.status === 'planned');
  const recent = [...state.sessions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  return `
  <header class="top"><div><div class="eyebrow">${fmtDateLong(t0)}</div><h1>Trening</h1></div></header>
  ${todaySlots.length ? `<section><h2 class="sec">Na dziś</h2>${todaySlots.map((p) => slotCard(p, asg[p.id], t0)).join('')}</section>` : `<div class="hint">Nic nie zaplanowano na dziś. Zaplanuj slot w zakładce Tydzień albo wybierz trening poniżej.</div>`}
  <h2 class="sec">Rozpocznij z planu</h2>
  <div class="tplgrid">${state.templates.map((t) => {
    const f = fitTemplate(t);
    return `<button class="tplcard ${t.kind === 'upper' ? 'c-up' : t.kind === 'lower' ? 'c-low' : 'c-mob'}" data-a="startTpl" data-v="${t.id}">
      <b>${esc(t.name)}</b><small>${esc(t.desc || '')}</small><span class="muted">${t.exercises.length ? t.exercises.length + ' ćw.' : ''}${t.mobility.length ? (t.exercises.length ? ' + ' : '') + t.mobility.length + ' mob.' : ''} · ~${f.full} min</span></button>`;
  }).join('')}</div>
  <h2 class="sec">Ostatnie treningi</h2>
  ${recent.length ? recent.map((s) => `<div class="histrow">${loggedSession(s)}<span class="muted date">${fmtDate(s.date)}</span></div>`).join('') : '<div class="empty">Brak zapisanych treningów</div>'}`;
}

// ====================== BIEGANIE ======================
function viewRun() {
  const est = estimateVdot();
  const st = runStats();
  const runs = state.runs.slice(0, 25);
  let paceTbl = '', pred = '';
  if (est.vdot) {
    const p = paces(est.vdot), m = hrMax();
    const rows = [
      ['E', 'Spokojne / długie', `${fmtPace(p.E[0])}–${fmtPace(p.E[1])}`, `< ${Math.round(m * 0.78)}`],
      ['M', 'Maratońskie', fmtPace(p.M), `${Math.round(m * 0.8)}–${Math.round(m * 0.86)}`],
      ['T', 'Progowe (tempo)', fmtPace(p.T), `${Math.round(m * 0.86)}–${Math.round(m * 0.9)}`],
      ['I', 'Interwały VO₂max', fmtPace(p.I), `${Math.round(m * 0.92)}+`],
      ['R', 'Rytmy / 200–400 m', fmtPace(p.R), '—'],
    ];
    paceTbl = `<table class="tbl"><thead><tr><th></th><th>Strefa</th><th>Tempo /km</th><th>Tętno</th></tr></thead><tbody>${rows.map((r) => `<tr><td><span class="badge">${r[0]}</span></td><td>${r[1]}</td><td class="num">${r[2]}</td><td class="num muted">${r[3]}</td></tr>`).join('')}</tbody></table>`;
    pred = [['5 km', 5000], ['10 km', 10000], ['Półmaraton', 21097.5], ['Maraton', 42195]].map(([l, d]) => `<div class="stat"><small>${l}</small><b>${fmtDur(predict(est.vdot, d))}</b></div>`).join('');
  }
  const wk = st.weeks.map((w) => ({ label: fmtDate(w.ws).replace(' ', ' '), v: w.km }));
  const ef = efficiencySeries().slice(-30).map((x) => ({ y: x.ef, label: fmtDate(x.date) }));
  const sample = est.vdot ? ['I', 'T', 'L'].map((t) => buildRun(t, t === 'L' ? 120 : 60)) : [];

  return `
  <header class="top"><div><div class="eyebrow">Analiza biegowa</div><h1>Bieganie</h1></div>
    <button class="btn primary sm" data-a="import">${ic('upload')} Import</button></header>
  <section class="card vdot">
    ${est.vdot ? `
      <div class="row between"><div><div class="eyebrow">Aktualna forma (VDOT)</div><div class="big">${fmtNum(est.vdot)}</div>
      <small class="muted">${est.source === 'manual' ? 'Ustawione ręcznie' : `Na podstawie: ${fmtNum(est.basis.run.distKm, 2)} km w ${fmtDur(est.basis.run.timeSec)} (${fmtDate(est.basis.run.date)})`}${est.peak && est.peak.v > est.vdot + 0.5 ? ` · szczyt 6 mies.: ${fmtNum(est.peak.v)}` : ''}</small></div>
      <button class="btn sm ghost" data-a="more" data-v="settings">Zmień</button></div>
      <div class="eyebrow mt">Prognozy wyników</div><div class="stats4">${pred}</div>`
      : `<p>Zaimportuj biegi (CSV z Garmin Connect: Aktywności → Eksportuj CSV, albo pliki .FIT), aby wyliczyć tempa.</p><button class="btn primary" data-a="import">Importuj pliki</button>`}
  </section>
  ${est.vdot ? `<section class="card"><h2>Twoje tempa treningowe</h2>${paceTbl}<p class="muted small">Tempa przeliczają się automatycznie po każdym imporcie. Tętno wg HRmax ${hrMax()} bpm.</p></section>` : ''}
  ${stravaCard()}
  <section class="card"><h2>Kilometraż tygodniowy</h2>${bars(wk, { fmt: (v) => Math.round(v) })}
    <div class="stats4">
      <div class="stat"><small>Śr. 4 tyg.</small><b>${fmtNum(st.avg4)} km</b></div>
      <div class="stat"><small>Ostatnie 7 dni</small><b>${fmtNum(st.acute)} km</b></div>
      <div class="stat"><small>Obciążenie A:C</small><b class="${st.acwr > 1.5 ? 'bad' : st.acwr && st.acwr < 0.8 ? 'warnc' : ''}">${st.acwr ? '×' + fmtNum(st.acwr, 2) : '–'}</b></div>
      <div class="stat"><small>Kadencja</small><b>${st.cadence ? Math.round(st.cadence) : '–'}</b></div>
    </div></section>
  ${sample.length ? `<section class="card"><h2>Kolejne akcenty (podgląd)</h2><p class="muted small">Progresja rośnie z każdym wykonanym treningiem danego typu. Konkretny trening dobierasz slotem w zakładce Tydzień.</p>
    ${sample.map((r) => `<div class="step"><b>${esc(r.title)}</b><small>${esc(r.summary)} · ~${r.estMin} min</small></div>`).join('')}</section>` : ''}
  <section class="card"><h2>Efektywność tlenowa</h2><p class="muted small">Prędkość (m/min) na uderzenie serca w biegach spokojnych i długich. Rosnący trend = lepsza baza tlenowa.</p>${line(ef, { color: 'var(--run)', fmt: (v) => v.toFixed(2) })}</section>
  <section class="card"><h2>Strefy tętna</h2><table class="tbl">${hrZones().map((z) => `<tr><td><span class="badge">${z.z}</span></td><td>${z.label}</td><td class="num">${z.lo}–${z.hi}</td></tr>`).join('')}</table></section>
  <div class="row between"><h2 class="sec">Aktywności</h2><button class="btn sm ghost" data-a="addLog" data-v="${today()}">+ Ręcznie</button></div>
  ${runs.length ? runs.map((r) => `<div class="histrow">${loggedRun(r)}<span class="muted date">${fmtDate(r.date)}</span></div>`).join('') : '<div class="empty">Brak aktywności</div>'}`;
}

// ====================== POSTĘP ======================
function viewProgress() {
  const names = [];
  for (const s of state.sessions) for (const e of s.exercises) if (e.sets.some((x) => x.r > 0) && !names.includes(e.name)) names.push(e.name);
  if (!ui.progEx || !names.includes(ui.progEx)) ui.progEx = names[0] || null;
  const ws0 = weekStart(today());
  const cons = [];
  for (let i = 11; i >= 0; i--) {
    const a = addDays(ws0, -7 * i), b = addDays(a, 6);
    cons.push({ label: `${+a.slice(8, 10)}.${+a.slice(5, 7)}`, values: [
      state.sessions.filter((s) => s.date >= a && s.date <= b).length,
      state.runs.filter((r) => r.date.slice(0, 10) >= a && r.date.slice(0, 10) <= b).length,
    ] });
  }
  let exHtml = '<div class="empty">Zaloguj pierwszy trening siłowy, aby zobaczyć progres.</div>';
  if (ui.progEx) {
    const h = history(ui.progEx).reverse();
    const equip = state.sessions.flatMap((s) => s.exercises).find((e) => e.name === ui.progEx)?.equip;
    const pts = h.map((x) => ({ y: Math.max(...x.sets.map((s) => e1rm(s.w, s.r, equip))), label: fmtDate(x.date) }));
    const best = h.reduce((b, x) => { x.sets.forEach((s) => { const v = e1rm(s.w, s.r, equip); if (!b || v > b.v) b = { v, s, date: x.date }; }); return b; }, null);
    exHtml = `<select data-in="progEx" class="select">${names.map((n) => `<option ${n === ui.progEx ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
      ${line(pts, { fmt: (v) => v.toFixed(0) })}
      <p class="muted small">Szacowany 1RM (Epley)${equip === 'bw+' ? ` z masą ciała ${bodyWeight() || '75 (domyślnie – ustaw w Postęp → Masa ciała)'} kg` : ''}.</p>
      ${best ? `<div class="stats4"><div class="stat"><small>Najlepsza seria</small><b>${best.s.w ? fmtKg(best.s.w) + '×' : ''}${best.s.r}</b></div><div class="stat"><small>e1RM</small><b>${fmtNum(best.v, 0)}</b></div><div class="stat"><small>Sesji</small><b>${h.length}</b></div></div>` : ''}
      <table class="tbl mt">${[...h].reverse().slice(0, 6).map((x) => `<tr><td class="muted">${fmtDate(x.date)}</td><td>${x.sets.map((s) => (s.w ? fmtKg(s.w) + '×' : '') + s.r).join(', ')}</td></tr>`).join('')}</table>`;
  }
  const ms = muscleSets(addDays(today(), -6), today());
  const bw = [...state.bodyweight].sort((a, b) => (a.date < b.date ? -1 : 1));
  return `
  <header class="top"><div><div class="eyebrow">Statystyki</div><h1>Postęp</h1></div></header>
  <section class="card"><h2>Regularność</h2><div class="legend"><span><i style="background:var(--up)"></i>Siłownia</span><span><i style="background:var(--run)"></i>Bieg / cardio</span></div>
    ${bars(cons, { stack: ['var(--up)', 'var(--run)'], fmt: (v) => (Number.isInteger(v) ? v : '') })}</section>
  <section class="card"><h2>Progres ćwiczeń</h2>${exHtml}</section>
  <section class="card"><h2>Serie na partię – ostatnie 7 dni</h2>
    ${Object.entries(MUSCLE_RANGE).map(([m, [lo, hi]]) => { const v = ms[m] || 0; return `<div class="mbar"><span>${MUSCLES[m]}</span><div class="track"><i class="range" style="left:${(lo / 24) * 100}%;width:${((hi - lo) / 24) * 100}%"></i><i class="val ${v >= lo ? 'ok' : ''}" style="width:${Math.min(100, (v / 24) * 100)}%"></i></div><b>${fmtNum(v, v % 1 ? 1 : 0)}</b></div>`; }).join('')}
    <p class="muted small">Zielone pole = zalecany zakres twardych serii tygodniowo. Serie pomocnicze liczone jako 0,5.</p></section>
  <section class="card"><h2>Masa ciała</h2>
    <div class="row gap"><input class="grow" inputmode="decimal" placeholder="kg" id="bwIn"><button class="btn" data-a="addBw">Zapisz</button></div>
    ${line(bw.map((x) => ({ y: x.kg, label: fmtDate(x.date) })), { color: 'var(--mob)', fmt: (v) => v.toFixed(1) })}</section>`;
}

// ====================== WIĘCEJ ======================
function viewMore() {
  if (ui.more === 'goal') return viewGoal();
  if (ui.more === 'plan') return ui.editTpl ? viewTplEdit() : viewPlan();
  if (ui.more === 'opt') return viewOpt();
  if (ui.more === 'settings') return viewSettings();
  if (ui.more === 'data') return viewData();
  if (ui.more === 'install') return viewInstall();
  const items = [['goal', 'Cel treningowy', GOALS[state.goal.type]?.label], ['plan', 'Plan treningowy', 'Edycja ćwiczeń, serii, powtórzeń'], ['opt', 'Optymalizacja planu', 'Sugestie na podstawie Twoich danych'], ['settings', 'Ustawienia', 'Tętno, VDOT, deload'], ['data', 'Dane i kopia zapasowa', 'Eksport / import / import biegów'], ['install', 'Instalacja na iPhonie', 'Dodaj do ekranu początkowego']];
  return `<header class="top"><div><div class="eyebrow">Hybryda</div><h1>Więcej</h1></div></header>
    <div class="list">${items.map(([k, t, s]) => `<button class="listrow" data-a="more" data-v="${k}"><div><b>${t}</b><small>${esc(s || '')}</small></div>${ic('right')}</button>`).join('')}</div>`;
}
const back = (to = '') => `<button class="iconbtn" data-a="more" data-v="${to}" aria-label="Wstecz">${ic('left')}</button>`;

function viewGoal() {
  const g = state.goal;
  return `<header class="top"><div class="row gap">${back()}<h1>Cel treningowy</h1></div></header>
  <div class="list">${Object.entries(GOALS).map(([k, v]) => `<button class="goalopt ${g.type === k ? 'on' : ''}" data-a="setGoal" data-v="${k}"><b>${v.label}</b><small>${v.desc}</small>
    <span class="muted small">Tydzień idealny: ${Object.entries(v.targets).filter(([, t]) => t >= 1).map(([c, t]) => `${t}× ${CAT_LABEL[c].toLowerCase()}`).join(', ')}</span></button>`).join('')}</div>
  <h2 class="sec">Dystans docelowy</h2>
  <div class="chips">${Object.entries(FOCUS).map(([k, v]) => `<button class="chipbtn ${g.runFocus === k ? 'on' : ''}" data-a="setFocus" data-v="${k}">${v}</button>`).join('')}</div>
  <div class="grid2">
    <label class="field"><span>Docelowy czas</span><input data-in="goalTime" value="${esc(g.targetTime)}" placeholder="np. 44:59"></label>
    <label class="field"><span>Data startu</span><input type="date" data-in="goalDate" value="${esc(g.targetDate)}"></label>
  </div>
  ${goalFeasibility()}
  <label class="field"><span>Notatka do celu</span><textarea data-in="goalNote" rows="2" placeholder="np. zero masy w nogach, prosta postawa">${esc(g.note)}</textarea></label>`;
}
function goalFeasibility() {
  const g = state.goal, est = estimateVdot();
  const sec = parseTime(g.targetTime);
  const dist = { '5k': 5000, '10k': 10000, hm: 21097.5, m: 42195 }[g.runFocus];
  if (!sec || !dist || !est.vdot) return '';
  const need = vdotFrom(dist, sec);
  const gap = need - est.vdot;
  const weeks = g.targetDate ? Math.max(0, diffDays(g.targetDate, today()) / 7) : null;
  const txt = gap <= 0 ? 'Cel w zasięgu obecnej formy – możesz go podnieść.' : weeks != null ? `Potrzebny wzrost VDOT o ${fmtNum(gap)} w ${Math.round(weeks)} tyg. ${gap / Math.max(weeks, 1) > 0.25 ? '– ambitnie (realnie ~0,15–0,25/tydz. przy regularności).' : '– realne przy regularnym treningu.'}` : `Potrzebny VDOT ${fmtNum(need)} (obecnie ${fmtNum(est.vdot)}).`;
  return `<div class="tip ${gap > 0 ? 'info' : 'good'}"><div><b>Wymagany VDOT: ${fmtNum(need)}</b><p>${txt}</p></div></div>`;
}

function viewPlan() {
  return `<header class="top"><div class="row gap">${back()}<h1>Plan treningowy</h1></div></header>
  <p class="muted small">Edytuj ćwiczenia, serie i zakresy. Priorytet decyduje, co wypada przy krótszym czasie (3 → najpierw). Zmiany działają od następnego treningu.</p>
  <div class="list">${state.templates.map((t) => `<button class="listrow" data-a="editTpl" data-v="${t.id}"><div><b>${esc(t.name)}</b><small>${t.exercises.length} ćw. · ${t.mobility.length} mobilność · ~${fitTemplate(t).full} min</small></div>${ic('right')}</button>`).join('')}</div>
  <button class="btn ghost" data-a="newTpl">+ Nowy szablon</button>
  <button class="btn ghost danger" data-a="resetTpls">Przywróć plan z pliku (domyślny)</button>`;
}

function viewTplEdit() {
  const t = tpl(ui.editTpl);
  if (!t) { ui.editTpl = null; return viewPlan(); }
  return `<header class="top"><div class="row gap"><button class="iconbtn" data-a="editTpl" data-v="" aria-label="Wstecz">${ic('left')}</button><h1>${esc(t.name)}</h1></div></header>
  <div class="grid2">
    <label class="field"><span>Nazwa</span><input data-in="tplName" value="${esc(t.name)}"></label>
    <label class="field"><span>Typ</span><select data-in="tplKind">${[['upper', 'Góra'], ['lower', 'Nogi + mobilność'], ['mob', 'Mobilność'], ['full', 'Całe ciało']].map(([k, l]) => `<option value="${k}" ${t.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  </div>
  <label class="field"><span>Opis</span><input data-in="tplDesc" value="${esc(t.desc || '')}"></label>
  <h2 class="sec">Ćwiczenia <span class="muted small">~${fitTemplate(t).full} min</span></h2>
  ${t.exercises.map((e, i) => `<div class="edrow">
    <div class="grow" data-a="editEx" data-v="${i}"><b>${esc(e.name)}</b><small>${e.repMin}–${e.repMax} ${e.unit === 'sec' ? 's' : 'powt.'} · przerwa ${e.rest}s · P${e.prio}${e.ss ? ' · ' + esc(e.ss) : ''}</small></div>
    <div class="stepper"><button data-a="exSets" data-v="${i}" data-d="-1">−</button><span>${e.sets}</span><button data-a="exSets" data-v="${i}" data-d="1">+</button></div>
    <div class="col"><button class="iconbtn xs" data-a="exMove" data-v="${i}" data-d="-1">${ic('up')}</button><button class="iconbtn xs" data-a="exMove" data-v="${i}" data-d="1">${ic('down')}</button></div>
  </div>`).join('') || '<div class="empty">Brak ćwiczeń</div>'}
  <button class="btn ghost" data-a="editEx" data-v="new">+ Dodaj ćwiczenie</button>
  <h2 class="sec">Mobilność</h2>
  ${t.mobility.map((m, i) => `<div class="edrow"><div class="grow" data-a="editMob" data-v="${i}"><b>${esc(m.name)}</b><small>${esc(m.dose)}</small></div>
    <div class="col"><button class="iconbtn xs" data-a="mobMove" data-v="${i}" data-d="-1">${ic('up')}</button><button class="iconbtn xs" data-a="mobMove" data-v="${i}" data-d="1">${ic('down')}</button></div></div>`).join('') || '<div class="empty">Brak</div>'}
  <button class="btn ghost" data-a="editMob" data-v="new">+ Dodaj pozycję mobilności</button>
  <button class="btn ghost danger" data-a="delTpl">Usuń szablon</button>`;
}

function viewOpt() {
  const sug = planSuggestions();
  const ms = muscleSets(addDays(today(), -27), today());
  return `<header class="top"><div class="row gap">${back()}<h1>Optymalizacja</h1></div></header>
  <p class="muted small">Sugestie wynikają z Twojej faktycznej częstotliwości, progresji i biegów. „Zastosuj” zmienia plan – możesz to cofnąć w edytorze planu.</p>
  ${sug.map((s, i) => `<div class="tip info"><div><b>${esc(s.title)}</b><p>${esc(s.text)}</p></div>${s.apply ? `<button class="btn sm" data-a="applySug" data-v="${i}">Zastosuj</button>` : ''}</div>`).join('') || '<div class="empty">Brak sugestii – zbieraj dane</div>'}
  <section class="card"><h2>Średnio serii / tydzień (4 tyg.)</h2>
  <table class="tbl">${Object.entries(MUSCLE_RANGE).map(([m, [lo, hi]]) => { const v = (ms[m] || 0) / 4; return `<tr><td>${MUSCLES[m]}</td><td class="num ${v < lo ? 'warnc' : v > hi ? 'bad' : 'okc'}">${fmtNum(v)}</td><td class="num muted">${lo}–${hi}</td></tr>`; }).join('')}</table></section>`;
}

function viewSettings() {
  const s = state.settings, est = estimateVdot();
  const dl = s.deloadUntil && s.deloadUntil >= today();
  return `<header class="top"><div class="row gap">${back()}<h1>Ustawienia</h1></div></header>
  <div class="grid2">
    <label class="field"><span>Tętno maks. ${s.hrMaxAuto ? '(auto)' : ''}</span><input inputmode="numeric" data-in="hrMax" value="${s.hrMax || ''}" placeholder="np. 196"></label>
    <label class="field"><span>Tętno spoczynkowe</span><input inputmode="numeric" data-in="hrRest" value="${s.hrRest || ''}"></label>
    <label class="field"><span>VDOT ręcznie</span><input inputmode="decimal" data-in="vdot" value="${s.vdotOverride || ''}" placeholder="auto: ${est.vdot && est.source === 'auto' ? fmtNum(est.vdot) : '–'}"></label>
    <label class="field"><span>Masa ciała (kg)</span><input inputmode="decimal" data-in="bodyW" value="${bodyWeight() || ''}"></label>
  </div>
  <label class="toggle"><input type="checkbox" data-in="hrAuto" ${s.hrMaxAuto ? 'checked' : ''}> HRmax z najwyższego tętna w importach</label>
  <label class="toggle"><input type="checkbox" data-in="sound" ${s.sound ? 'checked' : ''}> Dźwięk po końcu przerwy</label>
  <section class="card"><h2>Deload</h2><p class="muted small">Tydzień lżejszy: −1 seria, ~90% ciężaru, bez maksymalnych akcentów biegowych.</p>
  ${dl ? `<p>Aktywny do <b>${s.deloadUntil}</b></p><button class="btn" data-a="undeload">Zakończ deload</button>` : `<button class="btn" data-a="deload">Włącz na 7 dni</button>`}</section>`;
}

function viewData() {
  let size = 0; try { size = (localStorage.getItem('hybryda-tracker-v1') || '').length; } catch (e) { /* */ }
  return `<header class="top"><div class="row gap">${back()}<h1>Dane</h1></div></header>
  <section class="card"><h2>Biegi z Garmina</h2><p class="muted small">Garmin Connect (web) → Aktywności → Wszystkie aktywności → Eksportuj CSV. Albo pliki .FIT (Eksportuj oryginał) – dają okrążenia i strefy tętna. Duplikaty są łączone automatycznie.</p>
  <button class="btn primary" data-a="import">${ic('upload')} Importuj CSV / FIT</button></section>
  <section class="card"><h2>Kopia zapasowa</h2><p class="muted small">Dane są tylko na tym urządzeniu (${Math.round(size / 1024)} kB). Rób eksport co jakiś czas – np. do Plików / iCloud.</p>
  <div class="row gap wrap"><button class="btn" data-a="exportData">Eksportuj JSON</button><button class="btn ghost" data-a="importBackup">Przywróć z JSON</button></div></section>
  <section class="card"><h2>Stan</h2><p class="small">${state.sessions.length} treningów siłowych · ${state.runs.length} aktywności · ${state.plan.length} slotów</p>
  <button class="btn danger" data-a="resetAll">Usuń wszystkie dane</button></section>`;
}

function viewInstall() {
  return `<header class="top"><div class="row gap">${back()}<h1>Instalacja</h1></div></header>
  <section class="card"><ol class="steps">
    <li>Otwórz adres aplikacji w <b>Safari</b> na iPhonie.</li>
    <li>Stuknij <b>Udostępnij</b> (kwadrat ze strzałką).</li>
    <li>Wybierz <b>Do ekranu początkowego</b> → Dodaj.</li>
    <li>Uruchamiaj z ikony – działa offline, pełny ekran.</li>
  </ol>
  <p class="muted small">Dane zapisują się lokalnie w aplikacji na ekranie początkowym (oddzielnie od karty Safari). Eksportuj kopię JSON przed zmianą telefonu.</p></section>`;
}

function exAlts(it) {
  const [, e] = findTplEx(it.exId);
  const set = new Set([...(e?.alts || []), ...(it.origName ? [it.origName] : []), ...alternatives(it.origName || it.name, it.muscles || {}), ...alternatives(it.name, it.muscles || {})]);
  set.delete(it.name);
  return [...set].slice(0, 8);
}

function stravaCard() {
  const s = state.settings.strava;
  if (strava.connected()) {
    return `<section class="card strava"><div class="row between gap"><div><h2>Strava</h2><small>Połączono${s.athlete ? ' jako ' + esc(s.athlete) : ''} · ${s.lastSync ? 'synchr. ' + new Date(s.lastSync).toLocaleString('pl-PL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jeszcze nie synchronizowano'}</small></div>
      <button class="btn sm primary" data-a="stravaSync" ${ui.syncing ? 'disabled' : ''}>${ui.syncing ? 'Trwa…' : 'Synchronizuj'}</button></div>
      <p class="muted small" id="syncMsg">${ui.syncing ? esc(ui.syncing) : 'Garmin wysyła treningi do Stravy automatycznie, a aplikacja pobiera je przy starcie (co 30 min) lub po stuknięciu „Synchronizuj”.'}</p>
      ${s.error ? `<p class="small bad">${esc(s.error)}</p>` : ''}
      <button class="link" data-a="stravaDisconnect">Rozłącz</button></section>`;
  }
  const host = location.host || 'okolacki.github.io';
  return `<section class="card strava"><h2>Automatyczny import ze Stravy</h2>
    <ol class="steps small">
      <li>Połącz Garmin Connect ze Stravą (Garmin Connect → Ustawienia → Aplikacje partnerskie), jeśli jeszcze nie jest.</li>
      <li>Na <b>strava.com/settings/api</b> utwórz aplikację: Category <i>Training</i>, Website <code>${esc(location.origin + location.pathname)}</code>, Authorization Callback Domain <code>${esc(host)}</code>.</li>
      <li>Wpisz poniżej <b>Client ID</b> i <b>Client Secret</b> i stuknij „Połącz”.</li>
    </ol>
    <div class="grid2"><label class="field"><span>Client ID</span><input inputmode="numeric" data-in="stvId" value="${esc(s.clientId)}"></label>
    <label class="field"><span>Client Secret</span><input type="password" data-in="stvSecret" value="${esc(s.clientSecret)}" autocomplete="off"></label></div>
    <button class="btn primary" data-a="stravaConnect" ${s.clientId && s.clientSecret ? '' : 'disabled'}>Połącz ze Stravą</button>
    <details class="small mt"><summary>Strava pokazała kod poza aplikacją?</summary>
      <div class="row gap mt"><input class="grow txt" id="stvCode" placeholder="Wklej kod"><button class="btn sm" data-a="stravaCode">Zatwierdź</button></div></details>
    ${s.error ? `<p class="small bad">${esc(s.error)}</p>` : ''}
    <p class="muted small">Sekret zostaje tylko na tym telefonie (nie trafia do kopii zapasowej).</p></section>`;
}

function viewCoach() {
  if (!state.settings.aiKey) {
    return `<header class="top"><div><div class="eyebrow">Google Gemini</div><h1>Asystent</h1></div></header>
    <section class="card"><h2>Podłącz Gemini z Google AI Studio</h2>
      <ol class="steps small">
        <li>Wejdź na <b>aistudio.google.com/apikey</b> i zaloguj się kontem Google.</li>
        <li>Stuknij <b>Create API key</b> i skopiuj klucz.</li>
        <li>Wklej go poniżej i zapisz.</li>
      </ol>
      <label class="field"><span>Klucz API</span><input type="password" id="aiKeyIn" placeholder="AIza…" autocomplete="off"></label>
      <button class="btn primary" data-a="aiSaveKey">Zapisz i sprawdź</button>
      ${ui.aiErr ? `<p class="small bad">${esc(ui.aiErr)}</p>` : ''}
    </section>
    <section class="card"><h2>Bezpieczeństwo i prywatność</h2><ul class="notes small">
      <li>Klucz zostaje tylko na tym telefonie i nie trafia do eksportu JSON.</li>
      <li>Przy każdym pytaniu do Google wysyłane jest podsumowanie Twoich treningów (cel, plan, historia serii, biegi).</li>
      <li>Zalecane: w Google Cloud Console → Credentials ogranicz klucz do <i>Generative Language API</i> i witryny <code>${esc(location.host || 'okolacki.github.io')}/*</code>.</li>
      <li>W darmowym planie AI Studio obowiązują limity zapytań, a Google może wykorzystywać treści do ulepszania usług.</li>
    </ul></section>`;
  }
  const chat = state.chat;
  return `<header class="top"><div><div class="eyebrow">${esc(chain().join(' → '))}</div><h1>Asystent</h1></div>
    <div class="row gap"><button class="btn sm ghost" data-a="aiMemory">Profil${state.memory.facts.length ? ' · ' + state.memory.facts.length : ''}</button><button class="iconbtn" data-a="aiSettings" aria-label="Ustawienia asystenta">${ic('dots')}</button></div></header>
  ${!state.memory.profile && !state.memory.facts.length ? `<button class="tip info" data-a="aiMemory"><div><b>Uzupełnij profil dla asystenta</b><p>Kontuzje, sprzęt na siłowni, ile realnie masz czasu, preferencje – asystent będzie to brał pod uwagę w każdej odpowiedzi.</p></div></button>` : ''}
  ${chat.length ? '' : `<div class="hint">Asystent widzi Twój cel, plan, historię serii, biegi, VDOT i bieżący tydzień. Zapytaj o cokolwiek albo zacznij od gotowego pytania.</div>`}
  <div class="chat">${chat.map((m) => `<div class="bubble ${m.role === 'user' ? 'me' : 'ai'} ${m.err ? 'err' : ''}" ${m.pending ? 'id="aiStream"' : ''}>${m.role === 'user' ? esc(m.text).replace(/\n/g, '<br>') : m.pending && !m.text ? '<span class="typing"><i></i><i></i><i></i></span>' : md(m.text)}${m.sources?.length ? `<div class="srcs"><b>Źródła:</b> ${m.sources.slice(0, 5).map((x) => `<a href="${esc(x.uri)}" target="_blank" rel="noopener">${esc(x.title)}</a>`).join(' · ')}</div>` : ''}${m.actions?.length ? actionCards(m) : ''}${m.role !== 'user' && !m.pending && m.model ? `<div class="meta">${esc(m.model)}${m.note ? ' · ' + esc(m.note) : ''}</div>` : ''}</div>`).join('')}</div>
  <div class="quick">${QUICK.map(([l], i) => `<button class="chipbtn" data-a="aiQuick" data-v="${i}" ${ui.aiBusy ? 'disabled' : ''}>${l}</button>`).join('')}</div>
  <div class="composer"><textarea id="aiIn" rows="2" placeholder="Zapytaj trenera…" ${ui.aiBusy ? 'disabled' : ''}></textarea>
    <button class="iconbtn send" data-a="aiSend" ${ui.aiBusy ? 'disabled' : ''} aria-label="Wyślij">${ic('send')}</button></div>`;
}

async function aiSend(text) {
  text = (text || '').trim();
  if (!text || ui.aiBusy) return;
  if (!state.settings.aiKey) { actions.tab('coach'); return; }
  const past = state.chat.filter((m) => !m.err && !m.pending && m.text);
  state.chat.push({ role: 'user', text, at: Date.now() });
  const reply = { role: 'model', text: '', pending: true, at: Date.now() };
  state.chat.push(reply);
  ui.aiBusy = true; ui.tab = 'coach'; ui.sheet = null;
  render(); scrollChat();
  try {
    const out = await ask([...past, { role: 'user', text }], (t) => {
      reply.text = t;
      const el = document.getElementById('aiStream');
      if (el) { el.innerHTML = md(t); scrollChat(); }
    });
    reply.text = out.text; reply.model = out.model; reply.note = out.note || ''; reply.sources = out.sources || [];
    reply.actions = (out.calls || []).slice(0, 8).map((c) => ({ id: uid(), name: c.name, args: c.args, status: 'pending' }));
  } catch (e) {
    reply.text = '⚠️ ' + (e.message || e); reply.err = true;
    state.chat[state.chat.length - 2].err = true;
  }
  reply.pending = false; ui.aiBusy = false;
  if (state.chat.length > 40) state.chat = state.chat.slice(-40);
  save(); render(); scrollChat();
}
function actionCards(m) {
  const pending = m.actions.filter((a) => a.status === 'pending' && describeAct(a).ok).length;
  const label = { pending: '', applied: '✓ Zastosowano', rejected: 'Odrzucono', error: 'Błąd' };
  return `<div class="acts">${m.actions.map((a) => {
    const d = describeAct(a);
    const st = a.status;
    return `<div class="act ${st} ${d.ok ? '' : 'invalid'}"><div class="grow"><small>${ACT_LABEL[a.name] || a.name}</small><b>${esc(st === 'pending' ? d.text : a.summary || d.text)}</b>${a.error ? `<small class="bad">${esc(a.error)}</small>` : ''}</div>
      ${st === 'pending' ? (d.ok ? `<div class="col"><button class="btn sm primary" data-a="actApply" data-v="${a.id}">Zastosuj</button><button class="btn sm ghost" data-a="actReject" data-v="${a.id}">Odrzuć</button></div>` : `<button class="btn sm ghost" data-a="actReject" data-v="${a.id}">Ukryj</button>`) : `<span class="actst">${label[st]}</span>`}</div>`;
  }).join('')}${pending > 1 ? `<button class="btn sm primary" data-a="actApplyAll" data-v="${m.actions[0].id}">Zastosuj wszystkie (${pending})</button>` : ''}</div>`;
}
const ACT_LABEL = { update_exercise: 'Zmiana ćwiczenia', add_exercise: 'Nowe ćwiczenie', remove_exercise: 'Usunięcie ćwiczenia', plan_session: 'Nowy slot', set_goal: 'Cel', set_deload: 'Deload', remember: 'Pamięć asystenta' };
function findAct(id) { for (const m of state.chat) for (const a of m.actions || []) if (a.id === id) return a; return null; }
function runAct(a) {
  if (a.status !== 'pending') return;
  const d = describeAct(a);
  try { applyAct(a); a.status = 'applied'; a.summary = d.text; } catch (e) { a.status = 'error'; a.error = e.message; }
}

function scrollChat() { requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight)); }

async function runStravaSync(silent = false) {
  if (ui.syncing) return;
  ui.syncing = 'Łączę ze Stravą…'; if (!silent) render();
  try {
    const r = await strava.sync({ onProgress: (m) => { ui.syncing = m; const el = document.getElementById('syncMsg'); if (el) el.textContent = m; } });
    linkSlots(); save();
    ui.syncing = '';
    if (!silent) openSheet('msg', { title: 'Strava zsynchronizowana', text: `Pobrano ${r.fetched} aktywności: nowe ${r.added}, zaktualizowane ${r.updated}.` });
    else render();
  } catch (e) {
    ui.syncing = ''; state.settings.strava.error = String(e.message || e); save();
    if (!silent) openSheet('msg', { title: 'Błąd synchronizacji', text: state.settings.strava.error });
    else render();
  }
}

function downloadFile(content, name, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

// ====================== ARKUSZE (modale) ======================
function renderSheet() {
  const S = ui.sheet, F = ui.form;
  const head = (t) => `<div class="sheethead"><h2>${t}</h2><button class="iconbtn" data-a="closeSheet" aria-label="Zamknij">${ic('x')}</button></div>`;
  if (S.type === 'slot') {
    const mins = [30, 45, 60, 75, 90, 105, 120];
    return `${head(S.slotId ? 'Edytuj slot' : 'Zaplanuj trening')}
      <div class="grid2"><label class="field"><span>Dzień</span><input type="date" data-f="date" value="${F.date}"></label>
      <label class="field"><span>Godzina</span><input type="time" data-f="time" value="${F.time}"></label></div>
      <div class="field"><span>Ile masz czasu?</span><div class="chips">${mins.map((m) => `<button class="chipbtn ${+F.minutes === m ? 'on' : ''}" data-a="setf" data-k="minutes" data-v="${m}">${m}</button>`).join('')}<input class="mini" inputmode="numeric" data-f="minutes" value="${F.minutes}" aria-label="minuty"></div></div>
      <div class="field"><span>Samopoczucie (opcjonalnie)</span><div class="chips">${['😫', '😕', '🙂', '💪', '🔥'].map((e, i) => `<button class="chipbtn emo ${+F.energy === i + 1 ? 'on' : ''}" data-a="setf" data-k="energy" data-v="${+F.energy === i + 1 ? 0 : i + 1}">${e}</button>`).join('')}</div></div>
      <div class="row gap"><button class="btn primary grow" data-a="saveSlot">Zapisz</button>${S.slotId ? `<button class="btn danger" data-a="delSlot" data-v="${S.slotId}">Usuń</button>` : ''}</div>`;
  }
  if (S.type === 'change') {
    const p = state.plan.find((x) => x.id === S.slotId);
    const asg = assignWeek(weekStart(p.date))[p.id] || {};
    const alts = asg.alts || [];
    const allC = candidates();
    const max = Math.max(0.01, ...alts.map((a) => a.score));
    return `${head('Wybierz trening')}<p class="muted small">${fmtDateLong(p.date)} · ${p.minutes} min. Ranking wg celu, regeneracji i bilansu tygodnia.</p>
      <button class="altrow ${!p.override ? 'on' : ''}" data-a="pickAlt" data-v=""><b>Automatycznie</b><small>Najlepsza sugestia: ${esc(alts[0]?.cand.label || '–')}</small></button>
      ${alts.map((a) => `<button class="altrow ${p.override === a.cand.key ? 'on' : ''} ${catClass(a.cand.cats)}" data-a="pickAlt" data-v="${a.cand.key}"><div class="grow"><b>${esc(a.cand.label)}</b><small>${esc(a.reasons.slice(0, 2).map((r) => r.t).join(' · ') || '—')}</small></div><span class="score"><i style="width:${Math.max(4, (a.score / max) * 100)}%"></i></span></button>`).join('')}
      ${allC.filter((c) => !alts.some((a) => a.cand.key === c.key)).map((c) => `<div class="altrow disabled"><b>${esc(c.label)}</b><small>min. ${c.min} min</small></div>`).join('')}`;
  }
  if (S.type === 'runDetails') {
    const p = state.plan.find((x) => x.id === S.slotId);
    const a = assignWeek(weekStart(p.date))[p.id];
    const w = buildWorkout(a.cand, p.minutes);
    return `${head(esc(w.run.title))}<p class="muted small">${fmtDateLong(p.date)} · ~${w.run.estMin} min · VDOT ${fmtNum(w.run.vdot)}</p>
      ${w.run.steps.map((s) => `<div class="step"><b>${esc(s.t)}</b><small>${esc(s.d)}</small></div>`).join('')}
      <p class="muted small">Wskazówka: ustaw ten trening w zegarku Garmin (Connect → Treningi → Utwórz) albo prowadź okrążenia ręcznie.</p>
      <button class="btn primary" data-a="runDone" data-v="${p.id}">Oznacz jako zrobione</button>`;
  }
  if (S.type === 'logRun') {
    return `${head(S.slotId ? 'Zapisz bieg' : 'Dodaj aktywność')}
      <label class="field"><span>Data</span><input type="date" data-f="date" value="${F.date}"></label>
      <div class="field"><span>Typ</span><div class="chips">${Object.entries(RUN_TYPES).map(([k, v]) => `<button class="chipbtn ${F.wt === k ? 'on' : ''}" data-a="setf" data-k="wt" data-v="${k}">${v.label}</button>`).join('')}</div></div>
      <div class="grid3">
        <label class="field"><span>Dystans km</span><input inputmode="decimal" data-f="dist" value="${F.dist || ''}"></label>
        <label class="field"><span>Czas</span><input data-f="time" value="${F.time || ''}" placeholder="45:00"></label>
        <label class="field"><span>Śr. tętno</span><input inputmode="numeric" data-f="hr" value="${F.hr || ''}"></label>
      </div>
      <button class="btn primary" data-a="saveRun">Zapisz</button>
      ${S.slotId ? `<button class="btn ghost" data-a="slotDoneNoData">Zrobione – dane zaimportuję z Garmina</button>` : ''}`;
  }
  if (S.type === 'addLog') {
    return `${head(fmtDateLong(S.date))}
      <button class="listrow" data-a="logRunFor" data-v="${S.date}"><div><b>Bieg / cardio</b><small>Wpisz dystans i czas ręcznie</small></div>${ic('right')}</button>
      ${S.date === today() ? state.templates.map((t) => `<button class="listrow" data-a="startTpl" data-v="${t.id}"><div><b>Start: ${esc(t.name)}</b></div>${ic('right')}</button>`).join('') : ''}
      <button class="listrow" data-a="import"><div><b>Import z Garmina</b><small>CSV / FIT</small></div>${ic('right')}</button>`;
  }
  if (S.type === 'session') {
    const s = state.sessions.find((x) => x.id === S.id);
    if (!s) return head('Brak');
    return `${head(esc(s.tplName))}<p class="muted small">${fmtDateLong(s.date)}${s.durationMin ? ' · ' + fmtMin(s.durationMin) : ''}${s.rpe ? ' · RPE ' + s.rpe : ''}</p>
      ${s.exercises.map((e, i) => `<div class="hx"><b>${esc(e.name)}</b><div class="hsets">${e.sets.map((x, j) => `<span><input inputmode="decimal" data-in="hw" data-i="${i}" data-j="${j}" value="${x.w ?? ''}">×<input inputmode="numeric" data-in="hr" data-i="${i}" data-j="${j}" value="${x.r ?? ''}"></span>`).join('')}</div></div>`).join('')}
      ${s.mobDone ? `<p class="small">Mobilność: ${s.mobDone} pozycji</p>` : ''}${s.addon ? `<p class="small">Dodatek: ${s.addon}</p>` : ''}
      ${s.notes ? `<p class="note">${esc(s.notes)}</p>` : ''}
      <button class="btn danger" data-a="delSession" data-v="${s.id}">Usuń trening</button>`;
  }
  if (S.type === 'run') {
    const r = state.runs.find((x) => x.id === S.id);
    if (!r) return head('Brak');
    const rt = classify(r), z = zoneTimes(r);
    const zt = z ? z.reduce((a, b) => a + b, 0) : 0;
    return `${head(esc(r.title || 'Aktywność'))}<p class="muted small">${fmtDateLong(r.date)} ${r.date.slice(11, 16)} · źródło: ${r.source}</p>
      <div class="stats4"><div class="stat"><small>Dystans</small><b>${fmtNum(r.distKm, 2)} km</b></div><div class="stat"><small>Czas</small><b>${fmtDur(r.timeSec)}</b></div><div class="stat"><small>Tempo</small><b>${fmtPace(runPace(r))}</b></div><div class="stat"><small>Tętno</small><b>${r.avgHr || '–'}${r.maxHr ? '/' + r.maxHr : ''}</b></div>
      ${r.cadence ? `<div class="stat"><small>Kadencja</small><b>${r.cadence}</b></div>` : ''}${r.ascent ? `<div class="stat"><small>Przewyższenie</small><b>${r.ascent} m</b></div>` : ''}${r.te ? `<div class="stat"><small>TE aerob.</small><b>${r.te}</b></div>` : ''}</div>
      <div class="field"><span>Typ treningu ${r.wt ? '(ręcznie)' : '(auto)'}</span><div class="chips">${Object.entries(RUN_TYPES).map(([k, v]) => `<button class="chipbtn ${rt === k ? 'on' : ''}" data-a="setRunType" data-v="${k}">${v.label}</button>`).join('')}</div></div>
      ${z && zt ? `<div class="field"><span>Czas w strefach</span>${hrZones().map((zz, i) => `<div class="mbar"><span>${zz.z}</span><div class="track"><i class="val ok" style="width:${(z[i] / zt) * 100}%"></i></div><b>${Math.round(z[i] / 60)}′</b></div>`).join('')}</div>` : ''}
      ${r.laps?.length ? `<div class="field"><span>Okrążenia</span><table class="tbl">${r.laps.map((l, i) => `<tr class="${l.intensity === 1 ? 'muted' : ''}"><td>${i + 1}</td><td class="num">${l.distM ? fmtNum(l.distM / 1000, 2) + ' km' : ''}</td><td class="num">${fmtDur(l.timeSec)}</td><td class="num">${l.distM > 50 ? fmtPace(l.timeSec / (l.distM / 1000)) : ''}</td><td class="num muted">${l.avgHr || ''}</td></tr>`).join('')}</table></div>` : ''}
      <button class="btn danger" data-a="delRun" data-v="${r.id}">Usuń aktywność</button>`;
  }
  if (S.type === 'exMenu') {
    const it = state.active.items[S.i];
    return `${head(esc(it.name))}
      <div class="grid3">
        <label class="field"><span>Powt. min</span><input inputmode="numeric" data-f="repMin" value="${F.repMin}"></label>
        <label class="field"><span>Powt. max</span><input inputmode="numeric" data-f="repMax" value="${F.repMax}"></label>
        <label class="field"><span>Przerwa s</span><input inputmode="numeric" data-f="rest" value="${F.rest}"></label>
      </div>
      <label class="toggle"><input type="checkbox" data-f="persist" ${F.persist ? 'checked' : ''}> Zapisz zmiany także w planie</label>
      <div class="field"><span>Zamień ćwiczenie (zajęty sprzęt?)</span><div class="chips">${exAlts(it).map((n) => `<button class="chipbtn" data-a="swapEx" data-v="${esc(n)}">${esc(n)}</button>`).join('') || '<span class="muted small">Brak podpowiedzi – wpisz własne</span>'}</div>
        <div class="row gap"><input class="grow" data-f="swapName" value="${esc(F.swapName || '')}" placeholder="Inne ćwiczenie…"><button class="btn sm" data-a="swapEx" data-v="">Zamień</button></div></div>
      <div class="row gap wrap"><button class="btn primary" data-a="saveExMenu">Zapisz</button><button class="btn" data-a="exMoveActive" data-d="-1">W górę</button><button class="btn" data-a="exMoveActive" data-d="1">W dół</button><button class="btn danger" data-a="removeActiveEx">Usuń z treningu</button></div>`;
  }
  if (S.type === 'addExercise') {
    const all = [];
    for (const t of state.templates) for (const e of t.exercises) if (!all.some((x) => x.name === e.name)) all.push(e);
    return `${head('Dodaj ćwiczenie')}
      <label class="field"><span>Nowe ćwiczenie</span><input data-f="name" value="${esc(F.name || '')}" placeholder="Nazwa"></label>
      <button class="btn primary" data-a="addExNew">Dodaj</button>
      <h3 class="sec">Albo z planu</h3>${all.map((e) => `<button class="listrow" data-a="addExFrom" data-v="${esc(e.id)}"><div><b>${esc(e.name)}</b><small>${e.sets}×${e.repMin}–${e.repMax}</small></div>${ic('plus')}</button>`).join('')}`;
  }
  if (S.type === 'editEx') {
    return `${head(S.i === 'new' ? 'Nowe ćwiczenie' : 'Edytuj ćwiczenie')}
      <label class="field"><span>Nazwa</span><input data-f="name" value="${esc(F.name)}"></label>
      <div class="grid3">
        <label class="field"><span>Serie</span><input inputmode="numeric" data-f="sets" value="${F.sets}"></label>
        <label class="field"><span>Min</span><input inputmode="numeric" data-f="repMin" value="${F.repMin}"></label>
        <label class="field"><span>Max</span><input inputmode="numeric" data-f="repMax" value="${F.repMax}"></label>
        <label class="field"><span>Przerwa s</span><input inputmode="numeric" data-f="rest" value="${F.rest}"></label>
        <label class="field"><span>Skok kg</span><input inputmode="decimal" data-f="inc" value="${F.inc}"></label>
        <label class="field"><span>Superseria</span><input data-f="ss" value="${esc(F.ss)}" placeholder="np. APS 1"></label>
      </div>
      <div class="grid2">
        <label class="field"><span>Sprzęt</span><select data-f="equip">${Object.entries(EQUIP).map(([k, v]) => `<option value="${k}" ${F.equip === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Jednostka</span><select data-f="unit"><option value="reps" ${F.unit === 'reps' ? 'selected' : ''}>Powtórzenia</option><option value="sec" ${F.unit === 'sec' ? 'selected' : ''}>Sekundy</option></select></label>
      </div>
      <div class="field"><span>Priorytet (przy braku czasu wypada najpierw 3)</span><div class="chips">${[[1, 'Kluczowe'], [2, 'Akcesoria'], [3, 'Opcjonalne']].map(([k, l]) => `<button class="chipbtn ${+F.prio === k ? 'on' : ''}" data-a="setf" data-k="prio" data-v="${k}">${k} · ${l}</button>`).join('')}</div></div>
      <div class="field"><span>Mięśnie (stuknij: główny → pomocniczy → brak)</span><div class="chips">${Object.entries(MUSCLES).map(([k, v]) => `<button class="chipbtn ${F.muscles[k] === 1 ? 'on' : F.muscles[k] ? 'half' : ''}" data-a="cycleMuscle" data-v="${k}">${v}</button>`).join('')}</div></div>
      <label class="field"><span>Notatka</span><input data-f="note" value="${esc(F.note)}"></label>
      <div class="row gap"><button class="btn primary grow" data-a="saveEx">Zapisz</button>${S.i !== 'new' ? '<button class="btn danger" data-a="delEx">Usuń</button>' : ''}</div>`;
  }
  if (S.type === 'editMob') {
    return `${head(S.i === 'new' ? 'Nowa pozycja' : 'Edytuj mobilność')}
      <label class="field"><span>Nazwa</span><input data-f="name" value="${esc(F.name)}"></label>
      <div class="grid3">
        <label class="field"><span>Dawka</span><input data-f="dose" value="${esc(F.dose)}" placeholder="3 × 45 s"></label>
        <label class="field"><span>Serie</span><input inputmode="numeric" data-f="sets" value="${F.sets}"></label>
        <label class="field"><span>Minutnik s</span><input inputmode="numeric" data-f="secs" value="${F.secs}"></label>
      </div>
      <label class="field"><span>Cel / notatka</span><input data-f="note" value="${esc(F.note)}"></label>
      <div class="row gap"><button class="btn primary grow" data-a="saveMob">Zapisz</button>${S.i !== 'new' ? '<button class="btn danger" data-a="delMob">Usuń</button>' : ''}</div>`;
  }
  if (S.type === 'finish') {
    const A = state.active;
    const sets = A.items.reduce((a, it) => a + it.sets.filter((s) => s.done || +s.r > 0).length, 0);
    return `${head('Zakończ trening')}<p>${sets} serii · ${fmtMin((Date.now() - A.startedAt) / 60000)}</p>
      <div class="field"><span>Jak ciężko było? (RPE sesji)</span><div class="chips">${[5, 6, 7, 8, 9, 10].map((n) => `<button class="chipbtn ${+F.rpe === n ? 'on' : ''}" data-a="setf" data-k="rpe" data-v="${n}">${n}</button>`).join('')}</div></div>
      <button class="btn primary" data-a="saveWorkout">Zapisz trening</button>`;
  }
  if (S.type === 'summary') {
    return `${head('Zapisano 💪')}<p>${esc(S.text)}</p>${S.prs.length ? `<div class="tip good"><div><b>Nowe rekordy</b><p>${S.prs.map((p) => `${esc(p.name)}: e1RM ${fmtNum(p.prev, 0)} → ${fmtNum(p.cur, 0)}`).join('<br>')}</p></div></div>` : ''}
      <button class="btn primary" data-a="closeSheet">OK</button>`;
  }
  if (S.type === 'plates') {
    const w = num(F.w) || 0, bar = +F.bar || 20, res = plates(w, bar);
    return `${head('Kalkulator talerzy')}
      <div class="grid2"><label class="field"><span>Ciężar całkowity (kg)</span><input inputmode="decimal" data-f="w" value="${F.w}"></label>
      <div class="field"><span>Gryf (kg)</span><div class="chips">${[20, 15, 10, 7].map((b) => `<button class="chipbtn ${bar === b ? 'on' : ''}" data-a="setf" data-k="bar" data-v="${b}">${b}</button>`).join('')}</div></div></div>
      <button class="btn ghost sm" data-a="platesCalc">Przelicz</button>
      ${res ? `<div class="field"><span>Na każdą stronę</span><div class="plates">${res.plates.map((x) => `<span class="plate">${fmtKg(x)}</span>`).join('') || '<span class="muted">sam gryf</span>'}</div>${res.rest ? `<p class="muted small">Nie da się złożyć dokładnie – brakuje ${fmtKg(res.rest)} kg.</p>` : ''}</div>` : '<p class="muted">Ciężar mniejszy niż gryf.</p>'}
      <p class="muted small">Sztanga łamana zwykle waży 7–10 kg – sprawdź na swojej siłowni.</p>`;
  }
  if (S.type === 'report') {
    const r = weekReport(S.ws);
    const pct = Math.round(r.adherence * 100);
    const dKm = r.ended && r.prevKm > 0 ? Math.round((r.km / r.prevKm - 1) * 100) : null;
    return `${head(`Raport · tydzień ${isoWeek(S.ws)}`)}
      <p class="muted small">${fmtDate(r.ws)} – ${fmtDate(r.we)}${r.ended ? '' : ' · tydzień w trakcie'}</p>
      <div class="adh"><div class="ring" style="--p:${pct}"><b>${pct}%</b></div><div><b>Zgodność z celem</b><small>${esc(GOALS[state.goal.type]?.label || '')}</small><small>Sloty: ${r.done}/${r.slots} zrobione${r.missed ? ` · ${r.missed} przepadło` : ''}</small></div></div>
      <div class="pills">${Object.entries(r.targets).filter(([, t]) => t >= 1).map(([k, t]) => { const d = r.counts[k] || 0; return `<div class="pill ${d >= t ? 'full' : ''}"><span>${CAT_LABEL[k]}</span><b>${fmtNum(d, d % 1 ? 1 : 0)}/${t}</b><i style="width:${Math.min(100, (d / t) * 100)}%"></i></div>`; }).join('')}</div>
      <div class="stats4">
        <div class="stat"><small>Siłownia</small><b>${r.sessions.length} · ${r.sets} serii</b></div>
        <div class="stat"><small>Tonaż</small><b>${Math.round(r.tonnage)} kg</b></div>
        <div class="stat"><small>Bieg${dKm != null ? ` (${dKm > 0 ? '+' : ''}${dKm}% t/t)` : ''}</small><b class="${dKm > 25 ? 'warnc' : ''}">${fmtNum(r.km)} km</b></div>
        <div class="stat"><small>Biegi / akcenty</small><b>${r.rr.length} / ${r.quality}</b></div>
        <div class="stat"><small>Najdłuższy</small><b>${fmtNum(r.longest)} km</b></div>
        <div class="stat"><small>Czas treningu</small><b>${fmtMin(r.duration)}</b></div>
      </div>
      ${r.prs.length ? `<div class="tip good"><div><b>Rekordy</b><p>${r.prs.map((x) => `${esc(x.name)}: e1RM ${fmtNum(x.prev, 0)} → ${fmtNum(x.cur, 0)}`).join('<br>')}</p></div></div>` : ''}
      <div class="field"><span>Wnioski</span><ul class="notes">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
      <button class="btn primary" data-a="askReport" data-v="${S.ws}">${ic('coach')} Zapytaj asystenta o ten tydzień</button>`;
  }
  if (S.type === 'calendar') {
    const ev = upcomingEvents(+F.weeks || 2);
    const rem = state.settings.reminder;
    return `${head('Eksport do kalendarza')}
      <p class="muted small">Zaplanowane sloty trafią do Kalendarza iPhone'a z opisem treningu i przypomnieniem. Godzinę ustawiasz przy slocie.</p>
      <div class="field"><span>Zakres</span><div class="chips">${[[1, 'Ten tydzień'], [2, '2 tygodnie'], [4, '4 tygodnie']].map(([k, l]) => `<button class="chipbtn ${(+F.weeks || 2) === k ? 'on' : ''}" data-a="setf" data-k="weeks" data-v="${k}">${l}</button>`).join('')}</div></div>
      <div class="field"><span>Przypomnienie</span><div class="chips">${[[0, 'Bez'], [30, '30 min'], [60, '1 h'], [120, '2 h']].map(([k, l]) => `<button class="chipbtn ${rem === k ? 'on' : ''}" data-a="setReminder" data-v="${k}">${l}</button>`).join('')}</div></div>
      ${ev.length ? `<div class="evlist">${ev.map((e) => `<div><b>${fmtDate(e.date)} ${e.time}</b><span>${esc(e.title)}</span></div>`).join('')}</div>` : '<div class="empty">Brak przyszłych slotów w tym zakresie – zaplanuj je w widoku tygodnia.</div>'}
      ${ev.length ? `<button class="btn primary" data-a="icsOpen">Dodaj do Kalendarza</button><button class="btn ghost" data-a="icsShare">Udostępnij / zapisz plik .ics</button>
      <p class="muted small">Ponowny eksport tych samych slotów może utworzyć duplikaty – po większych zmianach usuń stare wydarzenia.</p>` : ''}`;
  }
  if (S.type === 'aiMemory') {
    return `${head('Profil dla asystenta')}
      <p class="muted small">Asystent dostaje to przy każdym pytaniu. Pisz konkretnie: kontuzje i ograniczenia, sprzęt na siłowni, realna dostępność, preferencje, cele poboczne.</p>
      <label class="field"><span>O mnie</span><textarea data-f="profile" rows="5" placeholder="np. 28 lat, 180 cm. Prawy bark wrażliwy przy dipsach. Siłownia ma bramę, hantle do 40 kg, brak maszyny Smitha. Biegam rano przed pracą, max 60 min w tygodniu.">${esc(F.profile || '')}</textarea></label>
      <div class="field"><span>Zapamiętane fakty (${state.memory.facts.length})</span>
        ${state.memory.facts.map((f) => `<div class="fact"><span class="grow">${esc(f.text)} <small>${f.at}</small></span><button class="iconbtn sm faint" data-a="memDel" data-v="${f.id}" aria-label="Usuń">${ic('x')}</button></div>`).join('') || '<span class="muted small">Asystent zaproponuje fakty do zapamiętania, gdy o nich wspomnisz.</span>'}
        <div class="row gap"><input class="grow txt" data-f="fact" value="${esc(F.fact || '')}" placeholder="Dodaj fakt…"><button class="btn sm" data-a="memAdd">Dodaj</button></div></div>
      <button class="btn primary" data-a="memSave">Zapisz</button>`;
  }
  if (S.type === 'aiSettings') {
    const avail = ui.models ? new Set(ui.models.map((m) => m.id)) : null;
    return `${head('Ustawienia asystenta')}
      <div class="field"><span>Model główny (drugi z listy jest automatycznym zapasem)</span>
      ${MODEL_CHAIN.map((id) => `<label class="radio ${state.settings.aiModel === id ? 'on' : ''}"><input type="radio" name="aim" data-in="aiModel" value="${id}" ${state.settings.aiModel === id ? 'checked' : ''}>
        <div><b>${id}</b><small>${MODEL_INFO[id]}${avail ? (avail.has(id) ? ' · dostępny na Twoim kluczu' : ' · <span class="bad">brak na liście Twojego klucza</span>') : ''}</small></div></label>`).join('')}
      ${ui.models ? '' : '<p class="muted small">Sprawdzam dostępność modeli…</p>'}</div>
      <p class="muted small">Gdy główny model zwróci limit, przeciążenie lub będzie niedostępny, odpowiedź automatycznie przejmie zapasowy – pod odpowiedzią widać, który odpowiedział.</p>
      <label class="toggle"><input type="checkbox" data-in="aiGround" ${state.settings.aiGrounding ? 'checked' : ''}> Weryfikuj odpowiedzi w Google Search (ze źródłami)</label>
      <p class="muted small">Działa tylko na <b>płatnym</b> kluczu API (z podpiętym billingiem lub kredytami z Google AI Pro). Na darmowym kluczu aplikacja sama pominie weryfikację.</p>
      <div class="row gap wrap"><button class="btn" data-a="aiClear">Wyczyść rozmowę</button><button class="btn danger" data-a="aiRemoveKey">Usuń klucz API</button></div>`;
  }
  if (S.type === 'msg') return `${head(esc(S.title))}<p>${esc(S.text)}</p><button class="btn primary" data-a="closeSheet">OK</button>`;
  return '';
}

// ====================== TIMER ======================
function timerBar() {
  if (!ui.timer) return '';
  const left = Math.max(0, Math.ceil((ui.timer.end - Date.now()) / 1000));
  return `<div class="timerbar ${left === 0 ? 'zero' : ''}"><span>Przerwa</span><b id="tleft">${fmtDur(left)}</b>
    <button class="btn sm ghost" data-a="timerAdd" data-v="15">+15 s</button><button class="btn sm" data-a="timerStop">${left ? 'Pomiń' : 'OK'}</button></div>`;
}
let audioCtx = null;
function unlockAudio() { try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { /* */ } }
function beep() {
  if (!state.settings.sound || !audioCtx) return;
  [0, 0.25, 0.5].forEach((t) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0.25, audioCtx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.2);
    o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.21);
  });
  navigator.vibrate?.([200, 100, 200]);
}
function startTimer(sec) { ui.timer = { end: Date.now() + sec * 1000, fired: false }; render(); }
setInterval(() => {
  if (ui.timer) {
    const left = Math.max(0, Math.ceil((ui.timer.end - Date.now()) / 1000));
    const el = document.getElementById('tleft');
    if (el) el.textContent = fmtDur(left);
    if (left === 0 && !ui.timer.fired) { ui.timer.fired = true; beep(); document.querySelector('.timerbar')?.classList.add('zero'); }
  }
  const e = document.getElementById('elapsed');
  if (e && state.active) e.textContent = fmtDur((Date.now() - state.active.startedAt) / 1000);
}, 1000);

let wakeLock = null;
async function keepAwake() { try { if (state.active && 'wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { keepAwake(); render(); } });

// ====================== AKCJE ======================
function startWorkout({ tplId, slotId = null, addon = null, minutes = null }) {
  if (state.active && !confirm('Masz trening w toku. Zastąpić go nowym?')) return;
  const t = tpl(tplId);
  let fit = fitTemplate(t), addonRun = null;
  if (minutes) {
    const w = buildWorkout({ kind: 'strength', tplId, addon }, minutes);
    fit = w.fit; addonRun = w.addon;
  } else if (addon) addonRun = buildRun(addon, 25);
  state.active = {
    id: uid(), tplId, tplName: t.name, tplKind: t.kind, slotId, date: today(), startedAt: Date.now(), minutes,
    dropped: fit.dropped,
    addon: addonRun ? { type: addon, run: addonRun, done: false } : null,
    items: fit.exercises.map(mkItem),
    mob: fit.mobility.map((m) => ({ ...m, done: false })),
    notes: '',
  };
  save(); ui.tab = 'workout'; ui.sheet = null; keepAwake(); render(); window.scrollTo(0, 0);
}
function mkItem(e) {
  const p = prescribe(e);
  return { exId: e.id, prio: e.prio, alts: e.alts || [], name: e.name, unit: e.unit, repMin: e.repMin, repMax: e.repMax, rest: e.rest, inc: e.inc, equip: e.equip, muscles: e.muscles, ss: e.ss, note: e.note, presc: p,
    sets: Array.from({ length: p.sets }, () => ({ w: p.w ?? '', r: '', done: false })) };
}
function findTplEx(exId) { for (const t of state.templates) { const e = t.exercises.find((x) => x.id === exId); if (e) return [t, e]; } return []; }

function openSheet(type, extra = {}, form = {}) { ui.sheet = { type, ...extra }; ui.form = form; render(); }
function closeSheet() { ui.sheet = null; ui.form = {}; render(); }

function linkSlots() {
  for (const p of state.plan) {
    if (p.status !== 'done' || p.doneRef || !p.doneKey?.startsWith('run:')) continue;
    const r = state.runs.find((x) => x.date.slice(0, 10) === p.date && isRun(x));
    if (r) { p.doneRef = r.id; if (!r.wt) r.wt = p.doneKey.slice(4); }
  }
}

async function handleFiles(files) {
  const res = { added: 0, updated: 0, skipped: 0 }, errs = [];
  for (const f of files) {
    try {
      let r;
      if (/\.csv$/i.test(f.name) || f.type === 'text/csv') r = importCSV(await f.text());
      else if (/\.zip$/i.test(f.name)) throw new Error('Rozpakuj ZIP i wybierz plik .fit');
      else r = importFIT(await f.arrayBuffer());
      res.added += r.added; res.updated += r.updated; res.skipped += r.skipped;
    } catch (e) { errs.push(`${f.name}: ${e.message}`); }
  }
  linkSlots(); save();
  openSheet('msg', { title: 'Import zakończony', text: `Dodano ${res.added}, zaktualizowano ${res.updated}, pominięto ${res.skipped}.${errs.length ? ' Błędy: ' + errs.join('; ') : ''} Tempa i sugestie zostały przeliczone.` });
}

const actions = {
  tab: (v) => { ui.tab = v; localStorage.setItem('ui-tab', v); if (v === 'more') { ui.more = null; ui.editTpl = null; } render(); window.scrollTo(0, 0); },
  weekNav: (v) => { ui.ws = v === '0' ? weekStart(today()) : addDays(ui.ws, 7 * +v); render(); },
  toggleTips: () => { ui.showAllTips = !ui.showAllTips; render(); },
  more: (v) => { ui.tab = 'more'; ui.more = v || null; ui.editTpl = null; ui.sheet = null; render(); window.scrollTo(0, 0); },
  closeSheet,
  setf: (v, el) => { ui.form[el.dataset.k] = v; render(); },

  addSlot: (d) => openSheet('slot', {}, { date: d, minutes: 60, energy: 0, time: state.settings.slotTime }),
  editSlot: (id) => { const p = state.plan.find((x) => x.id === id); openSheet('slot', { slotId: id }, { date: p.date, minutes: p.minutes, energy: p.energy || 0, time: p.time || state.settings.slotTime }); },
  saveSlot: () => {
    const F = ui.form, m = clamp(parseInt(F.minutes, 10) || 60, 10, 300);
    if (ui.sheet.slotId) { const p = state.plan.find((x) => x.id === ui.sheet.slotId); Object.assign(p, { date: F.date, minutes: m, energy: +F.energy || 0, time: F.time || null }); }
    else state.plan.push({ id: uid(), date: F.date, minutes: m, energy: +F.energy || 0, time: F.time || null, override: null, status: 'planned', created: Date.now() });
    if (F.time) state.settings.slotTime = F.time;
    save(); closeSheet();
  },
  delSlot: (id) => { state.plan = state.plan.filter((p) => p.id !== id); save(); closeSheet(); },
  changeSlot: (id) => openSheet('change', { slotId: id }),
  pickAlt: (key) => { const p = state.plan.find((x) => x.id === ui.sheet.slotId); p.override = key || null; save(); closeSheet(); },
  startSlot: (id) => {
    const p = state.plan.find((x) => x.id === id);
    const a = assignWeek(weekStart(p.date))[id];
    startWorkout({ tplId: a.cand.tplId, slotId: id, addon: a.cand.addon || null, minutes: p.minutes });
  },
  runDetails: (id) => openSheet('runDetails', { slotId: id }),
  runDone: (id) => {
    const p = state.plan.find((x) => x.id === id);
    const a = assignWeek(weekStart(p.date))[id];
    const w = buildWorkout(a.cand, p.minutes);
    openSheet('logRun', { slotId: id, key: a.cand.key }, { date: p.date, wt: a.cand.runType, time: '', dist: '', hr: '', est: w.run.estMin });
  },
  addLog: (d) => openSheet('addLog', { date: d }),
  logRunFor: (d) => openSheet('logRun', {}, { date: d, wt: 'E' }),
  saveRun: () => {
    const F = ui.form, dist = num(F.dist), t = parseTime(F.time);
    if (!dist && !t) { alert('Podaj dystans lub czas'); return; }
    const r = addManualRun({ date: F.date, distKm: dist, timeSec: t, avgHr: num(F.hr), wt: F.wt, type: F.wt === 'C' ? 'Cardio' : 'Running', slotId: ui.sheet.slotId });
    if (ui.sheet.slotId) { const p = state.plan.find((x) => x.id === ui.sheet.slotId); p.status = 'done'; p.doneRef = r.id; p.doneKey = ui.sheet.key; }
    save(); closeSheet();
  },
  slotDoneNoData: () => { const p = state.plan.find((x) => x.id === ui.sheet.slotId); p.status = 'done'; p.doneKey = ui.sheet.key; p.doneRef = null; save(); closeSheet(); },

  startTpl: (id) => startWorkout({ tplId: id }),
  setDone: (_, el) => {
    const it = state.active.items[+el.dataset.i], s = it.sets[+el.dataset.j];
    s.done = !s.done;
    if (s.done) {
      if (s.r === '' || s.r == null) s.r = it.presc?.reps ?? it.repMax;
      if ((s.w === '' || s.w == null) && it.presc?.w) s.w = it.presc.w;
      it.sets.slice(+el.dataset.j + 1).forEach((x) => { if (!x.done && (x.w === '' || x.w == null)) x.w = s.w; });
      const next = state.active.items[+el.dataset.i + 1];
      const inPair = it.ss && next && next.ss === it.ss && next.sets.filter((x) => x.done).length < it.sets.filter((x) => x.done).length;
      startTimer(inPair ? Math.min(60, it.rest) : it.rest);
    }
    save(); render();
  },
  rir: (_, el) => {
    const s = state.active.items[+el.dataset.i].sets[+el.dataset.j];
    const order = [null, 3, 2, 1, 0];
    s.rir = order[(order.indexOf(s.rir ?? null) + 1) % order.length];
    save(); render();
  },
  plates: (i) => { const it = state.active.items[+i]; const s = it.sets.find((x) => !x.done) || it.sets[0]; openSheet('plates', {}, { w: s?.w || it.presc?.w || '', bar: state.settings.barKg }); },
  platesCalc: () => { state.settings.barKg = +ui.form.bar || 20; save(); render(); },
  swapEx: (v) => {
    const name = (v || ui.form.swapName || '').trim(); if (!name) return;
    const it = state.active.items[ui.sheet.i];
    if (!it.origName) it.origName = it.name;
    const old = it.name;
    it.name = name;
    const eq = /sztang|smith/i.test(name) ? 'bb' : /hantl/i.test(name) ? 'db' : /wyciąg|bram|lin[kc]/i.test(name) ? 'cable' : /maszyn|pec deck|suwnic/i.test(name) ? 'machine' : null;
    if (eq && eq !== it.equip) { it.equip = eq; it.inc = { bb: 2.5, db: 2, cable: 2.5, machine: 5 }[eq]; }
    it.presc = prescribe({ ...it, sets: it.sets.length });
    it.sets.forEach((x) => { if (!x.done) x.w = it.presc.w ?? ''; });
    if (ui.form.persist) { const [, e] = findTplEx(it.exId); if (e) { e.alts = [...new Set([...(e.alts || []), old])].filter((x) => x !== name); e.name = name; } }
    save(); closeSheet();
  },
  report: (ws) => openSheet('report', { ws }),
  askReport: (ws) => aiSend(`Przeanalizuj mój tydzień ${fmtDate(ws)}–${fmtDate(addDays(ws, 6))}. Oceń wykonanie względem celu i podaj 3–5 konkretnych zaleceń na kolejny tydzień.`),
  calendar: () => openSheet('calendar', {}, { weeks: 2 }),
  setReminder: (v) => { state.settings.reminder = +v; save(); render(); },
  icsOpen: () => {
    const ics = buildICS(upcomingEvents(+ui.form.weeks || 2), state.settings.reminder);
    const url = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    const w = window.open(url, '_blank');
    if (!w) location.href = url;
  },
  icsShare: async () => {
    const ics = buildICS(upcomingEvents(+ui.form.weeks || 2), state.settings.reminder);
    const file = new File([ics], 'hybryda-treningi.ics', { type: 'text/calendar' });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Treningi' }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    downloadFile(ics, 'hybryda-treningi.ics', 'text/calendar');
  },
  aiSaveKey: async () => {
    const key = document.getElementById('aiKeyIn').value.trim();
    if (!key) return;
    ui.aiErr = '';
    try {
      const models = await listModels(key);
      ui.models = models;
      state.settings.aiKey = key;
      state.settings.aiModel = MODEL_CHAIN.find((id) => models.some((m) => m.id === id)) || MODEL_CHAIN[0];
      ui.aiWarn = MODEL_CHAIN.filter((id) => !models.some((m) => m.id === id)).join(', ');
      save();
    } catch (e) { ui.aiErr = 'Klucz nie działa: ' + e.message; }
    render();
  },
  aiSettings: async () => {
    openSheet('aiSettings');
    if (!ui.models) {
      try { ui.models = await listModels(state.settings.aiKey); } catch (e) { ui.models = [{ id: state.settings.aiModel, label: state.settings.aiModel + ' (błąd listy: ' + e.message + ')' }]; }
      if (ui.sheet?.type === 'aiSettings') render();
    }
  },
  aiClear: () => { if (confirm('Wyczyścić rozmowę?')) { state.chat = []; save(); closeSheet(); } },
  aiRemoveKey: () => { if (confirm('Usunąć klucz API z tego urządzenia?')) { state.settings.aiKey = ''; ui.models = null; save(); closeSheet(); } },
  actApply: (id) => { const a = findAct(id); if (a) { runAct(a); save(); render(); } },
  actReject: (id) => { const a = findAct(id); if (a) { a.status = 'rejected'; save(); render(); } },
  actApplyAll: (id) => { const m = state.chat.find((x) => (x.actions || []).some((a) => a.id === id)); (m?.actions || []).filter((a) => a.status === 'pending' && describeAct(a).ok).forEach(runAct); save(); render(); },
  aiMemory: () => openSheet('aiMemory', {}, { profile: state.memory.profile, fact: '' }),
  memSave: () => { state.memory.profile = (ui.form.profile || '').trim(); if ((ui.form.fact || '').trim()) addFact(ui.form.fact); save(); closeSheet(); },
  memAdd: () => { if ((ui.form.fact || '').trim()) { state.memory.profile = (ui.form.profile ?? state.memory.profile).trim(); addFact(ui.form.fact); ui.form.fact = ''; save(); render(); } },
  memDel: (id) => { state.memory.facts = state.memory.facts.filter((f) => f.id !== id); save(); render(); },
  aiSend: () => { const el = document.getElementById('aiIn'); aiSend(el?.value); },
  aiQuick: (i) => aiSend(QUICK[+i][1]),
  stravaConnect: () => { save(); location.href = strava.authUrl(); },
  stravaCode: async () => {
    const code = document.getElementById('stvCode').value.trim(); if (!code) return;
    try { await strava.exchangeCode(code); await runStravaSync(); } catch (e) { state.settings.strava.error = 'Nie udało się połączyć: ' + e.message; save(); render(); }
  },
  stravaSync: () => runStravaSync(),
  stravaDisconnect: () => { if (confirm('Rozłączyć Stravę? Pobrane aktywności zostaną.')) { strava.disconnect(); render(); } },
  addSet: (i) => { const it = state.active.items[+i]; const l = it.sets[it.sets.length - 1] || {}; it.sets.push({ w: l.w ?? '', r: '', done: false }); save(); render(); },
  delSet: (i) => { const it = state.active.items[+i]; if (it.sets.length > 1) it.sets.pop(); save(); render(); },
  mobDone: (j) => { const m = state.active.mob[+j]; m.done = !m.done; save(); render(); },
  addonDone: () => { state.active.addon.done = !state.active.addon.done; save(); render(); },
  addAddon: (v) => { state.active.addon = { type: v, run: buildRun(v, 25), done: false }; save(); render(); },
  addMob: () => { state.active.mob = (tpl('MOB') || state.templates.find((t) => t.mobility.length))?.mobility.map((m) => ({ ...m, done: false })) || []; save(); render(); },
  restoreDropped: () => {
    const t = tpl(state.active.tplId);
    const have = new Set(state.active.items.map((x) => x.exId));
    t.exercises.forEach((e, idx) => { if (!have.has(e.id)) state.active.items.splice(Math.min(idx, state.active.items.length), 0, mkItem(e)); });
    if (t.mobility.length) state.active.mob = t.mobility.map((m) => ({ ...m, done: state.active.mob.find((x) => x.id === m.id)?.done || false }));
    state.active.dropped = []; save(); render();
  },
  startTimer: (v) => { unlockAudio(); startTimer(+v); },
  timerAdd: (v) => { ui.timer.end += +v * 1000; ui.timer.fired = false; render(); },
  timerStop: () => { ui.timer = null; render(); },
  exMenu: (i) => { const it = state.active.items[+i]; openSheet('exMenu', { i: +i }, { repMin: it.repMin, repMax: it.repMax, rest: it.rest, persist: false }); },
  saveExMenu: () => {
    const it = state.active.items[ui.sheet.i], F = ui.form;
    it.repMin = +F.repMin || it.repMin; it.repMax = +F.repMax || it.repMax; it.rest = +F.rest || it.rest;
    if (F.persist) { const [, e] = findTplEx(it.exId); if (e) Object.assign(e, { repMin: it.repMin, repMax: it.repMax, rest: it.rest }); }
    save(); closeSheet();
  },
  exMoveActive: (_, el) => { const i = ui.sheet.i, j = i + +el.dataset.d, a = state.active.items; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; save(); closeSheet(); },
  removeActiveEx: () => { state.active.items.splice(ui.sheet.i, 1); save(); closeSheet(); },
  addExercise: () => openSheet('addExercise', {}, { name: '' }),
  addExNew: () => {
    const n = (ui.form.name || '').trim(); if (!n) return;
    state.active.items.push(mkItem({ id: uid(), name: n, sets: 3, repMin: 8, repMax: 12, unit: 'reps', rest: 75, inc: 2.5, equip: 'cable', muscles: {}, prio: 3, ss: '', note: '' }));
    save(); closeSheet();
  },
  addExFrom: (id) => { const [, e] = findTplEx(id); if (e) state.active.items.push(mkItem(e)); save(); closeSheet(); },
  finishWorkout: () => openSheet('finish', {}, { rpe: 0 }),
  cancelWorkout: () => { if (confirm('Anulować trening? Wpisane serie zostaną utracone.')) { state.active = null; ui.timer = null; save(); render(); } },
  saveWorkout: () => {
    const A = state.active;
    const s = {
      id: A.id, date: A.date, tplId: A.tplId, tplName: A.tplName, tplKind: A.tplKind, slotId: A.slotId,
      durationMin: Math.round((Date.now() - A.startedAt) / 60000), rpe: +ui.form.rpe || null, notes: A.notes, finishedAt: Date.now(),
      addon: A.addon?.done ? A.addon.type : null,
      mobDone: A.mob.filter((m) => m.done).length,
      exercises: A.items.map((it) => ({ name: it.name, equip: it.equip, unit: it.unit, muscles: it.muscles, sets: it.sets.filter((x) => x.done || +x.r > 0).map((x) => ({ w: num(x.w), r: num(x.r) || 0, ...(x.rir != null ? { rir: x.rir } : {}) })) })).filter((e) => e.sets.length),
    };
    state.sessions.push(s);
    if (A.slotId) { const p = state.plan.find((x) => x.id === A.slotId); if (p) { p.status = 'done'; p.doneRef = s.id; } }
    state.active = null; ui.timer = null;
    try { wakeLock?.release(); } catch (e) { /* */ }
    save();
    const prs = prsInSession(s);
    const vol = s.exercises.reduce((a, e) => a + e.sets.reduce((b, x) => b + (x.w || 0) * x.r, 0), 0);
    openSheet('summary', { prs, text: `${s.exercises.reduce((a, e) => a + e.sets.length, 0)} serii · ${fmtMin(s.durationMin)} · tonaż ${Math.round(vol)} kg${s.mobDone ? ' · mobilność ' + s.mobDone : ''}` });
  },

  openSession: (id) => openSheet('session', { id }),
  delSession: (id) => { if (!confirm('Usunąć ten trening?')) return; state.sessions = state.sessions.filter((s) => s.id !== id); state.plan.forEach((p) => { if (p.doneRef === id) { p.status = 'planned'; p.doneRef = null; } }); save(); closeSheet(); },
  openRun: (id) => openSheet('run', { id }),
  setRunType: (v) => { const r = state.runs.find((x) => x.id === ui.sheet.id); r.wt = v; save(); render(); },
  delRun: (id) => { if (!confirm('Usunąć aktywność?')) return; state.runs = state.runs.filter((r) => r.id !== id); state.plan.forEach((p) => { if (p.doneRef === id) { p.status = 'planned'; p.doneRef = null; } }); save(); closeSheet(); },
  import: () => document.getElementById('fileIn').click(),

  addBw: () => { const v = num(document.getElementById('bwIn').value); if (!v) return; state.bodyweight = state.bodyweight.filter((x) => x.date !== today()); state.bodyweight.push({ date: today(), kg: v }); save(); render(); },

  setGoal: (v) => { state.goal.type = v; state.goal.set = true; save(); render(); },
  setFocus: (v) => { state.goal.runFocus = v; state.goal.set = true; save(); render(); },
  deload: () => { state.settings.deloadUntil = addDays(today(), 6); save(); render(); },
  undeload: () => { state.settings.deloadUntil = null; save(); render(); },

  editTpl: (id) => { ui.editTpl = id || null; render(); window.scrollTo(0, 0); },
  newTpl: () => { const t = { id: uid(), name: 'Nowy trening', kind: 'upper', desc: '', exercises: [], mobility: [] }; state.templates.push(t); save(); ui.editTpl = t.id; render(); },
  delTpl: () => { if (state.templates.length <= 1 || !confirm('Usunąć szablon?')) return; state.templates = state.templates.filter((t) => t.id !== ui.editTpl); ui.editTpl = null; save(); render(); },
  resetTpls: async () => { if (!confirm('Przywrócić domyślny plan? Twoje zmiany w szablonach zostaną nadpisane (historia zostaje).')) return; const { defaultTemplates } = await import('./store.js'); state.templates = defaultTemplates(); save(); render(); },
  exSets: (i, el) => { const e = tpl(ui.editTpl).exercises[+i]; e.sets = clamp(e.sets + +el.dataset.d, 1, 10); save(); render(); },
  exMove: (i, el) => { const a = tpl(ui.editTpl).exercises, j = +i + +el.dataset.d; if (j < 0 || j >= a.length) return; [a[+i], a[j]] = [a[j], a[+i]]; save(); render(); },
  mobMove: (i, el) => { const a = tpl(ui.editTpl).mobility, j = +i + +el.dataset.d; if (j < 0 || j >= a.length) return; [a[+i], a[j]] = [a[j], a[+i]]; save(); render(); },
  editEx: (i) => {
    const e = i === 'new' ? { name: '', sets: 3, repMin: 8, repMax: 12, rest: 75, inc: 2.5, ss: '', equip: 'cable', unit: 'reps', prio: 2, muscles: {}, note: '' } : tpl(ui.editTpl).exercises[+i];
    openSheet('editEx', { i: i === 'new' ? 'new' : +i }, { ...e, muscles: { ...e.muscles } });
  },
  cycleMuscle: (k) => { const m = ui.form.muscles; m[k] = m[k] === 1 ? 0.5 : m[k] === 0.5 ? 0 : 1; if (!m[k]) delete m[k]; render(); },
  saveEx: () => {
    const F = ui.form, t = tpl(ui.editTpl);
    if (!F.name.trim()) { alert('Podaj nazwę'); return; }
    const data = { name: F.name.trim(), sets: clamp(+F.sets || 3, 1, 10), repMin: +F.repMin || 8, repMax: Math.max(+F.repMax || 12, +F.repMin || 8), rest: +F.rest || 60, inc: num(F.inc) ?? 2.5, ss: (F.ss || '').trim(), equip: F.equip, unit: F.unit, prio: +F.prio || 2, muscles: F.muscles, note: F.note || '' };
    if (ui.sheet.i === 'new') t.exercises.push({ id: uid(), ...data }); else Object.assign(t.exercises[ui.sheet.i], data);
    save(); closeSheet();
  },
  delEx: () => { tpl(ui.editTpl).exercises.splice(ui.sheet.i, 1); save(); closeSheet(); },
  editMob: (i) => { const m = i === 'new' ? { name: '', dose: '', sets: 1, secs: 0, note: '' } : tpl(ui.editTpl).mobility[+i]; openSheet('editMob', { i: i === 'new' ? 'new' : +i }, { ...m }); },
  saveMob: () => {
    const F = ui.form, t = tpl(ui.editTpl);
    if (!F.name.trim()) return;
    const data = { name: F.name.trim(), dose: F.dose, sets: +F.sets || 1, secs: +F.secs || 0, note: F.note };
    if (ui.sheet.i === 'new') t.mobility.push({ id: uid(), ...data }); else Object.assign(t.mobility[ui.sheet.i], data);
    save(); closeSheet();
  },
  delMob: () => { tpl(ui.editTpl).mobility.splice(ui.sheet.i, 1); save(); closeSheet(); },
  applySug: (i) => { const s = planSuggestions()[+i]; applySuggestion(s); save(); openSheet('msg', { title: 'Zastosowano', text: s.title }); },

  exportData: async () => {
    const blob = new Blob([JSON.stringify(exportable(), null, 1)], { type: 'application/json' });
    const name = `hybryda-backup-${today()}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importBackup: () => document.getElementById('backupIn').click(),
  resetAll: () => { if (confirm('Na pewno usunąć WSZYSTKIE dane? Tej operacji nie można cofnąć.')) { resetState(); render(); } },
};

// ---------- zdarzenia ----------
app.addEventListener('click', (ev) => {
  unlockAudio();
  const el = ev.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.a];
  if (fn) { ev.preventDefault(); fn(el.dataset.v, el); }
});
app.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.dataset.f !== undefined) { ui.form[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; return; }
  const k = el.dataset.in; if (!k) return;
  const A = state.active;
  if ((k === 'w' || k === 'r') && A) { A.items[+el.dataset.i].sets[+el.dataset.j][k] = el.value.replace(',', '.'); save(); return; }
  if (k === 'activeNotes' && A) { A.notes = el.value; save(); return; }
  if (k === 'hw' || k === 'hr') { const s = state.sessions.find((x) => x.id === ui.sheet.id); s.exercises[+el.dataset.i].sets[+el.dataset.j][k === 'hw' ? 'w' : 'r'] = num(el.value); save(); return; }
  if (k === 'goalTime') { state.goal.targetTime = el.value; save(); return; }
  if (k === 'goalDate') { state.goal.targetDate = el.value; save(); return; }
  if (k === 'goalNote') { state.goal.note = el.value; save(); return; }
  if (k === 'tplName') { tpl(ui.editTpl).name = el.value; save(); return; }
  if (k === 'tplDesc') { tpl(ui.editTpl).desc = el.value; save(); return; }
  if (k === 'hrMax') { state.settings.hrMax = num(el.value); state.settings.hrMaxAuto = false; save(); return; }
  if (k === 'hrRest') { state.settings.hrRest = num(el.value); save(); return; }
  if (k === 'vdot') { state.settings.vdotOverride = num(el.value); save(); return; }
  if (k === 'bodyW') { state.settings.bodyWeight = num(el.value); save(); return; }
  if (k === 'stvId' || k === 'stvSecret') { state.settings.strava[k === 'stvId' ? 'clientId' : 'clientSecret'] = el.value.trim(); save(); const b = document.querySelector('[data-a=stravaConnect]'); if (b) b.disabled = !(state.settings.strava.clientId && state.settings.strava.clientSecret); return; }
});
app.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.id === 'fileIn' && el.files.length) { await handleFiles([...el.files]); el.value = ''; return; }
  if (el.id === 'backupIn' && el.files[0]) {
    try { const data = JSON.parse(await el.files[0].text()); if (!data.templates) throw new Error('Nieprawidłowy plik'); if (confirm('Zastąpić obecne dane kopią?')) { importBackup(data); render(); } } catch (e) { alert('Błąd: ' + e.message); }
    el.value = ''; return;
  }
  const k = el.dataset.in;
  if (k === 'progEx') { ui.progEx = el.value; render(); }
  if (k === 'aiModel') { state.settings.aiModel = el.value; save(); render(); }
  if (k === 'aiGround') { state.settings.aiGrounding = el.checked; save(); }
  if (k === 'tplKind') { tpl(ui.editTpl).kind = el.value; save(); render(); }
  if (k === 'hrAuto') { state.settings.hrMaxAuto = el.checked; autoHrMax(); save(); render(); }
  if (k === 'sound') { state.settings.sound = el.checked; save(); }
  if (k === 'goalDate' || k === 'goalTime') { state.goal.set = true; save(); render(); }
});

if (/[?&]strava=ok/.test(location.search)) {
  history.replaceState(null, '', location.pathname);
  ui.tab = 'run';
  setTimeout(() => runStravaSync(), 50);
} else if (strava.connected() && Date.now() - (state.settings.strava.lastSync || 0) > 30 * 60000) {
  setTimeout(() => runStravaSync(true), 1500);
}
render();
if (state.active) keepAwake();
requestPersist();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
