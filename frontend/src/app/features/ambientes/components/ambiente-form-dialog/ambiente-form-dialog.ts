import { Component, ElementRef, OnInit, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  AMBIENTE_LIMITES,
  Ambiente,
  TIPOS_AMBIENTE,
  TIPO_AMBIENTE_LABEL,
  TipoAmbiente,
} from '../../../../core/models/ambiente.models';
import { AmbienteService } from '../../../../core/services/ambiente.service';
import { ApiError, toApiError } from '../../../../core/utils/api-error';
import { controlError } from '../../../../core/utils/form-errors';
import { nombreAmbienteValidator } from '../../../../core/validators/ambiente.validators';
import { Icon } from '../../../../shared/icon/icon';

const CAMPOS = ['nombre', 'tipo'] as const;

/**
 * Modal para crear (ambiente = null) o editar un ambiente. Hace la petición y avisa con (saved).
 * Al crear usa `idVivienda` (la vivienda seleccionada); nunca se le pide al usuario.
 */
@Component({
  selector: 'app-ambiente-form-dialog',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './ambiente-form-dialog.html',
  styleUrl: './ambiente-form-dialog.css',
})
export class AmbienteFormDialog implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(AmbienteService);

  /** Ambiente a editar; null para crear uno nuevo. */
  readonly ambiente = input<Ambiente | null>(null);
  /** Vivienda a la que se agrega el ambiente (solo al crear). */
  readonly idVivienda = input.required<number>();

  readonly saved = output<Ambiente>();
  readonly closed = output<void>();
  /** El ambiente o la vivienda ya no existen en el backend (404). */
  readonly gone = output<void>();

  protected readonly limites = AMBIENTE_LIMITES;
  protected readonly tipos = TIPOS_AMBIENTE.map((value) => ({ value, label: TIPO_AMBIENTE_LABEL[value] }));
  protected readonly editando = computed(() => this.ambiente() !== null);
  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly form = this.fb.group({
    nombre: ['', [nombreAmbienteValidator]],
    tipo: this.fb.control<TipoAmbiente>('OTRO'),
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      if (typeof el.showModal === 'function' && !el.open) el.showModal();
    });
  }

  ngOnInit(): void {
    const a = this.ambiente();
    if (a) this.form.setValue({ nombre: a.nombre, tipo: a.tipo });
  }

  protected errorNombre(): string | null {
    return controlError(this.form.controls.nombre, 'ambienteNombre');
  }

  protected submit(): void {
    if (this.submitting()) return;
    this.serverError.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    const nombre = v.nombre.trim();
    const actual = this.ambiente();
    const request$ = actual
      ? this.service.actualizar(actual.id_ambiente, { nombre, tipo: v.tipo })
      : this.service.crear({ id_vivienda: this.idVivienda(), nombre, tipo: v.tipo });

    this.submitting.set(true);
    request$.subscribe({
      next: (ambiente) => {
        this.submitting.set(false);
        this.saved.emit(ambiente);
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
    if (error.status === 409) {
      // El backend usa 409 solo para nombre repetido dentro de la misma vivienda.
      this.form.controls.nombre.setErrors({ server: 'Ya tienes un ambiente con ese nombre en esta vivienda' });
      this.form.controls.nombre.markAsTouched();
      return;
    }
    if (error.fieldErrors['nombre']) this.form.controls.nombre.setErrors({ server: 'Revisa este campo' });
    this.serverError.set(error.message);
  }
}
