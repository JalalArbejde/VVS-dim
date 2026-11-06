import { useRef, useState } from 'react';
import { useStore, erProjekt, type Vaerktoej } from '../store';
import { ARK_LISTE, type ArkStr } from '../tegning/ark';
import { printPdf } from './print';
import eksempel from '../eksempel/solmarksvej.json';
import type { Projekt } from '../model/types';
import { SYSTEM_NAVN, TAPPESYSTEMER } from '../model/types';
import { nytProjekt } from '../model/standard';

const VAERKTOEJER: { id: Vaerktoej; navn: string; tast: string }[] = [
  { id: 'roer', navn: 'Tegn', tast: 'R' },
  { id: 'vaelg', navn: 'Vælg / flyt', tast: 'V' },
];

export function Vaerktoejslinje() {
  const system = useStore((s) => s.system);
  const setSystem = useStore((s) => s.setSystem);
  const vaerktoej = useStore((s) => s.vaerktoej);
  const setVaerktoej = useStore((s) => s.setVaerktoej);
  const visDetaljer = useStore((s) => s.visDetaljer);
  const setVisDetaljer = useStore((s) => s.setVisDetaljer);
  const ark = useStore((s) => s.ark);
  const skiftArk = useStore((s) => s.skiftArk);
  const visGitter = useStore((s) => s.visGitter);
  const setVisGitter = useStore((s) => s.setVisGitter);
  const visNavne = useStore((s) => s.visNavne);
  const setVisNavne = useStore((s) => s.setVisNavne);
  const visSkema = useStore((s) => s.visSkema);
  const setVisSkema = useStore((s) => s.setVisSkema);
  const kanFortryde = useStore((s) => s.historik.length > 0);
  const kanGentage = useStore((s) => s.fremtid.length > 0);
  const fortryd = useStore((s) => s.fortryd);
  const gentag = useStore((s) => s.gentag);
  const indlaes = useStore((s) => s.indlaes);
  const aendr = useStore((s) => s.aendr);
  const filRef = useRef<HTMLInputElement>(null);
  // Standard printformat: det største ark der er vist
  const [printArk, setPrintArk] = useState<ArkStr>(() => {
    const vist = useStore.getState().ark;
    return [...ARK_LISTE].reverse().find((a) => vist.includes(a)) ?? 'A3';
  });

  const gem = () => {
    const p = useStore.getState().projekt;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.navn || 'projekt'}.vvsdim.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const aabnFil = async (fil: File) => {
    try {
      const p = JSON.parse(await fil.text());
      if (!erProjekt(p)) throw new Error();
      indlaes(p);
    } catch {
      alert('Filen kunne ikke læses som et VVS-dim projekt.');
    }
  };

  const kopierKoldt = () => {
    const p = useStore.getState().projekt;
    if (p.BV.knuder.length > 0 && !confirm('Erstat varmtvandsdiagrammet med en kopi af koldtvandsdiagrammet?')) return;
    aendr((x) => {
      x.BV = structuredClone(x.BK);
      for (const s of x.BV.straekninger) s.laast = null;
    });
  };

  return (
    <header className="vaerktoejslinje">
      <strong className="logo">VVS-dim</strong>

      <div className="segment">
        {TAPPESYSTEMER.map((x) => (
          <button key={x} className={`seg-${x}` + (system === x ? ' aktiv' : '')} onClick={() => setSystem(x)}>
            {SYSTEM_NAVN[x]}
          </button>
        ))}
      </div>

      <div className="knaprække">
        {VAERKTOEJER.map((v) => (
          <button
            key={v.id}
            className={vaerktoej === v.id ? 'aktiv' : ''}
            onClick={() => setVaerktoej(v.id)}
            title={`${v.navn} (${v.tast})`}
          >
            {v.navn} <kbd>{v.tast}</kbd>
          </button>
        ))}
        <button
          className={visDetaljer ? 'aktiv' : ''}
          onClick={() => setVisDetaljer(!visDetaljer)}
          title="Vis qd', hastighed og tryk på tegningen (D)"
        >
          Detaljer <kbd>D</kbd>
        </button>
        <button className={visSkema ? 'aktiv' : ''} onClick={() => setVisSkema(!visSkema)} title="Vis skema under tegningen">
          Skema
        </button>
        <label className="vink" title="Vis strækningsnavn og længde på tegningen (også på PDF)">
          <input type="checkbox" checked={visNavne} onChange={(e) => setVisNavne(e.target.checked)} />
          Strækning og længde
        </label>
        {ARK_LISTE.map((a) => (
          <button
            key={a}
            className={ark.includes(a) ? 'aktiv' : ''}
            onClick={() => skiftArk(a)}
            title={`Vis omrids af ${a}-ark (liggende)`}
          >
            {a}
          </button>
        ))}
        <button className={visGitter ? 'aktiv' : ''} onClick={() => setVisGitter(!visGitter)} title="Vis gitter">
          Gitter
        </button>
        <span className="print-valg">
          <select value={printArk} onChange={(e) => setPrintArk(e.target.value as ArkStr)} title="Arkformat til PDF">
            {ARK_LISTE.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button onClick={() => printPdf(printArk)} title="Print tegningen på det valgte ark – vælg 'Gem som PDF'">
            PDF
          </button>
        </span>
      </div>

      {system === 'BV' && (
        <button onClick={kopierKoldt} title="Start varmtvandsdiagrammet som en kopi af koldt vand">
          Kopiér fra koldt vand
        </button>
      )}

      <div className="knaprække">
        <button disabled={!kanFortryde} onClick={fortryd} title="Fortryd (Ctrl+Z)">
          ↶
        </button>
        <button disabled={!kanGentage} onClick={gentag} title="Gendan (Ctrl+Y)">
          ↷
        </button>
      </div>

      <div className="knaprække hoejre">
        <button
          onClick={() => {
            if (confirm('Start et nyt projekt? Ikke-gemte ændringer går tabt.')) indlaes(nytProjekt());
          }}
        >
          Ny
        </button>
        <button
          onClick={() => {
            if (confirm('Åbn eksemplet (Solmarksvej)? Den nuværende tegning erstattes – gem den først, hvis du vil beholde den.')) {
              indlaes(structuredClone(eksempel) as unknown as Projekt);
            }
          }}
          title="Åbn et færdigt eksempel"
        >
          Eksempel
        </button>
        <button onClick={() => filRef.current?.click()}>Åbn…</button>
        <button onClick={gem}>Gem</button>
        <input
          ref={filRef}
          type="file"
          accept=".json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) aabnFil(f);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
