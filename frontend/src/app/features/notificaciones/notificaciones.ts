import { Component, DestroyRef, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Notificacion } from '../../core/models/notificacion.models';
import { NivelSemaforo } from '../../core/models/presupuesto.models';
import { Vivienda } from '../../core/models/vivienda.models';
import { NotificacionService } from '../../core/services/notificacion.service';
import { ViviendaSeleccionService } from '../../core/services/vivienda-seleccion.service';
import { ViviendaService } from '../../core/services/vivienda.service';
import { toApiError } from '../../core/utils/api-error';
import { Icon } from '../../shared/icon/icon';
import { fmtFechaHora } from '../../shared/utils/format';

type Status = 'loading' | 'ready' | 'error';

const NIVELES: Record<NivelSemaforo, string> = {
  VERDE: 'Todo en orden',
  AMARILLO: 'Atención',
  ROJO: 'Urgente',
};

/** Mensaje amigable según el código HTTP; sin detalles técnicos. */
function mensajeHttp(status: number, base: string): string {
  if (status === 403) return 'No tienes permiso para ver estas notificaciones.';
  if (status === 404) return 'No encontramos esa notificación. Es posible que ya no exista.';
  return base;
}

/**
 * Página /notificaciones. Muestra las notificaciones reales de la vivienda seleccionada
 * (GET /api/notificaciones) y permite marcarlas como leídas (PUT /api/notificaciones/:id/leida).
 * Las notificaciones las genera el backend (módulo Alertas); aquí solo se consultan.
 */
@Component({
  selector: 'app-notificaciones',
  imports: [Icon, RouterLink],
  templateUrl: './notificaciones.html',
  styleUrl: './notificaciones.css',
})
export class Notificaciones {
  private readonly viviendaService = inject(ViviendaService);
  private readonly notificacionService = inject(NotificacionService);
  private readonly seleccion = inject(ViviendaSeleccionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  // Viviendas (mismo mecanismo de selección que el resto de módulos)
  protected readonly viviendasStatus = signal<Status>('loading');
  protected readonly viviendasError = signal<string | null>(null);
  protected readonly viviendas = signal<Vivienda[]>([]);
  protected readonly selectedId = this.seleccion.id;
  protected readonly selected = computed(() => this.viviendas().find((v) => v.id_vivienda === this.selectedId()) ?? null);

  // Notificaciones de la vivienda seleccionada
  protected readonly status = signal<Status>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly lista = signal<Notificacion[]>([]);
  protected readonly noLeidas = computed(() => this.lista().filter((n) => !n.leida).length);

  // Marcar como leída
  protected readonly marcando = signal<ReadonlySet<number>>(new Set());
  protected readonly aviso = signal<string | null>(null);

  protected readonly fmtFechaHora = fmtFechaHora;
  protected readonly nivelLabel = (n: NivelSemaforo) => NIVELES[n];

  private dataSub: Subscription | null = null;

  constructor() {
    this.cargarViviendas();
    // Cada vez que cambia la vivienda seleccionada (ya validada) se piden sus notificaciones.
    effect(
      () => {
        const id = this.selectedId();
        if (this.viviendasStatus() !== 'ready' || id === null) return;
        untracked(() => this.cargar(id));
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
            this.lista.set([]);
          }
          this.viviendasStatus.set('ready');
          // Si la selección no cambió el efecto no se dispara: se refresca explícitamente.
          if (id !== null && this.status() !== 'loading') this.cargar(id);
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
    if (id !== null) this.cargar(id);
  }

  /** Al cambiar de vivienda se cancela la petición anterior y se descartan las notificaciones previas. */
  private cargar(idVivienda: number): void {
    this.dataSub?.unsubscribe();
    this.status.set('loading');
    this.loadError.set(null);
    this.aviso.set(null);
    this.lista.set([]);
    this.marcando.set(new Set());
    this.dataSub = this.notificacionService.listar(idVivienda).subscribe({
      next: (lista) => {
        this.lista.set(lista);
        this.status.set('ready');
      },
      error: (err: unknown) => {
        const error = toApiError(err);
        if (error.status === 401) return; // el interceptor cierra la sesión y redirige
        if (error.status === 404) {
          this.cargarViviendas(); // la vivienda ya no existe: se actualiza la lista
          return;
        }
        console.error('[notificaciones] No se pudieron cargar', err);
        this.loadError.set(mensajeHttp(error.status, error.message));
        this.status.set('error');
      },
    });
  }

  protected seleccionarVivienda(id: number): void {
    if (id !== this.selectedId()) this.seleccion.seleccionar(id);
  }

  protected marcarLeida(n: Notificacion): void {
    if (n.leida || this.marcando().has(n.id_notificacion)) return;
    const idVivienda = this.selectedId();
    this.aviso.set(null);
    this.setMarcando(n.id_notificacion, true);
    this.notificacionService
      .marcarLeida(n.id_notificacion)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.setMarcando(n.id_notificacion, false);
          if (this.selectedId() !== idVivienda) return; // cambió de vivienda mientras tanto
          // Se reemplaza por id: nunca se duplica.
          this.lista.update((l) => l.map((x) => (x.id_notificacion === n.id_notificacion ? { ...x, leida: actualizada.leida } : x)));
        },
        error: (err: unknown) => {
          this.setMarcando(n.id_notificacion, false);
          const error = toApiError(err);
          if (error.status === 401) return;
          console.error('[notificaciones] No se pudo marcar como leída', err);
          this.aviso.set(mensajeHttp(error.status, 'No pudimos marcar la notificación como leída. Inténtalo de nuevo.'));
        },
      });
  }

  private setMarcando(id: number, activo: boolean): void {
    this.marcando.update((s) => {
      const copia = new Set(s);
      if (activo) copia.add(id);
      else copia.delete(id);
      return copia;
    });
  }
}
