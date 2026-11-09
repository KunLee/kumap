/**
 * MapLibre GL JS renderer.
 *
 * Basemap: OpenFreeMap Positron (hosted styles/tiles; OSM is the underlying map data).
 * Overlay: Landgate parcel GeoJSON from the TypeScript adapter — not from OpenFreeMap.
 */
import { Injectable, NgZone } from '@angular/core';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import maplibregl, {
  type GeoJSONSource,
  type Map as MapLibreMap,
  type MapMouseEvent,
  Popup
} from 'maplibre-gl';
import { appConfig } from './config';

const PARCEL_SOURCE = 'landgate-parcels';
const PARCEL_FILL = 'landgate-parcels-fill';
const PARCEL_LINE = 'landgate-parcels-line';
const SELECT_SOURCE = 'landgate-selected';
const SELECT_FILL = 'landgate-selected-fill';
const SELECT_LINE = 'landgate-selected-line';
const POINT_SOURCE = 'landgate-point';
const POINT_LAYER = 'landgate-point-circle';

const emptyCollection = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

@Injectable({ providedIn: 'root' })
export class MapService {
  private map?: MapLibreMap;
  private popup?: Popup;
  private onClickParcel?: (lng: number, lat: number) => void;
  private onMoveEnd?: (bounds: { west: number; south: number; east: number; north: number; zoom: number }) => void;

  constructor(private readonly zone: NgZone) {}

  init(
    container: HTMLElement,
    handlers: {
      onClickParcel: (lng: number, lat: number) => void;
      onMoveEnd: (bounds: { west: number; south: number; east: number; north: number; zoom: number }) => void;
    }
  ): MapLibreMap {
    this.onClickParcel = handlers.onClickParcel;
    this.onMoveEnd = handlers.onMoveEnd;

    this.map = new maplibregl.Map({
      container,
      style: appConfig.map.styleUrl,
      center: appConfig.map.center,
      zoom: appConfig.map.zoom,
      attributionControl: false
    });

    this.map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: appConfig.attribution
      }),
      'bottom-right'
    );
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    this.map.addControl(new HomeControl(() => this.goHome()), 'top-left');
    this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

    this.map.on('load', () => {
      this.addSourcesAndLayers();
    });

    this.map.on('click', (event: MapMouseEvent) => {
      this.zone.run(() => this.onClickParcel?.(event.lngLat.lng, event.lngLat.lat));
    });
    this.map.on('mouseenter', PARCEL_FILL, () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = 'pointer';
      }
    });
    this.map.on('mouseleave', PARCEL_FILL, () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = '';
      }
    });
    this.map.on('moveend', () => this.emitMove());

    return this.map;
  }

  private addSourcesAndLayers(): void {
    const map = this.map;
    if (!map) {
      return;
    }
    map.addSource(PARCEL_SOURCE, { type: 'geojson', data: emptyCollection() });
    map.addSource(SELECT_SOURCE, { type: 'geojson', data: emptyCollection() });
    map.addSource(POINT_SOURCE, { type: 'geojson', data: emptyCollection() });

    map.addLayer({
      id: PARCEL_FILL,
      type: 'fill',
      source: PARCEL_SOURCE,
      paint: {
        'fill-color': '#333333',
        'fill-opacity': 0.05
      }
    });
    map.addLayer({
      id: PARCEL_LINE,
      type: 'line',
      source: PARCEL_SOURCE,
      paint: {
        'line-color': '#333333',
        'line-width': 1.2
      }
    });
    map.addLayer({
      id: SELECT_FILL,
      type: 'fill',
      source: SELECT_SOURCE,
      paint: {
        'fill-color': '#ef3e33',
        'fill-opacity': 0.25
      }
    });
    map.addLayer({
      id: SELECT_LINE,
      type: 'line',
      source: SELECT_SOURCE,
      paint: {
        'line-color': '#ee3424',
        'line-width': 2.5
      }
    });
    map.addLayer({
      id: POINT_LAYER,
      type: 'circle',
      source: POINT_SOURCE,
      paint: {
        'circle-radius': 6,
        'circle-color': '#ef3e33',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff'
      }
    });
  }

  private emitMove(): void {
    const map = this.map;
    if (!map) {
      return;
    }
    const bounds = map.getBounds();
    this.zone.run(() =>
      this.onMoveEnd?.({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
        zoom: map.getZoom()
      })
    );
  }

  setParcels(collection: FeatureCollection): void {
    this.setSourceData(PARCEL_SOURCE, collection);
  }

  highlight(feature: Feature | null): void {
    this.setSourceData(
      SELECT_SOURCE,
      feature ? { type: 'FeatureCollection', features: [feature] } : emptyCollection()
    );
  }

  showPoint(lng: number, lat: number): void {
    this.setSourceData(POINT_SOURCE, {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [lng, lat] }
        }
      ]
    });
  }

  clearSelection(): void {
    this.highlight(null);
    this.setSourceData(POINT_SOURCE, emptyCollection());
    this.popup?.remove();
  }

  showPopup(lng: number, lat: number, title: string, body: string): void {
    if (!this.map) {
      return;
    }
    this.popup?.remove();
    this.popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
      .setLngLat([lng, lat])
      .setHTML(`<strong>${escapeHtml(title)}</strong><div>${escapeHtml(body)}</div>`)
      .addTo(this.map);
  }

  fitFeatures(features: Feature[], padding = 60): void {
    const coords = features.flatMap((feature) => flattenCoords(feature.geometry));
    if (coords.length === 0) {
      return;
    }
    this.fitLngLats(coords, padding);
  }

  fitExtent(extent: [number, number, number, number]): void {
    this.map?.fitBounds(
      [
        [extent[0], extent[1]],
        [extent[2], extent[3]]
      ],
      { padding: 40, duration: 700 }
    );
  }

  goHome(): void {
    this.map?.fitBounds(appConfig.map.homeBounds, { duration: 700 });
  }

  zoomBy(delta: number): void {
    this.map?.zoomTo((this.map.getZoom() || 10) + delta, { duration: 250 });
  }

  resize(): void {
    this.map?.resize();
  }

  currentZoom(): number {
    return this.map?.getZoom() ?? 0;
  }

  destroy(): void {
    this.popup?.remove();
    this.map?.remove();
    this.map = undefined;
  }

  private setSourceData(id: string, data: FeatureCollection): void {
    const source = this.map?.getSource(id) as GeoJSONSource | undefined;
    source?.setData(data);
  }

  private fitLngLats(coords: Array<[number, number]>, padding: number): void {
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const [lng, lat] of coords) {
      west = Math.min(west, lng);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      north = Math.max(north, lat);
    }
    this.map?.fitBounds(
      [
        [west, south],
        [east, north]
      ],
      { padding, duration: 700, maxZoom: 18 }
    );
  }
}

function flattenCoords(geometry: Geometry | null): Array<[number, number]> {
  if (!geometry) {
    return [];
  }
  if (geometry.type === 'Point') {
    return [geometry.coordinates as [number, number]];
  }
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.flat() as Array<[number, number]>;
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flat(2) as Array<[number, number]>;
  }
  return [];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

class HomeControl implements maplibregl.IControl {
  private container?: HTMLDivElement;

  constructor(private readonly onHome: () => void) {}

  onAdd(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    const button = document.createElement('button');
    button.type = 'button';
    button.title = 'Perth metropolitan extent';
    button.setAttribute('aria-label', 'Perth metropolitan extent');
    button.className = 'maplibregl-ctrl-icon maplibregl-ctrl-home';
    button.addEventListener('click', this.onHome);
    container.appendChild(button);
    this.container = container;
    return container;
  }

  onRemove(): void {
    this.container?.remove();
  }
}
