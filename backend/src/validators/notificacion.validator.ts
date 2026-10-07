import { z } from 'zod';
import { boolQuery, idOpcional } from './comunes';

export const notificacionesQuerySchema = z.object({
  id_vivienda: idOpcional,
  /** false = solo no leídas; true = solo leídas; omitido = todas. */
  leida: boolQuery,
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type NotificacionesQuery = z.infer<typeof notificacionesQuerySchema>;
