import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryString, sendError, sendJson } from '../../lib/http';
import { queryViewport } from '../../lib/landgate';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Use GET.' });
    return;
  }
  try {
    sendJson(
      res,
      200,
      await queryViewport(
        Number(queryString(req, 'west')),
        Number(queryString(req, 'south')),
        Number(queryString(req, 'east')),
        Number(queryString(req, 'north'))
      )
    );
  } catch (error) {
    sendError(res, error);
  }
}
