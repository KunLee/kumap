import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryString, sendError, sendJson } from '../../lib/http';
import { identifyAt } from '../../lib/landgate';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Use GET.' });
    return;
  }
  try {
    sendJson(
      res,
      200,
      await identifyAt(Number(queryString(req, 'lng')), Number(queryString(req, 'lat')))
    );
  } catch (error) {
    sendError(res, error);
  }
}
