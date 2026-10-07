import { ValidatorFn } from '@angular/forms';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Fecha de hoy en el calendario local como 'YYYY-MM-DD' (para `max` del <input type="date">). */
export function hoyLocalISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Fecha obligatoria 'YYYY-MM-DD', existente y no futura (igual que el backend).
 * Errores: required, invalid, future.
 */
export const fechaPasadaValidator: ValidatorFn = (control) => {
  const v = String(control.value ?? '').trim();
  if (!v) return { required: true };
  const m = ISO.exec(v);
  if (!m) return { invalid: true };
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== v) return { invalid: true };
  if (v > hoyLocalISO()) return { future: true };
  return null;
};

/** Observación opcional de hasta `max` caracteres (sin contar espacios en los extremos). */
export function observacionValidator(max: number): ValidatorFn {
  return (control) => (String(control.value ?? '').trim().length > max ? { maxlength: true } : null);
}
