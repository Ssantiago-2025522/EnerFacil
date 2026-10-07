import { HttpErrorResponse } from '@angular/common/http';

export type AuthField = 'nombre' | 'email' | 'password';

export type FieldErrors = Partial<Record<string, string>>;

export interface ApiError {
  status: number;
  /** Mensaje amigable para mostrar en la interfaz. */
  message: string;
  /** Errores asociados a un campo concreto (validación del backend). */
  fieldErrors: FieldErrors;
}

export interface ApiErrorOptions {
  /** Campos del formulario que pueden recibir errores del backend. Por defecto, los de autenticación. */
  fields?: readonly string[];
}

interface BackendErrorBody {
  message?: string;
  errors?: { campo?: string; mensaje?: string }[];
}

const FIELDS: readonly string[] = ['nombre', 'email', 'password'];

/** Convierte cualquier error de HttpClient en un mensaje entendible por el usuario. */
export function toApiError(err: unknown, options: ApiErrorOptions = {}): ApiError {
  const fields = options.fields ?? FIELDS;
  if (!(err instanceof HttpErrorResponse)) {
    console.error('[auth] Error inesperado', err);
    return { status: -1, message: 'Ocurrió un error inesperado. Inténtalo de nuevo.', fieldErrors: {} };
  }

  if (err.status === 0) {
    return {
      status: 0,
      message: 'No se pudo conectar con el servidor. Verifica tu conexión o que el backend esté en ejecución.',
      fieldErrors: {},
    };
  }

  const body = (err.error ?? {}) as BackendErrorBody;
  const backendMessage = typeof body.message === 'string' && body.message.trim() ? body.message : null;

  const fieldErrors: FieldErrors = {};
  if (Array.isArray(body.errors)) {
    for (const e of body.errors) {
      const campo = e.campo ?? '';
      if (e.mensaje && fields.includes(campo) && !fieldErrors[campo]) fieldErrors[campo] = e.mensaje;
    }
  }

  if (err.status === 400) {
    const hasFields = Object.keys(fieldErrors).length > 0;
    return {
      status: 400,
      message: hasFields ? 'Revisa los datos ingresados.' : (backendMessage ?? 'Los datos enviados no son válidos.'),
      fieldErrors,
    };
  }
  if (err.status === 401) {
    return { status: 401, message: backendMessage ?? 'Credenciales inválidas', fieldErrors };
  }
  if (err.status === 409) {
    const msg = backendMessage ?? 'Ya existe una cuenta con ese correo.';
    return { status: 409, message: msg, fieldErrors: fields.includes('email') ? { email: msg } : {} };
  }
  if (err.status === 429) {
    return { status: 429, message: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.', fieldErrors };
  }
  if (err.status >= 500) {
    return { status: err.status, message: 'El servidor tuvo un problema. Inténtalo de nuevo más tarde.', fieldErrors };
  }
  return {
    status: err.status,
    message: backendMessage ?? 'Ocurrió un error inesperado. Inténtalo de nuevo.',
    fieldErrors,
  };
}
