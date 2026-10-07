import { Component, DestroyRef, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { Ambiente } from '../../../core/models/ambiente.models';
import { CatalogoElectrodomestico, Electrodomestico } from '../../../core/models/electrodomestico.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { AmbienteService } from '../../../core/services/ambiente.service';
import { ElectrodomesticoService } from '../../../core/services/electrodomestico.service';
import { ViviendaSeleccionService } from '../../../core/services/vivienda-seleccion.service';
import { ViviendaService } from '../../../core/services/vivienda.service';
import { toApiError } from '../../../core/utils/api-error';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/icon/icon';
import { fmtNum } from '../../../shared/utils/format';
import { ElectrodomesticoFormDialog } from '../components/electrodomestico-form-dialog/electrodomestico-form-dialog';

type Status = 'loading' | 'ready' | 'error';
type Dialogo = 'ninguno' | 'crear' | 'editar' | 'eliminar';
/** 'todos' | 'sin' (sin ambiente) | id_ambiente */
type Filtro = 'todos' | 'sin' | number;
interface Aviso {
  tipo: 'success' | 'info';
  texto: string;
}

/** Mismo orden que el backend: mayor consumo estimado primero y luego por nombre. */
const ordenar = (a: Electrodomestico, b: Electrodomestico) =>
  b.kwh_mes_estimado - a.kwh_mes_estimado || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });

/**
 * Página /electrodomesticos. Usa la vivienda seleccionada (compartida con Mi vivienda y Ambientes),
 * carga sus ambientes y electrodomésticos y filtra por ambiente en el cliente.
 */
@Component({
  selector: 'app-electrodomesticos',
  imports: [Icon, RouterLink, ElectrodomesticoFormDialog, ConfirmDialog],
  templateUrl: './electrodomesticos.html',
  styleUrl: './electrodomesticos.css',
})
export class Electrodomesticos {
  private readonly viviendaService = inject(ViviendaService);
  private readonly ambienteService = inject(AmbienteService);
  private readonly electroService = inject(ElectrodomesticoService);
  private readonly seleccion = inject(ViviendaSeleccionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  // Viviendas
  protected readonly viviendasStatus = signal<Status>('loading');
  protected readonly viviendasError = signal<string | null>(null);
  protected readonly viviendas = signal<Vivienda[]>([]);
  protected readonly selectedId = this.seleccion.id;
  protected readonly selected = computed(() => this.viviendas().find((v) => v.id_vivienda === this.selectedId()) ?? null);

  // Datos de la vivienda seleccionada
  protected readonly status = signal<Status>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly ambientes = signal<Ambiente[]>([]);
  protected readonly electros = signal<Electrodomestico[]>([]);
  protected readonly filtro = signal<Filtro>('todos');

  // Catálogo (se carga al abrir el formulario por primera vez)
  protected readonly catalogo = signal<CatalogoElectrodomestico[]>([]);
  protected readonly catalogoStatus = signal<Status>('loading');
  private catalogoPedido = false;

  // Diálogos
  protected readonly dialogo = signal<Dialogo>('ninguno');
  protected readonly actual = signal<Electrodomestico | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly aviso = signal<Aviso | null>(null);

  protected readonly fmtNum = fmtNum;

  protected readonly sinAmbienteCount = computed(() => this.electros().filter((e) => e.id_ambiente === null).length);
  protected readonly visibles = computed(() => {
    const f = this.filtro();
    const lista = this.electros();
    if (f === 'todos') return lista;
    return lista.filter((e) => (f === 'sin' ? e.id_ambiente === null : e.id_ambiente === f));
  });
  /** Suma del consumo mensual estimado (columna del backend) de los equipos activos que se están viendo. */
  protected readonly totalKwh = computed(() =>
    this.visibles().reduce((suma, e) => suma + (e.activo === 1 ? e.kwh_mes_estimado : 0), 0),
  );
  protected readonly filtroNombre = computed(() => {
    const f = this.filtro();
    if (f === 'todos') return null;
    if (f === 'sin') return 'Sin ambiente';
    return this.ambientes().find((a) => a.id_ambiente === f)?.nombre ?? null;
  });
  /** Ambiente que se preselecciona al crear: el que se está filtrando. */
  protected readonly ambienteInicial = computed(() => {
    const f = this.filtro();
    return typeof f === 'number' ? f : null;
  });

  private dataSub: Subscription | null = null;

  constructor() {
    this.cargarViviendas();
    // Cada vez que cambia la vivienda seleccionada (ya validada) se piden sus datos.
    effect(
      () => {
        const id = this.selectedId();
        if (this.viviendasStatus() !== 'ready' || id === null) return;
        untracked(() => this.cargarDatos(id, true));
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
            this.ambientes.set([]);
            this.electros.set([]);
          }
          this.viviendasStatus.set('ready');
          // Si la selección no cambió el efecto no se dispara: se refresca explícitamente.
          if (id !== null && this.status() !== 'loading') this.cargarDatos(id, false);
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
    if (id !== null) this.cargarDatos(id, false);
  }

  /** Ambientes y electrodomésticos de la vivienda. `reiniciarFiltro` al cambiar de vivienda. */
  private cargarDatos(idVivienda: number, reiniciarFiltro: boolean): void {
    this.dataSub?.unsubscribe();
    if (reiniciarFiltro) this.filtro.set('todos');
    this.status.set('loading');
    this.loadError.set(null);
    this.dataSub = forkJoin({
      ambientes: this.ambienteService.listar(idVivienda),
      electros: this.electroService.listar(idVivienda),
    }).subscribe({
      next: ({ ambientes, electros }) => {
        this.ambientes.set(ambientes);
        this.electros.set([...electros].sort(ordenar));
        // Si el ambiente filtrado ya no existe, se vuelve a «Todos».
        const f = this.filtro();
        if (typeof f === 'number' && !ambientes.some((a) => a.id_ambiente === f)) this.filtro.set('todos');
        this.status.set('ready');
      },
      error: (err: unknown) => {
        const error = toApiError(err);
        if (error.status === 401) return; // el interceptor cierra la sesión y redirige
        if (error.status === 404) {
          this.refrescarTodo('Esa vivienda ya no existe, así que actualizamos tu lista.');
          return;
        }
        this.loadError.set(error.message);
        this.status.set('error');
      },
    });
  }

  protected cargarCatalogo(): void {
    this.catalogoStatus.set('loading');
    this.electroService
      .listarCatalogo()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lista) => {
          this.catalogo.set(lista);
          this.catalogoStatus.set('ready');
        },
        error: () => this.catalogoStatus.set('error'),
      });
  }

  protected seleccionarVivienda(id: number): void {
    if (id === this.selectedId()) return;
    this.aviso.set(null);
    this.seleccion.seleccionar(id);
  }

  protected filtrar(f: Filtro): void {
    this.filtro.set(f);
  }

  protected nombreAmbiente(e: Electrodomestico): string {
    if (e.id_ambiente === null) return 'Sin ambiente';
    return e.ambiente ?? this.ambientes().find((a) => a.id_ambiente === e.id_ambiente)?.nombre ?? 'Sin ambiente';
  }

  protected cuenta(idAmbiente: number): number {
    return this.electros().filter((e) => e.id_ambiente === idAmbiente).length;
  }

  protected abrirCrear(): void {
    if (this.selectedId() === null) return;
    if (!this.catalogoPedido) {
      this.catalogoPedido = true;
      this.cargarCatalogo();
    }
    this.aviso.set(null);
    this.actual.set(null);
    this.dialogo.set('crear');
  }

  protected reintentarCatalogo(): void {
    this.cargarCatalogo();
  }

  protected abrirEditar(e: Electrodomestico): void {
    this.aviso.set(null);
    this.actual.set(e);
    this.dialogo.set('editar');
  }

  protected abrirEliminar(e: Electrodomestico): void {
    this.aviso.set(null);
    this.deleteError.set(null);
    this.actual.set(e);
    this.dialogo.set('eliminar');
  }

  protected cerrarDialogo(): void {
    if (this.deleting()) return;
    this.dialogo.set('ninguno');
    this.actual.set(null);
  }

  protected alGuardar(e: Electrodomestico): void {
    const creando = this.dialogo() === 'crear';
    this.electros.update((lista) =>
      [...(creando ? [...lista, e] : lista.map((x) => (x.id_electrodomestico === e.id_electrodomestico ? e : x)))].sort(ordenar),
    );
    this.dialogo.set('ninguno');
    this.actual.set(null);
    this.aviso.set({ tipo: 'success', texto: creando ? 'Electrodoméstico agregado.' : 'Cambios guardados.' });
  }

  /** Algo ya no existe en el servidor (borrado desde otro lugar): se refresca todo. */
  protected alDesaparecer(): void {
    this.refrescarTodo('Ese elemento ya no existe, así que actualizamos tu lista.');
  }

  private refrescarTodo(texto: string): void {
    this.dialogo.set('ninguno');
    this.actual.set(null);
    this.deleting.set(false);
    this.cargarViviendas();
    this.aviso.set({ tipo: 'info', texto });
  }

  protected confirmarEliminar(): void {
    const e = this.actual();
    if (!e || this.deleting()) return;

    this.deleting.set(true);
    this.deleteError.set(null);
    this.electroService
      .eliminar(e.id_electrodomestico)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.electros.update((lista) => lista.filter((x) => x.id_electrodomestico !== e.id_electrodomestico));
          this.deleting.set(false);
          this.dialogo.set('ninguno');
          this.actual.set(null);
          this.aviso.set({ tipo: 'success', texto: `Se eliminó «${e.nombre}».` });
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
