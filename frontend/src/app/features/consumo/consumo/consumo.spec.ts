import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { LecturaMedidor, PeriodoConsumo, PeriodoDetalle, Proyeccion, RegistroUso } from '../../../core/models/consumo.models';
import { Electrodomestico } from '../../../core/models/electrodomestico.models';
import { Vivienda } from '../../../core/models/vivienda.models';

function fakeJwt(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ id: 2, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const casa = (over: Partial<Vivienda> = {}): Vivienda => ({
  id_vivienda: 1, id_usuario: 2, id_tarifa: 2, nombre: 'Mi casa', direccion: null, region: null,
  num_habitantes: null, dia_corte: 1, creado_en: '2026-10-06T12:00:00.000Z', ...over,
});
const electro = (over: Partial<Electrodomestico> = {}): Electrodomestico => ({
  id_electrodomestico: 100, id_vivienda: 1, id_ambiente: 10, id_catalogo: null, nombre: 'Refrigerador', potencia_w: 150,
  cantidad: 1, horas_uso_dia: 24, dias_uso_mes: 30, factor_uso: 0.35, activo: 1, creado_en: '2026-10-06T12:00:00.000Z',
  kwh_mes_estimado: 37.8, ambiente: 'Cocina', ...over,
});
const proy = (over: Partial<Proyeccion> = {}): Proyeccion => ({
  id_vivienda: 1, tipo: 'MENSUAL', fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', fecha_referencia: '2026-10-06',
  dias_totales: 31, dias_transcurridos: 6, dias_restantes: 25, fuente: 'LECTURAS', kwh_acumulado: 30.5,
  promedio_diario_kwh: 5.083, kwh_proyectado: 157.58, tarifa: { id_tarifa: 2, nombre: 'Residencial', moneda: 'USD' },
  kw_contratados: 0, monto_acumulado: 8.5, monto_proyectado: 25.25,
  fuentes: {
    lecturas: { kwh_acumulado: 30.5, dias_con_datos: 5, promedio_diario_kwh: 5.083, kwh_proyectado: 157.58, fecha_lectura_base: '2026-10-01', fecha_ultima_lectura: '2026-10-06' },
    registros_uso: null, estimacion: null,
  },
  ...over,
});
const sinDatosProy = (): Proyeccion =>
  proy({ fuente: 'SIN_DATOS', kwh_acumulado: 0, promedio_diario_kwh: 0, kwh_proyectado: 0, monto_acumulado: 0, monto_proyectado: 0,
    fuentes: { lecturas: null, registros_uso: null, estimacion: null } });
const periodo = (over: Partial<PeriodoConsumo> = {}): PeriodoConsumo => ({
  id_periodo: 5, id_vivienda: 1, tipo: 'MENSUAL', fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30', kwh_acumulado: 120.3,
  kwh_proyectado: 120.3, monto_acumulado: 22.4, monto_proyectado: 22.4, cerrado: 1, calculado_en: '2026-10-01T06:00:00.000Z', ...over,
});
const lectura = (over: Partial<LecturaMedidor> = {}): LecturaMedidor => ({
  id_lectura: 9, id_vivienda: 1, fecha_lectura: '2026-10-06', lectura_kwh: 1500.5, observacion: 'Medidor sala', creado_en: '2026-10-06T12:00:00.000Z', ...over,
});
const uso = (over: Partial<RegistroUso> = {}): RegistroUso => ({
  id_registro: 70, id_electrodomestico: 100, electrodomestico: 'Refrigerador', id_vivienda: 1, fecha: '2026-10-05', horas_uso: 24,
  kwh_calculado: 1.26, creado_en: '2026-10-06T12:00:00.000Z', ...over,
});

interface Datos {
  proy?: Proyeccion;
  periodos?: PeriodoConsumo[];
  electros?: Electrodomestico[];
  lecturas?: LecturaMedidor[];
  usos?: RegistroUso[];
}

describe('Módulo Consumo / Historial', () => {
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
  const type = (sel: string, value: string) => {
    const input = q<HTMLInputElement>(sel)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    q<HTMLFormElement>('app-registro-dialog form')!.dispatchEvent(new Event('submit'));
    await settle();
  };
  const errors = () => [...root().querySelectorAll('app-registro-dialog .field__error')].map((e) => e.textContent!.trim());
  const porVivienda = (suffix: string, id: number) =>
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith(suffix) && r.params.get('id_vivienda') === String(id));

  /** Responde las cinco peticiones de datos de una vivienda. */
  async function responderDatos(id: number, d: Datos, errorProyeccion = false) {
    const p = porVivienda('/api/consumo/proyeccion', id);
    const pe = porVivienda('/api/consumo/periodos', id);
    const e = porVivienda('/api/electrodomesticos', id);
    const l = porVivienda('/api/consumo/lecturas', id);
    const u = porVivienda('/api/consumo/usos', id);
    pe.flush({ success: true, data: d.periodos ?? [] });
    e.flush({ success: true, data: d.electros ?? [electro()] });
    l.flush({ success: true, data: d.lecturas ?? [] });
    u.flush({ success: true, data: d.usos ?? [] });
    // La proyección va al final: forkJoin cancela las demás peticiones en cuanto una falla.
    if (errorProyeccion) p.flush({ success: false, message: 'boom SQL' }, { status: 500, statusText: 'x' });
    else p.flush({ success: true, data: d.proy ?? proy() });
    await settle();
  }

  /** Abre /consumo y responde viviendas y datos de la seleccionada. */
  async function abrir(viviendas: Vivienda[], datos: Datos = {}) {
    await harness.navigateByUrl('/consumo');
    const v = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas'));
    expect(v.request.headers.get('Authorization')).toMatch(/^Bearer /);
    await settle();
    expect(q('.skel')).not.toBeNull();
    v.flush({ success: true, data: viviendas });
    await settle();
    if (viviendas.length > 0) await responderDatos(viviendas[0].id_vivienda, datos);
  }

  const detalle = (over: Partial<PeriodoDetalle> = {}): PeriodoDetalle => ({
    ...periodo(),
    desglose: [
      { id_electrodomestico: 100, nombre: 'Refrigerador', kwh: 40, monto_estimado: 0, porcentaje_total: 80 },
      { id_electrodomestico: 101, nombre: 'Lámpara', kwh: 10, monto_estimado: 0, porcentaje_total: 20 },
    ],
    ...over,
  });

  it('sidebar enlaza «Consumo / Historial» y el breadcrumb muestra el título', async () => {
    await abrir([casa()]);
    const link = [...root().querySelectorAll('a.nav__item')].find((a) => a.textContent!.includes('Consumo / Historial')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/consumo');
    expect(q('.crumbs')!.textContent).toContain('Consumo / Historial');
    expect(q('.top__pill')).toBeNull();
  });

  it('sin viviendas: pide crear una primero y enlaza a /vivienda', async () => {
    await abrir([]);
    expect(text()).toContain('Primero registra una vivienda');
    expect(q<HTMLAnchorElement>('.state a.btn')!.getAttribute('href')).toBe('/vivienda');
  });

  it('sin datos de consumo: estado vacío con acciones para registrar', async () => {
    await abrir([casa()], { proy: sinDatosProy() });
    expect(text()).toContain('Aún no hay consumo registrado');
    expect(button('Registrar lectura')).toBeDefined();
    expect(text()).not.toContain('Consumido hasta hoy');
  });

  it('ciclo actual: muestra los kWh, la proyección y los montos que calcula el backend', async () => {
    await abrir([casa()]);
    expect(text()).toContain('Ciclo actual');
    expect(text()).toContain('Lecturas del medidor');
    expect(text()).toContain('30,5');
    expect(text()).toContain('157,6');
    expect(text()).toContain('5,08');
    expect(text()).toContain('8,50');
    expect(text()).toContain('25,25');
    expect(text()).toContain('no son una factura');
    expect(text()).toContain('Este ciclo todavía no tiene un desglose guardado');
  });

  it('sin tarifa: no muestra montos y enlaza a /vivienda', async () => {
    await abrir([casa()], { proy: proy({ tarifa: null, monto_acumulado: null, monto_proyectado: null }) });
    expect(text()).toContain('no tiene tarifa asignada');
    expect(text()).not.toContain('Monto acumulado');
  });

  it('historial: lista los periodos guardados y al elegir uno pide su desglose', async () => {
    await abrir([casa()], { periodos: [periodo()], electros: [electro(), electro({ id_electrodomestico: 101, nombre: 'Lámpara', id_ambiente: null, ambiente: null })] });
    expect(text()).toContain('Historial por periodo');
    expect(text()).toContain('120,3');

    const sel = q<HTMLSelectElement>('#co-periodo')!;
    sel.value = '5';
    sel.dispatchEvent(new Event('change'));
    await settle();
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/consumo/periodos/5')).flush({ success: true, data: detalle() });
    await settle();

    expect(text()).toContain('Periodo cerrado');
    expect(text()).toContain('40,00 kWh · 80,0 %');
    expect(text()).toContain('Por ambiente');
    expect(text()).toContain('Cocina');
    expect(text()).toContain('Sin ambiente');
    expect(text()).toContain('Suma de los kWh por equipo');
  });

  it('periodo sin registros de uso: explica por qué no hay desglose', async () => {
    await abrir([casa()], { periodos: [periodo()] });
    const sel = q<HTMLSelectElement>('#co-periodo')!;
    sel.value = '5';
    sel.dispatchEvent(new Event('change'));
    await settle();
    http.expectOne((r) => r.url.endsWith('/api/consumo/periodos/5')).flush({ success: true, data: detalle({ desglose: [] }) });
    await settle();
    expect(text()).toContain('No hay horas de uso registradas en este periodo');
  });

  it('error al cargar: mensaje amigable y Reintentar', async () => {
    await harness.navigateByUrl('/consumo');
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [casa()] });
    await settle();
    await responderDatos(1, {}, true);
    expect(text()).toContain('No pudimos cargar tu consumo');
    expect(text()).not.toContain('boom SQL');
    button('Reintentar')!.click();
    await settle();
    await responderDatos(1, {});
    expect(text()).toContain('Ciclo actual');
  });

  it('cambiar de vivienda pide sus datos y comparte la selección', async () => {
    await abrir([casa(), casa({ id_vivienda: 7, nombre: 'Apartamento' })]);
    root().querySelectorAll<HTMLButtonElement>('.co__tabs .tab')[1].click();
    await settle();
    await responderDatos(7, { proy: sinDatosProy() });
    expect(text()).toContain('Aún no hay consumo registrado');
    expect(localStorage.getItem('enerfacil.vivienda-seleccionada')).toBe('7');
  });

  describe('registro de consumo', () => {
    it('lectura: valida igual que el backend y no envía nada inválido', async () => {
      await abrir([casa()]);
      button('Registrar lectura')!.click();
      await settle();
      await submit();
      expect(errors()).toEqual(['La lectura del medidor es obligatoria']);
      type('#rd-lectura', '-5');
      await submit();
      expect(errors()).toEqual(['No se permiten números negativos']);
      http.expectNone((r) => r.method === 'POST');
    });

    it('lectura: envía id_vivienda sin kwh calculados y refresca el consumo', async () => {
      await abrir([casa()]);
      button('Registrar lectura')!.click();
      await settle();
      type('#rd-lectura', '1600');
      await submit();
      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/consumo/lecturas'));
      expect(req.request.body).toEqual({ id_vivienda: 1, fecha_lectura: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), lectura_kwh: 1600 });
      req.flush({ success: true, data: lectura({ lectura_kwh: 1600 }) }, { status: 201, statusText: 'Created' });
      await settle();
      await responderDatos(1, { proy: proy({ kwh_acumulado: 55.5 }), lecturas: [lectura({ lectura_kwh: 1600 })] });
      expect(q('app-registro-dialog')).toBeNull();
      expect(text()).toContain('Lectura registrada');
      expect(text()).toContain('55,5');
    });

    it('lectura: el error del backend se muestra en el formulario', async () => {
      await abrir([casa()]);
      button('Registrar lectura')!.click();
      await settle();
      type('#rd-lectura', '10');
      await submit();
      http.expectOne((r) => r.method === 'POST').flush(
        { success: false, message: 'La lectura no puede ser menor que la anterior (1500 kWh el 2026-10-01)' },
        { status: 400, statusText: 'x' },
      );
      await settle();
      expect(q('app-registro-dialog [role=alert]')!.textContent).toContain('no puede ser menor que la anterior');
    });

    it('uso: exige elegir un equipo y envía solo horas, fecha y equipo', async () => {
      await abrir([casa()]);
      button('Registrar uso')!.click();
      await settle();
      type('#rd-horas', '5');
      await submit();
      expect(errors()).toEqual(['Elige un electrodoméstico']);
      const sel = q<HTMLSelectElement>('#rd-equipo')!;
      sel.selectedIndex = 1;
      sel.dispatchEvent(new Event('change'));
      await submit();
      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/consumo/usos'));
      expect(req.request.body).toEqual({ id_electrodomestico: 100, fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), horas_uso: 5 });
      req.flush({ success: true, data: uso({ horas_uso: 5 }) }, { status: 201, statusText: 'Created' });
      await settle();
      await responderDatos(1, { usos: [uso({ horas_uso: 5 })] });
      expect(text()).toContain('Uso registrado');
    });

    it('eliminar lectura: confirma, hace DELETE y refresca', async () => {
      await abrir([casa()], { lecturas: [lectura()] });
      button('Lecturas del medidor')!.click();
      await settle();
      expect(text()).toContain('1500,50');
      button('Eliminar')!.click();
      await settle();
      expect(text()).toContain('Tu consumo se calculará con las demás lecturas');
      button('Eliminar lectura')!.click();
      await settle();
      http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/consumo/lecturas/9')).flush({ success: true, data: null });
      await settle();
      await responderDatos(1, { lecturas: [] });
      expect(text()).toContain('Lectura eliminada');
    });

    it('editar uso: solo permite corregir las horas (PUT)', async () => {
      await abrir([casa()], { usos: [uso()] });
      [...root().querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('Uso diario'))!.click();
      await settle();
      button('Editar')!.click();
      await settle();
      expect(q('#rd-fecha')).toBeNull();
      type('#rd-horas', '12');
      await submit();
      const req = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/consumo/usos/70'));
      expect(req.request.body).toEqual({ horas_uso: 12 });
      req.flush({ success: true, data: uso({ horas_uso: 12, kwh_calculado: 0.63 }) });
      await settle();
      await responderDatos(1, { usos: [uso({ horas_uso: 12 })] });
      expect(text()).toContain('Registro de uso actualizado');
    });
  });
});
