import { execute, query, queryOne } from '../config/database';
import type { SqlParam } from '../config/database';
import type { NivelSemaforo, Notificacion } from '../types';
import type { NotificacionesQuery } from '../validators/notificacion.validator';
import { AppError } from '../utils/responses';
import { asegurarPropiedad } from './vivienda.service';

/**
 * Notificaciones del usuario (tabla `notificaciones`).
 * Cada consulta filtra por notificaciones.id_usuario = usuario autenticado: una notificación de
 * otro usuario responde 404 (no se revela su existencia).
 */

const SELECT_NOTIFICACION = `
  SELECT id_notificacion, id_usuario, id_vivienda, id_alerta_config, id_periodo,
         nivel, titulo, mensaje, leida, enviada_en
    FROM notificaciones`;

export async function listar(idUsuario: number, filtros: NotificacionesQuery): Promise<Notificacion[]> {
  const condiciones = ['id_usuario = ?'];
  const params: SqlParam[] = [idUsuario];

  if (filtros.id_vivienda !== undefined) {
    await asegurarPropiedad(idUsuario, filtros.id_vivienda);
    condiciones.push('id_vivienda = ?');
    params.push(filtros.id_vivienda);
  }
  if (filtros.leida !== undefined) {
    condiciones.push('leida = ?');
    params.push(filtros.leida ? 1 : 0);
  }
  // `limit` ya fue validado como entero (1-200) por Zod
  const limit = filtros.limit ?? 50;
  return query<Notificacion>(
    `${SELECT_NOTIFICACION} WHERE ${condiciones.join(' AND ')}
      ORDER BY enviada_en DESC, id_notificacion DESC LIMIT ${limit}`,
    params,
  );
}

export async function obtener(idUsuario: number, idNotificacion: number): Promise<Notificacion> {
  const fila = await queryOne<Notificacion>(`${SELECT_NOTIFICACION} WHERE id_notificacion = ? AND id_usuario = ?`, [
    idNotificacion,
    idUsuario,
  ]);
  if (!fila) throw AppError.notFound('Notificación no encontrada');
  return fila;
}

/** Marca como leída (idempotente). */
export async function marcarLeida(idUsuario: number, idNotificacion: number): Promise<Notificacion> {
  await obtener(idUsuario, idNotificacion); // 404 si no es del usuario
  await execute('UPDATE notificaciones SET leida = 1 WHERE id_notificacion = ? AND id_usuario = ?', [
    idNotificacion,
    idUsuario,
  ]);
  return obtener(idUsuario, idNotificacion);
}

/* ------------------------------ Uso interno (jobs) ------------------------------ */

export interface NuevaNotificacion {
  idUsuario: number;
  idVivienda: number;
  idAlertaConfig: number;
  idPeriodo: number;
  nivel: NivelSemaforo;
  titulo: string;
  mensaje: string;
}

/**
 * Inserta la notificación solo si NO existe ya una para (periodo, configuración, nivel).
 * Es un único INSERT ... SELECT ... WHERE NOT EXISTS, por lo que dos ejecuciones simultáneas del
 * cron tampoco duplican. Si el nivel cambia (p. ej. AMARILLO -> ROJO) la clave es distinta y se crea
 * una nueva. Devuelve true si se insertó, false si ya existía.
 */
export async function crearSiNoExiste(n: NuevaNotificacion): Promise<boolean> {
  const result = await execute(
    `INSERT INTO notificaciones
       (id_usuario, id_vivienda, id_alerta_config, id_periodo, nivel, titulo, mensaje)
     SELECT ?, ?, ?, ?, ?, ?, ?
       FROM DUAL
      WHERE NOT EXISTS (
        SELECT 1 FROM notificaciones
         WHERE id_periodo = ? AND id_alerta_config = ? AND nivel = ?
      )`,
    [
      n.idUsuario,
      n.idVivienda,
      n.idAlertaConfig,
      n.idPeriodo,
      n.nivel,
      n.titulo,
      n.mensaje,
      n.idPeriodo,
      n.idAlertaConfig,
      n.nivel,
    ],
  );
  return result.affectedRows > 0;
}

/** Cantidad de notificaciones no leídas del usuario en una vivienda (la usa el dashboard). */
export async function contarNoLeidas(idUsuario: number, idVivienda: number): Promise<number> {
  const fila = await queryOne<{ total: number }>(
    'SELECT COUNT(*) AS total FROM notificaciones WHERE id_usuario = ? AND id_vivienda = ? AND leida = 0',
    [idUsuario, idVivienda],
  );
  return Number(fila?.total ?? 0);
}
