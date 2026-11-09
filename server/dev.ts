/**
 * Local TypeScript API for `npm run dev`.
 * Same handlers as the Vercel /api functions.
 */
import { createServer } from 'node:http';
import { healthCheck, identifyAt, queryViewport, search, selectFeature } from '../lib/landgate';
import { LandgateError } from '../lib/types';
import type { Feature } from 'geojson';
import type { SearchCriteria } from '../lib/types';

const port = Number(process.env['PORT'] || 8787);

function send(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(body));
}

function errorStatus(error: LandgateError): number {
  if (error.code === 'NOT_FOUND') {
    return 404;
  }
  if (
    error.code === 'INVALID' ||
    error.code === 'INVALID_LOT' ||
    error.code === 'INVALID_PLAN' ||
    error.code === 'UNSUPPORTED_FIELDS'
  ) {
    return 400;
  }
  return 502;
}

async function readBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }

  try {
    if (url.pathname === '/api/health' && req.method === 'GET') {
      send(res, 200, await healthCheck());
      return;
    }
    if (url.pathname === '/api/parcels/viewport' && req.method === 'GET') {
      send(
        res,
        200,
        await queryViewport(
          Number(url.searchParams.get('west')),
          Number(url.searchParams.get('south')),
          Number(url.searchParams.get('east')),
          Number(url.searchParams.get('north'))
        )
      );
      return;
    }
    if (url.pathname === '/api/parcels/identify' && req.method === 'GET') {
      send(
        res,
        200,
        await identifyAt(Number(url.searchParams.get('lng')), Number(url.searchParams.get('lat')))
      );
      return;
    }
    if (url.pathname === '/api/parcels/search' && req.method === 'POST') {
      send(res, 200, await search((await readBody(req)) as SearchCriteria));
      return;
    }
    if (url.pathname === '/api/parcels/select' && req.method === 'POST') {
      const body = (await readBody(req)) as { feature?: Feature };
      if (!body.feature) {
        throw new LandgateError('INVALID', 'A GeoJSON feature is required.');
      }
      send(res, 200, await selectFeature(body.feature));
      return;
    }
    send(res, 404, { error: 'Not found.' });
  } catch (error) {
    if (error instanceof LandgateError) {
      send(res, errorStatus(error), { error: error.message, code: error.code });
      return;
    }
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    send(res, 500, { error: message, code: 'SERVER' });
  }
});

server.listen(port, () => {
  console.log(`Landgate API listening on http://127.0.0.1:${port}`);
});
