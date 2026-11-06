// Rørserier fra fanen "Data" i Brugsvand-arket. di i mm, ruhed k i m (iht. DS 439).

export interface RoerDim {
  /** Udvendig diameter [mm] – for stål: DN */
  ud: number;
  /** Godstykkelse [mm] (null for stål/DN) */
  gods: number | null;
  /** Indvendig diameter [mm] */
  di: number;
}

export interface RoerSerie {
  kode: string;
  navn: string;
  forkortelse: string;
  k: number;
  dims: RoerDim[];
}

const d = (ud: number, gods: number | null, di: number): RoerDim => ({ ud, gods, di });

export const ROERSERIER: RoerSerie[] = [
  {
    kode: 'm',
    navn: 'Stål / galvaniseret (DN)',
    forkortelse: 'ST',
    k: 0.001,
    dims: [
      d(15, null, 16.0), d(20, null, 21.6), d(25, null, 27.2), d(32, null, 35.9), d(40, null, 41.8),
      d(50, null, 53.0), d(65, null, 68.8), d(80, null, 80.8), d(100, null, 105.3), d(125, null, 128.5),
      d(150, null, 150.0),
    ],
  },
  {
    kode: 'cu',
    navn: 'Kobber',
    forkortelse: 'CU',
    k: 0.00015,
    dims: [
      d(10, 1, 8), d(12, 1, 10), d(15, 1, 13), d(17, 1, 15), d(22, 1, 20), d(28, 1, 26), d(35, 1.5, 32),
      d(42, 1.5, 39), d(54, 2, 50), d(76.1, 2, 72.1), d(88.9, 2, 84.9), d(108, 2.5, 103),
    ],
  },
  {
    kode: 'rs',
    navn: 'Rustfrit stål',
    forkortelse: 'RS',
    k: 0.00015,
    dims: [
      d(15, 1, 13), d(18, 1, 16), d(22, 1.2, 19.6), d(28, 1.2, 25.6), d(35, 1.5, 32), d(42, 1.5, 39),
      d(54, 1.5, 51), d(76.1, 2, 72.1), d(88.9, 2, 84.9), d(108, 2, 104),
    ],
  },
  {
    kode: 'px',
    navn: 'PEX',
    forkortelse: 'PEX',
    k: 0.00001,
    dims: [
      d(12, 1.7, 8.6), d(15, 2.5, 10), d(18, 2.5, 13), d(22, 3, 16), d(28, 4, 20), d(32, 4.4, 23.2),
      d(40, 5.5, 29), d(50, 6.9, 36.2), d(63, 8.6, 45.8), d(75, 10.3, 54.4), d(90, 12.3, 65.4),
      d(110, 15.1, 79.8),
    ],
  },
  {
    kode: 'apx',
    navn: 'Alupex (komposit)',
    forkortelse: 'ALUPEX',
    k: 0.00001,
    dims: [
      d(16, 2, 12), d(20, 2.3, 15.4), d(25, 2.5, 20), d(32, 3, 26), d(40, 4, 32), d(50, 4.5, 41),
      d(63, 6, 51), d(75, 7.5, 60), d(90, 8.5, 73), d(110, 10, 90),
    ],
  },
  {
    kode: 'peh',
    navn: 'PE (jordledning)',
    forkortelse: 'PE',
    k: 0.00001,
    dims: [
      d(20, 2, 16), d(25, 2.3, 20.4), d(32, 3, 26), d(40, 3.7, 32.6), d(50, 4.6, 40.8), d(63, 5.8, 51.4),
      d(75, 6.8, 61.4), d(90, 8.2, 73.6), d(110, 10, 90), d(160, 14.6, 130.8), d(200, 18, 164),
    ],
  },
];

export const dimId = (dim: RoerDim) => String(dim.ud);

export function findSerie(kode: string | null | undefined): RoerSerie {
  return ROERSERIER.find((s) => s.kode === kode) ?? ROERSERIER.find((s) => s.kode === 'rs')!;
}

const t = (n: number) => String(n).replace('.', ',');

/** Fx "22x1,2 RS" eller "DN25 ST" */
export function dimLabel(serie: RoerSerie, dim: RoerDim): string {
  if (dim.gods == null) return `DN${dim.ud} ${serie.forkortelse}`;
  return `${t(dim.ud)}x${t(dim.gods)} ${serie.forkortelse}`;
}
