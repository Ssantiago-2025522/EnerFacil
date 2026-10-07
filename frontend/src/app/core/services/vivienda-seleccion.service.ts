import { Injectable, signal } from '@angular/core';

const KEY = 'enerfacil.vivienda-seleccionada';

/**
 * Vivienda actualmente seleccionada, compartida entre módulos (Mi vivienda, Ambientes y los siguientes).
 * Solo guarda el id (se conserva al recargar la página); la lista real siempre viene del backend,
 * por eso cada pantalla valida el id contra las viviendas del usuario con `resolver()`.
 */
@Injectable({ providedIn: 'root' })
export class ViviendaSeleccionService {
  private readonly _id = signal<number | null>(this.leer());
  readonly id = this._id.asReadonly();

  seleccionar(id: number | null): void {
    this._id.set(id);
    try {
      if (id === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(id));
    } catch {
      /* almacenamiento no disponible: la selección sigue viviendo en memoria */
    }
  }

  /** Conserva la selección si aún existe en `viviendas`; si no, usa la primera (o null si no hay). */
  resolver(viviendas: readonly { id_vivienda: number }[]): number | null {
    const actual = this._id();
    const valido = viviendas.some((v) => v.id_vivienda === actual) ? actual : (viviendas[0]?.id_vivienda ?? null);
    if (valido !== actual) this.seleccionar(valido);
    return valido;
  }

  private leer(): number | null {
    try {
      const n = Number(localStorage.getItem(KEY));
      return Number.isInteger(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }
}
