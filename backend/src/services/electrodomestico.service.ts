import { buildSet, execute, query, queryOne } from '../config/database';
import type { SqlParam } from '../config/database';
import type { CatalogoElectrodomestico, Electrodomestico } from '../types';
import type {
  ActualizarElectrodomesticoInput,
  CrearElectrodomesticoInput,
} from '../validators/electrodomestico.validator';
import { AppError } from '../utils/responses';
import { asegurarPropiedad, resolverViviendaId } from './vivienda.service';

/* ----------------------------- Catálogo ----------------------------- */

const SELECT_CATALOGO = `
  SELECT c.id_catalogo, c.id_categoria, cat.nombre AS categoria, c.nombre,
         c.potencia_w_promedio, c.horas_uso_dia_promedio, c.factor_uso_promedio
    FROM catalogo_electrodomesticos c
    JOIN categorias_electrodomestico cat ON cat.id_categoria = c.id_categoria`;

export async function listarCatalogo(filtros: {
  id_categoria?: number | undefined;
  q?: string | undefined;
}): Promise<CatalogoElectrodomestico[]> {
  const condiciones: string[] = [];
  const params: SqlParam[] = [];
  if (filtros.id_categoria !== undefined) {
    condiciones.push('c.id_categoria = ?');
    params.push(filtros.id_categoria);
  }
  if (filtros.q) {
    condiciones.push('c.nombre LIKE ?');
    params.push(`%${filtros.q}%`);
  }
  const where = condiciones.length ? ` WHERE ${condiciones.join(' AND ')}` : '';
  return query<CatalogoElectrodomestico>(`${SELECT_CATALOGO}${where} ORDER BY cat.nombre, c.nombre`, params);
}

export async function obtenerCatalogo(idCatalogo: number): Promise<CatalogoElectrodomestico> {
  const item = await queryOne<CatalogoElectrodomestico>(`${SELECT_CATALOGO} WHERE c.id_catalogo = ?`, [idCatalogo]);
  if (!item) throw AppError.notFound('Elemento del catálogo no encontrado');
  return item;
}

/* ------------------------ Electrodomésticos reales ------------------------ */

// Propiedad verificada por JOIN con viviendas. kwh_mes_estimado viene de la
// columna generada de MySQL (e.*); aquí NO se recalcula.
const SELECT_ELECTRO = `
  SELECT e.*, a.nombre AS ambiente
    FROM electrodomesticos e
    JOIN viviendas v ON v.id_vivienda = e.id_vivienda
    LEFT JOIN ambientes a ON a.id_ambiente = e.id_ambiente`;

export async function listar(
  idUsuario: number,
  filtros: { id_vivienda?: number | undefined; id_ambiente?: number | undefined; activo?: boolean | undefined },
): Promise<Electrodomestico[]> {
  const condiciones = ['v.id_usuario = ?'];
  const params: SqlParam[] = [idUsuario];

  if (filtros.id_vivienda !== undefined) {
    await asegurarPropiedad(idUsuario, filtros.id_vivienda);
    condiciones.push('e.id_vivienda = ?');
    params.push(filtros.id_vivienda);
  }
  if (filtros.id_ambiente !== undefined) {
    condiciones.push('e.id_ambiente = ?');
    params.push(filtros.id_ambiente);
  }
  if (filtros.activo !== undefined) {
    condiciones.push('e.activo = ?');
    params.push(filtros.activo ? 1 : 0);
  }
  return query<Electrodomestico>(
    `${SELECT_ELECTRO} WHERE ${condiciones.join(' AND ')} ORDER BY e.kwh_mes_estimado DESC, e.nombre`,
    params,
  );
}

export async function obtener(idUsuario: number, idElectro: number): Promise<Electrodomestico> {
  const electro = await queryOne<Electrodomestico>(`${SELECT_ELECTRO} WHERE e.id_electrodomestico = ? AND v.id_usuario = ?`, [
    idElectro,
    idUsuario,
  ]);
  if (!electro) throw AppError.notFound('Electrodoméstico no encontrado');
  return electro;
}

/** El ambiente debe existir y pertenecer a la misma vivienda del electrodoméstico. */
async function validarAmbiente(idAmbiente: number, idVivienda: number): Promise<void> {
  const ambiente = await queryOne<{ id_ambiente: number }>(
    'SELECT id_ambiente FROM ambientes WHERE id_ambiente = ? AND id_vivienda = ?',
    [idAmbiente, idVivienda],
  );
  if (!ambiente) throw AppError.badRequest('El ambiente no existe en esa vivienda');
}

export async function crear(idUsuario: number, input: CrearElectrodomesticoInput): Promise<Electrodomestico> {
  const idVivienda = await resolverViviendaId(idUsuario, input.id_vivienda);
  if (input.id_ambiente != null) await validarAmbiente(input.id_ambiente, idVivienda);

  // Si viene del catálogo, sus promedios son solo valores iniciales:
  // cualquier dato enviado por el usuario tiene prioridad.
  const catalogo = input.id_catalogo !== undefined ? await obtenerCatalogo(input.id_catalogo) : null;

  const nombre = input.nombre ?? catalogo?.nombre;
  const potencia = input.potencia_w ?? catalogo?.potencia_w_promedio;
  if (nombre === undefined || potencia === undefined) {
    throw AppError.badRequest('Debes indicar nombre y potencia, o elegir un elemento del catálogo');
  }

  const result = await execute(
    `INSERT INTO electrodomesticos
       (id_vivienda, id_ambiente, id_catalogo, nombre, potencia_w, cantidad, horas_uso_dia, dias_uso_mes, factor_uso)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      idVivienda,
      input.id_ambiente ?? null,
      catalogo?.id_catalogo ?? null,
      nombre,
      potencia,
      input.cantidad ?? 1,
      input.horas_uso_dia ?? catalogo?.horas_uso_dia_promedio ?? 1,
      input.dias_uso_mes ?? 30,
      input.factor_uso ?? catalogo?.factor_uso_promedio ?? 1,
    ],
  );
  return obtener(idUsuario, result.insertId);
}

export async function actualizar(
  idUsuario: number,
  idElectro: number,
  input: ActualizarElectrodomesticoInput,
): Promise<Electrodomestico> {
  const actual = await obtener(idUsuario, idElectro); // 404 si no es del usuario
  if (input.id_ambiente != null) await validarAmbiente(input.id_ambiente, actual.id_vivienda);

  const { clause, values } = buildSet(
    { ...input, activo: input.activo === undefined ? undefined : input.activo ? 1 : 0 },
    ['id_ambiente', 'nombre', 'potencia_w', 'cantidad', 'horas_uso_dia', 'dias_uso_mes', 'factor_uso', 'activo'],
  );
  if (clause) {
    await execute(`UPDATE electrodomesticos SET ${clause} WHERE id_electrodomestico = ?`, [...values, idElectro]);
  }
  return obtener(idUsuario, idElectro);
}

export async function eliminar(idUsuario: number, idElectro: number): Promise<void> {
  await obtener(idUsuario, idElectro);
  await execute('DELETE FROM electrodomesticos WHERE id_electrodomestico = ?', [idElectro]);
}
