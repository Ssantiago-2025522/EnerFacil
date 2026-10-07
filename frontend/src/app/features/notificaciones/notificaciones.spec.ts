import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { authInterceptor } from '../../core/interceptors/auth.interceptor';
import { Notificacion } from '../../core/models/notificacion.models';
import { Vivienda } from '../../core/models/vivienda.models';

function fakeJwt(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ id: 2, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const casa = (over: Partial<Vivienda> = {}): Vivienda => ({
  id_vivienda: 1, id_usuario: 2, id_tarifa: 2, nombre: 'Casa A', direccion: null, region: null,
  num_habitantes: null, dia_corte: 1, creado_en: '2026-10-06T12:00:00.000Z', ...over,
});
const notif = (over: Partial<Notificacion> = {}): Notificacion => ({
  id_notificacion: 10, id_vivienda: 1, nivel: 'AMARILLO', titulo: 'Te acercas a tu límite',
  mensaje: 'Llevas el 85 % de tu presupuesto.', leida: 0, enviada_en: '2026-10-05T15:30:00.000Z', ...over,
});

describe('Módulo Notificaciones', () => {
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
  const items = () => [...root().querySelectorAll('.nt__item')] as HTMLElement[];
  const settle = async () => {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  };
  const button = (label: string) =>
    [...root().querySelectorAll('button')].find((b) => (b.textContent ?? '').trim().startsWith(label)) as HTMLButtonElement | undefined;
  const pedir = (id: number) =>
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/notificaciones') && r.params.get('id_vivienda') === String(id));
  const marcar = (id: number) => http.expectOne((r) => r.method === 'PUT' && r.url.endsWith(`/api/notificaciones/${id}/leida`));

  async function abrir(viviendas: Vivienda[]) {
    await harness.navigateByUrl('/notificaciones');
    const v = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas'));
    await settle();
    expect(q('.skel')).not.toBeNull(); // cargando
    v.flush({ success: true, data: viviendas });
    await settle();
  }

  async function abrirConLista(lista: Notificacion[], viviendas: Vivienda[] = [casa()]) {
    await abrir(viviendas);
    const req = pedir(viviendas[0].id_vivienda);
    expect(req.request.headers.get('Authorization')).toMatch(/^Bearer /);
    req.flush({ success: true, data: lista });
    await settle();
  }

  it('render inicial: título, texto introductorio y enlace en el sidebar', async () => {
    await abrirConLista([notif()]);
    expect(q('h1')!.textContent).toContain('Notificaciones');
    expect(text()).toContain('Aquí encontrarás avisos importantes sobre el consumo de tu vivienda.');
    const link = [...root().querySelectorAll('a.nav__item')].find((a) => a.textContent!.includes('Notificaciones')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/notificaciones');
    expect(q('.crumbs')!.textContent).toContain('Notificaciones');
  });

  it('muestra loading mientras llegan las notificaciones', async () => {
    await abrir([casa()]);
    expect(q('[aria-busy="true"]')).not.toBeNull();
    pedir(1).flush({ success: true, data: [] });
    await settle();
    expect(q('[aria-busy="true"]')).toBeNull();
  });

  it('lista las notificaciones reales con título, mensaje, fecha y estado', async () => {
    await abrirConLista([
      notif(),
      notif({ id_notificacion: 11, nivel: 'ROJO', titulo: 'Superaste tu presupuesto', mensaje: 'Pasaste el 100 %.' }),
      notif({ id_notificacion: 12, nivel: 'VERDE', titulo: 'Todo bien', mensaje: 'Vas dentro del presupuesto.', leida: 1 }),
    ]);
    expect(items().length).toBe(3);
    expect(text()).toContain('Te acercas a tu límite');
    expect(text()).toContain('Llevas el 85 % de tu presupuesto.');
    expect(text()).toContain('Superaste tu presupuesto');
    expect(items()[0].classList).toContain('nt__item--warn');
    expect(items()[1].classList).toContain('nt__item--danger');
    expect(items()[2].classList).toContain('nt__item--ok');
    expect(items()[0].querySelector('time')!.textContent!.trim()).not.toBe('—');
    expect(text()).toContain('2 sin leer');
  });

  it('no muestra datos técnicos', async () => {
    await abrirConLista([notif()]);
    for (const interno of ['id_notificacion', 'id_vivienda', 'enviada_en', 'AMARILLO']) expect(text()).not.toContain(interno);
  });

  it('no leída se distingue de leída: solo la no leída tiene botón', async () => {
    await abrirConLista([notif(), notif({ id_notificacion: 12, leida: 1 })]);
    expect(items()[0].classList).toContain('nt__item--unread');
    expect(items()[0].querySelector('button')).not.toBeNull();
    expect(items()[1].classList).not.toContain('nt__item--unread');
    expect(items()[1].querySelector('button')).toBeNull();
    expect(items()[1].textContent).toContain('Leída');
  });

  it('estado vacío: mensaje amigable sin error', async () => {
    await abrirConLista([]);
    expect(text()).toContain('No tienes notificaciones pendientes.');
    expect(q('[role="alert"]')).toBeNull();
  });

  it('sin viviendas: pide seleccionar o registrar una', async () => {
    await abrir([]);
    expect(text()).toContain('Primero selecciona o registra una vivienda');
    expect(q<HTMLAnchorElement>('.state a.btn')!.getAttribute('href')).toBe('/vivienda');
  });

  it('error de API: mensaje amigable sin detalles técnicos y Reintentar', async () => {
    const consola = spyOn(console, 'error');
    await abrir([casa()]);
    pedir(1).flush({ success: false, message: 'ER_BAD_FIELD_ERROR SQLSTATE' }, { status: 500, statusText: 'x' });
    await settle();
    expect(text()).toContain('No pudimos cargar tus notificaciones');
    expect(text()).not.toContain('ER_BAD_FIELD_ERROR');
    expect(consola).toHaveBeenCalled();

    button('Reintentar')!.click();
    await settle();
    pedir(1).flush({ success: true, data: [notif()] });
    await settle();
    expect(text()).toContain('Te acercas a tu límite');
  });

  it('403: mensaje de acceso no permitido', async () => {
    spyOn(console, 'error');
    await abrir([casa()]);
    pedir(1).flush({ success: false, message: 'x' }, { status: 403, statusText: 'Forbidden' });
    await settle();
    expect(text()).toContain('No tienes permiso para ver estas notificaciones.');
  });

  it('404 al listar: vuelve a pedir las viviendas', async () => {
    await abrir([casa()]);
    pedir(1).flush({ success: false, message: 'no existe' }, { status: 404, statusText: 'Not Found' });
    await settle();
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas')).flush({ success: true, data: [] });
    await settle();
    expect(text()).toContain('Primero selecciona o registra una vivienda');
  });

  it('usa la vivienda seleccionada guardada', async () => {
    localStorage.setItem('enerfacil.vivienda-seleccionada', '2');
    await abrir([casa(), casa({ id_vivienda: 2, nombre: 'Casa B' })]);
    pedir(2).flush({ success: true, data: [notif({ id_vivienda: 2, titulo: 'Aviso de B' })] });
    await settle();
    expect(text()).toContain('Aviso de B');
  });

  it('cambiar de vivienda limpia, muestra loading y no mezcla notificaciones', async () => {
    await abrirConLista([notif({ titulo: 'Aviso de A' })], [casa(), casa({ id_vivienda: 2, nombre: 'Casa B' })]);
    expect(text()).toContain('Aviso de A');

    button('Casa B')!.click();
    await settle();
    expect(q('.skel')).not.toBeNull();
    expect(text()).not.toContain('Aviso de A');
    pedir(2).flush({ success: true, data: [notif({ id_notificacion: 20, id_vivienda: 2, titulo: 'Aviso de B' })] });
    await settle();
    expect(text()).toContain('Aviso de B');
    expect(text()).not.toContain('Aviso de A');
    expect(items().length).toBe(1);
    expect(localStorage.getItem('enerfacil.vivienda-seleccionada')).toBe('2');
  });

  it('cambiar de vivienda cancela la petición anterior', async () => {
    await abrir([casa(), casa({ id_vivienda: 2, nombre: 'Casa B' })]);
    const lenta = pedir(1);
    button('Casa B')!.click();
    await settle();
    expect(lenta.cancelled).toBe(true);
    pedir(2).flush({ success: true, data: [] });
    await settle();
  });

  it('marcar como leída: hace PUT real y actualiza la tarjeta sin recargar ni duplicar', async () => {
    await abrirConLista([notif(), notif({ id_notificacion: 11, titulo: 'Otra' })]);
    button('Marcar como leída')!.click();
    await settle();
    const req = marcar(10);
    expect(req.request.headers.get('Authorization')).toMatch(/^Bearer /);
    expect(button('Marcando')!.disabled).toBeTrue();
    req.flush({ success: true, data: notif({ leida: 1 }) });
    await settle();

    expect(items().length).toBe(2);
    expect(items()[0].classList).not.toContain('nt__item--unread');
    expect(items()[0].querySelector('button')).toBeNull();
    expect(items()[1].classList).toContain('nt__item--unread');
    expect(text()).toContain('1 sin leer');
  });

  it('error al marcar como leída: sigue sin leer y muestra un aviso comprensible', async () => {
    spyOn(console, 'error');
    await abrirConLista([notif()]);
    button('Marcar como leída')!.click();
    await settle();
    marcar(10).flush({ success: false, message: 'ECONNREFUSED' }, { status: 500, statusText: 'x' });
    await settle();

    expect(items()[0].classList).toContain('nt__item--unread');
    expect(button('Marcar como leída')!.disabled).toBeFalse();
    expect(text()).toContain('No pudimos marcar la notificación como leída');
    expect(text()).not.toContain('ECONNREFUSED');
  });

  it('404 al marcar como leída: mensaje apropiado y se mantiene sin leer', async () => {
    spyOn(console, 'error');
    await abrirConLista([notif()]);
    button('Marcar como leída')!.click();
    await settle();
    marcar(10).flush({ success: false, message: 'x' }, { status: 404, statusText: 'Not Found' });
    await settle();
    expect(text()).toContain('No encontramos esa notificación');
    expect(items()[0].classList).toContain('nt__item--unread');
  });
});
