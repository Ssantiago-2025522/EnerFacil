import { z } from 'zod';
import { boolQuery, fechaISO, idOpcional } from './comunes';

// presupuestos.monto_mensual es DECIMAL(12,2) con CHECK > 0
const monto = z.number().positive('El monto debe ser mayor que 0').max(9_999_999_999);

export const crearPresupuestoSchema = z
  .object({
    id_vivienda: z.number().int().positive().optional(),
    monto_mensual: monto,
    /** Por defecto, hoy. */
    vigente_desde: fechaISO.optional(),
    /** null / omitido = sin fecha de fin (presupuesto vigente indefinidamente). */
    vigente_hasta: fechaISO.nullable().optional(),
  })
  .refine((d) => !d.vigente_desde || !d.vigente_hasta || d.vigente_hasta >= d.vigente_desde, {
    message: '"vigente_hasta" no puede ser anterior a "vigente_desde"',
    path: ['vigente_hasta'],
  });

export const actualizarPresupuestoSchema = z
  .object({
    monto_mensual: monto.optional(),
    vigente_desde: fechaISO.optional(),
    vigente_hasta: fechaISO.nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Debes enviar al menos un campo para actualizar',
  })
  .refine((d) => !d.vigente_desde || !d.vigente_hasta || d.vigente_hasta >= d.vigente_desde, {
    message: '"vigente_hasta" no puede ser anterior a "vigente_desde"',
    path: ['vigente_hasta'],
  });

export const presupuestosQuerySchema = z.object({
  id_vivienda: idOpcional,
  /** true = solo el presupuesto vigente hoy. */
  vigente: boolQuery,
});

export type CrearPresupuestoInput = z.infer<typeof crearPresupuestoSchema>;
export type ActualizarPresupuestoInput = z.infer<typeof actualizarPresupuestoSchema>;
export type PresupuestosQuery = z.infer<typeof presupuestosQuerySchema>;
