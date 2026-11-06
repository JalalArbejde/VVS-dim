// Hydrauliske grundformler – DS 439 / SBi-anvisning 235, som i Brugsvand-arket.
// Rene funktioner uden afhængigheder. Afsnitsnumre henviser til metodebeskrivelsen.

/** Densitet [kg/m³] ved T [°C] (afsnit 1.1) */
export const rho = (T: number) =>
  1.3072e-11 * T ** 6 - 2.6395e-9 * T ** 5 - 2.0111e-9 * T ** 4 + 4.624e-5 * T ** 3 - 0.0081234 * T ** 2 +
  0.068256 * T + 999.8;

/** Kinematisk viskositet [m²/s] ved T [°C] (afsnit 1.1) */
export const nu = (T: number) =>
  9.7958e-18 * T ** 6 - 3.3923e-15 * T ** 5 + 4.7518e-13 * T ** 4 - 3.5853e-11 * T ** 3 + 1.7178e-9 * T ** 2 -
  6.2062e-8 * T + 1.78e-6;

/** Dimensionerende vandstrøm qd [l/s] ud fra Σqf (afsnit 4.3) */
export function qdFraSum(sumQf: number): number {
  if (sumQf <= 0) return 0;
  if (sumQf <= 0.2) return 0.7 * (sumQf - 0.1) + 0.1;
  return 0.15 + 0.011 * (sumQf - 0.15) + 0.089 * Math.sqrt(sumQf - 0.15);
}

/** Tillæg for skylleventiler [l/s] (afsnit 4.4) */
export const qSkyl = (antal: number) => (antal > 0 ? Math.max(0.4, 0.4 + (antal - 1) * 0.1) : 0);

/** Endelig dimensionerende vandstrøm qd' [l/s] (afsnit 4.5) */
export function qdMark(qd: number, andre: number, slangevinde: boolean): number {
  if (slangevinde) return (qd === 0 ? 0.33 : 0.33 + (qd - 0.2)) + andre;
  return qd + andre;
}

export interface TabInput {
  /** Vandstrøm qd' [l/s] */
  q: number;
  /** Indvendig diameter [m] */
  di: number;
  /** Ruhed [m] */
  k: number;
  /** Længde [m] */
  L: number;
  nu: number;
  rho: number;
  /** Σξ – hvis angivet bruges den i stedet for procenttillæg */
  xi?: number | null;
  /** Ekstra enkelttab [kPa] */
  enkelttab?: number | null;
  /** Procenttillæg for enkelttab */
  tillaeg: number;
}

export interface Tab {
  v: number;
  Re: number;
  lambda: number;
  /** Trykgradient [kPa/m] */
  R: number;
  /** Rørfriktion R·L [kPa] */
  dpRoer: number;
  /** Samlet tryktab i strækningen [kPa] */
  dp: number;
}

/** Hastighed, Reynolds, friktion og tryktab (afsnit 4.7–4.11) */
export function beregnTab(i: TabInput): Tab {
  const A = (Math.PI * i.di ** 2) / 4;
  const v = (i.q * 0.001) / A;
  const Re = (v * i.di) / i.nu;
  // Blasius som startgæt + én Colebrook-White-iteration (som i Excel-arket)
  const lamS = 0.316 * Re ** -0.25;
  const lambda = (1 / (-2 * Math.log10(2.51 / (Re * Math.sqrt(lamS)) + i.k / i.di / 3.71))) ** 2;
  const R = (lambda * 0.5 * i.rho * v * v) / i.di / 1000;
  const dpRoer = R * i.L;
  const e = i.enkelttab ?? 0;
  const dp =
    i.xi != null
      ? e + dpRoer + (i.xi * 0.5 * i.rho * v * v) / 1000
      : e + dpRoer * (1 + i.tillaeg / 100);
  return { v, Re, lambda, R, dpRoer, dp };
}
