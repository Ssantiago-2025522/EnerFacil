import { Component, DestroyRef, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { FuenteProyeccion } from '../../../core/models/consumo.models';
import { DashboardData } from '../../../core/models/dashboard.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { DashboardService } from '../../../core/services/dashboard.service';
import { ViviendaSeleccionService } from '../../../core/services/vivienda-seleccion.service';
import { ViviendaService } from '../../../core/services/vivienda.service';
import { mensajeAlertaAmigable } from '../../../core/utils/alerta-mensajes';
import { toApiError } from '../../../core/utils/api-error';
import { Icon } from '../../../shared/icon/icon';
import { fmtDia, fmtMonto, fmtNum } from '../../../shared/utils/format';
import { AlertItem, AlertsSummary } from '../components/alerts-summary/alerts-summary';
import { BudgetSummary } from '../components/budget-summary/budget-summary';
import { EnergyBreakdown, EnergyBreakdownItem } from '../components/energy-breakdown/energy-breakdown';
import { StatCard } from '../components/stat-card/stat-card';

type Status = 'loading' | 'ready' | 'error';

const FUENTES: Record<FuenteProyeccion, string> = {
  LECTURAS: 'según las lecturas de tu medidor',
  REGISTROS_USO: 'según las horas de uso registradas',
  ESTIMACION: 'según el consumo estimado de tus equipos',
  SIN_DATOS: '',
};
const MENSAJE_ERROR = 'No pudimos cargar tu información. Inténtalo de nuevo.';

/**
 * Página /inicio. Todo viene de GET /api/dashboard (capa de agregación del backend sobre Consumo, Presupuesto,
 * Alertas, Electrodomésticos y Tarifas). Aquí no se calculan consumos, montos ni niveles del semáforo: solo se
 * presentan y se redactan textos. La vivienda es la de ViviendaSeleccionService, igual que en el resto de módulos.
 */
@Component({
  selector: 'app-dashboard',
  imports: [Icon, RouterLink, StatCard, BudgetSummary, AlertsSummary, EnergyBreakdown],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly viviendaService = inject(ViviendaService);
  private readonly dashboardService = inject(DashboardService);
  private readonly seleccion = inject(ViviendaSeleccionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  // Viviendas (mismo mecanismo de selección que el resto de módulos)
  protected readonly viviendasStatus = signal<Status>('loading');
  protected readonly viviendasError = signal<string | null>(null);
  protected readonly viviendas = signal<Vivienda[]>([]);
  protected readonly selectedId = this.seleccion.id;
  protected readonly selected = computed(() => this.viviendas().find((v) => v.id_vivienda === this.selectedId()) ?? null);

  // Datos de la vivienda seleccionada
  protected readonly status = signal<Status>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly data = signal<DashboardData | null>(null);

  protected readonly fmt = fmtNum;
  protected readonly fmtDia = fmtDia;

  /** Sin lecturas, horas de uso ni equipos activos: el backend no tiene de dónde calcular consumo. */
  protected readonly sinConsumo = computed(() => this.data()?.resumen.fuente === 'SIN_DATOS');
  protected readonly moneda = computed(() => this.data()?.resumen.moneda ?? null);
  protected readonly fuenteTexto = computed(() => {
    const f = this.data()?.resumen.fuente;
    return f ? FUENTES[f] : '';
  });

  protected readonly periodo = computed(() => {
    const r = this.data()?.resumen;
    return r ? `${fmtDia(r.fecha_inicio, 'short')} – ${fmtDia(r.fecha_fin, 'short')}` : '';
  });

  /** Variación frente al ciclo anterior, solo si el backend pudo compararlos. */
  protected readonly comparacion = computed(() => {
    const c = this.data()?.comparacion;
    if (!c || c.tendencia === null || c.diferencia_pct === null || c.kwh_anterior === null) return null;
    const pct = `${fmtNum(Math.abs(c.diferencia_pct), 1)} %`;
    const anterior = `${fmtNum(c.kwh_anterior, 1)} kWh`;
    if (c.tendencia === 'IGUAL') return { texto: `Igual que el ciclo anterior (${anterior})`, trend: null, tone: 'default' as const };
    return c.tendencia === 'BAJA'
      ? { texto: `${pct} menos que el ciclo anterior (${anterior})`, trend: 'down' as const, tone: 'positive' as const }
      : { texto: `${pct} más que el ciclo anterior (${anterior})`, trend: 'up' as const, tone: 'negative' as const };
  });

  protected readonly montoProyectado = computed(() => this.monto(this.data()?.resumen.monto_proyectado ?? null));
  protected readonly montoAcumulado = computed(() => this.monto(this.data()?.resumen.monto_acumulado ?? null));

  /** Estado del consumo: el nivel lo decide el módulo Alertas; aquí solo se traduce a un texto. */
  protected readonly estado = computed<AlertItem[]>(() => {
    const a = this.data()?.alertas;
    if (!a) return [];
    const pct = a.porcentaje_proyectado === null ? '' : ` Tu consumo proyectado llega al ${fmtNum(a.porcentaje_proyectado, 1)} % de tu presupuesto.`;
    switch (a.nivel) {
      case 'VERDE':
        return [{ id: 'estado', severity: 'success', title: 'Vas bien con tu presupuesto', description: pct.trim() || 'Tu consumo va dentro de lo previsto.' }];
      case 'AMARILLO':
        return [{ id: 'estado', severity: 'warning', title: 'Te estás acercando al límite', description: pct.trim() || 'Tu consumo se acerca a tu presupuesto.' }];
      case 'ROJO':
        return [{ id: 'estado', severity: 'danger', title: 'Vas a superar tu presupuesto', description: pct.trim() || 'Tu consumo proyectado supera tu presupuesto.' }];
      default:
        return [{ id: 'estado', severity: 'info', title: 'Estado del consumo', description: this.sinNivel(a.motivo) }];
    }
  });

  protected readonly electrodomesticos = computed<EnergyBreakdownItem[]>(() =>
    (this.data()?.consumo_por_electrodomestico ?? []).map((e) => ({
      id: e.id_electrodomestico,
      nombre: e.nombre,
      ambiente: e.ambiente,
      kwh: e.kwh,
      porcentaje: e.porcentaje,
    })),
  );
  protected readonly origenTexto = computed(() => {
    switch (this.data()?.origen_desglose) {
      case 'REGISTROS_USO':
        return 'Consumo registrado en este ciclo';
      case 'ESTIMACION':
        return 'Consumo mensual estimado de tus equipos activos';
      default:
        return '';
    }
  });

  private dataSub: Subscription | null = null;

  constructor() {
    this.cargarViviendas();
    // Cada vez que cambia la vivienda seleccionada (ya validada) se descartan los datos y se piden los nuevos.
    effect(
      () => {
        const id = this.selectedId();
        if (this.viviendasStatus() !== 'ready' || id === null) return;
        untracked(() => this.cargarDatos(id, { silencioso: false }));
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
            this.data.set(null);
          }
          this.viviendasStatus.set('ready');
          // Si la selección no cambió el efecto no se dispara: se refresca explícitamente.
          if (id !== null && this.status() !== 'loading') this.cargarDatos(id, { silencioso: true });
        },
        error: (err: unknown) => {
          console.error('[dashboard] No se pudieron cargar las viviendas', err);
          const error = toApiError(err);
          this.viviendasError.set(error.status === 401 ? null : mensajeAlertaAmigable(error.message, MENSAJE_ERROR));
          this.viviendasStatus.set('error');
        },
      });
  }

  /** Reintenta lo que falló: la lista de viviendas o los datos de la vivienda seleccionada. */
  protected reintentar(): void {
    if (this.viviendasStatus() === 'error') {
      this.cargarViviendas();
      return;
    }
    const id = this.selectedId();
    if (id !== null) this.cargarDatos(id, { silencioso: false });
  }

  protected seleccionarVivienda(id: number): void {
    if (id !== this.selectedId()) this.seleccion.seleccionar(id);
  }

  /**
   * Al cambiar de vivienda se cancela la petición anterior y se descartan los datos previos, para no mezclar
   * viviendas ni mostrar información vieja mientras carga la nueva. `silencioso` refresca sin esqueleto.
   */
  private cargarDatos(idVivienda: number, op: { silencioso: boolean }): void {
    this.dataSub?.unsubscribe();
    if (!op.silencioso) {
      this.status.set('loading');
      this.loadError.set(null);
      this.data.set(null);
    }
    this.dataSub = this.dashboardService.obtener(idVivienda).subscribe({
      next: (d) => {
        // Defensa extra: una respuesta de otra vivienda nunca se pinta.
        if (d.vivienda.id_vivienda !== this.selectedId()) return;
        this.data.set(d);
        this.status.set('ready');
      },
      error: (err: unknown) => {
        console.error('[dashboard] No se pudo cargar el dashboard', err);
        const error = toApiError(err);
        if (error.status === 401) return; // el interceptor cierra la sesión y redirige
        if (error.status === 404) {
          // La vivienda ya no existe o no es del usuario: se descarta todo y se vuelve a pedir la lista.
          this.dataSub?.unsubscribe();
          this.data.set(null);
          this.cargarViviendas();
          return;
        }
        this.data.set(null);
        this.loadError.set(mensajeAlertaAmigable(error.message, MENSAJE_ERROR));
        this.status.set('error');
      },
    });
  }

  private monto(valor: number | null): string | null {
    const m = this.moneda();
    return valor === null || m === null ? null : fmtMonto(valor, m);
  }

  private sinNivel(motivo: DashboardData['alertas']['motivo']): string {
    switch (motivo) {
      case 'SIN_PRESUPUESTO':
        return 'No tienes un presupuesto configurado.';
      case 'SIN_TARIFA':
        return 'Tu vivienda no tiene una tarifa asignada, así que no podemos evaluar tu presupuesto.';
      default:
        return 'No hay datos disponibles.';
    }
  }
}
