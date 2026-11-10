import type { Feature } from 'geojson';
import { json, jsonError, sendWebOrNode, toWebRequest } from '../../lib/http-web';
import { selectFeature } from '../../lib/landgate';
import { LandgateError } from '../../lib/types';

async function handle(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { feature?: Feature };
    if (!body.feature) {
      throw new LandgateError('INVALID', 'A GeoJSON feature is required.');
    }
    return json(200, await selectFeature(body.feature));
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
