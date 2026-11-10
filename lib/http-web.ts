import { LandgateError } from './types';

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export function jsonError(error: unknown): Response {
  if (error instanceof LandgateError) {
    const status =
      error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'INVALID' ||
            error.code === 'INVALID_LOT' ||
            error.code === 'INVALID_PLAN' ||
            error.code === 'UNSUPPORTED_FIELDS'
          ? 400
          : 502;
    return json(status, { error: error.message, code: error.code });
  }
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  return json(500, { error: message, code: 'SERVER' });
}

export function queryParam(request: Request, key: string): string {
  return new URL(request.url).searchParams.get(key)?.trim() ?? '';
}

type NodeLikeRequest = {
  url?: string;
  method?: string;
  headers?: { [key: string]: string | string[] | undefined };
  body?: unknown;
};

type NodeLikeResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { send: (body: string) => void; json: (body: unknown) => void };
};

export function toWebRequest(req: Request | NodeLikeRequest): Request {
  if (typeof Request !== 'undefined' && req instanceof Request) {
    return req;
  }
  const nodeReq = req as NodeLikeRequest;
  const path = nodeReq.url || '/';
  const url = path.startsWith('http') ? path : `https://vercel.internal${path}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(nodeReq.headers ?? {})) {
    if (typeof value === 'string') {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
    }
  }
  const init: RequestInit = { method: nodeReq.method || 'GET', headers };
  if (nodeReq.body && nodeReq.method && nodeReq.method !== 'GET') {
    init.body = typeof nodeReq.body === 'string' ? nodeReq.body : JSON.stringify(nodeReq.body);
  }
  return new Request(url, init);
}

export async function sendWebOrNode(
  response: Response,
  res?: NodeLikeResponse
): Promise<Response | void> {
  if (res && typeof res.status === 'function') {
    const text = await response.text();
    res.setHeader('Content-Type', response.headers.get('Content-Type') || 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(response.status).send(text);
    return;
  }
  return response;
}
