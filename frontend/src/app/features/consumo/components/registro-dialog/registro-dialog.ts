import { Component, ElementRef, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CONSUMO_LIMITES, LecturaMedidor, RegistroUso } from '../../../../core/models/consumo.models';
import { Electrodomestico } from '../../../../core/models/electrodomestico.models';
import { ConsumoService } from '../../../../core/services/consumo.service';
import { ApiError, toApiError } from '../../../../core/utils/api-error';
import { FieldKind, controlError } from '../../../../core/utils/form-errors';
import { fechaPasadaValidator, hoyLocalISO, observacionValidator } from '../../../../core/validators/consumo.validators';
import { numeroValidator } from '../../../../core/validators/electrodomestico.validators';
import { Icon } from '../../../../shared/icon/icon';
import { fmtDia } from '../../../../shared/utils/format';

export type ModoRegistro = 'lectura' | 'uso';
type Campo = 'fecha' | 'lectura_kwh' | 'horas_uso' | 'observacion' | 'id_electrodomestico';
const KIND: Record<Campo, FieldKind> = {
  fecha: 'consumoFecha',
  lectura_kwh: 'consumoLectura',
  horas_uso: 'consumoHoras',
  observacion: 'consumoObservacion',
  id_electrodomestico: 'consumoEquipo',
};
const CAMPOS: readonly string[] = ['fecha_lectura', 'fecha', 'lectura_kwh', 'horas_uso', 'observacion', 'id_electrodomestico'];

/**
 * Modal para registrar una lectura del medidor o las horas de uso de un electrodoméstico
 * (o corregir las horas de un registro existente). Hace la petición y avisa con (savedLectura) / (savedUso).
 * kwh_calculado nunca se envía: lo calcula el trigger de MySQL.
 */
@Component({
  selector: 'app-registro-dialog',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './registro-dialog.html',
  styleUrl: './registro-dialog.css',
})
export class RegistroDialog implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(ConsumoService);

  readonly modo = input.required<ModoRegistro>();
  readonly idVivienda = input.required<number>();
  /** Equipos de la vivienda (solo modo 'uso'). */
  readonly electros = input<Electrodomestico[]>([]);
  /** Registro de uso a corregir; null para crear uno nuevo. */
  readonly uso = input<RegistroUso | null>(null);

  readonly savedLectura = output<LecturaMedidor>();
  readonly savedUso = output<RegistroUso>();
  readonly closed = output<void>();
  /** Lo que se editaba o la vivienda ya no existen en el backend (404). */
  readonly gone = output<void>();

  protected readonly limites = CONSUMO_LIMITES;
  protected readonly hoy = hoyLocalISO();
  protected readonly editando = computed(() => this.uso() !== null);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly fmtDia = fmtDia;

  /** Equipos activos primero; los inactivos siguen disponibles por si se quiere registrar historial. */
  protected readonly opcionesEquipo = computed(() =>
    [...this.electros()].sort((a, b) => b.activo - a.activo || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })),
  );

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly form = this.fb.group({
    fecha: [this.hoy, [fechaPasadaValidator]],
    lectura_kwh: this.fb.control<number | null>(null, [numeroValidator({ ...CONSUMO_LIMITES.lecturaKwh })]),
    observacion: ['', [observacionValidator(CONSUMO_LIMITES.observacion)]],
    id_electrodomestico: this.fb.control<number | null>(null),
    horas_uso: this.fb.control<number | null>(null, [numeroValidator({ ...CONSUMO_LIMITES.horas })]),
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      if (typeof el.showModal === 'function' && !el.open) el.showModal();
    });
  }

  ngOnInit(): void {
    const u = this.uso();
    if (u) this.form.patchValue({ fecha: u.fecha, id_electrodomestico: u.id_electrodomestico, horas_uso: u.horas_uso });
    // Solo los campos del modo activo se validan.
    const c = this.form.controls;
    if (this.modo() === 'lectura') {
      c.horas_uso.disable();
      c.id_electrodomestico.disable();
    } else {
      c.lectura_kwh.disable();
      c.observacion.disable();
      if (u) c.fecha.disable();
      else {
        c.id_electrodomestico.addValidators((ctl) => (ctl.value === null ? { required: true } : null));
        c.id_electrodomestico.updateValueAndValidity();
      }
    }
  }

  protected error(field: Campo): string | null {
    return controlError(this.form.controls[field], KIND[field]);
  }

  protected submit(): void {
    if (this.submitting()) return;
    this.serverError.set(null);
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    this.submitting.set(true);

    if (this.modo() === 'lectura') {
      const observacion = v.observacion.trim();
      this.service
        .crearLectura({
          id_vivienda: this.idVivienda(),
          fecha_lectura: v.fecha.trim(),
          lectura_kwh: v.lectura_kwh as number,
          ...(observacion ? { observacion } : {}),
        })
        .subscribe({
          next: (l) => this.terminar(() => this.savedLectura.emit(l)),
          error: (err: unknown) => this.fallo(toApiError(err, { fields: CAMPOS })),
        });
      return;
    }

    const actual = this.uso();
    const request$ = actual
      ? this.service.actualizarUso(actual.id_registro, v.horas_uso as number)
      : this.service.crearUso({
          id_electrodomestico: v.id_electrodomestico as number,
          fecha: v.fecha.trim(),
          horas_uso: v.horas_uso as number,
        });
    request$.subscribe({
      next: (u) => this.terminar(() => this.savedUso.emit(u)),
      error: (err: unknown) => this.fallo(toApiError(err, { fields: CAMPOS })),
    });
  }

  protected cerrar(): void {
    if (!this.submitting()) this.closed.emit();
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.cerrar();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cerrar();
  }

  private terminar(emitir: () => void): void {
    this.submitting.set(false);
    emitir();
  }

  private fallo(error: ApiError): void {
    this.submitting.set(false);
    if (error.status === 401) return; // el interceptor cierra la sesión y redirige a /login
    if (error.status === 404) {
      this.gone.emit();
      return;
    }
    if (error.status === 409 && this.modo() === 'uso') {
      this.serverError.set('Ya hay un registro de uso de ese electrodoméstico en esa fecha. Corrígelo desde la lista de uso diario.');
      return;
    }
    // El backend nombra la fecha de la lectura `fecha_lectura`; en el formulario es `fecha`.
    const porCampo: Record<string, string | undefined> = { ...error.fieldErrors };
    if (porCampo['fecha_lectura'] && !porCampo['fecha']) porCampo['fecha'] = porCampo['fecha_lectura'];
    for (const nombre of Object.keys(this.form.controls)) {
      const mensaje = porCampo[nombre];
      const control = this.form.get(nombre);
      if (mensaje && control && control.enabled) {
        control.setErrors({ server: mensaje });
        control.markAsTouched();
      }
    }
    this.serverError.set(error.message);
  }
}
