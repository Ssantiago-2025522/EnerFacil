import { Component, ElementRef, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { PRESUPUESTO_LIMITES, Presupuesto } from '../../../../core/models/presupuesto.models';
import { PresupuestoService } from '../../../../core/services/presupuesto.service';
import { ApiError, toApiError } from '../../../../core/utils/api-error';
import { controlError } from '../../../../core/utils/form-errors';
import { montoPresupuestoValidator } from '../../../../core/validators/presupuesto.validators';
import { Icon } from '../../../../shared/icon/icon';
import { fmtDia } from '../../../../shared/utils/format';

/**
 * Modal para configurar el presupuesto mensual de una vivienda: crea uno nuevo (POST, vigente desde hoy)
 * o corrige el monto del vigente (PUT). Solo envía `monto_mensual` (y `id_vivienda` al crear);
 * el usuario lo determina el backend con el JWT.
 */
@Component({
  selector: 'app-presupuesto-form-dialog',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './presupuesto-form-dialog.html',
  styleUrl: './presupuesto-form-dialog.css',
})
export class PresupuestoFormDialog implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(PresupuestoService);

  readonly idVivienda = input.required<number>();
  /** Presupuesto vigente a corregir; null para crear uno nuevo. */
  readonly presupuesto = input<Presupuesto | null>(null);
  /** Moneda de la tarifa de la vivienda (solo informativa); null si no hay tarifa. */
  readonly moneda = input<string | null>(null);

  readonly saved = output<Presupuesto>();
  readonly closed = output<void>();
  /** La vivienda o el presupuesto ya no existen en el backend (404). */
  readonly gone = output<void>();

  protected readonly limites = PRESUPUESTO_LIMITES;
  protected readonly editando = computed(() => this.presupuesto() !== null);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly fmtDia = fmtDia;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly form = this.fb.group({
    monto_mensual: this.fb.control<number | null>(null, [montoPresupuestoValidator]),
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      if (typeof el.showModal === 'function' && !el.open) el.showModal();
    });
  }

  ngOnInit(): void {
    const p = this.presupuesto();
    if (p) this.form.patchValue({ monto_mensual: p.monto_mensual });
  }

  protected error(): string | null {
    return controlError(this.form.controls.monto_mensual, 'presupuestoMonto');
  }

  protected submit(): void {
    if (this.submitting()) return;
    this.serverError.set(null);
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity();
    if (this.form.invalid) return;

    const monto = this.form.getRawValue().monto_mensual as number;
    const actual = this.presupuesto();
    this.submitting.set(true);

    const request$ = actual
      ? this.service.actualizarMonto(actual.id_presupuesto, monto)
      : this.service.crear({ id_vivienda: this.idVivienda(), monto_mensual: monto });
    request$.subscribe({
      next: (p) => {
        this.submitting.set(false);
        this.saved.emit(p);
      },
      error: (err: unknown) => this.fallo(toApiError(err, { fields: ['monto_mensual', 'vigente_desde', 'vigente_hasta'] })),
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

  private fallo(error: ApiError): void {
    this.submitting.set(false);
    if (error.status === 401) return; // el interceptor cierra la sesión y redirige a /login
    if (error.status === 404) {
      this.gone.emit();
      return;
    }
    const mensaje = error.fieldErrors['monto_mensual'];
    if (mensaje) {
      this.form.controls.monto_mensual.setErrors({ server: mensaje });
      this.form.controls.monto_mensual.markAsTouched();
    }
    // 409 (solape de vigencia) y demás errores: el backend ya redacta un mensaje comprensible.
    this.serverError.set(error.message);
  }
}
