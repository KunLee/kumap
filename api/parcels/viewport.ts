import type { VercelRequest, VercelResponse } from '@vercel/node';
import { queryString, sendError, sendJson } from '../../lib/http';
import { queryViewport } from '../../lib/landgate';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Use GET.' });
    return;
  }
  try {
    const west = Number(queryString(req, 'west'));
    const south = Number(queryString(req, 'south'));
    const east = Number(queryString(req, 'east'));
    const north = Number(queryString(req, 'north'));
    sendJson(res, 200, await queryViewport(west, south, east, north));
  } catch (error) {
    sendError(res, error);
  }
}
