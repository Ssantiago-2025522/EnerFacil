import { ValidatorFn } from '@angular/forms';
import { ALERTA_LIMITES } from '../models/alerta.models';

/**
 * Umbral obligatorio: número mayor que 0 y hasta 999,99, con máximo 2 decimales (igual que el backend,
 * columna DECIMAL(5,2) con CHECK > 0). Errores: required, number, negative, min, max, decimals.
 */
export const umbralAlertaValidator: ValidatorFn = (control) => {
  const raw = control.value;
  if (raw === null || raw === undefined || raw === '') return { required: true };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { number: true };
  if (n < 0) return { negative: true };
  if (n < ALERTA_LIMITES.umbral.min) return { min: true };
  if (n > ALERTA_LIMITES.umbral.max) return { max: true };
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return { decimals: true };
  return null;
};
