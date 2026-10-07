import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { buildSet, query, queryOne, withTransaction } from '../config/database';
import type { SqlParam } from '../config/database';
import type { Presupuesto } from '../types';
import type {
  ActualizarPresupuestoInput,
  CrearPresupuestoInput,
  PresupuestosQuery,
} from '../validators/presupuesto.validator';
import { hoyISO, sumarDias } from '../utils/fechas';
import { AppError } from '../utils/responses';
import { asegurarPropiedad, resolverViviendaId } from './vivienda.service';

/**
 * Presupuestos mensuales por vivienda (tabla `presupuestos`).
 * La propiedad se verifica siempre con JOIN a viviendas.id_usuario (404 si no es del usuario).
 *
 * Regla de vigencia: un presupuesto está vigente en una fecha F si
 *   vigente_desde <= F  y  (vigente_hasta IS NULL  o  vigente_hasta >= F).
 * Para una vivienda no se permiten rangos solapados.
 */

const FIN_ABIERTO = '9999-12-31';
const r2 = (n: number) => Math.round(n * 100) / 100;

const SELECT_PRESUPUESTO = `
  SELECT p.id_presupuesto, p.id_vivienda, p.monto_mensual, p.vigente_desde, p.vigente_hasta, p.creado_en
    FROM presupuestos p
    JOIN viviendas v ON v.id_vivienda = p.id_vivienda`;

function conVigencia(p: Presupuesto, hoy: string): Presupuesto {
  const vigente = p.vigente_desde <= hoy && (p.vigente_hasta === null || p.vigente_hasta >= hoy);
  return { ...p, vigente };
}

/* ------------------------------ Consultas ------------------------------ */

export async function listar(idUsuario: number, filtros: PresupuestosQuery): Promise<Presupuesto[]> {
  const hoy = hoyISO();
  const condiciones = ['v.id_usuario = ?'];
  const params: SqlParam[] = [idUsuario];

  if (filtros.id_vivienda !== undefined) {
    await asegurarPropiedad(idUsuario, filtros.id_vivienda);
    condiciones.push('p.id_vivienda = ?');
    params.push(filtros.id_vivienda);
  }
  if (filtros.vigente !== undefined) {
    const vigente = 'p.vigente_desde <= ? AND (p.vigente_hasta IS NULL OR p.vigente_hasta >= ?)';
    condiciones.push(filtros.vigente ? `(${vigente})` : `NOT (${vigente})`);
    params.push(hoy, hoy);
  }

  const filas = await query<Presupuesto>(
    `${SELECT_PRESUPUESTO} WHERE ${condiciones.join(' AND ')}
      ORDER BY p.id_vivienda, p.vigente_desde DESC, p.id_presupuesto DESC`,
    params,
  );
  return filas.map((p) => conVigencia(p, hoy));
}

export async function obtener(idUsuario: number, idPresupuesto: number): Promise<Presupuesto> {
  const fila = await queryOne<Presupuesto>(`${SELECT_PRESUPUESTO} WHERE p.id_presupuesto = ? AND v.id_usuario = ?`, [
    idPresupuesto,
    idUsuario,
  ]);
  if (!fila) throw AppError.notFound('Presupuesto no encontrado');
  return conVigencia(fila, hoyISO());
}

/**
 * Presupuesto vigente de una vivienda en `fecha` (por defecto hoy), o null.
 * NO verifica propiedad: uso interno (jobs / alertas). Desde HTTP, usar `listar`.
 */
export async function obtenerVigente(idVivienda: number, fecha: string = hoyISO()): Promise<Presupuesto | null> {
  const fila = await queryOne<Presupuesto>(
    `SELECT id_presupuesto, id_vivienda, monto_mensual, vigente_desde, vigente_hasta, creado_en
       FROM presupuestos
      WHERE id_vivienda = ? AND vigente_desde <= ? AND (vigente_hasta IS NULL OR vigente_hasta >= ?)
      ORDER BY vigente_desde DESC, id_presupuesto DESC
      LIMIT 1`,
    [idVivienda, fecha, fecha],
  );
  return fila ? { ...fila, vigente: true } : null;
}

/* ------------------------------ Escritura ------------------------------ */

/**
 * Evita rangos de vigencia solapados dentro de la misma vivienda.
 * Con `cerrarAnteriores` (alta de un presupuesto nuevo) los presupuestos que empiezan ANTES y
 * terminan dentro del nuevo rango (típicamente el abierto, sin fecha de fin) se cierran el día
 * previo al inicio del nuevo. Cualquier otro solape es un conflicto (409).
 */
async function resolverSolapes(
  conn: PoolConnection,
  idVivienda: number,
  desde: string,
  hasta: string | null,
  excluirId: number,
  cerrarAnteriores: boolean,
): Promise<void> {
  const finNuevo = hasta ?? FIN_ABIERTO;
  const [filas] = await conn.execute<RowDataPacket[]>(
    `SELECT id_presupuesto, vigente_desde, vigente_hasta
       FROM presupuestos
      WHERE id_vivienda = ? AND id_presupuesto <> ?
        AND vigente_desde <= ? AND COALESCE(vigente_hasta, ?) >= ?
      FOR UPDATE`,
    [idVivienda, excluirId, finNuevo, FIN_ABIERTO, desde],
  );

  const aCerrar: number[] = [];
  for (const f of filas) {
    const exDesde = f['vigente_desde'] as string;
    const exHasta = (f['vigente_hasta'] as string | null) ?? FIN_ABIERTO;
    if (cerrarAnteriores && exDesde < desde && exHasta <= finNuevo) {
      aCerrar.push(f['id_presupuesto'] as number);
    } else {
      throw AppError.conflict(
        `El rango de vigencia se solapa con otro presupuesto de la vivienda (${exDesde} a ${
          (f['vigente_hasta'] as string | null) ?? 'sin fin'
        }). Ajusta las fechas o edita ese presupuesto.`,
      );
    }
  }
  for (const id of aCerrar) {
    await conn.execute('UPDATE presupuestos SET vigente_hasta = ? WHERE id_presupuesto = ?', [sumarDias(desde, -1), id]);
  }
}

/** Crea un presupuesto. Si hay uno abierto anterior, queda cerrado el día previo a `vigente_desde`. */
export async function crear(idUsuario: number, input: CrearPresupuestoInput): Promise<Presupuesto> {
  const idVivienda = await resolverViviendaId(idUsuario, input.id_vivienda);
  const desde = input.vigente_desde ?? hoyISO();
  const hasta = input.vigente_hasta ?? null;
  if (hasta !== null && hasta < desde) {
    throw AppError.badRequest('"vigente_hasta" no puede ser anterior a "vigente_desde"');
  }
  const monto = r2(input.monto_mensual);
  if (monto <= 0) throw AppError.badRequest('El monto debe ser mayor que 0');

  const id = await withTransaction(async (conn) => {
    await resolverSolapes(conn, idVivienda, desde, hasta, 0, true);
    const [res] = await conn.execute<ResultSetHeader>(
      'INSERT INTO presupuestos (id_vivienda, monto_mensual, vigente_desde, vigente_hasta) VALUES (?, ?, ?, ?)',
      [idVivienda, monto, desde, hasta],
    );
    return res.insertId;
  });
  return obtener(idUsuario, id);
}

/** Edita monto y/o vigencia. Un solape con otro presupuesto se rechaza (no se recortan otros). */
export async function actualizar(
  idUsuario: number,
  idPresupuesto: number,
  input: ActualizarPresupuestoInput,
): Promise<Presupuesto> {
  const actual = await obtener(idUsuario, idPresupuesto); // 404 si no es del usuario

  const desde = input.vigente_desde ?? actual.vigente_desde;
  const hasta = input.vigente_hasta === undefined ? actual.vigente_hasta : input.vigente_hasta;
  if (hasta !== null && hasta < desde) {
    throw AppError.badRequest('"vigente_hasta" no puede ser anterior a "vigente_desde"');
  }
  const monto = input.monto_mensual === undefined ? undefined : r2(input.monto_mensual);
  if (monto !== undefined && monto <= 0) throw AppError.badRequest('El monto debe ser mayor que 0');

  const { clause, values } = buildSet({ monto_mensual: monto, vigente_desde: input.vigente_desde, vigente_hasta: input.vigente_hasta }, [
    'monto_mensual',
    'vigente_desde',
    'vigente_hasta',
  ]);

  await withTransaction(async (conn) => {
    await resolverSolapes(conn, actual.id_vivienda, desde, hasta, idPresupuesto, false);
    if (clause) await conn.execute(`UPDATE presupuestos SET ${clause} WHERE id_presupuesto = ?`, [...values, idPresupuesto]);
  });
  return obtener(idUsuario, idPresupuesto);
}
