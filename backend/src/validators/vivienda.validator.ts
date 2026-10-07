import { z } from 'zod';

const texto = (max: number) => z.string().trim().min(1).max(max);

const base = {
  nombre: texto(100),
  direccion: texto(255).nullable(),
  region: texto(120).nullable(),
  num_habitantes: z.number().int().min(1).max(255).nullable(),
  // El schema SQL restringe el día de corte entre 1 y 28
  dia_corte: z.number().int().min(1).max(28),
  id_tarifa: z.number().int().positive().nullable(),
};

export const crearViviendaSchema = z.object({
  nombre: base.nombre,
  direccion: base.direccion.optional(),
  region: base.region.optional(),
  num_habitantes: base.num_habitantes.optional(),
  dia_corte: base.dia_corte.optional(),
  id_tarifa: base.id_tarifa.optional(),
});

export const actualizarViviendaSchema = z
  .object({
    nombre: base.nombre.optional(),
    direccion: base.direccion.optional(),
    region: base.region.optional(),
    num_habitantes: base.num_habitantes.optional(),
    dia_corte: base.dia_corte.optional(),
    id_tarifa: base.id_tarifa.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export type CrearViviendaInput = z.infer<typeof crearViviendaSchema>;
export type ActualizarViviendaInput = z.infer<typeof actualizarViviendaSchema>;
