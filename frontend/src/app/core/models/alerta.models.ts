/**
 * Modelos del módulo Alertas. Reflejan lo que devuelve el backend (services/alerta.service.ts):
 * - GET /api/alertas/estado → `EstadoPresupuesto` (models/presupuesto.models.ts): el nivel del semáforo,
 *   los umbrales y los montos vienen calculados; el frontend no decide reglas de alerta.
 * - GET/POST/PUT /api/alertas/config → filas de `alertas_config`.
 */

export type TipoAlerta = 'UMBRAL_PROXIMO' | 'UMBRAL_SUPERADO' | 'CONSUMO_ANOMALO';
export type CanalAlerta = 'APP' | 'EMAIL';

export const TIPOS_ALERTA: readonly TipoAlerta[] = ['UMBRAL_PROXIMO', 'UMBRAL_SUPERADO', 'CONSUMO_ANOMALO'];
export const CANALES_ALERTA: readonly CanalAlerta[] = ['APP', 'EMAIL'];

/** Fila de `alertas_config` (activa llega como 0/1, igual que MySQL TINYINT). */
export interface AlertaConfig {
  id_alerta_config: number;
  id_vivienda: number;
  tipo: TipoAlerta;
  porcentaje_umbral: number;
  canal: CanalAlerta;
  activa: number;
}

/** Cuerpo de POST /api/alertas/config. */
export interface AlertaConfigCrearPayload {
  id_vivienda: number;
  tipo: TipoAlerta;
  porcentaje_umbral: number;
  canal?: CanalAlerta;
  activa?: boolean;
}

/** Cuerpo de PUT /api/alertas/config/:id (el tipo no se puede cambiar). */
export interface AlertaConfigActualizarPayload {
  porcentaje_umbral?: number;
  canal?: CanalAlerta;
  activa?: boolean;
}

/** Límites del backend: alertas_config.porcentaje_umbral es DECIMAL(5,2), > 0 (validators/alerta.validator.ts). */
export const ALERTA_LIMITES = { umbral: { min: 0.01, max: 999.99, decimales: 2 } } as const;
