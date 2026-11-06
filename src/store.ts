// Programmets tilstand: projektet, fortryd/gendan, aktivt diagram, værktøj og markering.
import { create } from 'zustand';
import type { Projekt, Punkt, Tappesystem } from './model/types';
import { migrer, nytProjekt } from './model/standard';
import { rydLoeseKnuder, sletKnude, sletStraekning } from './model/operationer';

export type Vaerktoej = 'vaelg' | 'roer';
import type { ArkStr } from './tegning/ark';
export type { ArkStr };
export type Valg =
  | { type: 'knude' | 'straekning'; id: string }
  | { type: 'flere'; knuder: string[]; straekninger: string[] }
  | null;

export function erValgt(v: Valg, type: 'knude' | 'straekning', id: string): boolean {
  if (!v) return false;
  if (v.type === 'flere') return (type === 'knude' ? v.knuder : v.straekninger).includes(id);
  return v.type === type && v.id === id;
}

interface Tilstand {
  projekt: Projekt;
  historik: Projekt[];
  fremtid: Projekt[];
  /** Hvilket diagram der vises: koldt eller varmt vand */
  system: Tappesystem;
  vaerktoej: Vaerktoej;
  valg: Valg;
  /** Punkt hvor et igangværende rør startede */
  tegnFra: string | null;
  /** Knæk i den strækning der tegnes lige nu */
  tegnKnaek: Punkt[];
  setTegnKnaek: (k: Punkt[]) => void;
  /** Senest tegnede strækning – længdefeltet får fokus */
  nyStraekning: string | null;
  markoer: Punkt | null;
  visDetaljer: boolean;
  /** Vis omrids af A3-ark */
  /** Viste arkrammer */
  ark: ArkStr[];
  skiftArk: (a: ArkStr) => void;
  visGitter: boolean;
  setVisGitter: (v: boolean) => void;
  /** Vis strækningsnavn og længde på tegningen */
  visNavne: boolean;
  setVisNavne: (v: boolean) => void;
  /** Vis skemaet under tegningen */
  visSkema: boolean;
  setVisSkema: (v: boolean) => void;

  aendr: <T>(fn: (p: Projekt) => T, medHistorik?: boolean) => T;
  gemHistorik: () => void;
  fortryd: () => void;
  gentag: () => void;
  indlaes: (p: Projekt) => void;
  setSystem: (s: Tappesystem) => void;
  setVaerktoej: (v: Vaerktoej) => void;
  setValg: (v: Valg) => void;
  setTegnFra: (id: string | null) => void;
  setNyStraekning: (id: string | null) => void;
  afslutTegning: () => void;
  setMarkoer: (p: Punkt | null) => void;
  setVisDetaljer: (v: boolean) => void;
  sletValgt: () => void;
}

const NOEGLE = 'vvs-dim-projekt-v2';
const MAKS_HISTORIK = 100;

export function erProjekt(p: unknown): p is Projekt {
  const x = p as Projekt;
  return !!x && x.version === 2 && Array.isArray(x.BK?.knuder) && Array.isArray(x.BV?.knuder);
}

function hentGemt(): Projekt {
  try {
    const t = localStorage.getItem(NOEGLE);
    if (t) {
      const p = JSON.parse(t);
      if (erProjekt(p)) return migrer(p);
    }
  } catch {
    /* ignorer */
  }
  return nytProjekt();
}

export const useStore = create<Tilstand>()((set, get) => ({
  projekt: hentGemt(),
  historik: [],
  fremtid: [],
  system: 'BK',
  vaerktoej: 'roer',
  valg: null,
  tegnFra: null,
  tegnKnaek: [],
  setTegnKnaek: (k) => set({ tegnKnaek: k }),
  nyStraekning: null,
  markoer: null,
  visDetaljer: false,
  ark: ['A3'],
  skiftArk: (a) => set((s) => ({ ark: s.ark.includes(a) ? s.ark.filter((x) => x !== a) : [...s.ark, a] })),
  visGitter: true,
  setVisGitter: (v) => set({ visGitter: v }),
  visNavne: true,
  setVisNavne: (v) => set({ visNavne: v }),
  visSkema: true,
  setVisSkema: (v) => set({ visSkema: v }),

  aendr: (fn, medHistorik = true) => {
    const s = get();
    const kopi = structuredClone(s.projekt);
    const r = fn(kopi);
    set(
      medHistorik
        ? { projekt: kopi, historik: [...s.historik.slice(-MAKS_HISTORIK), s.projekt], fremtid: [] }
        : { projekt: kopi },
    );
    return r;
  },
  gemHistorik: () =>
    set((s) => ({ historik: [...s.historik.slice(-MAKS_HISTORIK), s.projekt], fremtid: [] })),
  fortryd: () => {
    const s = get();
    const forrige = s.historik[s.historik.length - 1];
    if (!forrige) return;
    set({ projekt: forrige, historik: s.historik.slice(0, -1), fremtid: [s.projekt, ...s.fremtid], tegnFra: null, tegnKnaek: [] });
  },
  gentag: () => {
    const s = get();
    const naeste = s.fremtid[0];
    if (!naeste) return;
    set({ projekt: naeste, historik: [...s.historik, s.projekt], fremtid: s.fremtid.slice(1), tegnFra: null, tegnKnaek: [] });
  },
  indlaes: (p) => set({ projekt: migrer(p), historik: [], fremtid: [], valg: null, tegnFra: null, tegnKnaek: [] }),
  setSystem: (system) => {
    get().afslutTegning();
    set({ system, valg: null });
  },
  setVaerktoej: (v) => {
    get().afslutTegning();
    set({ vaerktoej: v });
  },
  setValg: (v) => set({ valg: v }),
  setTegnFra: (id) => set({ tegnFra: id }),
  setNyStraekning: (id) => set({ nyStraekning: id }),
  afslutTegning: () => {
    if (!get().tegnFra) return;
    const sys = get().system;
    get().aendr((p) => rydLoeseKnuder(p[sys]), false);
    set({ tegnFra: null, tegnKnaek: [] });
  },
  setMarkoer: (p) => set({ markoer: p }),
  setVisDetaljer: (v) => set({ visDetaljer: v }),
  sletValgt: () => {
    const { valg: v, system } = get();
    if (!v) return;
    get().aendr((p) => {
      const d = p[system];
      if (v.type === 'flere') {
        for (const id of v.straekninger) sletStraekning(d, id);
        for (const id of v.knuder) sletKnude(d, id);
      } else if (v.type === 'knude') sletKnude(d, v.id);
      else sletStraekning(d, v.id);
    });
    set({ valg: null, tegnFra: null, tegnKnaek: [] });
  },
}));

// Autogem i browseren ved hver ændring
useStore.subscribe((s, f) => {
  if (s.projekt === f.projekt) return;
  try {
    localStorage.setItem(NOEGLE, JSON.stringify(s.projekt));
  } catch {
    /* ignorer */
  }
});
