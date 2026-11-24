// Lekkie wykresy SVG
import { esc } from './util.js';

export function bars(data, { h = 140, color = 'var(--run)', fmt = (v) => Math.round(v), highlightLast = true, stack } = {}) {
  if (!data.length) return '<div class="empty">Brak danych</div>';
  const W = 340, pad = 18, bw = (W - pad) / data.length;
  const max = Math.max(1, ...data.map((d) => (stack ? d.values.reduce((a, b) => a + b, 0) : d.v)));
  let out = `<svg viewBox="0 0 ${W} ${h + 34}" class="chart" role="img">`;
  for (let i = 0; i < 3; i++) {
    const y = 8 + (h * i) / 2;
    out += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" class="grid"/>`;
    out += `<text x="0" y="${y + 3}" class="axis">${fmt(max * (1 - i / 2))}</text>`;
  }
  data.forEach((d, i) => {
    const x = pad + i * bw + bw * 0.15, w = bw * 0.7;
    if (stack) {
      let y = 8 + h;
      d.values.forEach((v, k) => {
        const bh = (v / max) * h; y -= bh;
        if (bh > 0) out += `<rect x="${x}" y="${y}" width="${w}" height="${bh}" rx="2" fill="${stack[k]}"/>`;
      });
    } else {
      const bh = (d.v / max) * h;
      const last = highlightLast && i === data.length - 1;
      out += `<rect x="${x}" y="${8 + h - bh}" width="${w}" height="${Math.max(bh, d.v ? 2 : 0)}" rx="3" fill="${color}" opacity="${last ? 1 : 0.7}"/>`;
      if (d.v && data.length <= 14) out += `<text x="${x + w / 2}" y="${8 + h - bh - 4}" class="val" text-anchor="middle">${fmt(d.v)}</text>`;
    }
    if (data.length <= 14 || i % 2 === 0) out += `<text x="${x + w / 2}" y="${h + 24}" class="axis" text-anchor="middle">${esc(d.label)}</text>`;
  });
  return out + '</svg>';
}

export function line(points, { h = 150, color = 'var(--accent)', fmt = (v) => v.toFixed(0), trend = true } = {}) {
  if (points.length < 2) return '<div class="empty">Za mało danych do wykresu (min. 2 pomiary)</div>';
  const W = 340, padL = 30, padR = 8;
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (max - min < 1e-6) { max += 1; min -= 1; }
  const span = max - min; min -= span * 0.1; max += span * 0.1;
  const X = (i) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const Y = (v) => 8 + h - ((v - min) / (max - min)) * h;
  let out = `<svg viewBox="0 0 ${W} ${h + 34}" class="chart" role="img">`;
  for (let i = 0; i < 3; i++) {
    const v = max - ((max - min) * i) / 2, y = Y(v);
    out += `<line x1="${padL}" x2="${W}" y1="${y}" y2="${y}" class="grid"/><text x="0" y="${y + 3}" class="axis">${fmt(v)}</text>`;
  }
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  out += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`;
  if (trend && points.length >= 4) {
    const n = points.length, mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0; ys.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; });
    const b = num / den, a = my - b * mx;
    out += `<line x1="${X(0)}" y1="${Y(a)}" x2="${X(n - 1)}" y2="${Y(a + b * (n - 1))}" stroke="${color}" stroke-dasharray="4 4" opacity=".5"/>`;
  }
  points.forEach((p, i) => { out += `<circle cx="${X(i)}" cy="${Y(p.y)}" r="${points.length > 20 ? 2 : 3.2}" fill="${color}"><title>${esc(p.label)}: ${fmt(p.y)}</title></circle>`; });
  out += `<text x="${padL}" y="${h + 26}" class="axis">${esc(points[0].label)}</text><text x="${W - padR}" y="${h + 26}" class="axis" text-anchor="end">${esc(points[points.length - 1].label)}</text>`;
  return out + '</svg>';
}
