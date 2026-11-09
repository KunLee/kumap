/**
 * Front-end map defaults.
 *
 * OpenFreeMap = hosted basemap styles/tiles (this file).
 * MapLibre GL JS = the renderer (map.ts).
 * Landgate = cadastral source, accessed only via the TypeScript /api adapter.
 */

export const appConfig = {
  title: 'Jason Windows - New Construction Location POC',
  map: {
    styleUrl: 'https://tiles.openfreemap.org/styles/positron',
    center: [115.86, -31.95] as [number, number],
    zoom: 10,
    minParcelZoom: 14,
    homeBounds: [
      [115.55, -32.55],
      [116.25, -31.45]
    ] as [[number, number], [number, number]]
  },
  attribution:
    '© OpenStreetMap contributors · © OpenFreeMap · Landgate SLIP public cadastre (not the basemap)'
};
