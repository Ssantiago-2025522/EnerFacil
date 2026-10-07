import { execute, isDuplicateEntry, query, queryOne } from '../config/database';
import type { SqlParam } from '../config/database';
import type { DesgloseElectrodomestico, LecturaMedidor, PeriodoConsumo, RegistroUso } from '../types';
import type {
  CrearLecturaInput,
  CrearUsoInput,
  LecturasQuery,
  PeriodosQuery,
  UsosQuery,
} from '../validators/consumo.validator';
import { hoyISO } from '../utils/fechas';
import { AppError } from '../utils/responses';
import { asegurarPropiedad, resolverViviendaId } from './vivienda.service';

function validarNoFutura(fecha: string, campo: string): void {
  if (fecha > hoyISO()) throw AppError.badRequest(`${campo} no puede ser una fecha futura`);
}

/* =====================================================================
 * LECTURAS DEL MEDIDOR (lecturas_medidor)
 * La propiedad se verifica con JOIN a viviendas.id_usuario.
 * ===================================================================== */

const SELECT_LECTURA = `
  SELECT l.id_lectura, l.id_vivienda, l.fecha_lectura, l.lectura_kwh, l.observacion, l.creado_en
    FROM lecturas_medidor l
    JOIN viviendas v ON v.id_vivienda = l.id_vivienda`;

export async function listarLecturas(idUsuario: number, filtros: LecturasQuery): Promise<LecturaMedidor[]> {
  const condiciones = ['v.id_usuario = ?'];
  const params: SqlParam[] = [idUsuario];

  if (filtros.id_vivienda !== undefined) {
    await asegurarPropiedad(idUsuario, filtros.id_vivienda);
    condiciones.push('l.id_vivienda = ?');
    params.push(filtros.id_vivienda);
  }
  if (filtros.desde) {
    condiciones.push('l.fecha_lectura >= ?');
    params.push(filtros.desde);
  }
  if (filtros.hasta) {
    condiciones.push('l.fecha_lectura <= ?');
    params.push(filtros.hasta);
  }
  // `limit` ya fue validado como entero (1-1000) por Zod
  const limit = filtros.limit ?? 500;
  return query<LecturaMedidor>(
    `${SELECT_LECTURA} WHERE ${condiciones.join(' AND ')} ORDER BY l.fecha_lectura DESC LIMIT ${limit}`,
    params,
  );
}

export async function obtenerLectura(idUsuario: number, idLectura: number): Promise<LecturaMedidor> {
  const lectura = await queryOne<LecturaMedidor>(`${SELECT_LECTURA} WHERE l.id_lectura = ? AND v.id_usuario = ?`, [
    idLectura,
    idUsuario,
  ]);
  if (!lectura) throw AppError.notFound('Lectura no encontrada');
  return lectura;
}

export async function crearLectura(idUsuario: number, input: CrearLecturaInput): Promise<LecturaMedidor> {
  const idVivienda = await resolverViviendaId(idUsuario, input.id_vivienda);
  validarNoFutura(input.fecha_lectura, 'La fecha de la lectura');

  // El medidor es acumulativo: la lectura debe ser coherente con las vecinas por fecha.
  const anterior = await queryOne<{ fecha_lectura: string; lectura_kwh: number }>(
    `SELECT fecha_lectura, lectura_kwh FROM lecturas_medidor
      WHERE id_vivienda = ? AND fecha_lectura < ? ORDER BY fecha_lectura DESC LIMIT 1`,
    [idVivienda, input.fecha_lectura],
  );
  if (anterior && input.lectura_kwh < anterior.lectura_kwh) {
    throw AppError.badRequest(
      `La lectura no puede ser menor que la anterior (${anterior.lectura_kwh} kWh el ${anterior.fecha_lectura})`,
    );
  }
  const siguiente = await queryOne<{ fecha_lectura: string; lectura_kwh: number }>(
    `SELECT fecha_lectura, lectura_kwh FROM lecturas_medidor
      WHERE id_vivienda = ? AND fecha_lectura > ? ORDER BY fecha_lectura ASC LIMIT 1`,
    [idVivienda, input.fecha_lectura],
  );
  if (siguiente && input.lectura_kwh > siguiente.lectura_kwh) {
    throw AppError.badRequest(
      `La lectura no puede ser mayor que la posterior (${siguiente.lectura_kwh} kWh el ${siguiente.fecha_lectura})`,
    );
  }

  try {
    const result = await execute(
      'INSERT INTO lecturas_medidor (id_vivienda, fecha_lectura, lectura_kwh, observacion) VALUES (?, ?, ?, ?)',
      [idVivienda, input.fecha_lectura, input.lectura_kwh, input.observacion ?? null],
    );
    return await obtenerLectura(idUsuario, result.insertId);
  } catch (err) {
    if (isDuplicateEntry(err)) throw AppError.conflict('Ya existe una lectura para esa vivienda en esa fecha');
    throw err;
  }
}

export async function eliminarLectura(idUsuario: number, idLectura: number): Promise<void> {
  await obtenerLectura(idUsuario, idLectura); // 404 si no es del usuario
  await execute('DELETE FROM lecturas_medidor WHERE id_lectura = ?', [idLectura]);
}

/* =====================================================================
 * REGISTROS DE USO (registros_uso)
 * kwh_calculado lo escribe el trigger de MySQL: aquí nunca se envía ni se calcula.
 * ===================================================================== */

const SELECT_USO = `
  SELECT r.id_registro, r.id_electrodomestico, e.nombre AS electrodomestico, e.id_vivienda,
         r.fecha, r.horas_uso, r.kwh_calculado, r.creado_en
    FROM registros_uso r
    JOIN electrodomesticos e ON e.id_electrodomestico = r.id_electrodomestico
    JOIN viviendas v ON v.id_vivienda = e.id_vivienda`;

async function asegurarElectrodomesticoPropio(idUsuario: number, idElectro: number): Promise<void> {
  const fila = await queryOne<{ id_electrodomestico: number }>(
    `SELECT e.id_electrodomestico
       FROM electrodomesticos e
       JOIN viviendas v ON v.id_vivienda = e.id_vivienda
      WHERE e.id_electrodomestico = ? AND v.id_usuario = ?`,
    [idElectro, idUsuario],
  );
  if (!fila) throw AppError.notFound('Electrodoméstico no encontrado');
}

export async function listarUsos(idUsuario: number, filtros: UsosQuery): Promise<RegistroUso[]> {
  const condiciones = ['v.id_usuario = ?'];
  const params: SqlParam[] = [idUsuario];

  if (filtros.id_vivienda !== undefined) {
    await asegurarPropiedad(idUsuario, filtros.id_vivienda);
    condiciones.push('e.id_vivienda = ?');
    params.push(filtros.id_vivienda);
  }
  if (filtros.id_electrodomestico !== undefined) {
    condiciones.push('r.id_electrodomestico = ?');
    params.push(filtros.id_electrodomestico);
  }
  if (filtros.desde) {
    condiciones.push('r.fecha >= ?');
    params.push(filtros.desde);
  }
  if (filtros.hasta) {
    condiciones.push('r.fecha <= ?');
    params.push(filtros.hasta);
  }
  const limit = filtros.limit ?? 500;
  return query<RegistroUso>(
    `${SELECT_USO} WHERE ${condiciones.join(' AND ')} ORDER BY r.fecha DESC, r.id_registro DESC LIMIT ${limit}`,
    params,
  );
}

export async function obtenerUso(idUsuario: number, idRegistro: number): Promise<RegistroUso> {
  const registro = await queryOne<RegistroUso>(`${SELECT_USO} WHERE r.id_registro = ? AND v.id_usuario = ?`, [
    idRegistro,
    idUsuario,
  ]);
  if (!registro) throw AppError.notFound('Registro de uso no encontrado');
  return registro;
}

export async function crearUso(idUsuario: number, input: CrearUsoInput): Promise<RegistroUso> {
  await asegurarElectrodomesticoPropio(idUsuario, input.id_electrodomestico);
  validarNoFutura(input.fecha, 'La fecha del registro');
  try {
    // kwh_calculado se omite: el trigger BEFORE INSERT lo calcula
    const result = await execute('INSERT INTO registros_uso (id_electrodomestico, fecha, horas_uso) VALUES (?, ?, ?)', [
      input.id_electrodomestico,
      input.fecha,
      input.horas_uso,
    ]);
    return await obtenerUso(idUsuario, result.insertId);
  } catch (err) {
    if (isDuplicateEntry(err)) {
      throw AppError.conflict('Ya existe un registro de uso de ese electrodoméstico en esa fecha; edítalo con PUT');
    }
    throw err;
  }
}

/** Solo se puede corregir `horas_uso`; el trigger BEFORE UPDATE recalcula kwh_calculado. */
export async function actualizarUso(idUsuario: number, idRegistro: number, horasUso: number): Promise<RegistroUso> {
  await obtenerUso(idUsuario, idRegistro);
  await execute('UPDATE registros_uso SET horas_uso = ? WHERE id_registro = ?', [horasUso, idRegistro]);
  return obtenerUso(idUsuario, idRegistro);
}

export async function eliminarUso(idUsuario: number, idRegistro: number): Promise<void> {
  await obtenerUso(idUsuario, idRegistro);
  await execute('DELETE FROM registros_uso WHERE id_registro = ?', [idRegistro]);
}

/* =====================================================================
 * PERIODOS GUARDADOS (periodos_consumo + consumo_electrodomestico_periodo)
 * Solo lectura aquí; la escritura está en proyeccion.service.ts
 * ===================================================================== */

const SELECT_PERIODO = `
  SELECT p.id_periodo, p.id_vivienda, p.tipo, p.fecha_inicio, p.fecha_fin, p.kwh_acumulado,
         p.kwh_proyectado, p.monto_acumulado, p.monto_proyectado, p.cerrado, p.calculado_en
    FROM periodos_consumo p
    JOIN viviendas v ON v.id_vivienda = p.id_vivienda`;

export async function listarPeriodos(idUsuario: number, filtros: PeriodosQuery): Promise<PeriodoConsumo[]> {
  const condiciones = ['v.id_usuario = ?'];
  const params: SqlParam[] = [idUsuario];
  if (filtros.id_vivienda !== undefined) {
    await asegurarPropiedad(idUsuario, filtros.id_vivienda);
    condiciones.push('p.id_vivienda = ?');
    params.push(filtros.id_vivienda);
  }
  const limit = filtros.limit ?? 24;
  return query<PeriodoConsumo>(
    `${SELECT_PERIODO} WHERE ${condiciones.join(' AND ')} ORDER BY p.fecha_inicio DESC LIMIT ${limit}`,
    params,
  );
}

export async function obtenerPeriodo(
  idUsuario: number,
  idPeriodo: number,
): Promise<PeriodoConsumo & { desglose: DesgloseElectrodomestico[] }> {
  const periodo = await queryOne<PeriodoConsumo>(`${SELECT_PERIODO} WHERE p.id_periodo = ? AND v.id_usuario = ?`, [
    idPeriodo,
    idUsuario,
  ]);
  if (!periodo) throw AppError.notFound('Periodo no encontrado');
  const desglose = await query<DesgloseElectrodomestico>(
    `SELECT c.id_electrodomestico, e.nombre, c.kwh, c.monto_estimado, c.porcentaje_total
       FROM consumo_electrodomestico_periodo c
       JOIN electrodomesticos e ON e.id_electrodomestico = c.id_electrodomestico
      WHERE c.id_periodo = ?
      ORDER BY c.kwh DESC`,
    [idPeriodo],
  );
  return { ...periodo, desglose };
}
