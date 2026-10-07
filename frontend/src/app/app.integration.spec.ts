import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';

function fakeJwt(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ id: 2, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

// Respuestas de prueba (solo en este spec): la app real usa únicamente la API.
const VIVIENDA = {
  id_vivienda: 1, id_usuario: 2, id_tarifa: 2, nombre: 'Casa A', direccion: null, region: null,
  num_habitantes: null, dia_corte: 1, creado_en: '2026-10-06T12:00:00.000Z',
};
const DASHBOARD = {
  vivienda: { id_vivienda: 1, nombre: 'Casa A' },
  resumen: {
    id_vivienda: 1, fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', dias_totales: 31, dias_transcurridos: 6,
    dias_restantes: 25, fuente: 'LECTURAS', kwh_acumulado: 48.5, kwh_proyectado: 250.2, monto_acumulado: 23,
    monto_proyectado: 120, moneda: 'USD', tarifa: { id_tarifa: 2, nombre: 'Tarifa de prueba' },
  },
  presupuesto: { id_presupuesto: 7, monto_mensual: 150, monto_proyectado: 120, porcentaje_proyectado: 80, porcentaje_utilizado: 15.33, nivel: 'VERDE', motivo: null },
  origen_desglose: 'REGISTROS_USO',
  consumo_por_electrodomestico: [
    { id_electrodomestico: 10, nombre: 'Nevera de prueba', ambiente: 'Cocina', kwh: 30.5, porcentaje: 62.9 },
    { id_electrodomestico: 11, nombre: 'Lavadora de prueba', ambiente: null, kwh: 18, porcentaje: 37.1 },
  ],
  comparacion: { kwh_anterior: null, diferencia_pct: null, tendencia: null },
  alertas: { nivel: 'VERDE', motivo: null, porcentaje_proyectado: 80 },
};

describe('Flujo completo login → /inicio → logout', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
  });

  async function doLogin(harness: RouterTestingHarness) {
    const http = TestBed.inject(HttpTestingController);
    await harness.navigateByUrl('/login');
    const el = harness.routeNativeElement as HTMLElement;
    const set = (sel: string, v: string) => {
      const i = el.querySelector(sel) as HTMLInputElement;
      i.value = v;
      i.dispatchEvent(new Event('input'));
    };
    set('input[type=email]', 'prueba@example.com');
    set('input[type=password]', 'secreto123');
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = http.expectOne((r) => r.url.endsWith('/auth/login'));
    req.flush({
      success: true,
      data: { usuario: { id_usuario: 2, nombre: 'María López', email: 'prueba@example.com' }, token: fakeJwt() },
      message: 'ok',
    });
    await harness.fixture.whenStable();
    return http;
  }

  function dump(harness: RouterTestingHarness) {
    const el = harness.routeNativeElement as HTMLElement;
    return {
      url: TestBed.inject(Router).url,
      text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      stat: el.querySelectorAll('app-stat-card').length,
      svgPaths: el.querySelectorAll('svg path').length,
      navItems: el.querySelectorAll('.nav__item').length,
      crumb: el.querySelector('.crumbs')?.textContent?.replace(/\s+/g, ' ').trim(),
    };
  }

  /** Responde las dos peticiones que dispara /inicio: viviendas y dashboard de la vivienda seleccionada. */
  async function cargarDashboard(harness: RouterTestingHarness) {
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas')).flush({ success: true, data: [VIVIENDA] });
    await harness.fixture.whenStable();
    http
      .expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/dashboard') && r.params.get('id_vivienda') === '1')
      .flush({ success: true, data: DASHBOARD });
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  }

  /** Comprueba que TODOS los bloques del dashboard y del layout están renderizados con contenido. */
  function expectFullDashboard(harness: RouterTestingHarness) {
    const el = harness.routeNativeElement as HTMLElement;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ');
    expect(TestBed.inject(Router).url).toBe('/inicio');
    // layout + sidebar
    expect(el.querySelectorAll('.nav__item').length).toBe(9);
    expect(el.querySelector('.crumbs')?.textContent).toContain('Inicio');
    expect(text).toContain('María López');
    expect(el.querySelector('.user__avatar')?.textContent?.trim()).toBe('ML');
    // dashboard (datos reales de la API)
    expect(el.querySelectorAll('app-stat-card').length).toBe(3);
    expect(el.querySelectorAll('app-budget-summary .budget__grid > div').length).toBe(3);
    expect(el.querySelectorAll('app-alerts-summary .alert').length).toBe(1);
    expect(el.querySelectorAll('app-energy-breakdown .row').length).toBe(2);
    expect(text).toContain('Casa A');
    expect(text).toContain('48,5');
    expect(text).toContain('Nevera de prueba');
    expect(text).toContain('Vas bien con tu presupuesto');
    expect(el.querySelector('.top__pill')).toBeNull();
    // los iconos tienen paths dentro (antes quedaban vacíos)
    const icons = Array.from(el.querySelectorAll('app-icon'));
    expect(icons.length).toBeGreaterThan(10);
    expect(icons.every((i) => i.querySelectorAll('path').length > 0)).toBe(true);
  }

  it('login → /inicio → logout → /login → login → /inicio, sin errores y con todo renderizado', async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a));

    const harness = await RouterTestingHarness.create();
    await doLogin(harness);
    await cargarDashboard(harness);
    expectFullDashboard(harness);

    // Logout
    ((harness.routeNativeElement as HTMLElement).querySelector('.user__logout') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(localStorage.getItem('enerfacil.token')).toBeNull();
    expect((harness.routeNativeElement as HTMLElement).querySelector('form')).not.toBeNull();

    // Login de nuevo
    await doLogin(harness);
    await cargarDashboard(harness);
    expectFullDashboard(harness);

    spy.mockRestore();
    expect(errors).toEqual([]);
  });

  it('con sesión guardada (recarga de página) /inicio carga completo', async () => {
    localStorage.setItem('enerfacil.token', fakeJwt());
    localStorage.setItem('enerfacil.user', JSON.stringify({ id_usuario: 2, nombre: 'María López', email: 'p@example.com' }));
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/inicio');
    await harness.fixture.whenStable();
    await cargarDashboard(harness);
    expectFullDashboard(harness);
  });

  it('sin sesión, /inicio redirige a /login (authGuard intacto)', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/inicio');
    expect(TestBed.inject(Router).url).toBe('/login');
  });
});
