// Skema under tegningen – overblik over alle strækninger som i Excel-arket.
// Rækkefølge: hovedløbet (største Σqf) fra forsyningen ud til sidste tapsted, derefter afgreninger som egne løb.
import { useMemo, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { erValgt, useStore } from '../store';
import type { Diagram, Knude, Straekning } from '../model/types';
import { SYSTEM_NAVN } from '../model/types';
import { fmt } from '../model/geometri';
import { punktFlow, type DiagramResultat } from '../beregning/net';
import { TalFelt } from './Felt';

interface Raekke {
  s: Straekning;
  fra: Knude;
  til: Knude;
  loeb: number;
  start: boolean;
  stop: boolean;
  /** Afgrening: navnet på punktet løbet er tilsluttet */
  tilslutning?: string;
  forbundet: boolean;
}

function byggRaekker(d: Diagram, res: DiagramResultat): Raekke[] {
  const km = new Map(d.knuder.map((k) => [k.id, k]));
  const sm = new Map(d.straekninger.map((s) => [s.id, s]));
  const forsyning = d.knuder.find((k) => k.type === 'forsyning');

  // Børn pr. punkt i strømningsretningen, største Σqf først (= hovedløbet)
  const boern = new Map<string, { sid: string; fra: string; til: string }[]>();
  for (const [sid, r] of Object.entries(res.retning)) {
    if (!boern.has(r.fra)) boern.set(r.fra, []);
    boern.get(r.fra)!.push({ sid, ...r });
  }
  const stoerrelse = (sid: string) => res.straekninger[sid]?.qdMark ?? 0;
  for (const liste of boern.values()) liste.sort((a, b) => stoerrelse(b.sid) - stoerrelse(a.sid));

  const raekker: Raekke[] = [];
  const brugt = new Set<string>();
  if (forsyning) {
    const koe = [...(boern.get(forsyning.id) ?? [])];
    let loeb = 0;
    while (koe.length) {
      let k: (typeof koe)[number] | undefined = koe.shift()!;
      loeb++;
      let foerste = true;
      while (k) {
        const s = sm.get(k.sid);
        const fra = km.get(k.fra);
        const til = km.get(k.til);
        if (!s || !fra || !til) break;
        brugt.add(s.id);
        raekker.push({
          s, fra, til, loeb, start: foerste, stop: false, forbundet: true,
          tilslutning: foerste && fra.id !== forsyning.id ? fra.navn : undefined,
        });
        foerste = false;
        const [hoved, ...rest] = boern.get(til.id) ?? [];
        koe.push(...rest);
        if (!hoved) raekker[raekker.length - 1].stop = true;
        k = hoved;
      }
    }
  }
  // Strækninger der ikke er forbundet (rørstræk-fortsætter udelades)
  for (const s of d.straekninger) {
    if (brugt.has(s.id)) continue;
    const fra = km.get(s.fra);
    const til = km.get(s.til);
    if (!fra || !til || fra.fortsaetter || til.fortsaetter) continue;
    raekker.push({ s, fra, til, loeb: 0, start: false, stop: false, forbundet: false });
  }
  return raekker;
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

  const raekker = useMemo(() => byggRaekker(diagram, res), [diagram, res]);

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

  const startTraek = (e: RPointerEvent<HTMLDivElement>) => {
    traek.current = { y: e.clientY, h: hoejde };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const flytTraek = (e: RPointerEvent<HTMLDivElement>) => {
    const t = traek.current;
    if (t) setHoejde(Math.max(80, Math.min(window.innerHeight - 200, t.h + (t.y - e.clientY))));
  };

  const kopier = () => {
    const hoved = [
      'Løb', 'Fra', 'Til', 'Strækning', 'Tilslutning', 'Kote [m]', 'Længde [m]', 'qf [l/s]', 'Σqf [l/s]',
      'qd [l/s]', 'Slangevinde', 'Tillæg [l/s]', "qd' [l/s]", 'Rør', 'di [mm]', 'v [m/s]', 'R [kPa/m]',
      'ΔP [kPa]', "p'x [kPa]", 'px [kPa]',
    ];
    const tal = (v: number | null | undefined, d = 2) => (v == null ? '' : fmt(v, d));
    const linjer = raekker.map((r) => {
      const x = res.straekninger[r.s.id];
      const t = res.knuder[r.til.id];
      return [
        r.start ? 'Start' : r.stop ? 'Stop' : '', r.fra.navn, r.til.navn, `${r.fra.navn}-${r.til.navn}`,
        r.tilslutning ?? '', tal(r.til.kote), tal(r.s.laengde, 1), tal(punktFlow(r.til, system)), tal(x?.sumQf),
        tal(x?.qd, 3), x?.slangevinde ? 'Ja' : 'Nej', tal(x?.andre, 3), tal(x?.qdMark, 3), x?.label ?? '',
        tal(x?.dim?.di, 1), tal(x?.tab?.v), tal(x?.tab?.R, 3), tal(x?.tab?.dp), tal(t?.pBeregning, 1), tal(t?.px, 1),
      ].join('\t');
    });
    navigator.clipboard
      .writeText([hoved.join('\t'), ...linjer].join('\n'))
      .then(() => alert('Skemaet er kopieret – indsæt i Excel med Ctrl+V.'))
      .catch(() => alert('Kunne ikke kopiere til udklipsholderen.'));
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
        <span className="hint">{raekker.length} strækninger · lyseblå felter kan rettes</span>
        <button className="hoejre" onClick={kopier}>
          Kopiér til Excel
        </button>
      </div>
      <div className="skema-rul">
        <table>
          <thead>
            <tr>
              <th>Løb</th>
              <th>Fra</th>
              <th>Til</th>
              <th className="venstre">Strækning</th>
              <th>Tilsl.</th>
              <th className="input">Kote [m]</th>
              <th className="input">Længde [m]</th>
              <th className="input">qf [l/s]</th>
              <th className="beregnet">Σqf [l/s]</th>
              <th>qd [l/s]</th>
              <th>Slangev.</th>
              <th>Tillæg [l/s]</th>
              <th className="beregnet">qd' [l/s]</th>
              <th className="beregnet">Rør</th>
              <th>di [mm]</th>
              <th>v [m/s]</th>
              <th>R [kPa/m]</th>
              <th>ΔP [kPa]</th>
              <th>p'x [kPa]</th>
              <th>px [kPa]</th>
            </tr>
          </thead>
          <tbody>
            {raekker.length === 0 && (
              <tr>
                <td colSpan={20} className="tom">
                  Ingen strækninger endnu – tegn på lærredet, så fyldes skemaet ud.
                </td>
              </tr>
            )}
            {raekker.map((r) => {
              const x = res.straekninger[r.s.id];
              const t = res.knuder[r.til.id];
              const a = x?.advarsler ?? [];
              const flow = punktFlow(r.til, system);
              const lavtTryk = !!t && flow > 0 && t.px < f.tapstedTryk;
              const klasser = [
                erValgt(valg, 'straekning', r.s.id) ? 'valgt' : '',
                r.start ? 'loeb-start' : '',
                !r.forbundet ? 'ikke-forbundet' : '',
              ].join(' ');
              return (
                <tr
                  key={r.s.id}
                  className={klasser}
                  onClick={() => {
                    useStore.getState().setNyStraekning(null); // panelet må ikke stjæle fokus fra skemaet
                    setValg({ type: 'straekning', id: r.s.id });
                  }}
                >
                  <td>{!r.forbundet ? '–' : r.start ? 'Start' : r.stop ? 'Stop' : ''}</td>
                  <td>{r.fra.navn}</td>
                  <td>{r.til.navn}</td>
                  <td className="venstre">
                    {r.fra.navn}-{r.til.navn}
                  </td>
                  <td>{r.tilslutning ?? ''}</td>
                  <td className="input">
                    <TalFelt vaerdi={r.til.kote} onGem={(n) => n != null && opdK(r.til.id, (k) => void (k.kote = n))} />
                  </td>
                  <td className={'input' + (r.s.laengde == null ? ' mangler' : '')}>
                    <TalFelt
                      vaerdi={r.s.laengde}
                      decimaler={1}
                      placeholder="?"
                      onGem={(n) => opdS(r.s.id, (s) => void (s.laengde = n))}
                    />
                  </td>
                  <td className="input">
                    <TalFelt vaerdi={r.til.qf} onGem={(n) => opdK(r.til.id, (k) => void (k.qf = Math.max(0, n ?? 0)))} />
                  </td>
                  <td className="beregnet">{x ? fmt(x.sumQf) : ''}</td>
                  <td>{x ? fmt(x.qd, 2) : ''}</td>
                  <td>{x ? (x.slangevinde ? 'Ja' : 'Nej') : ''}</td>
                  <td>{x && x.andre > 0 ? fmt(x.andre, 2) : ''}</td>
                  <td className="beregnet">{x ? fmt(x.qdMark, 2) : ''}</td>
                  <td className="beregnet">{x?.dim && r.s.laengde != null ? x.label : '?'}</td>
                  <td>{x?.dim ? fmt(x.dim.di, 1) : ''}</td>
                  <td className={a.includes('v_hoej') || a.includes('v_lav') ? 'fejl' : ''}>
                    {x?.tab ? fmt(x.tab.v) : ''}
                  </td>
                  <td className={a.includes('R_hoej') ? 'fejl' : ''}>{x?.tab ? fmt(x.tab.R, 2) : ''}</td>
                  <td>{x?.tab ? fmt(x.tab.dp) : ''}</td>
                  <td>{t ? fmt(t.pBeregning, 1) : ''}</td>
                  <td className={lavtTryk ? 'fejl' : ''}>{t ? fmt(t.px, 1) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
