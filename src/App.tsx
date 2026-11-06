import { useEffect, useMemo } from 'react';
import { useStore } from './store';
import { beregnDiagram, type DiagramResultat } from './beregning/net';
import { SYSTEM_NAVN } from './model/types';
import { Laerred } from './tegning/Laerred';
import { Egenskaber } from './ui/Egenskaber';
import { Skema } from './ui/Skema';
import { Vaerktoejslinje } from './ui/Vaerktoejslinje';

export default function App() {
  const system = useStore((s) => s.system);
  const diagram = useStore((s) => s.projekt[s.system]);
  const f = useStore((s) => s.projekt.forudsaetninger);
  const res = useMemo(() => beregnDiagram(diagram, system, f), [diagram, system, f]);
  const visSkema = useStore((s) => s.visSkema);
  useTastatur();

  return (
    <div className="app">
      <Vaerktoejslinje />
      <main>
        <div className="venstre-kol">
          <Laerred res={res} />
          {visSkema && <Skema res={res} />}
        </div>
        <Egenskaber res={res} />
      </main>
      <Statuslinje res={res} />
    </div>
  );
}

function Statuslinje({ res }: { res: DiagramResultat }) {
  const system = useStore((s) => s.system);
  const vaerktoej = useStore((s) => s.vaerktoej);
  const tegnFra = useStore((s) => s.tegnFra);

  const hint =
    vaerktoej === 'vaelg'
      ? 'Klik for at vælge · træk et område for at markere · Delete sletter · træk et punkt for at flytte · hold scrollhjulet nede for at panorere'
      : tegnFra
        ? 'Klik/højreklik = knæk · dobbeltklik = punkt · klik på eksisterende punkt = forbind · Esc afslutter'
        : 'Dobbeltklik for at placere et punkt · klik på et eksisterende punkt for at tegne videre derfra';

  return (
    <footer className="statuslinje">
      <strong className={`sys-tekst-${system}`}>{SYSTEM_NAVN[system]}</strong>
      <span>{hint}</span>
      {res.advarsler.length > 0 && (
        <span className="advarsel hoejre" title={res.advarsler.join('\n')}>
          ⚠ {res.advarsler[0]}
          {res.advarsler.length > 1 ? ` (+${res.advarsler.length - 1} mere)` : ''}
        </span>
      )}
    </footer>
  );
}

function useTastatur() {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      const s = useStore.getState();
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.gentag();
        else s.fortryd();
        return;
      }
      if (ctrl && k === 'y') {
        e.preventDefault();
        s.gentag();
        return;
      }
      if (ctrl || e.altKey) return;
      if (k === 'escape') {
        s.afslutTegning();
        s.setValg(null);
        s.setVaerktoej('vaelg');
      } else if (k === 'delete' || k === 'backspace') s.sletValgt();
      else if (k === 'v') s.setVaerktoej('vaelg');
      else if (k === 'r') s.setVaerktoej('roer');
      else if (k === 'd') s.setVisDetaljer(!s.visDetaljer);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}
