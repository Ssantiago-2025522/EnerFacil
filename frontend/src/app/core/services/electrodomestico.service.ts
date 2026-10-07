import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/auth.models';
import {
  CatalogoElectrodomestico,
  Electrodomestico,
  ElectrodomesticoActualizarPayload,
  ElectrodomesticoCrearPayload,
} from '../models/electrodomestico.models';

/** Acceso HTTP a /api/electrodomesticos. El JWT lo agrega el interceptor; el backend valida la propiedad. */
@Injectable({ providedIn: 'root' })
export class ElectrodomesticoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/electrodomesticos`;

  /** GET /api/electrodomesticos?id_vivienda=… (todos los de la vivienda, activos e inactivos). */
  listar(idVivienda: number): Observable<Electrodomestico[]> {
    const params = new HttpParams().set('id_vivienda', idVivienda);
    return this.http.get<ApiResponse<Electrodomestico[]>>(this.baseUrl, { params }).pipe(map((res) => res.data));
  }

  /** GET /api/electrodomesticos/catalogo */
  listarCatalogo(): Observable<CatalogoElectrodomestico[]> {
    return this.http.get<ApiResponse<CatalogoElectrodomestico[]>>(`${this.baseUrl}/catalogo`).pipe(map((res) => res.data));
  }

  crear(payload: ElectrodomesticoCrearPayload): Observable<Electrodomestico> {
    return this.http.post<ApiResponse<Electrodomestico>>(this.baseUrl, payload).pipe(map((res) => res.data));
  }

  actualizar(id: number, payload: ElectrodomesticoActualizarPayload): Observable<Electrodomestico> {
    return this.http.put<ApiResponse<Electrodomestico>>(`${this.baseUrl}/${id}`, payload).pipe(map((res) => res.data));
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<ApiResponse<null>>(`${this.baseUrl}/${id}`).pipe(map(() => undefined));
  }
}
