import { MENSAJE_ALERTA_GENERICO, mensajeAlertaAmigable } from './alerta-mensajes';

describe('mensajeAlertaAmigable', () => {
  beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('traduce la incoherencia entre umbrales sin mostrar nombres internos', () => {
    const msg = mensajeAlertaAmigable('El umbral de UMBRAL_PROXIMO debe ser menor que el de UMBRAL_SUPERADO.');
    expect(msg).toBe('El porcentaje de aviso debe ser menor que el porcentaje de presupuesto superado.');
  });

  it('conserva el mensaje original en la consola', () => {
    mensajeAlertaAmigable('El umbral de UMBRAL_PROXIMO debe ser menor que el de UMBRAL_SUPERADO');
    expect(console.warn).toHaveBeenCalledWith('[alertas] Mensaje original del servidor:', expect.stringContaining('UMBRAL_SUPERADO'));
  });

  it('traduce el duplicado y quita la mención a PUT', () => {
    const msg = mensajeAlertaAmigable('Ya existe una configuración de ese tipo y canal para la vivienda; edítala con PUT');
    expect(msg).toContain('Ya tienes un aviso de ese tipo');
    expect(msg).not.toContain('PUT');
  });

  it('reemplaza un tipo de aviso suelto por su nombre legible', () => {
    expect(mensajeAlertaAmigable('Configuración inválida para CONSUMO_ANOMALO')).toBe('Configuración inválida para aviso de consumo inusual');
  });

  it('usa un mensaje genérico cuando el texto sigue siendo técnico', () => {
    expect(mensajeAlertaAmigable('El parámetro id_vivienda no es válido')).toBe(MENSAJE_ALERTA_GENERICO);
    expect(mensajeAlertaAmigable('Invalid input: expected number, received string')).toBe(MENSAJE_ALERTA_GENERICO);
    expect(mensajeAlertaAmigable('Campo porcentaje_umbral inválido', 'Revisa el porcentaje.')).toBe('Revisa el porcentaje.');
  });

  it('no toca los mensajes que ya son comprensibles ni escribe en la consola', () => {
    expect(mensajeAlertaAmigable('No tienes permiso')).toBe('No tienes permiso');
    expect(mensajeAlertaAmigable('Datos inválidos')).toBe('Datos inválidos');
    expect(console.warn).not.toHaveBeenCalled();
  });
});
