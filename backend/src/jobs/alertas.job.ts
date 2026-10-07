import { evaluarYNotificar } from '../services/alerta.service';
import type { ResultadoConsumo } from './consumo.job';

/**
 * Paso 2 del cron: con el periodo ya recalculado, consulta el presupuesto vigente, determina el
 * nivel (semáforo) y genera la notificación cuando corresponde. La deduplicación
 * (periodo + configuración + nivel) vive en notificacion.service.crearSiNoExiste.
 */

export interface ResumenJobAlertas {
  evaluadas: number;
  notificaciones: number;
  errores: number;
}

export async function ejecutarJobAlertas(resultados: ResultadoConsumo[]): Promise<ResumenJobAlertas> {
  let notificaciones = 0;
  let errores = 0;

  for (const r of resultados) {
    try {
      const res = await evaluarYNotificar(r.idVivienda, r.idPeriodo, r.proyeccion);
      notificaciones += res.notificaciones_creadas;
    } catch (err) {
      errores++;
      console.error(`[cron] alertas: error en la vivienda ${r.idVivienda}:`, err);
    }
  }
  return { evaluadas: resultados.length, notificaciones, errores };
}
