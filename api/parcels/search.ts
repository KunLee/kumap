import { json, jsonError, sendWebOrNode, toWebRequest } from '../../lib/http-web';
import { search } from '../../lib/landgate';
import type { SearchCriteria } from '../../lib/types';

async function handle(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as SearchCriteria;
    return json(200, await search(body));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  return handle(toWebRequest(request));
}

export default async function handler(req: unknown, res?: unknown): Promise<Response | void> {
  return sendWebOrNode(await handle(toWebRequest(req as Request)), res as never);
}
