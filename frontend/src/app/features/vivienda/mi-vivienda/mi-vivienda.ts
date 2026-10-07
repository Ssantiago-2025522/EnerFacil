import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Tarifa } from '../../../core/models/tarifa.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { TarifaService } from '../../../core/services/tarifa.service';
import { ViviendaSeleccionService } from '../../../core/services/vivienda-seleccion.service';
import { ViviendaService } from '../../../core/services/vivienda.service';
import { toApiError } from '../../../core/utils/api-error';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/icon/icon';
import { fmtFecha } from '../../../shared/utils/format';
import { ViviendaFormDialog } from '../components/vivienda-form-dialog/vivienda-form-dialog';

type Status = 'loading' | 'ready' | 'error';
type Dialogo = 'ninguno' | 'crear' | 'editar' | 'eliminar';
interface Aviso {
  tipo: 'success' | 'info';
  texto: string;
}

/**
 * Página /vivienda. Es autónoma: no depende del dashboard ni lo modifica.
 * Cuando el dashboard se conecte a datos reales puede inyectar ViviendaService por su cuenta.
 */
@Component({
  selector: 'app-mi-vivienda',
  imports: [Icon, ViviendaFormDialog, ConfirmDialog],
  templateUrl: './mi-vivienda.html',
  styleUrl: './mi-vivienda.css',
})
export class MiVivienda {
  private readonly viviendaService = inject(ViviendaService);
  private readonly tarifaService = inject(TarifaService);
  private readonly seleccion = inject(ViviendaSeleccionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<Status>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly viviendas = signal<Vivienda[]>([]);
  /** Vivienda seleccionada: estado compartido con los demás módulos (p. ej. Ambientes). */
  protected readonly selectedId = this.seleccion.id;

  protected readonly tarifas = signal<Tarifa[]>([]);
  protected readonly tarifasStatus = signal<Status>('loading');

  protected readonly dialogo = signal<Dialogo>('ninguno');
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly aviso = signal<Aviso | null>(null);

  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return this.viviendas().find((v) => v.id_vivienda === id) ?? null;
  });

  protected readonly tarifaNombre = computed<string | null>(() => {
    const v = this.selected();
    if (!v || v.id_tarifa === null) return null;
    const tarifa = this.tarifas().find((t) => t.id_tarifa === v.id_tarifa);
    if (tarifa) return tarifa.nombre;
    return this.tarifasStatus() === 'loading' ? 'Cargando…' : `Tarifa n.º ${v.id_tarifa}`;
  });

  protected readonly creada = computed(() => fmtFecha(this.selected()?.creado_en));

  constructor() {
    this.cargar();
    this.cargarTarifas();
  }

  protected cargar(): void {
    this.status.set('loading');
    this.loadError.set(null);
    this.viviendaService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.viviendas.set(lista);
          // Conserva la vivienda seleccionada si sigue existiendo; si no, la primera.
          this.seleccion.resolver(lista);
          this.status.set('ready');
        },
        error: (err: unknown) => {
          const error = toApiError(err);
          // 401: el interceptor ya cierra la sesión y navega a /login; no se muestra nada aquí.
          this.loadError.set(error.status === 401 ? null : this.mensajeCarga(error.status, error.message));
          this.status.set('error');
        },
      });
  }

  protected cargarTarifas(): void {
    this.tarifasStatus.set('loading');
    this.tarifaService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.tarifas.set(lista);
          this.tarifasStatus.set('ready');
        },
        error: () => this.tarifasStatus.set('error'),
      });
  }

  protected seleccionar(id: number): void {
    this.seleccion.seleccionar(id);
    this.aviso.set(null);
  }

  protected abrirCrear(): void {
    this.aviso.set(null);
    this.dialogo.set('crear');
  }

  protected abrirEditar(): void {
    if (!this.selected()) return;
    this.aviso.set(null);
    this.dialogo.set('editar');
  }

  protected abrirEliminar(): void {
    if (!this.selected()) return;
    this.aviso.set(null);
    this.deleteError.set(null);
    this.dialogo.set('eliminar');
  }

  protected cerrarDialogo(): void {
    if (this.deleting()) return;
    this.dialogo.set('ninguno');
  }

  protected alGuardar(vivienda: Vivienda): void {
    const creando = this.dialogo() === 'crear';
    this.viviendas.update((lista) =>
      creando
        ? [...lista, vivienda]
        : lista.map((v) => (v.id_vivienda === vivienda.id_vivienda ? vivienda : v)),
    );
    this.seleccion.seleccionar(vivienda.id_vivienda);
    this.dialogo.set('ninguno');
    this.aviso.set({ tipo: 'success', texto: creando ? 'Vivienda agregada.' : 'Cambios guardados.' });
  }

  /** La vivienda ya no existe en el servidor (borrada desde otro lugar): se refresca la lista. */
  protected alDesaparecer(): void {
    this.dialogo.set('ninguno');
    this.deleting.set(false);
    this.cargar();
    this.aviso.set({ tipo: 'info', texto: 'Esa vivienda ya no existe, así que actualizamos tu lista.' });
  }

  protected confirmarEliminar(): void {
    const vivienda = this.selected();
    if (!vivienda || this.deleting()) return;

    this.deleting.set(true);
    this.deleteError.set(null);
    this.viviendaService
      .eliminar(vivienda.id_vivienda)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const lista = this.viviendas();
          const indice = lista.findIndex((v) => v.id_vivienda === vivienda.id_vivienda);
          const restantes = lista.filter((v) => v.id_vivienda !== vivienda.id_vivienda);
          this.viviendas.set(restantes);
          // Selecciona la vecina (la siguiente o, si era la última, la anterior).
          this.seleccion.seleccionar((restantes[indice] ?? restantes[indice - 1] ?? null)?.id_vivienda ?? null);
          this.deleting.set(false);
          this.dialogo.set('ninguno');
          this.aviso.set({ tipo: 'success', texto: `Se eliminó «${vivienda.nombre}».` });
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
          this.deleteError.set(
            error.status === 409
              ? 'No se puede eliminar la vivienda porque tiene información asociada en uso.'
              : error.message,
          );
        },
      });
  }

  private mensajeCarga(status: number, message: string): string {
    if (status === 404) return 'No encontramos la información de tu vivienda. Inténtalo de nuevo.';
    return message;
  }
}
