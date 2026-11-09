import type { Feature } from 'geojson';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readJsonBody, sendError, sendJson } from '../../lib/http';
import { selectFeature } from '../../lib/landgate';
import { LandgateError } from '../../lib/types';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Use POST.' });
    return;
  }
  try {
    const body = await readJsonBody<{ feature?: Feature }>(req);
    if (!body.feature) {
      throw new LandgateError('INVALID', 'A GeoJSON feature is required.');
    }
    sendJson(res, 200, await selectFeature(body.feature));
  } catch (error) {
    sendError(res, error);
  }
}
