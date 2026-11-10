/**
 * Landgate SLIP adapter.
 *
 * Talks to public ArcGIS REST endpoints over HTTP, then returns GeoJSON.
 * No ArcGIS Maps SDK, no ArcGIS Online account, no API key.
 */

import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { config } from './config';
import { describeParcelLocation } from './coordinates';
import type {
  HealthResponse,
  IdentifyResponse,
  PlanSummary,
  SearchCriteria,
  SearchResponse,
  SelectResponse,
  ViewportResponse
} from './types';
import { LandgateError } from './types';

const ROAD_TYPES = [
  'STREET', 'ST', 'ROAD', 'RD', 'AVENUE', 'AVE', 'AV', 'DRIVE', 'DR',
  'HIGHWAY', 'HWY', 'CIRCUIT', 'CCT', 'WAY', 'PARADE', 'PDE', 'CLOSE', 'CL',
  'CRESCENT', 'CRES', 'CR', 'BOULEVARD', 'BLVD', 'TERRACE', 'TCE', 'PLACE',
  'PL', 'LANE', 'LN', 'COURT', 'CT', 'GROVE', 'GR', 'RISE', 'LOOP', 'MEWS',
  'VIEW', 'WALK', 'BEND', 'TURN', 'LINK', 'ENTRANCE', 'ENT'
];

function compact(value: unknown): string {
  return String(value ?? '').trim();
}

function isBlank(value: unknown): boolean {
  return compact(value) === '';
}

function sqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function stripLotPrefix(value: string): string {
  return compact(value).replace(/^lot\s+/i, '');
}

function streetNameOnly(value: string): string {
  let text = compact(value).toUpperCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const pattern = new RegExp(`\\s+(${ROAD_TYPES.join('|')})\\.?$`, 'i');
  return text.replace(pattern, '').trim();
}

function parsePlanInput(value: string): {
  raw: string;
  compactId: string;
  type: string;
  number: string;
  valid: boolean;
} {
  const raw = compact(value).toUpperCase();
  const compactId = raw.replace(/\s+/g, '');
  const match = compactId.match(/^(DP|SP|P|D)?(\d+)$/);
  if (!match) {
    return { raw, compactId, type: '', number: '', valid: Boolean(compactId) };
  }
  return {
    raw,
    compactId,
    type: match[1] || '',
    number: match[2].replace(/^0+/, '') || '0',
    valid: true
  };
}

function geojsonToEsriGeometry(geometry: Geometry): Record<string, unknown> {
  if (geometry.type === 'Point') {
    return {
      x: geometry.coordinates[0],
      y: geometry.coordinates[1],
      spatialReference: { wkid: 4326 }
    };
  }
  if (geometry.type === 'Polygon') {
    return { rings: geometry.coordinates, spatialReference: { wkid: 4326 } };
  }
  if (geometry.type === 'MultiPolygon') {
    return { rings: geometry.coordinates.flat(), spatialReference: { wkid: 4326 } };
  }
  throw new LandgateError('INVALID', `Unsupported geometry type ${geometry.type}.`);
}

function envelopeGeometry(west: number, south: number, east: number, north: number): string {
  return JSON.stringify({
    xmin: west,
    ymin: south,
    xmax: east,
    ymax: north,
    spatialReference: { wkid: 4326 }
  });
}

function asFeatureCollection(payload: unknown): FeatureCollection {
  if (
    payload &&
    typeof payload === 'object' &&
    (payload as FeatureCollection).type === 'FeatureCollection' &&
    Array.isArray((payload as FeatureCollection).features)
  ) {
    return payload as FeatureCollection;
  }
  const error = (payload as { error?: { message?: string } })?.error;
  if (error?.message) {
    throw new LandgateError('UNAVAILABLE', error.message);
  }
  throw new LandgateError('UNAVAILABLE', 'Landgate did not return GeoJSON features.');
}

async function postQuery(layerUrl: string, params: Record<string, string>): Promise<unknown> {
  const body = new URLSearchParams(params);
  let response: Response;
  try {
    response = await fetch(`${layerUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(config.landgateTimeoutMs)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|aborted/i.test(message)) {
      throw new LandgateError(
        'UNAVAILABLE',
        'The Landgate service timed out. Zoom in further or click a parcel instead of a wide search.'
      );
    }
    throw new LandgateError(
      'UNAVAILABLE',
      'Could not reach Landgate SLIP. This is a network or service-outage problem, not a missing parcel.'
    );
  }

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LandgateError(
      'UNAVAILABLE',
      `Landgate returned HTTP ${response.status} with a non-JSON body.`
    );
  }

  const error = (json as { error?: { message?: string } })?.error;
  if (!response.ok || error) {
    throw new LandgateError(
      'UNAVAILABLE',
      error?.message || `Landgate query failed with HTTP ${response.status}.`
    );
  }
  return json;
}

async function queryFeatures(
  layerUrl: string,
  params: Record<string, string>,
  outFields: readonly string[],
  recordCount: number
): Promise<FeatureCollection> {
  const payload = await postQuery(layerUrl, {
    where: params['where'] || '1=1',
    outFields: outFields.join(','),
    returnGeometry: params['returnGeometry'] ?? 'true',
    outSR: '4326',
    inSR: '4326',
    f: 'geojson',
    resultRecordCount: String(recordCount),
    ...params
  });
  return asFeatureCollection(payload);
}

async function queryCount(layerUrl: string, params: Record<string, string>): Promise<number> {
  const payload = (await postQuery(layerUrl, {
    where: params['where'] || '1=1',
    returnCountOnly: 'true',
    f: 'json',
    inSR: '4326',
    ...params
  })) as { count?: number };
  return Number(payload.count ?? 0);
}

async function queryExtent(
  layerUrl: string,
  params: Record<string, string>
): Promise<[number, number, number, number] | null> {
  try {
    const payload = (await postQuery(layerUrl, {
      where: params['where'] || '1=1',
      returnExtentOnly: 'true',
      outSR: '4326',
      inSR: '4326',
      f: 'json',
      ...params
    })) as { extent?: { xmin: number; ymin: number; xmax: number; ymax: number } };
    const extent = payload.extent;
    if (!extent) {
      return null;
    }
    return [extent.xmin, extent.ymin, extent.xmax, extent.ymax];
  } catch {
    return null;
  }
}

function buildAttributeWhere(criteria: SearchCriteria): {
  clauses: string[];
  warnings: string[];
} {
  const clauses: string[] = [];
  const warnings: string[] = [];
  const lot = stripLotPrefix(criteria.lotNumber ?? '');
  const street = streetNameOnly(criteria.street ?? '');
  const suburb = compact(criteria.suburb).toUpperCase();

  if (lot) {
    if (!/^[A-Z0-9][A-Z0-9\-/]*$/i.test(lot)) {
      throw new LandgateError(
        'INVALID_LOT',
        'Lot number looks invalid. Use the lot value from the job (for example 275), without inventing a street number.'
      );
    }
    clauses.push(`lot_number = '${sqlString(lot)}'`);
  }
  if (street) {
    clauses.push(`UPPER(road_name) LIKE '%${sqlString(street)}%'`);
  }
  if (suburb) {
    clauses.push(`UPPER(locality) = '${sqlString(suburb)}'`);
  }
  if (!isBlank(criteria.estate)) {
    warnings.push(
      'Estate is not an attribute on the public Cadastre Address layer and was not used in the query.'
    );
  }
  if (!isBlank(criteria.postcode)) {
    warnings.push(
      'Postcode is not an attribute on the public Cadastre Address layer and was not used in the query.'
    );
  }
  return { clauses, warnings };
}

function buildPlanWhere(planValue: string): { where: string; parsed: ReturnType<typeof parsePlanInput> } {
  const parsed = parsePlanInput(planValue);
  if (!parsed.valid) {
    throw new LandgateError('INVALID_PLAN', 'Plan number looks empty or invalid.');
  }
  if (parsed.number) {
    const typeClause = parsed.type
      ? `UPPER(plan_identifier) LIKE '${sqlString(parsed.type)}%${sqlString(parsed.number)}' OR UPPER(label_text) LIKE '%${sqlString(parsed.type)}%${sqlString(parsed.number)}%'`
      : `plan_identifier LIKE '%${sqlString(parsed.number)}' OR UPPER(label_text) LIKE '%${sqlString(parsed.number)}%'`;
    return { where: `(${typeClause})`, parsed };
  }
  return {
    where: `(UPPER(plan_identifier) LIKE '%${sqlString(parsed.compactId)}%' OR UPPER(label_text) LIKE '%${sqlString(parsed.raw)}%')`,
    parsed
  };
}

function spatialParams(geometry?: Geometry | null): Record<string, string> {
  if (!geometry) {
    return {};
  }
  return {
    geometry: JSON.stringify(geojsonToEsriGeometry(geometry)),
    geometryType:
      geometry.type === 'Point' ? 'esriGeometryPoint' : 'esriGeometryPolygon',
    spatialRel: 'esriSpatialRelIntersects'
  };
}

export function formatStreet(properties: Record<string, unknown> | null | undefined): string | null {
  const attrs = properties ?? {};
  const bits = [
    compact(attrs['road_number_1']),
    compact(attrs['road_number_2']) ? `– ${compact(attrs['road_number_2'])}` : '',
    compact(attrs['road_name']),
    compact(attrs['road_type']),
    compact(attrs['road_suffix'])
  ].filter(Boolean);
  return bits.join(' ') || null;
}

export async function healthCheck(): Promise<HealthResponse> {
  const { parcel } = config.landgate;
  let response: Response;
  try {
    response = await fetch(`${parcel.url}?f=json`, {
      signal: AbortSignal.timeout(config.landgateTimeoutMs)
    });
  } catch {
    throw new LandgateError('UNAVAILABLE', 'Could not contact Landgate SLIP.');
  }
  const json = (await response.json()) as {
    name?: string;
    fields?: Array<{ name: string }>;
    maxRecordCount?: number;
    error?: { message?: string };
  };
  if (!response.ok || json.error) {
    throw new LandgateError(
      'UNAVAILABLE',
      json.error?.message || `Landgate returned HTTP ${response.status} when reading ${parcel.datasetId}.`
    );
  }
  return {
    ok: true,
    name: json.name || parcel.name,
    datasetId: parcel.datasetId,
    fields: (json.fields || []).map((field) => field.name).filter((name) => name !== 'shape'),
    maxRecordCount: json.maxRecordCount,
    public: parcel.public,
    license: parcel.license
  };
}

export async function queryViewport(
  west: number,
  south: number,
  east: number,
  north: number
): Promise<ViewportResponse> {
  if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north) {
    throw new LandgateError('INVALID', 'Viewport bounds were invalid.');
  }

  const geometry = envelopeGeometry(west, south, east, north);
  const spatial = {
    geometry,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects'
  };
  const count = await queryCount(config.landgate.parcel.url, spatial);
  const collection = await queryFeatures(
    config.landgate.parcel.url,
    spatial,
    config.landgate.parcel.outFields,
    config.viewportMaxResults
  );
  const truncated = count > collection.features.length;
  return {
    collection,
    truncated,
    count,
    warnings: truncated
      ? [
          `Showing ${collection.features.length} of ${count.toLocaleString('en-AU')} parcels in view. Zoom in for a complete cadastre draw.`
        ]
      : []
  };
}

export async function identifyAt(lng: number, lat: number): Promise<IdentifyResponse> {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new LandgateError('INVALID', 'Click location was not a valid longitude/latitude.');
  }
  const pad = 0.00004;
  const geometry = envelopeGeometry(lng - pad, lat - pad, lng + pad, lat + pad);
  const collection = await queryFeatures(
    config.landgate.parcel.url,
    {
      geometry,
      geometryType: 'esriGeometryEnvelope',
      spatialRel: 'esriSpatialRelIntersects'
    },
    config.landgate.parcel.outFields,
    10
  );
  if (collection.features.length === 0) {
    throw new LandgateError(
      'NOT_FOUND',
      'No Landgate parcel was found at that location. Zoom in until cadastral boundaries are visible, then click inside a parcel.'
    );
  }
  return {
    status: collection.features.length === 1 ? 'single' : 'multiple',
    warnings:
      collection.features.length > 1
        ? [
            `${collection.features.length} parcels intersect that click. Confirm the correct one — nothing was auto-selected.`
          ]
        : [],
    features: collection.features
  };
}

async function findPlanExtents(planValue: string): Promise<{ plans: Feature[]; parsed: ReturnType<typeof parsePlanInput> }> {
  const { where, parsed } = buildPlanWhere(planValue);
  const collection = await queryFeatures(
    config.landgate.planExtent.url,
    { where },
    config.landgate.planExtent.outFields,
    25
  );
  return { plans: collection.features, parsed };
}

export async function findIntersectingPlans(geometry: Geometry): Promise<PlanSummary[]> {
  try {
    const collection = await queryFeatures(
      config.landgate.planExtent.url,
      { ...spatialParams(geometry), returnGeometry: 'false' },
      ['objectid', 'label_text', 'status', 'plan_identifier', 'source'],
      10
    );
    return collection.features.map((feature) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      return {
        objectid: Number(props['objectid']),
        plan_identifier: (props['plan_identifier'] as string | null) ?? null,
        label_text: (props['label_text'] as string | null) ?? null,
        status: (props['status'] as string | null) ?? null,
        source: (props['source'] as string | null) ?? null
      };
    });
  } catch {
    return [];
  }
}

function finaliseParcelResult(features: Feature[], warnings: string[], count = features.length): SearchResponse {
  if (features.length === 0) {
    throw new LandgateError(
      'NOT_FOUND',
      'No parcels matched those details on the public Cadastre Address layer.'
    );
  }
  if (features.length === 1) {
    return { status: 'single', count, features, warnings };
  }
  return {
    status: 'multiple',
    count,
    features,
    warnings: [
      ...warnings,
      `${features.length} matching parcels were found. Confirm the correct parcel — the POC will not choose for you.`
    ]
  };
}

async function queryParcels(options: {
  where: string;
  geometry?: Geometry | null;
  warnings: string[];
  allowTooMany?: boolean;
}): Promise<SearchResponse> {
  const spatial = spatialParams(options.geometry);
  const params = { where: options.where, ...spatial };
  const count = await queryCount(config.landgate.parcel.url, params);

  if (count === 0) {
    throw new LandgateError(
      'NOT_FOUND',
      'No parcels matched those details on the public Cadastre Address layer. The lot may be missing from LGATE-002 (common in new estates), or the plan/suburb may not line up with public attributes. Zoom to the area and click the parcel instead.'
    );
  }

  const suburbOnly =
    !options.geometry &&
    /^UPPER\(locality\) = '/.test(options.where) &&
    !options.where.includes('lot_number') &&
    !options.where.includes('road_name');

  if (count > config.searchMaxResults && suburbOnly) {
    const extent = await queryExtent(config.landgate.parcel.url, params);
    return {
      status: 'too_many_locality',
      count,
      extent,
      features: [],
      warnings: [
        ...options.warnings,
        `${count.toLocaleString('en-AU')} parcels match this suburb on the public layer. The POC will not pick one. Zoom to the locality and click the construction parcel, or add Lot or Street.`
      ]
    };
  }

  const collection = await queryFeatures(
    config.landgate.parcel.url,
    params,
    config.landgate.parcel.outFields,
    config.searchMaxResults + 1
  );
  const features = collection.features;
  if (!options.allowTooMany && features.length > config.searchMaxResults) {
    return {
      status: 'too_many',
      count,
      features: features.slice(0, config.searchMaxResults),
      warnings: [
        ...options.warnings,
        `More than ${config.searchMaxResults} parcels matched. None were auto-selected. Refine Lot/Street/Suburb/Plan or pick from the list.`
      ]
    };
  }
  return finaliseParcelResult(features, options.warnings, count);
}

async function searchParcelsInPlans(
  plans: Feature[],
  clauses: string[],
  warnings: string[]
): Promise<SearchResponse> {
  const collected: Feature[] = [];
  const seen = new Set<number | string>();
  for (const plan of plans) {
    if (!plan.geometry) {
      continue;
    }
    const result = await queryParcels({
      where: clauses.length ? clauses.join(' AND ') : '1=1',
      geometry: plan.geometry,
      warnings,
      allowTooMany: true
    });
    for (const feature of result.features) {
      const id = (feature.id ?? feature.properties?.['objectid']) as number | string | undefined;
      if (id != null && seen.has(id)) {
        continue;
      }
      if (id != null) {
        seen.add(id);
      }
      collected.push(feature);
      if (collected.length > config.searchMaxResults) {
        break;
      }
    }
    if (collected.length > config.searchMaxResults) {
      break;
    }
  }
  return finaliseParcelResult(collected, warnings);
}

export async function search(criteria: SearchCriteria): Promise<SearchResponse> {
  const hasLot = !isBlank(criteria.lotNumber);
  const hasStreet = !isBlank(criteria.street);
  const hasSuburb = !isBlank(criteria.suburb);
  const hasPlan = !isBlank(criteria.planNumber);
  const hasEstate = !isBlank(criteria.estate);
  const hasPostcode = !isBlank(criteria.postcode);

  if (!hasLot && !hasStreet && !hasSuburb && !hasPlan && !criteria.planGeometry) {
    if (hasEstate || hasPostcode) {
      throw new LandgateError(
        'UNSUPPORTED_FIELDS',
        'Estate and postcode are not published on the public Cadastre Address (LGATE-002) layer. Add Lot, Street, Suburb, or Plan, or click a parcel on the map.'
      );
    }
    throw new LandgateError(
      'INVALID',
      'Enter at least one searchable field that the public service actually supports: Lot, Street, Suburb, or Plan.'
    );
  }

  const { clauses, warnings } = buildAttributeWhere(criteria);

  if (criteria.planGeometry) {
    return queryParcels({
      where: clauses.length ? clauses.join(' AND ') : '1=1',
      geometry: criteria.planGeometry,
      warnings: [
        ...warnings,
        'Using the selected Plan Extent (LGATE-284) as a spatial filter — not a licensed lot-on-plan attribute.'
      ]
    });
  }

  if (hasPlan) {
    const { plans, parsed } = await findPlanExtents(criteria.planNumber ?? '');
    if (plans.length === 0) {
      throw new LandgateError(
        'NOT_FOUND',
        `No public Plan Extent (LGATE-284) matched “${parsed.raw}”. Plan search uses plan extent polygons, not the licensed survey_number on each parcel.`
      );
    }
    if (plans.length > 1 && clauses.length === 0) {
      return {
        status: 'plan_candidates',
        plans,
        features: [],
        warnings: [
          ...warnings,
          'Several plan extents matched. Choose one, then the app will look for parcels inside that extent. This is a spatial hint, not a licensed lot-on-plan attribute join.'
        ]
      };
    }
    if (plans.length === 1) {
      const plan = plans[0];
      const label =
        (plan.properties?.['plan_identifier'] as string) ||
        (plan.properties?.['label_text'] as string) ||
        parsed.raw;
      warnings.push(
        `Plan “${label}” is from Plan Extent (LGATE-284), intersected spatially — not a parcel survey_number field.`
      );
      return queryParcels({
        where: clauses.length ? clauses.join(' AND ') : '1=1',
        geometry: plan.geometry,
        warnings
      });
    }
    return searchParcelsInPlans(plans, clauses, warnings);
  }

  return queryParcels({ where: clauses.join(' AND '), warnings });
}

export async function selectFeature(feature: Feature): Promise<SelectResponse> {
  if (!feature?.geometry) {
    throw new LandgateError(
      'INVALID',
      'That parcel was returned without geometry, so a coordinate cannot be calculated.'
    );
  }
  const location = describeParcelLocation(feature);
  const intersectingPlans = await findIntersectingPlans(feature.geometry);
  const warnings: string[] = [];
  if (intersectingPlans.length === 0) {
    warnings.push(
      'No intersecting Plan Extent (LGATE-284) was found. The public parcel layer does not store survey_number.'
    );
  } else if (intersectingPlans.length > 1) {
    warnings.push(
      `Intersecting plan extents: ${intersectingPlans
        .map((plan) => plan.label_text || plan.plan_identifier)
        .filter(Boolean)
        .join('; ')}. These are spatial intersections, not a licensed lot-on-plan join.`
    );
  }
  return {
    feature,
    location,
    intersectingPlans,
    warnings,
    dataset: `${config.landgate.parcel.name} · ${config.landgate.parcel.url}`,
    locationSource: 'LANDGATE_PARCEL',
    timestamp: new Date().toISOString()
  };
}
