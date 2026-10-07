import { Component, input } from '@angular/core';
import { Icon, IconName } from '../../../../shared/icon/icon';

export type StatTone = 'default' | 'accent' | 'positive' | 'negative';

/**
 * Tarjeta de estadística reutilizable: etiqueta + icono, valor con unidad,
 * una línea de detalle (con tono y flecha opcional) y una nota secundaria.
 */
@Component({
  selector: 'app-stat-card',
  imports: [Icon],
  templateUrl: './stat-card.html',
  styleUrl: './stat-card.css',
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly unit = input('');
  readonly icon = input<IconName>('bolt');
  readonly detail = input('');
  readonly tone = input<StatTone>('default');
  /** Flecha delante del detalle (p. ej. variación respecto al período anterior). */
  readonly trend = input<'up' | 'down' | null>(null);
  readonly note = input('');
  /** Fondo azul suave para destacar la tarjeta. */
  readonly accent = input(false);
}
