import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { execute, query, queryOne, withTransaction } from '../config/database';
import type { SqlParam } from '../config/database';
import type { EstadoRecomendacion, Recomendacion } from '../types';
import type { RecomendacionesQuery } from '../validators/recomendacion.validator';
import { hoyISO, sumarDias } from '../utils/fechas';
import { AppError } from '../utils/responses';
import { evaluarSemaforo } from './alerta.service';
import { calcularProyeccion } from './proyeccion.service';
import { calcularMonto } from './tarifa.service';
import { asegurarPropiedad, resolverViviendaId } from './vivienda.service';

/**
 * Recomendaciones de ahorro (tablas `recomendaciones_plantilla` y `recomendaciones`).
 * Reglas simples y deterministas sobre datos que ya existen; sin IA ni APIs externas.
 * La propiedad se verifica siempre contra viviendas.id_usuario (404 si no es del usuario).
 *
 * REGLAS (sus umbrales están aquí abajo, en un solo lugar):
 *  1. APARATO DE ALTO CONSUMO: un electrodoméstico activo representa >= UMBRAL_PARTICIPACION_PCT %
 *     del consumo mensual estimado de la vivienda (vista v_consumo_por_electrodomestico).
 *     -> se le asignan las plantillas de la categoría de su catálogo.
 *  2. MUCHAS HORAS DE USO: promedia >= UMBRAL_HORAS_USO h/día (y menos de 24: lo que funciona todo
 *     el día, como un refrigerador, no se puede "usar menos"). Se usa el promedio real de
 *     registros_uso de los últimos DIAS_HABITO días; si no hay registros, horas_uso_dia.
 *     -> mismas plantillas de su categoría.
 *  3. PRESUPUESTO EN RIESGO: el semáforo (alerta.service.evaluarSemaforo) está en AMARILLO o ROJO.
 *     -> plantillas generales (id_categoria NULL), sin electrodoméstico.
 */

export const UMBRAL_PARTICIPACION_PCT = 15;
export const PARTICIPACION_PRIORITARIA_PCT = 40;
export const UMBRAL_HORAS_USO = 8;
export const DIAS_HABITO = 30;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/* =====================================================================
 * CONSULTAS (con propiedad)
 * ===================================================================== */

const SELECT_RECOMENDACION = `
  SELECT r.id_recomendacion, r.id_vivienda, r.id_electrodomestico, r.id_plantilla, r.mensaje,
         r.ahorro_kwh_mes, r.ahorro_monto_mes, r.prioridad, r.estado, r.generada_en,
         p.titulo, p.id_categoria, c.nombre AS categoria, e.nombre AS electrodomestico
    FROM recomendaciones r
    JOIN viviendas v ON v.id_vivienda = r.id_vivienda
    LEFT JOIN recomendaciones_plantilla p ON p.id_plantilla = r.id_plantilla
    LEFT JOIN categorias_electrodomestico c ON c.id_categoria = p.id_categoria
    LEFT JOIN electrodomesticos e ON e.id_electrodomestico = r.id_electrodomestico`;

export async function listar(idUsuario: number, filtros: RecomendacionesQuery): Promise<Recomendacion[]> {
  const condiciones = ['v.id_usuario = ?'];
  const params: SqlParam[] = [idUsuario];

  if (filtros.id_vivienda !== undefined) {
    await asegurarPropiedad(idUsuario, filtros.id_vivienda);
    condiciones.push('r.id_vivienda = ?');
    params.push(filtros.id_vivienda);
  }
  if (filtros.estado !== undefined) {
    condiciones.push('r.estado = ?');
    params.push(filtros.estado);
  }
  if (filtros.activas !== undefined) {
    condiciones.push(filtros.activas ? "r.estado IN ('NUEVA','VISTA')" : "r.estado IN ('APLICADA','DESCARTADA')");
  }
  if (filtros.id_categoria !== undefined) {
    condiciones.push('p.id_categoria = ?');
    params.push(filtros.id_categoria);
  }
  // `limit` ya fue validado como entero (1-500) por Zod
  const limit = filtros.limit ?? 100;
  return query<Recomendacion>(
    `${SELECT_RECOMENDACION} WHERE ${condiciones.join(' AND ')}
      ORDER BY r.prioridad, r.generada_en DESC, r.id_recomendacion DESC LIMIT ${limit}`,
    params,
  );
}

export async function obtener(idUsuario: number, idRecomendacion: number): Promise<Recomendacion> {
  const fila = await queryOne<Recomendacion>(
    `${SELECT_RECOMENDACION} WHERE r.id_recomendacion = ? AND v.id_usuario = ?`,
    [idRecomendacion, idUsuario],
  );
  if (!fila) throw AppError.notFound('Recomendación no encontrada');
  return fila;
}

/** Cambia el estado (NUEVA / VISTA / APLICADA / DESCARTADA). */
export async function actualizarEstado(
  idUsuario: number,
  idRecomendacion: number,
  estado: EstadoRecomendacion,
): Promise<Recomendacion> {
  await obtener(idUsuario, idRecomendacion); // 404 si no es del usuario
  await execute('UPDATE recomendaciones SET estado = ? WHERE id_recomendacion = ?', [estado, idRecomendacion]);
  return obtener(idUsuario, idRecomendacion);
}

/* =====================================================================
 * GENERACIÓN
 * ===================================================================== */

interface Plantilla {
  id_plantilla: number;
  id_categoria: number | null;
  titulo: string;
  descripcion: string;
  ahorro_estimado_pct: number;
}

interface AparatoAnalizado {
  id_electrodomestico: number;
  nombre: string;
  horas_uso_dia: number;
  kwh_mes_estimado: number;
  porcentaje_hogar: number | null;
  id_categoria: number | null;
}

/** Recomendación candidata (aún no guardada). Una por (electrodoméstico, plantilla). */
interface Candidata {
  idElectrodomestico: number | null;
  plantilla: Plantilla;
  /** kWh/mes sobre los que se aplica el % de ahorro de la plantilla. */
  kwhBase: number;
  prioridad: number;
  motivos: string[];
}

export interface ResultadoGeneracion {
  id_vivienda: number;
  creadas: number;
  actualizadas: number;
  /** Ya existían y están APLICADA o DESCARTADA (se respeta la decisión del usuario) o sin cambios. */
  omitidas: number;
  recomendaciones: Recomendacion[];
}

function agregar(
  mapa: Map<string, Candidata>,
  idElectro: number | null,
  plantilla: Plantilla,
  kwhBase: number,
  prioridad: number,
  motivo: string,
): void {
  const clave = `${idElectro ?? 'null'}:${plantilla.id_plantilla}`;
  const previa = mapa.get(clave);
  if (previa) {
    previa.prioridad = Math.min(previa.prioridad, prioridad);
    previa.motivos.push(motivo);
  } else {
    mapa.set(clave, { idElectrodomestico: idElectro, plantilla, kwhBase, prioridad, motivos: [motivo] });
  }
}

/** Aplica las reglas y devuelve las recomendaciones candidatas. Solo lee datos. */
async function analizar(
  idVivienda: number,
): Promise<{ candidatas: Candidata[]; idTarifa: number | null; kwhHogar: number }> {
  const hoy = hoyISO();
  const vivienda = await queryOne<{ id_tarifa: number | null }>('SELECT id_tarifa FROM viviendas WHERE id_vivienda = ?', [
    idVivienda,
  ]);
  if (!vivienda) throw AppError.notFound('Vivienda no encontrada');

  const plantillas = await query<Plantilla>(
    'SELECT id_plantilla, id_categoria, titulo, descripcion, ahorro_estimado_pct FROM recomendaciones_plantilla ORDER BY id_plantilla',
  );
  const porCategoria = (idCategoria: number | null) => plantillas.filter((p) => p.id_categoria === idCategoria);

  // Participación de cada aparato: se reutiliza la vista v_consumo_por_electrodomestico
  const aparatos = await query<AparatoAnalizado>(
    `SELECT e.id_electrodomestico, e.nombre, e.horas_uso_dia, e.kwh_mes_estimado,
            c.porcentaje_hogar, cat.id_categoria
       FROM electrodomesticos e
       JOIN v_consumo_por_electrodomestico c ON c.id_electrodomestico = e.id_electrodomestico
       LEFT JOIN catalogo_electrodomesticos cat ON cat.id_catalogo = e.id_catalogo
      WHERE e.id_vivienda = ? AND e.activo = 1`,
    [idVivienda],
  );

  // Hábito real: horas promedio de uso por día en los últimos DIAS_HABITO días
  const habitos = await query<{ id_electrodomestico: number; horas_prom: number }>(
    `SELECT r.id_electrodomestico, AVG(r.horas_uso) AS horas_prom
       FROM registros_uso r
       JOIN electrodomesticos e ON e.id_electrodomestico = r.id_electrodomestico
      WHERE e.id_vivienda = ? AND r.fecha >= ?
      GROUP BY r.id_electrodomestico`,
    [idVivienda, sumarDias(hoy, -(DIAS_HABITO - 1))],
  );
  const horasReales = new Map(habitos.map((h) => [h.id_electrodomestico, h.horas_prom]));

  const candidatas = new Map<string, Candidata>();
  const totalEstimado = aparatos.reduce((acc, a) => acc + a.kwh_mes_estimado, 0);

  for (const a of aparatos) {
    const plantillasCategoria = a.id_categoria === null ? [] : porCategoria(a.id_categoria);
    if (plantillasCategoria.length === 0) continue; // sin categoría o sin plantillas: nada que recomendar

    const participacion = a.porcentaje_hogar ?? 0;
    if (participacion >= UMBRAL_PARTICIPACION_PCT) {
      const prioridad = participacion >= PARTICIPACION_PRIORITARIA_PCT ? 1 : 2;
      const motivo = `${a.nombre} representa el ${participacion.toFixed(1)} % del consumo mensual estimado de tu vivienda (${a.kwh_mes_estimado.toFixed(1)} kWh).`;
      for (const p of plantillasCategoria) agregar(candidatas, a.id_electrodomestico, p, a.kwh_mes_estimado, prioridad, motivo);
    }

    const horas = horasReales.get(a.id_electrodomestico) ?? a.horas_uso_dia;
    if (horas >= UMBRAL_HORAS_USO && horas < 24) {
      const origen = horasReales.has(a.id_electrodomestico) ? `en los últimos ${DIAS_HABITO} días` : 'según su configuración';
      const motivo = `${a.nombre} se usa ${horas.toFixed(1)} h al día en promedio (${origen}).`;
      for (const p of plantillasCategoria) agregar(candidatas, a.id_electrodomestico, p, a.kwh_mes_estimado, 3, motivo);
    }
  }

  // Proyección del periodo: base para el ahorro general y semáforo del presupuesto
  const proyeccion = await calcularProyeccion(idVivienda);
  const kwhHogar = proyeccion.fuente !== 'SIN_DATOS' ? proyeccion.kwh_proyectado : totalEstimado;

  const evaluacion = await evaluarSemaforo(idVivienda, proyeccion);
  if ((evaluacion.nivel === 'AMARILLO' || evaluacion.nivel === 'ROJO') && evaluacion.porcentaje_proyectado !== null) {
    const prioridad = evaluacion.nivel === 'ROJO' ? 1 : 2;
    const motivo = `Tu gasto proyectado es el ${evaluacion.porcentaje_proyectado.toFixed(1)} % de tu presupuesto mensual (semáforo ${evaluacion.nivel}).`;
    for (const p of porCategoria(null)) agregar(candidatas, null, p, kwhHogar, prioridad, motivo);
  }

  return { candidatas: [...candidatas.values()], idTarifa: vivienda.id_tarifa, kwhHogar };
}

interface Existente {
  id: number;
  estado: EstadoRecomendacion;
  mensaje: string;
  ahorroKwh: number;
  ahorroMonto: number;
  prioridad: number;
}

/** Busca una recomendación equivalente: misma vivienda + mismo electrodoméstico (o ninguno) + misma plantilla. */
async function buscarExistente(
  conn: PoolConnection,
  idVivienda: number,
  idElectro: number | null,
  idPlantilla: number,
): Promise<Existente | null> {
  const [filas] = await conn.execute<RowDataPacket[]>(
    `SELECT id_recomendacion, estado, mensaje, ahorro_kwh_mes, ahorro_monto_mes, prioridad
       FROM recomendaciones
      WHERE id_vivienda = ? AND id_electrodomestico <=> ? AND id_plantilla = ?
      ORDER BY id_recomendacion LIMIT 1`,
    [idVivienda, idElectro, idPlantilla],
  );
  const f = filas[0];
  if (!f) return null;
  return {
    id: f['id_recomendacion'] as number,
    estado: f['estado'] as EstadoRecomendacion,
    mensaje: f['mensaje'] as string,
    ahorroKwh: Number(f['ahorro_kwh_mes']),
    ahorroMonto: Number(f['ahorro_monto_mes']),
    prioridad: f['prioridad'] as number,
  };
}

/**
 * Genera (sin duplicar) las recomendaciones de una vivienda del usuario.
 *  - No existe una equivalente  -> se inserta (estado NUEVA).
 *  - Existe NUEVA o VISTA       -> se reutiliza: se actualizan mensaje, ahorros y prioridad si cambiaron.
 *  - Existe APLICADA/DESCARTADA -> no se toca (se respeta la decisión del usuario).
 * El ahorro en dinero se calcula con fn_calcular_monto (tarifa.service.calcularMonto) como la
 * diferencia entre facturar el consumo actual y el consumo menos el ahorro.
 * Las recomendaciones de reglas que ya no aplican se dejan como están (el usuario las puede descartar).
 */
export async function generar(idUsuario: number, idVivienda?: number): Promise<ResultadoGeneracion> {
  const id = await resolverViviendaId(idUsuario, idVivienda);
  const { candidatas, idTarifa, kwhHogar } = await analizar(id);

  const montoActual = idTarifa !== null && kwhHogar > 0 ? await calcularMonto(idTarifa, kwhHogar) : 0;

  let creadas = 0;
  let actualizadas = 0;
  let omitidas = 0;

  // Se bloquea la fila de la vivienda para que dos generaciones simultáneas no dupliquen
  await withTransaction(async (conn) => {
    await conn.execute('SELECT id_vivienda FROM viviendas WHERE id_vivienda = ? FOR UPDATE', [id]);

    for (const c of candidatas) {
      const ahorroKwh = r2(Math.min(c.kwhBase, (c.kwhBase * c.plantilla.ahorro_estimado_pct) / 100));
      const ahorroMonto =
        idTarifa !== null && ahorroKwh > 0
          ? r2(Math.max(0, montoActual - (await calcularMonto(idTarifa, r3(Math.max(0, kwhHogar - ahorroKwh))))))
          : 0;
      const mensaje = `${c.motivos.join(' ')} ${c.plantilla.titulo}. ${c.plantilla.descripcion}`;

      const existente = await buscarExistente(conn, id, c.idElectrodomestico, c.plantilla.id_plantilla);
      if (!existente) {
        await conn.execute<ResultSetHeader>(
          `INSERT INTO recomendaciones
             (id_vivienda, id_electrodomestico, id_plantilla, mensaje, ahorro_kwh_mes, ahorro_monto_mes, prioridad)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, c.idElectrodomestico, c.plantilla.id_plantilla, mensaje, ahorroKwh, ahorroMonto, c.prioridad],
        );
        creadas++;
      } else if (existente.estado === 'NUEVA' || existente.estado === 'VISTA') {
        const cambio =
          existente.mensaje !== mensaje ||
          existente.ahorroKwh !== ahorroKwh ||
          existente.ahorroMonto !== ahorroMonto ||
          existente.prioridad !== c.prioridad;
        if (cambio) {
          await conn.execute(
            `UPDATE recomendaciones
                SET mensaje = ?, ahorro_kwh_mes = ?, ahorro_monto_mes = ?, prioridad = ?
              WHERE id_recomendacion = ?`,
            [mensaje, ahorroKwh, ahorroMonto, c.prioridad, existente.id],
          );
          actualizadas++;
        } else {
          omitidas++;
        }
      } else {
        omitidas++;
      }
    }
  });

  const recomendaciones = await listar(idUsuario, { id_vivienda: id, activas: true });
  return { id_vivienda: id, creadas, actualizadas, omitidas, recomendaciones };
}
