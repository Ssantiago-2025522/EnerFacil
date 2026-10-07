import { Component, ElementRef, OnInit, afterNextRender, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Tarifa } from '../../../../core/models/tarifa.models';
import { VIVIENDA_LIMITES, Vivienda, ViviendaPayload } from '../../../../core/models/vivienda.models';
import { ViviendaService } from '../../../../core/services/vivienda.service';
import { ApiError, toApiError } from '../../../../core/utils/api-error';
import { FieldKind, controlError } from '../../../../core/utils/form-errors';
import {
  enteroOpcionalValidator,
  nombreViviendaValidator,
  textoOpcionalValidator,
} from '../../../../core/validators/vivienda.validators';
import { Icon } from '../../../../shared/icon/icon';

type CampoVivienda = 'nombre' | 'direccion' | 'region' | 'num_habitantes' | 'dia_corte' | 'id_tarifa';
const CAMPOS: readonly CampoVivienda[] = ['nombre', 'direccion', 'region', 'num_habitantes', 'dia_corte', 'id_tarifa'];
const KIND: Record<Exclude<CampoVivienda, 'id_tarifa'>, FieldKind> = {
  nombre: 'viviendaNombre',
  direccion: 'viviendaDireccion',
  region: 'viviendaRegion',
  num_habitantes: 'viviendaHabitantes',
  dia_corte: 'viviendaDiaCorte',
};

/** Texto recortado o null si queda vacío (el backend rechaza strings vacíos en campos opcionales). */
const blankToNull = (value: string): string | null => value.trim() || null;

/** Modal para crear (vivienda = null) o editar una vivienda. Hace la petición y avisa con (saved). */
@Component({
  selector: 'app-vivienda-form-dialog',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './vivienda-form-dialog.html',
  styleUrl: './vivienda-form-dialog.css',
})
export class ViviendaFormDialog implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(ViviendaService);

  /** Vivienda a editar; null para crear una nueva. */
  readonly vivienda = input<Vivienda | null>(null);
  readonly tarifas = input<Tarifa[]>([]);
  readonly tarifasStatus = input<'loading' | 'ready' | 'error'>('loading');

  readonly saved = output<Vivienda>();
  readonly closed = output<void>();
  /** La vivienda ya no existe en el backend (404 al editar). */
  readonly gone = output<void>();
  readonly retryTarifas = output<void>();

  protected readonly limites = VIVIENDA_LIMITES;
  protected readonly editando = computed(() => this.vivienda() !== null);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly form = this.fb.group({
    nombre: ['', [nombreViviendaValidator]],
    direccion: ['', [textoOpcionalValidator(VIVIENDA_LIMITES.direccion)]],
    region: ['', [textoOpcionalValidator(VIVIENDA_LIMITES.region)]],
    num_habitantes: this.fb.control<number | null>(null, [
      enteroOpcionalValidator(VIVIENDA_LIMITES.habitantes.min, VIVIENDA_LIMITES.habitantes.max),
    ]),
    dia_corte: this.fb.control<number | null>(1, [
      enteroOpcionalValidator(VIVIENDA_LIMITES.diaCorte.min, VIVIENDA_LIMITES.diaCorte.max),
    ]),
    id_tarifa: this.fb.control<number | null>(null),
  });

  constructor() {
    // El select de tarifa solo se puede usar cuando las tarifas ya cargaron. Se deshabilita el control
    // (no el atributo, que Angular Forms pisaría); getRawValue() lo sigue incluyendo al enviar.
    effect(() => {
      const control = this.form.controls.id_tarifa;
      if (this.tarifasStatus() === 'ready') control.enable({ emitEvent: false });
      else control.disable({ emitEvent: false });
    });
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      if (typeof el.showModal === 'function' && !el.open) el.showModal();
    });
  }

  ngOnInit(): void {
    const v = this.vivienda();
    if (v) {
      this.form.setValue({
        nombre: v.nombre,
        direccion: v.direccion ?? '',
        region: v.region ?? '',
        num_habitantes: v.num_habitantes,
        dia_corte: v.dia_corte,
        id_tarifa: v.id_tarifa,
      });
    }
  }

  protected error(field: Exclude<CampoVivienda, 'id_tarifa'>): string | null {
    return controlError(this.form.controls[field], KIND[field]);
  }

  protected submit(): void {
    if (this.submitting()) return;
    this.serverError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    // getRawValue: incluye el select de tarifa aunque esté deshabilitado (no se pierde la tarifa actual).
    const v = this.form.getRawValue();
    const payload: ViviendaPayload = {
      nombre: v.nombre.trim(),
      direccion: blankToNull(v.direccion),
      region: blankToNull(v.region),
      num_habitantes: v.num_habitantes,
      id_tarifa: v.id_tarifa,
      // dia_corte no admite null en el backend: vacío = no se envía (se usa el valor actual o el 1 por defecto).
      ...(v.dia_corte !== null ? { dia_corte: v.dia_corte } : {}),
    };

    const actual = this.vivienda();
    const request$ = actual ? this.service.actualizar(actual.id_vivienda, payload) : this.service.crear(payload);

    this.submitting.set(true);
    request$.subscribe({
      next: (vivienda) => {
        this.submitting.set(false);
        this.saved.emit(vivienda);
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
    // Los mensajes por campo del backend vienen en inglés técnico: la validación local ya cubre
    // los mismos casos, así que aquí solo se marca el campo con un texto genérico.
    for (const campo of CAMPOS) {
      if (error.fieldErrors[campo]) this.form.controls[campo].setErrors({ server: 'Revisa este campo' });
    }
    this.serverError.set(error.status === 409 ? 'Ya existe una vivienda con esos datos.' : error.message);
  }
}
