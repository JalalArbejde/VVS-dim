import { describe, it, expect } from 'vitest';
import { beregnDiagram, punktFlow } from './net';
import type { Diagram, Knude, Straekning } from '../model/types';
import { standardForudsaetninger } from '../model/standard';

const k = (id: string, kote: number, qf = 0, ekstra: Partial<Knude> = {}): Knude => ({
  id, navn: id, x: 0, y: 0, type: 'punkt', kote, qf, ...ekstra,
});
const forsyning = (id: string, kote = 1) => k(id, kote, 0, { type: 'forsyning' });
const s = (id: string, fra: string, til: string, ekstra: Partial<Straekning> = {}): Straekning => ({
  id, fra, til, laengde: null, ...ekstra,
});
const beregn = (d: Diagram, f = standardForudsaetninger()) => beregnDiagram(d, 'BK', f);

describe('punktFlow', () => {
  it('indtastet qf', () => expect(punktFlow(k('A', 0, 0.35), 'BK')).toBeCloseTo(0.35));
  it('tapsteder HV 6, WC 4 → BK 1,0 / BV 0,6', () => {
    const p = k('A', 0, 0, { tapsteder: [{ kode: 'HV', antal: 6 }, { kode: 'WC', antal: 4 }] });
    expect(punktFlow(p, 'BK')).toBeCloseTo(1.0);
    expect(punktFlow(p, 'BV')).toBeCloseTo(0.6);
  });
  it('qf + tapsteder lægges sammen', () => {
    const p = k('A', 0, 0.2, { tapsteder: [{ kode: 'HV', antal: 1 }] });
    expect(punktFlow(p, 'BK')).toBeCloseTo(0.3);
  });
});

describe('forgrenet net', () => {
  // F ── A ── T1
  //      │
  //      T2
  const net = (): Diagram => ({
    knuder: [forsyning('F'), k('A', 1), k('T1', 1, 1.0), k('T2', 1, 0.4)],
    straekninger: [s('FA', 'F', 'A'), s('AT1', 'A', 'T1'), s('AT2', 'T2', 'A')],
  });

  it('Σqf summeres mod forsyningen', () => {
    const r = beregn(net());
    expect(r.straekninger.FA.sumQf).toBeCloseTo(1.4);
    expect(r.straekninger.AT1.sumQf).toBeCloseTo(1.0);
    expect(r.straekninger.AT2.sumQf).toBeCloseTo(0.4);
  });

  it('slangevinde påvirker kun strækninger opstrøms', () => {
    const d = net();
    d.knuder[3].slangevinde = true;
    const r = beregn(d);
    expect(r.straekninger.AT1.qdMark).toBeCloseTo(r.straekninger.AT1.qd);
    expect(r.straekninger.AT2.qdMark).toBeCloseTo(0.33 + (r.straekninger.AT2.qd - 0.2));
    expect(r.straekninger.FA.qdMark).toBeCloseTo(0.33 + (r.straekninger.FA.qd - 0.2));
  });

  it('advarer om ring', () => {
    const d = net();
    d.straekninger.push(s('FT2', 'F', 'T2'));
    expect(beregn(d).advarsler.some((a) => a.includes('Ring'))).toBe(true);
  });

  it('advarer når forsyning mangler', () => {
    const d = net();
    d.knuder[0].type = 'punkt';
    expect(beregn(d).advarsler[0]).toMatch(/forsyningspunkt/);
  });
});

describe('rørstræk fortsætter', () => {
  it('indgår ikke i beregning eller advarsler', () => {
    const d: Diagram = {
      knuder: [forsyning('F'), k('A', 1, 1.0), k('X', 1, 0, { fortsaetter: true, navn: '' })],
      straekninger: [s('FA', 'F', 'A', { laengde: 10 }), s('AX', 'A', 'X')],
    };
    const r = beregn(d);
    expect(r.straekninger.AX).toBeUndefined();
    expect(r.straekninger.FA.sumQf).toBeCloseTo(1.0);
    expect(r.advarsler).toEqual([]);
  });
});

describe('linje J-K-L-M-N fra Excel-eksemplet (låste dimensioner)', () => {
  const d: Diagram = {
    knuder: [forsyning('J', 1), k('K', 3, 1.6), k('L', 7.5, 1.0), k('M', 11.5, 0.9), k('N', 10, 0.1)],
    straekninger: [
      s('JK', 'J', 'K', { laengde: 21, laast: '22' }),
      s('KL', 'K', 'L', { laengde: 4, laast: '22' }),
      s('LM', 'L', 'M', { laengde: 1, laast: '18' }),
      s('MN', 'M', 'N', { laengde: 10, roertype: 'px', laast: '15' }),
    ],
  };
  const r = beregn(d);

  it('ΔP pr. strækning svarer til Excel', () => {
    expect(r.straekninger.JK.tab!.dp).toBeCloseTo(35.72, 1);
    expect(r.straekninger.KL.tab!.dp).toBeCloseTo(4.71, 1);
    expect(r.straekninger.LM.tab!.dp).toBeCloseTo(2.34, 1);
    expect(r.straekninger.MN.tab!.dp).toBeCloseTo(33.06, 1);
  });
  it("p'x ved N = 212 − ΣΔP", () => expect(r.knuder.N.pBeregning).toBeCloseTo(212 - 75.83, 0));
  it('labels', () => {
    expect(r.straekninger.JK.label).toBe('22x1,2 RS');
    expect(r.straekninger.MN.label).toBe('15x2,5 PEX');
  });
  it('R-advarsel på J-K', () => expect(r.straekninger.JK.advarsler).toContain('R_hoej'));
  it('farligste punkt er N (lavest px – som i Excel-tabellen)', () => {
    expect(r.opsummering!.kritiskKnude).toBe('N');
  });
});

describe('automatisk dimensionering', () => {
  it('Σqf 3,6 i RS → 28x1,2 (22 giver R > 1 kPa/m)', () => {
    const r = beregn({ knuder: [forsyning('F'), k('T', 1, 3.6)], straekninger: [s('FT', 'F', 'T', { laengde: 5 })] });
    expect(r.straekninger.FT.label).toBe('28x1,2 RS');
  });

  it('øger dimensionen når trykket i punktet er for lavt', () => {
    const d: Diagram = { knuder: [forsyning('F'), k('T', 1, 1.0)], straekninger: [s('FT', 'F', 'T', { laengde: 200 })] };
    const r = beregn(d);
    expect(r.straekninger.FT.label).toBe('28x1,2 RS');
    expect(r.opsummering!.opdimensioneret).toBe(1);
    expect(r.knuder.T.px).toBeGreaterThanOrEqual(150);

    const f = standardForudsaetninger();
    f.autoTryk = false;
    const r2 = beregn(d, f);
    expect(r2.straekninger.FT.label).toBe('22x1,2 RS');
    expect(r2.opsummering!.behovBoost).toBeGreaterThan(0);
  });

  it('højden alene giver for lidt tryk → trykforøgning, ingen opdimensionering', () => {
    const r = beregn({ knuder: [forsyning('F'), k('T', 30, 0.2)], straekninger: [s('FT', 'F', 'T', { laengde: 10 })] });
    expect(r.opsummering!.hoejdeBegraenset).toBe(true);
    expect(r.opsummering!.opdimensioneret).toBe(0);
    expect(r.opsummering!.behovBoost).toBeGreaterThan(0);
  });
});
