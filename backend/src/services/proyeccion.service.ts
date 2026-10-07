import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { query, queryOne, withTransaction } from '../config/database';
import type { DesgloseElectrodomestico, PeriodoConsumo } from '../types';
import { calcularCiclo, diffDias, hoyISO, maxFecha } from '../utils/fechas';
import { AppError } from '../utils/responses';
import { obtenerPeriodo } from './consumo.service';
import { calcularMonto, KW_CONTRATADOS_DEFAULT, obtenerResumen } from './tarifa.service';
import type { ResumenTarifa } from './tarifa.service';
import { resolverViviendaId } from './vivienda.service';

/**
 * Proyección del consumo (kWh) del periodo mensual en curso.
 * Los montos se calculan con la tarifa asignada a la vivienda (viviendas.id_tarifa) mediante la
 * función SQL fn_calcular_monto (ver tarifa.service.ts), con 0 kW contratados.
 *
 * Fuentes, en orden de prioridad:
 *  1. LECTURAS       – diferencia del medidor (la más fiable: mide toda la casa).
 *  2. REGISTROS_USO  – suma de kwh_calculado (calculado por el trigger de MySQL).
 *  3. ESTIMACION     – suma de electrodomesticos.kwh_mes_estimado (columna generada).
 * Se calculan las tres que tengan datos; `fuente` indica cuál se usa como principal.
 */

export type FuenteProyeccion = 'LECTURAS' | 'REGISTROS_USO' | 'ESTIMACION' | 'SIN_DATOS';

export interface ResumenFuente {
  kwh_acumulado: number;
  /** Días con información real en esa fuente. */
  dias_con_datos: number;
  promedio_diario_kwh: number;
  kwh_proyectado: number;
}

export interface Proyeccion {
  id_vivienda: number;
  tipo: 'MENSUAL';
  fecha_inicio: string;
  fecha_fin: string;
  fecha_referencia: string;
  dias_totales: number;
  /** Días del periodo ya transcurridos, contando el día de referencia. */
  dias_transcurridos: number;
  dias_restantes: number;
  fuente: FuenteProyeccion;
  kwh_acumulado: number;
  promedio_diario_kwh: number;
  kwh_proyectado: number;
  /** Tarifa de la vivienda usada para los montos; null si la vivienda no tiene tarifa asignada. */
  tarifa: ResumenTarifa | null;
  kw_contratados: number;
  /** null si no hay tarifa. Incluye el cargo fijo mensual completo (ver README). */
  monto_acumulado: number | null;
  /** Estimación de la factura del periodo completo; null si no hay tarifa. */
  monto_proyectado: number | null;
  fuentes: {
    lecturas: (ResumenFuente & { fecha_lectura_base: string; fecha_ultima_lectura: string }) | null;
    registros_uso: ResumenFuente | null;
    estimacion: ResumenFuente | null;
  };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

interface Lectura {
  fecha_lectura: string;
  lectura_kwh: number;
}

/* ------------------------------ Fuentes ------------------------------ */

async function desdeLecturas(idVivienda: number, inicio: string, ref: string, diasTotales: number) {
  // Base: última lectura en/antes del inicio del periodo; si no hay, la primera dentro del periodo.
  const base =
    (await queryOne<Lectura>(
      `SELECT fecha_lectura, lectura_kwh FROM lecturas_medidor
        WHERE id_vivienda = ? AND fecha_lectura <= ? ORDER BY fecha_lectura DESC LIMIT 1`,
      [idVivienda, inicio],
    )) ??
    (await queryOne<Lectura>(
      `SELECT fecha_lectura, lectura_kwh FROM lecturas_medidor
        WHERE id_vivienda = ? AND fecha_lectura > ? AND fecha_lectura <= ? ORDER BY fecha_lectura ASC LIMIT 1`,
      [idVivienda, inicio, ref],
    ));
  const ultima = await queryOne<Lectura>(
    `SELECT fecha_lectura, lectura_kwh FROM lecturas_medidor
      WHERE id_vivienda = ? AND fecha_lectura <= ? ORDER BY fecha_lectura DESC LIMIT 1`,
    [idVivienda, ref],
  );
  if (!base || !ultima) return null;

  // Días del periodo realmente cubiertos por las lecturas
  const desde = maxFecha(base.fecha_lectura, inicio);
  const diasCubiertos = diffDias(desde, ultima.fecha_lectura);
  const diasEntreLecturas = diffDias(base.fecha_lectura, ultima.fecha_lectura);
  if (diasCubiertos <= 0 || diasEntreLecturas <= 0) return null; // hacen falta ≥ 2 lecturas distintas

  const consumo = Math.max(0, ultima.lectura_kwh - base.lectura_kwh);
  const promedio = consumo / diasEntreLecturas;
  return {
    // Si la base es anterior al inicio del periodo, solo se atribuye la parte proporcional al periodo
    kwh_acumulado: r3(promedio * diasCubiertos),
    dias_con_datos: diasCubiertos,
    promedio_diario_kwh: r3(promedio),
    kwh_proyectado: r3(promedio * diasTotales),
    fecha_lectura_base: base.fecha_lectura,
    fecha_ultima_lectura: ultima.fecha_lectura,
  };
}

async function desdeRegistrosUso(
  idVivienda: number,
  inicio: string,
  ref: string,
  diasTotales: number,
): Promise<ResumenFuente | null> {
  const fila = await queryOne<{ dias: number; kwh: number }>(
    `SELECT COUNT(DISTINCT r.fecha) AS dias, COALESCE(SUM(r.kwh_calculado), 0) AS kwh
       FROM registros_uso r
       JOIN electrodomesticos e ON e.id_electrodomestico = r.id_electrodomestico
      WHERE e.id_vivienda = ? AND r.fecha BETWEEN ? AND ?`,
    [idVivienda, inicio, ref],
  );
  if (!fila || fila.dias === 0) return null;

  // Promedio sobre los días que tienen registros (un día sin registro no se asume como consumo cero)
  const promedio = fila.kwh / fila.dias;
  return {
    kwh_acumulado: r3(fila.kwh),
    dias_con_datos: fila.dias,
    promedio_diario_kwh: r3(promedio),
    kwh_proyectado: r3(promedio * diasTotales),
  };
}

async function desdeEstimacion(idVivienda: number, diasTotales: number): Promise<ResumenFuente | null> {
  const fila = await queryOne<{ kwh: number }>(
    'SELECT COALESCE(SUM(kwh_mes_estimado), 0) AS kwh FROM electrodomesticos WHERE id_vivienda = ? AND activo = 1',
    [idVivienda],
  );
  if (!fila || fila.kwh <= 0) return null;
  return {
    kwh_acumulado: 0, // no hay consumo real medido
    dias_con_datos: 0,
    promedio_diario_kwh: r3(fila.kwh / diasTotales),
    kwh_proyectado: r3(fila.kwh),
  };
}

/* ------------------------------ Cálculo ------------------------------ */

/**
 * Calcula la proyección de una vivienda. NO verifica propiedad: es la función
 * interna que también usarán los jobs. Desde HTTP usar `proyectar` / `calcularYGuardarPeriodo`.
 */
export async function calcularProyeccion(idVivienda: number, fechaRef?: string): Promise<Proyeccion> {
  const vivienda = await queryOne<{ dia_corte: number; id_tarifa: number | null }>(
    'SELECT dia_corte, id_tarifa FROM viviendas WHERE id_vivienda = ?',
    [idVivienda],
  );
  if (!vivienda) throw AppError.notFound('Vivienda no encontrada');

  const ref = fechaRef ?? hoyISO();
  if (ref > hoyISO()) throw AppError.badRequest('La fecha de referencia no puede ser futura');

  const { inicio, fin } = calcularCiclo(vivienda.dia_corte, ref);
  const diasTotales = diffDias(inicio, fin) + 1;
  const diasTranscurridos = diffDias(inicio, ref) + 1;

  const lecturas = await desdeLecturas(idVivienda, inicio, ref, diasTotales);
  const registros = await desdeRegistrosUso(idVivienda, inicio, ref, diasTotales);
  const estimacion = await desdeEstimacion(idVivienda, diasTotales);

  let fuente: FuenteProyeccion = 'SIN_DATOS';
  let principal: ResumenFuente = { kwh_acumulado: 0, dias_con_datos: 0, promedio_diario_kwh: 0, kwh_proyectado: 0 };
  if (lecturas) {
    fuente = 'LECTURAS';
    principal = lecturas;
  } else if (registros) {
    fuente = 'REGISTROS_USO';
    principal = registros;
  } else if (estimacion) {
    fuente = 'ESTIMACION';
    principal = estimacion;
  }

  // Montos: la lógica tarifaria vive en fn_calcular_monto (MySQL); aquí solo se invoca.
  const tarifa = vivienda.id_tarifa !== null ? await obtenerResumen(vivienda.id_tarifa) : null;
  let montoAcumulado: number | null = null;
  let montoProyectado: number | null = null;
  if (tarifa) {
    // Sin consumo real / sin datos no se factura ni siquiera el cargo fijo (evita montos engañosos)
    montoAcumulado =
      principal.kwh_acumulado > 0 ? await calcularMonto(tarifa.id_tarifa, principal.kwh_acumulado) : 0;
    montoProyectado =
      fuente !== 'SIN_DATOS' ? await calcularMonto(tarifa.id_tarifa, principal.kwh_proyectado) : 0;
  }

  return {
    id_vivienda: idVivienda,
    tipo: 'MENSUAL',
    fecha_inicio: inicio,
    fecha_fin: fin,
    fecha_referencia: ref,
    dias_totales: diasTotales,
    dias_transcurridos: diasTranscurridos,
    dias_restantes: diasTotales - diasTranscurridos,
    fuente,
    kwh_acumulado: principal.kwh_acumulado,
    promedio_diario_kwh: principal.promedio_diario_kwh,
    kwh_proyectado: principal.kwh_proyectado,
    tarifa,
    kw_contratados: KW_CONTRATADOS_DEFAULT,
    monto_acumulado: montoAcumulado,
    monto_proyectado: montoProyectado,
    fuentes: { lecturas, registros_uso: registros, estimacion },
  };
}

/**
 * Desglose por electrodoméstico del consumo REAL acumulado en el periodo
 * (suma de registros_uso.kwh_calculado). Si no hay registros, el desglose queda vacío.
 */
export async function calcularDesglose(
  idVivienda: number,
  inicio: string,
  ref: string,
): Promise<Omit<DesgloseElectrodomestico, 'monto_estimado'>[]> {
  const filas = await query<{ id_electrodomestico: number; nombre: string; kwh: number }>(
    `SELECT e.id_electrodomestico, e.nombre, SUM(r.kwh_calculado) AS kwh
       FROM registros_uso r
       JOIN electrodomesticos e ON e.id_electrodomestico = r.id_electrodomestico
      WHERE e.id_vivienda = ? AND r.fecha BETWEEN ? AND ?
      GROUP BY e.id_electrodomestico, e.nombre
      ORDER BY kwh DESC`,
    [idVivienda, inicio, ref],
  );
  const total = filas.reduce((acc, f) => acc + f.kwh, 0);
  return filas.map((f) => ({
    id_electrodomestico: f.id_electrodomestico,
    nombre: f.nombre,
    kwh: r3(f.kwh),
    porcentaje_total: total > 0 ? r2((f.kwh / total) * 100) : 0,
  }));
}

/* ------------------------------ Persistencia ------------------------------ */

export interface PeriodoGuardado {
  periodo: PeriodoConsumo & { desglose: DesgloseElectrodomestico[] };
  proyeccion: Proyeccion;
}

/**
 * Crea o actualiza (upsert) el periodo y reemplaza su desglose, dentro de una transacción.
 * Guarda kWh y los montos (monto_acumulado / monto_proyectado; 0 si la vivienda no tiene tarifa).
 * consumo_electrodomestico_periodo.monto_estimado no se calcula todavía (queda en 0).
 * Sin verificación de propiedad (uso interno / jobs).
 */
export async function guardarPeriodo(idVivienda: number, fechaRef?: string): Promise<{ idPeriodo: number; proyeccion: Proyeccion }> {
  const proyeccion = await calcularProyeccion(idVivienda, fechaRef);
  const desglose = await calcularDesglose(idVivienda, proyeccion.fecha_inicio, proyeccion.fecha_referencia);
  const cerrado = proyeccion.fecha_fin < hoyISO() ? 1 : 0;

  const idPeriodo = await withTransaction(async (conn) => {
    // Respeta uq_periodo (id_vivienda, tipo, fecha_inicio)
    await conn.execute<ResultSetHeader>(
      `INSERT INTO periodos_consumo
         (id_vivienda, tipo, fecha_inicio, fecha_fin, kwh_acumulado, kwh_proyectado,
          monto_acumulado, monto_proyectado, cerrado)
       VALUES (?, 'MENSUAL', ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         fecha_fin = VALUES(fecha_fin),
         kwh_acumulado = VALUES(kwh_acumulado),
         kwh_proyectado = VALUES(kwh_proyectado),
         monto_acumulado = VALUES(monto_acumulado),
         monto_proyectado = VALUES(monto_proyectado),
         cerrado = VALUES(cerrado),
         calculado_en = CURRENT_TIMESTAMP`,
      [
        idVivienda,
        proyeccion.fecha_inicio,
        proyeccion.fecha_fin,
        proyeccion.kwh_acumulado,
        proyeccion.kwh_proyectado,
        proyeccion.monto_acumulado ?? 0,
        proyeccion.monto_proyectado ?? 0,
        cerrado,
      ],
    );

    const [filas] = await conn.execute<RowDataPacket[]>(
      `SELECT id_periodo FROM periodos_consumo
        WHERE id_vivienda = ? AND tipo = 'MENSUAL' AND fecha_inicio = ?`,
      [idVivienda, proyeccion.fecha_inicio],
    );
    const id = filas[0]?.['id_periodo'] as number | undefined;
    if (id === undefined) throw new Error('No se pudo recuperar el periodo guardado');

    await conn.execute('DELETE FROM consumo_electrodomestico_periodo WHERE id_periodo = ?', [id]);
    for (const d of desglose) {
      await conn.execute(
        `INSERT INTO consumo_electrodomestico_periodo (id_periodo, id_electrodomestico, kwh, porcentaje_total)
         VALUES (?, ?, ?, ?)`,
        [id, d.id_electrodomestico, d.kwh, d.porcentaje_total],
      );
    }
    return id;
  });

  return { idPeriodo, proyeccion };
}

/* ------------------------ API para usuarios (con propiedad) ------------------------ */

export async function proyectar(idUsuario: number, idVivienda?: number, fecha?: string): Promise<Proyeccion> {
  const id = await resolverViviendaId(idUsuario, idVivienda);
  return calcularProyeccion(id, fecha);
}

export async function calcularYGuardarPeriodo(
  idUsuario: number,
  idVivienda?: number,
  fecha?: string,
): Promise<PeriodoGuardado> {
  const id = await resolverViviendaId(idUsuario, idVivienda);
  const { idPeriodo, proyeccion } = await guardarPeriodo(id, fecha);
  return { periodo: await obtenerPeriodo(idUsuario, idPeriodo), proyeccion };
}
