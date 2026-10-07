import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../../app.routes';
import { authInterceptor } from '../../../core/interceptors/auth.interceptor';
import { Proyeccion } from '../../../core/models/consumo.models';
import { EstadoPresupuesto, Presupuesto } from '../../../core/models/presupuesto.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { montoPresupuestoValidator } from '../../../core/validators/presupuesto.validators';

function fakeJwt(): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64({ id: 2, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

const casa = (over: Partial<Vivienda> = {}): Vivienda => ({
  id_vivienda: 1, id_usuario: 2, id_tarifa: 2, nombre: 'Casa A', direccion: null, region: null,
  num_habitantes: null, dia_corte: 1, creado_en: '2026-10-06T12:00:00.000Z', ...over,
});
const presu = (over: Partial<Presupuesto> = {}): Presupuesto => ({
  id_presupuesto: 7, id_vivienda: 1, monto_mensual: 50, vigente_desde: '2026-01-01', vigente_hasta: null,
  creado_en: '2026-01-01T00:00:00.000Z', vigente: true, ...over,
});
const estado = (over: Partial<EstadoPresupuesto> = {}): EstadoPresupuesto => ({
  id_vivienda: 1, fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', fuente: 'LECTURAS',
  monto_acumulado: 23, monto_proyectado: 30, presupuesto: { id_presupuesto: 7, monto_mensual: 50 },
  porcentaje_proyectado: 60, umbrales: { proximo: 80, superado: 100 }, nivel: 'VERDE', motivo: null, ...over,
});
const proy = (over: Partial<Proyeccion> = {}): Proyeccion => ({
  id_vivienda: 1, tipo: 'MENSUAL', fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31', fecha_referencia: '2026-10-06',
  dias_totales: 31, dias_transcurridos: 6, dias_restantes: 25, fuente: 'LECTURAS', kwh_acumulado: 30.5,
  promedio_diario_kwh: 5.083, kwh_proyectado: 157.58, tarifa: { id_tarifa: 2, nombre: 'Residencial', moneda: 'USD' },
  kw_contratados: 0, monto_acumulado: 23, monto_proyectado: 30,
  fuentes: { lecturas: null, registros_uso: null, estimacion: null },
  ...over,
});

interface Datos {
  lista?: Presupuesto[];
  estado?: EstadoPresupuesto;
  proy?: Proyeccion;
}

describe('Módulo Presupuesto', () => {
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
    q<HTMLFormElement>('app-presupuesto-form-dialog form')!.dispatchEvent(new Event('submit'));
    await settle();
  };
  const dialogError = () => q('app-presupuesto-form-dialog .field__error')?.textContent?.trim() ?? null;
  const porVivienda = (suffix: string, id: number) =>
    http.expectOne((r) => r.method === 'GET' && r.url.endsWith(suffix) && r.params.get('id_vivienda') === String(id));

  /** Responde las tres peticiones de datos de una vivienda. */
  async function responderDatos(id: number, d: Datos, errorEstado = false) {
    const l = porVivienda('/api/presupuesto', id);
    const e = porVivienda('/api/alertas/estado', id);
    const p = porVivienda('/api/consumo/proyeccion', id);
    l.flush({ success: true, data: d.lista ?? [presu({ id_vivienda: id })] });
    p.flush({ success: true, data: d.proy ?? proy({ id_vivienda: id }) });
    if (errorEstado) e.flush({ success: false, message: 'boom SQL' }, { status: 500, statusText: 'x' });
    else e.flush({ success: true, data: d.estado ?? estado({ id_vivienda: id }) });
    await settle();
  }

  async function abrir(viviendas: Vivienda[], datos: Datos = {}) {
    await harness.navigateByUrl('/presupuesto');
    const v = http.expectOne((r) => r.method === 'GET' && r.url.endsWith('/api/viviendas'));
    expect(v.request.headers.get('Authorization')).toMatch(/^Bearer /);
    await settle();
    expect(q('.skel')).not.toBeNull();
    v.flush({ success: true, data: viviendas });
    await settle();
    if (viviendas.length > 0) await responderDatos(viviendas[0].id_vivienda, datos);
  }

  it('sidebar enlaza «Presupuesto» y el breadcrumb muestra el título', async () => {
    await abrir([casa()]);
    const link = [...root().querySelectorAll('a.nav__item')].find((a) => a.textContent!.includes('Presupuesto')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/presupuesto');
    expect(q('.crumbs')!.textContent).toContain('Presupuesto');
    expect(q('.top__pill')).toBeNull();
  });

  it('sin viviendas: pide crear una primero y enlaza a /vivienda', async () => {
    await abrir([]);
    expect(text()).toContain('Primero registra una vivienda');
    expect(q<HTMLAnchorElement>('.state a.btn')!.getAttribute('href')).toBe('/vivienda');
  });

  it('sin presupuesto: estado vacío claro con botón «Configurar presupuesto»', async () => {
    await abrir([casa()], { lista: [], estado: estado({ presupuesto: null, nivel: null, motivo: 'SIN_PRESUPUESTO', porcentaje_proyectado: null }) });
    expect(text()).toContain('Todavía no tienes un presupuesto configurado para esta vivienda.');
    expect(button('Configurar presupuesto')).toBeDefined();
    expect(text()).not.toContain('Disponible');
    expect(button('Editar presupuesto')).toBeUndefined();
  });

  it('dentro del presupuesto: muestra presupuesto, gastado, disponible, % y proyección del backend', async () => {
    await abrir([casa()]);
    expect(text()).toContain('Dentro de tu presupuesto');
    expect(text()).toContain('50,00');
    expect(text()).toContain('23,00');
    expect(text()).toContain('27,00'); // disponible = 50 − 23
    expect(text()).toContain('46,0 %'); // 23 / 50
    expect(text()).toContain('30,00'); // proyección
    expect(text()).toContain('60,0 % del presupuesto');
    expect(text()).toContain('no son una factura real');
    expect(text()).toContain('mensual');
    expect(button('Editar presupuesto')).toBeDefined();
  });

  it('cerca del límite: respeta los umbrales que entrega el backend', async () => {
    await abrir([casa()], {
      estado: estado({ nivel: 'AMARILLO', porcentaje_proyectado: 86, monto_proyectado: 43, umbrales: { proximo: 75, superado: 100 } }),
    });
    expect(text()).toContain('Cerca del límite');
    expect(text()).toContain('86,0 %');
    expect(text()).toContain('aviso desde 75 %');
  });

  it('proyección en rojo: avisa que la proyección supera el límite aunque aún no se haya gastado todo', async () => {
    await abrir([casa()], { estado: estado({ nivel: 'ROJO', porcentaje_proyectado: 120, monto_proyectado: 60 }) });
    expect(text()).toContain('La proyección supera tu límite');
    expect(text()).not.toContain('Ya superaste');
    expect(text()).toContain('Disponible');
  });

  it('presupuesto excedido: el gasto ya supera el presupuesto', async () => {
    await abrir([casa()], { estado: estado({ monto_acumulado: 61, monto_proyectado: 90, nivel: 'ROJO', porcentaje_proyectado: 180 }) });
    expect(text()).toContain('Ya superaste tu presupuesto');
    expect(text()).toContain('Excedido por');
    expect(text()).toContain('11,00'); // 61 − 50
    expect(text()).not.toContain('Disponible');
    expect(q('.pr__banner--danger')).not.toBeNull();
  });

  it('sin tarifa: no inventa montos y enlaza a /vivienda', async () => {
    await abrir([casa()], {
      estado: estado({ monto_acumulado: null, monto_proyectado: null, nivel: null, motivo: 'SIN_TARIFA', porcentaje_proyectado: null }),
      proy: proy({ tarifa: null, monto_acumulado: null, monto_proyectado: null }),
    });
    expect(text()).toContain('no tiene una tarifa asignada');
    expect(q<HTMLAnchorElement>('.pr__banner a')!.getAttribute('href')).toBe('/vivienda');
    expect(text()).toContain('50,00'); // el presupuesto sí se muestra, sin moneda
    expect(text()).toContain('—');
    expect(q('[role=progressbar]')).toBeNull();
  });

  it('sin consumo registrado: explica que falta información y enlaza a /consumo', async () => {
    await abrir([casa()], {
      estado: estado({ fuente: 'SIN_DATOS', monto_acumulado: 0, monto_proyectado: 0, nivel: null, motivo: 'SIN_DATOS', porcentaje_proyectado: null }),
      proy: proy({ fuente: 'SIN_DATOS' }),
    });
    expect(text()).toContain('Aún no hay consumo para evaluar');
    expect(q<HTMLAnchorElement>('.pr__banner a')!.getAttribute('href')).toBe('/consumo');
  });

  it('lista otros presupuestos: programado y finalizado', async () => {
    await abrir([casa()], {
      lista: [
        presu(),
        presu({ id_presupuesto: 8, monto_mensual: 70, vigente_desde: '2027-01-01', vigente: false }),
        presu({ id_presupuesto: 3, monto_mensual: 35, vigente_desde: '2025-01-01', vigente_hasta: '2025-12-31', vigente: false }),
      ],
    });
    expect(text()).toContain('Otros presupuestos de esta vivienda');
    expect(text()).toContain('Programado');
    expect(text()).toContain('Finalizado');
    expect(text()).toContain('sin fecha de fin');
  });

  it('error al cargar: mensaje amigable y Reintentar', async () => {
    await harness.navigateByUrl('/presupuesto');
    http.expectOne((r) => r.url.endsWith('/api/viviendas')).flush({ success: true, data: [casa()] });
    await settle();
    await responderDatos(1, {}, true);
    expect(text()).toContain('No pudimos cargar tu presupuesto');
    expect(text()).not.toContain('boom SQL');
    button('Reintentar')!.click();
    await settle();
    await responderDatos(1, {});
    expect(text()).toContain('Dentro de tu presupuesto');
  });

  it('cambiar de vivienda recarga los datos y no mezcla viviendas', async () => {
    const a = casa();
    const b = casa({ id_vivienda: 2, nombre: 'Casa B' });
    await abrir([a, b]);
    expect(text()).toContain('27,00');

    button('Casa B')!.click();
    await settle();
    // mientras llegan los datos de B no queda ninguna cifra de A
    expect(q('.skel')).not.toBeNull();
    expect(text()).not.toContain('27,00');
    await responderDatos(2, {
      lista: [presu({ id_presupuesto: 9, id_vivienda: 2, monto_mensual: 80 })],
      estado: estado({ id_vivienda: 2, presupuesto: { id_presupuesto: 9, monto_mensual: 80 }, monto_acumulado: 61, monto_proyectado: 70, porcentaje_proyectado: 87.5, nivel: 'AMARILLO' }),
      proy: proy({ id_vivienda: 2 }),
    });
    expect(text()).toContain('80,00');
    expect(text()).toContain('61,00');
    expect(text()).toContain('19,00'); // 80 − 61
    expect(text()).not.toContain('27,00');
    expect(localStorage.getItem('enerfacil.vivienda-seleccionada')).toBe('2');
  });

  describe('configuración', () => {
    it('crear: envía solo id_vivienda y monto_mensual (nunca id_usuario) y refresca', async () => {
      await abrir([casa()], { lista: [], estado: estado({ presupuesto: null, nivel: null, motivo: 'SIN_PRESUPUESTO', porcentaje_proyectado: null }) });
      button('Configurar presupuesto')!.click();
      await settle();
      expect(q('app-presupuesto-form-dialog')).not.toBeNull();
      type('#pf-monto', '45.5');
      await submit();

      const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/presupuesto'));
      expect(req.request.body).toEqual({ id_vivienda: 1, monto_mensual: 45.5 });
      expect(req.request.headers.get('Authorization')).toMatch(/^Bearer /);
      req.flush({ success: true, data: presu({ monto_mensual: 45.5 }) }, { status: 201, statusText: 'Created' });
      await settle();
      expect(q('app-presupuesto-form-dialog')).toBeNull();
      expect(text()).toContain('Presupuesto configurado.');
      await responderDatos(1, { lista: [presu({ monto_mensual: 45.5 })], estado: estado({ presupuesto: { id_presupuesto: 7, monto_mensual: 45.5 } }) });
      expect(text()).toContain('45,50');
    });

    it('editar: PUT /api/presupuesto/:id solo con monto_mensual', async () => {
      await abrir([casa()]);
      button('Editar presupuesto')!.click();
      await settle();
      expect(q<HTMLInputElement>('#pf-monto')!.value).toBe('50');
      type('#pf-monto', '60');
      await submit();

      const req = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/api/presupuesto/7'));
      expect(req.request.body).toEqual({ monto_mensual: 60 });
      req.flush({ success: true, data: presu({ monto_mensual: 60 }) });
      await settle();
      expect(text()).toContain('Presupuesto actualizado.');
      await responderDatos(1, { lista: [presu({ monto_mensual: 60 })] });
    });

    it('valida el monto en el formulario y no llama al backend si es inválido', async () => {
      await abrir([casa()], { lista: [], estado: estado({ presupuesto: null, nivel: null, motivo: 'SIN_PRESUPUESTO', porcentaje_proyectado: null }) });
      button('Configurar presupuesto')!.click();
      await settle();

      await submit();
      expect(dialogError()).toBe('El monto del presupuesto es obligatorio');
      type('#pf-monto', '0');
      await submit();
      expect(dialogError()).toBe('El monto debe ser mayor que 0');
      type('#pf-monto', '-5');
      await submit();
      expect(dialogError()).toBe('No se permiten números negativos');
      type('#pf-monto', '10.123');
      await submit();
      expect(dialogError()).toBe('Usa como máximo 2 decimales');
      // http.verify() (afterEach) falla si se hubiera enviado alguna petición
    });

    it('muestra el error de validación del backend sobre el campo', async () => {
      await abrir([casa()], { lista: [], estado: estado({ presupuesto: null, nivel: null, motivo: 'SIN_PRESUPUESTO', porcentaje_proyectado: null }) });
      button('Configurar presupuesto')!.click();
      await settle();
      type('#pf-monto', '20');
      await submit();
      http
        .expectOne((r) => r.method === 'POST' && r.url.endsWith('/api/presupuesto'))
        .flush({ success: false, message: 'Datos inválidos', errors: [{ campo: 'monto_mensual', mensaje: 'El monto debe ser mayor que 0' }] }, { status: 400, statusText: 'Bad Request' });
      await settle();
      expect(dialogError()).toBe('El monto debe ser mayor que 0');
      expect(q('app-presupuesto-form-dialog .alert')!.textContent).toContain('Revisa los datos ingresados.');
      expect(q('app-presupuesto-form-dialog')).not.toBeNull();
    });

    it('conflicto de vigencia (409): muestra el mensaje del backend y mantiene el diálogo', async () => {
      await abrir([casa()], { lista: [], estado: estado({ presupuesto: null, nivel: null, motivo: 'SIN_PRESUPUESTO', porcentaje_proyectado: null }) });
      button('Configurar presupuesto')!.click();
      await settle();
      type('#pf-monto', '20');
      await submit();
      http
        .expectOne((r) => r.method === 'POST')
        .flush({ success: false, message: 'El rango de vigencia se solapa con otro presupuesto de la vivienda' }, { status: 409, statusText: 'Conflict' });
      await settle();
      expect(q('app-presupuesto-form-dialog .alert')!.textContent).toContain('se solapa');
      expect(q('app-presupuesto-form-dialog')).not.toBeNull();
    });
  });
});

describe('montoPresupuestoValidator', () => {
  const v = (value: unknown) => montoPresupuestoValidator({ value } as never);
  it('acepta montos positivos con hasta 2 decimales', () => {
    expect(v(40)).toBeNull();
    expect(v(0.01)).toBeNull();
    expect(v(19.99)).toBeNull();
    expect(v('45.5')).toBeNull();
  });
  it('rechaza vacío, no numérico, cero, negativo, exceso de decimales y valores enormes', () => {
    expect(v(null)).toEqual({ required: true });
    expect(v('abc')).toEqual({ number: true });
    expect(v(0)).toEqual({ min: true });
    expect(v(0.001)).toEqual({ min: true });
    expect(v(-1)).toEqual({ negative: true });
    expect(v(1.234)).toEqual({ decimals: true });
    expect(v(10_000_000_000)).toEqual({ max: true });
  });
});
