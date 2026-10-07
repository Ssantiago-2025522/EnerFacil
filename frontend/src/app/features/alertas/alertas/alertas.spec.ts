import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { AlertaConfig } from '../../../core/models/alerta.models';
import { EstadoPresupuesto } from '../../../core/models/presupuesto.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { umbralAlertaValidator } from '../../../core/validators/alerta.validators';

function fakeJwt(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ id: 2, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const casa = (over: Partial<Vivienda> = {}): Vivienda => ({
  id_vivienda: 1, id_usuario: 2, id_tarifa: 2, nombre: 'Casa A', direccion: null, region: null,
  num_habitantes: null, dia_corte: 1, creado_en: '2026-10-06T12:00:00.000Z', ...over,
});
const estado = (over: Partial<EstadoPresupuesto> = {}): EstadoPresupuesto => ({
  id_vivienda: 1, fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', fuente: 'LECTURAS',
  monto_acumulado: 23, monto_proyectado: 30, presupuesto: { id_presupuesto: 7, monto_mensual: 50 },
  porcentaje_proyectado: 60, umbrales: { proximo: 80, superado: 100 }, nivel: 'VERDE', motivo: null, ...over,
});
const cfg = (over: Partial<AlertaConfig> = {}): AlertaConfig => ({
  id_alerta_config: 1, id_vivienda: 1, tipo: 'UMBRAL_PROXIMO', porcentaje_umbral: 80, canal: 'APP', activa: 1, ...over,
});
const CONFIGS_BASE = [cfg(), cfg({ id_alerta_config: 2, tipo: 'UMBRAL_SUPERADO', porcentaje_umbral: 100 })];

interface Datos {
  estado?: EstadoPresupuesto;
  configs?: AlertaConfig[];
}

describe('Módulo Alertas', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('enerfacil.token', fakeJwt());
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });
  afterEach(() => http.verify());

  const root = () => harness.routeNativeElement as HTMLElement;
  const text = () => (root().textContent ?? '').replace(/\s+/g, ' ').trim();
  const q = <T extends Element = HTMLElement>(sel: string) => root().querySelector(sel) as T | null;
  const settle = async () => {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  };
  const button = (label: string) =>
    [...root().querySelectorAll('button')].find((b) => (b.textContent ?? '').trim().startsWith(label)) as HTMLButtonElement | undefined;
  const porVivienda = (suffix: string, id: number) =>
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith(suffix) && r.params.get('id_vivienda') === String(id));

  /** Responde las dos peticiones de datos de una vivienda: semáforo y configuración. */
  async function responderDatos(id: number, d: Datos = {}) {
    const e = porVivienda('/api/alertas/estado', id);
    const c = porVivienda('/api/alertas/config', id);
    e.flush({ success: true, data: d.estado ?? estado({ id_vivienda: id }) });
    c.flush({ success: true, data: d.configs ?? CONFIGS_BASE });
    await settle();
  }

  async function abrir(viviendas: Vivienda[], datos: Datos = {}) {
    await harness.navigateByUrl('/alertas');
    const v = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas'));
    expect(v.request.headers.get('Authorization')).toMatch(/^Bearer /);
    await settle();
    expect(q('.skel')).not.toBeNull();
    v.flush({ success: true, data: viviendas });
    await settle();
    if (viviendas.length > 0) await responderDatos(viviendas[0].id_vivienda, datos);
  }

  it('sidebar enlaza «Alertas» y el breadcrumb muestra el título', async () => {
    await abrir([casa()]);
    const link = [...root().querySelectorAll('a.nav__item')].find((a) => a.textContent!.includes('Alertas')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/alertas');
    expect(q('.crumbs')!.textContent).toContain('Alertas');
    expect(q('.top__pill')).toBeNull();
  });

  it('sin viviendas: pide crear una primero y no consulta alertas', async () => {
    await abrir([]);
    expect(text()).toContain('Primero registra una vivienda');
    expect(q<HTMLAnchorElement>('.state a.btn')!.getAttribute('href')).toBe('/vivienda');
  });

  it('VERDE: muestra el resultado del backend con textos humanos', async () => {
    await abrir([casa()]);
    expect(text()).toContain('Vas bien con tu presupuesto');
    expect(text()).toContain('Estado de tu presupuesto');
    expect(text()).toContain('Gastado hasta ahora');
    expect(text()).toContain('Proyección del ciclo');
    expect(text()).toContain('gastarías aproximadamente 30,00 este ciclo');
    expect(text()).toContain('Eso representa el 60,0 % de tu presupuesto de 50,00');
    expect(text()).not.toContain('porcentaje_proyectado');
    expect(text()).not.toContain('monto_acumulado');
    expect(q('.al__banner--ok')).not.toBeNull();
  });

  it('AMARILLO: usa el nivel y los umbrales que entrega el backend', async () => {
    await abrir([casa()], { estado: estado({ nivel: 'AMARILLO', porcentaje_proyectado: 86, monto_proyectado: 43, umbrales: { proximo: 75, superado: 100 } }) });
    expect(text()).toContain('Te estás acercando al límite');
    expect(text()).toContain('86,0 %');
    expect(text()).toContain('Estás en amarillo porque la proyección pasó del 75 %');
    expect(text()).toContain('Aviso: 75 %');
    expect(text()).toContain('Presupuesto superado: 100 %');
    expect(q('.al__banner--warn')).not.toBeNull();
  });

  it('ROJO: la decisión viene del backend aunque se haya gastado poco (proyección)', async () => {
    await abrir([casa()], { estado: estado({ monto_acumulado: 20, nivel: 'ROJO', porcentaje_proyectado: 110.6, monto_proyectado: 55.3 }) });
    expect(text()).toContain('Vas a superar tu presupuesto');
    expect(text()).toContain('110,6 %');
    expect(q('.al__banner--danger')).not.toBeNull();
  });

  it('ROJO con umbral propio bajo: explica que el rojo depende de lo configurado y no repite el porcentaje', async () => {
    await abrir([casa()], {
      estado: estado({ presupuesto: { id_presupuesto: 7, monto_mensual: 6 }, monto_acumulado: 3.43, monto_proyectado: 5.53, nivel: 'ROJO', porcentaje_proyectado: 92.2, umbrales: { proximo: 10, superado: 50 } }),
      configs: [cfg({ porcentaje_umbral: 10 }), cfg({ id_alerta_config: 2, tipo: 'UMBRAL_SUPERADO', porcentaje_umbral: 50 })],
    });
    expect(text()).toContain('Eso representa el 92,2 % de tu presupuesto de 6,00');
    expect(text()).toContain('Estás en rojo porque la proyección llegó al 50 %');
    expect(text()).toContain('porque así lo configuraste');
    expect(text()).toContain('Son los porcentajes que configuraste');
    expect(text()).not.toContain('La alerta roja se activa desde');
    // El porcentaje de la proyección aparece una sola vez como texto (la barra lo muestra de forma visual)
    expect(text().split('92,2 %').length - 1).toBe(1);
    expect(text().split('Proyección del ciclo').length - 1).toBe(1);
    expect(q('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('92.2');
  });

  it('no recalcula el nivel: respeta el nivel del backend aunque el porcentaje parezca de otro color', async () => {
    await abrir([casa()], { estado: estado({ nivel: 'VERDE', porcentaje_proyectado: 150 }) });
    expect(text()).toContain('Vas bien con tu presupuesto');
    expect(q('.al__banner--danger')).toBeNull();
  });

  it('sin presupuesto: explica qué falta y enlaza a /presupuesto', async () => {
    await abrir([casa()], { estado: estado({ presupuesto: null, nivel: null, motivo: 'SIN_PRESUPUESTO', porcentaje_proyectado: null }) });
    expect(text()).toContain('Aún no tienes un presupuesto');
    expect(q<HTMLAnchorElement>('.al__banner a')!.getAttribute('href')).toBe('/presupuesto');
    expect(q('[role=progressbar]')).toBeNull();
  });

  it('sin tarifa: no inventa montos y enlaza a /vivienda', async () => {
    await abrir([casa()], { estado: estado({ monto_acumulado: null, monto_proyectado: null, nivel: null, motivo: 'SIN_TARIFA', porcentaje_proyectado: null }) });
    expect(text()).toContain('no tiene una tarifa asignada');
    expect(q<HTMLAnchorElement>('.al__banner a')!.getAttribute('href')).toBe('/vivienda');
    expect(text()).toContain('—');
  });

  it('datos insuficientes: enlaza a /consumo', async () => {
    await abrir([casa()], { estado: estado({ fuente: 'SIN_DATOS', nivel: null, motivo: 'SIN_DATOS', porcentaje_proyectado: null }) });
    expect(text()).toContain('Aún no hay consumo para evaluar');
    expect(q<HTMLAnchorElement>('.al__banner a')!.getAttribute('href')).toBe('/consumo');
  });

  it('lista los avisos configurados con su porcentaje y canal', async () => {
    await abrir([casa()], { configs: [...CONFIGS_BASE, cfg({ id_alerta_config: 3, tipo: 'CONSUMO_ANOMALO', porcentaje_umbral: 130, canal: 'EMAIL', activa: 0 })] });
    expect(text()).toContain('Aviso de que te acercas al límite');
    expect(text()).toContain('80,00 %');
    expect(text()).toContain('130,00 %');
    expect(text()).toContain('Desactivado');
    expect(text()).toContain('no enviamos correos');
  });

  it('sin avisos configurados: avisa que se usan los valores habituales', async () => {
    await abrir([casa()], { configs: [] });
    expect(text()).toContain('Todavía no has configurado ningún aviso');
    expect(text()).toContain('valores habituales');
    expect(text()).toContain('Son los porcentajes habituales');
  });

  it('error al cargar el estado: mensaje y reintento que vuelve a pedir solo el estado', async () => {
    await harness.navigateByUrl('/alertas');
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [casa()] });
    await settle();
    porVivienda('/api/alertas/estado', 1).flush({ success: false, message: 'boom' }, { status: 500, statusText: 'x' });
    porVivienda('/api/alertas/config', 1).flush({ success: true, data: CONFIGS_BASE });
    await settle();
    expect(text()).toContain('No pudimos cargar el estado de tu presupuesto');
    expect(q('[role=alert]')).not.toBeNull();
    button('Reintentar')!.click();
    await settle();
    porVivienda('/api/alertas/estado', 1).flush({ success: true, data: estado() });
    await settle();
    expect(text()).toContain('Vas bien con tu presupuesto');
  });

  it('error al cargar la configuración: el semáforo sigue visible y hay reintento propio', async () => {
    await harness.navigateByUrl('/alertas');
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [casa()] });
    await settle();
    porVivienda('/api/alertas/estado', 1).flush({ success: true, data: estado() });
    porVivienda('/api/alertas/config', 1).flush({ success: false, message: 'boom' }, { status: 500, statusText: 'x' });
    await settle();
    expect(text()).toContain('Vas bien con tu presupuesto');
    expect(text()).toContain('No pudimos cargar tus avisos');
    button('Reintentar')!.click();
    await settle();
    porVivienda('/api/alertas/config', 1).flush({ success: true, data: CONFIGS_BASE });
    await settle();
    expect(text()).not.toContain('No pudimos cargar tus avisos');
  });

  it('403: muestra el mensaje del backend sin mezclar datos', async () => {
    await harness.navigateByUrl('/alertas');
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [casa()] });
    await settle();
    porVivienda('/api/alertas/estado', 1).flush({ success: false, message: 'No tienes permiso' }, { status: 403, statusText: 'Forbidden' });
    porVivienda('/api/alertas/config', 1).flush({ success: false, message: 'No tienes permiso' }, { status: 403, statusText: 'Forbidden' });
    await settle();
    expect(text()).toContain('No tienes permiso');
    expect(text()).not.toContain('Vas bien');
  });

  it('404 (vivienda ajena o borrada): vuelve a pedir la lista de viviendas', async () => {
    await harness.navigateByUrl('/alertas');
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [casa()] });
    await settle();
    porVivienda('/api/alertas/estado', 1).flush({ success: false, message: 'Vivienda no encontrada' }, { status: 404, statusText: 'NF' });
    await settle();
    // El 404 cancela la otra petición y relanza la lista de viviendas.
    http.match((r) => r.url.endsWith('/api/alertas/config'));
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [] });
    await settle();
    expect(text()).toContain('Primero registra una vivienda');
  });

  it('cambiar de vivienda: descarta lo anterior y no muestra datos viejos mientras carga', async () => {
    await abrir([casa(), casa({ id_vivienda: 2, nombre: 'Casa B' })], { estado: estado({ nivel: 'ROJO', porcentaje_proyectado: 130 }) });
    expect(text()).toContain('Vas a superar tu presupuesto');
    const tab = [...root().querySelectorAll('.tab')].find((t) => t.textContent!.includes('Casa B')) as HTMLButtonElement;
    tab.click();
    await settle();
    expect(text()).not.toContain('Vas a superar tu presupuesto');
    expect(q('.skel')).not.toBeNull();
    await responderDatos(2, { estado: estado({ id_vivienda: 2, nivel: 'VERDE' }) });
    expect(text()).toContain('Vas bien con tu presupuesto');
  });

  it('agregar aviso: envía POST /api/alertas/config con el id de la vivienda y refresca', async () => {
    await abrir([casa()], { configs: [] });
    button('Agregar aviso')!.click();
    await settle();
    const input = q<HTMLInputElement>('#ac-umbral')!;
    input.value = '75';
    input.dispatchEvent(new Event('input'));
    q<HTMLFormElement>('app-alerta-config-dialog form')!.dispatchEvent(new Event('submit'));
    await settle();
    const post = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/alertas/config'));
    expect(post.request.body).toEqual({ id_vivienda: 1, tipo: 'UMBRAL_PROXIMO', porcentaje_umbral: 75, canal: 'APP', activa: true });
    post.flush({ success: true, data: cfg({ porcentaje_umbral: 75 }) }, { status: 201, statusText: 'Created' });
    await settle();
    await responderDatos(1, { configs: [cfg({ porcentaje_umbral: 75 })] });
    expect(text()).toContain('Aviso agregado.');
    expect(text()).toContain('75,00 %');
  });

  it('editar aviso: envía PUT y muestra el 409/400 del backend dentro del diálogo', async () => {
    await abrir([casa()]);
    button('Editar')!.click();
    await settle();
    const input = q<HTMLInputElement>('#ac-umbral')!;
    expect(input.value).toBe('80');
    input.value = '120';
    input.dispatchEvent(new Event('input'));
    q<HTMLFormElement>('app-alerta-config-dialog form')!.dispatchEvent(new Event('submit'));
    await settle();
    const put = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/alertas/config/1'));
    expect(put.request.body).toEqual({ porcentaje_umbral: 120, canal: 'APP', activa: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    put.flush({ success: false, message: 'El umbral de UMBRAL_PROXIMO debe ser menor que el de UMBRAL_SUPERADO' }, { status: 400, statusText: 'Bad' });
    await settle();
    const alerta = q('app-alerta-config-dialog .alert')!.textContent!.trim();
    expect(alerta).toBe('El porcentaje de aviso debe ser menor que el porcentaje de presupuesto superado.');
    expect(alerta).not.toContain('UMBRAL_');
    // El mensaje real del servidor no se pierde: queda en la consola.
    expect(warn).toHaveBeenCalledWith('[alertas] Mensaje original del servidor:', expect.stringContaining('UMBRAL_PROXIMO'));
    warn.mockRestore();
    expect(q('app-alerta-config-dialog')).not.toBeNull();
  });

  it('duplicado (409): muestra un mensaje sin detalles técnicos como «PUT»', async () => {
    await abrir([casa()], { configs: [] });
    button('Agregar aviso')!.click();
    await settle();
    const input = q<HTMLInputElement>('#ac-umbral')!;
    input.value = '75';
    input.dispatchEvent(new Event('input'));
    q<HTMLFormElement>('app-alerta-config-dialog form')!.dispatchEvent(new Event('submit'));
    await settle();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    http.expectOne((r) => r.method === 'POST').flush(
      { success: false, message: 'Ya existe una configuración de ese tipo y canal para la vivienda; edítala con PUT' },
      { status: 409, statusText: 'Conflict' },
    );
    await settle();
    const alerta = q('app-alerta-config-dialog .alert')!.textContent!;
    expect(alerta).toContain('Ya tienes un aviso de ese tipo');
    expect(alerta).not.toContain('PUT');
    warn.mockRestore();
  });

  it('errores de carga con nombres internos se muestran en lenguaje normal', async () => {
    await harness.navigateByUrl('/alertas');
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [casa()] });
    await settle();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    porVivienda('/api/alertas/estado', 1).flush({ success: false, message: 'El parámetro id_vivienda no es válido' }, { status: 400, statusText: 'Bad' });
    porVivienda('/api/alertas/config', 1).flush({ success: true, data: CONFIGS_BASE });
    await settle();
    expect(text()).toContain('No pudimos cargar el estado de tu presupuesto');
    expect(text()).not.toContain('id_vivienda');
    warn.mockRestore();
  });

  it('el formulario valida el porcentaje antes de enviar nada', async () => {
    await abrir([casa()], { configs: [] });
    button('Agregar aviso')!.click();
    await settle();
    q<HTMLFormElement>('app-alerta-config-dialog form')!.dispatchEvent(new Event('submit'));
    await settle();
    expect(q('app-alerta-config-dialog .field__error')!.textContent).toContain('obligatorio');
    http.expectNone((r) => r.method === 'POST');
  });
});

describe('umbralAlertaValidator', () => {
  const run = (v: unknown) => umbralAlertaValidator({ value: v } as never);
  it('acepta porcentajes válidos', () => {
    expect(run(80)).toBeNull();
    expect(run(0.01)).toBeNull();
    expect(run(999.99)).toBeNull();
    expect(run('130.5')).toBeNull();
  });
  it('rechaza vacío, no numérico, negativo, 0, demasiado grande y más de 2 decimales', () => {
    expect(run(null)).toEqual({ required: true });
    expect(run('abc')).toEqual({ number: true });
    expect(run(-5)).toEqual({ negative: true });
    expect(run(0)).toEqual({ min: true });
    expect(run(1000)).toEqual({ max: true });
    expect(run(80.123)).toEqual({ decimals: true });
  });
});
