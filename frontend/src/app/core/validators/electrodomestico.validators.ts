import { ValidatorFn } from '@angular/forms';
import { ELECTRO_LIMITES } from '../models/electrodomestico.models';

/** Nombre: obligatorio, 1–100 caracteres sin contar espacios en los extremos (igual que el backend). */
export const nombreElectroValidator: ValidatorFn = (control) => {
  const v = String(control.value ?? '').trim();
  if (!v) return { required: true };
  if (v.length > ELECTRO_LIMITES.nombre) return { maxlength: true };
  return null;
};

export interface NumeroOpciones {
  min: number;
  max: number;
  /** Solo enteros. */
  entero?: boolean;
  /** El mínimo es exclusivo (potencia: debe ser mayor que 0). */
  minExclusivo?: boolean;
}

/**
 * Número obligatorio dentro de un rango.
 * Errores: required, number, integer, negative, min, max.
 */
export function numeroValidator(op: NumeroOpciones): ValidatorFn {
  return (control) => {
    const raw = control.value;
    if (raw === null || raw === undefined || raw === '') return { required: true };
    const n = Number(raw);
    if (!Number.isFinite(n)) return { number: true };
    if (op.entero && !Number.isInteger(n)) return { integer: true };
    if (n < 0) return { negative: true };
    if (op.minExclusivo ? n <= op.min : n < op.min) return { min: true };
    if (n > op.max) return { max: true };
    return null;
  };
}
