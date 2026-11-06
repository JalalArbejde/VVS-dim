// Arkformater til omrids og print.
// 1 tegneenhed = 1 typografisk punkt (1/72"), så teksten bliver ca. 2,5 mm ved print.
// Alle ark har samme nulpunkt: nederste højre hjørne (hvor titelfeltet sidder).

export type ArkStr = 'A3' | 'A2' | 'A1' | 'A1+L1' | 'A1+L2';
export const ARK_LISTE: ArkStr[] = ['A3', 'A2', 'A1', 'A1+L1', 'A1+L2'];

/** Forlængelse pr. L-trin [mm]. ANTAGELSE – ret her hvis jeres standard er en anden. */
export const FORLAENGELSE_MM = 210;

/** Liggende arkformater [mm] */
export const ARK_MM: Record<ArkStr, { b: number; h: number }> = {
  A3: { b: 420, h: 297 },
  A2: { b: 594, h: 420 },
  A1: { b: 841, h: 594 },
  'A1+L1': { b: 841 + FORLAENGELSE_MM, h: 594 },
  'A1+L2': { b: 841 + 2 * FORLAENGELSE_MM, h: 594 },
};

export const mmTilEnhed = (mm: number) => (mm / 25.4) * 72;

export const NULPUNKT = { x: -60 + mmTilEnhed(420), y: -60 + mmTilEnhed(297) };

/** Arkets rektangel i tegneenheder */
export function arkRect(a: ArkStr) {
  const b = mmTilEnhed(ARK_MM[a].b);
  const h = mmTilEnhed(ARK_MM[a].h);
  return { x: NULPUNKT.x - b, y: NULPUNKT.y - h, b, h };
}
