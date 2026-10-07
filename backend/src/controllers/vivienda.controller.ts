import type { Request, Response } from 'express';
import * as viviendaService from '../services/vivienda.service';
import { usuarioId } from '../middlewares/auth.middleware';
import { parseId } from '../middlewares/validation.middleware';
import { created, ok } from '../utils/responses';

export async function listar(req: Request, res: Response) {
  ok(res, await viviendaService.listar(usuarioId(req)));
}

export async function obtener(req: Request, res: Response) {
  ok(res, await viviendaService.obtener(usuarioId(req), parseId(req.params['id'])));
}

export async function crear(req: Request, res: Response) {
  created(res, await viviendaService.crear(usuarioId(req), req.body), 'Vivienda creada');
}

export async function actualizar(req: Request, res: Response) {
  const data = await viviendaService.actualizar(usuarioId(req), parseId(req.params['id']), req.body);
  ok(res, data, 'Vivienda actualizada');
}

export async function eliminar(req: Request, res: Response) {
  await viviendaService.eliminar(usuarioId(req), parseId(req.params['id']));
  ok(res, null, 'Vivienda eliminada');
}
