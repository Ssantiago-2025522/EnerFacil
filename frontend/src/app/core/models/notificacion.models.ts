import { NivelSemaforo } from './presupuesto.models';

/** Notificación de GET /api/notificaciones (solo los campos que usa la interfaz). `leida` llega como 0/1 (TINYINT). */
export interface Notificacion {
  id_notificacion: number;
  id_vivienda: number;
  nivel: NivelSemaforo;
  titulo: string;
  mensaje: string;
  leida: number;
  /** Timestamp ISO. */
  enviada_en: string;
}
