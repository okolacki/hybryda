// Eksport zaplanowanych slotów do kalendarza (iCalendar .ics)
import { state } from './store.js';
import { today, weekStart, addDays, pad } from './util.js';
import { assignWeek, buildWorkout } from './engine.js';

const escTxt = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {
  const out = []; let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 73) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}
const stamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
function local(date, time, addMin = 0) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '18:00').split(':').map(Number);
  const t = new Date(y, m - 1, d, hh, mm + addMin);
  return `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`;
}

export function workoutText(w) {
  if (w.kind === 'run') return w.run.steps.map((s) => `• ${s.t}: ${s.d}`).join('\n');
  const lines = w.fit.exercises.map((e) => `• ${e.name}: ${e.sets}×${e.repMin}–${e.repMax}`);
  if (w.fit.mobility.length) lines.push('Mobilność: ' + w.fit.mobility.map((m) => m.name).join(', '));
  if (w.addon) lines.push(`+ ${w.addon.title}: ${w.addon.summary}`);
  return lines.join('\n');
}

// Zbiera przyszłe sloty z podanej liczby tygodni
export function upcomingEvents(weeks = 2) {
  const ev = [], t0 = today();
  for (let i = 0; i < weeks; i++) {
    const ws = addDays(weekStart(t0), 7 * i);
    const asg = assignWeek(ws);
    for (const p of state.plan) {
      const a = asg[p.id];
      if (!a || a.status !== 'planned' || p.date < t0) continue;
      const w = buildWorkout(a.cand, p.minutes);
      const icon = a.cand.kind === 'run' ? '🏃' : a.cand.cats?.mob && !a.cand.cats?.lower ? '🧘' : '🏋️';
      ev.push({
        uid: `${p.id}@hybryda`, date: p.date, time: p.time || state.settings.slotTime, minutes: p.minutes,
        title: `${icon} ${a.cand.label}${w.kind === 'run' ? ': ' + w.run.summary : ''}`,
        desc: workoutText(w),
      });
    }
  }
  return ev.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
}

export function buildICS(events, reminder = 60) {
  const now = stamp(new Date());
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hybryda//Tracker//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Hybryda – treningi'];
  for (const e of events) {
    L.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${now}`, `DTSTART:${local(e.date, e.time)}`, `DTEND:${local(e.date, e.time, e.minutes)}`,
      fold(`SUMMARY:${escTxt(e.title)}`), fold(`DESCRIPTION:${escTxt(e.desc)}`));
    if (reminder > 0) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${reminder}M`, fold(`DESCRIPTION:${escTxt(e.title)}`), 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}
