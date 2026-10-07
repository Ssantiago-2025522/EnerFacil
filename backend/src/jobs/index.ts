import { schedule, validate } from 'node-cron';
import { env } from '../config/env';
import { hoyISO } from '../utils/fechas';
import { ejecutarJobAlertas } from './alertas.job';
import { ejecutarJobConsumo } from './consumo.job';

let tarea: ReturnType<typeof schedule> | null = null;
let cicloActual: Promise<void> | null = null;

/** Un ciclo completo: recalcular consumo -> evaluar alertas -> notificar. */
async function ciclo(): Promise<void> {
  const inicio = Date.now();
  try {
    const consumo = await ejecutarJobConsumo(hoyISO());
    const alertas = await ejecutarJobAlertas(consumo.resultados);
    console.log(
      `[cron] ciclo terminado en ${Date.now() - inicio} ms: ${consumo.resultados.length}/${consumo.viviendas} viviendas recalculadas, ` +
        `${alertas.notificaciones} notificaciones nuevas, ${consumo.errores + alertas.errores} errores`,
    );
  } catch (err) {
    console.error('[cron] el ciclo falló:', err);
  }
}

/** Ejecuta un ciclo; si el anterior sigue en curso no arranca otro (evita solapes). */
export function ejecutarCiclo(): Promise<void> {
  if (cicloActual) {
    console.warn('[cron] el ciclo anterior sigue en ejecución; se omite esta pasada');
    return cicloActual;
  }
  cicloActual = ciclo().finally(() => {
    cicloActual = null;
  });
  return cicloActual;
}

/** Programa el cron con CRON_SCHEDULE. Falla al arrancar si la expresión es inválida. */
export function iniciarJobs(): void {
  if (tarea) return;
  const expresion = env.cron.schedule;
  if (!validate(expresion)) {
    throw new Error(`CRON_SCHEDULE no es una expresión cron válida: "${expresion}"`);
  }
  tarea = schedule(expresion, () => {
    void ejecutarCiclo();
  });
  console.log(`[cron] tareas programadas (${expresion})`);
}

/** Detiene la programación y espera a que termine el ciclo en curso, si lo hay. */
export async function detenerJobs(): Promise<void> {
  tarea?.stop();
  tarea = null;
  if (cicloActual) await cicloActual;
}
