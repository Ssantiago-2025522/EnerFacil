import { z } from 'zod';
import { TIPOS_AMBIENTE } from '../types';

const nombre = z.string().trim().min(1, 'El nombre es obligatorio').max(80);
const tipo = z.enum(TIPOS_AMBIENTE);

export const crearAmbienteSchema = z.object({
  // Opcional: si el usuario tiene una sola vivienda se usa esa
  id_vivienda: z.number().int().positive().optional(),
  nombre,
  tipo: tipo.optional(),
});

export const actualizarAmbienteSchema = z
  .object({
    nombre: nombre.optional(),
    tipo: tipo.optional(),
  })
  .refine((d) => d.nombre !== undefined || d.tipo !== undefined, {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export type CrearAmbienteInput = z.infer<typeof crearAmbienteSchema>;
export type ActualizarAmbienteInput = z.infer<typeof actualizarAmbienteSchema>;
