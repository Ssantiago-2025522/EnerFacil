import type { Request, Response } from 'express';
import { z } from 'zod';
import * as electroService from '../services/electrodomestico.service';
import { usuarioId } from '../middlewares/auth.middleware';
import { parseId, parseOrThrow } from '../middlewares/validation.middleware';
import { created, ok } from '../utils/responses';

const catalogoQuery = z.object({
  id_categoria: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).optional(),
});

const listarQuery = z.object({
  id_vivienda: z.coerce.number().int().positive().optional(),
  id_ambiente: z.coerce.number().int().positive().optional(),
  activo: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

/* Catálogo (requiere sesión, pero es común a todos los usuarios) */

export async function listarCatalogo(req: Request, res: Response) {
  ok(res, await electroService.listarCatalogo(parseOrThrow(catalogoQuery, req.query)));
}

export async function obtenerCatalogo(req: Request, res: Response) {
  ok(res, await electroService.obtenerCatalogo(parseId(req.params['id'])));
}

/* CRUD de electrodomésticos de la vivienda */

export async function listar(req: Request, res: Response) {
  ok(res, await electroService.listar(usuarioId(req), parseOrThrow(listarQuery, req.query)));
}

export async function obtener(req: Request, res: Response) {
  ok(res, await electroService.obtener(usuarioId(req), parseId(req.params['id'])));
}

export async function crear(req: Request, res: Response) {
  created(res, await electroService.crear(usuarioId(req), req.body), 'Electrodoméstico registrado');
}

export async function actualizar(req: Request, res: Response) {
  const data = await electroService.actualizar(usuarioId(req), parseId(req.params['id']), req.body);
  ok(res, data, 'Electrodoméstico actualizado');
}

export async function eliminar(req: Request, res: Response) {
  await electroService.eliminar(usuarioId(req), parseId(req.params['id']));
  ok(res, null, 'Electrodoméstico eliminado');
}
