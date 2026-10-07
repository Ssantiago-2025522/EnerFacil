import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../../shared/icon/icon';
import { fmtNum } from '../../../../shared/utils/format';

export interface EnergyBreakdownItem {
  id: number;
  nombre: string;
  /** Ambiente donde está el equipo (null = sin ambiente). */
  ambiente: string | null;
  kwh: number;
  /** Porcentaje del consumo del hogar, calculado por el backend. */
  porcentaje: number;
}

/** Consumo por electrodoméstico con barra de proporción. Los kWh y porcentajes vienen del backend. */
@Component({
  selector: 'app-energy-breakdown',
  imports: [Icon, RouterLink],
  templateUrl: './energy-breakdown.html',
  styleUrl: './energy-breakdown.css',
})
export class EnergyBreakdown {
  readonly items = input.required<EnergyBreakdownItem[]>();
  /** Texto que explica de dónde salen los kWh (consumo registrado o estimado). */
  readonly subtitle = input('');

  protected readonly fmt = fmtNum;
  protected readonly rows = computed(() =>
    this.items().map((i) => ({ ...i, share: Math.min(Math.max(i.porcentaje, 0), 100) })),
  );
}
