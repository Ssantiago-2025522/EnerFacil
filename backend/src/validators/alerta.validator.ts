import { z } from 'zod';
import { CANALES_ALERTA, TIPOS_ALERTA } from '../types';
import { idOpcional } from './comunes';

// alertas_config.porcentaje_umbral es DECIMAL(5,2) con CHECK > 0
const porcentaje = z.number().positive('El umbral debe ser mayor que 0').max(999.99);

export const crearAlertaConfigSchema = z.object({
  id_vivienda: z.number().int().positive().optional(),
  tipo: z.enum(TIPOS_ALERTA),
  porcentaje_umbral: porcentaje,
  canal: z.enum(CANALES_ALERTA).optional(),
  activa: z.boolean().optional(),
});

/** El tipo no se puede cambiar: se crea otra configuración. */
export const actualizarAlertaConfigSchema = z
  .object({
    porcentaje_umbral: porcentaje.optional(),
    canal: z.enum(CANALES_ALERTA).optional(),
    activa: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export const alertasQuerySchema = z.object({ id_vivienda: idOpcional });

export type CrearAlertaConfigInput = z.infer<typeof crearAlertaConfigSchema>;
export type ActualizarAlertaConfigInput = z.infer<typeof actualizarAlertaConfigSchema>;
export type AlertasQuery = z.infer<typeof alertasQuerySchema>;
