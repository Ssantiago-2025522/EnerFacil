import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { Ambiente } from '../../../core/models/ambiente.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';

function fakeJwt(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ id: 2, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const casa = (over: Partial<Vivienda> = {}): Vivienda => ({
  id_vivienda: 1, id_usuario: 2, id_tarifa: null, nombre: 'Mi casa', direccion: null, region: null,
  num_habitantes: null, dia_corte: 1, creado_en: '2026-10-06T12:00:00.000Z', ...over,
});
const amb = (over: Partial<Ambiente> = {}): Ambiente => ({ id_ambiente: 10, id_vivienda: 1, nombre: 'Cocina', tipo: 'COCINA', ...over });

describe('Módulo Ambientes', () => {
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
    [...root().querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === label) as HTMLButtonElement | undefined;
  const listaAmb = (id: number) => http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/ambientes') && r.params.get('id_vivienda') === String(id));

  /** Abre /ambientes y responde viviendas y, si corresponde, los ambientes de la seleccionada. */
  async function abrir(viviendas: Vivienda[], ambientes: Ambiente[] = [], idEsperado = viviendas[0]?.id_vivienda) {
    await harness.navigateByUrl('/ambientes');
    const v = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas'));
    expect(v.request.headers.get('Authorization')).toMatch(/^Bearer /);
    await settle();
    expect(q('.skel')).not.toBeNull();
    v.flush({ success: true, data: viviendas });
    await settle();
    if (viviendas.length > 0) {
      const a = listaAmb(idEsperado!);
      expect(a.request.headers.get('Authorization')).toMatch(/^Bearer /);
      await settle();
      expect(q('.amb__grid .skel')).not.toBeNull(); // skeleton mientras cargan los ambientes
      a.flush({ success: true, data: ambientes });
      await settle();
    }
  }

  it('sidebar enlaza «Ambientes» a /ambientes y el breadcrumb muestra el título', async () => {
    await abrir([casa()], [amb()]);
    const link = [...root().querySelectorAll('a.nav__item')].find((a) => a.textContent!.includes('Ambientes')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/ambientes');
    expect(q('.crumbs')!.textContent).toContain('Ambientes');
    expect(q('.top__pill')).toBeNull();
  });

  it('sin viviendas: pide crear una primero y enlaza a /vivienda, sin pedir ambientes', async () => {
    await abrir([]);
    expect(text()).toContain('Primero registra una vivienda');
    expect(q<HTMLAnchorElement>('.state a.btn')!.getAttribute('href')).toBe('/vivienda');
    expect(button('Agregar ambiente')).toBeUndefined();
  });

  it('vivienda sin ambientes: estado vacío con botón para agregar el primero', async () => {
    await abrir([casa()], []);
    expect(text()).toContain('Aún no tienes ambientes');
    expect(button('Agregar ambiente')).toBeDefined();
  });

  it('lista nombre y tipo reales del backend', async () => {
    await abrir([casa()], [amb(), amb({ id_ambiente: 11, nombre: 'Baño principal', tipo: 'BANO' })]);
    expect(root().querySelectorAll('.amb__item').length).toBe(2);
    expect(text()).toContain('Cocina');
    expect(text()).toContain('Baño principal');
  });

  it('error al cargar ambientes: mensaje amigable y Reintentar', async () => {
    await harness.navigateByUrl('/ambientes');
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [casa()] });
    await settle();
    listaAmb(1).flush({ success: false, message: 'boom SQL' }, { status: 500, statusText: 'x' });
    await settle();
    expect(text()).toContain('No pudimos cargar tus ambientes');
    expect(text()).not.toContain('boom SQL');
    button('Reintentar')!.click();
    listaAmb(1).flush({ success: true, data: [amb()] });
    await settle();
    expect(text()).toContain('Cocina');
  });

  it('varias viviendas: cambiar de vivienda pide sus ambientes y deja la selección compartida', async () => {
    await abrir([casa(), casa({ id_vivienda: 7, nombre: 'Apartamento' })], [amb()]);
    root().querySelectorAll<HTMLButtonElement>('.tab')[1].click();
    await settle();
    listaAmb(7).flush({ success: true, data: [amb({ id_ambiente: 20, id_vivienda: 7, nombre: 'Sala', tipo: 'SALA' })] });
    await settle();
    expect(text()).toContain('Sala');
    expect(localStorage.getItem('enerfacil.vivienda-seleccionada')).toBe('7');
  });

  it('usa la vivienda seleccionada previamente (p. ej. desde Mi vivienda)', async () => {
    localStorage.setItem('enerfacil.vivienda-seleccionada', '7');
    await abrir([casa(), casa({ id_vivienda: 7, nombre: 'Apartamento' })], [], 7);
    expect(root().querySelector('.tab--active')!.textContent).toContain('Apartamento');
  });

  describe('crear / editar / eliminar', () => {
    it('crear: valida, envía id_vivienda (sin id_usuario) y agrega a la lista', async () => {
      await abrir([casa()], []);
      button('Agregar ambiente')!.click();
      await settle();
      q<HTMLFormElement>('app-ambiente-form-dialog form')!.dispatchEvent(new Event('submit'));
      await settle();
      expect(q('app-ambiente-form-dialog .field__error')!.textContent).toContain('El nombre del ambiente es obligatorio');
      http.expectNone((r) => r.method === 'POST');

      const input = q<HTMLInputElement>('#af-nombre')!;
      input.value = '  Sala  ';
      input.dispatchEvent(new Event('input'));
      q<HTMLFormElement>('app-ambiente-form-dialog form')!.dispatchEvent(new Event('submit'));
      await settle();
      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/ambientes'));
      expect(req.request.body).toEqual({ id_vivienda: 1, nombre: 'Sala', tipo: 'OTRO' });
      req.flush({ success: true, data: amb({ id_ambiente: 30, nombre: 'Sala', tipo: 'OTRO' }) }, { status: 201, statusText: 'Created' });
      await settle();
      expect(q('app-ambiente-form-dialog')).toBeNull();
      expect(text()).toContain('Ambiente agregado.');
      expect(root().querySelectorAll('.amb__item').length).toBe(1);
    });

    it('crear: nombre repetido (409) se muestra en el campo', async () => {
      await abrir([casa()], []);
      button('Agregar ambiente')!.click();
      await settle();
      const input = q<HTMLInputElement>('#af-nombre')!;
      input.value = 'Cocina';
      input.dispatchEvent(new Event('input'));
      q<HTMLFormElement>('app-ambiente-form-dialog form')!.dispatchEvent(new Event('submit'));
      await settle();
      http.expectOne((r) => r.method === 'POST').flush({ success: false, message: 'Ya existe un ambiente con ese nombre en la vivienda' }, { status: 409, statusText: 'x' });
      await settle();
      expect(q('app-ambiente-form-dialog .field__error')!.textContent).toContain('Ya tienes un ambiente con ese nombre');
      expect(q('app-ambiente-form-dialog')).not.toBeNull();
    });

    it('editar: carga los datos, hace PUT y actualiza la lista', async () => {
      await abrir([casa()], [amb()]);
      button('Editar')!.click();
      await settle();
      expect(q<HTMLInputElement>('#af-nombre')!.value).toBe('Cocina');
      const input = q<HTMLInputElement>('#af-nombre')!;
      input.value = 'Cocina nueva';
      input.dispatchEvent(new Event('input'));
      q<HTMLFormElement>('app-ambiente-form-dialog form')!.dispatchEvent(new Event('submit'));
      await settle();
      const req = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/ambientes/10'));
      expect(req.request.body).toEqual({ nombre: 'Cocina nueva', tipo: 'COCINA' });
      req.flush({ success: true, data: amb({ nombre: 'Cocina nueva' }) });
      await settle();
      expect(text()).toContain('Cocina nueva');
      expect(text()).toContain('Cambios guardados.');
    });

    it('eliminar: la confirmación explica que los electrodomésticos quedan sin ambiente y hace DELETE', async () => {
      await abrir([casa()], [amb()]);
      button('Eliminar')!.click();
      await settle();
      expect(text()).toContain('quedarán sin ambiente asignado');
      button('Eliminar ambiente')!.click();
      await settle();
      http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/ambientes/10')).flush({ success: true, data: null });
      await settle();
      expect(text()).toContain('Aún no tienes ambientes');
    });
  });
});
