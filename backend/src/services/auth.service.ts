import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { execute, isDuplicateEntry, queryOne } from '../config/database';
import type { Usuario, UsuarioPublico } from '../types';
import type { LoginInput, RegisterInput } from '../validators/auth.validator';
import { signToken } from '../utils/jwt';
import { AppError } from '../utils/responses';

const COLUMNAS_PUBLICAS = 'id_usuario, nombre, email';

export async function register(input: RegisterInput): Promise<{ usuario: UsuarioPublico; token: string }> {
  const existente = await queryOne<{ id_usuario: number }>('SELECT id_usuario FROM usuarios WHERE email = ?', [
    input.email,
  ]);
  if (existente) throw AppError.conflict('Ya existe una cuenta con ese email');

  // La contraseña nunca se guarda en texto plano: solo el hash bcrypt
  const passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);

  let idUsuario: number;
  try {
    const result = await execute('INSERT INTO usuarios (nombre, email, password_hash) VALUES (?, ?, ?)', [
      input.nombre,
      input.email,
      passwordHash,
    ]);
    idUsuario = result.insertId;
  } catch (err) {
    // Carrera entre dos registros simultáneos con el mismo email
    if (isDuplicateEntry(err)) throw AppError.conflict('Ya existe una cuenta con ese email');
    throw err;
  }

  const usuario: UsuarioPublico = { id_usuario: idUsuario, nombre: input.nombre, email: input.email };
  return { usuario, token: signToken({ id: idUsuario, email: input.email }) };
}

export async function login(input: LoginInput): Promise<{ usuario: UsuarioPublico; token: string }> {
  const fila = await queryOne<Usuario>('SELECT * FROM usuarios WHERE email = ?', [input.email]);

  // Mismo mensaje para email inexistente y contraseña incorrecta (no revela qué falló)
  const credencialesInvalidas = AppError.unauthorized('Credenciales inválidas');
  if (!fila || !fila.activo) throw credencialesInvalidas;

  const coincide = await bcrypt.compare(input.password, fila.password_hash);
  if (!coincide) throw credencialesInvalidas;

  return {
    usuario: { id_usuario: fila.id_usuario, nombre: fila.nombre, email: fila.email },
    token: signToken({ id: fila.id_usuario, email: fila.email }),
  };
}

export async function obtenerPerfil(idUsuario: number): Promise<UsuarioPublico> {
  const usuario = await queryOne<UsuarioPublico>(
    `SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id_usuario = ? AND activo = 1`,
    [idUsuario],
  );
  if (!usuario) throw AppError.unauthorized('El usuario ya no existe o está inactivo');
  return usuario;
}
