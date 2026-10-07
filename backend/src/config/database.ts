import mysql from 'mysql2/promise';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { env } from './env';

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  // DECIMAL llega como number (por defecto mysql2 lo entrega como string)
  decimalNumbers: true,
  // Las columnas DATE llegan como 'YYYY-MM-DD' (evita desfases de zona horaria)
  dateStrings: ['DATE'],
});

export type SqlParam = string | number | null;

/** Ejecuta un SELECT y devuelve las filas. Siempre usa consultas parametrizadas. */
export async function query<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

/** Devuelve la primera fila o null. */
export async function queryOne<T>(sql: string, params: SqlParam[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Ejecuta INSERT / UPDATE / DELETE. */
export async function execute(sql: string, params: SqlParam[] = []): Promise<ResultSetHeader> {
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return result;
}

/** true si el error de MySQL es de clave duplicada (UNIQUE). */
export function isDuplicateEntry(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

/**
 * Construye la cláusula SET de un UPDATE dinámico a partir de un objeto.
 * Solo se incluyen las columnas de la lista blanca cuyo valor no sea `undefined`.
 * Los nombres de columna nunca vienen del usuario, solo de la lista blanca.
 */
export function buildSet(
  data: Record<string, SqlParam | undefined>,
  allowed: readonly string[],
): { clause: string; values: SqlParam[] } {
  const parts: string[] = [];
  const values: SqlParam[] = [];
  for (const column of allowed) {
    const value = data[column];
    if (value !== undefined) {
      parts.push(`${column} = ?`);
      values.push(value);
    }
  }
  return { clause: parts.join(', '), values };
}

/** Ejecuta `fn` dentro de una transacción: commit si termina bien, rollback si lanza. */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function verificarConexion(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}
