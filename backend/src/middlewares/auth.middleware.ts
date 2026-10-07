import type { Request, RequestHandler } from 'express';
import { verifyToken } from '../utils/jwt';
import { AppError } from '../utils/responses';

/** Exige un JWT válido en `Authorization: Bearer <token>` y expone req.user. */
export const authMiddleware: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(AppError.unauthorized('Falta el token de autenticación'));
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    req.user = verifyToken(token);
    next();
  } catch (err) {
    next(err);
  }
};

/** Id del usuario autenticado. Siempre sale del token, nunca del body/query. */
export function usuarioId(req: Request): number {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
}
