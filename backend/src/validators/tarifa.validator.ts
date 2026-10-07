import { z } from 'zod';
import { esFechaValida } from '../utils/fechas';

const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato YYYY-MM-DD')
  .refine(esFechaValida, 'Fecha inexistente');

/** true si `n` tiene como máximo `d` decimales (las columnas DECIMAL redondearían en silencio). */
const maxDecimales = (d: number) => (n: number) => Math.abs(n * 10 ** d - Math.round(n * 10 ** d)) < 1e-6;

/* ------------------------------ Tramos ------------------------------ */

const tramoSchema = z.object({
  kwh_desde: z.number().min(0).max(99_999_999).refine(maxDecimales(2), 'Máximo 2 decimales'),
  kwh_hasta: z.number().positive().max(99_999_999).refine(maxDecimales(2), 'Máximo 2 decimales').nullable().default(null),
  precio_kwh: z.number().min(0).max(999_999).refine(maxDecimales(4), 'Máximo 4 decimales'),
});

type Tramo = z.infer<typeof tramoSchema>;

/**
 * Los tramos deben cubrir todo el consumo para que fn_calcular_monto lo facture completo:
 * empiezan en 0, son contiguos, sin traslapes, y el último no tiene límite superior.
 */
function validarTramos(tramos: Tramo[], ctx: z.RefinementCtx): void {
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
  const t = [...tramos].sort((a, b) => a.kwh_desde - b.kwh_desde);

  if (t[0] && t[0].kwh_desde !== 0) issue('El primer tramo debe iniciar en 0 kWh');

  t.forEach((tramo, i) => {
    const esUltimo = i === t.length - 1;
    if (tramo.kwh_hasta === null) {
      if (!esUltimo) issue('Solo el último tramo puede no tener límite superior (kwh_hasta = null)');
    } else {
      if (tramo.kwh_hasta <= tramo.kwh_desde) {
        issue(`El tramo que inicia en ${tramo.kwh_desde} kWh debe tener un límite superior mayor`);
      }
      if (esUltimo) issue('El último tramo debe ser sin límite (kwh_hasta = null) para que se facture todo el consumo');
    }
    const previo = t[i - 1];
    if (previo && previo.kwh_hasta !== tramo.kwh_desde) {
      issue(`Los tramos deben ser contiguos y no traslaparse (revisa el tramo que inicia en ${tramo.kwh_desde} kWh)`);
    }
  });
}

const tramos = z.array(tramoSchema).min(1, 'Define al menos un tramo').max(20).superRefine(validarTramos);

/* ------------------------------ Tarifa ------------------------------ */

const campos = {
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  distribuidora: z.string().trim().min(1).max(120).nullable(),
  region: z.string().trim().min(1).max(120).nullable(),
  cargo_fijo: z.number().min(0).max(99_999_999).refine(maxDecimales(2), 'Máximo 2 decimales'),
  cargo_potencia_kw: z.number().min(0).max(999_999).refine(maxDecimales(4), 'Máximo 4 decimales'),
  impuesto_pct: z.number().min(0).max(100).refine(maxDecimales(2), 'Máximo 2 decimales'),
  moneda: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Usa un código de moneda de 3 letras (ej. USD, GTQ)'),
  vigente_desde: fecha,
  vigente_hasta: fecha.nullable(),
};

const vigenciaValida = (d: { vigente_desde?: string | undefined; vigente_hasta?: string | null | undefined }) =>
  !d.vigente_desde || !d.vigente_hasta || d.vigente_hasta >= d.vigente_desde;
const MSG_VIGENCIA = { message: 'vigente_hasta no puede ser anterior a vigente_desde', path: ['vigente_hasta'] };

export const crearTarifaSchema = z
  .object({
    nombre: campos.nombre,
    distribuidora: campos.distribuidora.optional(),
    region: campos.region.optional(),
    cargo_fijo: campos.cargo_fijo.default(0),
    cargo_potencia_kw: campos.cargo_potencia_kw.default(0),
    impuesto_pct: campos.impuesto_pct.default(0),
    moneda: campos.moneda.default('USD'),
    vigente_desde: campos.vigente_desde,
    vigente_hasta: campos.vigente_hasta.optional(),
    tramos,
  })
  .refine(vigenciaValida, MSG_VIGENCIA);

export const actualizarTarifaSchema = z
  .object({
    nombre: campos.nombre.optional(),
    distribuidora: campos.distribuidora.optional(),
    region: campos.region.optional(),
    cargo_fijo: campos.cargo_fijo.optional(),
    cargo_potencia_kw: campos.cargo_potencia_kw.optional(),
    impuesto_pct: campos.impuesto_pct.optional(),
    moneda: campos.moneda.optional(),
    vigente_desde: campos.vigente_desde.optional(),
    vigente_hasta: campos.vigente_hasta.optional(),
    activa: z.boolean().optional(),
    /** Si se envía, reemplaza TODOS los tramos de la tarifa. */
    tramos: tramos.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), {
    message: 'Debes enviar al menos un campo para actualizar',
  })
  .refine(vigenciaValida, MSG_VIGENCIA);

export const asignarTarifaSchema = z.object({
  /** Opcional si el usuario tiene una sola vivienda. */
  id_vivienda: z.number().int().positive().optional(),
});

export const tarifasQuerySchema = z.object({
  region: z.string().trim().min(1).max(120).optional(),
  tipo: z.enum(['SOCIAL', 'RESIDENCIAL', 'PERSONALIZADA']).optional(),
});

export const tarifaActualQuerySchema = z.object({
  id_vivienda: z.coerce.number().int().positive().optional(),
});

export type CrearTarifaInput = z.infer<typeof crearTarifaSchema>;
export type ActualizarTarifaInput = z.infer<typeof actualizarTarifaSchema>;
export type TarifasQuery = z.infer<typeof tarifasQuerySchema>;
