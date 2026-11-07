// Panelet i højre side: valgt strækning/punkt, ellers projekt, resultat og forudsætninger.
import type { ReactNode } from 'react';
import { useStore } from '../store';
import type { Diagram, Forudsaetninger, Knude, Straekning } from '../model/types';
import { SYSTEM_NAVN } from '../model/types';
import { fmt } from '../model/geometri';
import { antalForbindelser, saetFortsaetter } from '../model/operationer';
import { naesteNavn } from '../model/standard';
import { TAPSTEDER } from '../katalog/tapsteder';
import { ROERSERIER, dimId, dimLabel, findSerie } from '../katalog/roerserier';
import { punktFlow, sumKomponenter, type Advarsel, type DiagramResultat } from '../beregning/net';
import { nu, rho } from '../beregning/hydraulik';
import { Felt, TalFelt } from './Felt';

function advarselTekst(a: Advarsel, f: Forudsaetninger) {
  return {
    v_hoej: `Hastighed over ${fmt(f.vMax, 1)} m/s`,
    v_lav: `Hastighed under ${fmt(f.vMin, 1)} m/s (varmt vand)`,
    R_hoej: `Trykgradient over ${fmt(f.rMax * 1000, 0)} Pa/m`,
    Re_lav: 'Re < 4000 – ikke turbulent, formlerne er ugyldige',
  }[a];
}

const Raekke = ({ navn, v, advarsel }: { navn: ReactNode; v: ReactNode; advarsel?: boolean }) => (
  <tr>
    <td>{navn}</td>
    <td className={'tal' + (advarsel ? ' advarsel-tekst' : '')}>{v}</td>
  </tr>
);

/** Ændr det aktive diagram */
function useDiagramAendr() {
  const aendr = useStore((s) => s.aendr);
  const system = useStore((s) => s.system);
  return (fn: (d: Diagram) => void) => aendr((p) => fn(p[system]));
}

export function Egenskaber({ res }: { res: DiagramResultat }) {
  const valg = useStore((s) => s.valg);
  const diagram = useStore((s) => s.projekt[s.system]);

  let indhold = null;
  if (valg?.type === 'flere') {
    indhold = <FlerePanel antalPunkter={valg.knuder.length} antalStraekninger={valg.straekninger.length} />;
  } else if (valg?.type === 'straekning') {
    const s = diagram.straekninger.find((x) => x.id === valg.id);
    if (s) indhold = <StraekningPanel key={s.id} s={s} res={res} />;
  } else if (valg?.type === 'knude') {
    const k = diagram.knuder.find((x) => x.id === valg.id);
    if (k) indhold = <PunktPanel key={k.id} k={k} res={res} />;
  }
  return <aside className="panel">{indhold ?? <ProjektPanel res={res} />}</aside>;
}

/* ───────────────────────── Flere markeret ───────────────────────── */

function FlerePanel({ antalPunkter, antalStraekninger }: { antalPunkter: number; antalStraekninger: number }) {
  const sletValgt = useStore((st) => st.sletValgt);
  return (
    <>
      <h2>Markering</h2>
      <p>
        {antalPunkter} punkt{antalPunkter === 1 ? '' : 'er'} og {antalStraekninger} strækning
        {antalStraekninger === 1 ? '' : 'er'} er markeret.
      </p>
      <p className="hint">
        Tryk <kbd>Delete</kbd> for at slette. Strækninger til slettede punkter slettes også.
      </p>
      <button className="fare" onClick={sletValgt}>
        Slet markerede
      </button>
    </>
  );
}

/* ───────────────────────── Strækning ───────────────────────── */

function StraekningPanel({ s, res }: { s: Straekning; res: DiagramResultat }) {
  const sletValgt = useStore((st) => st.sletValgt);
  const nyStraekning = useStore((st) => st.nyStraekning);
  const diagram = useStore((st) => st.projekt[st.system]);
  const f = useStore((st) => st.projekt.forudsaetninger);
  const aendrD = useDiagramAendr();
  const opdS = (fn: (x: Straekning) => void) =>
    aendrD((d) => {
      const x = d.straekninger.find((y) => y.id === s.id);
      if (x) fn(x);
    });
  const a = diagram.knuder.find((k) => k.id === s.fra);
  const b = diagram.knuder.find((k) => k.id === s.til);
  const r = res.straekninger[s.id];
  const t = r?.tab;
  const adv = r?.advarsler ?? [];
  const serie = findSerie(s.roertype || f.roertype);

  // Strækning til "rørstræk fortsætter": kun visning
  const fortsaetPunkt = [a, b].find((k) => k?.fortsaetter);
  if (fortsaetPunkt) {
    return (
      <>
        <h2>Rørstræk fortsætter</h2>
        <p className="hint">Vises kun som forgrening og indgår ikke i beregningen eller den kritiske vej.</p>
        <label className="check">
          <input
            type="checkbox"
            checked
            onChange={() => aendrD((d) => saetFortsaetter(d, fortsaetPunkt.id, false))}
          />
          Rørstræk fortsætter
        </label>
        <button className="fare" onClick={sletValgt}>
          Slet strækning
        </button>
      </>
    );
  }
  // Kan slutpunktet markeres som "fortsætter"? (endepunkt med kun denne strækning)
  const kanFortsaette = !!b && b.type !== 'forsyning' && antalForbindelser(diagram, b.id) === 1;

  return (
    <>
      <h2>
        Strækning {a?.navn}-{b?.navn}
      </h2>
      {r && (
        <table className="vandmaengde">
          <tbody>
            <Raekke navn="Forudsat vandmængde Σqf (tapsteder)" v={`${fmt(r.sumQf)} l/s`} />
            <Raekke navn="Dimensionerende vandstrøm qd" v={`${fmt(r.qd, 3)} l/s`} />
            {r.slangevinde && (
              <Raekke
                navn="Slangevinde (formel 5)"
                v={r.qd === 0 ? '0,330 l/s' : `0,33 + (qd − 0,2)`}
              />
            )}
            {r.andre > 0 && <Raekke navn="+ skylleventiler / systematisk" v={`${fmt(r.andre, 3)} l/s`} />}
            <Raekke navn={<strong>Dimensionsgivende qd'</strong>} v={<strong>{fmt(r.qdMark, 3)} l/s</strong>} />
          </tbody>
        </table>
      )}
      {kanFortsaette && (
        <label className="check">
          <input type="checkbox" checked={false} onChange={() => aendrD((d) => saetFortsaetter(d, b!.id, true))} />
          Rørstræk fortsætter (kun visning, ingen beregning)
        </label>
      )}
      <label>Længde [m]</label>
      <TalFelt
        autoFocus={nyStraekning === s.id}
        vaerdi={s.laengde}
        decimaler={1}
        placeholder="angiv længde"
        onGem={(n) => opdS((x) => void (x.laengde = n))}
      />
      <p className="hint">Tegningen er ikke i skala – længden bruges kun i beregningen.</p>

      <h3>Rør</h3>
      <div className="to-kol">
        <div>
          <label>Rørtype</label>
          <select
            value={s.roertype ?? ''}
            onChange={(e) =>
              opdS((x) => {
                x.roertype = e.target.value || null;
                x.laast = null;
              })
            }
          >
            <option value="">Standard ({findSerie(f.roertype).forkortelse})</option>
            {ROERSERIER.map((rs) => (
              <option key={rs.kode} value={rs.kode}>
                {rs.navn}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Dimension</label>
          <select value={s.laast ?? ''} onChange={(e) => opdS((x) => void (x.laast = e.target.value || null))}>
            <option value="">Auto{r?.dim && !r.laast ? ` → ${r.label}` : ''}</option>
            {serie.dims.map((d) => (
              <option key={dimId(d)} value={dimId(d)}>
                {dimLabel(serie, d)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <details>
        <summary>Enkelttab</summary>
        <div className="to-kol">
          <div>
            <label>Σξ</label>
            <TalFelt
              vaerdi={s.xi ?? null}
              placeholder={`${f.tillaeg} % tillæg`}
              onGem={(n) => opdS((x) => void (x.xi = n))}
            />
          </div>
          <div>
            <label>Ekstra [kPa]</label>
            <TalFelt
              vaerdi={s.enkelttab ?? null}
              decimaler={1}
              placeholder="0"
              onGem={(n) => opdS((x) => void (x.enkelttab = n))}
            />
          </div>
        </div>
        <p className="hint">Uden Σξ lægges {f.tillaeg} % til rørfriktionen.</p>
      </details>

      <h3>Resultat</h3>
      {s.laengde == null && <p className="advarsel-tekst">Dimension vises som "?" indtil længden er angivet.</p>}
      {!r ? (
        <p className="hint">Ikke forbundet til forsyningen.</p>
      ) : !t ? (
        <p className="hint">Ingen vandstrøm gennem strækningen.</p>
      ) : (
        <table>
          <tbody>
            <Raekke navn="Dimension" v={`${r.label} (di ${fmt(r.dim!.di, 1)} mm)`} />
            <Raekke navn="v" v={`${fmt(t.v)} m/s`} advarsel={adv.includes('v_hoej') || adv.includes('v_lav')} />
            <Raekke navn="Re" v={Math.round(t.Re).toLocaleString('da-DK')} advarsel={adv.includes('Re_lav')} />
            <Raekke navn="λ" v={fmt(t.lambda, 4)} />
            <Raekke navn="R" v={`${fmt(t.R * 1000, 0)} Pa/m`} advarsel={adv.includes('R_hoej')} />
            <Raekke navn="ΔP" v={`${fmt(t.dp)} kPa`} />
          </tbody>
        </table>
      )}
      {adv.map((x) => (
        <p key={x} className="advarsel-tekst">
          ⚠ {advarselTekst(x, f)}
        </p>
      ))}

      <button className="fare" onClick={sletValgt}>
        Slet strækning
      </button>
    </>
  );
}

/* ───────────────────────── Punkt ───────────────────────── */

function PunktPanel({ k, res }: { k: Knude; res: DiagramResultat }) {
  const sletValgt = useStore((st) => st.sletValgt);
  const system = useStore((st) => st.system);
  const f = useStore((st) => st.projekt.forudsaetninger);
  const aendrD = useDiagramAendr();
  const opd = (fn: (x: Knude) => void) =>
    aendrD((d) => {
      const x = d.knuder.find((y) => y.id === k.id);
      if (x) fn(x);
    });
  const tryk = res.knuder[k.id];
  const flow = punktFlow(k, system);
  const tapsteder = k.tapsteder ?? [];
  const diagram = useStore((st) => st.projekt[st.system]);

  if (k.fortsaetter) {
    return (
      <>
        <h2>Rørstræk fortsætter</h2>
        <p className="hint">Vises med S-symbol og indgår ikke i beregningen eller den kritiske vej.</p>
        <label className="check">
          <input type="checkbox" checked onChange={() => aendrD((d) => saetFortsaetter(d, k.id, false))} />
          Rørstræk fortsætter
        </label>
        <button className="fare" onClick={sletValgt}>
          Slet
        </button>
      </>
    );
  }
  const kanFortsaette = k.type !== 'forsyning' && antalForbindelser(diagram, k.id) === 1;

  return (
    <>
      <h2>Punkt {k.navn}</h2>
      {kanFortsaette && (
        <label className="check">
          <input type="checkbox" checked={false} onChange={() => aendrD((d) => saetFortsaetter(d, k.id, true))} />
          Rørstræk fortsætter (kun visning, ingen beregning)
        </label>
      )}
      <div className="to-kol">
        <div>
          <label>Navn</label>
          <Felt
            vaerdi={k.navn}
            onGem={(v) =>
              aendrD((d) => {
                const x = d.knuder.find((y) => y.id === k.id);
                if (!x) return;
                // Tomt navn → næste ledige bogstav (A, B, C …)
                x.navn = '';
                x.navn = v.trim() || naesteNavn(d);
              })
            }
          />
        </div>
        <div>
          <label>&nbsp;</label>
          <label className="check">
            <input
              type="checkbox"
              checked={k.type === 'forsyning'}
              onChange={(e) =>
                aendrD((d) => {
                  for (const x of d.knuder) {
                    if (x.id === k.id) x.type = e.target.checked ? 'forsyning' : 'punkt';
                    else if (e.target.checked && x.type === 'forsyning') x.type = 'punkt';
                  }
                })
              }
            />
            Forsyningspunkt
          </label>
        </div>
        <div>
          <label>Kote [m]{k.type === 'forsyning' ? ' (Zf)' : ''}</label>
          <TalFelt vaerdi={k.kote} onGem={(n) => n != null && opd((x) => void (x.kote = n))} />
        </div>
        <div>
          <label>Vandmængde qf [l/s]</label>
          <TalFelt vaerdi={k.qf} onGem={(n) => opd((x) => void (x.qf = Math.max(0, n ?? 0)))} />
        </div>
      </div>
      {tapsteder.length > 0 && (
        <p className="hint">
          Samlet i punktet: qf {fmt(k.qf)} + tapsteder = <strong>{fmt(flow)} l/s</strong>
        </p>
      )}

      {tryk && (
        <>
          <h3>Tryk</h3>
          <table>
            <tbody>
              <Raekke navn="p'x (beregningstryk)" v={`${fmt(tryk.pBeregning, 1)} kPa`} />
              <Raekke
                navn="px (inkl. højde)"
                v={`${fmt(tryk.px, 1)} kPa`}
                advarsel={flow > 0 && tryk.px < f.tapstedTryk}
              />
            </tbody>
          </table>
          {flow > 0 && <p className="hint">Krav ved tapsted: px ≥ {fmt(f.tapstedTryk, 0)} kPa</p>}
        </>
      )}

      <details open={tapsteder.length > 0}>
        <summary>Tapsteder (valgfrit)</summary>
        {tapsteder.length > 0 && (
          <table>
            <tbody>
              {tapsteder.map((l, i) => (
                <tr key={i}>
                  <td>
                    <select
                      value={l.kode}
                      onChange={(e) => opd((x) => void (x.tapsteder![i].kode = e.target.value))}
                    >
                      {TAPSTEDER.map((t) => (
                        <option key={t.kode} value={t.kode}>
                          {t.kode} – {t.navn} ({fmt(t.qf)})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ width: 54 }}>
                    <TalFelt
                      vaerdi={l.antal}
                      decimaler={0}
                      onGem={(n) => {
                        if (n != null && n >= 0) opd((x) => void (x.tapsteder![i].antal = Math.round(n)));
                      }}
                    />
                  </td>
                  <td style={{ width: 28 }}>
                    <button className="lille" title="Fjern" onClick={() => opd((x) => void x.tapsteder!.splice(i, 1))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button onClick={() => opd((x) => void (x.tapsteder = [...(x.tapsteder ?? []), { kode: 'HV', antal: 1 }]))}>
          + Tilføj tapsted
        </button>
        <p className="hint">Tapsteder slås op i DS 439-tabellen og lægges oven i qf.</p>
      </details>

      <details>
        <summary>Tillæg</summary>
        <div className="to-kol">
          <div>
            <label>Skylleventiler [stk]</label>
            <TalFelt
              vaerdi={k.skylleventiler ?? 0}
              decimaler={0}
              onGem={(n) => opd((x) => void (x.skylleventiler = Math.max(0, Math.round(n ?? 0))))}
            />
          </div>
          <div>
            <label>Systematisk [l/s]</label>
            <TalFelt vaerdi={k.systematisk ?? 0} onGem={(n) => opd((x) => void (x.systematisk = Math.max(0, n ?? 0)))} />
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={!!k.slangevinde}
            onChange={(e) => opd((x) => void (x.slangevinde = e.target.checked))}
          />
          Slangevinde
        </label>
      </details>

      <button className="fare" onClick={sletValgt}>
        Slet punkt
      </button>
    </>
  );
}

/* ───────────────────────── Projekt ───────────────────────── */

function ProjektPanel({ res }: { res: DiagramResultat }) {
  const navn = useStore((s) => s.projekt.navn);
  const aendr = useStore((s) => s.aendr);
  const system = useStore((s) => s.system);

  return (
    <>
      <h2>Projekt</h2>
      <label>Navn</label>
      <Felt vaerdi={navn} onGem={(v) => aendr((p) => void (p.navn = v))} />

      <h3>{SYSTEM_NAVN[system]} – farligste punkt</h3>
      <Opsummering res={res} />

      {res.advarsler.length > 0 && (
        <>
          <h3>Advarsler</h3>
          <ul className="advarsler">
            {res.advarsler.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}

      <details>
        <summary>Forudsætninger</summary>
        <ForudsaetningerPanel />
      </details>

      <details>
        <summary>Tapstedstabel (DS 439)</summary>
        <table>
          <thead>
            <tr>
              <th>Kode</th>
              <th className="tal">qf [l/s]</th>
              <th>BK</th>
              <th>BV</th>
            </tr>
          </thead>
          <tbody>
            {TAPSTEDER.map((t) => (
              <tr key={t.kode} title={t.navn}>
                <td>
                  {t.kode} <span className="hint">({t.navn})</span>
                </td>
                <td className="tal">{fmt(t.qf)}</td>
                <td>{t.BK ? '✓' : ''}</td>
                <td>{t.BV ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details>
        <summary>Genveje</summary>
        <table className="genveje">
          <tbody>
            <tr><td><kbd>R</kbd></td><td>Tegn strækninger</td></tr>
            <tr><td><kbd>V</kbd></td><td>Vælg / flyt punkter</td></tr>
            <tr><td><kbd>D</kbd></td><td>Vis/skjul detaljer</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>Afslut strækning / fravælg</td></tr>
            <tr><td><kbd>Delete</kbd></td><td>Slet valgte</td></tr>
            <tr><td><kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd></td><td>Fortryd / gendan</td></tr>
            <tr><td>Scroll</td><td>Zoom</td></tr>
            <tr><td>Hold scrollhjul nede</td><td>Panorér</td></tr>
          </tbody>
        </table>
      </details>
    </>
  );
}

function Opsummering({ res }: { res: DiagramResultat }) {
  const f = useStore((s) => s.projekt.forudsaetninger);
  const diagram = useStore((s) => s.projekt[s.system]);
  const o = res.opsummering;
  const fp = o?.kritiskKnude ? diagram.knuder.find((k) => k.id === o.kritiskKnude) : undefined;

  if (!o || !fp || o.pxKritisk == null) {
    return <p className="hint">Tegn et net og angiv vandmængder i punkterne for at se resultatet.</p>;
  }
  const fortegn = (v: number) => (v < 0 ? '−' : '+') + fmt(Math.abs(v), 1);
  const dpHoejde = 9.81 * o.hoejdeKritisk;
  const sumKomp = sumKomponenter(f);
  const antalStr = o.kritiskVej.filter((sid) => res.straekninger[sid]?.tab).length;

  return (
    <>
      <p className="trin-fp">
        Farligste punkt (FP): <strong>{fp.navn}</strong>
      </p>
      <table className="trin">
        <tbody>
          <tr><td>Forsyningstryk pf</td><td className="tal">{fmt(f.forsyningstryk, 1)}</td></tr>
          <tr>
            <td title={f.komponenter.map((c) => `${c.navn}: ${fmt(c.kPa, 1)} kPa`).join('\n')}>
              Komponenter <span className="daempet">({f.komponenter.length} stk.)</span>
            </td>
            <td className="tal minus">{fortegn(-sumKomp)}</td>
          </tr>
          {f.boost > 0 && (
            <tr><td>Trykforøgning</td><td className="tal">{fortegn(f.boost)}</td></tr>
          )}
          <tr>
            <td>Strækninger <span className="daempet">({antalStr} stk. på kritisk vej)</span></td>
            <td className="tal minus">{fortegn(-o.sumDpKritisk)}</td>
          </tr>
          <tr>
            <td>Kote <span className="daempet">(Δh {fmt(o.hoejdeKritisk)} m)</span></td>
            <td className={'tal' + (dpHoejde > 0 ? ' minus' : '')}>{fortegn(-dpHoejde)}</td>
          </tr>
          <tr className={'trin-sum trin-slut' + (o.pxKritisk < f.tapstedTryk ? ' advarsel-tekst' : '')}>
            <td>= px i FP <span className="daempet">(krav ≥ {fmt(f.tapstedTryk, 0)})</span></td>
            <td className="tal">{fmt(o.pxKritisk, 1)}</td>
          </tr>
        </tbody>
      </table>
      <p className="hint trin-enhed">Alle tryk i kPa.</p>
      <table>
        <tbody>
          <Raekke navn="Max qd'" v={`${fmt(o.maxQdMark, 3)} l/s`} />
          {o.gnsVKritisk != null && (
            <Raekke navn="Gns. hastighed" v={`${fmt(o.gnsVKritisk)} m/s`} advarsel={o.gnsVKritisk > f.vGnsMax} />
          )}
        </tbody>
      </table>
      {o.behovBoost > 0 ? (
        <p className="status daarlig">
          Tryktabet er for stort – nødvendig trykforøgning {fmt(o.behovBoost, 0)} kPa
          {o.hoejdeBegraenset ? ' (skyldes højden – kan ikke løses med større rør)' : ''}
        </p>
      ) : (
        <p className="status god">
          Tryktabet er tilpas i forhold til forsyningstrykket (overskud {fmt(o.pxKritisk - f.tapstedTryk, 0)} kPa)
        </p>
      )}
      {o.opdimensioneret > 0 && (
        <p className="hint">{o.opdimensioneret} dimensionstrin er øget automatisk på kritisk vej for at opnå tryk.</p>
      )}
    </>
  );
}

type TalNoegle =
  | 'tempKold' | 'tempVarm' | 'forsyningstryk' | 'boost' | 'tillaeg'
  | 'tapstedTryk' | 'vMax' | 'vMin' | 'vGnsMax' | 'rMax';

function ForudsaetningerPanel() {
  const f = useStore((s) => s.projekt.forudsaetninger);
  const aendr = useStore((s) => s.aendr);
  const opd = (fn: (x: Forudsaetninger) => void) => aendr((p) => fn(p.forudsaetninger));

  const tal = (navn: string, noegle: TalNoegle, enhed: string, decimaler = 1) => (
    <div className="felt-raekke" key={noegle}>
      <span>{navn}</span>
      <TalFelt
        vaerdi={f[noegle]}
        decimaler={decimaler}
        onGem={(n) => {
          if (n != null) opd((x) => void (x[noegle] = n));
        }}
      />
      <span className="enhed">{enhed}</span>
    </div>
  );

  return (
    <>
      <h4>Tryk</h4>
      {tal('Forsyningstryk pf', 'forsyningstryk', 'kPa', 0)}
      {f.komponenter.map((c, i) => (
        <div className="felt-raekke komponent" key={i}>
          <Felt vaerdi={c.navn} onGem={(v) => opd((x) => void (x.komponenter[i].navn = v))} />
          <TalFelt
            vaerdi={c.kPa}
            decimaler={0}
            onGem={(n) => {
              if (n != null) opd((x) => void (x.komponenter[i].kPa = n));
            }}
          />
          <button className="lille" title="Fjern" onClick={() => opd((x) => void x.komponenter.splice(i, 1))}>
            ×
          </button>
        </div>
      ))}
      <button onClick={() => opd((x) => void x.komponenter.push({ navn: 'Ny komponent', kPa: 0 }))}>
        + Tilføj komponent
      </button>
      {tal('Trykforøgning', 'boost', 'kPa', 0)}
      <p className="hint">
        p'xe = {fmt(f.forsyningstryk, 0)} − {fmt(sumKomponenter(f), 0)} + {fmt(f.boost, 0)} ={' '}
        <strong>{fmt(f.forsyningstryk - sumKomponenter(f) + f.boost, 0)} kPa</strong>
      </p>
      {tal("Krav ved tapsted ΔP'vn", 'tapstedTryk', 'kPa', 0)}
      {tal('Enkelttabstillæg', 'tillaeg', '%', 0)}

      <h4>Grænser</h4>
      {tal('v max', 'vMax', 'm/s')}
      {tal('v min (varmt)', 'vMin', 'm/s')}
      {tal('Gns. v max (kritisk)', 'vGnsMax', 'm/s')}
      <div className="felt-raekke">
        <span>R max</span>
        <TalFelt
          vaerdi={f.rMax * 1000}
          decimaler={0}
          onGem={(n) => {
            if (n != null) opd((x) => void (x.rMax = n / 1000));
          }}
        />
        <span className="enhed">Pa/m</span>
      </div>

      <h4>Vand</h4>
      {tal('Temperatur koldt', 'tempKold', '°C', 0)}
      {tal('Temperatur varmt', 'tempVarm', '°C', 0)}
      <p className="hint">
        Koldt: ρ {fmt(rho(f.tempKold), 1)} kg/m³, ν {fmt(nu(f.tempKold) * 1e6, 3)}·10⁻⁶ m²/s
        <br />
        Varmt: ρ {fmt(rho(f.tempVarm), 1)} kg/m³, ν {fmt(nu(f.tempVarm) * 1e6, 3)}·10⁻⁶ m²/s
      </p>

      <h4>Rør</h4>
      <label>Standard rørtype</label>
      <select value={f.roertype} onChange={(e) => opd((x) => void (x.roertype = e.target.value))}>
        {ROERSERIER.map((r) => (
          <option key={r.kode} value={r.kode}>
            {r.navn}
          </option>
        ))}
      </select>
      <label className="check">
        <input type="checkbox" checked={f.autoTryk} onChange={(e) => opd((x) => void (x.autoTryk = e.target.checked))} />
        Øg dimensioner automatisk ved for lavt tryk
      </label>
    </>
  );
}
