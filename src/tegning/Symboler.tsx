import type { Knude, Punkt, Straekning, Tappesystem } from '../model/types';
import { fmt, fmtKote } from '../model/geometri';
import type { KnudeTryk, SysResultat } from '../beregning/net';

/** 1 tegneenhed = 1 pt = 0,3528 mm (se tegning/ark.ts) */
const mm = (v: number) => v / 0.3528;

/**
 * Linjestil pr. system (tegnestandard).
 * BK: RGB 000-000-129, linjetykkelse 4 (= 0,40 mm), Long dash dot.
 */
export const LINJE: Record<Tappesystem, { farve: string; bredde: number; streg?: string }> = {
  BK: { farve: 'rgb(0, 0, 129)', bredde: mm(0.4), streg: `${mm(6)} ${mm(1)} ${mm(0.4)} ${mm(1)}` },
  BV: { farve: '#dc2626', bredde: 1.6 },
};
export const FARVE: Record<Tappesystem, string> = { BK: LINJE.BK.farve, BV: LINJE.BV.farve };

export function RoerTegning({
  s,
  navn,
  pts,
  stil,
  valgt,
  res,
  visDetaljer,
  visuel = false,
  visNavn = true,
}: {
  /** Vis strækningsnavn og længde */
  visNavn?: boolean;
  s: Straekning;
  navn: string;
  pts: Punkt[];
  stil: { farve: string; bredde: number; streg?: string };
  valgt: boolean;
  /** Kun visning (rørstræk fortsætter) – ingen tekst */
  visuel?: boolean;
  res?: SysResultat;
  visDetaljer: boolean;
}) {
  // Teksten placeres ved det længste stykke af strækningen
  let i0 = 0;
  let l = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const li = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    if (li > l) {
      l = li;
      i0 = i;
    }
  }
  const a = pts[i0];
  const b = pts[i0 + 1];
  const lodret = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const linje = pts.map((p) => `${p.x},${p.y}`).join(' ');

  // Dimensionen vises kun når der er nok input: forbindelse til forsyning, vandstrøm og længde
  const kendt = !!res?.dim && !!res.tab && s.laengde != null;
  const dimTekst = kendt ? res!.label + (res!.advarsler.length ? ' (!)' : '') : '?';
  const dimAdvarsel = !kendt || res!.advarsler.length > 0;

  // Lodrette strækninger: teksten drejes, så den læses nedefra og op
  const transform = lodret ? `translate(${mx} ${my}) rotate(-90)` : `translate(${mx} ${my})`;

  return (
    <g className="roer">
      {/* Bred usynlig linje: orange markering når musen er over strækningen */}
      <polyline points={linje} className="roer-hover" />
      <polyline
        points={linje}
        fill="none"
        stroke={stil.farve}
        strokeWidth={valgt ? stil.bredde * 2 : stil.bredde}
        strokeDasharray={stil.streg}
        strokeLinejoin="round"
      />
      {l > 0 && !visuel && (
        <g transform={transform}>
          {/* Dimension på den ene side af røret … */}
          <text y={-3} textAnchor="middle" className={'roer-dim' + (dimAdvarsel ? ' advarsel' : '')}>
            {dimTekst}
          </text>
          {/* … længden på den modsatte side (strækningsnavnet ses i skemaet, panelet og ved mus-over) */}
          {visNavn && (
          <text y={8} textAnchor="middle" className="roer-navn">
            <title>{navn}</title>
            {s.laengde != null ? `${fmt(s.laengde, 1)}m` : <tspan className="advarsel">?m</tspan>}
          </text>
          )}
          {/* Detaljer under længden */}
          {visDetaljer && res?.tab && (
            <text y={visNavn ? 17.5 : 8} textAnchor="middle" className="roer-detalje">
              qd' {fmt(res.qdMark)} l/s · v {fmt(res.tab.v)} m/s
            </text>
          )}
        </g>
      )}
    </g>
  );
}

export function PunktTegning({
  k,
  valgt,
  flow,
  tryk,
  fp,
  krav,
  visDetaljer,
  vinkel = 0,
}: {
  k: Knude;
  valgt: boolean;
  flow: number;
  tryk?: KnudeTryk;
  fp: boolean;
  krav: number;
  visDetaljer: boolean;
  /** Rørets retning ind i punktet [grader] – bruges til S-symbolet */
  vinkel?: number;
}) {
  if (k.fortsaetter) {
    // To halvcirkler (S) på tværs af røret: "rørstræk fortsætter"
    return (
      <g transform={`translate(${k.x} ${k.y}) rotate(${vinkel + 90})`}>
        <circle r={9} className="fortsaetter-hit" />
        <path d="M -8 0 A 4 4 0 0 1 0 0 A 4 4 0 0 0 8 0" className={'fortsaetter' + (valgt ? ' valgt' : '')} />
      </g>
    );
  }
  const info: { t: string; advarsel?: boolean }[] = [];
  // Ved punktet vises kun vandmængden – tryk står i panelet og skemaet
  if (flow > 0) info.push({ t: `q ${fmt(flow)} l/s` });

  return (
    <g>
      {k.type === 'forsyning' ? (
        <rect x={k.x - 6} y={k.y - 6} width={12} height={12} className={'forsyning' + (valgt ? ' valgt' : '')} />
      ) : (
        <circle cx={k.x} cy={k.y} r={valgt ? 4.5 : 3.5} className={'punkt' + (valgt ? ' valgt' : '')} />
      )}
      <text x={k.x + 6} y={k.y - 6} className="punkt-navn">
        {k.navn}
        <tspan className="punkt-kote"> {fmtKote(k.kote)}</tspan>
      </text>
      {info.map((x, i) => (
        <text key={i} x={k.x + 6} y={k.y + 12 + i * 10} className={'punkt-info' + (x.advarsel ? ' advarsel' : '')}>
          {x.t}
        </text>
      ))}
    </g>
  );
}
