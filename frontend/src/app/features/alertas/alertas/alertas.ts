import { Component, DestroyRef, Injector, WritableSignal, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AlertaConfig, CanalAlerta, TipoAlerta } from '../../../core/models/alerta.models';
import { EstadoPresupuesto, MotivoSinNivel } from '../../../core/models/presupuesto.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { AlertaService } from '../../../core/services/alerta.service';
import { ViviendaSeleccionService } from '../../../core/services/vivienda-seleccion.service';
import { ViviendaService } from '../../../core/services/vivienda.service';
import { mensajeAlertaAmigable } from '../../../core/utils/alerta-mensajes';
import { toApiError } from '../../../core/utils/api-error';
import { Icon } from '../../../shared/icon/icon';
import { fmtDia, fmtNum } from '../../../shared/utils/format';
import { AlertaConfigDialog } from '../components/alerta-config-dialog/alerta-config-dialog';

type Status = 'loading' | 'ready' | 'error';
type Tono = 'ok' | 'warn' | 'danger' | 'neutral';
interface Aviso {
  tipo: 'success' | 'info';
  texto: string;
}

/** Mensaje principal del estado. Todo el contenido depende del `nivel` que decide el backend. */
interface Banner {
  tono: Tono;
  etiqueta: string;
  titulo: string;
  /** Explicación de lo que pasaría al cierre del ciclo (o de lo que falta para evaluar). */
  texto: string;
  /** Por qué el semáforo está en este color, según los porcentajes configurados. null si no se evaluó. */
  criterio: string | null;
  enlace: { texto: string; ruta: string } | null;
}

const TIPOS: Record<TipoAlerta, { nombre: string; descripcion: string }> = {
  UMBRAL_PROXIMO: {
    nombre: 'Aviso de que te acercas al límite',
    descripcion: 'El estado pasa a amarillo y te avisamos cuando la proyección del ciclo llega a este porcentaje de tu presupuesto.',
  },
  UMBRAL_SUPERADO: {
    nombre: 'Aviso de presupuesto superado',
    descripcion: 'El estado pasa a rojo y te avisamos cuando la proyección del ciclo llega a este porcentaje de tu presupuesto.',
  },
  CONSUMO_ANOMALO: {
    nombre: 'Aviso de consumo inusual',
    descripcion: 'Se activa cuando tu consumo proyectado llega a este porcentaje del consumo del mes anterior (130 % = 30 % más).',
  },
};

const CANALES: Record<CanalAlerta, string> = { APP: 'En la aplicación', EMAIL: 'Por correo' };

const clamp = (n: number) => Math.min(Math.max(n, 0), 100);

/**
 * Página /alertas. Muestra el semáforo del presupuesto de la vivienda seleccionada y permite ajustar
 * cuándo avisar. El nivel (VERDE/AMARILLO/ROJO), los porcentajes, los montos y los umbrales los entrega el
 * backend (/api/alertas/estado y /api/alertas/config); aquí solo se redactan textos y se dibujan las barras.
 */
@Component({
  selector: 'app-alertas',
  imports: [Icon, RouterLink, AlertaConfigDialog],
  templateUrl: './alertas.html',
  styleUrl: './alertas.css',
})
export class Alertas {
  private readonly viviendaService = inject(ViviendaService);
  private readonly alertaService = inject(AlertaService);
  private readonly seleccion = inject(ViviendaSeleccionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  // Viviendas (mismo mecanismo de selección que el resto de módulos)
  protected readonly viviendasStatus = signal<Status>('loading');
  protected readonly viviendasError = signal<string | null>(null);
  protected readonly viviendas = signal<Vivienda[]>([]);
  protected readonly selectedId = this.seleccion.id;
  protected readonly selected = computed(() => this.viviendas().find((v) => v.id_vivienda === this.selectedId()) ?? null);

  // Estado actual (semáforo)
  protected readonly estadoStatus = signal<Status>('loading');
  protected readonly estadoError = signal<string | null>(null);
  protected readonly estado = signal<EstadoPresupuesto | null>(null);

  // Configuración de avisos
  protected readonly configStatus = signal<Status>('loading');
  protected readonly configError = signal<string | null>(null);
  protected readonly configs = signal<AlertaConfig[]>([]);

  // Diálogo y avisos
  protected readonly dialogoAbierto = signal(false);
  protected readonly editando = signal<AlertaConfig | null>(null);
  protected readonly aviso = signal<Aviso | null>(null);

  protected readonly fmtNum = fmtNum;
  protected readonly fmtDia = fmtDia;
  protected readonly tipoNombre = (t: TipoAlerta) => TIPOS[t].nombre;
  protected readonly tipoDescripcion = (t: TipoAlerta) => TIPOS[t].descripcion;
  protected readonly canalNombre = (c: CanalAlerta) => CANALES[c];

  /**
   * Mensaje de estado según el `nivel` (o el `motivo` cuando el backend no pudo evaluar). El semáforo depende
   * de los porcentajes que configure la persona, por eso cada nivel explica con cuál se está comparando.
   */
  protected readonly banner = computed<Banner | null>(() => {
    const e = this.estado();
    if (!e) return null;
    const pct = e.porcentaje_proyectado === null ? '' : `${fmtNum(e.porcentaje_proyectado, 1)} %`;
    const texto = this.explicarProyeccion(e, pct);
    const aviso = `${fmtNum(e.umbrales.proximo, 0)} %`;
    const superado = `${fmtNum(e.umbrales.superado, 0)} %`;
    switch (e.nivel) {
      case 'ROJO':
        return {
          tono: 'danger',
          etiqueta: 'Rojo',
          titulo: 'Vas a superar tu presupuesto',
          texto,
          criterio:
            `Estás en rojo porque la proyección llegó al ${superado}, el porcentaje definido para el aviso de presupuesto superado.` +
            (e.umbrales.superado < 100 ? ' Es menor que el 100 % de tu presupuesto porque así lo configuraste, por eso el rojo aparece antes de llegar al límite.' : ''),
          enlace: null,
        };
      case 'AMARILLO':
        return {
          tono: 'warn',
          etiqueta: 'Amarillo',
          titulo: 'Te estás acercando al límite',
          texto,
          criterio: `Estás en amarillo porque la proyección pasó del ${aviso} (tu aviso de que te acercas al límite) y todavía no llega al ${superado} de presupuesto superado.`,
          enlace: null,
        };
      case 'VERDE':
        return {
          tono: 'ok',
          etiqueta: 'Verde',
          titulo: 'Vas bien con tu presupuesto',
          texto,
          criterio: `Estás en verde porque la proyección está por debajo del ${aviso}, el porcentaje en que empezamos a avisarte.`,
          enlace: null,
        };
      default:
        return this.sinEvaluacion(e.motivo);
    }
  });

  protected readonly evaluado = computed(() => this.estado()?.nivel != null);
  protected readonly barra = computed(() => {
    const e = this.estado();
    if (!e || e.porcentaje_proyectado === null) return null;
    // Solo escala visual: el 100 % de la barra es el mayor entre la proyección, el umbral rojo y 100.
    const max = Math.max(e.porcentaje_proyectado, e.umbrales.superado, 100);
    return {
      lleno: clamp((e.porcentaje_proyectado / max) * 100),
      proximo: clamp((e.umbrales.proximo / max) * 100),
      superado: clamp((e.umbrales.superado / max) * 100),
    };
  });

  /** Umbrales de aviso que se están usando realmente: los configurados y activos, o los predeterminados del sistema. */
  protected readonly usaPredeterminados = computed(() => {
    const activas = this.configs().filter((c) => c.activa === 1);
    return !activas.some((c) => c.tipo === 'UMBRAL_PROXIMO') || !activas.some((c) => c.tipo === 'UMBRAL_SUPERADO');
  });

  /** Los porcentajes del semáforo solo se rotulan como «tuyos» o «habituales» cuando ya se cargaron los avisos. */
  protected readonly origenUmbrales = computed<'propios' | 'habituales' | null>(() => {
    if (this.configStatus() !== 'ready') return null;
    return this.usaPredeterminados() ? 'habituales' : 'propios';
  });

  private estadoSub: Subscription | null = null;
  private configSub: Subscription | null = null;

  constructor() {
    this.cargarViviendas();
    // Cada vez que cambia la vivienda seleccionada (ya validada) se piden sus datos.
    effect(
      () => {
        const id = this.selectedId();
        if (this.viviendasStatus() !== 'ready' || id === null) return;
        untracked(() => this.cargarTodo(id, { silencioso: false }));
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
          if (id === null) this.cancelar();
          this.viviendasStatus.set('ready');
          // Si la selección no cambió el efecto no se dispara: se refresca explícitamente.
          if (id !== null && this.estadoStatus() !== 'loading') this.cargarTodo(id, { silencioso: true });
        },
        error: (err: unknown) => {
          const error = toApiError(err);
          this.viviendasError.set(error.status === 401 ? null : mensajeAlertaAmigable(error.message));
          this.viviendasStatus.set('error');
        },
      });
  }

  /** Reintento general: si fallaron las viviendas las pide de nuevo; si no, vuelve a pedir lo que falló. */
  protected reintentar(): void {
    if (this.viviendasStatus() === 'error') {
      this.cargarViviendas();
      return;
    }
    const id = this.selectedId();
    if (id === null) return;
    if (this.estadoStatus() === 'error') this.cargarEstado(id, { silencioso: false });
    if (this.configStatus() === 'error') this.cargarConfig(id, { silencioso: false });
  }

  protected reintentarConfig(): void {
    const id = this.selectedId();
    if (id !== null) this.cargarConfig(id, { silencioso: false });
  }

  private cancelar(): void {
    this.estadoSub?.unsubscribe();
    this.configSub?.unsubscribe();
  }

  /**
   * Al cambiar de vivienda se cancelan las peticiones anteriores y se descartan los datos previos
   * para no mezclar viviendas ni mostrar información vieja mientras carga la nueva.
   */
  private cargarTodo(idVivienda: number, op: { silencioso: boolean }): void {
    this.cargarEstado(idVivienda, op);
    this.cargarConfig(idVivienda, op);
  }

  private cargarEstado(idVivienda: number, op: { silencioso: boolean }): void {
    this.estadoSub?.unsubscribe();
    if (!op.silencioso) {
      this.estadoStatus.set('loading');
      this.estadoError.set(null);
      this.estado.set(null);
    }
    this.estadoSub = this.alertaService.estado(idVivienda).subscribe({
      next: (e) => {
        this.estado.set(e);
        this.estadoStatus.set('ready');
      },
      error: (err: unknown) => this.fallo(err, this.estadoStatus, this.estadoError),
    });
  }

  private cargarConfig(idVivienda: number, op: { silencioso: boolean }): void {
    this.configSub?.unsubscribe();
    if (!op.silencioso) {
      this.configStatus.set('loading');
      this.configError.set(null);
      this.configs.set([]);
    }
    this.configSub = this.alertaService.listarConfig(idVivienda).subscribe({
      next: (lista) => {
        this.configs.set(lista);
        this.configStatus.set('ready');
      },
      error: (err: unknown) => this.fallo(err, this.configStatus, this.configError),
    });
  }

  private fallo(err: unknown, status: WritableSignal<Status>, message: WritableSignal<string | null>): void {
    const error = toApiError(err);
    if (error.status === 401) return; // el interceptor cierra la sesión y redirige
    if (error.status === 404) {
      // La vivienda ya no existe o no es del usuario: se vuelve a pedir la lista y se descarta lo anterior.
      this.refrescarTodo('Esa vivienda ya no está disponible, así que actualizamos tu lista.');
      return;
    }
    message.set(mensajeAlertaAmigable(error.message));
    status.set('error');
  }

  protected seleccionarVivienda(id: number): void {
    if (id === this.selectedId()) return;
    this.aviso.set(null);
    this.seleccion.seleccionar(id);
  }

  /* ----- Configuración ----- */

  protected abrirNuevo(): void {
    if (this.selectedId() === null) return;
    this.aviso.set(null);
    this.editando.set(null);
    this.dialogoAbierto.set(true);
  }

  protected abrirEditar(c: AlertaConfig): void {
    this.aviso.set(null);
    this.editando.set(c);
    this.dialogoAbierto.set(true);
  }

  protected cerrarDialogo(): void {
    this.dialogoAbierto.set(false);
  }

  protected alGuardar(): void {
    const editando = this.editando() !== null;
    this.dialogoAbierto.set(false);
    this.aviso.set({ tipo: 'success', texto: editando ? 'Aviso actualizado.' : 'Aviso agregado.' });
    // Los umbrales cambian el semáforo: se vuelve a pedir todo sin mostrar el esqueleto.
    const id = this.selectedId();
    if (id !== null) this.cargarTodo(id, { silencioso: true });
  }

  /** La vivienda o el aviso ya no existen en el servidor: se vuelve a pedir todo. */
  protected alDesaparecer(): void {
    this.refrescarTodo('Esa información ya no existe, así que actualizamos tus datos.');
  }

  private refrescarTodo(texto: string): void {
    this.dialogoAbierto.set(false);
    this.cancelar();
    this.estado.set(null);
    this.configs.set([]);
    this.cargarViviendas();
    this.aviso.set({ tipo: 'info', texto });
  }

  private sinEvaluacion(motivo: MotivoSinNivel | null): Banner {
    const base = { tono: 'neutral' as const, etiqueta: 'Sin evaluar', criterio: null, enlace: null };
    switch (motivo) {
      case 'SIN_PRESUPUESTO':
        return {
          ...base,
          titulo: 'Aún no tienes un presupuesto',
          texto: 'Para decirte si vas bien necesitamos comparar tu consumo con un presupuesto mensual.',
          enlace: { texto: 'Configurar presupuesto', ruta: '/presupuesto' },
        };
      case 'SIN_TARIFA':
        return {
          ...base,
          titulo: 'Todavía no podemos evaluar tu consumo',
          texto: 'Tu vivienda no tiene una tarifa asignada, así que no se pueden estimar montos.',
          enlace: { texto: 'Elegir tarifa', ruta: '/vivienda' },
        };
      case 'SIN_DATOS':
        return {
          ...base,
          titulo: 'Aún no hay consumo para evaluar',
          texto: 'Registra lecturas del medidor o las horas de uso de tus equipos para calcular tu proyección.',
          enlace: { texto: 'Ir a Consumo', ruta: '/consumo' },
        };
      default:
        return { ...base, titulo: 'Sin evaluación disponible', texto: 'No hay datos suficientes para evaluar tu presupuesto.' };
    }
  }

  /** Una sola frase con la proyección: monto estimado al cierre y qué parte del presupuesto representa. */
  private explicarProyeccion(e: EstadoPresupuesto, pct: string): string {
    const presupuesto = e.presupuesto ? this.monto(e.presupuesto.monto_mensual) : '';
    return `Si mantienes tu consumo actual, gastarías aproximadamente ${this.monto(e.monto_proyectado)} este ciclo. Eso representa el ${pct} de tu presupuesto de ${presupuesto}.`;
  }

  /** Estimación de montos: cifras con dos decimales (el endpoint de estado no informa la moneda). */
  protected monto(valor: number | null): string {
    return valor === null ? '—' : fmtNum(valor, 2);
  }
}
