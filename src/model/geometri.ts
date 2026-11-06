import type { Punkt } from './types';

export const GITTER = 10;

export const snap = (v: number) => Math.round(v / GITTER) * GITTER;
export const snapPunkt = (p: Punkt): Punkt => ({ x: snap(p.x), y: snap(p.y) });

/** Lås punktet vandret eller lodret i forhold til fra-punktet. */
export function ortogonal(fra: Punkt, til: Punkt): Punkt {
  return Math.abs(til.x - fra.x) >= Math.abs(til.y - fra.y)
    ? { x: til.x, y: fra.y }
    : { x: fra.x, y: til.y };
}

/** Nærmeste punkt på linjestykket a–b. */
export function projicer(p: Punkt, a: Punkt, b: Punkt) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const punkt = { x: a.x + t * dx, y: a.y + t * dy };
  return { afstand: Math.hypot(p.x - punkt.x, p.y - punkt.y), punkt, t };
}

export const fmt = (v: number, decimaler = 2) => v.toFixed(decimaler).replace('.', ',');
export const fmtKote = (k: number) => (k >= 0 ? '+' : '') + fmt(k);

/** Læs tal med dansk komma. Tom streng → null. */
export function tilTal(v: string): number | null {
  if (v.trim() === '') return null;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
