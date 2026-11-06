// Kontrol mod det gennemregnede eksempel i Brugsvand-arket (afsnit 6).
import { describe, it, expect } from 'vitest';
import { beregnTab, nu, qdFraSum, qdMark, qSkyl, rho } from './hydraulik';

const NU_K = nu(10);
const RHO_K = rho(10);
const tab = (q: number, diMm: number, k: number, L: number) =>
  beregnTab({ q, di: diMm / 1000, k, L, nu: NU_K, rho: RHO_K, tillaeg: 25 });

describe('vandets egenskaber', () => {
  it('10 °C', () => {
    expect(rho(10)).toBeCloseTo(999.716, 3);
    expect(nu(10) * 1e6).toBeCloseTo(1.29973, 4);
  });
  it('55 °C', () => {
    expect(rho(55)).toBeCloseTo(985.689, 2);
    expect(nu(55) * 1e7).toBeCloseTo(5.0995, 3);
  });
});

describe('vandstrømme', () => {
  it('qd(22) = 0,80637', () => expect(qdFraSum(22)).toBeCloseTo(0.80637, 5));
  it('qd(3,6) = 0,353', () => expect(qdFraSum(3.6)).toBeCloseTo(0.353, 3));
  it('qd(0,1) = 0,1', () => expect(qdFraSum(0.1)).toBeCloseTo(0.1, 6));
  it('qd(0) = 0', () => expect(qdFraSum(0)).toBe(0));
  it("slangevinde: qd' = 0,33 + (qd − 0,2)", () => expect(qdMark(0.80637, 0, true)).toBeCloseTo(0.93637, 5));
  it('skylleventiler', () => {
    expect(qSkyl(0)).toBe(0);
    expect(qSkyl(1)).toBeCloseTo(0.4);
    expect(qSkyl(3)).toBeCloseTo(0.6);
  });
});

describe('strækning A-B (peh 50, L 50 m) – detaljeret', () => {
  const t = tab(0.93637, 40.8, 0.00001, 50);
  it('v', () => expect(t.v).toBeCloseTo(0.7162, 4));
  it('Re', () => expect(t.Re).toBeCloseTo(22483, -1));
  it('λ', () => expect(t.lambda).toBeCloseTo(0.025705, 5));
  it('R', () => expect(t.R).toBeCloseTo(0.16154, 4));
  it('ΔP inkl. 25 % tillæg', () => expect(t.dp).toBeCloseTo(10.096, 2));
  it("px = p'xe − ΔP − 9,81·(H − Zf)", () => {
    const pBeregning = 212 - t.dp;
    expect(pBeregning - 9.81 * (-1.2 - 1)).toBeCloseTo(223.49, 1);
  });
});

describe('øvrige rækker fra eksemplet', () => {
  it('B-C rs 35, L 10', () => {
    const t = tab(0.93637, 32, 0.00015, 10);
    expect(t.v).toBeCloseTo(1.16, 2);
    expect(t.dp).toBeCloseTo(8.82, 1);
  });
  it('J-K rs 22, L 21 → R 1,36 (over grænsen)', () => {
    const t = tab(qdFraSum(3.6), 19.6, 0.00015, 21);
    expect(t.R).toBeCloseTo(1.36, 2);
    expect(t.dp).toBeCloseTo(35.72, 1);
  });
  it('M-N px 15, L 10', () => {
    const t = tab(qdFraSum(0.1), 10, 0.00001, 10);
    expect(t.R).toBeCloseTo(2.64, 2);
    expect(t.dp).toBeCloseTo(33.06, 1);
  });
});
