import { useEffect, useState } from 'react';
import { fmt, tilTal } from '../model/geometri';

/** Inputfelt der først gemmer ved Enter eller når feltet forlades (giver pæn fortryd-historik). */
export function Felt({
  vaerdi,
  onGem,
  placeholder,
  className,
  autoFocus,
}: {
  vaerdi: string;
  onGem: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const [v, setV] = useState(vaerdi);
  useEffect(() => setV(vaerdi), [vaerdi]);
  return (
    <input
      className={className}
      value={v}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== vaerdi) onGem(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setV(vaerdi);
      }}
    />
  );
}

/** Talfelt med dansk komma. Tomt felt giver null. Ugyldig tekst ignoreres. */
export function TalFelt({
  vaerdi,
  decimaler = 2,
  onGem,
  placeholder,
  autoFocus,
}: {
  vaerdi: number | null;
  decimaler?: number;
  onGem: (n: number | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <Felt
      className="tal"
      autoFocus={autoFocus}
      vaerdi={vaerdi == null ? '' : fmt(vaerdi, decimaler)}
      placeholder={placeholder}
      onGem={(v) => {
        const n = tilTal(v);
        if (v.trim() !== '' && n == null) return;
        onGem(n);
      }}
    />
  );
}
