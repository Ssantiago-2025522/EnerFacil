import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { Ambiente } from '../../../core/models/ambiente.models';
import { CatalogoElectrodomestico, Electrodomestico } from '../../../core/models/electrodomestico.models';
import { Vivienda } from '../../../core/models/vivienda.models';

function fakeJwt(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ id: 2, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const casa = (over: Partial<Vivienda> = {}): Vivienda => ({
  id_vivienda: 1, id_usuario: 2, id_tarifa: null, nombre: 'Mi casa', direccion: null, region: null,
  num_habitantes: null, dia_corte: 1, creado_en: '2026-10-06T12:00:00.000Z', ...over,
});
const amb = (over: Partial<Ambiente> = {}): Ambiente => ({ id_ambiente: 10, id_vivienda: 1, nombre: 'Cocina', tipo: 'COCINA', ...over });
const electro = (over: Partial<Electrodomestico> = {}): Electrodomestico => ({
  id_electrodomestico: 100, id_vivienda: 1, id_ambiente: 10, id_catalogo: null, nombre: 'Refrigerador', potencia_w: 150,
  cantidad: 1, horas_uso_dia: 24, dias_uso_mes: 30, factor_uso: 0.35, activo: 1, creado_en: '2026-10-06T12:00:00.000Z',
  kwh_mes_estimado: 37.8, ambiente: 'Cocina', ...over,
});
const CATALOGO: CatalogoElectrodomestico[] = [
  { id_catalogo: 4, id_categoria: 2, categoria: 'Refrigeración', nombre: 'Refrigerador', potencia_w_promedio: 150, horas_uso_dia_promedio: 24, factor_uso_promedio: 0.35 },
];

describe('Módulo Electrodomésticos', () => {
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
    q<HTMLFormElement>('app-electrodomestico-form-dialog form')!.dispatchEvent(new Event('submit'));
    await settle();
  };
  const errors = () => [...root().querySelectorAll('app-electrodomestico-form-dialog .field__error')].map((e) => e.textContent!.trim());
  const porVivienda = (suffix: string, id: number) =>
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith(suffix) && r.params.get('id_vivienda') === String(id));

  /** Abre /electrodomesticos y responde viviendas, ambientes y electrodomésticos de la seleccionada. */
  async function abrir(viviendas: Vivienda[], ambientes: Ambiente[] = [], electros: Electrodomestico[] = [], id = viviendas[0]?.id_vivienda) {
    await harness.navigateByUrl('/electrodomesticos');
    const v = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas'));
    expect(v.request.headers.get('Authorization')).toMatch(/^Bearer /);
    await settle();
    expect(q('.skel')).not.toBeNull();
    v.flush({ success: true, data: viviendas });
    await settle();
    if (viviendas.length > 0) {
      const a = porVivienda('/api/ambientes', id!);
      const e = porVivienda('/api/electrodomesticos', id!);
      await settle();
      expect(q('.eq__grid .skel')).not.toBeNull();
      a.flush({ success: true, data: ambientes });
      e.flush({ success: true, data: electros });
      await settle();
    }
  }

  async function abrirForm(catalogo: CatalogoElectrodomestico[] = CATALOGO) {
    button('Agregar electrodoméstico')!.click();
    await settle();
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/electrodomesticos/catalogo')).flush({ success: true, data: catalogo });
    await settle();
  }

  it('sidebar enlaza «Electrodomésticos» y el breadcrumb muestra el título', async () => {
    await abrir([casa()], [amb()], [electro()]);
    const link = [...root().querySelectorAll('a.nav__item')].find((a) => a.textContent!.includes('Electrodomésticos')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/electrodomesticos');
    expect(q('.crumbs')!.textContent).toContain('Electrodomésticos');
    expect(q('.top__pill')).toBeNull();
  });

  it('sin viviendas: pide crear una primero y enlaza a /vivienda', async () => {
    await abrir([]);
    expect(text()).toContain('Primero registra una vivienda');
    expect(q<HTMLAnchorElement>('.state a.btn')!.getAttribute('href')).toBe('/vivienda');
  });

  it('sin electrodomésticos: estado vacío con botón para agregar el primero', async () => {
    await abrir([casa()], [amb()], []);
    expect(text()).toContain('Aún no tienes electrodomésticos');
    expect(button('Agregar electrodoméstico')).toBeDefined();
  });

  it('lista los datos reales y el consumo estimado que calcula el backend', async () => {
    await abrir([casa()], [amb()], [electro(), electro({ id_electrodomestico: 101, nombre: 'Lámpara', potencia_w: 9, kwh_mes_estimado: 1.35, id_ambiente: null, ambiente: null, activo: 0 })]);
    expect(root().querySelectorAll('.eq__item').length).toBe(2);
    expect(text()).toContain('Refrigerador');
    expect(text()).toContain('150 W');
    expect(text()).toContain('37,8');
    expect(text()).toContain('Inactivo');
    expect(text()).toContain('Sin ambiente');
  });

  it('filtra por ambiente y por «Sin ambiente» sin pedir nada más al backend', async () => {
    await abrir(
      [casa()],
      [amb(), amb({ id_ambiente: 11, nombre: 'Sala', tipo: 'SALA' })],
      [electro(), electro({ id_electrodomestico: 101, nombre: 'Lámpara', id_ambiente: null, ambiente: null, kwh_mes_estimado: 1 })],
    );
    const tabs = () => [...root().querySelectorAll<HTMLButtonElement>('.eq__filters .tab')];
    tabs().find((t) => t.textContent!.includes('Cocina'))!.click();
    await settle();
    expect(root().querySelectorAll('.eq__item').length).toBe(1);
    expect(text()).toContain('Refrigerador');
    tabs().find((t) => t.textContent!.includes('Sin ambiente'))!.click();
    await settle();
    expect(text()).toContain('Lámpara');
    expect(text()).not.toContain('Refrigerador');
    tabs().find((t) => t.textContent!.includes('Sala'))!.click();
    await settle();
    expect(text()).toContain('No hay electrodomésticos en Sala');
  });

  it('error al cargar: mensaje amigable y Reintentar', async () => {
    await harness.navigateByUrl('/electrodomesticos');
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [casa()] });
    await settle();
    porVivienda('/api/ambientes', 1).flush({ success: true, data: [] });
    porVivienda('/api/electrodomesticos', 1).flush({ success: false, message: 'boom SQL' }, { status: 500, statusText: 'x' });
    await settle();
    expect(text()).toContain('No pudimos cargar tus electrodomésticos');
    expect(text()).not.toContain('boom SQL');
    button('Reintentar')!.click();
    porVivienda('/api/ambientes', 1).flush({ success: true, data: [] });
    porVivienda('/api/electrodomesticos', 1).flush({ success: true, data: [electro()] });
    await settle();
    expect(text()).toContain('Refrigerador');
  });

  it('cambiar de vivienda pide sus datos y comparte la selección', async () => {
    await abrir([casa(), casa({ id_vivienda: 7, nombre: 'Apartamento' })], [amb()], [electro()]);
    root().querySelectorAll<HTMLButtonElement>('.eq__tabs .tab')[1].click();
    await settle();
    porVivienda('/api/ambientes', 7).flush({ success: true, data: [] });
    porVivienda('/api/electrodomesticos', 7).flush({ success: true, data: [] });
    await settle();
    expect(text()).toContain('Aún no tienes electrodomésticos');
    expect(localStorage.getItem('enerfacil.vivienda-seleccionada')).toBe('7');
  });

  describe('crear / editar / eliminar', () => {
    it('crear: valida igual que el backend y no envía nada inválido', async () => {
      await abrir([casa()], [amb()], []);
      await abrirForm();
      await submit();
      expect(errors()).toEqual(['El nombre del electrodoméstico es obligatorio', 'La potencia es obligatoria']);

      type('#ef-nombre', 'x'.repeat(101));
      type('#ef-potencia', '0');
      type('#ef-cantidad', '1.5');
      type('#ef-horas', '25');
      type('#ef-dias', '32');
      type('#ef-factor', '1.1');
      await submit();
      expect(errors()).toEqual([
        'El nombre no puede superar los 100 caracteres',
        'La potencia debe ser mayor que 0',
        'Ingresa un número entero, sin decimales',
        'Las horas deben estar entre 0 y 24',
        'Los días deben estar entre 0 y 31',
        'El factor debe estar entre 0 y 1',
      ]);
      http.expectNone((r) => r.method === 'POST');
    });

    it('crear manual: envía id_vivienda, sin id_usuario ni id_catalogo, y agrega a la lista', async () => {
      await abrir([casa()], [amb()], []);
      await abrirForm();
      type('#ef-nombre', '  Licuadora  ');
      type('#ef-potencia', '400');
      type('#ef-horas', '0.5');
      await submit();
      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/electrodomesticos'));
      expect(req.request.body).toEqual({
        id_vivienda: 1, id_ambiente: null, nombre: 'Licuadora', potencia_w: 400, cantidad: 1, horas_uso_dia: 0.5, dias_uso_mes: 30, factor_uso: 1,
      });
      req.flush({ success: true, data: electro({ id_electrodomestico: 200, nombre: 'Licuadora', potencia_w: 400, id_ambiente: null, ambiente: null }) }, { status: 201, statusText: 'Created' });
      await settle();
      expect(q('app-electrodomestico-form-dialog')).toBeNull();
      expect(text()).toContain('Electrodoméstico agregado.');
      expect(text()).toContain('Licuadora');
    });

    it('crear desde el catálogo: precarga los valores y envía id_catalogo', async () => {
      await abrir([casa()], [amb()], []);
      await abrirForm();
      const sel = q<HTMLSelectElement>('#ef-catalogo')!;
      sel.selectedIndex = 1; // «Refrigerador»
      sel.dispatchEvent(new Event('change'));
      await settle();
      expect(q<HTMLInputElement>('#ef-nombre')!.value).toBe('Refrigerador');
      expect(q<HTMLInputElement>('#ef-potencia')!.value).toBe('150');
      await submit();
      const req = http.expectOne((r) => r.method === 'POST');
      expect(req.request.body).toMatchObject({ id_catalogo: 4, nombre: 'Refrigerador', potencia_w: 150, horas_uso_dia: 24, factor_uso: 0.35 });
      req.flush({ success: true, data: electro() }, { status: 201, statusText: 'Created' });
      await settle();
    });

    it('crear con un ambiente filtrado lo preselecciona', async () => {
      await abrir([casa()], [amb()], [electro()]);
      [...root().querySelectorAll<HTMLButtonElement>('.eq__filters .tab')].find((t) => t.textContent!.includes('Cocina'))!.click();
      await settle();
      await abrirForm();
      expect(q<HTMLSelectElement>('#ef-ambiente')!.selectedOptions[0].textContent).toContain('Cocina');
    });

    it('crear: error 400 del backend se muestra en el formulario', async () => {
      await abrir([casa()], [amb()], []);
      await abrirForm();
      type('#ef-nombre', 'TV');
      type('#ef-potencia', '80');
      await submit();
      http.expectOne((r) => r.method === 'POST').flush({ success: false, message: 'El ambiente no existe en esa vivienda' }, { status: 400, statusText: 'x' });
      await settle();
      expect(q('app-electrodomestico-form-dialog [role=alert]')!.textContent).toContain('El ambiente no existe en esa vivienda');
    });

    it('editar: carga los datos, hace PUT con activo y actualiza la lista con el consumo recalculado', async () => {
      await abrir([casa()], [amb()], [electro()]);
      button('Editar')!.click();
      await settle();
      expect(q<HTMLInputElement>('#ef-nombre')!.value).toBe('Refrigerador');
      expect(q<HTMLInputElement>('#ef-factor')!.value).toBe('0.35');
      type('#ef-potencia', '200');
      await submit();
      const req = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/electrodomesticos/100'));
      expect(req.request.body).toEqual({
        id_ambiente: 10, nombre: 'Refrigerador', potencia_w: 200, cantidad: 1, horas_uso_dia: 24, dias_uso_mes: 30, factor_uso: 0.35, activo: true,
      });
      req.flush({ success: true, data: electro({ potencia_w: 200, kwh_mes_estimado: 50.4 }) });
      await settle();
      expect(text()).toContain('200 W');
      expect(text()).toContain('50,4');
      expect(text()).toContain('Cambios guardados.');
    });

    it('eliminar: la confirmación advierte de lo que se borra y hace DELETE', async () => {
      await abrir([casa()], [amb()], [electro()]);
      button('Eliminar')!.click();
      await settle();
      expect(text()).toContain('historial de uso');
      expect(text()).toContain('recomendaciones asociadas');
      button('Eliminar electrodoméstico')!.click();
      await settle();
      http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/electrodomesticos/100')).flush({ success: true, data: null });
      await settle();
      expect(text()).toContain('Aún no tienes electrodomésticos');
    });
  });
});
