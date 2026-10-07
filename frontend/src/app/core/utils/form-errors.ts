import { AbstractControl } from '@angular/forms';

export type FieldKind =
  | 'nombre'
  | 'email'
  | 'passwordRegister'
  | 'passwordLogin'
  | 'viviendaNombre'
  | 'viviendaDireccion'
  | 'viviendaRegion'
  | 'viviendaHabitantes'
  | 'viviendaDiaCorte'
  | 'ambienteNombre'
  | 'electroNombre'
  | 'electroPotencia'
  | 'electroCantidad'
  | 'electroHoras'
  | 'electroDias'
  | 'electroFactor'
  | 'consumoFecha'
  | 'consumoLectura'
  | 'consumoHoras'
  | 'consumoObservacion'
  | 'consumoEquipo'
  | 'presupuestoMonto'
  | 'alertaUmbral';

const MESSAGES: Record<FieldKind, Record<string, string>> = {
  nombre: {
    required: 'El nombre es obligatorio',
    minlength: 'El nombre debe tener al menos 2 caracteres',
    maxlength: 'El nombre no puede superar los 100 caracteres',
  },
  email: {
    required: 'El correo es obligatorio',
    email: 'Ingresa un correo válido, por ejemplo tu@correo.com',
    maxlength: 'El correo no puede superar los 150 caracteres',
  },
  passwordRegister: {
    required: 'La contraseña es obligatoria',
    minlength: 'La contraseña debe tener al menos 8 caracteres',
    maxlength: 'La contraseña no puede superar los 72 caracteres',
  },
  passwordLogin: {
    required: 'La contraseña es obligatoria',
    maxlength: 'La contraseña no puede superar los 72 caracteres',
  },
  viviendaNombre: {
    required: 'El nombre de la vivienda es obligatorio',
    maxlength: 'El nombre no puede superar los 100 caracteres',
  },
  viviendaDireccion: { maxlength: 'La dirección no puede superar los 255 caracteres' },
  viviendaRegion: { maxlength: 'La región no puede superar los 120 caracteres' },
  viviendaHabitantes: {
    number: 'Ingresa un número válido',
    integer: 'Ingresa un número entero, sin decimales',
    negative: 'No se permiten números negativos',
    min: 'Debe ser al menos 1 habitante',
    max: 'No puede superar los 255 habitantes',
  },
  viviendaDiaCorte: {
    number: 'Ingresa un número válido',
    integer: 'Ingresa un número entero, sin decimales',
    negative: 'No se permiten números negativos',
    min: 'El día de corte debe estar entre 1 y 28',
    max: 'El día de corte debe estar entre 1 y 28',
  },
  ambienteNombre: {
    required: 'El nombre del ambiente es obligatorio',
    maxlength: 'El nombre no puede superar los 80 caracteres',
  },
  electroNombre: {
    required: 'El nombre del electrodoméstico es obligatorio',
    maxlength: 'El nombre no puede superar los 100 caracteres',
  },
  electroPotencia: {
    required: 'La potencia es obligatoria',
    number: 'Ingresa un número válido',
    negative: 'No se permiten números negativos',
    min: 'La potencia debe ser mayor que 0',
    max: 'La potencia no puede superar los 100.000 W',
  },
  electroCantidad: {
    required: 'La cantidad es obligatoria',
    number: 'Ingresa un número válido',
    integer: 'Ingresa un número entero, sin decimales',
    negative: 'No se permiten números negativos',
    min: 'La cantidad debe ser al menos 1',
    max: 'La cantidad no puede superar 1.000',
  },
  electroHoras: {
    required: 'Las horas de uso son obligatorias',
    number: 'Ingresa un número válido',
    negative: 'No se permiten números negativos',
    min: 'Las horas deben estar entre 0 y 24',
    max: 'Las horas deben estar entre 0 y 24',
  },
  electroDias: {
    required: 'Los días de uso son obligatorios',
    number: 'Ingresa un número válido',
    integer: 'Ingresa un número entero, sin decimales',
    negative: 'No se permiten números negativos',
    min: 'Los días deben estar entre 0 y 31',
    max: 'Los días deben estar entre 0 y 31',
  },
  electroFactor: {
    required: 'El factor de uso es obligatorio',
    number: 'Ingresa un número válido',
    negative: 'No se permiten números negativos',
    min: 'El factor debe estar entre 0 y 1',
    max: 'El factor debe estar entre 0 y 1',
  },
  consumoFecha: {
    required: 'La fecha es obligatoria',
    invalid: 'Ingresa una fecha válida',
    future: 'La fecha no puede ser futura',
  },
  consumoLectura: {
    required: 'La lectura del medidor es obligatoria',
    number: 'Ingresa un número válido',
    negative: 'No se permiten números negativos',
    min: 'La lectura no puede ser negativa',
    max: 'La lectura es demasiado grande',
  },
  consumoHoras: {
    required: 'Las horas de uso son obligatorias',
    number: 'Ingresa un número válido',
    negative: 'No se permiten números negativos',
    min: 'Las horas deben estar entre 0 y 24',
    max: 'Las horas deben estar entre 0 y 24',
  },
  consumoObservacion: { maxlength: 'La observación no puede superar los 255 caracteres' },
  consumoEquipo: { required: 'Elige un electrodoméstico' },
  presupuestoMonto: {
    required: 'El monto del presupuesto es obligatorio',
    number: 'Ingresa un número válido',
    negative: 'No se permiten números negativos',
    min: 'El monto debe ser mayor que 0',
    max: 'El monto es demasiado grande',
    decimals: 'Usa como máximo 2 decimales',
  },
  alertaUmbral: {
    required: 'El porcentaje es obligatorio',
    number: 'Ingresa un número válido',
    negative: 'No se permiten números negativos',
    min: 'El porcentaje debe ser mayor que 0',
    max: 'El porcentaje no puede superar 999,99',
    decimals: 'Usa como máximo 2 decimales',
  },
};

/** Mensaje de error a mostrar para un control (solo si fue tocado), o null. */
export function controlError(control: AbstractControl, kind: FieldKind): string | null {
  if (!control.invalid || !(control.touched || control.dirty)) return null;
  const errors = control.errors ?? {};
  // Error devuelto por el backend para este campo
  if (typeof errors['server'] === 'string') return errors['server'];
  for (const key of Object.keys(errors)) {
    const msg = MESSAGES[kind][key];
    if (msg) return msg;
  }
  return 'Valor no válido';
}
