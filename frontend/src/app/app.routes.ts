import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  // Pantalla TEMPORAL de pruebas de autenticación (se conserva).
  {
    path: 'sesion',
    canActivate: [authGuard],
    loadComponent: () => import('./features/session-check/session-check').then((m) => m.SessionCheck),
  },
  // Área autenticada: layout con sidebar. Las futuras secciones se agregan como hijos.
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/layout/main-layout/main-layout').then((m) => m.MainLayout),
    children: [
      {
        path: 'inicio',
        data: { title: 'Inicio', realData: true },
        loadComponent: () => import('./features/dashboard/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'vivienda',
        // realData: datos reales del backend (el layout oculta la etiqueta «Datos ilustrativos»).
        data: { title: 'Mi vivienda', realData: true },
        loadComponent: () => import('./features/vivienda/mi-vivienda/mi-vivienda').then((m) => m.MiVivienda),
      },
      {
        path: 'ambientes',
        data: { title: 'Ambientes', realData: true },
        loadComponent: () => import('./features/ambientes/mi-ambientes/ambientes').then((m) => m.Ambientes),
      },
      {
        path: 'electrodomesticos',
        data: { title: 'Electrodomésticos', realData: true },
        loadComponent: () =>
          import('./features/electrodomesticos/electrodomesticos/electrodomesticos').then((m) => m.Electrodomesticos),
      },
      {
        path: 'tarifa',
        data: { title: 'Mi tarifa', realData: true },
        loadComponent: () => import('./features/tarifa/tarifa/tarifa').then((m) => m.Tarifa),
      },
      {
        path: 'consumo',
        data: { title: 'Consumo / Historial', realData: true },
        loadComponent: () => import('./features/consumo/consumo/consumo').then((m) => m.Consumo),
      },
      {
        path: 'presupuesto',
        data: { title: 'Presupuesto', realData: true },
        loadComponent: () => import('./features/presupuesto/presupuesto/presupuesto').then((m) => m.Presupuesto),
      },
      {
        path: 'alertas',
        data: { title: 'Alertas', realData: true },
        loadComponent: () => import('./features/alertas/alertas/alertas').then((m) => m.Alertas),
      },
      {
        path: 'notificaciones',
        data: { title: 'Notificaciones', realData: true },
        loadComponent: () => import('./features/notificaciones/notificaciones').then((m) => m.Notificaciones),
      },
    ],
  },
  { path: '**', redirectTo: 'inicio' },
];
