import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Marco compartido de Login y Register: cabecera, panel de imagen (placeholder) y pie.
 * El formulario se proyecta con <ng-content>.
 */
@Component({
  selector: 'app-auth-shell',
  imports: [RouterLink],
  templateUrl: './auth-shell.html',
  styleUrl: './auth-shell.css',
})
export class AuthShell {
  /** Texto de la cabecera, p. ej. "¿Aún no tienes cuenta?" */
  readonly switchText = input.required<string>();
  readonly switchLabel = input.required<string>();
  readonly switchLink = input.required<string>();

  protected readonly year = computed(() => new Date().getFullYear());
}
