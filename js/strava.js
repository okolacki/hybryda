// Strava: OAuth (własna aplikacja API użytkownika) + synchronizacja aktywności
import { state, save } from './store.js';
import { mergeRuns, isRun } from './running.js';

const API = 'https://www.strava.com/api/v3';
export const redirectUri = () => new URL('strava.html', location.href).href;
export const connected = () => !!state.settings.strava.refresh;

export function authUrl() {
  const s = state.settings.strava;
  const q = new URLSearchParams({ client_id: s.clientId, response_type: 'code', redirect_uri: redirectUri(), approval_prompt: 'auto', scope: 'activity:read_all' });
  return `https://www.strava.com/oauth/authorize?${q}`;
}

async function tokenRequest(params) {
  const s = state.settings.strava;
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: s.clientId, client_secret: s.clientSecret, ...params }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.message ? `${j.message}${j.errors ? ': ' + j.errors.map((e) => e.field + ' ' + e.code).join(', ') : ''}` : `HTTP ${res.status}`);
  s.access = j.access_token; s.refresh = j.refresh_token; s.expires = j.expires_at;
  if (j.athlete) s.athlete = [j.athlete.firstname, j.athlete.lastname].filter(Boolean).join(' ');
  s.error = '';
  save();
}
export const exchangeCode = (code) => tokenRequest({ code: code.trim(), grant_type: 'authorization_code' });

async function token() {
  const s = state.settings.strava;
  if (!s.refresh) throw new Error('Strava niepołączona');
  if (!s.access || s.expires - 120 < Date.now() / 1000) await tokenRequest({ refresh_token: s.refresh, grant_type: 'refresh_token' });
  return s.access;
}
async function get(path) {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${await token()}` } });
  if (res.status === 429) throw new Error('Limit zapytań Strava – spróbuj za 15 min');
  if (!res.ok) throw new Error(`Strava: HTTP ${res.status}`);
  return res.json();
}

function mapType(a) {
  const t = a.sport_type || a.type || '';
  if (t === 'VirtualRun' || (/Run/.test(t) && a.trainer)) return 'Treadmill Running';
  if (/Run/.test(t)) return 'Running';
  if (/Ride/.test(t)) return 'Cycling';
  return null;
}
function mapActivity(a) {
  const type = mapType(a);
  if (!type) return null;
  const run = !/Cycl/.test(type);
  return {
    stravaId: a.id, date: (a.start_date_local || '').replace('T', ' ').replace('Z', '').slice(0, 19), type, title: a.name,
    distKm: a.distance ? a.distance / 1000 : null, timeSec: a.moving_time || null, elapsedSec: a.elapsed_time || null,
    avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : null, maxHr: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    cadence: run && a.average_cadence ? Math.round(a.average_cadence * 2) : null, ascent: a.total_elevation_gain ?? null,
    te: null, calories: a.calories ?? null, laps: null, hrSamples: null,
  };
}

async function details(run) {
  try {
    const laps = await get(`/activities/${run.stravaId}/laps`);
    if (Array.isArray(laps) && laps.length > 1) run.laps = laps.map((l) => ({ distM: l.distance, timeSec: l.moving_time, avgHr: l.average_heartrate ? Math.round(l.average_heartrate) : null, intensity: null }));
    const st = await get(`/activities/${run.stravaId}/streams?keys=time,heartrate&key_by_type=true`);
    if (st.heartrate?.data && st.time?.data) {
      const out = []; let last = -999;
      st.time.data.forEach((t, i) => { if (t - last >= 10) { out.push([t, st.heartrate.data[i]]); last = t; } });
      if (out.length > 1) run.hrSamples = out;
    }
  } catch (e) { /* szczegóły są opcjonalne */ }
}

export async function sync({ days = 120, onProgress } = {}) {
  const s = state.settings.strava;
  const after = s.lastSync ? Math.floor(s.lastSync / 1000) - 3 * 86400 : Math.floor(Date.now() / 1000) - days * 86400;
  const list = [];
  for (let page = 1; page <= 5; page++) {
    onProgress?.(`Pobieram aktywności (strona ${page})…`);
    const batch = await get(`/athlete/activities?after=${after}&per_page=100&page=${page}`);
    list.push(...batch);
    if (batch.length < 100) break;
  }
  const mapped = list.map(mapActivity).filter(Boolean);
  const known = new Set(state.runs.filter((r) => r.stravaId).map((r) => r.stravaId));
  const fresh = mapped.filter((r) => !known.has(r.stravaId) && !/Cycl/.test(r.type)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  let i = 0;
  for (const r of fresh) { onProgress?.(`Okrążenia i tętno ${++i}/${fresh.length}…`); await details(r); }
  const res = mergeRuns(mapped, 'strava');
  s.lastSync = Date.now(); s.error = '';
  save();
  return { ...res, fetched: mapped.length };
}

export function disconnect() {
  const s = state.settings.strava;
  Object.assign(s, { refresh: '', access: '', expires: 0, athlete: '', lastSync: 0, error: '' });
  save();
}
export { isRun };
