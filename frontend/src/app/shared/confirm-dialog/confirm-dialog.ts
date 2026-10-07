import { Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';
import { Icon } from '../icon/icon';

/**
 * Diálogo modal de confirmación (usa <dialog> nativo: foco atrapado, Esc para cerrar).
 * Es presentacional: quien lo usa hace la acción en (confirmed) y controla `busy` y `error`.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [Icon],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirmar');
  readonly busyLabel = input('Procesando…');
  readonly busy = input(false);
  readonly error = input<string | null>(null);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      if (typeof el.showModal === 'function' && !el.open) el.showModal();
    });
  }

  /** Esc: se cancela, salvo que haya una petición en curso. */
  protected onCancel(event: Event): void {
    event.preventDefault();
    if (!this.busy()) this.cancelled.emit();
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.busy()) this.cancelled.emit();
  }
}
