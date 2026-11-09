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
        const body = error.error as { error?: string } | null;
        throw new Error(body?.error || error.message || 'The Landgate API request failed.');
      }
      throw error;
    }
  }
}
