import { buildSet, execute, isDuplicateEntry, query, queryOne } from '../config/database';
import type { SqlParam } from '../config/database';
import type { Ambiente } from '../types';
import type { ActualizarAmbienteInput, CrearAmbienteInput } from '../validators/ambiente.validator';
import { AppError } from '../utils/responses';
import { asegurarPropiedad, resolverViviendaId } from './vivienda.service';

// Los ambientes no tienen id_usuario: la propiedad se verifica con JOIN a viviendas.
const SELECT_AMBIENTE = `
  SELECT a.id_ambiente, a.id_vivienda, a.nombre, a.tipo
    FROM ambientes a
    JOIN viviendas v ON v.id_vivienda = a.id_vivienda`;

export async function listar(idUsuario: number, idVivienda?: number): Promise<Ambiente[]> {
  const params: SqlParam[] = [idUsuario];
  let filtro = '';
  if (idVivienda !== undefined) {
    await asegurarPropiedad(idUsuario, idVivienda);
    filtro = ' AND a.id_vivienda = ?';
    params.push(idVivienda);
  }
  return query<Ambiente>(`${SELECT_AMBIENTE} WHERE v.id_usuario = ?${filtro} ORDER BY a.id_vivienda, a.nombre`, params);
}

export async function obtener(idUsuario: number, idAmbiente: number): Promise<Ambiente> {
  const ambiente = await queryOne<Ambiente>(`${SELECT_AMBIENTE} WHERE a.id_ambiente = ? AND v.id_usuario = ?`, [
    idAmbiente,
    idUsuario,
  ]);
  if (!ambiente) throw AppError.notFound('Ambiente no encontrado');
  return ambiente;
}

export async function crear(idUsuario: number, input: CrearAmbienteInput): Promise<Ambiente> {
  const idVivienda = await resolverViviendaId(idUsuario, input.id_vivienda);
  try {
    const result = await execute('INSERT INTO ambientes (id_vivienda, nombre, tipo) VALUES (?, ?, ?)', [
      idVivienda,
      input.nombre,
      input.tipo ?? 'OTRO',
    ]);
    return await obtener(idUsuario, result.insertId);
  } catch (err) {
    if (isDuplicateEntry(err)) throw AppError.conflict('Ya existe un ambiente con ese nombre en la vivienda');
    throw err;
  }
}

export async function actualizar(
  idUsuario: number,
  idAmbiente: number,
  input: ActualizarAmbienteInput,
): Promise<Ambiente> {
  await obtener(idUsuario, idAmbiente); // 404 si no es del usuario
  const { clause, values } = buildSet({ ...input }, ['nombre', 'tipo']);
  try {
    if (clause) await execute(`UPDATE ambientes SET ${clause} WHERE id_ambiente = ?`, [...values, idAmbiente]);
  } catch (err) {
    if (isDuplicateEntry(err)) throw AppError.conflict('Ya existe un ambiente con ese nombre en la vivienda');
    throw err;
  }
  return obtener(idUsuario, idAmbiente);
}

/** Los electrodomésticos del ambiente quedan sin ambiente (ON DELETE SET NULL). */
export async function eliminar(idUsuario: number, idAmbiente: number): Promise<void> {
  await obtener(idUsuario, idAmbiente);
  await execute('DELETE FROM ambientes WHERE id_ambiente = ?', [idAmbiente]);
}
