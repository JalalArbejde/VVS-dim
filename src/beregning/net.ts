// Beregning af ét diagram (koldt ELLER varmt vand):
// Σqf → qd → qd' → dimension → tryktab → tryk i punkterne.
// Ren beregning – ingen afhængighed af tegning/UI.
import type { Diagram, Forudsaetninger, Knude, Straekning, Tappesystem } from '../model/types';
import { TAPSTEDER, type TapstedType } from '../katalog/tapsteder';
import { dimId, dimLabel, findSerie, type RoerDim, type RoerSerie } from '../katalog/roerserier';
import { beregnTab, nu, qdFraSum, qdMark, qSkyl, rho, type Tab } from './hydraulik';

const rund = (v: number) => Math.round(v * 1e6) / 1e6;

/** Vandmængde i et punkt: indtastet qf + evt. tapsteder (DS 439) for systemet. */
export function punktFlow(k: Knude, sys: Tappesystem, katalog: TapstedType[] = TAPSTEDER): number {
  let q = k.qf ?? 0;
  for (const l of k.tapsteder ?? []) {
    const t = katalog.find((x) => x.kode === l.kode);
    if (t && t[sys]) q += t.qf * l.antal;
  }
  return rund(q);
}

interface Bidrag {
  qf: number;
  /** Skylleventiler + systematisk forbrug [l/s] */
  andre: number;
  slange: boolean;
}

const NUL: Bidrag = { qf: 0, andre: 0, slange: false };

function bidrag(k: Knude | undefined, sys: Tappesystem, katalog: TapstedType[]): Bidrag {
  if (!k) return NUL;
  return {
    qf: punktFlow(k, sys, katalog),
    andre: qSkyl(k.skylleventiler ?? 0) + (k.systematisk ?? 0),
    slange: !!k.slangevinde,
  };
}

export const sumKomponenter = (f: Forudsaetninger) => f.komponenter.reduce((a, c) => a + c.kPa, 0);

export type Advarsel = 'v_hoej' | 'v_lav' | 'R_hoej' | 'Re_lav';

export interface SysResultat {
  sumQf: number;
  qd: number;
  qdMark: number;
  /** Slangevinde nedstrøms (formel 5) */
  slangevinde: boolean;
  /** Skylleventiler + systematisk forbrug nedstrøms [l/s] */
  andre: number;
  dim: RoerDim | null;
  label: string;
  laast: boolean;
  tab: Tab | null;
  advarsler: Advarsel[];
}

export interface KnudeTryk {
  /** Beregningstryk p'x [kPa] */
  pBeregning: number;
  /** Faktisk tryk inkl. højde px [kPa] */
  px: number;
}

export interface Opsummering {
  pxe: number;
  zf: number;
  kritiskKnude: string | null;
  pxKritisk: number | null;
  kritiskVej: string[];
  sumDpKritisk: number;
  hoejdeKritisk: number;
  behovBoost: number;
  maxQdMark: number;
  gnsVKritisk: number | null;
  opdimensioneret: number;
  hoejdeBegraenset: boolean;
}

export interface DiagramResultat {
  straekninger: Record<string, SysResultat>;
  /** Strømningsretning pr. strækning: fra forsyningen (fra) mod tapstedet (til) */
  retning: Record<string, { fra: string; til: string }>;
  knuder: Record<string, KnudeTryk>;
  opsummering: Opsummering | null;
  advarsler: string[];
}

export function beregnDiagram(
  diagram: Diagram,
  sys: Tappesystem,
  f: Forudsaetninger,
  katalog: TapstedType[] = TAPSTEDER,
): DiagramResultat {
  // "Rørstræk fortsætter"-punkter og strækningerne til dem er kun visning
  const fortsaet = new Set(diagram.knuder.filter((k) => k.fortsaetter).map((k) => k.id));
  const d: Diagram = {
    knuder: diagram.knuder.filter((k) => !fortsaet.has(k.id)),
    straekninger: diagram.straekninger.filter((s) => !fortsaet.has(s.fra) && !fortsaet.has(s.til)),
  };
  const res: DiagramResultat = { straekninger: {}, retning: {}, knuder: {}, opsummering: null, advarsler: [] };
  const forsyninger = d.knuder.filter((k) => k.type === 'forsyning');
  if (forsyninger.length === 0) {
    if (d.straekninger.length > 0) {
      res.advarsler.push('Der er intet forsyningspunkt. Vælg et punkt og markér det som forsyning.');
    }
    return res;
  }
  if (forsyninger.length > 1) res.advarsler.push('Der er mere end ét forsyningspunkt – kun det første bruges.');
  const start = forsyninger[0];

  const knuder = new Map(d.knuder.map((k) => [k.id, k]));
  const straekById = new Map(d.straekninger.map((s) => [s.id, s]));
  const kote = (id: string) => knuder.get(id)?.kote ?? 0;
  const zf = start.kote;
  const pxe = f.forsyningstryk - sumKomponenter(f) + f.boost;
  const T = sys === 'BK' ? f.tempKold : f.tempVarm;
  const rho_ = rho(T);
  const nu_ = nu(T);

  const manglerLaengde = d.straekninger.filter((s) => s.laengde == null).length;
  if (manglerLaengde > 0) {
    res.advarsler.push(`${manglerLaengde} strækning(er) mangler længde – rørtabet regnes som 0 på dem.`);
  }

  // 1. Opbyg træet fra forsyningen
  const nabo = new Map<string, Straekning[]>();
  for (const s of d.straekninger) {
    for (const n of [s.fra, s.til]) {
      if (!nabo.has(n)) nabo.set(n, []);
      nabo.get(n)!.push(s);
    }
  }
  const foraelderKant = new Map<string, Straekning>();
  const besoegt = new Set<string>([start.id]);
  const orden: string[] = [];
  const stak = [start.id];
  let ring = false;
  while (stak.length) {
    const n = stak.pop()!;
    orden.push(n);
    for (const kant of nabo.get(n) ?? []) {
      if (kant === foraelderKant.get(n)) continue;
      const anden = kant.fra === n ? kant.til : kant.fra;
      if (besoegt.has(anden)) {
        ring = true;
        continue;
      }
      besoegt.add(anden);
      foraelderKant.set(anden, kant);
      stak.push(anden);
    }
  }
  const foraelder = (n: string) => {
    const kant = foraelderKant.get(n)!;
    return kant.fra === n ? kant.til : kant.fra;
  };
  for (const [n, kant] of foraelderKant) res.retning[kant.id] = { fra: foraelder(n), til: n };

  // 2. Akkumulér Σqf, tillæg og slangevinde fra punkterne mod forsyningen
  const fraBoern = new Map<string, Bidrag>();
  const kantTotal = new Map<string, Bidrag>();
  for (let i = orden.length - 1; i >= 0; i--) {
    const n = orden[i];
    const e = bidrag(knuder.get(n), sys, katalog);
    const b = fraBoern.get(n) ?? NUL;
    const total = { qf: e.qf + b.qf, andre: e.andre + b.andre, slange: e.slange || b.slange };
    const kant = foraelderKant.get(n);
    if (!kant) continue;
    kantTotal.set(kant.id, total);
    const far = foraelder(n);
    const fb = fraBoern.get(far) ?? NUL;
    fraBoern.set(far, { qf: fb.qf + total.qf, andre: fb.andre + total.andre, slange: fb.slange || total.slange });
  }

  // 3. Dimensionering: mindste dimension med v ≤ vMax og R ≤ rMax
  const valg = new Map<
    string,
    { serie: RoerSerie; idx: number; laast: boolean; q: number; qd: number; sumQf: number; slange: boolean; andre: number }
  >();
  const autoIdx = (serie: RoerSerie, q: number) => {
    for (let i = 0; i < serie.dims.length; i++) {
      const t = beregnTab({ q, di: serie.dims[i].di / 1000, k: serie.k, L: 0, nu: nu_, rho: rho_, tillaeg: 0 });
      if (t.v <= f.vMax && t.R <= f.rMax) return i;
    }
    return serie.dims.length - 1;
  };
  const gemKant = (id: string) => {
    const s = straekById.get(id)!;
    const v = valg.get(id)!;
    const dim = v.serie.dims[v.idx];
    const tab = beregnTab({
      q: v.q,
      di: dim.di / 1000,
      k: v.serie.k,
      L: s.laengde ?? 0,
      nu: nu_,
      rho: rho_,
      xi: s.xi,
      enkelttab: s.enkelttab,
      tillaeg: f.tillaeg,
    });
    const adv: Advarsel[] = [];
    if (tab.v > f.vMax) adv.push('v_hoej');
    if (sys === 'BV' && tab.v < f.vMin) adv.push('v_lav');
    if (tab.R > f.rMax) adv.push('R_hoej');
    if (tab.Re < 4000) adv.push('Re_lav');
    res.straekninger[id] = {
      sumQf: rund(v.sumQf),
      qd: v.qd,
      qdMark: v.q,
      slangevinde: v.slange,
      andre: rund(v.andre),
      dim,
      label: dimLabel(v.serie, dim),
      laast: v.laast,
      tab,
      advarsler: adv,
    };
  };

  for (const [id, total] of kantTotal) {
    const s = straekById.get(id)!;
    const serie = findSerie(s.roertype || f.roertype);
    const qd = qdFraSum(total.qf);
    const q = qdMark(qd, total.andre, total.slange);
    if (q <= 0) {
      res.straekninger[id] = {
        sumQf: 0, qd: 0, qdMark: 0, slangevinde: false, andre: 0, dim: null, label: '', laast: false, tab: null, advarsler: [],
      };
      continue;
    }
    let idx = s.laast ? serie.dims.findIndex((x) => dimId(x) === s.laast) : -1;
    const laast = idx >= 0;
    if (!laast) idx = autoIdx(serie, q);
    valg.set(id, { serie, idx, laast, q, qd, sumQf: total.qf, slange: total.slange, andre: total.andre });
    gemKant(id);
  }

  // 4. Tryk gennem nettet
  const tryk = new Map<string, KnudeTryk>();
  const beregnTryk = () => {
    for (const n of orden) {
      const kant = foraelderKant.get(n);
      const pB = kant ? tryk.get(foraelder(n))!.pBeregning - (res.straekninger[kant.id]?.tab?.dp ?? 0) : pxe;
      tryk.set(n, { pBeregning: pB, px: pB - 9.81 * (kote(n) - zf) });
    }
  };
  beregnTryk();

  const tappesteder = orden.filter((n) => {
    const e = bidrag(knuder.get(n), sys, katalog);
    return e.qf > 0 || e.andre > 0;
  });
  const kritisk = () => {
    let bedst: string | null = null;
    for (const n of tappesteder) if (bedst === null || tryk.get(n)!.px < tryk.get(bedst)!.px) bedst = n;
    return bedst;
  };
  const vejTil = (n: string) => {
    const vej: string[] = [];
    let x = n;
    while (foraelderKant.has(x)) {
      vej.push(foraelderKant.get(x)!.id);
      x = foraelder(x);
    }
    return vej.reverse();
  };

  // 5. For lavt tryk ved farligste punkt → øg dimensionen med størst R·L på kritisk vej
  let opdim = 0;
  let hoejdeBegraenset = false;
  for (let i = 0; f.autoTryk && i < 500; i++) {
    const fp = kritisk();
    if (!fp || tryk.get(fp)!.px >= f.tapstedTryk) break;
    const vej = vejTil(fp);
    const fasteTab = vej.reduce((a, id) => a + (straekById.get(id)!.enkelttab ?? 0), 0);
    if (pxe - fasteTab - 9.81 * (kote(fp) - zf) < f.tapstedTryk) {
      hoejdeBegraenset = true;
      break;
    }
    let bedst: string | null = null;
    let bedstDp = 0;
    for (const id of vej) {
      const v = valg.get(id);
      if (!v || v.laast || v.idx >= v.serie.dims.length - 1) continue;
      const dp = res.straekninger[id]?.tab?.dpRoer ?? 0;
      if (dp > bedstDp) {
        bedst = id;
        bedstDp = dp;
      }
    }
    if (!bedst) break;
    valg.get(bedst)!.idx++;
    gemKant(bedst);
    beregnTryk();
    opdim++;
  }

  // 6. Opsummering for farligste punkt
  for (const [n, t] of tryk) res.knuder[n] = t;
  const fp = kritisk();
  const vej = fp ? vejTil(fp) : [];
  const vejRes = vej.map((id) => res.straekninger[id]).filter((r) => r?.tab);
  const pxK = fp ? tryk.get(fp)!.px : null;
  const gnsV = vejRes.length ? vejRes.reduce((a, r) => a + r.tab!.v, 0) / vejRes.length : null;
  res.opsummering = {
    pxe,
    zf,
    kritiskKnude: fp,
    pxKritisk: pxK,
    kritiskVej: vej,
    sumDpKritisk: vejRes.reduce((a, r) => a + r.tab!.dp, 0),
    hoejdeKritisk: fp ? kote(fp) - zf : 0,
    behovBoost: pxK != null ? Math.max(0, f.tapstedTryk - pxK) : 0,
    maxQdMark: vejRes.reduce((a, r) => Math.max(a, r.qdMark), 0),
    gnsVKritisk: gnsV,
    opdimensioneret: opdim,
    hoejdeBegraenset,
  };

  // Advarsler
  if (ring) res.advarsler.push('Ring fundet i nettet – beregningen forudsætter et forgrenet net.');
  const ikkeForbundet = d.straekninger.filter((s) => !besoegt.has(s.fra) && !besoegt.has(s.til)).length;
  if (ikkeForbundet > 0) res.advarsler.push(`${ikkeForbundet} strækning(er) er ikke forbundet til forsyningen.`);
  for (const k of d.knuder) {
    if (besoegt.has(k.id)) continue;
    const e = bidrag(k, sys, katalog);
    if (e.qf > 0 || e.andre > 0) res.advarsler.push(`Punkt ${k.navn} har vandmængde men er ikke forbundet.`);
  }
  const ikkeOpfyldt = [...valg.entries()].filter(([id, v]) => {
    const a = res.straekninger[id]?.advarsler ?? [];
    return !v.laast && (a.includes('v_hoej') || a.includes('R_hoej'));
  }).length;
  if (ikkeOpfyldt > 0) {
    res.advarsler.push(`${ikkeOpfyldt} strækning(er) overholder ikke v/R selv med største dimension.`);
  }
  if (gnsV != null && gnsV > f.vGnsMax) res.advarsler.push(`Gns. hastighed på kritisk vej er over ${f.vGnsMax} m/s.`);
  if (pxK != null && pxK < f.tapstedTryk) {
    res.advarsler.push(
      `For lavt tryk i farligste punkt – nødvendig trykforøgning ${Math.ceil(f.tapstedTryk - pxK)} kPa.`,
    );
  }
  return res;
}
