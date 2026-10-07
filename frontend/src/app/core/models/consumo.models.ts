/**
 * Modelos de /api/consumo. Son el reflejo de lo que devuelve el backend (services/proyeccion.service.ts
 * y services/consumo.service.ts): ningún kWh ni monto se calcula en el frontend.
 */

export type FuenteProyeccion = 'LECTURAS' | 'REGISTROS_USO' | 'ESTIMACION' | 'SIN_DATOS';

export interface ResumenFuente {
  kwh_acumulado: number;
  dias_con_datos: number;
  promedio_diario_kwh: number;
  kwh_proyectado: number;
}

export interface ResumenTarifa {
  id_tarifa: number;
  nombre: string;
  moneda: string;
}

/** GET /api/consumo/proyeccion: ciclo mensual en curso, calculado en el momento (no se guarda). */
export interface Proyeccion {
  id_vivienda: number;
  tipo: 'MENSUAL';
  fecha_inicio: string;
  fecha_fin: string;
  fecha_referencia: string;
  dias_totales: number;
  dias_transcurridos: number;
  dias_restantes: number;
  fuente: FuenteProyeccion;
  kwh_acumulado: number;
  promedio_diario_kwh: number;
  kwh_proyectado: number;
  /** null si la vivienda no tiene tarifa asignada. */
  tarifa: ResumenTarifa | null;
  kw_contratados: number;
  /** null si no hay tarifa. Calculado por fn_calcular_monto (MySQL). */
  monto_acumulado: number | null;
  monto_proyectado: number | null;
  fuentes: {
    lecturas: (ResumenFuente & { fecha_lectura_base: string; fecha_ultima_lectura: string }) | null;
    registros_uso: ResumenFuente | null;
    estimacion: ResumenFuente | null;
  };
}

/** GET /api/consumo/periodos: fila de periodos_consumo (periodo guardado por el cálculo/cron). */
export interface PeriodoConsumo {
  id_periodo: number;
  id_vivienda: number;
  tipo: 'SEMANAL' | 'MENSUAL';
  fecha_inicio: string;
  fecha_fin: string;
  kwh_acumulado: number;
  kwh_proyectado: number;
  monto_acumulado: number;
  monto_proyectado: number;
  /** 1 = el ciclo ya terminó y el valor es definitivo. */
  cerrado: number;
  calculado_en: string;
}

/** Fila de consumo_electrodomestico_periodo: kWh reales (registros de uso) de un equipo en el periodo. */
export interface DesgloseElectrodomestico {
  id_electrodomestico: number;
  nombre: string;
  kwh: number;
  /** El backend todavía no lo calcula (siempre 0): no se muestra. */
  monto_estimado: number;
  porcentaje_total: number;
}

/** GET /api/consumo/periodos/:id */
export type PeriodoDetalle = PeriodoConsumo & { desglose: DesgloseElectrodomestico[] };

/** POST /api/consumo/periodos/calcular */
export interface PeriodoGuardado {
  periodo: PeriodoDetalle;
  proyeccion: Proyeccion;
}

export interface LecturaMedidor {
  id_lectura: number;
  id_vivienda: number;
  fecha_lectura: string;
  lectura_kwh: number;
  observacion: string | null;
  creado_en: string;
}

export interface LecturaPayload {
  id_vivienda: number;
  fecha_lectura: string;
  lectura_kwh: number;
  observacion?: string | null;
}

export interface RegistroUso {
  id_registro: number;
  id_electrodomestico: number;
  electrodomestico: string;
  id_vivienda: number;
  fecha: string;
  horas_uso: number;
  /** Calculado por el trigger de MySQL: nunca se envía. */
  kwh_calculado: number;
  creado_en: string;
}

export interface UsoPayload {
  id_electrodomestico: number;
  fecha: string;
  horas_uso: number;
}

/** Límites que aplica el backend (validators/consumo.validator.ts). */
export const CONSUMO_LIMITES = {
  lecturaKwh: { min: 0, max: 9_999_999_999 },
  horas: { min: 0, max: 24 },
  observacion: 255,
} as const;
