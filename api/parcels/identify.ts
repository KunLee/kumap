import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryString, sendError, sendJson } from '../../lib/http';
import { identifyAt } from '../../lib/landgate';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Use GET.' });
    return;
  }
  try {
    const lng = Number(queryString(req, 'lng'));
    const lat = Number(queryString(req, 'lat'));
    sendJson(res, 200, await identifyAt(lng, lat));
  } catch (error) {
    sendError(res, error);
  }
}
