import { json, jsonError, queryParam, sendWebOrNode, toWebRequest } from '../../lib/http-web';
import { queryViewport } from '../../lib/landgate';

async function handle(request: Request): Promise<Response> {
  try {
    return json(
      200,
      await queryViewport(
        Number(queryParam(request, 'west')),
        Number(queryParam(request, 'south')),
        Number(queryParam(request, 'east')),
        Number(queryParam(request, 'north'))
      )
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
