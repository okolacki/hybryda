// Minimalny parser plików Garmin .FIT – wyciąga sesję, okrążenia i strefy tętna
const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z w sekundach unix

const BASE = { // baseTypeNum -> [rozmiar, odczyt, wartość niepoprawna]
  0: [1, 'u8', 0xff], 1: [1, 's8', 0x7f], 2: [1, 'u8', 0xff], 3: [2, 's16', 0x7fff], 4: [2, 'u16', 0xffff],
  5: [4, 's32', 0x7fffffff], 6: [4, 'u32', 0xffffffff], 7: [1, 'str', null], 8: [4, 'f32', null], 9: [8, 'f64', null],
  10: [1, 'u8', 0], 11: [2, 'u16', 0], 12: [4, 'u32', 0], 13: [1, 'u8', 0xff], 14: [8, 's64', null], 15: [8, 'u64', null], 16: [8, 'u64', null],
};

function readVal(dv, off, type, le) {
  switch (type) {
    case 'u8': return dv.getUint8(off);
    case 's8': return dv.getInt8(off);
    case 'u16': return dv.getUint16(off, le);
    case 's16': return dv.getInt16(off, le);
    case 'u32': return dv.getUint32(off, le);
    case 's32': return dv.getInt32(off, le);
    case 'f32': return dv.getFloat32(off, le);
    case 'f64': return dv.getFloat64(off, le);
    default: return null;
  }
}

export function parseFit(buffer) {
  const dv = new DataView(buffer);
  const hSize = dv.getUint8(0);
  const sig = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
  if (sig !== '.FIT') throw new Error('To nie jest plik FIT');
  const dataEnd = Math.min(hSize + dv.getUint32(4, true), buffer.byteLength);
  const defs = {};
  const out = { sessions: [], laps: [], records: [] };
  let off = hSize, lastTs = 0;

  while (off < dataEnd) {
    const h = dv.getUint8(off++);
    if (h & 0x80) { // skompresowany znacznik czasu
      const local = (h >> 5) & 0x3, tOff = h & 0x1f;
      lastTs = (lastTs & ~0x1f) + tOff + ((tOff < (lastTs & 0x1f)) ? 0x20 : 0);
      off = readData(local, lastTs);
      continue;
    }
    const local = h & 0x0f;
    if (h & 0x40) { // definicja
      const le = dv.getUint8(off + 1) === 0;
      const gmn = dv.getUint16(off + 2, le);
      const n = dv.getUint8(off + 4);
      off += 5;
      const fields = [];
      for (let i = 0; i < n; i++) { fields.push({ num: dv.getUint8(off), size: dv.getUint8(off + 1), base: dv.getUint8(off + 2) & 0x1f }); off += 3; }
      let devSize = 0;
      if (h & 0x20) { const nd = dv.getUint8(off++); for (let i = 0; i < nd; i++) { devSize += dv.getUint8(off + 1); off += 3; } }
      defs[local] = { le, gmn, fields, devSize };
    } else {
      off = readData(local, null);
    }
  }

  function readData(local, ts) {
    const def = defs[local];
    if (!def) throw new Error('Uszkodzony plik FIT (brak definicji)');
    const msg = {};
    for (const f of def.fields) {
      const bt = BASE[f.base];
      if (bt && f.size === bt[0] && bt[1] !== 'str' && bt[1] !== 's64' && bt[1] !== 'u64') {
        const v = readVal(dv, off, bt[1], def.le);
        if (v !== bt[2] && !(typeof v === 'number' && isNaN(v))) msg[f.num] = v;
      }
      off += f.size;
    }
    off += def.devSize;
    if (msg[253] != null) lastTs = msg[253];
    else if (ts != null) msg[253] = ts;
    if (def.gmn === 18) out.sessions.push(msg);
    else if (def.gmn === 19) out.laps.push(msg);
    else if (def.gmn === 20) out.records.push(msg);
    return off;
  }

  return summarize(out);
}

function summarize({ sessions, laps, records }) {
  const s = sessions[0] || {};
  const sport = s[5], sub = s[6];
  const startTs = s[2] ?? laps[0]?.[2] ?? records[0]?.[253];
  if (!startTs) throw new Error('Brak danych sesji w pliku FIT');
  const start = new Date((startTs + FIT_EPOCH) * 1000);
  const speed = (s[124] ?? s[14]); // m/s * 1000
  const cad = s[18] != null ? s[18] * 2 + (s[92] ? s[92] / 128 * 2 : 0) : null;
  let distM = s[9] != null ? s[9] / 100 : null;
  let timer = s[8] != null ? s[8] / 1000 : null;
  if (distM == null && records.length) distM = (records[records.length - 1][5] ?? 0) / 100;
  if (timer == null && records.length) timer = records[records.length - 1][253] - records[0][253];
  const hrs = records.map((r) => r[3]).filter((x) => x != null);
  const run = {
    date: localStamp(start),
    type: sport === 2 ? 'Cycling' : (sub === 1 ? 'Treadmill Running' : (sport === 1 || sport == null ? 'Running' : 'Other')),
    title: sport === 2 ? 'Rower (FIT)' : 'Bieg (FIT)',
    distKm: distM != null ? distM / 1000 : null,
    timeSec: timer,
    elapsedSec: s[7] != null ? s[7] / 1000 : timer,
    avgHr: s[16] ?? (hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null),
    maxHr: s[17] ?? (hrs.length ? Math.max(...hrs) : null),
    cadence: sport === 2 ? null : (cad ? Math.round(cad) : null),
    ascent: s[22] ?? null,
    te: s[24] != null ? s[24] / 10 : null,
    calories: s[11] ?? null,
    avgSpeed: speed != null ? speed / 1000 : null,
    laps: laps.map((l) => ({
      distM: l[9] != null ? l[9] / 100 : null,
      timeSec: l[8] != null ? l[8] / 1000 : (l[7] != null ? l[7] / 1000 : null),
      avgHr: l[15] ?? null,
      intensity: l[23] ?? null, // 0 aktywne, 1 odpoczynek, 2 rozgrzewka, 3 schłodzenie
    })).filter((l) => l.timeSec),
    hrSamples: sampleHr(records),
  };
  return run;
}

// Zapisujemy tylko lekką próbkę tętna (co ~10 s) do obliczania stref
function sampleHr(records) {
  const out = []; let lastT = -999;
  for (const r of records) {
    if (r[3] == null || r[253] == null) continue;
    if (r[253] - lastT >= 10) { out.push([r[253], r[3]]); lastT = r[253]; }
  }
  return out.length > 1 ? out : null;
}

function localStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
