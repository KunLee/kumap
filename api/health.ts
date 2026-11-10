import { config } from '../lib/config';
import { json, jsonError, sendWebOrNode } from '../lib/http-web';
import { LandgateError } from '../lib/types';

async function handle(): Promise<Response> {
  try {
    const { parcel } = config.landgate;
    let response: Response;
    try {
      response = await fetch(`${parcel.url}?f=json`, {
        signal: AbortSignal.timeout(config.landgateTimeoutMs)
      });
    } catch {
      throw new LandgateError('UNAVAILABLE', 'Could not contact Landgate SLIP.');
    }
    const payload = (await response.json()) as {
      name?: string;
      fields?: Array<{ name: string }>;
      maxRecordCount?: number;
      error?: { message?: string };
    };
    if (!response.ok || payload.error) {
      throw new LandgateError(
        'UNAVAILABLE',
        payload.error?.message ||
          `Landgate returned HTTP ${response.status} when reading ${parcel.datasetId}.`
      );
    }
    return json(200, {
      ok: true,
      name: payload.name || parcel.name,
      datasetId: parcel.datasetId,
      fields: (payload.fields || []).map((field) => field.name).filter((name) => name !== 'shape'),
      maxRecordCount: payload.maxRecordCount,
      public: parcel.public,
      license: parcel.license
    });
  } catch (error) {
    return jsonError(error);
  }
}

export const GET = handle;

export default async function handler(req: unknown, res?: unknown): Promise<Response | void> {
  return sendWebOrNode(await handle(), res as never);
}
