import { buildSet, execute, isDuplicateEntry, query, queryOne } from '../config/database';
import type { SqlParam } from '../config/database';
import type { AlertaConfig, NivelSemaforo, TipoAlerta } from '../types';
import type {
  ActualizarAlertaConfigInput,
  AlertasQuery,
  CrearAlertaConfigInput,
} from '../validators/alerta.validator';
import { AppError } from '../utils/responses';
import { crearSiNoExiste } from './notificacion.service';
import { obtenerVigente } from './presupuesto.service';
import { proyectar } from './proyeccion.service';
import type { Proyeccion } from './proyeccion.service';
import { asegurarPropiedad, resolverViviendaId } from './vivienda.service';

/**
 * Alertas: configuración (`alertas_config`), semáforo del presupuesto y generación de notificaciones.
 *
 * Semáforo sobre el monto_proyectado del periodo activo vs. el presupuesto mensual vigente:
 *   porcentaje < umbral PRÓXIMO            -> VERDE
 *   umbral PRÓXIMO <= porcentaje < SUPERADO -> AMARILLO
 *   porcentaje >= umbral SUPERADO           -> ROJO
 * Los umbrales salen de alertas_config (UMBRAL_PROXIMO / UMBRAL_SUPERADO, activas); si la vivienda no
 * tiene esa configuración se usan los valores por defecto de abajo (80 % y 100 %).
 */

export const UMBRAL_PROXIMO_DEFECTO = 80;
export const UMBRAL_SUPERADO_DEFECTO = 100;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Nivel del semáforo para un porcentaje del presupuesto (sin valores fijos: reciben los umbrales). */
export function calcularNivel(porcentaje: number, umbralProximo: number, umbralSuperado: number): NivelSemaforo {
  if (porcentaje >= umbralSuperado) return 'ROJO';
  if (porcentaje >= umbralProximo) return 'AMARILLO';
  return 'VERDE';
}

/* =====================================================================
 * CONFIGURACIÓN (alertas_config) — propiedad vía JOIN a viviendas.id_usuario
 * ===================================================================== */

const SELECT_CONFIG = `
  SELECT a.id_alerta_config, a.id_vivienda, a.tipo, a.porcentaje_umbral, a.canal, a.activa
    FROM alertas_config a
    JOIN viviendas v ON v.id_vivienda = a.id_vivienda`;

export async function listarConfig(idUsuario: number, filtros: AlertasQuery): Promise<AlertaConfig[]> {
  const condiciones = ['v.id_usuario = ?'];
  const params: SqlParam[] = [idUsuario];
  if (filtros.id_vivienda !== undefined) {
    await asegurarPropiedad(idUsuario, filtros.id_vivienda);
    condiciones.push('a.id_vivienda = ?');
    params.push(filtros.id_vivienda);
  }
  return query<AlertaConfig>(
    `${SELECT_CONFIG} WHERE ${condiciones.join(' AND ')} ORDER BY a.id_vivienda, a.tipo, a.canal`,
    params,
  );
}

export async function obtenerConfig(idUsuario: number, idAlertaConfig: number): Promise<AlertaConfig> {
  const fila = await queryOne<AlertaConfig>(`${SELECT_CONFIG} WHERE a.id_alerta_config = ? AND v.id_usuario = ?`, [
    idAlertaConfig,
    idUsuario,
  ]);
  if (!fila) throw AppError.notFound('Configuración de alerta no encontrada');
  return fila;
}

interface UmbralTipo {
  tipo: TipoAlerta;
  porcentaje_umbral: number;
}

/** El aviso "próximo" debe disparar antes que el "superado" entre las configuraciones activas. */
async function validarCoherencia(idVivienda: number, excluirId: number | null, nuevo: UmbralTipo | null): Promise<void> {
  const filas = await query<AlertaConfig>(
    'SELECT id_alerta_config, id_vivienda, tipo, porcentaje_umbral, canal, activa FROM alertas_config WHERE id_vivienda = ? AND activa = 1',
    [idVivienda],
  );
  const lista: UmbralTipo[] = filas.filter((f) => f.id_alerta_config !== excluirId);
  if (nuevo) lista.push(nuevo);
  const proximos = lista.filter((c) => c.tipo === 'UMBRAL_PROXIMO').map((c) => c.porcentaje_umbral);
  const superados = lista.filter((c) => c.tipo === 'UMBRAL_SUPERADO').map((c) => c.porcentaje_umbral);
  if (proximos.length > 0 && superados.length > 0 && Math.max(...proximos) >= Math.min(...superados)) {
    throw AppError.badRequest('El umbral de UMBRAL_PROXIMO debe ser menor que el de UMBRAL_SUPERADO');
  }
}

export async function crearConfig(idUsuario: number, input: CrearAlertaConfigInput): Promise<AlertaConfig> {
  const idVivienda = await resolverViviendaId(idUsuario, input.id_vivienda);
  const activa = input.activa ?? true;
  await validarCoherencia(idVivienda, null, activa ? { tipo: input.tipo, porcentaje_umbral: input.porcentaje_umbral } : null);
  try {
    const result = await execute(
      'INSERT INTO alertas_config (id_vivienda, tipo, porcentaje_umbral, canal, activa) VALUES (?, ?, ?, ?, ?)',
      [idVivienda, input.tipo, r2(input.porcentaje_umbral), input.canal ?? 'APP', activa ? 1 : 0],
    );
    return await obtenerConfig(idUsuario, result.insertId);
  } catch (err) {
    if (isDuplicateEntry(err)) {
      throw AppError.conflict('Ya existe una configuración de ese tipo y canal para la vivienda; edítala con PUT');
    }
    throw err;
  }
}

export async function actualizarConfig(
  idUsuario: number,
  idAlertaConfig: number,
  input: ActualizarAlertaConfigInput,
): Promise<AlertaConfig> {
  const actual = await obtenerConfig(idUsuario, idAlertaConfig); // 404 si no es del usuario
  const umbral = input.porcentaje_umbral === undefined ? actual.porcentaje_umbral : r2(input.porcentaje_umbral);
  const activa = input.activa === undefined ? actual.activa === 1 : input.activa;
  await validarCoherencia(
    actual.id_vivienda,
    idAlertaConfig,
    activa ? { tipo: actual.tipo, porcentaje_umbral: umbral } : null,
  );

  const { clause, values } = buildSet(
    {
      porcentaje_umbral: input.porcentaje_umbral === undefined ? undefined : r2(input.porcentaje_umbral),
      canal: input.canal,
      activa: input.activa === undefined ? undefined : input.activa ? 1 : 0,
    },
    ['porcentaje_umbral', 'canal', 'activa'],
  );
  try {
    if (clause) await execute(`UPDATE alertas_config SET ${clause} WHERE id_alerta_config = ?`, [...values, idAlertaConfig]);
  } catch (err) {
    if (isDuplicateEntry(err)) {
      throw AppError.conflict('Ya existe una configuración de ese tipo y canal para la vivienda');
    }
    throw err;
  }
  return obtenerConfig(idUsuario, idAlertaConfig);
}

/* =====================================================================
 * SEMÁFORO
 * ===================================================================== */

async function cargarConfigsActivas(idVivienda: number): Promise<AlertaConfig[]> {
  return query<AlertaConfig>(
    `SELECT id_alerta_config, id_vivienda, tipo, porcentaje_umbral, canal, activa
       FROM alertas_config WHERE id_vivienda = ? AND activa = 1
      ORDER BY id_alerta_config`,
    [idVivienda],
  );
}

/**
 * Configuración que "manda" para un tipo: prefiere el canal APP. El canal EMAIL queda registrado
 * pero no envía correos; si es la única, igualmente se almacena la notificación en MySQL.
 * Así APP + EMAIL del mismo tipo no producen notificaciones duplicadas.
 */
function elegirConfig(configs: AlertaConfig[], tipo: TipoAlerta): AlertaConfig | undefined {
  const delTipo = configs.filter((c) => c.tipo === tipo);
  return delTipo.find((c) => c.canal === 'APP') ?? delTipo[0];
}

export type MotivoSinNivel = 'SIN_PRESUPUESTO' | 'SIN_TARIFA' | 'SIN_DATOS';

export interface EvaluacionSemaforo {
  id_vivienda: number;
  fecha_inicio: string;
  fecha_fin: string;
  fuente: Proyeccion['fuente'];
  monto_acumulado: number | null;
  monto_proyectado: number | null;
  presupuesto: { id_presupuesto: number; monto_mensual: number } | null;
  /** monto_proyectado / presupuesto * 100; null si no se puede calcular. */
  porcentaje_proyectado: number | null;
  umbrales: { proximo: number; superado: number };
  /** null cuando no hay base para evaluar (ver `motivo`). */
  nivel: NivelSemaforo | null;
  motivo: MotivoSinNivel | null;
}

/**
 * Evalúa el semáforo de una vivienda con una proyección ya calculada (monto_proyectado del periodo).
 * Sin verificación de propiedad: uso interno. Desde HTTP, usar `obtenerEstado`.
 */
export async function evaluarSemaforo(
  idVivienda: number,
  proyeccion: Proyeccion,
  configs?: AlertaConfig[],
): Promise<EvaluacionSemaforo> {
  const activas = configs ?? (await cargarConfigsActivas(idVivienda));
  const umbrales = {
    proximo: elegirConfig(activas, 'UMBRAL_PROXIMO')?.porcentaje_umbral ?? UMBRAL_PROXIMO_DEFECTO,
    superado: elegirConfig(activas, 'UMBRAL_SUPERADO')?.porcentaje_umbral ?? UMBRAL_SUPERADO_DEFECTO,
  };
  const presupuesto = await obtenerVigente(idVivienda, proyeccion.fecha_referencia);

  const base: EvaluacionSemaforo = {
    id_vivienda: idVivienda,
    fecha_inicio: proyeccion.fecha_inicio,
    fecha_fin: proyeccion.fecha_fin,
    fuente: proyeccion.fuente,
    monto_acumulado: proyeccion.monto_acumulado,
    monto_proyectado: proyeccion.monto_proyectado,
    presupuesto: presupuesto
      ? { id_presupuesto: presupuesto.id_presupuesto, monto_mensual: presupuesto.monto_mensual }
      : null,
    porcentaje_proyectado: null,
    umbrales,
    nivel: null,
    motivo: null,
  };

  if (!presupuesto) return { ...base, motivo: 'SIN_PRESUPUESTO' };
  if (proyeccion.monto_proyectado === null) return { ...base, motivo: 'SIN_TARIFA' };
  if (proyeccion.fuente === 'SIN_DATOS') return { ...base, motivo: 'SIN_DATOS' };

  // Se compara en centavos (enteros) y con 4 decimales para evitar ruido de coma flotante
  const porcentaje = r4(
    (Math.round(proyeccion.monto_proyectado * 100) / Math.round(presupuesto.monto_mensual * 100)) * 100,
  );
  return {
    ...base,
    porcentaje_proyectado: r2(porcentaje),
    nivel: calcularNivel(porcentaje, umbrales.proximo, umbrales.superado),
  };
}

/** Estado actual del semáforo de la vivienda (proyección en vivo, sin guardar nada). */
export async function obtenerEstado(idUsuario: number, idVivienda?: number): Promise<EvaluacionSemaforo> {
  const id = await resolverViviendaId(idUsuario, idVivienda);
  return evaluarSemaforo(id, await proyectar(idUsuario, id));
}

/* =====================================================================
 * GENERACIÓN DE NOTIFICACIONES (la usa el job; sin verificación de propiedad)
 * ===================================================================== */

export interface ResultadoAlertas {
  evaluacion: EvaluacionSemaforo;
  notificaciones_creadas: number;
}

const dinero = (moneda: string, n: number) => `${moneda} ${n.toFixed(2)}`.trim();

/**
 * Evalúa las alertas de la vivienda para el periodo recién calculado y guarda las notificaciones
 * que correspondan. Solo AMARILLO y ROJO generan notificación (VERDE es el estado normal).
 * La deduplicación por (periodo, configuración, nivel) la hace notificacion.service.crearSiNoExiste.
 */
export async function evaluarYNotificar(
  idVivienda: number,
  idPeriodo: number,
  proyeccion: Proyeccion,
): Promise<ResultadoAlertas> {
  const vivienda = await queryOne<{ id_usuario: number; nombre: string }>(
    'SELECT id_usuario, nombre FROM viviendas WHERE id_vivienda = ?',
    [idVivienda],
  );
  if (!vivienda) throw AppError.notFound('Vivienda no encontrada');

  const configs = await cargarConfigsActivas(idVivienda);
  const evaluacion = await evaluarSemaforo(idVivienda, proyeccion, configs);
  const moneda = proyeccion.tarifa?.moneda ?? '';
  const rango = `${proyeccion.fecha_inicio} al ${proyeccion.fecha_fin}`;
  let creadas = 0;

  // 1) Umbrales de presupuesto
  if ((evaluacion.nivel === 'AMARILLO' || evaluacion.nivel === 'ROJO') && evaluacion.presupuesto) {
    const tipo: TipoAlerta = evaluacion.nivel === 'ROJO' ? 'UMBRAL_SUPERADO' : 'UMBRAL_PROXIMO';
    const config = elegirConfig(configs, tipo);
    if (config) {
      const pct = evaluacion.porcentaje_proyectado ?? 0;
      const montos = `${dinero(moneda, evaluacion.monto_proyectado ?? 0)} (${pct.toFixed(2)} % del presupuesto mensual de ${dinero(moneda, evaluacion.presupuesto.monto_mensual)})`;
      const insertada = await crearSiNoExiste({
        idUsuario: vivienda.id_usuario,
        idVivienda,
        idAlertaConfig: config.id_alerta_config,
        idPeriodo,
        nivel: evaluacion.nivel,
        titulo:
          evaluacion.nivel === 'ROJO'
            ? `Presupuesto superado en ${vivienda.nombre}`
            : `Te acercas al presupuesto en ${vivienda.nombre}`,
        mensaje:
          evaluacion.nivel === 'ROJO'
            ? `El gasto proyectado del periodo ${rango} es ${montos}; alcanzó el umbral de ${config.porcentaje_umbral} %.`
            : `El gasto proyectado del periodo ${rango} es ${montos}; superó el umbral de aviso de ${config.porcentaje_umbral} %.`,
      });
      if (insertada) creadas++;
    }
  }

  // 2) Consumo anómalo
  if (await notificarAnomalia(vivienda, idVivienda, idPeriodo, proyeccion, configs)) creadas++;

  return { evaluacion, notificaciones_creadas: creadas };
}

/**
 * CONSUMO_ANOMALO: el kWh proyectado del periodo es >= porcentaje_umbral % del consumo del periodo
 * anterior ya cerrado (p. ej. 130 = un 30 % más que el mes pasado). Solo con datos reales
 * (lecturas o registros de uso); una estimación por electrodomésticos no se considera anomalía.
 */
async function notificarAnomalia(
  vivienda: { id_usuario: number; nombre: string },
  idVivienda: number,
  idPeriodo: number,
  proyeccion: Proyeccion,
  configs: AlertaConfig[],
): Promise<boolean> {
  const config = elegirConfig(configs, 'CONSUMO_ANOMALO');
  if (!config) return false;
  if (proyeccion.fuente !== 'LECTURAS' && proyeccion.fuente !== 'REGISTROS_USO') return false;

  const previo = await queryOne<{ kwh_acumulado: number }>(
    `SELECT kwh_acumulado FROM periodos_consumo
      WHERE id_vivienda = ? AND tipo = 'MENSUAL' AND cerrado = 1 AND fecha_inicio < ?
      ORDER BY fecha_inicio DESC LIMIT 1`,
    [idVivienda, proyeccion.fecha_inicio],
  );
  if (!previo || previo.kwh_acumulado <= 0) return false;

  const porcentaje = r2((proyeccion.kwh_proyectado / previo.kwh_acumulado) * 100);
  if (porcentaje < config.porcentaje_umbral) return false;

  return crearSiNoExiste({
    idUsuario: vivienda.id_usuario,
    idVivienda,
    idAlertaConfig: config.id_alerta_config,
    idPeriodo,
    nivel: 'AMARILLO',
    titulo: `Consumo inusual en ${vivienda.nombre}`,
    mensaje: `El consumo proyectado del periodo ${proyeccion.fecha_inicio} al ${proyeccion.fecha_fin} es ${proyeccion.kwh_proyectado.toFixed(2)} kWh, un ${porcentaje.toFixed(2)} % del periodo anterior (${previo.kwh_acumulado.toFixed(2)} kWh); superó el umbral de ${config.porcentaje_umbral} %.`,
  });
}
