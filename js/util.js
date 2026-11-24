// Drobne narzędzia: daty, formatowanie, CSV, HTML
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const pad = (n) => String(n).padStart(2, '0');
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const round = (x, step = 0.5) => Math.round(x / step) * step;

export function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseYmd(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
export function today() { return ymd(new Date()); }
export function weekStart(s) { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }
export function weekDays(ws) { return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(ws, i)); }
export function diffDays(a, b) { return Math.round((parseYmd(a) - parseYmd(b)) / 86400000); }
export function dayIdx(s) { return (parseYmd(s).getDay() + 6) % 7; }
export function isoWeek(s) {
  const d = parseYmd(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

export const DAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
export const DAYS_FULL = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
export const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
export function fmtDate(s) { const d = parseYmd(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }
export function fmtDateLong(s) { return `${DAYS_FULL[dayIdx(s)]}, ${fmtDate(s)}`; }

export function fmtDur(sec) {
  if (sec == null || isNaN(sec)) return '–';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
export function fmtMin(min) { min = Math.round(min); return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? (min % 60) + ' min' : ''}`.trim() : `${min} min`; }
export function fmtPace(spk) { if (!spk || !isFinite(spk)) return '–'; spk = Math.round(spk); return `${Math.floor(spk / 60)}:${pad(spk % 60)}`; }
export function fmtKg(w) { if (w == null || w === '') return '–'; return (Math.round(w * 100) / 100).toString().replace('.', ','); }
export function fmtNum(x, d = 1) { if (x == null || isNaN(x)) return '–'; return x.toFixed(d).replace('.', ','); }

export function parseTime(str) {
  if (str == null) return null;
  str = String(str).trim();
  if (!str || str === '--') return null;
  const parts = str.split(':').map((p) => parseFloat(p.replace(',', '.')));
  if (parts.some(isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}
export function num(str) {
  if (str == null) return null;
  let s = String(str).trim().replace(/^'/, '');
  if (!s || s === '--') return null;
  // "1,561" (tysiące) vs "10,5" (polski przecinek dziesiętny)
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field); if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const normKey = (name) => String(name).toLowerCase().replace(/\s+/g, ' ').trim();
