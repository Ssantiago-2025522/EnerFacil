import { Component, ElementRef, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Ambiente } from '../../../../core/models/ambiente.models';
import {
  CatalogoElectrodomestico,
  ELECTRO_LIMITES,
  Electrodomestico,
} from '../../../../core/models/electrodomestico.models';
import { ElectrodomesticoService } from '../../../../core/services/electrodomestico.service';
import { ApiError, toApiError } from '../../../../core/utils/api-error';
import { FieldKind, controlError } from '../../../../core/utils/form-errors';
import { nombreElectroValidator, numeroValidator } from '../../../../core/validators/electrodomestico.validators';
import { Icon } from '../../../../shared/icon/icon';

type Campo = 'nombre' | 'potencia_w' | 'cantidad' | 'horas_uso_dia' | 'dias_uso_mes' | 'factor_uso';
const CAMPOS: readonly string[] = ['nombre', 'potencia_w', 'cantidad', 'horas_uso_dia', 'dias_uso_mes', 'factor_uso', 'id_ambiente'];
const KIND: Record<Campo, FieldKind> = {
  nombre: 'electroNombre',
  potencia_w: 'electroPotencia',
  cantidad: 'electroCantidad',
  horas_uso_dia: 'electroHoras',
  dias_uso_mes: 'electroDias',
  factor_uso: 'electroFactor',
};

/**
 * Modal para crear (electrodomestico = null) o editar un electrodoméstico. Hace la petición y avisa con (saved).
 * Al crear usa `idVivienda`; el ambiente se elige solo entre los de esa vivienda.
 */
@Component({
  selector: 'app-electrodomestico-form-dialog',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './electrodomestico-form-dialog.html',
  styleUrl: './electrodomestico-form-dialog.css',
})
export class ElectrodomesticoFormDialog implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(ElectrodomesticoService);

  /** Electrodoméstico a editar; null para crear uno nuevo. */
  readonly electrodomestico = input<Electrodomestico | null>(null);
  readonly idVivienda = input.required<number>();
  /** Ambientes de la vivienda seleccionada. */
  readonly ambientes = input<Ambiente[]>([]);
  /** Ambiente preseleccionado al crear (el que se está filtrando). */
  readonly ambienteInicial = input<number | null>(null);
  readonly catalogo = input<CatalogoElectrodomestico[]>([]);
  readonly catalogoStatus = input<'loading' | 'ready' | 'error'>('loading');

  readonly saved = output<Electrodomestico>();
  readonly closed = output<void>();
  /** El electrodoméstico, el ambiente o la vivienda ya no existen en el backend (404). */
  readonly gone = output<void>();
  readonly retryCatalogo = output<void>();

  protected readonly limites = ELECTRO_LIMITES;
  protected readonly editando = computed(() => this.electrodomestico() !== null);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  /** Catálogo agrupado por categoría (el backend ya lo entrega ordenado por categoría y nombre). */
  protected readonly grupos = computed(() => {
    const mapa = new Map<string, CatalogoElectrodomestico[]>();
    for (const item of this.catalogo()) mapa.set(item.categoria, [...(mapa.get(item.categoria) ?? []), item]);
    return [...mapa].map(([categoria, items]) => ({ categoria, items }));
  });

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly form = this.fb.group({
    catalogo: this.fb.control<number | null>(null),
    nombre: ['', [nombreElectroValidator]],
    id_ambiente: this.fb.control<number | null>(null),
    potencia_w: this.fb.control<number | null>(null, [numeroValidator({ min: 0, max: ELECTRO_LIMITES.potencia.max, minExclusivo: true })]),
    cantidad: this.fb.control<number | null>(1, [numeroValidator({ ...ELECTRO_LIMITES.cantidad, entero: true })]),
    horas_uso_dia: this.fb.control<number | null>(1, [numeroValidator(ELECTRO_LIMITES.horas)]),
    dias_uso_mes: this.fb.control<number | null>(30, [numeroValidator({ ...ELECTRO_LIMITES.dias, entero: true })]),
    factor_uso: this.fb.control<number | null>(1, [numeroValidator(ELECTRO_LIMITES.factor)]),
    activo: this.fb.control(true),
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      if (typeof el.showModal === 'function' && !el.open) el.showModal();
    });
    // Elegir un elemento del catálogo precarga nombre, potencia, horas y factor (el usuario puede cambiarlos).
    this.form.controls.catalogo.valueChanges.pipe(takeUntilDestroyed()).subscribe((id) => {
      const item = this.catalogo().find((c) => c.id_catalogo === id);
      if (!item) return;
      this.form.patchValue({
        nombre: item.nombre,
        potencia_w: item.potencia_w_promedio,
        horas_uso_dia: item.horas_uso_dia_promedio,
        factor_uso: item.factor_uso_promedio,
      });
    });
  }

  ngOnInit(): void {
    const e = this.electrodomestico();
    if (e) {
      this.form.patchValue({
        nombre: e.nombre,
        id_ambiente: e.id_ambiente,
        potencia_w: e.potencia_w,
        cantidad: e.cantidad,
        horas_uso_dia: e.horas_uso_dia,
        dias_uso_mes: e.dias_uso_mes,
        factor_uso: e.factor_uso,
        activo: e.activo === 1,
      });
    } else {
      this.form.controls.id_ambiente.setValue(this.ambienteInicial());
    }
  }

  protected error(field: Campo): string | null {
    return controlError(this.form.controls[field], KIND[field]);
  }

  protected submit(): void {
    if (this.submitting()) return;
    this.serverError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    // Los validadores garantizan que los números no son null.
    const datos = {
      id_ambiente: v.id_ambiente,
      nombre: v.nombre.trim(),
      potencia_w: v.potencia_w as number,
      cantidad: v.cantidad as number,
      horas_uso_dia: v.horas_uso_dia as number,
      dias_uso_mes: v.dias_uso_mes as number,
      factor_uso: v.factor_uso as number,
    };

    const actual = this.electrodomestico();
    const request$ = actual
      ? this.service.actualizar(actual.id_electrodomestico, { ...datos, activo: v.activo })
      : this.service.crear({
          id_vivienda: this.idVivienda(),
          ...datos,
          ...(v.catalogo !== null ? { id_catalogo: v.catalogo } : {}),
        });

    this.submitting.set(true);
    request$.subscribe({
      next: (electro) => {
        this.submitting.set(false);
        this.saved.emit(electro);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.showError(toApiError(err, { fields: CAMPOS }));
      },
    });
  }

  protected cerrar(): void {
    if (!this.submitting()) this.closed.emit();
  }

  protected onCancel(event: Event): void {
    event.preventDefault(); // evita que Esc cierre el <dialog> sin pasar por cerrar()
    this.cerrar();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cerrar();
  }

  private showError(error: ApiError): void {
    if (error.status === 401) return; // el interceptor ya cierra la sesión y redirige a /login
    if (error.status === 404) {
      this.gone.emit();
      return;
    }
    // Los mensajes por campo del backend vienen en inglés técnico: la validación local cubre los mismos casos.
    for (const campo of Object.keys(this.form.controls)) {
      if (error.fieldErrors[campo]) this.form.get(campo)?.setErrors({ server: 'Revisa este campo' });
    }
    this.serverError.set(error.message);
  }
}
