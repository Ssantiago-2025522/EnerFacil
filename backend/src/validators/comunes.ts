import { z } from 'zod';
import { esFechaValida } from '../utils/fechas';

/** Fecha 'YYYY-MM-DD' real (rechaza 2026-02-31). */
export const fechaISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato YYYY-MM-DD')
  .refine(esFechaValida, 'Fecha inexistente');

export const idOpcional = z.coerce.number().int().positive().optional();

/** Booleano en query string: 'true' | 'false'. */
export const boolQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();
