import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { TarifaActual } from '../../../core/models/tarifa.models';
import { Vivienda } from '../../../core/models/vivienda.models';

function fakeJwt(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ id: 2, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const casa = (over: Partial<Vivienda> = {}): Vivienda => ({
  id_vivienda: 1, id_usuario: 2, id_tarifa: 2, nombre: 'Casa A', direccion: null, region: null,
  num_habitantes: null, dia_corte: 1, creado_en: '2026-10-06T12:00:00.000Z', ...over,
});
const tarifa = (over: Partial<TarifaActual> = {}): TarifaActual => ({
  id_tarifa: 2, id_usuario: null, nombre: 'Residencial básica', distribuidora: 'Distribuidora Norte', region: 'Madrid',
  tipo: 'RESIDENCIAL', moneda: 'USD', cargo_fijo: 2, cargo_potencia_kw: 0, impuesto_pct: 10,
  vigente_desde: '2026-01-01', vigente_hasta: null,
  tramos: [
    { kwh_desde: 0, kwh_hasta: 100, precio_kwh: 0.15 },
    { kwh_desde: 100, kwh_hasta: 300, precio_kwh: 0.225 },
    { kwh_desde: 300, kwh_hasta: null, precio_kwh: 0.31 },
  ],
  ...over,
});

describe('Módulo Tarifa', () => {
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
  const pedirTarifa = (id: number) =>
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/tarifas/actual') && r.params.get('id_vivienda') === String(id));

  /** Navega a /tarifa y responde la lista de viviendas; no responde la tarifa. */
  async function abrir(viviendas: Vivienda[]) {
    await harness.navigateByUrl('/tarifa');
    const v = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas'));
    expect(v.request.headers.get('Authorization')).toMatch(/^Bearer /);
    await settle();
    expect(q('.skel')).not.toBeNull(); // cargando
    v.flush({ success: true, data: viviendas });
    await settle();
  }

  async function abrirConTarifa(data: TarifaActual | null, viviendas: Vivienda[] = [casa()]) {
    await abrir(viviendas);
    pedirTarifa(viviendas[0].id_vivienda).flush({ success: true, data });
    await settle();
  }

  it('navegación: el sidebar enlaza «Mi tarifa» a /tarifa y el breadcrumb muestra el título', async () => {
    await abrirConTarifa(tarifa());
    const link = [...root().querySelectorAll('a.nav__item')].find((a) => a.textContent!.includes('Mi tarifa')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/tarifa');
    expect(q('.crumbs')!.textContent).toContain('Mi tarifa');
    expect(q('.top__pill')).toBeNull();
  });

  it('muestra la tarifa de la vivienda seleccionada y sus tramos reales', async () => {
    await abrirConTarifa(tarifa());
    expect(text()).toContain('Residencial básica');
    expect(text()).toContain('Tarifa residencial');
    expect(text()).toContain('Distribuidora Norte · Madrid');

    const filas = [...root().querySelectorAll('.tf__table tbody tr')].map((tr) => (tr.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(filas.length).toBe(3);
    expect(filas[0]).toContain('0 – 100 kWh');
    expect(filas[0]).toContain('0,15');
    expect(filas[1]).toContain('100 – 300 kWh');
    expect(filas[1]).toContain('0,225');
    expect(filas[2]).toContain('Más de 300 kWh');
    expect(filas[2]).toContain('0,31');

    expect(text()).toContain('Cargo fijo mensual');
    expect(text()).toContain('2,00');
    expect(text()).toContain('10,00 %');
  });

  it('no muestra datos técnicos (ids, nombres internos)', async () => {
    await abrirConTarifa(tarifa());
    const t = text();
    for (const interno of ['id_tarifa', 'id_tramo', 'id_vivienda', 'kwh_desde', 'precio_kwh', 'created_at', 'creado_en']) {
      expect(t).not.toContain(interno);
    }
  });

  it('sin cargo fijo ni impuestos no muestra esos bloques', async () => {
    await abrirConTarifa(tarifa({ cargo_fijo: 0, impuesto_pct: 0 }));
    expect(text()).not.toContain('Cargo fijo mensual');
    expect(text()).not.toContain('Impuestos y tasas');
  });

  it('usa la vivienda seleccionada: pide /api/tarifas/actual con su id', async () => {
    localStorage.setItem('enerfacil.vivienda-seleccionada', '2');
    await abrir([casa(), casa({ id_vivienda: 2, nombre: 'Casa B' })]);
    pedirTarifa(2).flush({ success: true, data: tarifa({ nombre: 'Tarifa de B' }) });
    await settle();
    expect(text()).toContain('Tarifa de B');
  });

  it('cambiar de vivienda carga su tarifa y no deja datos de la anterior', async () => {
    await abrirConTarifa(tarifa({ nombre: 'Tarifa de A' }), [casa(), casa({ id_vivienda: 2, nombre: 'Casa B' })]);
    expect(text()).toContain('Tarifa de A');

    button('Casa B')!.click();
    await settle();
    expect(q('.skel')).not.toBeNull();
    expect(text()).not.toContain('Tarifa de A');
    pedirTarifa(2).flush({ success: true, data: tarifa({ id_tarifa: 3, nombre: 'Tarifa de B' }) });
    await settle();
    expect(text()).toContain('Tarifa de B');
    expect(text()).not.toContain('Tarifa de A');
    expect(localStorage.getItem('enerfacil.vivienda-seleccionada')).toBe('2');
  });

  it('cambiar de vivienda descarta la respuesta tardía de la anterior', async () => {
    await abrir([casa(), casa({ id_vivienda: 2, nombre: 'Casa B' })]);
    const lenta = pedirTarifa(1); // nunca se responde: se cancela al cambiar
    button('Casa B')!.click();
    await settle();
    expect(lenta.cancelled).toBe(true);
    pedirTarifa(2).flush({ success: true, data: tarifa({ nombre: 'Tarifa de B' }) });
    await settle();
    expect(text()).toContain('Tarifa de B');
  });

  it('sin viviendas: pide registrar una y enlaza a /vivienda', async () => {
    await abrir([]);
    expect(text()).toContain('Primero registra una vivienda');
    expect(q<HTMLAnchorElement>('.state a.btn')!.getAttribute('href')).toBe('/vivienda');
  });

  it('vivienda sin tarifa: mensaje claro y no inventa tarifa', async () => {
    await abrirConTarifa(null);
    expect(text()).toContain('No hay una tarifa configurada para esta vivienda.');
    expect(q('.tf__table')).toBeNull();
    expect(q<HTMLAnchorElement>('.state a.btn')!.getAttribute('href')).toBe('/vivienda');
  });

  it('error al cargar la tarifa: mensaje amigable sin detalles técnicos y Reintentar', async () => {
    await abrir([casa()]);
    pedirTarifa(1).flush({ success: false, message: 'boom SQL' }, { status: 500, statusText: 'x' });
    await settle();
    expect(text()).toContain('No pudimos cargar tu tarifa');
    expect(text()).not.toContain('boom SQL');

    button('Reintentar')!.click();
    await settle();
    pedirTarifa(1).flush({ success: true, data: tarifa() });
    await settle();
    expect(text()).toContain('Residencial básica');
  });

  it('403: muestra un mensaje de permiso, no el del servidor', async () => {
    await abrir([casa()]);
    pedirTarifa(1).flush({ success: false, message: 'Forbidden interno' }, { status: 403, statusText: 'Forbidden' });
    await settle();
    expect(text()).toContain('No tienes permiso para ver esta tarifa.');
    expect(text()).not.toContain('Forbidden interno');
  });

  it('404 de la tarifa: vuelve a pedir las viviendas', async () => {
    await abrir([casa()]);
    pedirTarifa(1).flush({ success: false, message: 'no existe' }, { status: 404, statusText: 'Not Found' });
    await settle();
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas')).flush({ success: true, data: [] });
    await settle();
    expect(text()).toContain('Primero registra una vivienda');
  });

  it('error al cargar las viviendas: mensaje y Reintentar', async () => {
    await harness.navigateByUrl('/tarifa');
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: false, message: 'x' }, { status: 500, statusText: 'x' });
    await settle();
    expect(text()).toContain('No pudimos cargar tus viviendas');
    button('Reintentar')!.click();
    await settle();
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [] });
    await settle();
    expect(text()).toContain('Primero registra una vivienda');
  });
});
