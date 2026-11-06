# VVS-dim

Tegn et principdiagram (BK/BV/BC) og få vandstrømme – og senere dimensioner – beregnet automatisk.

## Start programmet

Åbn en terminal i denne mappe og kør:

```
npm run dev
```

Browseren åbner selv. Stop igen med `Ctrl+C` i terminalen.

## Kør beregningstests

```
npm test
```

## Mapper

| Mappe | Indhold |
|---|---|
| `src/model` | Datamodel (punkter, strækninger, etager) og tegneoperationer |
| `src/beregning` | Ren beregning + tests. Her må fejl ikke snige sig ind |
| `src/katalog` | Tapsteder (normvandstrømme) – **kontrollér mod DS 439** |
| `src/tegning` | Tegnefladen (SVG) |
| `src/ui` | Værktøjslinje og egenskabspanel |

## Status

- [x] Version 1: Tegning, etager, tapstedsgrupper, Σqf pr. strækning, gem/åbn
- [ ] Version 2: Samtidighed (qd), automatisk dimension, labels som "BK 22x1,2 RS"
- [ ] Version 3: Tryktab og trykkontrol inkl. koter
- [ ] Version 4: Cirkulation, udskrift/PDF
