import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env';
import { AppError, fail } from '../utils/responses';

export const notFoundHandler: RequestHandler = (req, res) => {
  fail(res, 404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`);
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    fail(res, err.status, err.message, err.details);
    return;
  }

  const e = err as { code?: string; type?: string };

  // JSON mal formado en el body
  if (e.type === 'entity.parse.failed') {
    fail(res, 400, 'El cuerpo de la petición no es un JSON válido');
    return;
  }
  // Errores de integridad de MySQL
  if (e.code === 'ER_DUP_ENTRY') {
    fail(res, 409, 'Ya existe un registro con esos datos');
    return;
  }
  if (e.code === 'ER_NO_REFERENCED_ROW_2') {
    fail(res, 400, 'Referencia a un registro que no existe');
    return;
  }

  console.error('[error]', err);
  fail(res, 500, env.isProduction ? 'Error interno del servidor' : String((err as Error)?.message ?? err));
};
