import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { Vivienda } from '../../../core/models/vivienda.models';

function fakeJwt(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ id: 2, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const TARIFAS = [
  { id_tarifa: 1, id_usuario: null, nombre: 'Tarifa social', distribuidora: null, region: null, tipo: 'SOCIAL', moneda: 'USD' },
  { id_tarifa: 2, id_usuario: null, nombre: 'Tarifa residencial', distribuidora: null, region: null, tipo: 'RESIDENCIAL', moneda: 'USD' },
];

const casa = (over: Partial<Vivienda> = {}): Vivienda => ({
  id_vivienda: 1,
  id_usuario: 2,
  id_tarifa: 1,
  nombre: 'Mi casa',
  direccion: 'Zona 10',
  region: 'Guatemala',
  num_habitantes: 3,
  dia_corte: 5,
  creado_en: '2026-10-06T12:00:00.000Z',
  ...over,
});

describe('Módulo Mi vivienda', () => {
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

  /** Raíz renderizada (layout + página). Solo existe después de navegar. */
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
  const type = (sel: string, value: string) => {
    const input = q<HTMLInputElement>(sel)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const submitDialog = async () => {
    q<HTMLFormElement>('app-vivienda-form-dialog form')!.dispatchEvent(new Event('submit'));
    await settle();
  };
  const errors = () => [...root().querySelectorAll('app-vivienda-form-dialog .field__error')].map((e) => e.textContent!.trim());

  /** Abre /vivienda y responde las dos peticiones iniciales. */
  async function abrir(viviendas: Vivienda[], tarifas: unknown[] = TARIFAS) {
    const nav = harness.navigateByUrl('/vivienda');
    await nav;
    const lista = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas'));
    const tar = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/tarifas'));
    expect(lista.request.headers.get('Authorization')).toMatch(/^Bearer /); // JWT agregado por el interceptor
    expect(tar.request.headers.get('Authorization')).toMatch(/^Bearer /);
    await settle();
    expect(q('.skel')).not.toBeNull(); // mientras carga: skeleton
    lista.flush({ success: true, data: viviendas });
    tar.flush({ success: true, data: tarifas });
    await settle();
  }

  it('sidebar enlaza «Mi vivienda» y el breadcrumb muestra el título', async () => {
    await abrir([casa()]);
    const link = [...root().querySelectorAll('a.nav__item')].find((a) => a.textContent!.includes('Mi vivienda')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/vivienda');
    expect(q('.crumbs')!.textContent).toContain('Mi vivienda');
    expect(q('.top__pill')).toBeNull(); // datos reales: sin etiqueta «Datos ilustrativos»
  });

  it('sin viviendas: estado vacío amigable (no es un error) con botón Agregar', async () => {
    await abrir([]);
    expect(text()).toContain('Aún no tienes una vivienda registrada');
    expect(q('[role=alert]')).toBeNull();
    expect(button('Agregar vivienda')).toBeDefined();
  });

  it('con una vivienda: muestra todos los datos y la tarifa por nombre, sin selector', async () => {
    await abrir([casa()]);
    const t = text();
    expect(t).toContain('Mi casa');
    expect(t).toContain('Zona 10');
    expect(t).toContain('Guatemala');
    expect(t).toContain('Día 5 de cada mes');
    expect(t).toContain('Tarifa social');
    expect(t).toContain('Registrada el');
    expect(q('.viv__tabs')).toBeNull();
    expect(button('Editar')).toBeDefined();
    expect(button('Eliminar')).toBeDefined();
  });

  it('campos opcionales vacíos muestran «No especificada»', async () => {
    await abrir([casa({ direccion: null, region: null, num_habitantes: null, id_tarifa: null })]);
    expect(text()).toContain('No especificada');
    expect(text()).toContain('No especificado');
    expect(text()).toContain('Sin tarifa asignada');
  });

  it('con varias viviendas: selector para elegir cuál ver', async () => {
    await abrir([casa(), casa({ id_vivienda: 7, nombre: 'Apartamento', direccion: 'Zona 1' })]);
    const tabs = root().querySelectorAll<HTMLButtonElement>('.tab');
    expect(tabs.length).toBe(2);
    expect(q('.home__name')!.textContent).toContain('Mi casa');
    tabs[1].click();
    await settle();
    expect(q('.home__name')!.textContent).toContain('Apartamento');
    expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('error al cargar: mensaje amigable y Reintentar vuelve a pedir la lista', async () => {
    await harness.navigateByUrl('/vivienda');
    http.expectOne((r) => r.url.endsWith('/api/tarifas')).flush({ success: true, data: [] });
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: false, message: 'boom SQL' }, { status: 500, statusText: 'x' });
    await settle();
    expect(text()).toContain('No pudimos cargar tu vivienda');
    expect(text()).toContain('El servidor tuvo un problema');
    expect(text()).not.toContain('boom SQL'); // sin detalles técnicos

    button('Reintentar')!.click();
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [casa()] });
    await settle();
    expect(text()).toContain('Mi casa');
  });

  it('401 al cargar: el interceptor existente cierra la sesión y redirige a /login', async () => {
    await harness.navigateByUrl('/vivienda');
    http.expectOne((r) => r.url.endsWith('/api/tarifas')).flush({ success: true, data: [] });
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: false, message: 'Token inválido' }, { status: 401, statusText: 'x' });
    await settle();
    await harness.fixture.whenStable();
    expect(localStorage.getItem('enerfacil.token')).toBeNull();
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  describe('crear', () => {
    async function abrirForm() {
      await abrir([]);
      button('Agregar vivienda')!.click();
      await settle();
      expect(q('app-vivienda-form-dialog')).not.toBeNull();
    }

    it('valida antes de enviar: nombre obligatorio, enteros, rangos, negativos y longitudes', async () => {
      await abrirForm();
      await submitDialog();
      expect(errors()).toContain('El nombre de la vivienda es obligatorio');

      type('#vf-nombre', 'a'.repeat(101));
      type('#vf-direccion', 'd'.repeat(256));
      type('#vf-region', 'r'.repeat(121));
      type('#vf-habitantes', '2.5');
      type('#vf-corte', '29');
      await submitDialog();
      expect(errors()).toEqual([
        'El nombre no puede superar los 100 caracteres',
        'La dirección no puede superar los 255 caracteres',
        'La región no puede superar los 120 caracteres',
        'Ingresa un número entero, sin decimales',
        'El día de corte debe estar entre 1 y 28',
      ]);

      type('#vf-habitantes', '0');
      type('#vf-corte', '0');
      await submitDialog();
      expect(errors()).toContain('Debe ser al menos 1 habitante');
      type('#vf-habitantes', '256');
      await submitDialog();
      expect(errors()).toContain('No puede superar los 255 habitantes');
      type('#vf-habitantes', '-4');
      type('#vf-corte', '-1');
      await submitDialog();
      expect(errors()).toContain('No se permiten números negativos');

      http.expectNone((r) => r.method === 'POST'); // nada de esto llegó al backend
    });

    it('crea: envía solo los datos (sin id_usuario, vacíos como null), evita doble envío y aparece al instante', async () => {
      await abrirForm();
      type('#vf-nombre', '  Mi casa nueva  ');
      type('#vf-habitantes', '4');
      await submitDialog();
      await submitDialog(); // segundo envío mientras la primera petición sigue en curso

      const req: TestRequest = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/viviendas'));
      expect(req.request.headers.get('Authorization')).toMatch(/^Bearer /);
      expect(req.request.body).toEqual({
        nombre: 'Mi casa nueva',
        direccion: null,
        region: null,
        num_habitantes: 4,
        id_tarifa: null,
        dia_corte: 1,
      });
      expect('id_usuario' in req.request.body).toBe(false);
      expect(button('Guardando…')!.disabled).toBe(true);

      req.flush({ success: true, data: casa({ id_vivienda: 9, nombre: 'Mi casa nueva', direccion: null, region: null, num_habitantes: 4, id_tarifa: null, dia_corte: 1 }) }, { status: 201, statusText: 'Created' });
      await settle();
      expect(q('app-vivienda-form-dialog')).toBeNull();
      expect(q('.home__name')!.textContent).toContain('Mi casa nueva');
      expect(text()).toContain('Vivienda agregada');
    });

    it('permite elegir una tarifa real del backend', async () => {
      await abrirForm();
      const select = q<HTMLSelectElement>('#vf-tarifa')!;
      expect([...select.options].map((o) => o.textContent!.trim())).toEqual(['Sin tarifa asignada', 'Tarifa social', 'Tarifa residencial']);
      select.selectedIndex = 2;
      select.dispatchEvent(new Event('change'));
      type('#vf-nombre', 'Casa');
      await submitDialog();
      const req = http.expectOne((r) => r.method === 'POST');
      expect(req.request.body.id_tarifa).toBe(2);
      req.flush({ success: false, message: 'La tarifa indicada no existe o no está disponible' }, { status: 400, statusText: 'x' });
      await settle();
      expect(q('[role=alert]')!.textContent).toContain('La tarifa indicada no existe');
      expect(button('Agregar vivienda ')).toBeUndefined();
      expect(q<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false); // se puede reintentar
    });

    it('error 400 del backend por campo: marca el campo con texto en español, sin mensajes técnicos', async () => {
      await abrirForm();
      type('#vf-nombre', 'Casa');
      await submitDialog();
      http.expectOne((r) => r.method === 'POST').flush(
        { success: false, message: 'Datos inválidos', errors: [{ campo: 'nombre', mensaje: 'Too small: expected string to have >=1 characters' }] },
        { status: 400, statusText: 'x' },
      );
      await settle();
      expect(text()).not.toContain('Too small');
      expect(errors()).toEqual(['Revisa este campo']);
    });

    it('error 500 / sin conexión: mensaje amigable y el formulario conserva los datos', async () => {
      await abrirForm();
      type('#vf-nombre', 'Casa');
      await submitDialog();
      http.expectOne((r) => r.method === 'POST').error(new ProgressEvent('error'), { status: 0, statusText: '' });
      await settle();
      expect(q('app-vivienda-form-dialog [role=alert]')!.textContent).toContain('No se pudo conectar con el servidor');
      expect(q<HTMLInputElement>('#vf-nombre')!.value).toBe('Casa');
    });
  });

  describe('editar', () => {
    it('precarga los datos y envía PUT; la tarjeta se actualiza', async () => {
      await abrir([casa()]);
      button('Editar')!.click();
      await settle();
      expect(q<HTMLInputElement>('#vf-nombre')!.value).toBe('Mi casa');
      expect(q<HTMLInputElement>('#vf-habitantes')!.value).toBe('3');
      expect(q<HTMLInputElement>('#vf-corte')!.value).toBe('5');
      expect(q<HTMLSelectElement>('#vf-tarifa')!.selectedOptions[0].textContent).toContain('Tarifa social');

      type('#vf-nombre', 'Casa renovada');
      type('#vf-direccion', '   '); // en blanco → null (el backend rechaza strings vacíos)
      await submitDialog();
      const req = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/viviendas/1'));
      expect(req.request.body).toEqual({ nombre: 'Casa renovada', direccion: null, region: 'Guatemala', num_habitantes: 3, id_tarifa: 1, dia_corte: 5 });
      req.flush({ success: true, data: casa({ nombre: 'Casa renovada', direccion: null }) });
      await settle();
      expect(q('app-vivienda-form-dialog')).toBeNull();
      expect(q('.home__name')!.textContent).toContain('Casa renovada');
      expect(text()).toContain('Cambios guardados');
    });

    it('si las tarifas no cargaron, el select queda deshabilitado y no se pierde la tarifa actual', async () => {
      await harness.navigateByUrl('/vivienda');
      http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [casa()] });
      http.expectOne((r) => r.url.endsWith('/api/tarifas')).flush({ success: false, message: 'x' }, { status: 500, statusText: 'x' });
      await settle();
      expect(text()).toContain('Tarifa n.º 1'); // cae a un texto neutro si no hay nombre
      button('Editar')!.click();
      await settle();
      expect(q<HTMLSelectElement>('#vf-tarifa')!.hasAttribute('disabled')).toBe(true);
      expect(text()).toContain('No se pudieron cargar las tarifas');
      await submitDialog();
      expect(http.expectOne((r) => r.method === 'PUT').request.body.id_tarifa).toBe(1);
      http.match(() => true).forEach((r) => r.flush({ success: true, data: casa() }));
    });

    it('404 al guardar (ya fue borrada): cierra, avisa y refresca la lista', async () => {
      await abrir([casa()]);
      button('Editar')!.click();
      await settle();
      await submitDialog();
      http.expectOne((r) => r.method === 'PUT').flush({ success: false, message: 'Vivienda no encontrada' }, { status: 404, statusText: 'x' });
      await settle();
      http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas')).flush({ success: true, data: [] });
      await settle();
      expect(text()).toContain('Esa vivienda ya no existe');
      expect(text()).toContain('Aún no tienes una vivienda registrada');
    });
  });

  describe('eliminar', () => {
    it('pide confirmación: cancelar no borra nada', async () => {
      await abrir([casa()]);
      button('Eliminar')!.click();
      await settle();
      expect(q('app-confirm-dialog')).not.toBeNull();
      expect(text()).toContain('¿Eliminar esta vivienda?');
      http.expectNone((r) => r.method === 'DELETE');
      button('Cancelar')!.click();
      await settle();
      expect(q('app-confirm-dialog')).toBeNull();
      expect(q('.home__name')!.textContent).toContain('Mi casa');
    });

    it('confirmar elimina, bloquea el botón mientras elimina y muestra el estado vacío', async () => {
      await abrir([casa()]);
      button('Eliminar')!.click();
      await settle();
      button('Eliminar vivienda')!.click();
      await settle();
      expect(button('Eliminando…')!.disabled).toBe(true);
      button('Eliminando…')!.click(); // sin efecto: botón deshabilitado
      const req = http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/api/viviendas/1'));
      expect(req.request.headers.get('Authorization')).toMatch(/^Bearer /);
      req.flush({ success: true, message: 'Vivienda eliminada', data: null });
      await settle();
      expect(q('app-confirm-dialog')).toBeNull();
      expect(text()).toContain('Aún no tienes una vivienda registrada');
      expect(text()).toContain('Se eliminó «Mi casa»');
    });

    it('al borrar una de varias queda seleccionada la vecina', async () => {
      await abrir([casa(), casa({ id_vivienda: 7, nombre: 'Apartamento' })]);
      button('Eliminar')!.click();
      await settle();
      button('Eliminar vivienda')!.click();
      http.expectOne((r) => r.method === 'DELETE').flush({ success: true, data: null });
      await settle();
      expect(q('.home__name')!.textContent).toContain('Apartamento');
      expect(q('.viv__tabs')).toBeNull();
    });

    it('error 500 al eliminar: mensaje dentro del diálogo y se puede reintentar', async () => {
      await abrir([casa()]);
      button('Eliminar')!.click();
      await settle();
      button('Eliminar vivienda')!.click();
      http.expectOne((r) => r.method === 'DELETE').flush({ success: false, message: 'x' }, { status: 500, statusText: 'x' });
      await settle();
      expect(q('app-confirm-dialog [role=alert]')!.textContent).toContain('El servidor tuvo un problema');
      expect(button('Eliminar vivienda')!.disabled).toBe(false);
      expect(q('.home__name')!.textContent).toContain('Mi casa'); // no se quitó de la lista
    });
  });
});
