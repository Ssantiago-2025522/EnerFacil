import { z } from 'zod';
import { esFechaValida } from '../utils/fechas';

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato YYYY-MM-DD')
  .refine(esFechaValida, 'Fecha inexistente');

const idOpcional = z.coerce.number().int().positive().optional();
const limit = z.coerce.number().int().min(1).max(1000).optional();

const rangoValido = (q: { desde?: string | undefined; hasta?: string | undefined }) =>
  !q.desde || !q.hasta || q.desde <= q.hasta;
const MSG_RANGO = { message: '"desde" no puede ser posterior a "hasta"', path: ['desde'] };

/* ------------------------------ Bodies ------------------------------ */

export const crearLecturaSchema = z.object({
  id_vivienda: z.number().int().positive().optional(),
  fecha_lectura: fecha,
  // DECIMAL(12,2)
  lectura_kwh: z.number().min(0).max(9_999_999_999),
  observacion: z.string().trim().max(255).nullable().optional(),
});

export const crearUsoSchema = z.object({
  id_electrodomestico: z.number().int().positive(),
  fecha,
  horas_uso: z.number().min(0).max(24),
});

export const actualizarUsoSchema = z.object({
  horas_uso: z.number().min(0).max(24),
});

export const calcularPeriodoSchema = z.object({
  id_vivienda: z.number().int().positive().optional(),
  /** Fecha de referencia dentro del periodo a calcular (por defecto, hoy). */
  fecha: fecha.optional(),
});

/* ------------------------------ Queries ------------------------------ */

export const lecturasQuerySchema = z
  .object({ id_vivienda: idOpcional, desde: fecha.optional(), hasta: fecha.optional(), limit })
  .refine(rangoValido, MSG_RANGO);

export const usosQuerySchema = z
  .object({
    id_vivienda: idOpcional,
    id_electrodomestico: idOpcional,
    desde: fecha.optional(),
    hasta: fecha.optional(),
    limit,
  })
  .refine(rangoValido, MSG_RANGO);

export const proyeccionQuerySchema = z.object({ id_vivienda: idOpcional, fecha: fecha.optional() });

export const periodosQuerySchema = z.object({ id_vivienda: idOpcional, limit });

export type CrearLecturaInput = z.infer<typeof crearLecturaSchema>;
export type CrearUsoInput = z.infer<typeof crearUsoSchema>;
export type ActualizarUsoInput = z.infer<typeof actualizarUsoSchema>;
export type CalcularPeriodoInput = z.infer<typeof calcularPeriodoSchema>;
export type LecturasQuery = z.infer<typeof lecturasQuerySchema>;
export type UsosQuery = z.infer<typeof usosQuerySchema>;
export type ProyeccionQuery = z.infer<typeof proyeccionQuerySchema>;
export type PeriodosQuery = z.infer<typeof periodosQuerySchema>;
