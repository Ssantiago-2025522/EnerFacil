import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { DashboardData } from '../../../core/models/dashboard.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { ViviendaSeleccionService } from '../../../core/services/vivienda-seleccion.service';

function fakeJwt(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ id: 2, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

// Datos de prueba: viven solo en este spec. La aplicación real usa únicamente la API.
const casa = (over: Partial<Vivienda> = {}): Vivienda => ({
  id_vivienda: 1, id_usuario: 2, id_tarifa: 2, nombre: 'Casa A', direccion: null, region: null,
  num_habitantes: null, dia_corte: 1, creado_en: '2026-10-06T12:00:00.000Z', ...over,
});

const dash = (id = 1, nombre = 'Casa A', over: Partial<DashboardData> = {}): DashboardData => ({
  vivienda: { id_vivienda: id, nombre },
  resumen: {
    id_vivienda: id, fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', dias_totales: 31, dias_transcurridos: 6,
    dias_restantes: 25, fuente: 'LECTURAS', kwh_acumulado: 48.5, kwh_proyectado: 250.2, monto_acumulado: 23,
    monto_proyectado: 120, moneda: 'USD', tarifa: { id_tarifa: 2, nombre: 'Tarifa de prueba' },
  },
  presupuesto: {
    id_presupuesto: 7, monto_mensual: 150, monto_proyectado: 120, porcentaje_proyectado: 80,
    porcentaje_utilizado: 15.33, nivel: 'VERDE', motivo: null,
  },
  origen_desglose: 'REGISTROS_USO',
  consumo_por_electrodomestico: [
    { id_electrodomestico: 10, nombre: 'Nevera de prueba', ambiente: 'Cocina', kwh: 30.5, porcentaje: 62.9 },
    { id_electrodomestico: 11, nombre: 'Lavadora de prueba', ambiente: null, kwh: 18, porcentaje: 37.1 },
  ],
  comparacion: { kwh_anterior: null, diferencia_pct: null, tendencia: null },
  alertas: { nivel: 'VERDE', motivo: null, porcentaje_proyectado: 80 },
  ...over,
});

const SIN_DATOS = (id = 1): DashboardData =>
  dash(id, 'Casa A', {
    resumen: {
      id_vivienda: id, fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', dias_totales: 31, dias_transcurridos: 6,
      dias_restantes: 25, fuente: 'SIN_DATOS', kwh_acumulado: 0, kwh_proyectado: 0, monto_acumulado: null,
      monto_proyectado: null, moneda: null, tarifa: null,
    },
    presupuesto: null,
    origen_desglose: null,
    consumo_por_electrodomestico: [],
    alertas: { nivel: null, motivo: 'SIN_DATOS', porcentaje_proyectado: null },
  });

/** Valor (<dd>) de una fila del resumen del presupuesto, localizada por su etiqueta (<dt>). */
const valorDe = (root: HTMLElement, etiqueta: string) =>
  [...root.querySelectorAll('.budget__grid > div')]
    .find((d) => d.querySelector('dt')?.textContent?.trim() === etiqueta)
    ?.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim();

describe('Dashboard', () => {
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
  const pedirDashboard = (id: number) =>
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/dashboard') && r.params.get('id_vivienda') === String(id));

  async function responder(id: number, data: DashboardData) {
    pedirDashboard(id).flush({ success: true, data });
    await settle();
  }

  /** Abre /inicio y responde la lista de viviendas. Con `datos` también responde el dashboard de la primera. */
  async function abrir(viviendas: Vivienda[], datos?: DashboardData) {
    await harness.navigateByUrl('/inicio');
    const v = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas'));
    expect(v.request.headers.get('Authorization')).toMatch(/^Bearer /);
    await settle();
    v.flush({ success: true, data: viviendas });
    await settle();
    if (datos && viviendas.length > 0) await responder(viviendas[0].id_vivienda, datos);
  }

  it('render inicial: esqueleto mientras llegan las viviendas, título y sin etiqueta «Datos ilustrativos»', async () => {
    await harness.navigateByUrl('/inicio');
    const v = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas'));
    await settle();
    expect(q('.skel[aria-busy="true"]')).not.toBeNull();
    expect(q('.crumbs')!.textContent).toContain('Inicio');
    expect(q('.top__pill')).toBeNull();
    v.flush({ success: true, data: [casa()] });
    await settle();
    pedirDashboard(1).flush({ success: true, data: dash() });
    await settle();
    expect(text()).toContain('Tu energía, más clara.');
  });

  it('loading: muestra el esqueleto hasta que responde el dashboard', async () => {
    await abrir([casa()]);
    const req = pedirDashboard(1);
    expect(q('.skel[aria-busy="true"]')).not.toBeNull();
    expect(root().querySelectorAll('app-stat-card').length).toBe(0);
    req.flush({ success: true, data: dash() });
    await settle();
    expect(q('.skel')).toBeNull();
    expect(root().querySelectorAll('app-stat-card').length).toBe(3);
  });

  it('vivienda seleccionada: muestra su nombre y el ciclo real', async () => {
    await abrir([casa()], dash());
    expect(q('.dash__home')!.textContent).toContain('Casa A');
    expect(text()).toContain('Día 6 de 31');
  });

  it('consumo: muestra los kWh y montos que entrega el backend', async () => {
    await abrir([casa()], dash());
    expect(text()).toContain('48,5');
    expect(text()).toContain('250,2');
    expect(text()).toContain('Acumulado hasta hoy: 23,00');
    expect(text()).toContain('120,00');
    expect(text()).toContain('Tarifa: Tarifa de prueba');
  });

  it('comparación: solo aparece si el backend pudo comparar con el ciclo anterior', async () => {
    await abrir([casa()], dash(1, 'Casa A', { comparacion: { kwh_anterior: 300, diferencia_pct: -10, tendencia: 'BAJA' } }));
    expect(text()).toContain('10,0 % menos que el ciclo anterior (300,0 kWh)');
  });

  it('sin comparación del backend no se inventa ninguna tendencia', async () => {
    await abrir([casa()], dash());
    expect(text()).not.toContain('ciclo anterior');
  });

  it('presupuesto: muestra monto, utilizado, disponible y proyectado del backend', async () => {
    await abrir([casa()], dash());
    expect(text()).toContain('Presupuesto mensual: 150,00');
    expect(text()).toContain('15,3 %');
    expect(valorDe(root(), 'Acumulado')).toContain('23,00');
    expect(valorDe(root(), 'Disponible')).toContain('127,00');
    expect(valorDe(root(), 'Proyectado al cierre')).toBe('80,0 %');
  });

  it('sin presupuesto: mensaje apropiado y sin presupuesto ficticio', async () => {
    await abrir([casa()], dash(1, 'Casa A', {
      presupuesto: null,
      alertas: { nivel: null, motivo: 'SIN_PRESUPUESTO', porcentaje_proyectado: null },
    }));
    expect(text()).toContain('No tienes un presupuesto configurado.');
    expect(text()).not.toContain('Presupuesto mensual');
    expect(q('app-budget-summary a[href="/presupuesto"].btn')).not.toBeNull();
  });

  const NIVELES = [
    { nivel: 'VERDE', clase: 'alert--success', titulo: 'Vas bien con tu presupuesto' },
    { nivel: 'AMARILLO', clase: 'alert--warning', titulo: 'Te estás acercando al límite' },
    { nivel: 'ROJO', clase: 'alert--danger', titulo: 'Vas a superar tu presupuesto' },
  ] as const;
  for (const c of NIVELES) {
    it(`estado de Alertas ${c.nivel}: muestra el nivel que decide el backend`, async () => {
      await abrir([casa()], dash(1, 'Casa A', { alertas: { nivel: c.nivel, motivo: null, porcentaje_proyectado: 91.5 } }));
      expect(q(`app-alerts-summary .${c.clase}`)).not.toBeNull();
      expect(text()).toContain(c.titulo);
      expect(text()).toContain('91,5 %');
    });
  }

  it('el nivel viene del backend: no se recalcula con reglas propias', async () => {
    // 180 % de proyección pero el backend dice VERDE: el Dashboard muestra VERDE.
    await abrir([casa()], dash(1, 'Casa A', { alertas: { nivel: 'VERDE', motivo: null, porcentaje_proyectado: 180 } }));
    expect(q('app-alerts-summary .alert--success')).not.toBeNull();
    expect(q('app-alerts-summary .alert--danger')).toBeNull();
  });

  it('sin tarifa: no hay monto estimado y lo dice', async () => {
    await abrir([casa({ id_tarifa: null })], dash(1, 'Casa A', {
      resumen: { ...dash().resumen, monto_acumulado: null, monto_proyectado: null, moneda: null, tarifa: null },
      alertas: { nivel: null, motivo: 'SIN_TARIFA', porcentaje_proyectado: null },
    }));
    expect(text()).toContain('Sin tarifa asignada');
    expect(text()).toContain('no podemos evaluar tu presupuesto');
  });

  it('electrodomésticos: nombre, ambiente, kWh y porcentaje del backend', async () => {
    await abrir([casa()], dash());
    const filas = root().querySelectorAll('app-energy-breakdown .row');
    expect(filas.length).toBe(2);
    expect(text()).toContain('Nevera de prueba');
    expect(text()).toContain('30,5 kWh · 62,9 %');
    expect(text()).toContain('Cocina');
    expect(text()).toContain('Sin ambiente');
    expect(text()).toContain('Consumo registrado en este ciclo');
  });

  it('sin datos: «No hay datos disponibles.» y no se trata como error', async () => {
    await abrir([casa()], SIN_DATOS());
    expect(text()).toContain('No hay datos disponibles.');
    expect(root().querySelectorAll('app-stat-card').length).toBe(0);
    expect(q('.state--error')).toBeNull();
    expect(button('Reintentar')).toBeUndefined();
  });

  it('error de API: mensaje comprensible, error técnico solo en consola y botón Reintentar', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await abrir([casa()]);
    pedirDashboard(1).flush({ success: false, message: 'boom interno' }, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(q('.state--error')).not.toBeNull();
    expect(text()).toContain('No pudimos cargar tu información');
    expect(text()).not.toContain('boom interno');
    expect(text()).not.toContain('HttpErrorResponse');
    expect(button('Reintentar')).toBeDefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reintentar: vuelve a pedir los datos de la vivienda y los muestra', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await abrir([casa()]);
    pedirDashboard(1).flush({ success: false, message: 'x' }, { status: 500, statusText: 'Server Error' });
    await settle();
    button('Reintentar')!.click();
    await settle();
    expect(q('.skel')).not.toBeNull();
    await responder(1, dash());
    expect(q('.state--error')).toBeNull();
    expect(text()).toContain('48,5');
    spy.mockRestore();
  });

  it('sin vivienda: pide seleccionar una y no consulta el dashboard', async () => {
    await abrir([]);
    expect(text()).toContain('Selecciona una vivienda para ver su información.');
    expect(q<HTMLAnchorElement>('.state a.btn')!.getAttribute('href')).toBe('/vivienda');
  });

  it('cambio de vivienda: limpia lo anterior, pide la nueva y no mezcla datos', async () => {
    await abrir([casa(), casa({ id_vivienda: 5, nombre: 'Casa B' })], dash());
    expect(text()).toContain('48,5');
    expect(text()).toContain('Nevera de prueba');

    button('Casa B')!.click();
    await settle();
    // Mientras carga la nueva no queda nada de la anterior.
    expect(q('.skel')).not.toBeNull();
    expect(text()).not.toContain('48,5');
    expect(text()).not.toContain('Nevera de prueba');
    expect(TestBed.inject(ViviendaSeleccionService).id()).toBe(5);

    await responder(5, dash(5, 'Casa B', {
      resumen: { ...dash().resumen, id_vivienda: 5, kwh_acumulado: 99.9 },
      consumo_por_electrodomestico: [{ id_electrodomestico: 40, nombre: 'Horno de prueba', ambiente: 'Cocina', kwh: 12, porcentaje: 100 }],
    }));
    expect(text()).toContain('99,9');
    expect(text()).toContain('Horno de prueba');
    expect(text()).not.toContain('48,5');
    expect(text()).not.toContain('Nevera de prueba');
    expect(q('.tab--active')!.textContent).toContain('Casa B');
  });

  it('cambio de vivienda con una petición en curso: se cancela la anterior', async () => {
    await abrir([casa(), casa({ id_vivienda: 5, nombre: 'Casa B' })]);
    const anterior = pedirDashboard(1);
    button('Casa B')!.click();
    await settle();
    expect(anterior.cancelled).toBe(true);
    await responder(5, dash(5, 'Casa B', { resumen: { ...dash().resumen, id_vivienda: 5, kwh_acumulado: 77.7 } }));
    expect(text()).toContain('77,7');
    expect(text()).not.toContain('48,5');
  });

  it('no queda ningún dato de ejemplo en pantalla', async () => {
    await abrir([casa()], dash());
    for (const mock of ['ilustrativa', 'ejemplo', 'Distribuidora de', 'septiembre', 'Madrid', 'Frigorífico', 'Dale una pausa']) {
      expect(text()).not.toContain(mock);
    }
    expect(q('.top__pill')).toBeNull();
  });
});
