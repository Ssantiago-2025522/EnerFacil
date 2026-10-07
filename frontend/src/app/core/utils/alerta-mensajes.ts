/**
 * Mensajes del módulo Alertas listos para el usuario.
 *
 * El backend devuelve textos pensados para quien programa («El umbral de UMBRAL_PROXIMO debe ser menor
 * que el de UMBRAL_SUPERADO», «…edítala con PUT»). Esos textos no se cambian en el servidor: aquí se
 * traducen antes de mostrarlos, y el mensaje original se deja en la consola para poder depurar.
 */

export const MENSAJE_ALERTA_GENERICO = 'No pudimos completar la solicitud. Inténtalo de nuevo.';

/** Nombres internos de los tipos de aviso, tal como los ve una persona. */
const NOMBRE_TIPO: Record<string, string> = {
  UMBRAL_PROXIMO: 'aviso de que te acercas al límite',
  UMBRAL_SUPERADO: 'aviso de presupuesto superado',
  CONSUMO_ANOMALO: 'aviso de consumo inusual',
};

/** Mensajes conocidos del backend con su redacción para el usuario (se evalúan en orden). */
const CONOCIDOS: readonly { patron: RegExp; mensaje: string }[] = [
  {
    patron: /UMBRAL_PROXIMO.*menor.*UMBRAL_SUPERADO/is,
    mensaje: 'El porcentaje de aviso debe ser menor que el porcentaje de presupuesto superado.',
  },
  {
    patron: /ya existe una configuraci[oó]n de ese tipo y canal/i,
    mensaje: 'Ya tienes un aviso de ese tipo con ese canal para esta vivienda. Edita el que ya existe en lugar de crear otro.',
  },
  { patron: /el umbral debe ser mayor que 0/i, mensaje: 'El porcentaje debe ser mayor que 0.' },
];

/** Rastros de detalles internos: enums, columnas en snake_case, verbos HTTP o mensajes de validación en inglés. */
const TECNICO = /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b|\b[a-z]+(?:_[a-z0-9]+)+\b|\b(?:GET|POST|PUT|PATCH|DELETE|HTTP|SQL|JSON)\b|\b(?:invalid|expected|received|undefined|null)\b/;

/**
 * Devuelve el mensaje que se puede mostrar. Si el texto no revela nada interno se deja igual; si menciona
 * un tipo de aviso se reemplaza por su nombre; si sigue pareciendo técnico se usa `alternativa`.
 */
export function mensajeAlertaAmigable(mensaje: string, alternativa: string = MENSAJE_ALERTA_GENERICO): string {
  const original = mensaje.trim();
  if (!original) return alternativa;

  const conocido = CONOCIDOS.find((c) => c.patron.test(original));
  let resultado = conocido ? conocido.mensaje : original;

  if (!conocido) {
    resultado = resultado.replace(/\b(UMBRAL_PROXIMO|UMBRAL_SUPERADO|CONSUMO_ANOMALO)\b/g, (t) => NOMBRE_TIPO[t]);
    if (TECNICO.test(resultado)) resultado = alternativa;
  }

  if (resultado !== original) console.warn('[alertas] Mensaje original del servidor:', original);
  return resultado;
}
