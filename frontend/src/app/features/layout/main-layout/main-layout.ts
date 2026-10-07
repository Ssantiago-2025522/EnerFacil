import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Icon } from '../../../shared/icon/icon';
import { Sidebar } from '../sidebar/sidebar';

/**
 * Layout de la app autenticada: sidebar + barra superior + contenido (<router-outlet>).
 * En pantallas < 1024 px el sidebar pasa a ser un panel deslizable.
 */
@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, Sidebar, Icon],
  templateUrl: './main-layout.html',
  styleUrl: './main-layout.css',
})
export class MainLayout {
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  /** Título del breadcrumb, tomado de `data.title` de la ruta hija activa. */
  protected readonly pageTitle = signal('');
  /** true cuando la página activa muestra datos de ejemplo (el dashboard); false si usa el backend real. */
  protected readonly illustrative = signal(true);

  constructor() {
    // Importante: NO leer el snapshot de ActivatedRoute aquí. En un componente cargado con lazy-loading
    // todavía no existe durante el constructor y lanzaría un error que deja la vista a medias.
    // Se actualiza solo al terminar cada navegación (NavigationEnd siempre ocurre después de activar el layout).
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => {
        this.pageTitle.set(this.titleFromRouterState());
        this.illustrative.set(!this.activeRouteData()['realData']);
        this.menuOpen.set(false);
      });
  }

  protected toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  private titleFromRouterState(): string {
    const title = this.activeRouteData()['title'];
    return typeof title === 'string' ? title : '';
  }

  private activeRouteData(): Record<string, unknown> {
    let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (route?.firstChild) route = route.firstChild;
    return route?.data ?? {};
  }
}
