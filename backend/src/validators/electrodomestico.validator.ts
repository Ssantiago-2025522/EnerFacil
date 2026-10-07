import { z } from 'zod';

const nombre = z.string().trim().min(1, 'El nombre es obligatorio').max(100);
const potencia = z.number().positive('La potencia debe ser mayor que 0').max(100000);
const cantidad = z.number().int().min(1).max(1000);
const horas = z.number().min(0).max(24);
const dias = z.number().int().min(0).max(31);
const factor = z.number().min(0).max(1);

export const crearElectrodomesticoSchema = z
  .object({
    id_vivienda: z.number().int().positive().optional(),
    id_ambiente: z.number().int().positive().nullable().optional(),
    /** Si viene, se usan los valores promedio del catálogo como valores iniciales. */
    id_catalogo: z.number().int().positive().optional(),
    nombre: nombre.optional(),
    potencia_w: potencia.optional(),
    cantidad: cantidad.optional(),
    horas_uso_dia: horas.optional(),
    dias_uso_mes: dias.optional(),
    factor_uso: factor.optional(),
  })
  .superRefine((d, ctx) => {
    // Modo manual: sin catálogo, nombre y potencia son obligatorios
    if (d.id_catalogo === undefined) {
      if (d.nombre === undefined) {
        ctx.addIssue({ code: 'custom', path: ['nombre'], message: 'El nombre es obligatorio si no usas el catálogo' });
      }
      if (d.potencia_w === undefined) {
        ctx.addIssue({ code: 'custom', path: ['potencia_w'], message: 'La potencia es obligatoria si no usas el catálogo' });
      }
    }
  });

export const actualizarElectrodomesticoSchema = z
  .object({
    id_ambiente: z.number().int().positive().nullable().optional(),
    nombre: nombre.optional(),
    potencia_w: potencia.optional(),
    cantidad: cantidad.optional(),
    horas_uso_dia: horas.optional(),
    dias_uso_mes: dias.optional(),
    factor_uso: factor.optional(),
    activo: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Debes enviar al menos un campo para actualizar',
  });

export type CrearElectrodomesticoInput = z.infer<typeof crearElectrodomesticoSchema>;
export type ActualizarElectrodomesticoInput = z.infer<typeof actualizarElectrodomesticoSchema>;
