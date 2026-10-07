import { ValidatorFn } from '@angular/forms';
import { AMBIENTE_LIMITES } from '../models/ambiente.models';

/** Nombre: obligatorio, 1–80 caracteres sin contar espacios en los extremos (igual que el backend). */
export const nombreAmbienteValidator: ValidatorFn = (control) => {
  const v = String(control.value ?? '').trim();
  if (!v) return { required: true };
  if (v.length > AMBIENTE_LIMITES.nombre) return { maxlength: true };
  return null;
};
