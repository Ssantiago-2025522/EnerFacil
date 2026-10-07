import { Component, DestroyRef, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TarifaActual, TarifaTramo } from '../../../core/models/tarifa.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { TarifaService } from '../../../core/services/tarifa.service';
import { ViviendaSeleccionService } from '../../../core/services/vivienda-seleccion.service';
import { ViviendaService } from '../../../core/services/vivienda.service';
import { toApiError } from '../../../core/utils/api-error';
import { Icon } from '../../../shared/icon/icon';
import { fmtDia, fmtMonto, fmtNum } from '../../../shared/utils/format';

type Status = 'loading' | 'ready' | 'error';

const TIPOS: Record<TarifaActual['tipo'], string> = {
  SOCIAL: 'Tarifa social',
  RESIDENCIAL: 'Tarifa residencial',
  PERSONALIZADA: 'Tarifa personalizada',
};

/**
 * Página /tarifa (sidebar: «Mi tarifa»). Solo consulta: muestra la tarifa asignada a la vivienda seleccionada
 * (GET /api/tarifas/actual) con sus tramos de precio. Para cambiarla se usa Mi vivienda.
 */
@Component({
  selector: 'app-tarifa',
  imports: [Icon, RouterLink],
  templateUrl: './tarifa.html',
  styleUrl: './tarifa.css',
})
export class Tarifa {
  private readonly viviendaService = inject(ViviendaService);
  private readonly tarifaService = inject(TarifaService);
  private readonly seleccion = inject(ViviendaSeleccionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  // Viviendas (mismo mecanismo de selección que el resto de módulos)
  protected readonly viviendasStatus = signal<Status>('loading');
  protected readonly viviendasError = signal<string | null>(null);
  protected readonly viviendas = signal<Vivienda[]>([]);
  protected readonly selectedId = this.seleccion.id;
  protected readonly selected = computed(() => this.viviendas().find((v) => v.id_vivienda === this.selectedId()) ?? null);

  // Tarifa de la vivienda seleccionada
  protected readonly status = signal<Status>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly tarifa = signal<TarifaActual | null>(null);

  protected readonly fmtNum = fmtNum;
  protected readonly fmtDia = fmtDia;
  protected readonly tipoLabel = (t: TarifaActual['tipo']) => TIPOS[t];

  /** Tramos ordenados de menor a mayor consumo. */
  protected readonly tramos = computed(() => [...(this.tarifa()?.tramos ?? [])].sort((a, b) => a.kwh_desde - b.kwh_desde));
  /** Lugar de la distribuidora y región, solo lo que exista. */
  protected readonly origen = computed(() => {
    const t = this.tarifa();
    return [t?.distribuidora, t?.region].filter((x): x is string => !!x).join(' · ');
  });

  /** Explicación en lenguaje llano; solo menciona los cargos que la tarifa realmente tiene. */
  protected readonly explicacion = computed(() => {
    const t = this.tarifa();
    if (!t) return '';
    const extras: string[] = [];
    if (t.cargo_fijo > 0) extras.push('se suma el cargo fijo');
    if (t.impuesto_pct > 0) extras.push('se aplican los impuestos');
    const resto = extras.length ? ` y luego ${extras.join(' y ')}` : '';
    return `Cada kWh que consumes en el mes se cobra al precio de su tramo${resto}. Es una estimación, no una factura real.`;
  });

  private dataSub: Subscription | null = null;

  constructor() {
    this.cargarViviendas();
    // Cada vez que cambia la vivienda seleccionada (ya validada) se pide su tarifa.
    effect(
      () => {
        const id = this.selectedId();
        if (this.viviendasStatus() !== 'ready' || id === null) return;
        untracked(() => this.cargarTarifa(id));
      },
      { injector: this.injector },
    );
  }

  protected cargarViviendas(): void {
    this.viviendasStatus.set('loading');
    this.viviendasError.set(null);
    this.viviendaService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.viviendas.set(lista);
          const id = this.seleccion.resolver(lista);
          if (id === null) {
            this.dataSub?.unsubscribe();
            this.tarifa.set(null);
          }
          this.viviendasStatus.set('ready');
          // Si la selección no cambió el efecto no se dispara: se refresca explícitamente.
          if (id !== null && this.status() !== 'loading') this.cargarTarifa(id);
        },
        error: (err: unknown) => {
          const error = toApiError(err);
          this.viviendasError.set(error.status === 401 ? null : error.message);
          this.viviendasStatus.set('error');
        },
      });
  }

  protected reintentar(): void {
    if (this.viviendasStatus() === 'error') {
      this.cargarViviendas();
      return;
    }
    const id = this.selectedId();
    if (id !== null) this.cargarTarifa(id);
  }

  /** Al cambiar de vivienda se cancela la petición anterior y se descarta la tarifa previa. */
  private cargarTarifa(idVivienda: number): void {
    this.dataSub?.unsubscribe();
    this.status.set('loading');
    this.loadError.set(null);
    this.tarifa.set(null);
    this.dataSub = this.tarifaService.actual(idVivienda).subscribe({
      next: (tarifa) => {
        this.tarifa.set(tarifa);
        this.status.set('ready');
      },
      error: (err: unknown) => {
        const error = toApiError(err);
        if (error.status === 401) return; // el interceptor cierra la sesión y redirige
        if (error.status === 404) {
          this.cargarViviendas(); // la vivienda ya no existe: se actualiza la lista
          return;
        }
        this.loadError.set(error.status === 403 ? 'No tienes permiso para ver esta tarifa.' : error.message);
        this.status.set('error');
      },
    });
  }

  protected seleccionarVivienda(id: number): void {
    if (id !== this.selectedId()) this.seleccion.seleccionar(id);
  }

  /** «0 – 100 kWh», «100 – 300 kWh» o «Más de 300 kWh» (último tramo sin límite). Los tramos son contiguos. */
  protected rango(t: TarifaTramo): string {
    return t.kwh_hasta === null
      ? `Más de ${fmtNum(t.kwh_desde, 0)} kWh`
      : `${fmtNum(t.kwh_desde, 0)} – ${fmtNum(t.kwh_hasta, 0)} kWh`;
  }

  /** Precio por kWh con la moneda de la tarifa (hasta 4 decimales, sin ceros sobrantes). */
  protected precio(valor: number): string {
    const m = this.tarifa()?.moneda;
    return m ? this.moneda(valor, m, 2, 4) : fmtNum(valor, 2);
  }

  protected monto(valor: number): string {
    const m = this.tarifa()?.moneda;
    return m ? fmtMonto(valor, m) : fmtNum(valor, 2);
  }

  private moneda(valor: number, moneda: string, min: number, max: number): string {
    try {
      return new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda, minimumFractionDigits: min, maximumFractionDigits: max }).format(valor);
    } catch {
      return `${fmtNum(valor, 2)} ${moneda}`;
    }
  }
}
