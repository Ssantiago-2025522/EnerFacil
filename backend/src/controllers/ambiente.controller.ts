import type { Request, Response } from 'express';
import * as ambienteService from '../services/ambiente.service';
import { usuarioId } from '../middlewares/auth.middleware';
import { parseId } from '../middlewares/validation.middleware';
import { created, ok } from '../utils/responses';

export async function listar(req: Request, res: Response) {
  const idVivienda = req.query['id_vivienda'] !== undefined ? parseId(req.query['id_vivienda'], 'id_vivienda') : undefined;
  ok(res, await ambienteService.listar(usuarioId(req), idVivienda));
}

export async function obtener(req: Request, res: Response) {
  ok(res, await ambienteService.obtener(usuarioId(req), parseId(req.params['id'])));
}

export async function crear(req: Request, res: Response) {
  created(res, await ambienteService.crear(usuarioId(req), req.body), 'Ambiente creado');
}

export async function actualizar(req: Request, res: Response) {
  const data = await ambienteService.actualizar(usuarioId(req), parseId(req.params['id']), req.body);
  ok(res, data, 'Ambiente actualizado');
}

export async function eliminar(req: Request, res: Response) {
  await ambienteService.eliminar(usuarioId(req), parseId(req.params['id']));
  ok(res, null, 'Ambiente eliminado');
}
