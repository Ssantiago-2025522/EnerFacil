import { ValidatorFn } from '@angular/forms';
import { PRESUPUESTO_LIMITES } from '../models/presupuesto.models';

/**
 * Monto mensual obligatorio: número mayor que 0, con máximo 2 decimales (igual que el backend,
 * que redondea a centavos y rechaza 0). Errores: required, number, negative, min, max, decimals.
 */
export const montoPresupuestoValidator: ValidatorFn = (control) => {
  const raw = control.value;
  if (raw === null || raw === undefined || raw === '') return { required: true };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { number: true };
  if (n < 0) return { negative: true };
  if (n < PRESUPUESTO_LIMITES.monto.min) return { min: true };
  if (n > PRESUPUESTO_LIMITES.monto.max) return { max: true };
  // Se compara en centavos enteros para evitar ruido de coma flotante (p. ej. 19.99 * 100)
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return { decimals: true };
  return null;
};
