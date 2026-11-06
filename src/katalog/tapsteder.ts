// Forudsatte vandstrømme qf pr. tapsted (DS 439) – fra fanen "Data" i Brugsvand-arket.
//
// BK/BV angiver om tapstedet trækker på koldt og/eller varmt vand.
// OBS: BK/BV-fordelingen står ikke i arket – den er sat ud fra almindelig praksis. Kontrollér.

export interface TapstedType {
  kode: string;
  navn: string;
  qf: number;
  BK: boolean;
  BV: boolean;
}

export const TAPSTEDER: TapstedType[] = [
  { kode: 'BAK', navn: 'Badekar', qf: 0.3, BK: true, BV: true },
  { kode: 'BI', navn: 'Bidet', qf: 0.1, BK: true, BV: true },
  { kode: 'BRU', navn: 'Brusebad', qf: 0.15, BK: true, BV: true },
  { kode: 'GHV', navn: 'Gård-/havevanding', qf: 0.2, BK: true, BV: false },
  { kode: 'HV', navn: 'Håndvask', qf: 0.1, BK: true, BV: true },
  { kode: 'KV', navn: 'Køkkenvask', qf: 0.2, BK: true, BV: true },
  { kode: 'RV', navn: 'Rengøringsvask', qf: 0.2, BK: true, BV: true },
  { kode: 'SB', navn: 'Samtidigt benyttede brusere (fabrikker o.l.)', qf: 0.1, BK: true, BV: true },
  { kode: 'SH', navn: 'Samtidigt benyttede håndvaske/vaskerender', qf: 0.03, BK: true, BV: true },
  { kode: 'SU', navn: 'Skylleventil til urinal', qf: 0.4, BK: true, BV: false },
  { kode: 'VG', navn: 'Ventil til spuling af gulve o.l.', qf: 0.2, BK: true, BV: false },
  { kode: 'VAS', navn: 'Vaskemaskine (husholdning)', qf: 0.2, BK: true, BV: false },
  { kode: 'OPV-K', navn: 'Opvaskemaskine på koldt vand', qf: 0.2, BK: true, BV: false },
  { kode: 'OPV-V', navn: 'Opvaskemaskine på varmt vand', qf: 0.2, BK: false, BV: true },
  { kode: 'WC', navn: 'WC-cisterne', qf: 0.1, BK: true, BV: false },
  { kode: 'Xtra', navn: 'Definerbar', qf: 5, BK: true, BV: true },
];
