import './_setup.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { state, resetState } from '../js/store.js';
import { num, parseTime, parseCSV, today, addDays, uid } from '../js/util.js';
import { vdotFrom, predict, paces, classify, importCSV, mergeRuns } from '../js/running.js';
import { parseFit } from '../js/fit.js';
import { prescribe, fitTemplate, assignWeek, weekStart, warmups, plates } from './_engine.mjs';
import { buildICS } from '../js/ics.js';
import { md } from '../js/ai.js';
import { describe as describeAct, apply as applyAct } from '../js/actions.js';

beforeEach(() => resetState());

const session = (date, exercises, extra = {}) => ({ id: uid(), date, tplId: 'UA', tplName: 'Upper A', tplKind: 'upper', exercises, finishedAt: Date.parse(date), ...extra });
const ex = { id: 'x', name: 'Test press', sets: 3, repMin: 6, repMax: 8, inc: 2, equip: 'db', unit: 'reps', prio: 1 };

// ---------- util ----------
test('liczby i czasy z eksportu Garmina', () => {
  assert.equal(num('1,561'), 1561);
  assert.equal(num('10,5'), 10.5);
  assert.equal(num('--'), null);
  assert.equal(num("'-3"), -3);
  assert.equal(parseTime('01:29:24'), 5364);
  assert.equal(parseTime('48:32'), 2912);
  assert.deepEqual(parseCSV('a,b\n"x, y","1,561"\n'), [['a', 'b'], ['x, y', '1,561']]);
});

// ---------- bieganie ----------
test('VDOT zgodny z tabelami Danielsa', () => {
  assert.ok(Math.abs(vdotFrom(5000, 20 * 60) - 49.8) < 0.4, 'VDOT dla 5 km w 20:00 ≈ 49,8');
  assert.ok(Math.abs(predict(50, 10000) - 2481) < 20, 'prognoza 10 km dla VDOT 50 ≈ 41:21');
  assert.ok(Math.abs(paces(50).T - 255) < 5, 'tempo T dla VDOT 50 ≈ 4:15/km');
  assert.ok(paces(50).E[0] > paces(50).M && paces(50).M > paces(50).T && paces(50).T > paces(50).I && paces(50).I > paces(50).R);
});

test('klasyfikacja biegów po tytule, tętnie i dystansie', () => {
  state.settings.hrMax = 196;
  const r = (o) => ({ type: 'Running', distKm: 8, timeSec: 2400, avgHr: 140, ...o });
  assert.equal(classify(r({ title: 'Warsaw - 8x400' })), 'R');
  assert.equal(classify(r({ title: 'Warsaw - 5x1 3:45-3:50' })), 'I');
  assert.equal(classify(r({ title: 'Bieg', distKm: 21 })), 'L');
  assert.equal(classify(r({ title: 'Bieg', avgHr: 172 })), 'T');
  assert.equal(classify(r({ title: 'Bieg', avgHr: 158 })), 'S');
  assert.equal(classify(r({ title: 'Bieg', avgHr: 140 })), 'E');
  assert.equal(classify(r({ title: 'Rower', type: 'Cycling' })), 'C');
});

test('import CSV + Strava łączy duplikaty i respektuje priorytet źródeł', () => {
  const csv = 'Activity Type,Date,Title,Distance,Time,Avg HR,Max HR\nRunning,2026-11-19 11:22:37,"Warsaw Running","10.01","00:48:32","142","157"\n';
  assert.equal(importCSV(csv).added, 1);
  const res = mergeRuns([{ date: '2026-11-19 11:22:37', type: 'Running', title: 'Strava', distKm: 10.0, timeSec: 2879, stravaId: 1 }], 'strava');
  assert.equal(res.updated, 1);
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].source, 'strava');
  assert.equal(importCSV(csv).skipped, 1, 'CSV nie nadpisuje danych ze Stravy');
  assert.equal(state.settings.hrMax, 157, 'HRmax ustawiany automatycznie z najwyższego tętna');
});

test('parser FIT czyta sesję, okrążenia i tętno', () => {
  const run = parseFit(makeFit());
  assert.equal(run.type, 'Running');
  assert.equal(run.distKm, 10);
  assert.equal(run.timeSec, 2400);
  assert.equal(run.avgHr, 152);
  assert.equal(run.cadence, 168);
  assert.equal(run.laps.length, 13);
  assert.ok(run.hrSamples.length > 200);
  assert.equal(classify({ ...run, title: 'Bieg (FIT)' }), 'I', 'okrążenia aktywne/odpoczynek = interwały');
});

// ---------- progresja siłowa ----------
test('podwójna progresja: górny zakres → +skok', () => {
  state.sessions.push(session(addDays(today(), -3), [{ name: 'Test press', equip: 'db', sets: [{ w: 30, r: 8 }, { w: 30, r: 8 }, { w: 30, r: 8 }] }]));
  assert.equal(prescribe(ex).w, 32);
});
test('duży zapas RIR przy górnym zakresie → podwójny skok', () => {
  state.sessions.push(session(addDays(today(), -3), [{ name: 'Test press', equip: 'db', sets: [{ w: 30, r: 8, rir: 3 }, { w: 30, r: 8, rir: 4 }, { w: 30, r: 8, rir: 3 }] }]));
  assert.equal(prescribe(ex).w, 34);
});
test('w zakresie z RIR ≥ 3 → +skok mimo niepełnego zakresu', () => {
  state.sessions.push(session(addDays(today(), -3), [{ name: 'Test press', equip: 'db', sets: [{ w: 30, r: 7, rir: 3 }, { w: 30, r: 6, rir: 3 }, { w: 30, r: 6, rir: 3 }] }]));
  assert.equal(prescribe(ex).w, 32);
});
test('w zakresie bez zapasu → ten sam ciężar, +1 powtórzenie', () => {
  state.sessions.push(session(addDays(today(), -3), [{ name: 'Test press', equip: 'db', sets: [{ w: 30, r: 7 }, { w: 30, r: 6 }, { w: 30, r: 6 }] }]));
  const p = prescribe(ex);
  assert.equal(p.w, 30);
  assert.equal(p.reps, 7);
});
test('dwie sesje poniżej zakresu → ciężar −8%', () => {
  state.sessions.push(session(addDays(today(), -7), [{ name: 'Test press', equip: 'db', sets: [{ w: 30, r: 5 }] }]));
  state.sessions.push(session(addDays(today(), -3), [{ name: 'Test press', equip: 'db', sets: [{ w: 30, r: 4 }] }]));
  assert.equal(prescribe(ex).w, 28);
});
test('deload: −1 seria i ~90% ciężaru', () => {
  state.settings.deloadUntil = addDays(today(), 3);
  state.sessions.push(session(addDays(today(), -3), [{ name: 'Test press', equip: 'db', sets: [{ w: 30, r: 8 }, { w: 30, r: 8 }, { w: 30, r: 8 }] }]));
  const p = prescribe(ex);
  assert.equal(p.sets, 2);
  assert.equal(p.w, 27);
});
test('rozgrzewka i talerze', () => {
  assert.equal(warmups({ presc: { w: 32 }, unit: 'reps', equip: 'db', prio: 1, inc: 2 }), '16 × 8 · 22 × 4 · 28 × 2');
  assert.equal(warmups({ presc: { w: 32 }, unit: 'reps', equip: 'db', prio: 2, inc: 2 }), null, 'tylko ćwiczenia kluczowe');
  assert.deepEqual(plates(62.5, 20), { plates: [20, 1.25], rest: 0 });
  assert.equal(plates(15, 20), null);
});

// ---------- dobór treningu ----------
test('skracanie szablonu: najpierw wypadają ćwiczenia opcjonalne', () => {
  const ua = state.templates.find((t) => t.id === 'UA');
  const full = fitTemplate(ua);
  const short = fitTemplate(ua, 45);
  assert.ok(full.full > 45);
  assert.ok(short.dropped.includes('Wiszące unoszenie nóg do drążka'));
  assert.ok(short.exercises.every((e) => e.prio !== 3));
  assert.ok(short.exercises.some((e) => e.prio === 1));
});

const slot = (o) => ({ id: uid(), date: today(), minutes: 60, energy: 0, override: null, status: 'planned', created: 1, ...o });
const pick = (s) => { state.plan.push(s); return assignWeek(weekStart(s.date))[s.id].cand; };

test('po ciężkim biegu wczoraj nie ma dziś kolejnego akcentu', () => {
  state.runs.push({ id: uid(), date: addDays(today(), -1) + ' 08:00:00', type: 'Running', title: 'x', distKm: 9, timeSec: 2700, wt: 'I' });
  const c = pick(slot({ minutes: 60 }));
  assert.ok(!['I', 'T', 'R', 'L'].includes(c.runType), `wybrano ${c.label}`);
});
test('po górze wczoraj dziś nie ma znowu góry', () => {
  state.sessions.push(session(addDays(today(), -1), []));
  const c = pick(slot({ minutes: 75 }));
  assert.ok(!c.upper, `wybrano ${c.label}`);
});
test('słabe samopoczucie → brak akcentów i nóg', () => {
  const c = pick(slot({ minutes: 60, energy: 1 }));
  assert.ok(!c.hard && !c.hardish && !c.legs, `wybrano ${c.label}`);
});
test('cel biegowy na pustym tygodniu → jednostka jakościowa', () => {
  state.goal.type = 'run';
  const c = pick(slot({ minutes: 60 }));
  assert.equal(Object.keys(c.cats)[0], 'runQ', `wybrano ${c.label}`);
});
test('ręczny wybór w slocie ma pierwszeństwo', () => {
  const c = pick(slot({ minutes: 60, override: 'run:E' }));
  assert.equal(c.key, 'run:E');
});

// ---------- kalendarz, AI ----------
test('plik .ics jest poprawny (CRLF, zawijanie ≤ 75 bajtów, escaping)', () => {
  const ics = buildICS([{ uid: 'a@h', date: '2026-12-01', time: '07:00', minutes: 60, title: 'Bieg, interwały; test', desc: '• ' + 'Wyciskanie hantli na skosie dodatnim: 3×6–8\n'.repeat(5) }], 60);
  const lines = ics.split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.ok(lines.every((l) => new TextEncoder().encode(l).length <= 75));
  assert.ok(ics.includes('DTSTART:20261201T070000') && ics.includes('DTEND:20261201T080000'));
  assert.ok(ics.includes('SUMMARY:Bieg\\, interwały\\; test'));
  assert.ok(ics.includes('TRIGGER:-PT60M'));
  assert.ok(!/[^\r]\n/.test(ics), 'tylko CRLF');
});
test('Markdown z odpowiedzi AI nie przepuszcza HTML', () => {
  const html = md('<img src=x onerror=alert(1)> **ważne**\n- punkt\n| a | b |\n|---|---|\n| 1 | 2 |');
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('<b>ważne</b>') && html.includes('<li>punkt</li>') && html.includes('<td>1</td>'));
});

// ---------- akcje asystenta ----------
test('akcja: zmiana serii ćwiczenia po nazwie i ID szablonu', () => {
  const a = { name: 'update_exercise', args: { template: 'UA', exercise: 'Wyciskanie hantli na skosie dodatnim (30°)', sets: 4 } };
  assert.ok(describeAct(a).ok);
  applyAct(a);
  assert.equal(state.templates[0].exercises[0].sets, 4);
});
test('akcja: dopasowanie nazwy ćwiczenia bez nawiasu', () => {
  const a = { name: 'update_exercise', args: { template: 'Upper B', exercise: 'Dipsy na poręczach', rep_min: 8, rep_max: 10 } };
  applyAct(a);
  const e = state.templates.find((t) => t.id === 'UB').exercises[0];
  assert.deepEqual([e.repMin, e.repMax], [8, 10]);
});
test('akcja: nieznane ćwiczenie i data z przeszłości są odrzucane', () => {
  assert.equal(describeAct({ name: 'update_exercise', args: { template: 'UA', exercise: 'Przysiad ze sztangą', sets: 4 } }).ok, false);
  assert.throws(() => applyAct({ name: 'plan_session', args: { date: addDays(today(), -1), minutes: 60 } }));
  assert.equal(describeAct({ name: 'plan_session', args: { date: today(), minutes: 60, workout: 'run:XYZ' } }).ok, false);
});
test('akcja: slot z wybranym treningiem i godziną', () => {
  applyAct({ name: 'plan_session', args: { date: addDays(today(), 1), minutes: 60, time: '7:00', workout: 'run:I' } });
  assert.equal(state.plan.length, 1);
  assert.equal(state.plan[0].override, 'run:I');
  assert.equal(state.plan[0].time, '07:00');
});
test('akcja: pamięć bez duplikatów, cel, deload', () => {
  applyAct({ name: 'remember', args: { fact: 'Biega tylko rano.' } });
  applyAct({ name: 'remember', args: { fact: 'biega tylko  rano.' } });
  assert.equal(state.memory.facts.length, 1);
  applyAct({ name: 'set_goal', args: { run_focus: 'hm', target_time: '1:35:00' } });
  assert.equal(state.goal.runFocus, 'hm');
  applyAct({ name: 'set_deload', args: { active: true } });
  assert.ok(state.settings.deloadUntil >= today());
});

// ---------- syntetyczny plik FIT ----------
function makeFit() {
  const parts = [];
  const u8 = (v) => Buffer.from([v]);
  const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
  const def = (local, gmn, fields) => parts.push(Buffer.concat([u8(0x40 | local), u8(0), u8(0), u16(gmn), u8(fields.length), ...fields.map(([n, s, t]) => Buffer.from([n, s, t]))]));
  const T0 = Math.floor(Date.UTC(2026, 10, 22, 7, 0, 0) / 1000) - 631065600;
  def(0, 20, [[253, 4, 0x86], [3, 1, 2], [5, 4, 0x86], [6, 2, 0x84]]);
  for (let i = 0; i <= 2400; i += 5) { const hr = i < 600 ? 130 : (Math.floor(i / 240) % 2 ? 175 : 140); parts.push(Buffer.concat([u8(0), u32(T0 + i), u8(hr), u32(i * 330), u16(3300)])); }
  def(1, 19, [[2, 4, 0x86], [8, 4, 0x86], [9, 4, 0x86], [15, 1, 2], [23, 1, 0]]);
  parts.push(Buffer.concat([u8(1), u32(T0), u32(600000), u32(200000), u8(130), u8(2)]));
  for (let k = 0; k < 6; k++) {
    parts.push(Buffer.concat([u8(1), u32(T0 + 600 + k * 480), u32(240000), u32(100000), u8(175), u8(0)]));
    parts.push(Buffer.concat([u8(1), u32(T0 + 840 + k * 480), u32(240000), u32(60000), u8(140), u8(1)]));
  }
  def(2, 18, [[2, 4, 0x86], [5, 1, 0], [6, 1, 0], [7, 4, 0x86], [8, 4, 0x86], [9, 4, 0x86], [16, 1, 2], [17, 1, 2], [18, 1, 2], [22, 2, 0x84], [24, 1, 2]]);
  parts.push(Buffer.concat([u8(2), u32(T0), u8(1), u8(0), u32(2400000), u32(2400000), u32(1000000), u8(152), u8(181), u8(84), u16(20), u8(38)]));
  const data = Buffer.concat(parts);
  const h = Buffer.alloc(14); h[0] = 14; h[1] = 0x20; h.writeUInt16LE(2100, 2); h.writeUInt32LE(data.length, 4); h.write('.FIT', 8);
  const buf = Buffer.concat([h, data, Buffer.alloc(2)]);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
