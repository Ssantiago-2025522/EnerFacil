import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ViviendaService } from '../../../core/services/vivienda.service';
import { ViviendaSeleccionService } from '../../../core/services/vivienda-seleccion.service';
import { Vivienda } from '../../../core/models/vivienda.models';
import { Icon, IconName } from '../../../shared/icon/icon';

interface NavItem {
  label: string;
  icon: IconName;
  /** Sin `link` = sección futura (todavía sin vista). */
  link?: string;
}

@Component({
  selector: 'app-sidebar',
  imports: [Icon, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  protected readonly auth = inject(AuthService);
  private readonly viviendaService = inject(ViviendaService);
  private readonly viviendaSeleccion = inject(ViviendaSeleccionService);

  protected readonly items: NavItem[] = [
    { label: 'Inicio', icon: 'dashboard', link: '/inicio' },
    { label: 'Mi vivienda', icon: 'building', link: '/vivienda' },
    { label: 'Ambientes', icon: 'door', link: '/ambientes' },
    { label: 'Electrodomésticos', icon: 'plug', link: '/electrodomesticos' },
    { label: 'Mi tarifa', icon: 'receipt', link: '/tarifa' },
    { label: 'Consumo / Historial', icon: 'history', link: '/consumo' },
    { label: 'Presupuesto', icon: 'wallet', link: '/presupuesto' },
    { label: 'Alertas', icon: 'bell', link: '/alertas' },
    { label: 'Notificaciones', icon: 'message', link: '/notificaciones' },
  ];

  protected readonly nombre = computed(() => this.auth.user()?.nombre ?? 'Usuario');

  protected readonly iniciales = computed(() =>
    this.nombre()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join(''),
  );

  private readonly viviendas = signal<Vivienda[]>([]);

  protected readonly viviendaActual = computed(() => {
    const id = this.viviendaSeleccion.id();
    return this.viviendas().find((v) => v.id_vivienda === id) ?? null;
  });

  constructor() {
    this.viviendaService.listar().subscribe({
      next: (viviendas) => {
        this.viviendas.set(viviendas);

        const id = this.viviendaSeleccion.resolver(viviendas);

        if (id !== null) {
          this.viviendaSeleccion.seleccionar(id);
        }
      },
      error: (error) => {
        console.error('No se pudieron cargar las viviendas para el sidebar', error);
      },
    });
  }
}