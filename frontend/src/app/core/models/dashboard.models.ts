import { FuenteProyeccion } from './consumo.models';
import { MotivoSinNivel, NivelSemaforo } from './presupuesto.models';

/**
 * Modelo de GET /api/dashboard (backend: services/dashboard.service.ts). Solo se declaran los campos que
 * usa la pantalla. Todo viene calculado por el backend a partir de Consumo, Presupuesto, Alertas y Tarifas:
 * el frontend no recalcula proyecciones, montos ni niveles del semáforo.
 */
export interface DashboardResumen {
  id_vivienda: number;
  /** 'YYYY-MM-DD' */
  fecha_inicio: string;
  fecha_fin: string;
  dias_totales: number;
  dias_transcurridos: number;
  dias_restantes: number;
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
  porcentaje_proyectado: number | null;
  porcentaje_utilizado: number | null;
  nivel: NivelSemaforo | null;
  motivo: MotivoSinNivel | null;
}

export interface DashboardElectrodomestico {
  id_electrodomestico: number;
  nombre: string;
  ambiente: string | null;
  kwh: number;
  /** Porcentaje sobre el consumo total del hogar (todos los equipos, no solo los mostrados). */
  porcentaje: number;
}

export interface DashboardComparacion {
  kwh_anterior: number | null;
  diferencia_pct: number | null;
  tendencia: 'SUBE' | 'BAJA' | 'IGUAL' | null;
}

export interface DashboardAlertas {
  /** Semáforo decidido por el módulo Alertas. null si no hay base para evaluarlo (ver `motivo`). */
  nivel: NivelSemaforo | null;
  motivo: MotivoSinNivel | null;
  porcentaje_proyectado: number | null;
}

export interface DashboardData {
  vivienda: { id_vivienda: number; nombre: string };
  resumen: DashboardResumen;
  /** null si la vivienda no tiene presupuesto vigente. */
  presupuesto: DashboardPresupuesto | null;
  /** REGISTROS_USO = kWh reales del ciclo; ESTIMACION = consumo mensual estimado; null = sin datos. */
  origen_desglose: 'REGISTROS_USO' | 'ESTIMACION' | null;
  consumo_por_electrodomestico: DashboardElectrodomestico[];
  comparacion: DashboardComparacion;
  alertas: DashboardAlertas;
}
