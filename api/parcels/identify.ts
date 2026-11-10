import { json, jsonError, queryParam, sendWebOrNode, toWebRequest } from '../../lib/http-web';
import { identifyAt } from '../../lib/landgate';

async function handle(request: Request): Promise<Response> {
  try {
    return json(
      200,
      await identifyAt(Number(queryParam(request, 'lng')), Number(queryParam(request, 'lat')))
    );
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(toWebRequest(request));
}

export default async function handler(req: unknown, res?: unknown): Promise<Response | void> {
  return sendWebOrNode(await handle(toWebRequest(req as Request)), res as never);
}
