import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { AuthUser } from '../types';
import { AppError } from './responses';

export function signToken(user: AuthUser): string {
  const options: SignOptions = {
    expiresIn: env.jwt.expiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign({ email: user.email }, env.jwt.secret, { ...options, subject: String(user.id) });
}

export function verifyToken(token: string): AuthUser {
  try {
    const payload = jwt.verify(token, env.jwt.secret);
    if (typeof payload === 'string') throw new Error('payload inválido');
    const id = Number(payload.sub);
    if (!Number.isInteger(id) || id <= 0 || typeof payload['email'] !== 'string') {
      throw new Error('payload inválido');
    }
    return { id, email: payload['email'] };
  } catch {
    throw AppError.unauthorized('Token inválido o expirado');
  }
}
