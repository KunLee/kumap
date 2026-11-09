import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readJsonBody, sendError, sendJson } from '../../lib/http';
import { search } from '../../lib/landgate';
import type { SearchCriteria } from '../../lib/types';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Use POST.' });
    return;
  }
  try {
    const body = await readJsonBody<SearchCriteria>(req);
    sendJson(res, 200, await search(body));
  } catch (error) {
    sendError(res, error);
  }
}
