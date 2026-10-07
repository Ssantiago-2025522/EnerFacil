/** Vivienda tal como la devuelve el backend (GET/POST/PUT /api/viviendas). */
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

/**
 * Cuerpo para crear/actualizar. NO incluye `id_usuario`: el backend lo toma del JWT.
 * Los campos opcionales aceptan `null` para vaciarlos; `dia_corte` solo acepta 1–28 (no es nullable).
 */
export interface ViviendaPayload {
  nombre: string;
  direccion?: string | null;
  region?: string | null;
  num_habitantes?: number | null;
  dia_corte?: number;
  id_tarifa?: number | null;
}

/** Límites que el backend aplica (validators/vivienda.validator.ts); el formulario usa los mismos. */
export const VIVIENDA_LIMITES = {
  nombre: 100,
  direccion: 255,
  region: 120,
  habitantes: { min: 1, max: 255 },
  diaCorte: { min: 1, max: 28 },
} as const;
