import type { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { usuarioId } from '../middlewares/auth.middleware';
import { created, ok } from '../utils/responses';

export async function register(req: Request, res: Response) {
  const data = await authService.register(req.body);
  created(res, data, 'Usuario registrado correctamente');
}

export async function login(req: Request, res: Response) {
  const data = await authService.login(req.body);
  ok(res, data, 'Inicio de sesión exitoso');
}

export async function me(req: Request, res: Response) {
  const usuario = await authService.obtenerPerfil(usuarioId(req));
  ok(res, usuario);
}
