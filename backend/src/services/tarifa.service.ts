import type { ResultSetHeader } from 'mysql2/promise';
import type { PoolConnection } from 'mysql2/promise';
import { buildSet, query, queryOne, withTransaction } from '../config/database';
import type { SqlParam } from '../config/database';
import type { Tarifa, TarifaConTramos, TarifaTramo, Vivienda } from '../types';
import type { ActualizarTarifaInput, CrearTarifaInput, TarifasQuery } from '../validators/tarifa.validator';
import { AppError } from '../utils/responses';
import * as viviendaService from './vivienda.service';

/**
 * Visibilidad: una tarifa es visible para el usuario si es predefinida (id_usuario IS NULL)
 * o si es una personalizada suya. Las de otros usuarios responden 404.
 * Las predefinidas son de solo lectura.
 */

const VISIBLE = '(id_usuario IS NULL OR id_usuario = ?)';

/* ------------------------------ Consultas ------------------------------ */

export async function listar(idUsuario: number, filtros: TarifasQuery): Promise<Tarifa[]> {
  const condiciones = ['activa = 1', VISIBLE];
  const params: SqlParam[] = [idUsuario];
  if (filtros.region) {
    condiciones.push('region = ?');
    params.push(filtros.region);
  }
  if (filtros.tipo) {
    condiciones.push('tipo = ?');
    params.push(filtros.tipo);
  }
  return query<Tarifa>(
    `SELECT * FROM tarifas WHERE ${condiciones.join(' AND ')}
      ORDER BY (id_usuario IS NULL) DESC, nombre`,
    params,
  );
}

async function obtenerFila(idUsuario: number, idTarifa: number): Promise<Tarifa> {
  const tarifa = await queryOne<Tarifa>(`SELECT * FROM tarifas WHERE id_tarifa = ? AND ${VISIBLE}`, [idTarifa, idUsuario]);
  if (!tarifa) throw AppError.notFound('Tarifa no encontrada');
  return tarifa;
}

export async function obtener(idUsuario: number, idTarifa: number): Promise<TarifaConTramos> {
  const tarifa = await obtenerFila(idUsuario, idTarifa);
  const tramos = await query<TarifaTramo>(
    'SELECT * FROM tarifa_tramos WHERE id_tarifa = ? ORDER BY kwh_desde',
    [idTarifa],
  );
  return { ...tarifa, tramos };
}

/** Tarifa asignada a la vivienda (con tramos), o null si no tiene. */
export async function obtenerActual(idUsuario: number, idVivienda?: number): Promise<TarifaConTramos | null> {
  const id = await viviendaService.resolverViviendaId(idUsuario, idVivienda);
  const vivienda = await viviendaService.obtener(idUsuario, id);
  return vivienda.id_tarifa === null ? null : obtener(idUsuario, vivienda.id_tarifa);
}

/* ------------------------------ Escritura ------------------------------ */

async function insertarTramos(conn: PoolConnection, idTarifa: number, tramos: CrearTarifaInput['tramos']) {
  const ordenados = [...tramos].sort((a, b) => a.kwh_desde - b.kwh_desde);
  for (const t of ordenados) {
    await conn.execute(
      'INSERT INTO tarifa_tramos (id_tarifa, kwh_desde, kwh_hasta, precio_kwh) VALUES (?, ?, ?, ?)',
      [idTarifa, t.kwh_desde, t.kwh_hasta, t.precio_kwh],
    );
  }
}

/** Crea una tarifa PERSONALIZADA del usuario autenticado (nunca predefinida). */
export async function crear(idUsuario: number, input: CrearTarifaInput): Promise<TarifaConTramos> {
  const idTarifa = await withTransaction(async (conn) => {
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO tarifas
         (id_usuario, nombre, distribuidora, region, tipo, cargo_fijo, cargo_potencia_kw,
          impuesto_pct, moneda, vigente_desde, vigente_hasta)
       VALUES (?, ?, ?, ?, 'PERSONALIZADA', ?, ?, ?, ?, ?, ?)`,
      [
        idUsuario,
        input.nombre,
        input.distribuidora ?? null,
        input.region ?? null,
        input.cargo_fijo,
        input.cargo_potencia_kw,
        input.impuesto_pct,
        input.moneda,
        input.vigente_desde,
        input.vigente_hasta ?? null,
      ],
    );
    await insertarTramos(conn, result.insertId, input.tramos);
    return result.insertId;
  });
  return obtener(idUsuario, idTarifa);
}

/** Solo se pueden modificar/eliminar tarifas propias; las predefinidas devuelven 403. */
async function obtenerPropia(idUsuario: number, idTarifa: number): Promise<Tarifa> {
  const tarifa = await obtenerFila(idUsuario, idTarifa);
  if (tarifa.id_usuario === null) throw new AppError(403, 'Las tarifas predefinidas no se pueden modificar');
  return tarifa;
}

export async function actualizar(
  idUsuario: number,
  idTarifa: number,
  input: ActualizarTarifaInput,
): Promise<TarifaConTramos> {
  const actual = await obtenerPropia(idUsuario, idTarifa);

  // Valida la vigencia resultante cuando solo se envía uno de los dos extremos
  const desde = input.vigente_desde ?? actual.vigente_desde;
  const hasta = input.vigente_hasta === undefined ? actual.vigente_hasta : input.vigente_hasta;
  if (hasta !== null && hasta < desde) {
    throw AppError.badRequest('vigente_hasta no puede ser anterior a vigente_desde');
  }

  const { clause, values } = buildSet(
    { ...input, tramos: undefined, activa: input.activa === undefined ? undefined : input.activa ? 1 : 0 },
    [
      'nombre',
      'distribuidora',
      'region',
      'cargo_fijo',
      'cargo_potencia_kw',
      'impuesto_pct',
      'moneda',
      'vigente_desde',
      'vigente_hasta',
      'activa',
    ],
  );

  await withTransaction(async (conn) => {
    if (clause) await conn.execute(`UPDATE tarifas SET ${clause} WHERE id_tarifa = ?`, [...values, idTarifa]);
    if (input.tramos) {
      await conn.execute('DELETE FROM tarifa_tramos WHERE id_tarifa = ?', [idTarifa]);
      await insertarTramos(conn, idTarifa, input.tramos);
    }
  });
  return obtener(idUsuario, idTarifa);
}

/** Las viviendas que la usaban quedan con id_tarifa = NULL (ON DELETE SET NULL). */
export async function eliminar(idUsuario: number, idTarifa: number): Promise<void> {
  await obtenerPropia(idUsuario, idTarifa);
  await withTransaction(async (conn) => {
    await conn.execute('DELETE FROM tarifas WHERE id_tarifa = ? AND id_usuario = ?', [idTarifa, idUsuario]);
  });
}

/** Asigna la tarifa a la vivienda (viviendas.id_tarifa), reutilizando la validación de vivienda.service. */
export async function asignar(idUsuario: number, idTarifa: number, idVivienda?: number): Promise<Vivienda> {
  await obtenerFila(idUsuario, idTarifa); // 404 si no existe o no es visible
  const id = await viviendaService.resolverViviendaId(idUsuario, idVivienda);
  return viviendaService.actualizar(idUsuario, id, { id_tarifa: idTarifa });
}

/* ------------------------------ Cálculo monetario ------------------------------ */

/** kW contratados: la tabla viviendas no tiene ese dato todavía, se usa 0. */
export const KW_CONTRATADOS_DEFAULT = 0;

/**
 * Monto de una factura para `kwh` según la tarifa. TODA la lógica tarifaria (tramos,
 * cargo fijo, cargo por potencia, impuesto) vive en la función SQL fn_calcular_monto;
 * aquí solo se invoca. No usa verificación de usuario: es interna (la propiedad se
 * verifica antes con la vivienda).
 */
export async function calcularMonto(
  idTarifa: number,
  kwh: number,
  kwContratados: number = KW_CONTRATADOS_DEFAULT,
): Promise<number> {
  const fila = await queryOne<{ monto: number | null }>('SELECT fn_calcular_monto(?, ?, ?) AS monto', [
    idTarifa,
    kwh,
    kwContratados,
  ]);
  return fila?.monto ?? 0;
}

export interface ResumenTarifa {
  id_tarifa: number;
  nombre: string;
  moneda: string;
}

export async function obtenerResumen(idTarifa: number): Promise<ResumenTarifa | null> {
  return queryOne<ResumenTarifa>('SELECT id_tarifa, nombre, moneda FROM tarifas WHERE id_tarifa = ?', [idTarifa]);
}
