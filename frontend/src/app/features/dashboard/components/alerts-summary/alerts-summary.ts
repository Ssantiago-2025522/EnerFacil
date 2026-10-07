import { Component, input } from '@angular/core';
import { Icon } from '../../../../shared/icon/icon';

export type AlertSeverity = 'info' | 'success' | 'warning' | 'danger';

export interface AlertItem {
  id: string;
  severity: AlertSeverity;
  title: string;
  description: string;
}

/** Muestra el estado del consumo como banner. Solo presenta lo que ya decidió el módulo Alertas. */
@Component({
  selector: 'app-alerts-summary',
  imports: [Icon],
  templateUrl: './alerts-summary.html',
  styleUrl: './alerts-summary.css',
})
export class AlertsSummary {
  readonly alerts = input.required<AlertItem[]>();
}
