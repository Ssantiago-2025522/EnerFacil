import { Component, ElementRef, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ALERTA_LIMITES,
  AlertaConfig,
  CANALES_ALERTA,
  CanalAlerta,
  TIPOS_ALERTA,
  TipoAlerta,
} from '../../../../core/models/alerta.models';
import { AlertaService } from '../../../../core/services/alerta.service';
import { mensajeAlertaAmigable } from '../../../../core/utils/alerta-mensajes';
import { ApiError, toApiError } from '../../../../core/utils/api-error';
import { controlError } from '../../../../core/utils/form-errors';
import { umbralAlertaValidator } from '../../../../core/validators/alerta.validators';
import { Icon } from '../../../../shared/icon/icon';

const TIPO_TEXTO: Record<TipoAlerta, string> = {
  UMBRAL_PROXIMO: 'Te acercas al límite del presupuesto',
  UMBRAL_SUPERADO: 'Presupuesto superado',
  CONSUMO_ANOMALO: 'Consumo inusual',
};
const TIPO_AYUDA: Record<TipoAlerta, string> = {
  UMBRAL_PROXIMO: 'Porcentaje de tu presupuesto mensual (según la proyección del ciclo) en el que quieres el aviso amarillo. Debe ser menor que el de presupuesto superado. Ejemplo: 80.',
  UMBRAL_SUPERADO: 'Porcentaje de tu presupuesto mensual (según la proyección del ciclo) desde el que la alerta es roja. Debe ser mayor que el de aviso. Ejemplo: 100.',
  CONSUMO_ANOMALO: 'Porcentaje del consumo del mes anterior a partir del cual te avisamos. Ejemplo: 130 significa un 30 % más que el mes pasado.',
};
const CANAL_TEXTO: Record<CanalAlerta, string> = { APP: 'En la aplicación', EMAIL: 'Por correo' };

/**
 * Modal para agregar o editar un aviso (alertas_config). Crea con POST o edita con PUT /api/alertas/config;
 * las reglas de coherencia (el aviso amarillo debe ser menor que el rojo) y los duplicados los valida el backend;
 * sus mensajes (400 / 409) se traducen con `mensajeAlertaAmigable` para no mostrar nombres internos.
 */
@Component({
  selector: 'app-alerta-config-dialog',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './alerta-config-dialog.html',
  styleUrl: './alerta-config-dialog.css',
})
export class AlertaConfigDialog implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(AlertaService);

  readonly idVivienda = input.required<number>();
  /** Aviso a editar; null para crear uno nuevo. */
  readonly config = input<AlertaConfig | null>(null);
  /** Avisos ya existentes de la vivienda (solo para sugerir un tipo/canal libre al crear). */
  readonly existentes = input<readonly AlertaConfig[]>([]);

  readonly saved = output<AlertaConfig>();
  readonly closed = output<void>();
  /** La vivienda o el aviso ya no existen en el backend (404). */
  readonly gone = output<void>();

  protected readonly tipos = TIPOS_ALERTA;
  protected readonly canales = CANALES_ALERTA;
  protected readonly tipoTexto = (t: TipoAlerta) => TIPO_TEXTO[t];
  protected readonly canalTexto = (c: CanalAlerta) => CANAL_TEXTO[c];
  protected readonly limites = ALERTA_LIMITES;
  protected readonly editando = computed(() => this.config() !== null);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly form = this.fb.group({
    tipo: this.fb.control<TipoAlerta>('UMBRAL_PROXIMO', [Validators.required]),
    porcentaje_umbral: this.fb.control<number | null>(null, [umbralAlertaValidator]),
    canal: this.fb.control<CanalAlerta>('APP', [Validators.required]),
    activa: this.fb.control(true),
  });

  protected readonly tipoActual = signal<TipoAlerta>('UMBRAL_PROXIMO');

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      if (typeof el.showModal === 'function' && !el.open) el.showModal();
    });
  }

  ngOnInit(): void {
    const c = this.config();
    if (c) {
      this.form.patchValue({ tipo: c.tipo, porcentaje_umbral: c.porcentaje_umbral, canal: c.canal, activa: c.activa === 1 });
      this.tipoActual.set(c.tipo);
    } else {
      // Sugiere el primer tipo que todavía no tiene aviso en la aplicación.
      const usados = new Set(this.existentes().filter((e) => e.canal === 'APP').map((e) => e.tipo));
      const libre = TIPOS_ALERTA.find((t) => !usados.has(t)) ?? TIPOS_ALERTA[0];
      this.form.patchValue({ tipo: libre });
      this.tipoActual.set(libre);
    }
  }

  protected cambiaTipo(): void {
    this.tipoActual.set(this.form.controls.tipo.value);
  }

  protected ayuda(): string {
    return TIPO_AYUDA[this.tipoActual()];
  }

  protected error(): string | null {
    return controlError(this.form.controls.porcentaje_umbral, 'alertaUmbral');
  }

  protected submit(): void {
    if (this.submitting()) return;
    this.serverError.set(null);
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    const umbral = v.porcentaje_umbral as number;
    const actual = this.config();
    this.submitting.set(true);

    const request$ = actual
      ? this.service.actualizarConfig(actual.id_alerta_config, { porcentaje_umbral: umbral, canal: v.canal, activa: v.activa })
      : this.service.crearConfig({
          id_vivienda: this.idVivienda(),
          tipo: v.tipo,
          porcentaje_umbral: umbral,
          canal: v.canal,
          activa: v.activa,
        });
    request$.subscribe({
      next: (c) => {
        this.submitting.set(false);
        this.saved.emit(c);
      },
      error: (err: unknown) => this.fallo(toApiError(err, { fields: ['porcentaje_umbral', 'tipo', 'canal'] })),
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
    const mensaje = error.fieldErrors['porcentaje_umbral'];
    if (mensaje) {
      this.form.controls.porcentaje_umbral.setErrors({ server: mensajeAlertaAmigable(mensaje, 'Revisa el porcentaje ingresado.') });
      this.form.controls.porcentaje_umbral.markAsTouched();
    }
    // 400 (umbrales incoherentes), 409 (duplicado) y demás: se muestra la versión sin nombres internos.
    this.serverError.set(mensajeAlertaAmigable(error.message));
  }
}
