/**
 * Browser client for the TypeScript Landgate adapter.
 * Does not call Landgate URLs directly — that stays in lib/landgate.ts.
 */
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { Feature } from 'geojson';
import type {
  HealthResponse,
  IdentifyResponse,
  SearchCriteria,
  SearchResponse,
  SelectResponse,
  ViewportResponse
} from './models';

@Injectable({ providedIn: 'root' })
export class LandgateApi {
  private readonly http = inject(HttpClient);

  health(): Promise<HealthResponse> {
    return this.request(() => this.http.get<HealthResponse>('/api/health'));
  }

  viewport(west: number, south: number, east: number, north: number): Promise<ViewportResponse> {
    const params = new HttpParams()
      .set('west', String(west))
      .set('south', String(south))
      .set('east', String(east))
      .set('north', String(north));
    return this.request(() => this.http.get<ViewportResponse>('/api/parcels/viewport', { params }));
  }

  identify(lng: number, lat: number): Promise<IdentifyResponse> {
    const params = new HttpParams().set('lng', String(lng)).set('lat', String(lat));
    return this.request(() => this.http.get<IdentifyResponse>('/api/parcels/identify', { params }));
  }

  search(criteria: SearchCriteria, planGeometry?: Feature['geometry'] | null): Promise<SearchResponse> {
    return this.request(() =>
      this.http.post<SearchResponse>('/api/parcels/search', {
        ...criteria,
        planGeometry: planGeometry ?? null
      })
    );
  }

  select(feature: Feature): Promise<SelectResponse> {
    return this.request(() => this.http.post<SelectResponse>('/api/parcels/select', { feature }));
  }

  private async request<T>(factory: () => import('rxjs').Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(factory());
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        throw new Error(httpErrorMessage(error));
      }
      throw error;
    }
  }
}

function httpErrorMessage(error: HttpErrorResponse): string {
  const body = error.error;
  if (typeof body === 'string' && body.trim()) {
    return body.replace(/\s+/g, ' ').trim();
  }
  if (body && typeof body === 'object') {
    const message = (body as { error?: unknown; message?: unknown }).error
      ?? (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return error.message || `Landgate API failed (${error.status}).`;
}
