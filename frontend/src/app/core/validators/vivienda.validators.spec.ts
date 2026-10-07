import { FormControl } from '@angular/forms';
import { enteroOpcionalValidator, nombreViviendaValidator, textoOpcionalValidator } from './vivienda.validators';

const run = (v: ValidatorLike, value: unknown) => v(new FormControl(value));
type ValidatorLike = (c: FormControl) => unknown;

describe('Validadores de vivienda (mismas reglas que el backend)', () => {
  it('nombre: obligatorio, sin espacios solos, máximo 100', () => {
    const v = nombreViviendaValidator as ValidatorLike;
    expect(run(v, '')).toEqual({ required: true });
    expect(run(v, '   ')).toEqual({ required: true });
    expect(run(v, 'a'.repeat(100))).toBeNull();
    expect(run(v, 'a'.repeat(101))).toEqual({ maxlength: true });
    expect(run(v, '  Mi casa  ')).toBeNull();
  });

  it('texto opcional: vacío permitido, máximo configurable', () => {
    const v = textoOpcionalValidator(255) as ValidatorLike;
    expect(run(v, '')).toBeNull();
    expect(run(v, null)).toBeNull();
    expect(run(v, 'x'.repeat(255))).toBeNull();
    expect(run(v, 'x'.repeat(256))).toEqual({ maxlength: true });
  });

  it('habitantes 1–255: enteros, sin decimales ni negativos', () => {
    const v = enteroOpcionalValidator(1, 255) as ValidatorLike;
    expect(run(v, null)).toBeNull();
    expect(run(v, '')).toBeNull();
    expect(run(v, 1)).toBeNull();
    expect(run(v, 255)).toBeNull();
    expect(run(v, 0)).toEqual({ min: true });
    expect(run(v, 256)).toEqual({ max: true });
    expect(run(v, -3)).toEqual({ negative: true });
    expect(run(v, 2.5)).toEqual({ integer: true });
    expect(run(v, 'abc')).toEqual({ number: true });
  });

  it('día de corte 1–28', () => {
    const v = enteroOpcionalValidator(1, 28) as ValidatorLike;
    expect(run(v, 1)).toBeNull();
    expect(run(v, 28)).toBeNull();
    expect(run(v, 0)).toEqual({ min: true });
    expect(run(v, 29)).toEqual({ max: true });
  });
});
