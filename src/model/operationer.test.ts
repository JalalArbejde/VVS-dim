import { describe, it, expect } from 'vitest';
import type { Diagram } from './types';
import { findEllerOpretKnude, flytKnuder, flytMarkering, ortogonaleGrupper, tilfoejStraekning } from './operationer';
import { punktNavn } from './standard';

describe('punktnavne', () => {
  it('A, Z, AA, AB', () => {
    expect(punktNavn(0)).toBe('A');
    expect(punktNavn(25)).toBe('Z');
    expect(punktNavn(26)).toBe('AA');
    expect(punktNavn(27)).toBe('AB');
  });
});

describe('tegning', () => {
  it('første punkt bliver forsyning, de næste får navne B, C', () => {
    const d: Diagram = { knuder: [], straekninger: [] };
    const a = findEllerOpretKnude(d, { x: 0, y: 0 }, 5, 1);
    const b = findEllerOpretKnude(d, { x: 100, y: 0 }, 5, 1);
    tilfoejStraekning(d, a.id, b.id);
    expect(d.knuder[0].type).toBe('forsyning');
    expect(d.knuder[0].navn).toBe('A');
    expect(d.knuder[1].type).toBe('punkt');
    expect(d.knuder[1].navn).toBe('B');
  });

  it('klik midt på et rør laver et nyt punkt og deler røret', () => {
    const d: Diagram = { knuder: [], straekninger: [] };
    const a = findEllerOpretKnude(d, { x: 0, y: 0 }, 5, 0);
    const b = findEllerOpretKnude(d, { x: 100, y: 0 }, 5, 4);
    tilfoejStraekning(d, a.id, b.id);
    const c = findEllerOpretKnude(d, { x: 50, y: 2 }, 5, 0);
    expect(c.ny).toBe(false);
    expect(d.straekninger).toHaveLength(2);
    const nyt = d.knuder.find((k) => k.id === c.id)!;
    expect(nyt).toMatchObject({ x: 50, y: 0, kote: 2 });
  });
});

describe('knæk', () => {
  it('deling af strækning med knæk fordeler knækkene', () => {
    // A(0,0) ─ knæk(100,0) ─ knæk(100,100) ─ B(200,100)
    const d: Diagram = { knuder: [], straekninger: [] };
    const a = findEllerOpretKnude(d, { x: 0, y: 0 }, 5, 0);
    const b = findEllerOpretKnude(d, { x: 200, y: 100 }, 5, 0);
    tilfoejStraekning(d, a.id, b.id, [{ x: 100, y: 0 }, { x: 100, y: 100 }]);
    // Klik på det lodrette stykke
    const c = findEllerOpretKnude(d, { x: 102, y: 50 }, 5, 0);
    const foer = d.straekninger.find((s) => s.til === c.id)!;
    const efter = d.straekninger.find((s) => s.fra === c.id)!;
    expect(d.knuder.find((k) => k.id === c.id)).toMatchObject({ x: 100, y: 50 });
    expect(foer.knaek).toEqual([{ x: 100, y: 0 }]);
    expect(efter.knaek).toEqual([{ x: 100, y: 100 }]);
  });

  it('flytning af punkt justerer nærmeste knæk', () => {
    const d: Diagram = { knuder: [], straekninger: [] };
    const a = findEllerOpretKnude(d, { x: 0, y: 0 }, 5, 0);
    const b = findEllerOpretKnude(d, { x: 100, y: 100 }, 5, 0);
    tilfoejStraekning(d, a.id, b.id, [{ x: 100, y: 0 }]);
    const orig = structuredClone(d);
    const g = ortogonaleGrupper(d, a.id);
    flytKnuder(d, orig, g.vandret, g.lodret, 0, 30); // flyt A 30 ned
    expect(d.straekninger[0].knaek).toEqual([{ x: 100, y: 30 }]);
  });
});

describe('flyt markering', () => {
  const net = () => {
    const d: Diagram = { knuder: [], straekninger: [] };
    const a = findEllerOpretKnude(d, { x: 0, y: 0 }, 5, 0);
    const b = findEllerOpretKnude(d, { x: 100, y: 0 }, 5, 0);
    const c = findEllerOpretKnude(d, { x: 100, y: 100 }, 5, 0);
    tilfoejStraekning(d, a.id, b.id);
    tilfoejStraekning(d, b.id, c.id);
    return { d, a: a.id, b: b.id, c: c.id };
  };

  it('alt markeret flyttes samlet', () => {
    const { d, a, b, c } = net();
    const orig = structuredClone(d);
    flytMarkering(d, orig, [a, b, c], d.straekninger.map((s) => s.id), 50, 20);
    expect(d.knuder.map((k) => [k.x, k.y])).toEqual([[50, 20], [150, 20], [150, 120]]);
    expect(d.straekninger.every((s) => !s.knaek?.length)).toBe(true);
  });

  it('forbindelse til umarkeret punkt får et hjørne', () => {
    const { d, b, c } = net();
    const orig = structuredClone(d);
    // Flyt B og C 30 ned – A står stille, så A-B skal knække
    flytMarkering(d, orig, [b, c], [], 0, 30);
    const ab = d.straekninger[0];
    expect(ab.knaek).toEqual([{ x: 100, y: 0 }]);
  });
});

describe('ortogonal flytning', () => {
  it('L-form: A har vandret {F,A} og lodret {A,B}', () => {
    const d: Diagram = {
      knuder: [
        { id: 'F', navn: 'A', x: 0, y: 0, type: 'forsyning', kote: 0, qf: 0 },
        { id: 'A', navn: 'B', x: 100, y: 0, type: 'punkt', kote: 0, qf: 0 },
        { id: 'B', navn: 'C', x: 100, y: 100, type: 'punkt', kote: 0, qf: 0 },
      ],
      straekninger: [
        { id: '1', fra: 'F', til: 'A', laengde: null },
        { id: '2', fra: 'A', til: 'B', laengde: null },
      ],
    };
    const g = ortogonaleGrupper(d, 'A');
    expect([...g.vandret].sort()).toEqual(['A', 'F']);
    expect([...g.lodret].sort()).toEqual(['A', 'B']);
  });
});
