// Print / PDF: tegningen lægges på det valgte ark i et nyt vindue med @page i arkets størrelse.
// Brugeren vælger "Gem som PDF" i browserens printdialog.
import { useStore } from '../store';
import { SYSTEM_NAVN } from '../model/types';
import { ARK_MM, arkRect, mmTilEnhed, NULPUNKT, type ArkStr } from '../tegning/ark';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Alle CSS-regler fra appen, så SVG-klasserne ser ens ud på print */
function appCss(): string {
  return Array.from(document.styleSheets)
    .flatMap((ss) => {
      try {
        return Array.from(ss.cssRules).map((r) => r.cssText);
      } catch {
        return [];
      }
    })
    .join('\n');
}

/** Ligger hele tegningen inden for arket? (punkter og knæk) */
function passerPaaArk(a: ArkStr): boolean {
  const s = useStore.getState();
  const d = s.projekt[s.system];
  const r = arkRect(a);
  const pts = [...d.knuder, ...d.straekninger.flatMap((x) => x.knaek ?? [])];
  return pts.every((p) => p.x >= r.x && p.x <= r.x + r.b && p.y >= r.y && p.y <= r.y + r.h);
}

export function printPdf(a: ArkStr) {
  if (!passerPaaArk(a) && !confirm(`Noget af tegningen ligger uden for ${a}-arket og bliver skåret af. Fortsæt?`)) {
    return;
  }
  // Åbn vinduet med det samme (ellers blokeres det som pop-up)
  const vindue = window.open('', '_blank');
  if (!vindue) {
    alert('Browseren blokerede printvinduet. Tillad pop-ups for denne side og prøv igen.');
    return;
  }

  // Ryd markering og igangværende tegning, så de ikke kommer med på print
  const s = useStore.getState();
  s.afslutTegning();
  s.setValg(null);
  s.setMarkoer(null);

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const g = document.querySelector<SVGGElement>('[data-print="indhold"]');
      if (!g) {
        vindue.close();
        return;
      }
      const klon = g.cloneNode(true) as SVGGElement;
      klon.removeAttribute('transform');
      klon
        .querySelectorAll('.ark-ramme, .roer-hover, .markering, .forhaandsvisning, .markoer, .tegn-knaek, .fortsaetter-hit, .roer-kritisk-puls')
        .forEach((e) => e.remove());

      const st = useStore.getState();
      const r = arkRect(a);
      const mm = ARK_MM[a];
      const m = mmTilEnhed(10); // 10 mm margen til tegningsramme
      const tb = { b: mmTilEnhed(110), h: mmTilEnhed(28) }; // titelfelt
      const tx = NULPUNKT.x - m - tb.b;
      const ty = NULPUNKT.y - m - tb.h;
      const dato = new Date().toLocaleDateString('da-DK');
      const titel = `${st.projekt.navn} – ${SYSTEM_NAVN[st.system]} – ${a}`;

      const titelfelt = `
        <rect x="${r.x + m}" y="${r.y + m}" width="${r.b - 2 * m}" height="${r.h - 2 * m}" fill="none" stroke="#000" stroke-width="0.8"/>
        <g font-family="system-ui, 'Segoe UI', sans-serif" fill="#000">
          <rect x="${tx}" y="${ty}" width="${tb.b}" height="${tb.h}" fill="#fff" stroke="#000" stroke-width="0.8"/>
          <line x1="${tx}" y1="${ty + tb.h * 0.45}" x2="${tx + tb.b}" y2="${ty + tb.h * 0.45}" stroke="#000" stroke-width="0.4"/>
          <text x="${tx + 8}" y="${ty + 22}" font-size="14" font-weight="700">${esc(st.projekt.navn)}</text>
          <text x="${tx + 8}" y="${ty + tb.h * 0.45 + 15}" font-size="9">Principdiagram brugsvand – ${SYSTEM_NAVN[st.system]} (${st.system})</text>
          <text x="${tx + 8}" y="${ty + tb.h * 0.45 + 28}" font-size="8">Dimensioneret iht. DS 439</text>
          <text x="${tx + tb.b - 8}" y="${ty + tb.h * 0.45 + 15}" font-size="8" text-anchor="end">Ark ${a}</text>
          <text x="${tx + tb.b - 8}" y="${ty + tb.h * 0.45 + 28}" font-size="8" text-anchor="end">${dato}</text>
        </g>`;

      vindue.document.open();
      vindue.document.write(`<!doctype html>
<html lang="da"><head><meta charset="utf-8"><title>${esc(titel)}</title>
<style>
${appCss()}
@page { size: ${mm.b}mm ${mm.h}mm; margin: 0; }
html, body { margin: 0; padding: 0; height: auto; background: #fff; }
svg.print { display: block; width: ${mm.b}mm; height: ${mm.h}mm; }
</style></head>
<body>
<svg class="print" xmlns="http://www.w3.org/2000/svg" viewBox="${r.x} ${r.y} ${r.b} ${r.h}">
${klon.outerHTML}
${titelfelt}
</svg>
<script>window.onload = () => setTimeout(() => window.print(), 200);</script>
</body></html>`);
      vindue.document.close();
    }),
  );
}
