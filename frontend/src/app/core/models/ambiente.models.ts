/** Tipos de ambiente que acepta el backend (types/index.ts → TIPOS_AMBIENTE). */
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

/** Etiquetas en español para mostrar cada tipo. */
export const TIPO_AMBIENTE_LABEL: Record<TipoAmbiente, string> = {
  SALA: 'Sala',
  COCINA: 'Cocina',
  DORMITORIO: 'Dormitorio',
  BANO: 'Baño',
  COMEDOR: 'Comedor',
  LAVANDERIA: 'Lavandería',
  OFICINA: 'Oficina',
  EXTERIOR: 'Exterior',
  OTRO: 'Otro',
};

/** Ambiente tal como lo devuelve el backend (GET/POST/PUT /api/ambientes). */
export interface Ambiente {
  id_ambiente: number;
  id_vivienda: number;
  nombre: string;
  tipo: TipoAmbiente;
}

/** Crear: `id_vivienda` se envía desde la vivienda seleccionada. */
export interface AmbienteCrearPayload {
  id_vivienda: number;
  nombre: string;
  tipo?: TipoAmbiente;
}

/** Actualizar (PUT parcial): al menos uno de los dos campos. */
export interface AmbienteActualizarPayload {
  nombre?: string;
  tipo?: TipoAmbiente;
}

/** Límites que aplica el backend (validators/ambiente.validator.ts). */
export const AMBIENTE_LIMITES = { nombre: 80 } as const;
