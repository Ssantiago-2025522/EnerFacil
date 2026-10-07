import type { Request, Response } from 'express';
import * as notificacionService from '../services/notificacion.service';
import { usuarioId } from '../middlewares/auth.middleware';
import { parseId, parseOrThrow } from '../middlewares/validation.middleware';
import { ok } from '../utils/responses';
import { notificacionesQuerySchema } from '../validators/notificacion.validator';

export async function listar(req: Request, res: Response) {
  ok(res, await notificacionService.listar(usuarioId(req), parseOrThrow(notificacionesQuerySchema, req.query)));
}

export async function marcarLeida(req: Request, res: Response) {
  const data = await notificacionService.marcarLeida(usuarioId(req), parseId(req.params['id']));
  ok(res, data, 'Notificación marcada como leída');
}
