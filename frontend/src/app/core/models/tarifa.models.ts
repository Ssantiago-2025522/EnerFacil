/** Subconjunto de la tarifa que devuelve GET /api/tarifas y que necesita la interfaz. */
export interface Tarifa {
  id_tarifa: number;
  /** null = tarifa predefinida; con valor = tarifa personalizada del usuario. */
  id_usuario: number | null;
  nombre: string;
  distribuidora: string | null;
  region: string | null;
  tipo: 'SOCIAL' | 'RESIDENCIAL' | 'PERSONALIZADA';
  moneda: string;
}

/** Tramo de precio escalonado de GET /api/tarifas/actual. `kwh_hasta` null = sin límite superior. */
export interface TarifaTramo {
  kwh_desde: number;
  kwh_hasta: number | null;
  precio_kwh: number;
}

/** Tarifa asignada a una vivienda, con sus tramos (GET /api/tarifas/actual). */
export interface TarifaActual extends Tarifa {
  cargo_fijo: number;
  cargo_potencia_kw: number;
  impuesto_pct: number;
  vigente_desde: string;
  vigente_hasta: string | null;
  tramos: TarifaTramo[];
}
