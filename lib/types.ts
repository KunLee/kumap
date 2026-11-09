import type { Feature, FeatureCollection, Geometry } from 'geojson';

export interface SearchCriteria {
  jobNumber?: string;
  lotNumber?: string;
  planNumber?: string;
  street?: string;
  estate?: string;
  suburb?: string;
  postcode?: string;
  planGeometry?: Geometry | null;
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

export type SearchStatus =
  | 'single'
  | 'multiple'
  | 'too_many'
  | 'too_many_locality'
  | 'plan_candidates';

export interface SearchResponse {
  status: SearchStatus;
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

export class LandgateError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'LandgateError';
  }
}
