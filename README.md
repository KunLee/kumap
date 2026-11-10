# Jason Windows - New Construction Location POC

Proof of concept for locating **new-construction jobs in Western Australia** when the Pronto address is incomplete, a lot number rather than a street number, or otherwise unusable in a normal geocoder.

This is **feasibility validation**, not a production system. It is **not** licensed for Jason Windows production use until Landgate access and licensing are confirmed.

The app runs **without an ArcGIS Online account, ArcGIS API key, ArcGIS Maps SDK, or ArcGIS-hosted basemaps**.

## 1. Business problem

Jason Windows stores jobs in Pronto. Established properties can usually be geocoded from a street address. New houses and new subdivisions often cannot:

- the address may not exist yet in geocoders
- the job may use a **lot number** instead of a final street number
- the street or estate may be newly created
- the stored address may be incomplete

The long-term idea:

```
Pronto job
  -> identify the land parcel
  -> obtain a reliable latitude / longitude
  -> write those values into the existing Pronto lat/long fields
  -> downstream processes use the coordinates
```

This POC does **not** integrate with Pronto. It asks whether information similar to a Pronto construction job can identify a Landgate parcel and produce usable WGS84 coordinates.

## 2. Architecture

Keep these four things distinct:

| Piece | Role in this POC |
| --- | --- |
| **OpenStreetMap** | Underlying geographic / map data used by the basemap |
| **OpenFreeMap** | Hosts the basemap **style and tiles** (Positron) |
| **MapLibre GL JS** | Browser map renderer |
| **Landgate SLIP** | Authoritative WA cadastral / parcel source under investigation |
| **Pronto** | Future destination for coordinates — not connected |

```
Jason Windows POC (Angular + TypeScript)
        |
        +-- MapLibre GL JS
        |      |
        |      v
        |   OpenFreeMap Positron  = contextual basemap only
        |
        +-- TypeScript /api adapter
               |
               v
          Landgate SLIP (HTTP ArcGIS REST)
               |
          parcel GeoJSON
               |
               v
          MapLibre GeoJSON overlay
               |
          select parcel
               |
               v
          representative point (Turf)
               |
               v
          WGS84 latitude / longitude
               |
               v
          future Pronto fields
```

OpenFreeMap is **not** the source of parcel information. The basemap is background only. Landgate remains the business-data source.

### Code layout

```
src/                    Angular UI (MapLibre)
  app/map.ts            MapLibre init, OpenFreeMap style, parcel layers
  app/landgate.ts       HTTP client for /api (does not call Landgate URLs)
  app/config.ts         Map defaults (Perth, OpenFreeMap style URL)
lib/                    TypeScript Landgate adapter (shared by Vercel + local API)
  config.ts             Landgate endpoints / layer ids
  landgate.ts           Query construction, REST access, GeoJSON normalisation
  coordinates.ts        Interior point / centroid, WGS84 formatting
api/                    Vercel serverless functions
server/dev.ts           Local API on port 3000
```

Landgate URLs stay in `lib/config.ts` so a licensed SLIP endpoint can be substituted later.

Consuming a **Landgate ArcGIS REST URL over HTTP** is not using ArcGIS Online or the ArcGIS Maps SDK. The response is parsed in TypeScript and drawn with MapLibre.

## 3. How to run locally

Requires Node.js 20+.

```bash
npm install
npm start
```

That starts:

- TypeScript API at [http://127.0.0.1:8787](http://127.0.0.1:8787)
- Angular app at [http://localhost:4200](http://localhost:4200) (proxies `/api` to port 8787)

Open [http://localhost:4200](http://localhost:4200).

Useful checks:

- Example A: Lot `275`, Street `Irene`, Suburb `North Fremantle`
- Example B: Lot `275`, Plan `12345`, Suburb `Eglinton` (usually cannot auto-match on public data — that is a POC finding)
- Zoom into a Perth suburb until parcel outlines appear, then click a parcel

## 4. Mapping configuration

**Neither service used by this POC requires an API key.** That is not the same as “free for Jason Windows production.”

| Service | API key? | Cost / licence for this POC |
| --- | --- | --- |
| **OpenFreeMap** public tiles (`tiles.openfreemap.org`) | No | Free public instance, including commercial use. Attribution required (OpenStreetMap / OpenFreeMap). See [openfreemap.org](https://openfreemap.org/). |
| **Landgate SLIP public REST** (LGATE-002 / LGATE-284) | No | Public and reachable without a key, but licensed as **Personal Use / Other (Non-Commercial)**. Not a commercial production licence. |

| Setting | Value |
| --- | --- |
| Renderer | MapLibre GL JS (library, not a hosted API) |
| Basemap | OpenFreeMap Positron |
| Style URL | `https://tiles.openfreemap.org/styles/positron` |
| Default view | Perth, `[115.86, -31.95]`, zoom 10 |
| Overlay | Landgate parcel GeoJSON, loaded only at suburb zoom |

Attribution includes OpenStreetMap, OpenFreeMap, and Landgate SLIP.

## 5. Landgate endpoint / layer used

Official starting point: [Landgate SLIP](https://www.landgate.wa.gov.au/location-data-and-services/programs-and-initiatives/slip/).

The public service does **not** expose MapLibre vector tiles. It exposes ArcGIS REST (and OGC WMS/WFS). This POC uses REST `query` with `f=geojson` and `outSR=4326`.

| Use | Dataset | Public? | Endpoint |
| --- | --- | --- | --- |
| Parcel polygons + searchable address fields | **Cadastre Address (LGATE-002)** | Yes, personal / non-commercial | `https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Places_and_Addresses_WFS/MapServer/2` |
| Plan-number spatial hint | **Plan Extent (LGATE-284)** | Yes, personal / non-commercial | `https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/135` |
| Cadastre with no attributes (not used for overlay) | Cadastre (No Attributes) (LGATE-001) | Yes | Property_and_Planning MapServer /2 |

Source geometry on the service is **GDA2020 (EPSG:7844)**. Queries request **WGS84 (EPSG:4326)**. Displayed coordinates are labelled WGS84 / EPSG:4326.

## 6. Fields actually available from the public layer

LGATE-002 fields used as returned by the service:

- `objectid`
- `land_id`
- `lot_number`
- `road_number_type`
- `road_number_1`
- `road_number_2`
- `road_name`
- `road_type`
- `road_suffix`
- `locality`
- `view_scale`
- polygon geometry

The UI does **not** invent attributes. Empty values are shown as “Not provided by this public layer”.

Area is **derived from geometry** (Turf), not Landgate `calculated_area`.

Plan text on the result panel, when present, is an **intersection with LGATE-284 plan extents**, not a parcel `survey_number` field.

## 7. What works with public data

- OpenFreeMap basemap with no ArcGIS account
- Live Landgate parcel boundaries over the basemap (when zoomed in)
- Click a real WA parcel, highlight it, show returned attributes
- Representative WGS84 coordinate from the polygon
- Search by **lot**, **street (`road_name`)**, **suburb (`locality`)** when those values exist on LGATE-002
- Plan search as a **spatial filter** via LGATE-284 (user must confirm if several extents match)
- Copy coordinates; demo “Use for Pronto Job” that **does not write to Pronto**
- Multiple matches are listed — the app will not silently pick one

## 8. Limitations caused by public-data access

These are POC results, not bugs:

- **Lot + Plan + Suburb → unique parcel is not a real attribute join** on public data. Plan number is not stored on LGATE-002.
- **Estate** and **postcode** are not published on LGATE-002 (fields are visible but ignored).
- **Lot numbers are often blank** on the public address layer, including in new-construction suburbs such as Eglinton, even though polygons exist. Manual map selection is the fallback.
- LGATE-002 is a **simplified** cadastre. Landgate points to Cadastre Polygons (LGATE-217 / historically LGATE-082) for the full cadastre, and Property Street Address (LGATE-150) for complete addresses.
- Public SLIP use is under a **Personal Use / non-commercial** licence. Public accessibility is **not** permission for commercial production.
- Cadastre is dense: the overlay loads only at suburb zoom and may truncate very large views.

## 9. What Landgate access a production solution would need

Confirm with Landgate (Customer Experience: +61 (0)8 9273 7683, CustomerExperience@Landgate.wa.gov.au). Likely:

| Dataset | Why |
| --- | --- |
| **Cadastre (Polygon) LGATE-217** | `lot_number`, `survey_type`, `survey_number`, `pi_parcel`, `land_id`, `polygon_number`, official area/centroids |
| **Lodged Cadastre (Polygon) LGATE-222** | Surveys not yet integrated — typical for new lots / new houses |
| **Property Street Address LGATE-150** | Complete addressing |

Access is a **SLIP cadastral subscription**, not the public personal-use feed. Subscription terms restrict commercial/external reuse (including displaying boundary measurements and lot area). Jason Windows would need a licence that covers operational use and writing coordinates into Pronto.

Data dictionary: [SLIP Cadastre Data Dictionary](https://www.landgate.wa.gov.au/siteassets/documents/location-data-and-services/cadastral-data/slip-cadastre-data-dictionary-v1.7.pdf).  
Licensing: [Landgate licensing](https://www.landgate.wa.gov.au/location-data-and-services/discovering-landgate-data/licensing/).

## 10. Future Pronto integration (not implemented)

```
Pronto job created / updated
        |
        v
Does the job already contain reliable coordinates?
        |
       NO
        |
        v
Can a normal address be geocoded reliably?   (out of scope for this POC)
      /    \
    YES     NO
     |       |
     |       v
     |    Landgate parcel lookup (licensed LGATE-217 / 222)
     |       |
     |    candidate parcel(s) — human confirm if more than one
     |       |
     |    representative coordinate
     |
     +-------+
         |
         v
latitude + longitude  (WGS84)
         |
         v
Pronto job fields
         +-- Location Source (LANDGATE_PARCEL / GEOCODE / MANUAL)
         +-- Landgate / parcel id
         +-- Coordinate method + timestamp
```

The demo button only shows: *“POC only — these coordinates would be written to the Pronto job.”*

## Coordinate method

```
Landgate parcel polygon (requested as EPSG:4326)
        |
        v
Turf point-on-feature (interior / point-on-surface)
        |
        +-- if that fails or is not inside the polygon
        v
Turf centroid  (labelled as a derived centroid)
        |
        v
Latitude / longitude at 6 decimal places
```

The displayed point is **derived**. It is not a Landgate-supplied construction peg or building location.

## Deploy to Vercel

```bash
npx vercel
```

`vercel.json` uses the Angular output at `dist/kumap/browser` and TypeScript functions in `/api`. Hobby plans cap function duration; keep map zoom high so Landgate queries stay small.

No secrets are required for the public-data demo. Do not add Landgate credentials to the repo if a licensed endpoint is used later — use Vercel environment variables.

## Success criteria (this iteration)

1. Runs without an ArcGIS account or API key.
2. MapLibre shows the OpenFreeMap Positron basemap.
3. Landgate parcels overlay independently of the basemap.
4. A real WA parcel can be displayed and selected.
5. Available Landgate attributes are shown (none invented).
6. A representative latitude/longitude is calculated from the parcel.
7. Coordinates are displayed as WGS84 / EPSG:4326.
8. The Pronto demo path is explicit and does not write to Pronto.
9. Public-data search limits are documented rather than hidden with mock data.

The question this POC still answers:

> Given the information Jason Windows receives for a new-construction Pronto job, can we reliably identify the corresponding Landgate land parcel and obtain a usable latitude/longitude even when the final street address is not yet reliable?

**With public SLIP data: not automatically for Lot + Plan + Suburb. Geometry + click (or lot/street/locality when those fields are populated) does work, and licensed cadastre would be required to automate production lookup.**
