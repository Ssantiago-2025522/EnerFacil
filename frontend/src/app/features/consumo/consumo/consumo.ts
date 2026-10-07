import { Component, DestroyRef, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import {
  DesgloseElectrodomestico,
  FuenteProyeccion,
  LecturaMedidor,
  PeriodoConsumo,
  PeriodoDetalle,
  Proyeccion,
  RegistroUso,
} from '../../../core/models/consumo.models';
import { Electrodomestico } from '../../../core/models/electrodomestico.models';
import { Vivienda } from '../../../core/models/vivienda.models';
import { ConsumoService } from '../../../core/services/consumo.service';
import { ElectrodomesticoService } from '../../../core/services/electrodomestico.service';
import { ViviendaSeleccionService } from '../../../core/services/vivienda-seleccion.service';
import { ViviendaService } from '../../../core/services/vivienda.service';
import { toApiError } from '../../../core/utils/api-error';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/icon/icon';
import { fmtDia, fmtFechaHora, fmtMonto, fmtNum } from '../../../shared/utils/format';
import { ModoRegistro, RegistroDialog } from '../components/registro-dialog/registro-dialog';

type Status = 'loading' | 'ready' | 'error';
type DetalleStatus = 'idle' | 'loading' | 'ready' | 'error';
type Vista = 'resumen' | 'lecturas' | 'usos';
type Dialogo = 'ninguno' | 'lectura' | 'uso' | 'editar-uso' | 'borrar-lectura' | 'borrar-uso';
/** 'actual' = ciclo en curso (proyección); número = id_periodo guardado. */
type PeriodoSel = 'actual' | number;
interface Aviso {
  tipo: 'success' | 'info';
  texto: string;
}

/** Datos del periodo elegido, ya listos para mostrar (todo viene del backend). */
interface ResumenPeriodo {
  esActual: boolean;
  inicio: string;
  fin: string;
  kwh: number;
  kwhProyectado: number;
  montoAcumulado: number | null;
  montoProyectado: number | null;
  cerrado: boolean;
  fuente: FuenteProyeccion | null;
  promedioDiario: number | null;
  diasTranscurridos: number | null;
  diasTotales: number | null;
  calculadoEn: string | null;
}

interface FilaHistorial {
  sel: PeriodoSel;
  inicio: string;
  fin: string;
  kwh: number;
  kwhProyectado: number;
  monto: number | null;
  cerrado: boolean;
}

interface Barra {
  key: string;
  label: string;
  title: string;
  valor: number;
  heightPx: number;
  accumulatedPct: number;
  actual: boolean;
}

interface FilaConsumo {
  id: number | null;
  nombre: string;
  kwh: number;
  porcentaje: number;
}

const FUENTES: Record<FuenteProyeccion, string> = {
  LECTURAS: 'Lecturas del medidor',
  REGISTROS_USO: 'Horas de uso registradas',
  ESTIMACION: 'Estimación de tus equipos',
  SIN_DATOS: 'Sin datos',
};
const MAX_BAR_PX = 140;
const MAX_BARRAS = 12;

/**
 * Página /consumo (Consumo / Historial). Todo lo que muestra viene de /api/consumo:
 * ciclo en curso (proyección), periodos guardados con su desglose por equipo, y los registros
 * (lecturas del medidor y horas de uso) que alimentan el cálculo. No recalcula consumos ni montos.
 */
@Component({
  selector: 'app-consumo',
  imports: [Icon, RouterLink, RegistroDialog, ConfirmDialog],
  templateUrl: './consumo.html',
  styleUrl: './consumo.css',
})
export class Consumo {
  private readonly viviendaService = inject(ViviendaService);
  private readonly consumoService = inject(ConsumoService);
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
  protected readonly proy = signal<Proyeccion | null>(null);
  protected readonly periodos = signal<PeriodoConsumo[]>([]);
  protected readonly electros = signal<Electrodomestico[]>([]);
  protected readonly lecturas = signal<LecturaMedidor[]>([]);
  protected readonly usos = signal<RegistroUso[]>([]);

  // Selección y detalle
  protected readonly vista = signal<Vista>('resumen');
  protected readonly periodoSel = signal<PeriodoSel>('actual');
  private readonly detalles = signal<Record<number, PeriodoDetalle>>({});
  protected readonly detalleStatus = signal<DetalleStatus>('idle');
  protected readonly recalculando = signal(false);
  protected readonly recalcError = signal<string | null>(null);

  // Diálogos
  protected readonly dialogo = signal<Dialogo>('ninguno');
  protected readonly actualLectura = signal<LecturaMedidor | null>(null);
  protected readonly actualUso = signal<RegistroUso | null>(null);
  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly aviso = signal<Aviso | null>(null);

  protected readonly fmtNum = fmtNum;
  protected readonly fmtDia = fmtDia;
  protected readonly fmtFechaHora = fmtFechaHora;
  protected readonly fuenteLabel = (f: FuenteProyeccion) => FUENTES[f];

  /** Periodo guardado que corresponde al ciclo en curso (mismo inicio), si el cálculo/cron ya lo guardó. */
  protected readonly cicloGuardado = computed(() => {
    const inicio = this.proy()?.fecha_inicio;
    return this.periodos().find((p) => p.tipo === 'MENSUAL' && p.fecha_inicio === inicio) ?? null;
  });
  /** Periodos guardados anteriores al ciclo en curso (más recientes primero, como los entrega el backend). */
  protected readonly historial = computed(() => {
    const actual = this.cicloGuardado()?.id_periodo;
    return this.periodos().filter((p) => p.id_periodo !== actual);
  });
  protected readonly moneda = computed(() => this.proy()?.tarifa?.moneda ?? null);
  /** Nada que mostrar todavía: ni consumo, ni periodos guardados, ni registros. */
  protected readonly sinDatos = computed(
    () =>
      this.proy()?.fuente === 'SIN_DATOS' &&
      this.periodos().length === 0 &&
      this.lecturas().length === 0 &&
      this.usos().length === 0,
  );

  protected readonly opciones = computed(() => {
    const p = this.proy();
    const lista: { value: string; label: string }[] = [];
    if (p) lista.push({ value: 'actual', label: `Ciclo actual · ${fmtDia(p.fecha_inicio)} – ${fmtDia(p.fecha_fin)}` });
    for (const h of this.historial()) {
      lista.push({ value: String(h.id_periodo), label: `${fmtDia(h.fecha_inicio)} – ${fmtDia(h.fecha_fin)}` });
    }
    return lista;
  });

  protected readonly resumen = computed<ResumenPeriodo | null>(() => {
    const sel = this.periodoSel();
    const p = this.proy();
    if (sel === 'actual') {
      if (!p) return null;
      return {
        esActual: true,
        inicio: p.fecha_inicio,
        fin: p.fecha_fin,
        kwh: p.kwh_acumulado,
        kwhProyectado: p.kwh_proyectado,
        montoAcumulado: p.monto_acumulado,
        montoProyectado: p.monto_proyectado,
        cerrado: false,
        fuente: p.fuente,
        promedioDiario: p.promedio_diario_kwh,
        diasTranscurridos: p.dias_transcurridos,
        diasTotales: p.dias_totales,
        calculadoEn: this.cicloGuardado()?.calculado_en ?? null,
      };
    }
    const h = this.historial().find((x) => x.id_periodo === sel);
    if (!h) return null;
    const conTarifa = this.moneda() !== null;
    return {
      esActual: false,
      inicio: h.fecha_inicio,
      fin: h.fecha_fin,
      kwh: h.kwh_acumulado,
      kwhProyectado: h.kwh_proyectado,
      montoAcumulado: conTarifa ? h.monto_acumulado : null,
      montoProyectado: conTarifa ? h.monto_proyectado : null,
      cerrado: h.cerrado === 1,
      fuente: null,
      promedioDiario: null,
      diasTranscurridos: null,
      diasTotales: null,
      calculadoEn: h.calculado_en,
    };
  });

  /** Fuente de la proyección en texto: qué datos reales respaldan el cálculo. */
  protected readonly fuenteDetalle = computed(() => {
    const p = this.proy();
    if (!p) return '';
    switch (p.fuente) {
      case 'LECTURAS': {
        const l = p.fuentes.lecturas;
        return l
          ? `Calculado con tus lecturas del medidor (del ${fmtDia(l.fecha_lectura_base)} al ${fmtDia(l.fecha_ultima_lectura)}).`
          : 'Calculado con tus lecturas del medidor.';
      }
      case 'REGISTROS_USO': {
        const r = p.fuentes.registros_uso;
        return `Calculado con las horas de uso registradas${r ? ` (${r.dias_con_datos} ${r.dias_con_datos === 1 ? 'día' : 'días'} con datos)` : ''}.`;
      }
      case 'ESTIMACION':
        return 'Todavía no hay consumo medido: la proyección usa el consumo mensual estimado de tus electrodomésticos activos.';
      default:
        return '';
    }
  });

  private readonly idDetalle = computed<number | null>(() => {
    const sel = this.periodoSel();
    return sel === 'actual' ? (this.cicloGuardado()?.id_periodo ?? null) : sel;
  });
  protected readonly detalle = computed(() => {
    const id = this.idDetalle();
    return id === null ? null : (this.detalles()[id] ?? null);
  });

  /** kWh reales por equipo (consumo_electrodomestico_periodo), ya calculados por el backend. */
  protected readonly porEquipo = computed<FilaConsumo[]>(() =>
    (this.detalle()?.desglose ?? []).map((d: DesgloseElectrodomestico) => ({
      id: d.id_electrodomestico,
      nombre: d.nombre,
      kwh: d.kwh,
      porcentaje: d.porcentaje_total,
    })),
  );
  protected readonly totalDesglose = computed(() => this.porEquipo().reduce((s, f) => s + f.kwh, 0));

  /** Suma, por ambiente, de los kWh por equipo del desglose (el backend no agrupa por ambiente). */
  protected readonly porAmbiente = computed<FilaConsumo[]>(() => {
    const total = this.totalDesglose();
    const ubicacion = new Map(this.electros().map((e) => [e.id_electrodomestico, e] as const));
    const grupos = new Map<string, FilaConsumo>();
    for (const fila of this.porEquipo()) {
      const e = ubicacion.get(fila.id ?? -1);
      const idAmb = e?.id_ambiente ?? null;
      const clave = String(idAmb);
      const nombre = idAmb === null ? 'Sin ambiente' : (e?.ambiente ?? 'Sin ambiente');
      const actual = grupos.get(clave);
      if (actual) actual.kwh += fila.kwh;
      else grupos.set(clave, { id: idAmb, nombre, kwh: fila.kwh, porcentaje: 0 });
    }
    return [...grupos.values()]
      .map((g) => ({ ...g, porcentaje: total > 0 ? Math.round((g.kwh / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.kwh - a.kwh);
  });

  protected readonly filas = computed<FilaHistorial[]>(() => {
    const filas: FilaHistorial[] = [];
    const p = this.proy();
    if (p && p.fuente !== 'SIN_DATOS') {
      filas.push({
        sel: 'actual',
        inicio: p.fecha_inicio,
        fin: p.fecha_fin,
        kwh: p.kwh_acumulado,
        kwhProyectado: p.kwh_proyectado,
        monto: p.monto_proyectado,
        cerrado: false,
      });
    }
    const conTarifa = this.moneda() !== null;
    for (const h of this.historial()) {
      filas.push({
        sel: h.id_periodo,
        inicio: h.fecha_inicio,
        fin: h.fecha_fin,
        kwh: h.kwh_acumulado,
        kwhProyectado: h.kwh_proyectado,
        monto: conTarifa ? (h.cerrado === 1 ? h.monto_acumulado : h.monto_proyectado) : null,
        cerrado: h.cerrado === 1,
      });
    }
    return filas;
  });

  protected readonly barras = computed<Barra[]>(() => {
    const items: Omit<Barra, 'heightPx'>[] = [];
    for (const h of [...this.historial()].reverse().slice(-MAX_BARRAS)) {
      items.push({
        key: `p${h.id_periodo}`,
        label: fmtDia(h.fecha_inicio, 'short'),
        title: `${fmtDia(h.fecha_inicio)} – ${fmtDia(h.fecha_fin)}: ${fmtNum(h.kwh_acumulado, 1)} kWh`,
        valor: h.kwh_acumulado,
        accumulatedPct: 0,
        actual: false,
      });
    }
    const p = this.proy();
    if (p && p.fuente !== 'SIN_DATOS') {
      const total = Math.max(p.kwh_proyectado, p.kwh_acumulado);
      items.push({
        key: 'actual',
        label: fmtDia(p.fecha_inicio, 'short'),
        title: `Ciclo actual: ${fmtNum(p.kwh_acumulado, 1)} kWh acumulados, ${fmtNum(p.kwh_proyectado, 1)} kWh proyectados`,
        valor: total,
        accumulatedPct: total > 0 ? (p.kwh_acumulado / total) * 100 : 0,
        actual: true,
      });
    }
    const max = Math.max(...items.map((i) => i.valor), 1);
    return items.map((i) => ({ ...i, heightPx: Math.max(Math.round((i.valor / max) * MAX_BAR_PX), i.valor > 0 ? 3 : 0) }));
  });

  private dataSub: Subscription | null = null;
  private detalleSub: Subscription | null = null;

  constructor() {
    this.cargarViviendas();
    // Cada vez que cambia la vivienda seleccionada (ya validada) se piden sus datos.
    effect(
      () => {
        const id = this.selectedId();
        if (this.viviendasStatus() !== 'ready' || id === null) return;
        untracked(() => this.cargarDatos(id, { reiniciar: true, silencioso: false }));
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
          if (id !== null && this.status() !== 'loading') this.cargarDatos(id, { reiniciar: false, silencioso: true });
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
    if (id !== null) this.cargarDatos(id, { reiniciar: false, silencioso: false });
  }

  /**
   * Proyección, periodos guardados, equipos y registros de la vivienda.
   * `silencioso`: refresca sin mostrar el esqueleto de carga (tras registrar/eliminar algo).
   */
  private cargarDatos(idVivienda: number, op: { reiniciar: boolean; silencioso: boolean }): void {
    this.dataSub?.unsubscribe();
    this.detalleSub?.unsubscribe();
    if (op.reiniciar) {
      this.periodoSel.set('actual');
      this.vista.set('resumen');
    }
    if (!op.silencioso) {
      this.status.set('loading');
      this.loadError.set(null);
    }
    this.dataSub = forkJoin({
      proy: this.consumoService.proyeccion(idVivienda),
      periodos: this.consumoService.periodos(idVivienda),
      electros: this.electroService.listar(idVivienda),
      lecturas: this.consumoService.lecturas(idVivienda),
      usos: this.consumoService.usos(idVivienda),
    }).subscribe({
      next: ({ proy, periodos, electros, lecturas, usos }) => {
        this.proy.set(proy);
        this.periodos.set(periodos);
        this.electros.set(electros);
        this.lecturas.set(lecturas);
        this.usos.set(usos);
        this.detalles.set({}); // los desgloses guardados pudieron cambiar
        const sel = this.periodoSel();
        if (sel !== 'actual' && !this.historial().some((h) => h.id_periodo === sel)) this.periodoSel.set('actual');
        this.status.set('ready');
        this.cargarDetalle();
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

  /** Pide el desglose del periodo mostrado (si está guardado y todavía no se ha pedido). */
  protected cargarDetalle(): void {
    this.detalleSub?.unsubscribe();
    const id = this.idDetalle();
    if (id === null) {
      this.detalleStatus.set('idle');
      return;
    }
    if (this.detalles()[id]) {
      this.detalleStatus.set('ready');
      return;
    }
    this.detalleStatus.set('loading');
    this.detalleSub = this.consumoService.periodo(id).subscribe({
      next: (d) => {
        this.detalles.update((m) => ({ ...m, [id]: d }));
        this.detalleStatus.set('ready');
      },
      error: (err: unknown) => {
        if (toApiError(err).status === 401) return;
        this.detalleStatus.set('error');
      },
    });
  }

  protected seleccionarVivienda(id: number): void {
    if (id === this.selectedId()) return;
    this.aviso.set(null);
    this.seleccion.seleccionar(id);
  }

  protected cambiarVista(v: Vista): void {
    this.vista.set(v);
  }

  protected onPeriodo(valor: string): void {
    this.elegirPeriodo(valor === 'actual' ? 'actual' : Number(valor));
  }

  protected elegirPeriodo(sel: PeriodoSel): void {
    this.periodoSel.set(sel);
    this.recalcError.set(null);
    this.vista.set('resumen');
    this.cargarDetalle();
  }

  /** POST /periodos/calcular: guarda el ciclo en curso (igual que el cron) y trae su desglose. */
  protected recalcular(): void {
    const id = this.selectedId();
    if (id === null || this.recalculando()) return;
    this.recalculando.set(true);
    this.recalcError.set(null);
    this.consumoService
      .calcularPeriodo(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ periodo, proyeccion }) => {
          this.recalculando.set(false);
          // Si mientras tanto se cambió de vivienda, esta respuesta ya no corresponde a lo que se ve.
          if (this.selectedId() !== id) return;
          const fila: PeriodoConsumo = {
            id_periodo: periodo.id_periodo,
            id_vivienda: periodo.id_vivienda,
            tipo: periodo.tipo,
            fecha_inicio: periodo.fecha_inicio,
            fecha_fin: periodo.fecha_fin,
            kwh_acumulado: periodo.kwh_acumulado,
            kwh_proyectado: periodo.kwh_proyectado,
            monto_acumulado: periodo.monto_acumulado,
            monto_proyectado: periodo.monto_proyectado,
            cerrado: periodo.cerrado,
            calculado_en: periodo.calculado_en,
          };
          this.proy.set(proyeccion);
          this.periodos.update((lista) =>
            [...lista.filter((p) => p.id_periodo !== fila.id_periodo), fila].sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio)),
          );
          this.detalles.update((m) => ({ ...m, [periodo.id_periodo]: periodo }));
          this.detalleStatus.set('ready');
          this.aviso.set({ tipo: 'success', texto: 'Periodo recalculado con tus datos más recientes.' });
        },
        error: (err: unknown) => {
          const error = toApiError(err);
          this.recalculando.set(false);
          if (error.status === 401) return;
          this.recalcError.set(error.message);
        },
      });
  }

  /* ----- Registro ----- */

  protected abrirRegistro(modo: ModoRegistro): void {
    if (this.selectedId() === null) return;
    this.aviso.set(null);
    this.actualUso.set(null);
    this.dialogo.set(modo);
  }

  protected abrirEditarUso(u: RegistroUso): void {
    this.aviso.set(null);
    this.actualUso.set(u);
    this.dialogo.set('editar-uso');
  }

  protected abrirBorrarLectura(l: LecturaMedidor): void {
    this.aviso.set(null);
    this.deleteError.set(null);
    this.actualLectura.set(l);
    this.dialogo.set('borrar-lectura');
  }

  protected abrirBorrarUso(u: RegistroUso): void {
    this.aviso.set(null);
    this.deleteError.set(null);
    this.actualUso.set(u);
    this.dialogo.set('borrar-uso');
  }

  protected cerrarDialogo(): void {
    if (this.deleting()) return;
    this.dialogo.set('ninguno');
    this.actualUso.set(null);
    this.actualLectura.set(null);
  }

  /** Tras guardar o borrar, se vuelve a pedir todo: la proyección depende de los registros. */
  private alCambiarRegistros(texto: string): void {
    this.dialogo.set('ninguno');
    this.actualUso.set(null);
    this.actualLectura.set(null);
    this.deleting.set(false);
    this.aviso.set({ tipo: 'success', texto });
    const id = this.selectedId();
    if (id !== null) this.cargarDatos(id, { reiniciar: false, silencioso: true });
  }

  protected alGuardarLectura(): void {
    this.alCambiarRegistros('Lectura registrada. Actualizamos tu consumo.');
  }

  protected alGuardarUso(): void {
    const editando = this.dialogo() === 'editar-uso';
    this.alCambiarRegistros(editando ? 'Registro de uso actualizado.' : 'Uso registrado. Actualizamos tu consumo.');
  }

  /** Algo ya no existe en el servidor (borrado desde otro lugar): se refresca todo. */
  protected alDesaparecer(): void {
    this.refrescarTodo('Ese registro ya no existe, así que actualizamos tu información.');
  }

  private refrescarTodo(texto: string): void {
    this.dialogo.set('ninguno');
    this.actualUso.set(null);
    this.actualLectura.set(null);
    this.deleting.set(false);
    this.cargarViviendas();
    this.aviso.set({ tipo: 'info', texto });
  }

  protected confirmarBorrado(): void {
    if (this.deleting()) return;
    const lectura = this.dialogo() === 'borrar-lectura' ? this.actualLectura() : null;
    const uso = this.dialogo() === 'borrar-uso' ? this.actualUso() : null;
    const request$ = lectura
      ? this.consumoService.eliminarLectura(lectura.id_lectura)
      : uso
        ? this.consumoService.eliminarUso(uso.id_registro)
        : null;
    if (!request$) return;

    this.deleting.set(true);
    this.deleteError.set(null);
    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.alCambiarRegistros(lectura ? 'Lectura eliminada. Actualizamos tu consumo.' : 'Registro de uso eliminado. Actualizamos tu consumo.'),
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

  protected montoTexto(valor: number | null): string {
    const m = this.moneda();
    return valor === null || m === null ? '—' : fmtMonto(valor, m);
  }
}
