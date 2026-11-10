import type { VercelRequest, VercelResponse } from '@vercel/node';
import { config } from '../lib/config';
import { sendError, sendJson } from '../lib/http';
import { LandgateError } from '../lib/types';

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const { parcel } = config.landgate;
    const response = await fetch(`${parcel.url}?f=json`);
    const payload = (await response.json()) as {
      name?: string;
      fields?: Array<{ name: string }>;
      maxRecordCount?: number;
      error?: { message?: string };
    };
    if (!response.ok || payload.error) {
      throw new LandgateError(
        'UNAVAILABLE',
        payload.error?.message ||
          `Landgate returned HTTP ${response.status} when reading ${parcel.datasetId}.`
      );
    }
    sendJson(res, 200, {
      ok: true,
      name: payload.name || parcel.name,
      datasetId: parcel.datasetId,
      fields: (payload.fields || []).map((field) => field.name).filter((name) => name !== 'shape'),
      maxRecordCount: payload.maxRecordCount,
      public: parcel.public,
      license: parcel.license
    });
  } catch (error) {
    sendError(res, error);
  }
}
