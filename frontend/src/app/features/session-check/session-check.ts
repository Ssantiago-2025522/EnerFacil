import { Component, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

/**
 * Pantalla TEMPORAL solo para comprobar que la autenticación funciona:
 * muestra el usuario y confirma que GET /auth/me responde con el token enviado por el interceptor.
 * Se reemplazará cuando implementemos el dashboard.
 */
@Component({
  selector: 'app-session-check',
  template: `
    <main class="box">
      <h1>Sesión iniciada ✔</h1>
      @if (auth.user(); as user) {
        <p><strong>{{ user.nombre }}</strong> · {{ user.email }}</p>
      }
      <p class="status" [class.bad]="meStatus().startsWith('Error')">GET /auth/me → {{ meStatus() }}</p>
      <button type="button" (click)="auth.logout()">Cerrar sesión</button>
    </main>
  `,
  styles: `
    .box { max-width: 420px; margin: 15vh auto; padding: 0 20px; text-align: center; }
    h1 { font-size: 24px; font-weight: 500; }
    .status { font-size: 13px; color: #6b7686; }
    .status.bad { color: #c93c3c; }
    button { height: 44px; padding: 0 20px; font: inherit; font-weight: 600; color: #fff;
             background: #3b6fc9; border: 0; border-radius: 10px; cursor: pointer; }
  `,
})
export class SessionCheck {
  protected readonly auth = inject(AuthService);
  protected readonly meStatus = signal('verificando…');

  constructor() {
    this.auth.me().subscribe({
      next: (u) => this.meStatus.set(`OK (id_usuario ${u.id_usuario})`),
      error: () => this.meStatus.set('Error al verificar la sesión'),
    });
  }
}
