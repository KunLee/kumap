import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readJsonBody, sendError, sendJson } from '../../lib/http';
import { search } from '../../lib/landgate';
import type { SearchCriteria } from '../../lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Use POST.' });
    return;
  }
  try {
    sendJson(res, 200, await search(await readJsonBody<SearchCriteria>(req)));
  } catch (error) {
    sendError(res, error);
  }
}
