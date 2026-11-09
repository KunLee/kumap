import type { Feature, FeatureCollection, Geometry } from 'geojson';

export interface SearchCriteria {
  jobNumber: string;
  lotNumber: string;
  planNumber: string;
  street: string;
  estate: string;
  suburb: string;
  postcode: string;
}

export interface RepresentativePoint {
  latitude: string;
  longitude: string;
  copyText: string;
  lng: number;
  lat: number;
  method: 'interior_point' | 'centroid';
  methodLabel: string;
  crs: 'WGS84 / EPSG:4326';
  areaM2: number | null;
  areaLabel: string | null;
}

export interface PlanSummary {
  objectid?: number;
  plan_identifier?: string | null;
  label_text?: string | null;
  status?: string | null;
  source?: string | null;
}

export interface SearchResponse {
  status: 'single' | 'multiple' | 'too_many' | 'too_many_locality' | 'plan_candidates';
  warnings: string[];
  count?: number;
  features: Feature[];
  plans?: Feature[];
  extent?: [number, number, number, number] | null;
}

export interface IdentifyResponse {
  status: 'single' | 'multiple' | 'none';
  warnings: string[];
  features: Feature[];
}

export interface SelectResponse {
  feature: Feature;
  location: RepresentativePoint;
  intersectingPlans: PlanSummary[];
  warnings: string[];
  dataset: string;
  locationSource: 'LANDGATE_PARCEL';
  timestamp: string;
}

export interface HealthResponse {
  ok: boolean;
  name: string;
  datasetId: string;
  fields: string[];
  maxRecordCount?: number;
  public: boolean;
  license: string;
}

export interface ViewportResponse {
  collection: FeatureCollection;
  truncated: boolean;
  count: number;
  warnings: string[];
}

export interface PropertyResult {
  job: string;
  lot: string;
  plan: string;
  parcelId: string;
  suburb: string;
  street: string;
  area: string;
  latitude: string;
  longitude: string;
  coordinateType: string;
  crs: string;
  source: string;
  locationSource: string;
  dataset: string;
  coordinateMethod: string;
  timestamp: string;
  warnings: string[];
  rawAttributes: Record<string, unknown>;
  copyText: string;
}

export interface StatusMessage {
  kind: 'info' | 'ok' | 'warn' | 'error';
  text: string;
}

export type { Feature, FeatureCollection, Geometry };
