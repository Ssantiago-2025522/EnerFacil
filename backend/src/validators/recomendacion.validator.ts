import { z } from 'zod';
import { ESTADOS_RECOMENDACION } from '../types';
import { boolQuery, idOpcional } from './comunes';

export const generarRecomendacionesSchema = z.object({
  id_vivienda: z.number().int().positive().optional(),
});

export const actualizarRecomendacionSchema = z.object({
  estado: z.enum(ESTADOS_RECOMENDACION),
});

export const recomendacionesQuerySchema = z.object({
  id_vivienda: idOpcional,
  estado: z.enum(ESTADOS_RECOMENDACION).optional(),
  /** true = pendientes (NUEVA o VISTA); false = cerradas (APLICADA o DESCARTADA). */
  activas: boolQuery,
  /** Categoría de electrodoméstico de la plantilla. */
  id_categoria: idOpcional,
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export type GenerarRecomendacionesInput = z.infer<typeof generarRecomendacionesSchema>;
export type ActualizarRecomendacionInput = z.infer<typeof actualizarRecomendacionSchema>;
export type RecomendacionesQuery = z.infer<typeof recomendacionesQuerySchema>;
