import type { Request, Response } from 'express';
import * as consumoService from '../services/consumo.service';
import * as proyeccionService from '../services/proyeccion.service';
import { usuarioId } from '../middlewares/auth.middleware';
import { parseId, parseOrThrow } from '../middlewares/validation.middleware';
import { created, ok } from '../utils/responses';
import {
  lecturasQuerySchema,
  periodosQuerySchema,
  proyeccionQuerySchema,
  usosQuerySchema,
} from '../validators/consumo.validator';

/* ----- Lecturas del medidor ----- */

export async function listarLecturas(req: Request, res: Response) {
  ok(res, await consumoService.listarLecturas(usuarioId(req), parseOrThrow(lecturasQuerySchema, req.query)));
}

export async function obtenerLectura(req: Request, res: Response) {
  ok(res, await consumoService.obtenerLectura(usuarioId(req), parseId(req.params['id'])));
}

export async function crearLectura(req: Request, res: Response) {
  created(res, await consumoService.crearLectura(usuarioId(req), req.body), 'Lectura registrada');
}

export async function eliminarLectura(req: Request, res: Response) {
  await consumoService.eliminarLectura(usuarioId(req), parseId(req.params['id']));
  ok(res, null, 'Lectura eliminada');
}

/* ----- Registros de uso ----- */

export async function listarUsos(req: Request, res: Response) {
  ok(res, await consumoService.listarUsos(usuarioId(req), parseOrThrow(usosQuerySchema, req.query)));
}

export async function obtenerUso(req: Request, res: Response) {
  ok(res, await consumoService.obtenerUso(usuarioId(req), parseId(req.params['id'])));
}

export async function crearUso(req: Request, res: Response) {
  created(res, await consumoService.crearUso(usuarioId(req), req.body), 'Registro de uso guardado');
}

export async function actualizarUso(req: Request, res: Response) {
  const data = await consumoService.actualizarUso(usuarioId(req), parseId(req.params['id']), req.body.horas_uso);
  ok(res, data, 'Registro de uso actualizado');
}

export async function eliminarUso(req: Request, res: Response) {
  await consumoService.eliminarUso(usuarioId(req), parseId(req.params['id']));
  ok(res, null, 'Registro de uso eliminado');
}

/* ----- Proyección y periodos ----- */

export async function obtenerProyeccion(req: Request, res: Response) {
  const q = parseOrThrow(proyeccionQuerySchema, req.query);
  ok(res, await proyeccionService.proyectar(usuarioId(req), q.id_vivienda, q.fecha));
}

export async function calcularPeriodo(req: Request, res: Response) {
  const { id_vivienda, fecha } = req.body;
  const data = await proyeccionService.calcularYGuardarPeriodo(usuarioId(req), id_vivienda, fecha);
  ok(res, data, 'Periodo calculado y guardado');
}

export async function listarPeriodos(req: Request, res: Response) {
  ok(res, await consumoService.listarPeriodos(usuarioId(req), parseOrThrow(periodosQuerySchema, req.query)));
}

export async function obtenerPeriodo(req: Request, res: Response) {
  ok(res, await consumoService.obtenerPeriodo(usuarioId(req), parseId(req.params['id'])));
}
