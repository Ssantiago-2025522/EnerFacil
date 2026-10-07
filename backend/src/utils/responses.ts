import type { Response } from 'express';

/** Error controlado de la aplicación: se convierte en una respuesta HTTP. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, message, details);
  }
  static unauthorized(message = 'No autenticado') {
    return new AppError(401, message);
  }
  static notFound(message = 'Recurso no encontrado') {
    return new AppError(404, message);
  }
  static conflict(message: string) {
    return new AppError(409, message);
  }
}

export function ok<T>(res: Response, data: T, message?: string): Response {
  return res.status(200).json({ success: true, ...(message ? { message } : {}), data });
}

export function created<T>(res: Response, data: T, message?: string): Response {
  return res.status(201).json({ success: true, ...(message ? { message } : {}), data });
}

export function fail(res: Response, status: number, message: string, errors?: unknown): Response {
  return res.status(status).json({ success: false, message, ...(errors ? { errors } : {}) });
}
