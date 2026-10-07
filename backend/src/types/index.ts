/** Usuario autenticado, obtenido siempre del JWT (nunca del body). */
export interface AuthUser {
  id: number;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface Usuario {
  id_usuario: number;
  nombre: string;
  email: string;
  password_hash: string;
  activo: number;
  creado_en: string;
}

export type UsuarioPublico = Pick<Usuario, 'id_usuario' | 'nombre' | 'email'>;

export interface Vivienda {
  id_vivienda: number;
  id_usuario: number;
  id_tarifa: number | null;
  nombre: string;
  direccion: string | null;
  region: string | null;
  num_habitantes: number | null;
  dia_corte: number;
  creado_en: string;
}

export const TIPOS_AMBIENTE = [
  'SALA',
  'COCINA',
  'DORMITORIO',
  'BANO',
  'COMEDOR',
  'LAVANDERIA',
  'OFICINA',
  'EXTERIOR',
  'OTRO',
] as const;
export type TipoAmbiente = (typeof TIPOS_AMBIENTE)[number];

export interface Ambiente {
  id_ambiente: number;
  id_vivienda: number;
  nombre: string;
  tipo: TipoAmbiente;
}

export interface CatalogoElectrodomestico {
  id_catalogo: number;
  id_categoria: number;
  categoria: string;
  nombre: string;
  potencia_w_promedio: number;
  horas_uso_dia_promedio: number;
  factor_uso_promedio: number;
}

export interface Electrodomestico {
  id_electrodomestico: number;
  id_vivienda: number;
  id_ambiente: number | null;
  id_catalogo: number | null;
  nombre: string;
  potencia_w: number;
  cantidad: number;
  horas_uso_dia: number;
  dias_uso_mes: number;
  factor_uso: number;
  activo: number;
  creado_en: string;
  /** Columna generada por MySQL. Solo lectura. */
  kwh_mes_estimado: number;
  ambiente?: string | null;
}

export interface LecturaMedidor {
  id_lectura: number;
  id_vivienda: number;
  fecha_lectura: string;
  lectura_kwh: number;
  observacion: string | null;
  creado_en: string;
}

export interface RegistroUso {
  id_registro: number;
  id_electrodomestico: number;
  electrodomestico: string;
  id_vivienda: number;
  fecha: string;
  horas_uso: number;
  /** Calculado por el trigger de MySQL (trg_registros_uso_bi / _bu). Solo lectura. */
  kwh_calculado: number;
  creado_en: string;
}

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
  cerrado: number;
  calculado_en: string;
}

export interface DesgloseElectrodomestico {
  id_electrodomestico: number;
  nombre: string;
  kwh: number;
  monto_estimado: number;
  porcentaje_total: number;
}

export type TipoTarifa = 'SOCIAL' | 'RESIDENCIAL' | 'PERSONALIZADA';

export interface Tarifa {
  id_tarifa: number;
  /** NULL = tarifa predefinida (solo lectura); con valor = tarifa personalizada de ese usuario. */
  id_usuario: number | null;
  nombre: string;
  distribuidora: string | null;
  region: string | null;
  tipo: TipoTarifa;
  cargo_fijo: number;
  cargo_potencia_kw: number;
  impuesto_pct: number;
  moneda: string;
  vigente_desde: string;
  vigente_hasta: string | null;
  activa: number;
  creado_en: string;
}

export interface TarifaTramo {
  id_tramo: number;
  id_tarifa: number;
  kwh_desde: number;
  kwh_hasta: number | null;
  precio_kwh: number;
}

export type TarifaConTramos = Tarifa & { tramos: TarifaTramo[] };

export interface Presupuesto {
  id_presupuesto: number;
  id_vivienda: number;
  monto_mensual: number;
  vigente_desde: string;
  vigente_hasta: string | null;
  creado_en: string;
  /** Calculado en el servicio: true si hoy está dentro de la vigencia. */
  vigente?: boolean;
}

export const TIPOS_ALERTA = ['UMBRAL_PROXIMO', 'UMBRAL_SUPERADO', 'CONSUMO_ANOMALO'] as const;
export type TipoAlerta = (typeof TIPOS_ALERTA)[number];

export const CANALES_ALERTA = ['APP', 'EMAIL'] as const;
export type CanalAlerta = (typeof CANALES_ALERTA)[number];

export interface AlertaConfig {
  id_alerta_config: number;
  id_vivienda: number;
  tipo: TipoAlerta;
  porcentaje_umbral: number;
  canal: CanalAlerta;
  activa: number;
}

/** Semáforo de consumo (enum `notificaciones.nivel`). */
export type NivelSemaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface Notificacion {
  id_notificacion: number;
  id_usuario: number;
  id_vivienda: number;
  id_alerta_config: number | null;
  id_periodo: number | null;
  nivel: NivelSemaforo;
  titulo: string;
  mensaje: string;
  leida: number;
  enviada_en: string;
}

export const ESTADOS_RECOMENDACION = ['NUEVA', 'VISTA', 'APLICADA', 'DESCARTADA'] as const;
export type EstadoRecomendacion = (typeof ESTADOS_RECOMENDACION)[number];

export interface Recomendacion {
  id_recomendacion: number;
  id_vivienda: number;
  id_electrodomestico: number | null;
  id_plantilla: number | null;
  mensaje: string;
  ahorro_kwh_mes: number;
  ahorro_monto_mes: number;
  /** 1 = más alta. */
  prioridad: number;
  estado: EstadoRecomendacion;
  generada_en: string;
  /** De la plantilla (null si la plantilla fue eliminada). */
  titulo: string | null;
  id_categoria: number | null;
  categoria: string | null;
  electrodomestico: string | null;
}
