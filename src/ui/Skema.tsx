// Skema under tegningen – "stige": én række pr. punkt, og strækningen forskudt en halv række
// mellem de to punkter den forbinder. Punktrækker: navn, kote, qf og tryk.
// Strækningsrækker: alle beregninger (vandstrøm, rørtype, dimension, hastighed, tryktab).
// Rækkefølge: hovedløbet (største qd') fra forsyningen ud til sidste punkt, derefter afgreninger.
import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent, ReactNode } from 'react';
import { erValgt, useStore } from '../store';
import type { Diagram, Knude, Straekning } from '../model/types';
import { SYSTEM_NAVN } from '../model/types';
import { fmt } from '../model/geometri';
import { punktFlow, type DiagramResultat } from '../beregning/net';
import { TalFelt } from './Felt';

interface Loeb {
  /** Punkter i rækkefølge fra forsyningen og udad (n+1 stk) */
  punkter: Knude[];
  /** Strækninger mellem punkterne (n stk): straekninger[i] går fra punkter[i] til punkter[i+1] */
  straekninger: Straekning[];
  forbundet: boolean;
  /** Første punkt er en afgrening fra et tidligere løb */
  tilsluttet: boolean;
}

const ANTAL_S_KOLONNER = 11;

function byggLoeb(d: Diagram, res: DiagramResultat): Loeb[] {
  const km = new Map(d.knuder.map((k) => [k.id, k]));
  const sm = new Map(d.straekninger.map((s) => [s.id, s]));
  const forsyning = d.knuder.find((k) => k.type === 'forsyning');

  // Børn pr. punkt i strømningsretningen, største qd' først (= hovedløbet)
  const boern = new Map<string, { sid: string; fra: string; til: string }[]>();
  for (const [sid, r] of Object.entries(res.retning)) {
    if (!boern.has(r.fra)) boern.set(r.fra, []);
    boern.get(r.fra)!.push({ sid, ...r });
  }
  const stoerrelse = (sid: string) => res.straekninger[sid]?.qdMark ?? 0;
  for (const liste of boern.values()) liste.sort((a, b) => stoerrelse(b.sid) - stoerrelse(a.sid));

  const loeb: Loeb[] = [];
  const brugt = new Set<string>();
  if (forsyning) {
    const koe = [...(boern.get(forsyning.id) ?? [])];
    while (koe.length) {
      let k: (typeof koe)[number] | undefined = koe.shift()!;
      const start = km.get(k.fra);
      if (!start) continue;
      const L: Loeb = { punkter: [start], straekninger: [], forbundet: true, tilsluttet: start.id !== forsyning.id };
      while (k) {
        const s = sm.get(k.sid);
        const til = km.get(k.til);
        if (!s || !til) break;
        brugt.add(s.id);
        L.straekninger.push(s);
        L.punkter.push(til);
        const [hoved, ...rest] = boern.get(til.id) ?? [];
        koe.push(...rest);
        k = hoved;
      }
      loeb.push(L);
    }
  }
  // Strækninger der ikke er forbundet (rørstræk-fortsætter udelades)
  for (const s of d.straekninger) {
    if (brugt.has(s.id)) continue;
    const fra = km.get(s.fra);
    const til = km.get(s.til);
    if (!fra || !til || fra.fortsaetter || til.fortsaetter) continue;
    loeb.push({ punkter: [fra, til], straekninger: [s], forbundet: false, tilsluttet: false });
  }
  return loeb;
}

export function Skema({ res }: { res: DiagramResultat }) {
  const system = useStore((st) => st.system);
  const diagram = useStore((st) => st.projekt[st.system]);
  const f = useStore((st) => st.projekt.forudsaetninger);
  const valg = useStore((st) => st.valg);
  const setValg = useStore((st) => st.setValg);
  const aendr = useStore((st) => st.aendr);
  const [hoejde, setHoejde] = useState(260);
  const traek = useRef<{ y: number; h: number } | null>(null);

  const loeb = useMemo(() => byggLoeb(diagram, res), [diagram, res]);
  const antalStraekninger = loeb.reduce((a, L) => a + L.straekninger.length, 0);

  const opdS = (id: string, fn: (s: Straekning) => void) =>
    aendr((p) => {
      const x = p[system].straekninger.find((y) => y.id === id);
      if (x) fn(x);
    });
  const opdK = (id: string, fn: (k: Knude) => void) =>
    aendr((p) => {
      const x = p[system].knuder.find((y) => y.id === id);
      if (x) fn(x);
    });
  const vaelg = (type: 'knude' | 'straekning', id: string) => {
    useStore.getState().setNyStraekning(null); // panelet må ikke stjæle fokus fra skemaet
    setValg({ type, id });
  };

  const startTraek = (e: RPointerEvent<HTMLDivElement>) => {
    traek.current = { y: e.clientY, h: hoejde };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const flytTraek = (e: RPointerEvent<HTMLDivElement>) => {
    const t = traek.current;
    if (t) setHoejde(Math.max(80, Math.min(window.innerHeight - 200, t.h + (t.y - e.clientY))));
  };

  /** Tekst til Excel: én række pr. strækning (som i Brugsvand-arket) */
  const kopier = (): string => {
    const hoved = [
      'Løb', 'Fra-punkt', 'Til-punkt', 'Kote til [m]', 'qf i til-punkt [l/s]', 'Længde [m]', 'Σqf [l/s]',
      'qd [l/s]', 'Slangevinde', 'Tillæg [l/s]', "qd' [l/s]", 'Rør', 'di [mm]', 'v [m/s]', 'R [Pa/m]',
      'ΔP [kPa]', "p'x til-punkt [kPa]", 'px til-punkt [kPa]',
    ];
    const tal = (v: number | null | undefined, d = 2) => (v == null ? '' : fmt(v, d));
    const linjer: string[] = [];
    for (const L of loeb) {
      L.straekninger.forEach((s, i) => {
        const fra = L.punkter[i];
        const til = L.punkter[i + 1];
        const x = res.straekninger[s.id];
        const t = res.knuder[til.id];
        const sidst = i === L.straekninger.length - 1;
        linjer.push(
          [
            i === 0 ? (L.tilsluttet ? `Start (tilsl. ${fra.navn})` : 'Start') : sidst ? 'Stop' : '',
            fra.navn, til.navn, tal(til.kote), tal(punktFlow(til, system)), tal(s.laengde, 1), tal(x?.sumQf),
            tal(x?.qd, 3), x?.slangevinde ? 'Ja' : 'Nej', tal(x?.andre, 3), tal(x?.qdMark, 3), x?.label ?? '',
            tal(x?.dim?.di, 1), tal(x?.tab?.v), tal(x?.tab ? x.tab.R * 1000 : null, 0), tal(x?.tab?.dp), tal(t?.pBeregning, 1), tal(t?.px, 1),
          ].join('\t'),
        );
      });
    }
    return [hoved.join('\t'), ...linjer].join('\n');
  };

  /**
   * Stige til Excel: HTML-tabel hvor punkter og strækninger fylder to rækker (rowspan).
   * Excel laver dem om til flettede celler, så strækningen står mellem to punkter.
   */
  const kopierStige = () => {
    const e = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const tal = (v: number | null | undefined, d = 2) => (v == null ? '' : fmt(v, d));
    const td = (v: string, stil = '', span = 2, kol = 1) =>
      `<td rowspan="${span}" colspan="${kol}" style="vertical-align:middle;${stil}">${e(v)}</td>`;
    const PUNKT = 'background:#ffffff;';
    const INPUT = 'background:#e0f4f7;';
    const STRAEK = 'background:#f1f9fa;';
    const FED = 'font-weight:bold;';
    const ROED = 'color:#c00000;font-weight:bold;';
    const th = (v: string, kol = 1) =>
      `<th colspan="${kol}" style="background:#1f6f78;color:#ffffff;font-weight:bold;text-align:center">${e(v)}</th>`;

    let html =
      '<table border="1" style="border-collapse:collapse;font-family:Calibri,Arial;font-size:11pt">' +
      `<tr>${th('Punkt', 6)}${th('Strækning (mellem punkterne)', ANTAL_S_KOLONNER)}</tr>` +
      '<tr>' +
      ['Løb', 'Navn', 'Kote [m]', 'qf [l/s]', "p'x [kPa]", 'px [kPa]', 'Længde [m]', 'Σqf [l/s]', 'qd [l/s]',
        'Slangevinde', 'Tillæg [l/s]', "qd' [l/s]", 'Rør', 'di [mm]', 'v [m/s]', 'R [Pa/m]', 'ΔP [kPa]']
        .map((h) => th(h))
        .join('') +
      '</tr>';

    for (const L of loeb) {
      const n = L.straekninger.length;
      for (let r = 0; r <= 2 * n + 1; r++) {
        let celler = '';
        if (r % 2 === 0) {
          const i = r / 2;
          const k = L.punkter[i];
          const t = res.knuder[k.id];
          const flow = punktFlow(k, system);
          const lav = !!t && flow > 0 && t.px < f.tapstedTryk;
          const loebTekst = !L.forbundet ? '–' : i === 0 ? (L.tilsluttet ? 'Tilsl.' : 'Start') : i === n ? 'Stop' : '';
          celler +=
            td(loebTekst, PUNKT + 'text-align:center') +
            td(k.navn, PUNKT + FED) +
            td(tal(k.kote), INPUT) +
            td(tal(k.qf), INPUT) +
            td(t ? tal(t.pBeregning, 1) : '', PUNKT) +
            td(t ? tal(t.px, 1) : '', PUNKT + (lav ? ROED : ''));
        }
        if (r === 0 || r === 2 * n + 1) {
          celler += td('', 'border:none', 1, ANTAL_S_KOLONNER);
        } else if (r % 2 === 1) {
          const s = L.straekninger[(r - 1) / 2];
          const x = res.straekninger[s.id];
          const a = x?.advarsler ?? [];
          celler +=
            td(tal(s.laengde, 1), INPUT) +
            td(x ? tal(x.sumQf) : '', STRAEK + FED) +
            td(x ? tal(x.qd, 3) : '', STRAEK) +
            td(x ? (x.slangevinde ? 'Ja' : 'Nej') : '', STRAEK) +
            td(x && x.andre > 0 ? tal(x.andre, 3) : '', STRAEK) +
            td(x ? tal(x.qdMark, 3) : '', STRAEK + FED) +
            td(x?.dim && s.laengde != null ? x.label : '?', STRAEK + FED) +
            td(x?.dim ? tal(x.dim.di, 1) : '', STRAEK) +
            td(x?.tab ? tal(x.tab.v) : '', STRAEK + (a.includes('v_hoej') || a.includes('v_lav') ? ROED : '')) +
            td(x?.tab ? tal(x.tab.R * 1000, 0) : '', STRAEK + (a.includes('R_hoej') ? ROED : '')) +
            td(x?.tab ? tal(x.tab.dp) : '', STRAEK);
        }
        html += `<tr style="height:10pt">${celler}</tr>`;
      }
    }
    html += '</table>';

    const data = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([kopier()], { type: 'text/plain' }),
    });
    navigator.clipboard
      .write([data])
      .then(() => alert('Kopieret – indsæt i Excel med Ctrl+V.'))
      .catch(() => alert('Kunne ikke kopiere til udklipsholderen.'));
  };

  /** Celler for et punkt (fylder to halve rækker) */
  const punktCeller = (L: Loeb, i: number): ReactNode => {
    const k = L.punkter[i];
    const t = res.knuder[k.id];
    const flow = punktFlow(k, system);
    const lavtTryk = !!t && flow > 0 && t.px < f.tapstedTryk;
    const gentaget = i === 0 && L.tilsluttet; // afgreningspunktet står også i et tidligere løb
    const loebTekst = !L.forbundet
      ? '–'
      : i === 0
        ? L.tilsluttet
          ? 'Tilsl.'
          : 'Start'
        : i === L.punkter.length - 1
          ? 'Stop'
          : '';
    const kl = (ekstra = '') =>
      ['p', ekstra, erValgt(valg, 'knude', k.id) ? 'valgt' : '', gentaget ? 'gentaget' : ''].join(' ');
    const klik = () => vaelg('knude', k.id);
    return (
      <>
        <td rowSpan={2} className={kl('loeb')} onClick={klik}>
          {loebTekst}
        </td>
        <td rowSpan={2} className={kl('navn')} onClick={klik} title={k.navn}>
          {k.navn}
        </td>
        <td rowSpan={2} className={kl('input')} onClick={klik}>
          <TalFelt vaerdi={k.kote} onGem={(n) => n != null && opdK(k.id, (x) => void (x.kote = n))} />
        </td>
        <td rowSpan={2} className={kl('input')} onClick={klik}>
          <TalFelt vaerdi={k.qf} onGem={(n) => opdK(k.id, (x) => void (x.qf = Math.max(0, n ?? 0)))} />
        </td>
        <td rowSpan={2} className={kl()} onClick={klik}>
          {t ? fmt(t.pBeregning, 1) : ''}
        </td>
        <td rowSpan={2} className={kl(lavtTryk ? 'fejl' : '')} onClick={klik}>
          {t ? fmt(t.px, 1) : ''}
        </td>
      </>
    );
  };

  /** Celler for en strækning (fylder to halve rækker, forskudt mellem to punkter) */
  const straekningCeller = (s: Straekning): ReactNode => {
    const x = res.straekninger[s.id];
    const a = x?.advarsler ?? [];
    const kl = (ekstra = '') => ['s', ekstra, erValgt(valg, 'straekning', s.id) ? 'valgt' : ''].join(' ');
    const klik = () => vaelg('straekning', s.id);
    const c = (indhold: ReactNode, ekstra = '') => (
      <td rowSpan={2} className={kl(ekstra)} onClick={klik}>
        {indhold}
      </td>
    );
    return (
      <>
        <td rowSpan={2} className={kl('input skel' + (s.laengde == null ? ' mangler' : ''))} onClick={klik}>
          <TalFelt
            vaerdi={s.laengde}
            decimaler={1}
            placeholder="?"
            onGem={(n) => opdS(s.id, (y) => void (y.laengde = n))}
          />
        </td>
        {c(x ? fmt(x.sumQf) : '', 'beregnet')}
        {c(x ? fmt(x.qd, 2) : '')}
        {c(x ? (x.slangevinde ? 'Ja' : 'Nej') : '')}
        {c(x && x.andre > 0 ? fmt(x.andre, 2) : '')}
        {c(x ? fmt(x.qdMark, 2) : '', 'beregnet')}
        {c(x?.dim && s.laengde != null ? x.label : '?', 'beregnet')}
        {c(x?.dim ? fmt(x.dim.di, 1) : '')}
        {c(x?.tab ? fmt(x.tab.v) : '', a.includes('v_hoej') || a.includes('v_lav') ? 'fejl' : '')}
        {c(x?.tab ? fmt(x.tab.R * 1000, 0) : '', a.includes('R_hoej') ? 'fejl' : '')}
        {c(x?.tab ? fmt(x.tab.dp) : '')}
      </>
    );
  };

  /** Halve rækker for ét løb: punkt i på række 2i–2i+1, strækning i på 2i+1–2i+2 */
  const loebRaekker = (L: Loeb, li: number) => {
    const n = L.straekninger.length;
    const rk: ReactNode[] = [];
    for (let r = 0; r <= 2 * n + 1; r++) {
      const punkt = r % 2 === 0 ? punktCeller(L, r / 2) : null;
      let s: ReactNode = null;
      if (r === 0 || r === 2 * n + 1) s = <td colSpan={ANTAL_S_KOLONNER} className="s-tom skel" />;
      else if (r % 2 === 1) s = straekningCeller(L.straekninger[(r - 1) / 2]);
      rk.push(
        <tr key={`${li}-${r}`} className={'halv' + (r === 0 ? ' loeb-start' : '') + (!L.forbundet ? ' ikke-forbundet' : '')}>
          {punkt}
          {s}
        </tr>,
      );
    }
    return rk;
  };

  return (
    <section className="skema" style={{ height: hoejde }}>
      <div
        className="skema-greb"
        onPointerDown={startTraek}
        onPointerMove={flytTraek}
        onPointerUp={() => (traek.current = null)}
        title="Træk for at ændre højden"
      />
      <div className="skema-top">
        <strong>Skema – {SYSTEM_NAVN[system]}</strong>
        <span className="hint">{antalStraekninger} strækninger · lyseblå felter kan rettes</span>
        <button
          className="hoejre"
          onClick={kopierStige}
          title="Indsæt i Excel med Ctrl+V – punkter og strækninger bliver flettede celler som i skemaet"
        >
          Kopiér til Excel
        </button>
      </div>
      <div className="skema-rul">
        <table>
          <thead>
            <tr className="grupper">
              <th colSpan={6}>Punkt</th>
              <th colSpan={ANTAL_S_KOLONNER} className="skel">
                Strækning (mellem punkterne)
              </th>
            </tr>
            <tr className="kolonner">
              <th>Løb</th>
              <th className="venstre">Navn</th>
              <th className="input">Kote [m]</th>
              <th className="input" title="Vandmængde der tappes i punktet">qf [l/s]</th>
              <th>p'x [kPa]</th>
              <th>px [kPa]</th>
              <th className="input skel">Længde [m]</th>
              <th className="beregnet">Σqf [l/s]</th>
              <th>qd [l/s]</th>
              <th>Slangev.</th>
              <th>Tillæg [l/s]</th>
              <th className="beregnet">qd' [l/s]</th>
              <th className="beregnet">Rør</th>
              <th>di [mm]</th>
              <th>v [m/s]</th>
              <th>R [Pa/m]</th>
              <th>ΔP [kPa]</th>
            </tr>
          </thead>
          <tbody>
            {loeb.length === 0 ? (
              <tr>
                <td colSpan={6 + ANTAL_S_KOLONNER} className="tom">
                  Ingen strækninger endnu – tegn på lærredet, så fyldes skemaet ud.
                </td>
              </tr>
            ) : (
              loeb.flatMap(loebRaekker)
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
