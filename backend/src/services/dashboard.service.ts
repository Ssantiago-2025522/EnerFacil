import { query, queryOne } from '../config/database';
import type { AlertaConfig, NivelSemaforo, Notificacion, Recomendacion } from '../types';
import { sumarDias } from '../utils/fechas';
import { evaluarSemaforo, listarConfig } from './alerta.service';
import type { EvaluacionSemaforo, MotivoSinNivel } from './alerta.service';
import { contarNoLeidas, listar as listarNotificaciones } from './notificacion.service';
import { calcularDesglose, calcularProyeccion } from './proyeccion.service';
import type { FuenteProyeccion, Proyeccion } from './proyeccion.service';
import { listar as listarRecomendaciones } from './recomendacion.service';
import { obtener as obtenerVivienda, resolverViviendaId } from './vivienda.service';

/**
 * Dashboard: una sola respuesta con el estado energético de una vivienda.
 * Es una CAPA DE AGREGACIÓN: no calcula proyecciones, tarifas, presupuesto, alertas ni
 * recomendaciones, solo llama a los servicios que ya lo hacen:
 *   resumen / comparacion  -> proyeccion.service.calcularProyeccion (en vivo, no guarda nada)
 *   presupuesto / alertas  -> alerta.service.evaluarSemaforo (mismos umbrales que las alertas)
 *   desgloses              -> proyeccion.service.calcularDesglose (+ estimación si no hay registros)
 *   notificaciones         -> notificacion.service
 *   recomendaciones        -> recomendacion.service.listar (no genera: eso lo hace POST /generar)
 * La propiedad se verifica una vez al principio con resolverViviendaId (404 si es ajena).
 */

export const TOP_ELECTRODOMESTICOS = 5;
export const MAX_NOTIFICACIONES_RECIENTES = 5;
export const MAX_RECOMENDACIONES = 5;
/** Variación (%) por debajo de la cual la tendencia se considera IGUAL. */
export const TOLERANCIA_IGUAL_PCT = 1;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/* ------------------------------ Tipos de respuesta ------------------------------ */

export interface DashboardResumen {
  id_vivienda: number;
  /** Id del periodo guardado en periodos_consumo para este ciclo; null si aún no se ha guardado. */
  id_periodo: number | null;
  tipo: 'MENSUAL';
  fecha_inicio: string;
  fecha_fin: string;
  dias_totales: number;
  dias_transcurridos: number;
  dias_restantes: number;
  /** De dónde salen los kWh: LECTURAS > REGISTROS_USO > ESTIMACION > SIN_DATOS. */
  fuente: FuenteProyeccion;
  kwh_acumulado: number;
  kwh_proyectado: number;
  /** null si la vivienda no tiene tarifa asignada. */
  monto_acumulado: number | null;
  monto_proyectado: number | null;
  moneda: string | null;
  tarifa: { id_tarifa: number; nombre: string } | null;
}

export interface DashboardPresupuesto {
  id_presupuesto: number;
  monto_mensual: number;
  monto_proyectado: number | null;
  /** monto_proyectado / monto_mensual * 100; null si no se puede calcular. */
  porcentaje_proyectado: number | null;
  /** monto_acumulado / monto_mensual * 100; null si no hay tarifa. */
  porcentaje_utilizado: number | null;
  /** Semáforo; null si falta base para evaluarlo (ver `motivo`). */
  nivel: NivelSemaforo | null;
  motivo: MotivoSinNivel | null;
}

export interface DashboardAmbiente {
  id_ambiente: number | null;
  nombre: string;
  kwh: number;
  porcentaje: number;
}

export interface DashboardElectrodomestico {
  id_electrodomestico: number;
  nombre: string;
  id_ambiente: number | null;
  ambiente: string | null;
  kwh: number;
  porcentaje: number;
}

export interface DashboardComparacion {
  /** kWh proyectados del periodo actual. */
  kwh_actual: number | null;
  kwh_anterior: number | null;
  diferencia_kwh: number | null;
  diferencia_pct: number | null;
  tendencia: 'SUBE' | 'BAJA' | 'IGUAL' | null;
  periodo_anterior: { fecha_inicio: string; fecha_fin: string; fuente: FuenteProyeccion } | null;
}

export interface DashboardAlertas {
  nivel: NivelSemaforo | null;
  motivo: MotivoSinNivel | null;
  umbrales: EvaluacionSemaforo['umbrales'];
  presupuesto_mensual: number | null;
  monto_proyectado: number | null;
  porcentaje_proyectado: number | null;
  no_leidas: number;
  recientes: Notificacion[];
  configuracion: AlertaConfig[];
}

export interface Dashboard {
  vivienda: {
    id_vivienda: number;
    nombre: string;
    direccion: string | null;
    region: string | null;
    num_habitantes: number | null;
    dia_corte: number;
    id_tarifa: number | null;
  };
  resumen: DashboardResumen;
  /** null si la vivienda no tiene presupuesto vigente. */
  presupuesto: DashboardPresupuesto | null;
  /**
   * Base de los dos desgloses: REGISTROS_USO = kWh reales acumulados en el periodo;
   * ESTIMACION = consumo mensual estimado de los electrodomésticos activos; null = sin datos.
   */
  origen_desglose: 'REGISTROS_USO' | 'ESTIMACION' | null;
  consumo_por_ambiente: DashboardAmbiente[];
  consumo_por_electrodomestico: DashboardElectrodomestico[];
  comparacion: DashboardComparacion;
  alertas: DashboardAlertas;
  recomendaciones: Recomendacion[];
}

/* ------------------------------ Piezas ------------------------------ */

function esFuenteReal(f: FuenteProyeccion): boolean {
  return f === 'LECTURAS' || f === 'REGISTROS_USO';
}

function armarResumen(id: number, idPeriodo: number | null, p: Proyeccion): DashboardResumen {
  return {
    id_vivienda: id,
    id_periodo: idPeriodo,
    tipo: p.tipo,
    fecha_inicio: p.fecha_inicio,
    fecha_fin: p.fecha_fin,
    dias_totales: p.dias_totales,
    dias_transcurridos: p.dias_transcurridos,
    dias_restantes: p.dias_restantes,
    fuente: p.fuente,
    kwh_acumulado: p.kwh_acumulado,
    kwh_proyectado: p.kwh_proyectado,
    monto_acumulado: p.monto_acumulado,
    monto_proyectado: p.monto_proyectado,
    moneda: p.tarifa?.moneda ?? null,
    tarifa: p.tarifa ? { id_tarifa: p.tarifa.id_tarifa, nombre: p.tarifa.nombre } : null,
  };
}

function armarPresupuesto(ev: EvaluacionSemaforo): DashboardPresupuesto | null {
  if (!ev.presupuesto) return null;
  const { monto_mensual } = ev.presupuesto;
  return {
    id_presupuesto: ev.presupuesto.id_presupuesto,
    monto_mensual,
    monto_proyectado: ev.monto_proyectado,
    porcentaje_proyectado: ev.porcentaje_proyectado,
    porcentaje_utilizado: ev.monto_acumulado === null ? null : r2((ev.monto_acumulado / monto_mensual) * 100),
    nivel: ev.nivel,
    motivo: ev.motivo,
  };
}

interface ConsumoAparato {
  id_electrodomestico: number;
  nombre: string;
  id_ambiente: number | null;
  ambiente: string | null;
  kwh: number;
}

/**
 * kWh por electrodoméstico: los reales del periodo (registros_uso, vía calcularDesglose) o, si no
 * hay registros, el consumo mensual estimado (columna generada kwh_mes_estimado). Nunca se mezclan.
 */
async function consumoPorAparato(
  idVivienda: number,
  p: Proyeccion,
): Promise<{ origen: Dashboard['origen_desglose']; aparatos: ConsumoAparato[] }> {
  const ubicaciones = await query<{ id_electrodomestico: number; id_ambiente: number | null; ambiente: string | null }>(
    `SELECT e.id_electrodomestico, e.id_ambiente, a.nombre AS ambiente
       FROM electrodomesticos e
       LEFT JOIN ambientes a ON a.id_ambiente = e.id_ambiente
      WHERE e.id_vivienda = ?`,
    [idVivienda],
  );
  const ubicacion = new Map(ubicaciones.map((u) => [u.id_electrodomestico, u]));
  const conAmbiente = (id: number, nombre: string, kwh: number): ConsumoAparato => ({
    id_electrodomestico: id,
    nombre,
    id_ambiente: ubicacion.get(id)?.id_ambiente ?? null,
    ambiente: ubicacion.get(id)?.ambiente ?? null,
    kwh,
  });

  const reales = await calcularDesglose(idVivienda, p.fecha_inicio, p.fecha_referencia);
  if (reales.length > 0) {
    return { origen: 'REGISTROS_USO', aparatos: reales.map((r) => conAmbiente(r.id_electrodomestico, r.nombre, r.kwh)) };
  }

  const estimados = await query<{ id_electrodomestico: number; nombre: string; kwh: number }>(
    `SELECT id_electrodomestico, nombre, kwh_mes_estimado AS kwh
       FROM electrodomesticos
      WHERE id_vivienda = ? AND activo = 1 AND kwh_mes_estimado > 0`,
    [idVivienda],
  );
  if (estimados.length > 0) {
    return { origen: 'ESTIMACION', aparatos: estimados.map((e) => conAmbiente(e.id_electrodomestico, e.nombre, e.kwh)) };
  }
  return { origen: null, aparatos: [] };
}

/** Porcentaje respecto al total del desglose (todos los aparatos, no solo los del top). */
function armarDesgloses(aparatos: ConsumoAparato[]): {
  ambientes: DashboardAmbiente[];
  electrodomesticos: DashboardElectrodomestico[];
} {
  const total = aparatos.reduce((acc, a) => acc + a.kwh, 0);
  const pct = (kwh: number) => (total > 0 ? r2((kwh / total) * 100) : 0);

  const porAmbiente = new Map<string, DashboardAmbiente>();
  for (const a of aparatos) {
    const clave = String(a.id_ambiente);
    const actual = porAmbiente.get(clave);
    if (actual) actual.kwh += a.kwh;
    else porAmbiente.set(clave, { id_ambiente: a.id_ambiente, nombre: a.ambiente ?? 'Sin ambiente', kwh: a.kwh, porcentaje: 0 });
  }
  const ambientes = [...porAmbiente.values()]
    .sort((x, y) => y.kwh - x.kwh)
    .map((a) => ({ ...a, kwh: r3(a.kwh), porcentaje: pct(a.kwh) }));

  const electrodomesticos = [...aparatos]
    .sort((x, y) => y.kwh - x.kwh)
    .slice(0, TOP_ELECTRODOMESTICOS)
    .map((a) => ({ ...a, kwh: r3(a.kwh), porcentaje: pct(a.kwh) }));

  return { ambientes, electrodomesticos };
}

const SIN_COMPARACION: DashboardComparacion = {
  kwh_actual: null,
  kwh_anterior: null,
  diferencia_kwh: null,
  diferencia_pct: null,
  tendencia: null,
  periodo_anterior: null,
};

/**
 * Compara los kWh proyectados del periodo actual con los kWh reales del ciclo anterior. El ciclo
 * anterior se recalcula con calcularProyeccion (referencia = último día de ese ciclo), así no depende
 * de que haya un periodo guardado. Solo se compara si ambos tienen datos reales (lecturas o registros).
 */
async function comparar(idVivienda: number, actual: Proyeccion): Promise<DashboardComparacion> {
  if (!esFuenteReal(actual.fuente)) return SIN_COMPARACION;

  const anterior = await calcularProyeccion(idVivienda, sumarDias(actual.fecha_inicio, -1));
  if (!esFuenteReal(anterior.fuente) || anterior.kwh_acumulado <= 0) return SIN_COMPARACION;

  const diferencia = r3(actual.kwh_proyectado - anterior.kwh_acumulado);
  const porcentaje = r2((diferencia / anterior.kwh_acumulado) * 100);
  const tendencia = Math.abs(porcentaje) <= TOLERANCIA_IGUAL_PCT ? 'IGUAL' : diferencia > 0 ? 'SUBE' : 'BAJA';
  return {
    kwh_actual: actual.kwh_proyectado,
    kwh_anterior: anterior.kwh_acumulado,
    diferencia_kwh: diferencia,
    diferencia_pct: porcentaje,
    tendencia,
    periodo_anterior: { fecha_inicio: anterior.fecha_inicio, fecha_fin: anterior.fecha_fin, fuente: anterior.fuente },
  };
}

/* ------------------------------ Dashboard ------------------------------ */

export async function obtenerDashboard(idUsuario: number, idViviendaParam?: number): Promise<Dashboard> {
  // Ownership: 404 si la vivienda no es del usuario (o 400 si no tiene viviendas / tiene varias sin indicar)
  const id = await resolverViviendaId(idUsuario, idViviendaParam);
  const vivienda = await obtenerVivienda(idUsuario, id);

  const proyeccion = await calcularProyeccion(id);

  const [evaluacion, desglose, comparacion, periodo, recientes, noLeidas, configuracion, recomendaciones] =
    await Promise.all([
      evaluarSemaforo(id, proyeccion),
      consumoPorAparato(id, proyeccion),
      comparar(id, proyeccion),
      queryOne<{ id_periodo: number }>(
        "SELECT id_periodo FROM periodos_consumo WHERE id_vivienda = ? AND tipo = 'MENSUAL' AND fecha_inicio = ?",
        [id, proyeccion.fecha_inicio],
      ),
      listarNotificaciones(idUsuario, { id_vivienda: id, limit: MAX_NOTIFICACIONES_RECIENTES }),
      contarNoLeidas(idUsuario, id),
      listarConfig(idUsuario, { id_vivienda: id }),
      listarRecomendaciones(idUsuario, { id_vivienda: id, activas: true, limit: MAX_RECOMENDACIONES }),
    ]);

  const { ambientes, electrodomesticos } = armarDesgloses(desglose.aparatos);

  return {
    vivienda: {
      id_vivienda: vivienda.id_vivienda,
      nombre: vivienda.nombre,
      direccion: vivienda.direccion,
      region: vivienda.region,
      num_habitantes: vivienda.num_habitantes,
      dia_corte: vivienda.dia_corte,
      id_tarifa: vivienda.id_tarifa,
    },
    resumen: armarResumen(id, periodo?.id_periodo ?? null, proyeccion),
    presupuesto: armarPresupuesto(evaluacion),
    origen_desglose: desglose.origen,
    consumo_por_ambiente: ambientes,
    consumo_por_electrodomestico: electrodomesticos,
    comparacion,
    alertas: {
      nivel: evaluacion.nivel,
      motivo: evaluacion.motivo,
      umbrales: evaluacion.umbrales,
      presupuesto_mensual: evaluacion.presupuesto?.monto_mensual ?? null,
      monto_proyectado: evaluacion.monto_proyectado,
      porcentaje_proyectado: evaluacion.porcentaje_proyectado,
      no_leidas: noLeidas,
      recientes,
      configuracion,
    },
    recomendaciones,
  };
}
