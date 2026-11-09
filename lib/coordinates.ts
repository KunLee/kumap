/**
 * Representative point + WGS84 formatting.
 *
 * Landgate does not supply a construction-site coordinate on the public layer.
 * We derive a point from the parcel polygon after requesting geometry as
 * EPSG:4326 from the SLIP service.
 */

import { area } from '@turf/area';
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';
import { centroid } from '@turf/centroid';
import { pointOnFeature } from '@turf/point-on-feature';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { config } from './config';
import type { RepresentativePoint } from './types';

function isPolygonFeature(
  feature: Feature
): feature is Feature<Polygon | MultiPolygon> {
  return feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon';
}

export function describeParcelLocation(feature: Feature): RepresentativePoint {
  if (!isPolygonFeature(feature)) {
    throw new Error('Parcel has no polygon geometry, so a coordinate cannot be calculated.');
  }

  let method: RepresentativePoint['method'] = 'interior_point';
  let methodLabel = 'Interior point (point-on-surface)';
  let point = pointOnFeature(feature);

  const usable =
    point?.geometry?.type === 'Point' &&
    Number.isFinite(point.geometry.coordinates[0]) &&
    Number.isFinite(point.geometry.coordinates[1]) &&
    booleanPointInPolygon(point, feature);

  if (!usable) {
    point = centroid(feature);
    method = 'centroid';
    methodLabel = 'Derived polygon centroid (interior point was not available)';
  }

  const [lng, lat] = point.geometry.coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error('Calculated coordinate was not a valid numeric point.');
  }

  const decimals = config.coordinateDecimals;
  const latitude = lat.toFixed(decimals);
  const longitude = lng.toFixed(decimals);
  const areaM2 = area(feature);

  return {
    latitude,
    longitude,
    copyText: `${latitude}, ${longitude}`,
    lng,
    lat,
    method,
    methodLabel,
    crs: 'WGS84 / EPSG:4326',
    areaM2: Number.isFinite(areaM2) ? areaM2 : null,
    areaLabel: Number.isFinite(areaM2)
      ? `${Math.round(areaM2).toLocaleString('en-AU')} m² (derived from geometry, not a Landgate official area)`
      : null
  };
}
