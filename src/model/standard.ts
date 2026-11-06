import type { Diagram, Forudsaetninger, Projekt } from './types';

export const nyId = () => Math.random().toString(36).slice(2, 10);

/** Standardværdier fra fanen "Forudsætninger" i Brugsvand-arket. */
export function standardForudsaetninger(): Forudsaetninger {
  return {
    tempKold: 10,
    tempVarm: 55,
    forsyningstryk: 300,
    komponenter: [
      { navn: 'Anboring', kPa: 10 },
      { navn: 'Hovedmåler', kPa: 20 },
      { navn: 'Bimåler', kPa: 8 },
      { navn: 'Kontraventil/tilbageløbssikring', kPa: 10 },
      { navn: 'Afspærringsventiler', kPa: 15 },
      { navn: 'Større enkeltmodstande (vandvarmer)', kPa: 25 },
    ],
    boost: 0,
    tillaeg: 25,
    tapstedTryk: 150,
    vMax: 1.3,
    vMin: 0.7,
    vGnsMax: 1.2,
    rMax: 1,
    roertype: 'rs',
    autoTryk: true,
  };
}

export function nytProjekt(): Projekt {
  return {
    version: 2,
    navn: 'Nyt projekt',
    BK: { knuder: [], straekninger: [] },
    BV: { knuder: [], straekninger: [] },
    forudsaetninger: standardForudsaetninger(),
  };
}

export function migrer(p: Projekt): Projekt {
  p.forudsaetninger = { ...standardForudsaetninger(), ...(p.forudsaetninger ?? {}) };
  return p;
}

/** 0 → A, 25 → Z, 26 → AA … (som i Excel-arket) */
export function punktNavn(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function naesteNavn(d: Diagram): string {
  const brugt = new Set(d.knuder.map((k) => k.navn));
  for (let i = 0; ; i++) {
    const n = punktNavn(i);
    if (!brugt.has(n)) return n;
  }
}
