/** Formatea un número con convención española (coma decimal): 65.8 → "65,80". */
export function fmtNum(value: number, decimals = 0): string {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Fecha larga en español a partir de un ISO ("6 de octubre de 2026"); null si no es válida. */
export function fmtFecha(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(d);
}

/**
 * Fecha de calendario 'YYYY-MM-DD' (columnas DATE del backend) como "6 oct 2026".
 * Se formatea en UTC para que la zona horaria del navegador no mueva el día.
 */
export function fmtDia(iso: string | null | undefined, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return '—';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat('es-ES', { dateStyle: style, timeZone: 'UTC' }).format(d);
}

/** Fecha y hora local de un timestamp ISO ("6 oct 2026, 14:05"); '—' si no es válido. */
export function fmtFechaHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/** Importe con su moneda ISO ("USD"): 12.5 → "12,50 US$". */
export function fmtMonto(value: number, moneda: string): string {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda }).format(value);
  } catch {
    return `${fmtNum(value, 2)} ${moneda}`;
  }
}
