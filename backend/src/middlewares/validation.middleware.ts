import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/responses';

/** Valida y normaliza req.body con un schema de Zod. */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({
        campo: i.path.join('.'),
        mensaje: i.message,
      }));
      return next(AppError.badRequest('Datos inválidos', errors));
    }
    req.body = result.data;
    next();
  };
}

/** Valida un schema contra un objeto cualquiera (p. ej. req.query) dentro de un controlador. */
export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message }));
    throw AppError.badRequest('Parámetros inválidos', errors);
  }
  return result.data;
}

const idSchema = z.coerce.number().int().positive();

/** Convierte un parámetro de ruta (o query) en un id entero positivo. */
export function parseId(value: unknown, nombre = 'id'): number {
  const result = idSchema.safeParse(value);
  if (!result.success) throw AppError.badRequest(`El parámetro ${nombre} no es válido`);
  return result.data;
}
