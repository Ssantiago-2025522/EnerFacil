import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardPresupuesto } from '../../../../core/models/dashboard.models';
import { Icon } from '../../../../shared/icon/icon';
import { fmtMonto, fmtNum } from '../../../../shared/utils/format';

/**
 * Presupuesto mensual de la vivienda. No evalúa ni define niveles: los porcentajes y el color vienen del backend
 * (`porcentaje_utilizado`, `porcentaje_proyectado`, `nivel`). Solo se calcula «disponible» = presupuesto − acumulado.
 */
@Component({
  selector: 'app-budget-summary',
  imports: [Icon, RouterLink],
  templateUrl: './budget-summary.html',
  styleUrl: './budget-summary.css',
})
export class BudgetSummary {
  /** null = la vivienda no tiene presupuesto vigente. */
  readonly presupuesto = input.required<DashboardPresupuesto | null>();
  /** Monto acumulado del ciclo (null si no hay tarifa). */
  readonly acumulado = input.required<number | null>();
  readonly moneda = input.required<string | null>();

  protected readonly fmt = fmtNum;

  protected readonly disponible = computed(() => {
    const p = this.presupuesto();
    const a = this.acumulado();
    return p === null || a === null ? null : Math.round((p.monto_mensual - a) * 100) / 100;
  });
  /** Ancho visual de la barra (solo se limita a 0–100 para dibujarla). */
  protected readonly barra = computed(() => Math.min(Math.max(this.presupuesto()?.porcentaje_utilizado ?? 0, 0), 100));
  protected readonly tono = computed(() => {
    switch (this.presupuesto()?.nivel) {
      case 'VERDE':
        return 'ok';
      case 'AMARILLO':
        return 'warn';
      case 'ROJO':
        return 'danger';
      default:
        return 'neutral';
    }
  });

  protected monto(valor: number | null): string {
    const m = this.moneda();
    return valor === null || m === null ? '—' : fmtMonto(valor, m);
  }
}
