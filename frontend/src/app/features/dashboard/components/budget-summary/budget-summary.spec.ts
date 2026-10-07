import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardPresupuesto } from '../../../../core/models/dashboard.models';
import { BudgetSummary } from './budget-summary';

const presupuesto = (over: Partial<DashboardPresupuesto> = {}): DashboardPresupuesto => ({
  id_presupuesto: 1, monto_mensual: 200, monto_proyectado: 160, porcentaje_proyectado: 80,
  porcentaje_utilizado: 25, nivel: 'VERDE', motivo: null, ...over,
});

function render(p: DashboardPresupuesto | null, acumulado: number | null = 50, moneda: string | null = 'USD') {
  const fixture = TestBed.createComponent(BudgetSummary);
  fixture.componentRef.setInput('presupuesto', p);
  fixture.componentRef.setInput('acumulado', acumulado);
  fixture.componentRef.setInput('moneda', moneda);
  return fixture;
}
/** Valor (<dd>) de una fila del resumen del presupuesto, localizada por su etiqueta (<dt>). */
const valorDe = (root: HTMLElement, etiqueta: string) =>
  [...root.querySelectorAll('.budget__grid > div')]
    .find((d) => d.querySelector('dt')?.textContent?.trim() === etiqueta)
    ?.querySelector('dd')?.textContent?.replace(/\s+/g, ' ').trim();
const textOf = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

describe('BudgetSummary', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [BudgetSummary], providers: [provideRouter([])] }).compileComponents());

  it('muestra presupuesto, porcentaje utilizado, acumulado, disponible y proyectado', async () => {
    const fixture = render(presupuesto());
    await fixture.whenStable();
    const text = textOf(fixture.nativeElement);
    expect(text).toContain('Presupuesto mensual: 200,00');
    expect(text).toContain('25,0 %');
    const el = fixture.nativeElement as HTMLElement;
    expect(valorDe(el, 'Acumulado')).toContain('50,00');
    expect(valorDe(el, 'Disponible')).toContain('150,00');
    expect(valorDe(el, 'Proyectado al cierre')).toBe('80,0 %');
  });

  it('el color de la barra sigue el nivel del backend, sin reglas propias', async () => {
    // 150 % utilizado pero el backend dice VERDE: la barra es verde y solo se limita al 100 % para dibujarse.
    const fixture = render(presupuesto({ porcentaje_utilizado: 150, nivel: 'VERDE' }), 300);
    await fixture.whenStable();
    const fill = (fixture.nativeElement as HTMLElement).querySelector('.track__fill') as HTMLElement;
    expect(fill.classList.contains('track__fill--ok')).toBe(true);
    expect(fill.style.width).toBe('100%');
  });

  it('sin presupuesto muestra el estado vacío y no inventa cifras', async () => {
    const fixture = render(null, null, null);
    await fixture.whenStable();
    const text = textOf(fixture.nativeElement);
    expect(text).toContain('No tienes un presupuesto configurado.');
    expect(text).not.toContain('Presupuesto mensual');
    expect(text).not.toContain('%');
  });

  it('sin tarifa no hay acumulado ni disponible', async () => {
    const fixture = render(presupuesto({ porcentaje_utilizado: null, porcentaje_proyectado: null, nivel: null, motivo: 'SIN_TARIFA' }), null, null);
    await fixture.whenStable();
    const text = textOf(fixture.nativeElement);
    expect(text).toContain('No hay datos disponibles para calcular el porcentaje utilizado.');
    const el = fixture.nativeElement as HTMLElement;
    expect(valorDe(el, 'Acumulado')).toBe('—');
    expect(valorDe(el, 'Disponible')).toBe('—');
  });
});
