// Rene funktioner der ændrer et diagram (kaldes på en kopi via store.aendr).
import type { Diagram, Knude, KnudeType, Punkt, Straekning } from './types';
import { projicer, snap } from './geometri';
import { naesteNavn, nyId } from './standard';

const ens = (a: Punkt, b: Punkt) => a.x === b.x && a.y === b.y;

export function findKnude(d: Diagram, pt: Punkt, radius: number): Knude | undefined {
  let bedst: Knude | undefined;
  let bedstAfstand = radius;
  for (const k of d.knuder) {
    const a = Math.hypot(k.x - pt.x, k.y - pt.y);
    if (a <= bedstAfstand) {
      bedst = k;
      bedstAfstand = a;
    }
  }
  return bedst;
}

/** Alle hjørnepunkter i strækningen: fra-punkt, knæk, til-punkt */
export function straekningPunkter(d: Diagram, s: Straekning): Punkt[] | null {
  const a = d.knuder.find((k) => k.id === s.fra);
  const b = d.knuder.find((k) => k.id === s.til);
  if (!a || !b) return null;
  return [a, ...(s.knaek ?? []), b];
}

/** Nærmeste delstykke af en strækning */
function naermesteSegment(pts: Punkt[], pt: Punkt) {
  let seg = 0;
  let bedst = Infinity;
  let punkt = pts[0];
  for (let i = 0; i < pts.length - 1; i++) {
    const pr = projicer(pt, pts[i], pts[i + 1]);
    if (pr.afstand < bedst) {
      bedst = pr.afstand;
      seg = i;
      punkt = pr.punkt;
    }
  }
  return { seg, afstand: bedst, punkt };
}

export function findStraekning(d: Diagram, pt: Punkt, radius: number): { s: Straekning; punkt: Punkt } | undefined {
  let bedst: { s: Straekning; punkt: Punkt } | undefined;
  let bedstAfstand = radius;
  for (const s of d.straekninger) {
    const pts = straekningPunkter(d, s);
    if (!pts) continue;
    const n = naermesteSegment(pts, pt);
    if (n.afstand <= bedstAfstand) {
      bedst = { s, punkt: n.punkt };
      bedstAfstand = n.afstand;
    }
  }
  return bedst;
}

function nyKnude(d: Diagram, pt: Punkt, kote: number, type: KnudeType): Knude {
  const k: Knude = { id: nyId(), navn: naesteNavn(d), x: pt.x, y: pt.y, type, kote, qf: 0 };
  d.knuder.push(k);
  return k;
}

/** Del en strækning i to ved punktet (til afgreninger). Returnerer id på det nye punkt. */
export function delStraekning(d: Diagram, s: Straekning, pt: Punkt): string {
  const a = d.knuder.find((k) => k.id === s.fra)!;
  const b = d.knuder.find((k) => k.id === s.til)!;
  const pts = [a, ...(s.knaek ?? []), b];
  const { seg } = naermesteSegment(pts, pt);
  const p = pts[seg];
  const q = pts[seg + 1];
  let punkt = { x: snap(pt.x), y: snap(pt.y) };
  if (p.y === q.y) punkt = { x: snap(pt.x), y: p.y };
  else if (p.x === q.x) punkt = { x: p.x, y: snap(pt.y) };
  if (ens(punkt, a)) return a.id;
  if (ens(punkt, b)) return b.id;

  // Kote interpoleres efter tegnet længde langs strækningen
  const l = (u: Punkt, v: Punkt) => Math.hypot(v.x - u.x, v.y - u.y);
  let total = 0;
  let foer = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    if (i < seg) foer += l(pts[i], pts[i + 1]);
    total += l(pts[i], pts[i + 1]);
  }
  foer += l(p, punkt);
  const t = total > 0 ? foer / total : 0.5;
  const kote = Math.round((a.kote + (b.kote - a.kote) * t) * 100) / 100;

  const k = nyKnude(d, punkt, kote, 'punkt');
  const knaek = s.knaek ?? [];
  d.straekninger = d.straekninger.filter((x) => x.id !== s.id);
  // Længderne nulstilles – de skal indtastes for de to nye delstrækninger
  d.straekninger.push(
    { ...s, id: nyId(), til: k.id, laengde: null, knaek: knaek.slice(0, seg).filter((x) => !ens(x, punkt)) },
    { ...s, id: nyId(), fra: k.id, laengde: null, knaek: knaek.slice(seg).filter((x) => !ens(x, punkt)) },
  );
  return k.id;
}

/**
 * Brug eksisterende punkt, del et rør, eller opret nyt punkt.
 * ny=true kun for punkt i frit rum. Første punkt i et tomt diagram bliver forsyning.
 */
export function findEllerOpretKnude(d: Diagram, pt: Punkt, radius: number, kote: number): { id: string; ny: boolean } {
  const k = findKnude(d, pt, radius);
  if (k) return { id: k.id, ny: false };
  const hit = findStraekning(d, pt, radius);
  if (hit) return { id: delStraekning(d, hit.s, pt), ny: false };
  const type: KnudeType = d.knuder.some((x) => x.type === 'forsyning') ? 'punkt' : 'forsyning';
  return { id: nyKnude(d, pt, kote, type).id, ny: true };
}

export function tilfoejStraekning(d: Diagram, fra: string, til: string, knaek: Punkt[] = []): string | null {
  if (fra === til) return null;
  const findes = d.straekninger.some(
    (s) => (s.fra === fra && s.til === til) || (s.fra === til && s.til === fra),
  );
  if (findes) return null;
  const s: Straekning = { id: nyId(), fra, til, laengde: null, knaek: knaek.map((p) => ({ ...p })) };
  d.straekninger.push(s);
  return s.id;
}

/** Antal strækninger der går til punktet */
export function antalForbindelser(d: Diagram, id: string): number {
  return d.straekninger.filter((s) => s.fra === id || s.til === id).length;
}

/** Strækning til et "fortsætter"-punkt: kun visning, ingen beregning */
export function erVisuel(d: Diagram, s: Straekning): boolean {
  return d.knuder.some((k) => k.fortsaetter && (k.id === s.fra || k.id === s.til));
}

/** Markér/afmarkér punkt som "rørstræk fortsætter" */
export function saetFortsaetter(d: Diagram, id: string, til: boolean) {
  const k = d.knuder.find((x) => x.id === id);
  if (!k || k.type === 'forsyning') return;
  if (til) {
    k.fortsaetter = true;
    k.navn = ''; // frigiv bogstavet
    k.qf = 0;
  } else {
    delete k.fortsaetter;
    k.navn = naesteNavn(d);
  }
}

/** Fjern punkter uden rør (forsyningen bevares). */
export function rydLoeseKnuder(d: Diagram) {
  const brugt = new Set(d.straekninger.flatMap((s) => [s.fra, s.til]));
  d.knuder = d.knuder.filter((k) => k.type === 'forsyning' || brugt.has(k.id));
}

export function sletStraekning(d: Diagram, id: string) {
  d.straekninger = d.straekninger.filter((s) => s.id !== id);
  rydLoeseKnuder(d);
}

export function sletKnude(d: Diagram, id: string) {
  d.knuder = d.knuder.filter((k) => k.id !== id);
  d.straekninger = d.straekninger.filter((s) => s.fra !== id && s.til !== id);
  rydLoeseKnuder(d);
}

/**
 * Punkter der skal flyttes med, når et punkt trækkes, så lige rør forbliver vandrette/lodrette:
 * - vandret: punkter forbundet via vandrette rør uden knæk (samme y)
 * - lodret: punkter forbundet via lodrette rør uden knæk (samme x)
 * Rør med knæk følger med ved at deres første/sidste knæk justeres (se flytKnuder).
 */
export function ortogonaleGrupper(d: Diagram, id: string) {
  const km = new Map(d.knuder.map((k) => [k.id, k]));
  const bfs = (test: (a: Knude, b: Knude) => boolean) => {
    const saet = new Set([id]);
    const koe = [id];
    while (koe.length) {
      const n = koe.pop()!;
      for (const s of d.straekninger) {
        if (s.fra !== n && s.til !== n) continue;
        if (s.knaek?.length) continue;
        const m = s.fra === n ? s.til : s.fra;
        if (saet.has(m)) continue;
        const a = km.get(s.fra);
        const b = km.get(s.til);
        if (a && b && test(a, b)) {
          saet.add(m);
          koe.push(m);
        }
      }
    }
    return saet;
  };
  return { vandret: bfs((a, b) => a.y === b.y), lodret: bfs((a, b) => a.x === b.x) };
}

/**
 * Flyt en markering (punkter + strækninger) med dx/dy ud fra udgangsdiagrammet `orig`.
 * Endepunkter af markerede strækninger flyttes med. Strækninger der forbinder til
 * umarkerede punkter holdes vandrette/lodrette med et (justeret) knæk.
 */
export function flytMarkering(
  d: Diagram,
  orig: Diagram,
  knuder: string[],
  straekninger: string[],
  dx: number,
  dy: number,
) {
  const valgteS = new Set(straekninger);
  const flyt = new Set(knuder);
  for (const s of orig.straekninger) {
    if (valgteS.has(s.id)) {
      flyt.add(s.fra);
      flyt.add(s.til);
    }
  }
  const origK = new Map(orig.knuder.map((k) => [k.id, k]));
  for (const k of d.knuder) {
    const o = origK.get(k.id);
    if (o && flyt.has(k.id)) {
      k.x = o.x + dx;
      k.y = o.y + dy;
    }
  }
  const nyK = new Map(d.knuder.map((k) => [k.id, k]));
  const origS = new Map(orig.straekninger.map((s) => [s.id, s]));
  for (const s of d.straekninger) {
    const os = origS.get(s.id);
    if (!os) continue;
    const fraFlyt = flyt.has(s.fra);
    const tilFlyt = flyt.has(s.til);
    const knaek = (os.knaek ?? []).map((p) => ({ ...p }));

    if (fraFlyt && tilFlyt) {
      s.knaek = knaek.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      continue;
    }
    if (!fraFlyt && !tilFlyt) continue;

    const flytId = fraFlyt ? s.fra : s.til;
    const fastId = fraFlyt ? s.til : s.fra;
    const oM = origK.get(flytId);
    const oU = origK.get(fastId);
    const M = nyK.get(flytId);
    if (!oM || !oU || !M) continue;

    if (knaek.length) {
      // Justér knækket nærmest det flyttede punkt
      const i = fraFlyt ? 0 : knaek.length - 1;
      const ok = os.knaek![i];
      if (oM.y === ok.y) knaek[i].y += dy;
      else if (oM.x === ok.x) knaek[i].x += dx;
      s.knaek = knaek;
    } else if (oM.y === oU.y && dy !== 0) {
      s.knaek = [{ x: M.x, y: oU.y }]; // var vandret: vandret ben fra det faste punkt, lodret til det flyttede
    } else if (oM.x === oU.x && dx !== 0) {
      s.knaek = [{ x: oU.x, y: M.y }]; // var lodret
    } else {
      s.knaek = [];
    }
  }
}

/**
 * Flyt punkter (fra udgangsdiagrammet `orig`) med dx/dy og justér knæk,
 * så det første og sidste stykke af rør med knæk forbliver vandret/lodret.
 */
export function flytKnuder(
  d: Diagram,
  orig: Diagram,
  vandret: Set<string>,
  lodret: Set<string>,
  dx: number,
  dy: number,
) {
  const origK = new Map(orig.knuder.map((k) => [k.id, k]));
  for (const k of d.knuder) {
    const o = origK.get(k.id);
    if (!o) continue;
    k.x = lodret.has(k.id) ? o.x + dx : o.x;
    k.y = vandret.has(k.id) ? o.y + dy : o.y;
  }
  const nyK = new Map(d.knuder.map((k) => [k.id, k]));
  const origS = new Map(orig.straekninger.map((s) => [s.id, s]));
  for (const s of d.straekninger) {
    const os = origS.get(s.id);
    if (!os?.knaek?.length || !s.knaek) continue;
    const knaek = os.knaek.map((p) => ({ ...p }));
    const ender: [string, number][] = [
      [s.fra, 0],
      [s.til, knaek.length - 1],
    ];
    for (const [id, i] of ender) {
      const o = origK.get(id);
      const n = nyK.get(id);
      if (!o || !n) continue;
      const ok = os.knaek[i];
      if (o.y === ok.y) knaek[i].y += n.y - o.y; // vandret stykke: følg med lodret
      else if (o.x === ok.x) knaek[i].x += n.x - o.x; // lodret stykke: følg med vandret
    }
    s.knaek = knaek;
  }
}
