/**
 * Landgate SLIP configuration.
 *
 * Endpoint URLs live here so a licensed cadastral service can be substituted
 * later without rewriting Angular or MapLibre code.
 *
 * Consuming a Landgate ArcGIS REST URL is not the same as using ArcGIS Online
 * or the ArcGIS Maps SDK. This POC talks to Landgate over HTTP only.
 */

export const config = {
  title: 'Jason Windows - New Construction Location POC',
  searchMaxResults: 50,
  viewportMaxResults: 400,
  coordinateDecimals: 6,
  landgateTimeoutMs: 20000,

  landgate: {
    catalogue:
      'https://www.landgate.wa.gov.au/location-data-and-services/programs-and-initiatives/slip/',
    personalUseLicence:
      'https://www0.landgate.wa.gov.au/__data/assets/pdf_file/0009/19890/SLIP-Transaction-Personal-Use-Licence.pdf',
    licensing:
      'https://www.landgate.wa.gov.au/location-data-and-services/discovering-landgate-data/licensing/',
    dataDictionary:
      'https://www.landgate.wa.gov.au/siteassets/documents/location-data-and-services/cadastral-data/slip-cadastre-data-dictionary-v1.7.pdf',
    sourceCrs: { name: 'GDA2020', wkid: 7844, epsg: 'EPSG:7844' },
    displayCrs: { name: 'WGS84', wkid: 4326, epsg: 'EPSG:4326' },

    parcel: {
      datasetId: 'LGATE-002',
      name: 'Cadastre Address (LGATE-002)',
      url: 'https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Places_and_Addresses_WFS/MapServer/2',
      public: true,
      license: 'Personal Use / Other (Non-Commercial) — not a commercial production licence',
      outFields: [
        'objectid',
        'land_id',
        'lot_number',
        'road_number_type',
        'road_number_1',
        'road_number_2',
        'road_name',
        'road_type',
        'road_suffix',
        'locality',
        'view_scale'
      ],
      unsupportedByThisLayer: [
        'plan / survey_number',
        'survey_type',
        'pi_parcel',
        'polygon_number',
        'estate name',
        'postcode',
        'official calculated_area',
        'Landgate centroid_latitude / centroid_longitude'
      ]
    },

    planExtent: {
      datasetId: 'LGATE-284',
      name: 'Plan Extent (LGATE-284)',
      url: 'https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/135',
      public: true,
      outFields: ['objectid', 'label_text', 'status', 'plan_identifier', 'view_scale', 'source']
    },

    cadastreNoAttributes: {
      datasetId: 'LGATE-001',
      name: 'Cadastre (No Attributes) (LGATE-001)',
      url: 'https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/2',
      fields: ['objectid', 'view_scale']
    },

    licensedProduction: [
      {
        datasetId: 'LGATE-217',
        name: 'Cadastre (Polygon)',
        access: 'SLIP cadastral subscription',
        why: 'Authoritative current parcels with lot_number, survey_type, survey_number, pi_parcel, land_id, polygon_number, area and centroids.'
      },
      {
        datasetId: 'LGATE-222',
        name: 'Lodged Cadastre (Polygon)',
        access: 'SLIP cadastral subscription',
        why: 'Surveys lodged but not yet integrated — typical for new subdivisions / new houses.'
      },
      {
        datasetId: 'LGATE-150',
        name: 'Property Street Address',
        access: 'SLIP subscription (complete address product)',
        why: 'Full street addressing, including cases where LGATE-002 only has a parent-parcel address.'
      }
    ]
  }
} as const;
