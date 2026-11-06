// Tegnefladen.
// Tegn: dobbeltklik = punkt · enkeltklik/højreklik = knæk · klik på eksisterende punkt = forbind · Esc = stop
// Vælg: klik vælger, træk flytter punkt, træk på tomt lærred markerer område
// Panorér: hold scrollhjulet nede · Zoom: scroll
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as RPointerEvent } from 'react';
import { ARK_MM, erValgt, useStore } from '../store';
import type { Diagram, Knude, Punkt } from '../model/types';
import { ortogonal, snapPunkt } from '../model/geometri';
import {
  findEllerOpretKnude,
  findKnude,
  findStraekning,
  flytKnuder,
  flytMarkering,
  ortogonaleGrupper,
  tilfoejStraekning,
} from '../model/operationer';
import { punktFlow, type DiagramResultat } from '../beregning/net';
import { FARVE, PunktTegning, RoerTegning } from './Symboler';

/**
 * Arkrammer (liggende) i tegneenheder. 1 enhed = 1 typografisk punkt (1/72"),
 * så A3-rammen bliver 420 × 297 mm ved print, og 7 px tekst ≈ 2,5 mm.
 * Alle ark har samme nulpunkt: nederste højre hjørne (hvor tegningshovedet sidder).
 */
const mmTilEnhed = (mm: number) => (mm / 25.4) * 72;
const NULPUNKT = { x: -60 + mmTilEnhed(420), y: -60 + mmTilEnhed(297) };

type Traek =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number }
  | { type: 'omraade'; start: Punkt }
  | { type: 'knude'; start: Punkt; vandret: Set<string>; lodret: Set<string>; orig: Diagram; flyttet: boolean }
  | { type: 'markering'; start: Punkt; knuder: string[]; straekninger: string[]; orig: Diagram; flyttet: boolean };

export function Laerred({ res }: { res: DiagramResultat }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ x: 120, y: 80, zoom: 1 });
  const traek = useRef<Traek | null>(null);
  const [omraade, setOmraade] = useState<{ a: Punkt; b: Punkt } | null>(null);
  const sidsteKlik = useRef<{ t: number; x: number; y: number } | null>(null);

  /** Dobbeltklik: to venstreklik inden for 400 ms og 6 px (PointerEvent.detail er altid 0) */
  const erDobbeltklik = (e: RPointerEvent<SVGSVGElement>) => {
    const nu = performance.now();
    const f = sidsteKlik.current;
    const dobbelt = !!f && nu - f.t < 400 && Math.hypot(e.clientX - f.x, e.clientY - f.y) < 6;
    sidsteKlik.current = dobbelt ? null : { t: nu, x: e.clientX, y: e.clientY };
    return dobbelt;
  };

  const system = useStore((s) => s.system);
  const diagram = useStore((s) => s.projekt[s.system]);
  const krav = useStore((s) => s.projekt.forudsaetninger.tapstedTryk);
  const vaerktoej = useStore((s) => s.vaerktoej);
  const valg = useStore((s) => s.valg);
  const tegnFra = useStore((s) => s.tegnFra);
  const tegnKnaek = useStore((s) => s.tegnKnaek);
  const markoer = useStore((s) => s.markoer);
  const visDetaljer = useStore((s) => s.visDetaljer);
  const ark = useStore((s) => s.ark);
  const visGitter = useStore((s) => s.visGitter);

  // Zoom med scrollhjul omkring musen
  useEffect(() => {
    const svg = svgRef.current!;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const faktor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setView((v) => {
        const zoom = Math.min(8, Math.max(0.1, v.zoom * faktor));
        const k = zoom / v.zoom;
        return { zoom, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
      });
    };
    svg.addEventListener('wheel', h, { passive: false });
    return () => svg.removeEventListener('wheel', h);
  }, []);

  const tilVerden = (e: { clientX: number; clientY: number }): Punkt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.zoom, y: (e.clientY - r.top - view.y) / view.zoom };
  };

  /** Vælg en nyoprettet strækning, så længdefeltet får fokus */
  const vaelgNy = (sid: string | null) => {
    if (!sid) return;
    const s = useStore.getState();
    s.setNyStraekning(sid);
    s.setValg({ type: 'straekning', id: sid });
  };

  const tegnKlik = (e: RPointerEvent<SVGSVGElement>, dobbelt: boolean) => {
    const s = useStore.getState();
    const sys = s.system;
    const d = s.projekt[sys];
    const w = tilVerden(e);
    const ws = snapPunkt(w);
    const radius = 8 / view.zoom;

    // Ikke i gang: start fra eksisterende punkt (enkeltklik) eller opret nyt punkt (dobbeltklik)
    if (!s.tegnFra) {
      const k = findKnude(d, w, radius);
      if (k) {
        s.setTegnFra(k.id);
        s.setTegnKnaek([]);
        s.setValg({ type: 'knude', id: k.id });
        return;
      }
      if (!dobbelt) return;
      const id = s.aendr((p) => findEllerOpretKnude(p[sys], ws, radius, 0).id);
      s.setTegnFra(id);
      s.setTegnKnaek([]);
      s.setValg({ type: 'knude', id });
      return;
    }

    const fra = d.knuder.find((k) => k.id === s.tegnFra);
    if (!fra) {
      s.afslutTegning();
      return;
    }
    let knaek = [...s.tegnKnaek];

    if (dobbelt) {
      // Første klik i dobbeltklikket lavede et knæk her – fjern det igen
      const sidste = knaek[knaek.length - 1];
      if (sidste) {
        const forrige = knaek.length > 1 ? knaek[knaek.length - 2] : fra;
        const m = ortogonal(forrige, ws);
        if (m.x === sidste.x && m.y === sidste.y) knaek = knaek.slice(0, -1);
      }
      const fraPkt = knaek[knaek.length - 1] ?? fra;
      const maal = ortogonal(fraPkt, ws);
      if (Math.hypot(maal.x - fraPkt.x, maal.y - fraPkt.y) < radius && knaek.length === 0) return;
      const r = s.aendr((p) => {
        const slut = findEllerOpretKnude(p[sys], maal, radius, fra.kote);
        return { ...slut, sid: tilfoejStraekning(p[sys], fra.id, slut.id, knaek) };
      });
      // Fortsæt fra det nye punkt – stop hvis vi ramte et eksisterende punkt/rør
      s.setTegnFra(r.ny ? r.id : null);
      s.setTegnKnaek([]);
      vaelgNy(r.sid);
      return;
    }

    const fraPkt = knaek[knaek.length - 1] ?? fra;

    // Klik på et eksisterende punkt: forbind (med automatisk hjørne hvis nødvendigt)
    const hit = findKnude(d, w, radius);
    if (hit && hit.id !== fra.id) {
      if (hit.x !== fraPkt.x && hit.y !== fraPkt.y) knaek.push({ x: hit.x, y: fraPkt.y });
      const sid = s.aendr((p) => tilfoejStraekning(p[sys], fra.id, hit.id, knaek));
      s.setTegnFra(null);
      s.setTegnKnaek([]);
      vaelgNy(sid);
      return;
    }

    // Ellers: knæk
    const maal = ortogonal(fraPkt, ws);
    if (Math.hypot(maal.x - fraPkt.x, maal.y - fraPkt.y) < radius) return;
    s.setTegnKnaek([...knaek, maal]);
  };

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    // Gem et åbent inputfelt (fx længde) før markeringen skifter
    (document.activeElement as HTMLElement | null)?.blur?.();
    const s = useStore.getState();
    const d = s.projekt[s.system];
    const w = tilVerden(e);
    const radius = 8 / view.zoom;

    // Scrollhjul: panorér
    if (e.button === 1) {
      e.preventDefault();
      traek.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (s.vaerktoej === 'roer') {
      if (e.button === 0) tegnKlik(e, erDobbeltklik(e));
      else if (e.button === 2 && s.tegnFra) tegnKlik(e, false); // højreklik = knæk
      return;
    }

    if (e.button !== 0) return;
    const k = findKnude(d, w, radius);
    const hit = k ? undefined : findStraekning(d, w, radius);

    // Træk i en del af en markering: flyt hele markeringen
    const v = s.valg;
    if (v?.type === 'flere' && ((k && v.knuder.includes(k.id)) || (hit && v.straekninger.includes(hit.s.id)))) {
      traek.current = {
        type: 'markering',
        start: snapPunkt(w),
        knuder: v.knuder,
        straekninger: v.straekninger,
        orig: structuredClone(d),
        flyttet: false,
      };
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (k) {
      s.setValg({ type: 'knude', id: k.id });
      const g = ortogonaleGrupper(d, k.id);
      traek.current = {
        type: 'knude',
        start: snapPunkt(w),
        vandret: g.vandret,
        lodret: g.lodret,
        orig: structuredClone(d),
        flyttet: false,
      };
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    if (hit) {
      s.setValg({ type: 'straekning', id: hit.s.id });
      return;
    }
    // Tomt område: start markering med rektangel
    s.setValg(null);
    traek.current = { type: 'omraade', start: w };
    setOmraade({ a: w, b: w });
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const s = useStore.getState();
    const w = tilVerden(e);
    const ws = snapPunkt(w);
    if (!s.markoer || s.markoer.x !== ws.x || s.markoer.y !== ws.y) s.setMarkoer(ws);

    const t = traek.current;
    if (!t) return;
    if (t.type === 'omraade') {
      setOmraade({ a: t.start, b: w });
      return;
    }
    if (t.type === 'pan') {
      setView((v) => ({ ...v, x: t.vx + e.clientX - t.sx, y: t.vy + e.clientY - t.sy }));
      return;
    }
    const dx = ws.x - t.start.x;
    const dy = ws.y - t.start.y;
    if (!t.flyttet) {
      if (dx === 0 && dy === 0) return;
      s.gemHistorik();
      t.flyttet = true;
    }
    const sys = s.system;
    if (t.type === 'markering') {
      s.aendr((p) => flytMarkering(p[sys], t.orig, t.knuder, t.straekninger, dx, dy), false);
    } else {
      s.aendr((p) => flytKnuder(p[sys], t.orig, t.vandret, t.lodret, dx, dy), false);
    }
  };

  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    const t = traek.current;
    if (t?.type === 'omraade') {
      markerOmraade(t.start, tilVerden(e));
      setOmraade(null);
    }
    traek.current = null;
    try {
      svgRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignorer */
    }
  };

  /** Markér punkter inden for rektanglet og strækninger der krydser det. */
  const markerOmraade = (a: Punkt, b: Punkt) => {
    if (Math.abs(a.x - b.x) * view.zoom < 4 && Math.abs(a.y - b.y) * view.zoom < 4) return; // bare et klik
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    const s = useStore.getState();
    const d = s.projekt[s.system];
    const kmap = new Map(d.knuder.map((k) => [k.id, k]));
    const inde = (p: Punkt) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
    const krydser = (p: Punkt, q: Punkt) =>
      Math.max(p.x, q.x) >= x1 && Math.min(p.x, q.x) <= x2 && Math.max(p.y, q.y) >= y1 && Math.min(p.y, q.y) <= y2;
    const knuder = d.knuder.filter(inde).map((k) => k.id);
    const straekninger = d.straekninger
      .filter((st) => {
        const p = kmap.get(st.fra);
        const q = kmap.get(st.til);
        if (!p || !q) return false;
        const pts = [p, ...(st.knaek ?? []), q];
        return pts.slice(0, -1).some((u, i) => krydser(u, pts[i + 1]));
      })
      .map((st) => st.id);
    if (knuder.length + straekninger.length === 0) s.setValg(null);
    else if (knuder.length === 1 && straekninger.length === 0) s.setValg({ type: 'knude', id: knuder[0] });
    else if (knuder.length === 0 && straekninger.length === 1) s.setValg({ type: 'straekning', id: straekninger[0] });
    else s.setValg({ type: 'flere', knuder, straekninger });
  };

  const km = new Map(diagram.knuder.map((k) => [k.id, k]));
  const fraK = tegnFra ? km.get(tegnFra) : undefined;
  let forhaandsvisning: Punkt[] | null = null;
  if (vaerktoej === 'roer' && fraK) {
    const sidste = tegnKnaek[tegnKnaek.length - 1] ?? fraK;
    forhaandsvisning = [fraK, ...tegnKnaek, ...(markoer ? [ortogonal(sidste, markoer)] : [])];
  }
  const fp = res.opsummering?.kritiskKnude;

  /** Retning af røret ind i et punkt [grader] */
  const vinkelInd = (k: Knude) => {
    const s = diagram.straekninger.find((x) => x.fra === k.id || x.til === k.id);
    const a = s && km.get(s.fra);
    const b = s && km.get(s.til);
    if (!s || !a || !b) return 0;
    const pts = [a, ...(s.knaek ?? []), b];
    const nabo = s.fra === k.id ? pts[1] : pts[pts.length - 2];
    return (Math.atan2(k.y - nabo.y, k.x - nabo.x) * 180) / Math.PI;
  };

  return (
    <div className="laerred-ramme">
      <svg
        ref={svgRef}
        className={`laerred vaerktoej-${vaerktoej}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => useStore.getState().setMarkoer(null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Gitter: fine linjer pr. 10 (= snap), lidt kraftigere pr. 50 */}
        <defs>
          <pattern
            id="gitter-fin"
            width={10}
            height={10}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}
          >
            <path d="M 10 0 L 0 0 0 10" className="gitter-fin" />
          </pattern>
          <pattern
            id="gitter-grov"
            width={50}
            height={50}
            patternUnits="userSpaceOnUse"
            patternTransform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}
          >
            <path d="M 50 0 L 0 0 0 50" className="gitter-grov" />
          </pattern>
        </defs>
        {visGitter && (
          <g pointerEvents="none">
            {view.zoom >= 0.6 && <rect width="100%" height="100%" fill="url(#gitter-fin)" />}
            <rect width="100%" height="100%" fill="url(#gitter-grov)" />
          </g>
        )}
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {ark.map((a) => {
            const b = mmTilEnhed(ARK_MM[a].b);
            const h = mmTilEnhed(ARK_MM[a].h);
            return (
              <g key={a} className="ark-ramme">
                <rect x={NULPUNKT.x - b} y={NULPUNKT.y - h} width={b} height={h} />
                {/* Navnet i øverste venstre hjørne, så de ikke ligger oven i hinanden */}
                <text x={NULPUNKT.x - b + 6} y={NULPUNKT.y - h + 14}>
                  {a}
                </text>
              </g>
            );
          })}
          {diagram.straekninger.map((s) => {
            const a = km.get(s.fra);
            const b = km.get(s.til);
            if (!a || !b) return null;
            return (
              <RoerTegning
                key={s.id}
                s={s}
                navn={`${a.navn}-${b.navn}`}
                pts={[a, ...(s.knaek ?? []), b]}
                farve={FARVE[system]}
                valgt={erValgt(valg, 'straekning', s.id)}
                res={res.straekninger[s.id]}
                visDetaljer={visDetaljer}
                visuel={!!(a.fortsaetter || b.fortsaetter)}
              />
            );
          })}

          {diagram.knuder.map((k) => (
            <PunktTegning
              key={k.id}
              k={k}
              valgt={erValgt(valg, 'knude', k.id)}
              flow={punktFlow(k, system)}
              tryk={res.knuder[k.id]}
              fp={fp === k.id}
              krav={krav}
              visDetaljer={visDetaljer}
              vinkel={k.fortsaetter ? vinkelInd(k) : 0}
            />
          ))}

          {forhaandsvisning && (
            <polyline
              points={forhaandsvisning.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={FARVE[system]}
              className="forhaandsvisning"
            />
          )}
          {tegnKnaek.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={2} fill={FARVE[system]} />
          ))}
          {omraade && (
            <rect
              x={Math.min(omraade.a.x, omraade.b.x)}
              y={Math.min(omraade.a.y, omraade.b.y)}
              width={Math.abs(omraade.a.x - omraade.b.x)}
              height={Math.abs(omraade.a.y - omraade.b.y)}
              className="markering"
            />
          )}
          {markoer && vaerktoej === 'roer' && (
            <circle cx={markoer.x} cy={markoer.y} r={3 / view.zoom} fill={FARVE[system]} />
          )}
        </g>
      </svg>
      {diagram.knuder.length === 0 && (
        <div className="tom-hint">
          <div>
            <b>Dobbeltklik</b> for at placere forsyningspunktet.
            <br />
            Enkeltklik eller højreklik laver et knæk · dobbeltklik laver næste punkt.
          </div>
        </div>
      )}
      <div className="zoom-info">{Math.round(view.zoom * 100)} %</div>
    </div>
  );
}
