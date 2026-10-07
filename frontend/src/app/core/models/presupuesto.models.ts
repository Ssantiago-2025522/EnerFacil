/**
 * Modelos de /api/presupuesto y del semáforo /api/alertas/estado. Reflejan lo que devuelve el backend
 * (services/presupuesto.service.ts y services/alerta.service.ts): el nivel del semáforo, los umbrales y
 * los montos vienen calculados; el frontend no decide reglas de alerta.
 */

/** GET /api/presupuesto: fila de `presupuestos` (presupuesto MENSUAL con rango de vigencia). */
export interface Presupuesto {
  id_presupuesto: number;
  id_vivienda: number;
  monto_mensual: number;
  /** 'YYYY-MM-DD' */
  vigente_desde: string;
  /** null = sin fecha de fin. */
  vigente_hasta: string | null;
  creado_en: string;
  /** Calculado por el backend: true si hoy está dentro de la vigencia. */
  vigente?: boolean;
}

/**
 * Cuerpo de POST /api/presupuesto. NO incluye `id_usuario`: el backend lo toma del JWT.
 * Sin `vigente_desde` el backend usa hoy; sin `vigente_hasta` el presupuesto queda sin fecha de fin.
 */
export interface PresupuestoCrearPayload {
  id_vivienda: number;
  monto_mensual: number;
}

export type NivelSemaforo = 'VERDE' | 'AMARILLO' | 'ROJO';
export type MotivoSinNivel = 'SIN_PRESUPUESTO' | 'SIN_TARIFA' | 'SIN_DATOS';

/** GET /api/alertas/estado: proyección del ciclo en curso evaluada contra el presupuesto vigente. */
export interface EstadoPresupuesto {
  id_vivienda: number;
  fecha_inicio: string;
  fecha_fin: string;
  fuente: 'LECTURAS' | 'REGISTROS_USO' | 'ESTIMACION' | 'SIN_DATOS';
  /** null si la vivienda no tiene tarifa. Es una estimación, no una factura. */
  monto_acumulado: number | null;
  monto_proyectado: number | null;
  presupuesto: { id_presupuesto: number; monto_mensual: number } | null;
  /** monto_proyectado / presupuesto * 100 (backend). null si no se puede calcular. */
  porcentaje_proyectado: number | null;
  /** Umbrales de alertas_config (por defecto 80 y 100). */
  umbrales: { proximo: number; superado: number };
  /** null cuando no hay base para evaluar (ver `motivo`). */
  nivel: NivelSemaforo | null;
  motivo: MotivoSinNivel | null;
}

/** Límites que aplica el backend (validators/presupuesto.validator.ts: DECIMAL(12,2), > 0). */
export const PRESUPUESTO_LIMITES = {
  monto: { min: 0.01, max: 9_999_999_999, decimales: 2 },
} as const;
