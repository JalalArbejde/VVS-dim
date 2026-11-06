// Datamodellen. Projektet har to separate diagrammer: koldt vand (BK) og varmt vand (BV).
// X/Y er KUN til visning – diagrammet er ikke skalatro. Længder og koter indtastes.

export type Tappesystem = 'BK' | 'BV';
export const TAPPESYSTEMER: Tappesystem[] = ['BK', 'BV'];
export const SYSTEM_NAVN: Record<Tappesystem, string> = { BK: 'Koldt vand', BV: 'Varmt vand' };

export interface Punkt {
  x: number;
  y: number;
}

export interface TapstedLinje {
  kode: string;
  antal: number;
}

export type KnudeType = 'punkt' | 'forsyning';

export interface Knude {
  id: string;
  /** A, B, C … */
  navn: string;
  x: number;
  y: number;
  type: KnudeType;
  /** Kote [m]. For forsyningspunktet er det Zf. */
  kote: number;
  /** Vandmængde qf [l/s] der tappes i punktet */
  qf: number;
  /** Valgfrit: tapsteder (DS 439) – lægges oven i qf */
  tapsteder?: TapstedLinje[];
  /** Antal skylleventiler (urinal) */
  skylleventiler?: number;
  /** Slangevinde – 0,33 l/s erstatter et tapsted på 0,2 l/s */
  slangevinde?: boolean;
  /** Systematisk forbrug [l/s] */
  systematisk?: number;
  /** Rørstræk fortsætter: vises med S-symbol, indgår ikke i beregningen */
  fortsaetter?: boolean;
}

export interface Straekning {
  id: string;
  fra: string;
  til: string;
  /** Knæk (hjørner) mellem fra- og til-punkt – kun til tegning */
  knaek?: Punkt[];
  /** Reel længde [m] */
  laengde: number | null;
  /** Rørserie. Tom = projektets standard. */
  roertype?: string | null;
  /** Σξ. Tom = procenttillæg fra forudsætningerne. */
  xi?: number | null;
  /** Ekstra enkelttab [kPa] */
  enkelttab?: number | null;
  /** Manuelt låst dimension (id = udvendig diameter/DN) */
  laast?: string | null;
}

export interface Diagram {
  knuder: Knude[];
  straekninger: Straekning[];
}

export interface Komponent {
  navn: string;
  kPa: number;
}

export interface Forudsaetninger {
  tempKold: number;
  tempVarm: number;
  forsyningstryk: number;
  komponenter: Komponent[];
  boost: number;
  tillaeg: number;
  tapstedTryk: number;
  vMax: number;
  vMin: number;
  vGnsMax: number;
  rMax: number;
  roertype: string;
  autoTryk: boolean;
}

export interface Projekt {
  version: 2;
  navn: string;
  BK: Diagram;
  BV: Diagram;
  forudsaetninger: Forudsaetninger;
}
