import { Component, DestroyRef, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { FuenteProyeccion, Proyeccion } from '../../../core/models/consumo.models';
import { EstadoPresupuesto, MotivoSinNivel, NivelSemaforo, Presupuesto as PresupuestoDto } from '../../../core/models/presupuesto.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { ConsumoService } from '../../../core/services/consumo.service';
import { PresupuestoService } from '../../../core/services/presupuesto.service';
import { ViviendaSeleccionService } from '../../../core/services/vivienda-seleccion.service';
import { ViviendaService } from '../../../core/services/vivienda.service';
import { toApiError } from '../../../core/utils/api-error';
import { Icon } from '../../../shared/icon/icon';
import { fmtDia, fmtMonto, fmtNum } from '../../../shared/utils/format';
import { PresupuestoFormDialog } from '../components/presupuesto-form-dialog/presupuesto-form-dialog';

type Status = 'loading' | 'ready' | 'error';
type Tono = 'ok' | 'warn' | 'danger' | 'neutral';
interface Aviso {
  tipo: 'success' | 'info';
  texto: string;
}

/** Todo lo que se muestra del presupuesto vigente, listo para pintar. */
interface Resumen {
  /** Presupuesto mensual vigente (presupuestos.monto_mensual). */
  monto: number;
  /** Gasto estimado del ciclo hasta hoy; null si la vivienda no tiene tarifa. */
  acumulado: number | null;
  /** Estimación del ciclo completo; null si no hay tarifa. */
  proyectado: number | null;
  /** monto − acumulado (puede ser negativo: excedido). */
  disponible: number | null;
  /** acumulado / monto × 100 (misma fórmula que /api/dashboard). */
  pctUsado: number | null;
  /** monto_proyectado / monto × 100, calculado por el backend. */
  pctProyectado: number | null;
  nivel: NivelSemaforo | null;
  motivo: MotivoSinNivel | null;
  umbrales: EstadoPresupuesto['umbrales'];
  /** El gasto estimado ya supera el presupuesto del mes. */
  superado: boolean;
}

interface Banner {
  tono: Tono;
  titulo: string;
  texto: string;
  /** Enlace de ayuda cuando falta algo para poder evaluar. */
  enlace: { texto: string; ruta: string } | null;
}

const FUENTES: Record<FuenteProyeccion, string> = {
  LECTURAS: 'Lecturas del medidor',
  REGISTROS_USO: 'Horas de uso registradas',
  ESTIMACION: 'Estimación de tus equipos',
  SIN_DATOS: 'Sin datos',
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => Math.min(Math.max(n, 0), 100);

/**
 * Página /presupuesto. Presupuesto mensual real de la vivienda seleccionada (/api/presupuesto) frente al gasto
 * estimado del ciclo en curso. El semáforo, los umbrales y los montos los entrega el backend
 * (/api/alertas/estado y /api/consumo/proyeccion); aquí solo se calculan «disponible» y «% utilizado».
 */
@Component({
  selector: 'app-presupuesto',
  imports: [Icon, RouterLink, PresupuestoFormDialog],
  templateUrl: './presupuesto.html',
  styleUrl: './presupuesto.css',
})
export class Presupuesto {
  private readonly viviendaService = inject(ViviendaService);
  private readonly presupuestoService = inject(PresupuestoService);
  private readonly consumoService = inject(ConsumoService);
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
  protected readonly lista = signal<PresupuestoDto[]>([]);
  protected readonly estado = signal<EstadoPresupuesto | null>(null);
  protected readonly proy = signal<Proyeccion | null>(null);

  // Diálogo y avisos
  protected readonly dialogoAbierto = signal(false);
  protected readonly aviso = signal<Aviso | null>(null);

  protected readonly fmtNum = fmtNum;
  protected readonly fmtDia = fmtDia;
  protected readonly fuenteLabel = (f: FuenteProyeccion) => FUENTES[f];

  /** Presupuesto vigente hoy (flag `vigente` del backend), o null si la vivienda no tiene. */
  protected readonly vigente = computed(() => this.lista().find((p) => p.vigente) ?? null);
  /** Presupuestos que no rigen hoy: programados (empiezan después) o finalizados. */
  protected readonly otros = computed(() => {
    const idVigente = this.vigente()?.id_presupuesto;
    return this.lista().filter((p) => p.id_presupuesto !== idVigente);
  });
  protected readonly moneda = computed(() => this.proy()?.tarifa?.moneda ?? null);

  protected readonly resumen = computed<Resumen | null>(() => {
    const v = this.vigente();
    const e = this.estado();
    if (!v || !e) return null;
    const monto = v.monto_mensual;
    const acumulado = e.monto_acumulado;
    return {
      monto,
      acumulado,
      proyectado: e.monto_proyectado,
      disponible: acumulado === null ? null : r2(monto - acumulado),
      pctUsado: acumulado === null ? null : r2((acumulado / monto) * 100),
      pctProyectado: e.porcentaje_proyectado,
      nivel: e.nivel,
      motivo: e.motivo,
      umbrales: e.umbrales,
      superado: acumulado !== null && acumulado > monto,
    };
  });

  /** Mensaje de estado: dentro / cerca del límite / excedido / sin base para evaluar. */
  protected readonly banner = computed<Banner | null>(() => {
    const r = this.resumen();
    if (!r) return null;
    const pct = r.pctProyectado === null ? '' : `${fmtNum(r.pctProyectado, 1)} %`;
    if (r.superado) {
      return {
        tono: 'danger',
        titulo: 'Ya superaste tu presupuesto',
        texto: `Tu gasto estimado hasta hoy (${this.montoTexto(r.acumulado)}) supera tu presupuesto mensual (${this.montoTexto(r.monto)}) por ${this.montoTexto(r.acumulado! - r.monto)}.`,
        enlace: null,
      };
    }
    switch (r.nivel) {
      case 'ROJO':
        return {
          tono: 'danger',
          titulo: 'La proyección supera tu límite',
          texto: `Al ritmo actual cerrarías el ciclo en ${pct} de tu presupuesto (alerta roja desde ${fmtNum(r.umbrales.superado, 0)} %).`,
          enlace: null,
        };
      case 'AMARILLO':
        return {
          tono: 'warn',
          titulo: 'Cerca del límite',
          texto: `Al ritmo actual cerrarías el ciclo en ${pct} de tu presupuesto (aviso desde ${fmtNum(r.umbrales.proximo, 0)} %).`,
          enlace: null,
        };
      case 'VERDE':
        return {
          tono: 'ok',
          titulo: 'Dentro de tu presupuesto',
          texto: `Al ritmo actual cerrarías el ciclo en ${pct} de tu presupuesto.`,
          enlace: null,
        };
      default:
        if (r.motivo === 'SIN_TARIFA') {
          return {
            tono: 'neutral',
            titulo: 'Todavía no podemos evaluar tu presupuesto',
            texto: 'Tu vivienda no tiene una tarifa asignada, así que no se pueden estimar montos.',
            enlace: { texto: 'Elegir tarifa', ruta: '/vivienda' },
          };
        }
        if (r.motivo === 'SIN_DATOS') {
          return {
            tono: 'neutral',
            titulo: 'Aún no hay consumo para evaluar',
            texto: 'Registra lecturas del medidor o las horas de uso de tus equipos para comparar tu consumo con el presupuesto.',
            enlace: { texto: 'Ir a Consumo', ruta: '/consumo' },
          };
        }
        return { tono: 'neutral', titulo: 'Sin evaluación disponible', texto: 'No hay datos suficientes para evaluar el presupuesto.', enlace: null };
    }
  });

  protected readonly barraUsado = computed(() => clamp(this.resumen()?.pctUsado ?? 0));
  protected readonly barraProyectado = computed(() => clamp(this.resumen()?.pctProyectado ?? 0));

  private dataSub: Subscription | null = null;

  constructor() {
    this.cargarViviendas();
    // Cada vez que cambia la vivienda seleccionada (ya validada) se piden sus datos.
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
          if (id === null) this.dataSub?.unsubscribe();
          this.viviendasStatus.set('ready');
          // Si la selección no cambió el efecto no se dispara: se refresca explícitamente.
          if (id !== null && this.status() !== 'loading') this.cargarDatos(id, { silencioso: true });
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
    if (id !== null) this.cargarDatos(id, { silencioso: false });
  }

  /**
   * Presupuestos, semáforo y proyección de la vivienda. Al cambiar de vivienda se cancela la petición anterior
   * y se descartan los datos previos, para no mezclar viviendas.
   * `silencioso`: refresca sin mostrar el esqueleto de carga (tras guardar el presupuesto).
   */
  private cargarDatos(idVivienda: number, op: { silencioso: boolean }): void {
    this.dataSub?.unsubscribe();
    if (!op.silencioso) {
      this.status.set('loading');
      this.loadError.set(null);
      this.lista.set([]);
      this.estado.set(null);
      this.proy.set(null);
    }
    this.dataSub = forkJoin({
      lista: this.presupuestoService.listar(idVivienda),
      estado: this.presupuestoService.estado(idVivienda),
      proy: this.consumoService.proyeccion(idVivienda),
    }).subscribe({
      next: ({ lista, estado, proy }) => {
        this.lista.set(lista);
        this.estado.set(estado);
        this.proy.set(proy);
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

  protected seleccionarVivienda(id: number): void {
    if (id === this.selectedId()) return;
    this.aviso.set(null);
    this.seleccion.seleccionar(id);
  }

  /* ----- Configuración ----- */

  protected abrirDialogo(): void {
    if (this.selectedId() === null) return;
    this.aviso.set(null);
    this.dialogoAbierto.set(true);
  }

  protected cerrarDialogo(): void {
    this.dialogoAbierto.set(false);
  }

  protected alGuardar(): void {
    const editando = this.vigente() !== null;
    this.dialogoAbierto.set(false);
    this.aviso.set({ tipo: 'success', texto: editando ? 'Presupuesto actualizado.' : 'Presupuesto configurado.' });
    const id = this.selectedId();
    if (id !== null) this.cargarDatos(id, { silencioso: true });
  }

  /** La vivienda o el presupuesto ya no existen en el servidor: se vuelve a pedir todo. */
  protected alDesaparecer(): void {
    this.refrescarTodo('Esa información ya no existe, así que actualizamos tus datos.');
  }

  private refrescarTodo(texto: string): void {
    this.dialogoAbierto.set(false);
    this.cargarViviendas();
    this.aviso.set({ tipo: 'info', texto });
  }

  /** Monto con la moneda de la tarifa; sin tarifa se muestra el número solo. */
  protected montoTexto(valor: number | null): string {
    if (valor === null) return '—';
    const m = this.moneda();
    return m === null ? fmtNum(valor, 2) : fmtMonto(valor, m);
  }

  /** Un presupuesto que no rige hoy: programado si empieza después de la fecha del backend, si no, finalizado. */
  protected estadoVigencia(p: PresupuestoDto): 'Programado' | 'Finalizado' {
    const hoy = this.proy()?.fecha_referencia ?? '';
    return p.vigente_desde > hoy ? 'Programado' : 'Finalizado';
  }
}
