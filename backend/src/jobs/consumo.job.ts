import { execute, query } from '../config/database';
import { guardarPeriodo } from '../services/proyeccion.service';
import type { Proyeccion } from '../services/proyeccion.service';

/**
 * Paso 1 del cron: recalcular consumo / proyección / montos de las viviendas con periodos activos.
 * No duplica lógica: delega en proyeccion.service.guardarPeriodo, que a su vez usa las lecturas,
 * los registros de uso, la estimación y tarifa.service (fn_calcular_monto) y hace el upsert en
 * `periodos_consumo` (+ desglose por electrodoméstico).
 */

export interface ResultadoConsumo {
  idVivienda: number;
  idPeriodo: number;
  proyeccion: Proyeccion;
}

export interface ResumenJobConsumo {
  viviendas: number;
  resultados: ResultadoConsumo[];
  errores: number;
}

/** Viviendas con al menos un periodo mensual sin cerrar (cerrado = 0). */
async function viviendasConPeriodoActivo(): Promise<number[]> {
  const filas = await query<{ id_vivienda: number }>(
    "SELECT DISTINCT id_vivienda FROM periodos_consumo WHERE tipo = 'MENSUAL' AND cerrado = 0 ORDER BY id_vivienda",
  );
  return filas.map((f) => f.id_vivienda);
}

/**
 * Periodos sin cerrar cuyo ciclo ya terminó: se recalculan una última vez con su fecha de fin como
 * referencia (guardarPeriodo los marca cerrado = 1). Así el periodo anterior queda con su valor
 * final y el nuevo ciclo arranca en la misma pasada.
 */
async function cerrarPeriodosVencidos(idVivienda: number, hoy: string): Promise<void> {
  const vencidos = await query<{ id_periodo: number; fecha_fin: string }>(
    "SELECT id_periodo, fecha_fin FROM periodos_consumo WHERE id_vivienda = ? AND tipo = 'MENSUAL' AND cerrado = 0 AND fecha_fin < ?",
    [idVivienda, hoy],
  );
  for (const p of vencidos) {
    const { idPeriodo } = await guardarPeriodo(idVivienda, p.fecha_fin);
    // Si cambió el dia_corte de la vivienda, el recálculo puede caer en otro periodo: se fuerza el cierre
    // del vencido para que no se reprocese en cada ejecución.
    if (idPeriodo !== p.id_periodo) {
      await execute('UPDATE periodos_consumo SET cerrado = 1 WHERE id_periodo = ?', [p.id_periodo]);
    }
  }
}

export async function ejecutarJobConsumo(hoy: string): Promise<ResumenJobConsumo> {
  const ids = await viviendasConPeriodoActivo();
  const resultados: ResultadoConsumo[] = [];
  let errores = 0;

  for (const idVivienda of ids) {
    try {
      await cerrarPeriodosVencidos(idVivienda, hoy);
      const { idPeriodo, proyeccion } = await guardarPeriodo(idVivienda);
      resultados.push({ idVivienda, idPeriodo, proyeccion });
    } catch (err) {
      // Un fallo en una vivienda no debe detener al resto
      errores++;
      console.error(`[cron] consumo: error en la vivienda ${idVivienda}:`, err);
    }
  }
  return { viviendas: ids.length, resultados, errores };
}
