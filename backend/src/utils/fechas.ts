/**
 * Utilidades de fechas con strings 'YYYY-MM-DD'.
 * Todo el cálculo se hace en UTC para evitar desfases por zona horaria / horario de verano.
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DIA = 86_400_000;

function aUTC(iso: string): number {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`Fecha inválida: ${iso}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function desdeUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function esFechaValida(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  return desdeUTC(aUTC(iso)) === iso; // rechaza 2026-02-31, etc.
}

/** Fecha de hoy (calendario local del servidor) como 'YYYY-MM-DD'. */
export function hoyISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Días de calendario entre dos fechas: (hasta - desde). */
export function diffDias(desde: string, hasta: string): number {
  return Math.round((aUTC(hasta) - aUTC(desde)) / MS_DIA);
}

export function sumarDias(iso: string, dias: number): string {
  return desdeUTC(aUTC(iso) + dias * MS_DIA);
}

export function maxFecha(a: string, b: string): string {
  return a >= b ? a : b;
}

/**
 * Ciclo de facturación mensual que contiene `fechaRef`, según el día de corte de la vivienda.
 * Ej.: dia_corte = 15, ref = 2026-03-10 -> 2026-02-15 .. 2026-03-14.
 */
export function calcularCiclo(diaCorte: number, fechaRef: string): { inicio: string; fin: string } {
  const [y, m, d] = fechaRef.split('-').map(Number) as [number, number, number];
  const mesInicio = d >= diaCorte ? m - 1 : m - 2; // índice de mes base 0 (Date.UTC normaliza el desbordamiento)
  const inicio = desdeUTC(Date.UTC(y, mesInicio, diaCorte));
  const siguiente = desdeUTC(Date.UTC(y, mesInicio + 1, diaCorte));
  return { inicio, fin: sumarDias(siguiente, -1) };
}
