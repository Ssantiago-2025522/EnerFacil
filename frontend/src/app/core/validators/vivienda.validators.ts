import { ValidatorFn } from '@angular/forms';
import { VIVIENDA_LIMITES } from '../models/vivienda.models';

/** Nombre: obligatorio, 1–100 caracteres sin contar espacios en los extremos (igual que el backend). */
export const nombreViviendaValidator: ValidatorFn = (control) => {
  const v = String(control.value ?? '').trim();
  if (!v) return { required: true };
  if (v.length > VIVIENDA_LIMITES.nombre) return { maxlength: true };
  return null;
};

/** Texto opcional: puede quedar vacío; si tiene contenido, máximo `max` caracteres (recortado). */
export function textoOpcionalValidator(max: number): ValidatorFn {
  return (control) => (String(control.value ?? '').trim().length > max ? { maxlength: true } : null);
}

/**
 * Entero opcional en [min, max]. Vacío/null es válido.
 * Errores: number (no numérico), integer (decimal), negative, min, max.
 */
export function enteroOpcionalValidator(min: number, max: number): ValidatorFn {
  return (control) => {
    const raw = control.value;
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return { number: true };
    if (!Number.isInteger(n)) return { integer: true };
    if (n < 0) return { negative: true };
    if (n < min) return { min: true };
    if (n > max) return { max: true };
    return null;
  };
}
