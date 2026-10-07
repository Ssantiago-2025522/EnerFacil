/** Electrodoméstico tal como lo devuelve el backend (GET/POST/PUT /api/electrodomesticos). */
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
  /** 1 = activo, 0 = inactivo (el backend lo devuelve como número). */
  activo: number;
  creado_en: string;
  /** Columna generada por MySQL (solo lectura): nunca se envía ni se recalcula en el frontend. */
  kwh_mes_estimado: number;
  /** Nombre del ambiente (JOIN); null si no tiene ambiente. */
  ambiente?: string | null;
}

/** Elemento del catálogo (GET /api/electrodomesticos/catalogo). */
export interface CatalogoElectrodomestico {
  id_catalogo: number;
  id_categoria: number;
  categoria: string;
  nombre: string;
  potencia_w_promedio: number;
  horas_uso_dia_promedio: number;
  factor_uso_promedio: number;
}

/** Crear. `id_usuario` no existe: el backend lo toma del JWT. Con `id_catalogo` el backend usa sus promedios solo como valores iniciales. */
export interface ElectrodomesticoCrearPayload {
  id_vivienda: number;
  id_ambiente: number | null;
  id_catalogo?: number;
  nombre: string;
  potencia_w: number;
  cantidad: number;
  horas_uso_dia: number;
  dias_uso_mes: number;
  factor_uso: number;
}

/** Actualizar (PUT parcial, al menos un campo). No permite cambiar vivienda ni catálogo. */
export interface ElectrodomesticoActualizarPayload {
  id_ambiente?: number | null;
  nombre?: string;
  potencia_w?: number;
  cantidad?: number;
  horas_uso_dia?: number;
  dias_uso_mes?: number;
  factor_uso?: number;
  activo?: boolean;
}

/** Límites del backend (validators/electrodomestico.validator.ts). La potencia debe ser > 0. */
export const ELECTRO_LIMITES = {
  nombre: 100,
  potencia: { max: 100000 },
  cantidad: { min: 1, max: 1000 },
  horas: { min: 0, max: 24 },
  dias: { min: 0, max: 31 },
  factor: { min: 0, max: 1 },
} as const;
