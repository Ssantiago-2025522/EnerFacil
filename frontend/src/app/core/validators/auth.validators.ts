import { ValidatorFn } from '@angular/forms';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Nombre: obligatorio, 2–100 caracteres (sin contar espacios en los extremos), igual que el backend. */
export const nombreValidator: ValidatorFn = (control) => {
  const v = String(control.value ?? '').trim();
  if (!v) return { required: true };
  if (v.length < 2) return { minlength: true };
  if (v.length > 100) return { maxlength: true };
  return null;
};

/** Email: obligatorio, formato válido, máximo 150 caracteres. */
export const emailValidator: ValidatorFn = (control) => {
  const v = String(control.value ?? '').trim();
  if (!v) return { required: true };
  if (v.length > 150) return { maxlength: true };
  if (!EMAIL_RE.test(v)) return { email: true };
  return null;
};
