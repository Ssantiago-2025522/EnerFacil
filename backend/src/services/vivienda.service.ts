import { buildSet, execute, query, queryOne } from '../config/database';
import type { Vivienda } from '../types';
import type { ActualizarViviendaInput, CrearViviendaInput } from '../validators/vivienda.validator';
import { AppError } from '../utils/responses';

/**
 * Control de propiedad: TODA consulta filtra por id_usuario.
 * Si la vivienda existe pero es de otro usuario se responde 404 (no se revela su existencia).
 */
export async function listar(idUsuario: number): Promise<Vivienda[]> {
  return query<Vivienda>('SELECT * FROM viviendas WHERE id_usuario = ? ORDER BY creado_en, id_vivienda', [idUsuario]);
}

export async function obtener(idUsuario: number, idVivienda: number): Promise<Vivienda> {
  const vivienda = await queryOne<Vivienda>('SELECT * FROM viviendas WHERE id_vivienda = ? AND id_usuario = ?', [
    idVivienda,
    idUsuario,
  ]);
  if (!vivienda) throw AppError.notFound('Vivienda no encontrada');
  return vivienda;
}

/** Lanza 404 si la vivienda no pertenece al usuario. Reutilizado por otros servicios. */
export async function asegurarPropiedad(idUsuario: number, idVivienda: number): Promise<void> {
  await obtener(idUsuario, idVivienda);
}

/**
 * Resuelve la vivienda sobre la que se opera:
 * - si el cliente envía id_vivienda, se verifica que sea del usuario;
 * - si no lo envía y el usuario tiene exactamente una vivienda, se usa esa;
 * - en cualquier otro caso se pide especificarla.
 */
export async function resolverViviendaId(idUsuario: number, idVivienda?: number): Promise<number> {
  if (idVivienda !== undefined) {
    await asegurarPropiedad(idUsuario, idVivienda);
    return idVivienda;
  }
  const viviendas = await query<{ id_vivienda: number }>('SELECT id_vivienda FROM viviendas WHERE id_usuario = ?', [
    idUsuario,
  ]);
  if (viviendas.length === 0) throw AppError.badRequest('Primero debes registrar una vivienda');
  if (viviendas.length > 1) throw AppError.badRequest('Tienes varias viviendas: indica id_vivienda');
  return viviendas[0]!.id_vivienda;
}

/** La tarifa debe ser predefinida (id_usuario NULL) o personalizada del propio usuario. */
async function validarTarifa(idUsuario: number, idTarifa: number): Promise<void> {
  const tarifa = await queryOne<{ id_tarifa: number }>(
    'SELECT id_tarifa FROM tarifas WHERE id_tarifa = ? AND activa = 1 AND (id_usuario IS NULL OR id_usuario = ?)',
    [idTarifa, idUsuario],
  );
  if (!tarifa) throw AppError.badRequest('La tarifa indicada no existe o no está disponible');
}

export async function crear(idUsuario: number, input: CrearViviendaInput): Promise<Vivienda> {
  if (input.id_tarifa != null) await validarTarifa(idUsuario, input.id_tarifa);

  const result = await execute(
    `INSERT INTO viviendas (id_usuario, id_tarifa, nombre, direccion, region, num_habitantes, dia_corte)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      idUsuario,
      input.id_tarifa ?? null,
      input.nombre,
      input.direccion ?? null,
      input.region ?? null,
      input.num_habitantes ?? null,
      input.dia_corte ?? 1,
    ],
  );
  return obtener(idUsuario, result.insertId);
}

export async function actualizar(
  idUsuario: number,
  idVivienda: number,
  input: ActualizarViviendaInput,
): Promise<Vivienda> {
  await asegurarPropiedad(idUsuario, idVivienda);
  if (input.id_tarifa != null) await validarTarifa(idUsuario, input.id_tarifa);

  const { clause, values } = buildSet({ ...input }, [
    'nombre',
    'direccion',
    'region',
    'num_habitantes',
    'dia_corte',
    'id_tarifa',
  ]);
  if (clause) {
    await execute(`UPDATE viviendas SET ${clause} WHERE id_vivienda = ? AND id_usuario = ?`, [
      ...values,
      idVivienda,
      idUsuario,
    ]);
  }
  return obtener(idUsuario, idVivienda);
}

/** Elimina la vivienda; ambientes, electrodomésticos, etc. se borran por ON DELETE CASCADE. */
export async function eliminar(idUsuario: number, idVivienda: number): Promise<void> {
  const result = await execute('DELETE FROM viviendas WHERE id_vivienda = ? AND id_usuario = ?', [
    idVivienda,
    idUsuario,
  ]);
  if (result.affectedRows === 0) throw AppError.notFound('Vivienda no encontrada');
}
