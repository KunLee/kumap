import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendError, sendJson } from '../lib/http';
import { healthCheck } from '../lib/landgate';

export const config = { maxDuration: 30 };

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    sendJson(res, 200, await healthCheck());
  } catch (error) {
    sendError(res, error);
  }
}
