import type { Diagram, Punkt } from './types';

/** Lodrette (x) og vandrette (y) linjer, som magneten kan trække punkter hen til. */
export interface MagnetLinjer {
  x: number[];
  y: number[];
}

/**
 * Linjer gennem alle punkter og knæk i diagrammet.
 * udelukX/udelukY: punkter der selv flyttes i x/y og derfor ikke må trække i sig selv.
 */
export function magnetLinjer(
  d: Diagram,
  udelukX: Set<string> = new Set(),
  udelukY: Set<string> = new Set(),
  ekstra: Punkt[] = [],
): MagnetLinjer {
  const x = new Set<number>();
  const y = new Set<number>();
  for (const k of d.knuder) {
    if (!udelukX.has(k.id)) x.add(k.x);
    if (!udelukY.has(k.id)) y.add(k.y);
  }
  for (const s of d.straekninger) {
    // Knæk på rør til et punkt der flyttes, kan selv flytte sig – spring dem over
    if ([s.fra, s.til].some((id) => udelukX.has(id) || udelukY.has(id))) continue;
    for (const p of s.knaek ?? []) {
      x.add(p.x);
      y.add(p.y);
    }
  }
  for (const p of ekstra) {
    x.add(p.x);
    y.add(p.y);
  }
  return { x: [...x], y: [...y] };
}

/** Nærmeste værdi inden for tolerancen, ellers null. */
function naermeste(v: number, liste: number[], tol: number): number | null {
  let bedst: number | null = null;
  for (const c of liste) if (Math.abs(c - v) <= tol && (bedst === null || Math.abs(c - v) < Math.abs(bedst - v))) bedst = c;
  return bedst;
}

/**
 * Magnet: forskyd en gruppe punkter, der flyttes med (dx, dy), så den nærmeste af dem
 * flugter med en eksisterende linje. gx/gy er hjælpelinjerne der skal vises (eller null).
 */
export function magnetForskydning(
  flyttes: Punkt[],
  dx: number,
  dy: number,
  linjer: MagnetLinjer,
  tol: number,
): { dx: number; dy: number; gx: number | null; gy: number | null } {
  let bx: { ret: number; linje: number } | null = null;
  let by: { ret: number; linje: number } | null = null;
  for (const p of flyttes) {
    const nx = naermeste(p.x + dx, linjer.x, tol);
    if (nx !== null && (!bx || Math.abs(nx - p.x - dx) < Math.abs(bx.ret))) bx = { ret: nx - p.x - dx, linje: nx };
    const ny = naermeste(p.y + dy, linjer.y, tol);
    if (ny !== null && (!by || Math.abs(ny - p.y - dy) < Math.abs(by.ret))) by = { ret: ny - p.y - dy, linje: ny };
  }
  return {
    dx: dx + (bx?.ret ?? 0),
    dy: dy + (by?.ret ?? 0),
    gx: bx?.linje ?? null,
    gy: by?.linje ?? null,
  };
}

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
