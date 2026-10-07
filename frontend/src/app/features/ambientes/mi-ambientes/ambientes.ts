import { Component, DestroyRef, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { Ambiente, TIPO_AMBIENTE_LABEL } from '../../../core/models/ambiente.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { AmbienteService } from '../../../core/services/ambiente.service';
import { ViviendaSeleccionService } from '../../../core/services/vivienda-seleccion.service';
import { ViviendaService } from '../../../core/services/vivienda.service';
import { toApiError } from '../../../core/utils/api-error';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/icon/icon';
import { AmbienteFormDialog } from '../components/ambiente-form-dialog/ambiente-form-dialog';

type Status = 'loading' | 'ready' | 'error';
type Dialogo = 'ninguno' | 'crear' | 'editar' | 'eliminar';
interface Aviso {
  tipo: 'success' | 'info';
  texto: string;
}

const porNombre = (a: Ambiente, b: Ambiente) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });

/**
 * Página /ambientes. Usa la vivienda seleccionada (ViviendaSeleccionService, compartida con Mi vivienda)
 * y administra sus ambientes contra /api/ambientes?id_vivienda=…
 */
@Component({
  selector: 'app-ambientes',
  imports: [Icon, RouterLink, AmbienteFormDialog, ConfirmDialog],
  templateUrl: './ambientes.html',
  styleUrl: './ambientes.css',
})
export class Ambientes {
  private readonly viviendaService = inject(ViviendaService);
  private readonly ambienteService = inject(AmbienteService);
  private readonly seleccion = inject(ViviendaSeleccionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  // Viviendas
  protected readonly viviendasStatus = signal<Status>('loading');
  protected readonly viviendasError = signal<string | null>(null);
  protected readonly viviendas = signal<Vivienda[]>([]);
  protected readonly selectedId = this.seleccion.id;
  protected readonly selected = computed(
    () => this.viviendas().find((v) => v.id_vivienda === this.selectedId()) ?? null,
  );

  // Ambientes de la vivienda seleccionada
  protected readonly status = signal<Status>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly ambientes = signal<Ambiente[]>([]);

  // Diálogos
  protected readonly dialogo = signal<Dialogo>('ninguno');
  protected readonly editando = signal<Ambiente | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly aviso = signal<Aviso | null>(null);

  protected readonly tipoLabel = TIPO_AMBIENTE_LABEL;
  private ambientesSub: Subscription | null = null;

  constructor() {
    this.cargarViviendas();
    // Cada vez que cambia la vivienda seleccionada (ya validada) se piden sus ambientes.
    effect(
      () => {
        const id = this.selectedId();
        if (this.viviendasStatus() !== 'ready' || id === null) return;
        untracked(() => this.cargarAmbientes(id));
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
            this.ambientesSub?.unsubscribe();
            this.ambientes.set([]);
          }
          this.viviendasStatus.set('ready');
          // Si la selección no cambió el efecto no se dispara: se refresca la lista explícitamente.
          if (id !== null && this.status() !== 'loading') this.cargarAmbientes(id);
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
    if (id !== null) this.cargarAmbientes(id);
  }

  private cargarAmbientes(idVivienda: number): void {
    this.ambientesSub?.unsubscribe();
    this.status.set('loading');
    this.loadError.set(null);
    this.ambientesSub = this.ambienteService.listar(idVivienda).subscribe({
      next: (lista) => {
        this.ambientes.set([...lista].sort(porNombre));
        this.status.set('ready');
      },
      error: (err: unknown) => {
        const error = toApiError(err);
        if (error.status === 401) return; // el interceptor cierra la sesión y redirige
        if (error.status === 404) {
          // La vivienda ya no existe: se actualiza la lista de viviendas.
          this.avisarDesaparecio('Esa vivienda ya no existe, así que actualizamos tu lista.');
          return;
        }
        this.loadError.set(error.message);
        this.status.set('error');
      },
    });
  }

  protected seleccionar(id: number): void {
    if (id === this.selectedId()) return;
    this.aviso.set(null);
    this.seleccion.seleccionar(id);
  }

  protected abrirCrear(): void {
    if (this.selectedId() === null) return;
    this.aviso.set(null);
    this.editando.set(null);
    this.dialogo.set('crear');
  }

  protected abrirEditar(ambiente: Ambiente): void {
    this.aviso.set(null);
    this.editando.set(ambiente);
    this.dialogo.set('editar');
  }

  protected abrirEliminar(ambiente: Ambiente): void {
    this.aviso.set(null);
    this.deleteError.set(null);
    this.editando.set(ambiente);
    this.dialogo.set('eliminar');
  }

  protected cerrarDialogo(): void {
    if (this.deleting()) return;
    this.dialogo.set('ninguno');
    this.editando.set(null);
  }

  protected alGuardar(ambiente: Ambiente): void {
    const creando = this.dialogo() === 'crear';
    this.ambientes.update((lista) =>
      [...(creando ? [...lista, ambiente] : lista.map((a) => (a.id_ambiente === ambiente.id_ambiente ? ambiente : a)))].sort(porNombre),
    );
    this.dialogo.set('ninguno');
    this.editando.set(null);
    this.aviso.set({ tipo: 'success', texto: creando ? 'Ambiente agregado.' : 'Cambios guardados.' });
  }

  /** El ambiente (o su vivienda) ya no existe en el servidor: se refresca todo. */
  protected alDesaparecer(): void {
    this.avisarDesaparecio('Ese ambiente ya no existe, así que actualizamos tu lista.');
  }

  private avisarDesaparecio(texto: string): void {
    this.dialogo.set('ninguno');
    this.editando.set(null);
    this.deleting.set(false);
    this.cargarViviendas();
    this.aviso.set({ tipo: 'info', texto });
  }

  protected confirmarEliminar(): void {
    const ambiente = this.editando();
    if (!ambiente || this.deleting()) return;

    this.deleting.set(true);
    this.deleteError.set(null);
    this.ambienteService
      .eliminar(ambiente.id_ambiente)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.ambientes.update((lista) => lista.filter((a) => a.id_ambiente !== ambiente.id_ambiente));
          this.deleting.set(false);
          this.dialogo.set('ninguno');
          this.editando.set(null);
          this.aviso.set({ tipo: 'success', texto: `Se eliminó «${ambiente.nombre}».` });
        },
        error: (err: unknown) => {
          const error = toApiError(err);
          if (error.status === 401) {
            this.deleting.set(false);
            return;
          }
          if (error.status === 404) {
            this.alDesaparecer();
            return;
          }
          this.deleting.set(false);
          this.deleteError.set(error.message);
        },
      });
  }
}
